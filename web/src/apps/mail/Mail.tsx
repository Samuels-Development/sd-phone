import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

import { t } from '@/i18n';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { takeMailTarget } from '@/shell/deeplink';
import { AppAuth } from '@/shared/AppAuth';
import { ChangePasswordPage } from '@/shared/ChangePasswordPage';
import { MAIL_DOMAIN, accountsConfirmReset, accountsMyNumber, accountsRequestReset, accountsSavePassword, accountsSavedLogin, accountsSuggestCode } from '@/core/accountsApi';
import { isAuthed, signIn as unlockMail, signOut as lockMail } from '@/stores/authStore';
import { Compose } from './Compose';
import {
    getFolderLabels, deleteAccount, discardDraft, inFolder, listMail, loadActiveAccountId, loadFolderOrder, markRead,
    markManyRead, moveToBin, moveTo, saveActiveAccountId, saveDraft, saveFolderOrder, sendMail, signIn as mailSignIn,
    signOut, signUp as mailSignUp, toggleFlag,
} from './data';
import type { Folder, MailAccount, MailAttachment, MailMessage } from './data';
import { MailDetail } from './MailDetail';
import { MailList } from './MailList';
import { MailboxList } from './MailboxList';

type Navigation =
    | { stage: 'mailboxes' }
    | { stage: 'list'; folder: Folder; accountId?: string; accountName?: string }
    | { stage: 'detail'; folder: Folder; msgId: string; accountId?: string; accountName?: string };

export function Mail({ onClose }: { onClose: () => void }) {
    const [locked,          setLocked]          = useState(() => !isAuthed('mail'));
    const [authChecked,     setAuthChecked]     = useState(false);
    const [justAuthed,      setJustAuthed]      = useState(false);
    const [myNumber,        setMyNumber]        = useState<string | null>(null);
    const [savedLogin,      setSavedLogin]      = useState<{ username: string; password: string } | null>(null);
    const [accounts,        setAccounts]        = useState<MailAccount[]>([]);
    const [messages,        setMessages]        = useState<MailMessage[]>([]);
    const [folderOrder,     setFolderOrder]     = useState<Folder[]>(() => loadFolderOrder());
    const [activeAccountId, setActiveAccountId] = useState<string | null>(() => loadActiveAccountId());
    const [nav,             setNav]             = useSessionState<Navigation>('mail:nav', { stage: 'mailboxes' });
    const [composeFor,      setComposeFor]      = useSessionState<{ accountId?: string; to?: string; subject?: string; body?: string; draftId?: string; attachments?: MailAttachment[] } | null>('mail:composeFor', null);

    const refresh = useCallback(async () => {
        const next = await listMail();
        setAccounts(next.accounts);
        setMessages(next.messages);
        setAuthChecked(true);
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);
    useEffect(() => { void accountsMyNumber().then(setMyNumber); }, []);

    useLayoutEffect(() => {
        const t = takeMailTarget();
        if (t?.to) setComposeFor({ to: t.to });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => { void accountsSavedLogin('mail').then(setSavedLogin); }, []);

    useEffect(() => {
        if (accounts.length === 0) {
            if (activeAccountId !== null) {
                setActiveAccountId(null);
                saveActiveAccountId(null);
            }
            return;
        }
        const stillThere = activeAccountId && accounts.some(a => a.id === activeAccountId);
        if (!stillThere) {
            setActiveAccountId(accounts[0].id);
            saveActiveAccountId(accounts[0].id);
        }
    }, [accounts, activeAccountId]);

    function selectAccount(id: string) {
        setActiveAccountId(id);
        saveActiveAccountId(id);
    }

    const activeAccount = accounts.find(a => a.id === activeAccountId) ?? null;

    useNuiEvent('sd-phone:mail:received', useCallback((data) => {
        const msg = data as MailMessage | null;
        if (!msg || !msg.id) return;
        setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [msg, ...prev];
        });
    }, []));

    async function handleMarkRead(m: MailMessage) {
        if (m.read) return;
        setMessages(prev => prev.map(x => x.id === m.id ? { ...x, read: true } : x));
        await markRead(m.accountId, m.id);
    }

    async function handleToggleFlag(id: string) {
        const target = messages.find(m => m.id === id);
        if (!target) return;
        setMessages(prev => prev.map(x => x.id === id ? { ...x, flagged: !x.flagged } : x));
        await toggleFlag(target.accountId, id);
    }

    async function handleMoveToBin(id: string) {
        const target = messages.find(m => m.id === id);
        if (!target) return;
        setMessages(prev => prev.map(x => x.id === id ? { ...x, folder: 'bin' as const } : x));
        if (nav.stage === 'detail') {
            setNav({ stage: 'list', folder: nav.folder, accountId: nav.accountId, accountName: nav.accountName });
        }
        await moveToBin(target.accountId, id);
    }

    function handleMarkReadMany(ids: string[]) {
        const targets = messages.filter(m => ids.includes(m.id) && !m.read);
        if (targets.length === 0) return;
        setMessages(prev => prev.map(m => ids.includes(m.id) ? { ...m, read: true } : m));
        // One bulk write per account: firing a single markRead per message races N read-modify-
        // writes over the same JSON column, losing updates so the badge never clears.
        const byAccount = new Map<string, string[]>();
        for (const m of targets) {
            const list = byAccount.get(m.accountId);
            if (list) list.push(m.id);
            else byAccount.set(m.accountId, [m.id]);
        }
        for (const [accountId, messageIds] of byAccount) void markManyRead(accountId, messageIds);
    }

    // Batch delete from the list pages: bin messages are erased for good (the server
    // hard-deletes an already-binned message), everything else moves to the bin.
    function handleDeleteMany(ids: string[]) {
        const targets = messages.filter(m => ids.includes(m.id));
        setMessages(prev => prev
            .filter(m => !(ids.includes(m.id) && m.folder === 'bin'))
            .map(m => ids.includes(m.id) ? { ...m, folder: 'bin' as const, flagged: false } : m));
        for (const m of targets) void moveToBin(m.accountId, m.id);
    }

    async function handleMove(id: string, folder: Folder) {
        const target = messages.find(m => m.id === id);
        if (!target || target.folder === folder) return;
        setMessages(prev => prev.map(x => x.id === id
            ? { ...x, folder, ...(folder === 'bin' ? { flagged: false } : {}) }
            : x));
        if (nav.stage === 'detail') {
            setNav({ stage: 'list', folder: nav.folder, accountId: nav.accountId, accountName: nav.accountName });
        }
        await moveTo(target.accountId, id, folder);
    }

    async function handleSendMessage(draft: { accountId: string; to: string[]; subject: string; body: string; attachments: MailAttachment[] }) {
        const account = accounts.find(a => a.id === draft.accountId) ?? accounts[0];
        if (!account) return;
        const result = await sendMail({
            fromEmail:   account.email,
            to:          draft.to,
            subject:     draft.subject,
            body:        draft.body,
            attachments: draft.attachments,
        });
        if (typeof result === 'string') {
            console.warn('[sd-phone:mail] send failed:', result);
            return;
        }
        const draftId = composeFor?.draftId;
        if (draftId) {
            setMessages(prev => [result, ...prev.filter(m => m.id !== draftId)]);
            void discardDraft(account.email, draftId);
        } else {
            setMessages(prev => [result, ...prev]);
        }
        setComposeFor(null);
    }

    function handleSaveDraft(draft: { accountId: string; to: string[]; subject: string; body: string; attachments: MailAttachment[] }) {
        const account = accounts.find(a => a.id === draft.accountId) ?? accounts[0];
        const draftId = composeFor?.draftId;
        setComposeFor(null);
        if (!account) return;
        void saveDraft({
            fromEmail:   account.email,
            to:          draft.to,
            subject:     draft.subject,
            body:        draft.body,
            attachments: draft.attachments,
        }).then(result => {
            if (typeof result === 'string') return;
            // Re-saving an edited draft replaces the stale copy.
            if (draftId) {
                setMessages(prev => [result, ...prev.filter(m => m.id !== draftId)]);
                void discardDraft(account.email, draftId);
            } else {
                setMessages(prev => [result, ...prev]);
            }
        });
    }

    const [pwOpen, setPwOpen] = useState(false);

    function handleAccountAdded(account: MailAccount) {
        setAccounts(prev => prev.some(a => a.email === account.email) ? prev : [...prev, account]);
        selectAccount(account.id);
        void refresh();
    }

    async function handleSignOut(id: string) {
        const target = accounts.find(a => a.id === id);
        if (!target) return;
        setAccounts(prev => prev.filter(a => a.id !== id));
        setMessages(prev => prev.filter(m => m.accountId !== id));
        if ((nav.stage === 'list' || nav.stage === 'detail') && nav.accountId === id) {
            setNav({ stage: 'mailboxes' });
        }
        if (composeFor && composeFor.accountId === id) setComposeFor(null);
        await signOut(target.email);
    }

    async function handleDeleteAccount(id: string) {
        const target = accounts.find(a => a.id === id);
        if (!target) return;
        setAccounts(prev => prev.filter(a => a.id !== id));
        setMessages(prev => prev.filter(m => m.accountId !== id));
        if ((nav.stage === 'list' || nav.stage === 'detail') && nav.accountId === id) {
            setNav({ stage: 'mailboxes' });
        }
        if (composeFor && composeFor.accountId === id) setComposeFor(null);
        await deleteAccount(target.email);
    }

    function handleReorderFolders(next: Folder[]) {
        setFolderOrder(next);
        saveFolderOrder(next);
    }

    const currentMsg = nav.stage === 'detail' ? messages.find(m => m.id === nav.msgId) : null;

    // Prev/next within the open folder, same newest-first order the list shows.
    const detailSiblings = nav.stage === 'detail'
        ? [...inFolder(messages, nav.folder, nav.accountId)].sort((a, b) => b.sentAt.localeCompare(a.sentAt))
        : [];
    const detailIdx = nav.stage === 'detail' ? detailSiblings.findIndex(m => m.id === nav.msgId) : -1;

    function openSibling(id: string) {
        const target = messages.find(m => m.id === id);
        if (target) void handleMarkRead(target);
        if (nav.stage === 'detail') setNav({ ...nav, msgId: id });
    }

    const defaultComposeAccount = composeFor?.accountId
        ?? (nav.stage === 'list' || nav.stage === 'detail' ? nav.accountId : undefined)
        ?? accounts[0]?.id;

    if (locked || (authChecked && accounts.length === 0)) {
        return (
            <AppAuth
                appName={t('mail.appName', 'Mail')}
                tagline={t('mail.tagline', 'All your email in one place.')}
                icon="mail"
                theme={{ accent: '#0A84FF', welcomeBg: '#f2f2f7', welcomeText: 'dark' }}
                myNumber={myNumber}
                savedLogin={savedLogin}
                fields={[
                    { key: 'email',    label: t('mail.fieldEmail', 'Email'), suffix: `@${MAIL_DOMAIN}` },
                    { key: 'name',     label: t('mail.fieldName', 'Name'), createOnly: true },
                    { key: 'password', label: t('mail.password', 'Password'), type: 'password' },
                    { key: 'phone',    label: t('mail.fieldPhone', 'Phone'), type: 'tel', createOnly: true },
                ]}
                onSubmit={async (mode, vals) => {
                    const r = mode === 'create'
                        ? await mailSignUp({ email: vals.email ?? '', password: vals.password ?? '', displayName: vals.name ?? '', phone: vals.phone })
                        : await mailSignIn({ email: vals.email ?? '', password: vals.password ?? '' });
                    return typeof r === 'string' ? { ok: false, message: r } : { ok: true };
                }}
                onAuthed={() => { unlockMail('mail', {}); setLocked(false); setJustAuthed(true); void refresh(); }}
                onRequestReset={(id) => accountsRequestReset('mail', id)}
                onConfirmReset={(id, code, pw) => accountsConfirmReset('mail', id, code, pw)}
                onSuggestCode={(id) => accountsSuggestCode('mail', id)}
                onSaveCredentials={(vals) => accountsSavePassword('mail', {
                    ...vals,
                    username: `${vals.email ?? ''}@${MAIL_DOMAIN}`,
                    email:    `${vals.email ?? ''}@${MAIL_DOMAIN}`,
                })}
            />
        );
    }

    return (
        <div className={`absolute inset-0 z-10 overflow-hidden bg-[#d4d4d4] dark:bg-base ${justAuthed ? 'animate-swipe-in-left' : ''}`}>
            <MailboxList
                accounts={accounts}
                activeAccount={activeAccount}
                messages={messages}
                folderOrder={folderOrder}
                onSelectAccount={selectAccount}
                onOpenFolder={folder => {
                    if (!activeAccount) return;
                    setNav({
                        stage:       'list',
                        folder,
                        accountId:   activeAccount.id,
                        accountName: activeAccount.name,
                    });
                }}
                onCompose={() => setComposeFor({ accountId: activeAccount?.id })}
                onAccountAdded={handleAccountAdded}
                onSignOut={handleSignOut}
                onReorderFolders={handleReorderFolders}
                onLockApp={() => { lockMail('mail'); setLocked(true); }}
                onDeleteAccount={(id) => void handleDeleteAccount(id)}
                onChangePassword={() => setPwOpen(true)}
            />

            {(nav.stage === 'list' || nav.stage === 'detail') && (
                <MailList
                    folder={nav.folder}
                    accountId={nav.accountId}
                    accountName={nav.accountName}
                    messages={messages}
                    onBack={() => setNav({ stage: 'mailboxes' })}
                    onOpen={id => {
                        const target = messages.find(m => m.id === id);
                        if (target) void handleMarkRead(target);
                        // Drafts reopen in the composer for editing instead of the read-only viewer.
                        if (target?.folder === 'drafts') {
                            setComposeFor({ accountId: target.accountId, to: target.to.join(', '), subject: target.subject, body: target.body, draftId: target.id, attachments: target.attachments });
                            return;
                        }
                        setNav({ stage: 'detail', folder: nav.folder, msgId: id, accountId: nav.accountId, accountName: nav.accountName });
                    }}
                    onCompose={() => setComposeFor({ accountId: nav.accountId })}
                    onDeleteMany={handleDeleteMany}
                    onMarkReadMany={handleMarkReadMany}
                />
            )}

            {nav.stage === 'detail' && currentMsg && (
                <MailDetail
                    msg={currentMsg}
                    backLabel={nav.accountName ?? getFolderLabels()[nav.folder] ?? t('mail.back', 'Back')}
                    prevId={detailIdx > 0 ? detailSiblings[detailIdx - 1].id : null}
                    nextId={detailIdx >= 0 && detailIdx < detailSiblings.length - 1 ? detailSiblings[detailIdx + 1].id : null}
                    onOpenSibling={openSibling}
                    onBack={() => setNav({ stage: 'list', folder: nav.folder, accountId: nav.accountId, accountName: nav.accountName })}
                    onToggleFlag={(id) => void handleToggleFlag(id)}
                    onDelete={(id) => void handleMoveToBin(id)}
                    onMove={(id, folder) => void handleMove(id, folder)}
                    onReply={(m) => setComposeFor({
                        accountId: m.accountId,
                        to:        m.from.email,
                        subject:   m.subject.startsWith('Re:') ? m.subject : `Re: ${m.subject}`,
                        body:      `\n\n\n${t('mail.replyQuote', 'On {date}, {name} <{email}> wrote:', { date: new Date(m.sentAt).toLocaleString(), name: m.from.name, email: m.from.email })}\n${m.body.split('\n').map(l => `> ${l}`).join('\n')}`,
                    })}
                />
            )}

            {pwOpen && activeAccount && (
                <ChangePasswordPage
                    app="mail"
                    appName={t('mail.appName', 'Mail')}
                    icon="mail"
                    theme={{ accent: '#0A84FF', welcomeBg: '#f2f2f7', welcomeText: 'dark' }}
                    identity={activeAccount.email}
                    onClose={() => setPwOpen(false)}
                />
            )}

            {composeFor && accounts.length > 0 && (
                <Compose
                    accounts={accounts}
                    defaultAccountId={defaultComposeAccount ?? accounts[0].id}
                    initialTo={composeFor.to}
                    initialSubject={composeFor.subject}
                    initialBody={composeFor.body}
                    initialAttachments={composeFor.attachments}
                    onSend={(draft) => void handleSendMessage(draft)}
                    onSaveDraft={handleSaveDraft}
                    onCancel={() => setComposeFor(null)}
                    resumingDraft={!!composeFor.draftId}
                />
            )}

            <button
                type="button"
                onClick={onClose}
                aria-label={t('mail.closeMail', 'Close Mail')}
                className="absolute inset-x-0 bottom-0 z-50 h-7 cursor-default"
            />
        </div>
    );
}
