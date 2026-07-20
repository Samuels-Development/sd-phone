import { useState } from 'react';
import { Check, ChevronDown, Paperclip } from 'lucide-react';

import { ActionSheet } from '@/ui/ActionSheet';
import { t } from '@/i18n';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { noteTitle } from '@/apps/notes/data';
import { AttachmentStrip, MemoPickerSheet, NotePickerSheet } from './Attachments';
import type { MailAccount, MailAttachment } from './data';

const MAX_ATTACHMENTS = 5;

interface Props {
    accounts:         MailAccount[];
    defaultAccountId: string;
    initialTo?:       string;
    initialSubject?:  string;
    initialBody?:     string;
    initialAttachments?: MailAttachment[];
    onSend:      (draft: { accountId: string; to: string[]; subject: string; body: string; attachments: MailAttachment[] }) => void;
    onSaveDraft: (draft: { accountId: string; to: string[]; subject: string; body: string; attachments: MailAttachment[] }) => void;
    onCancel:    () => void;
    resumingDraft?: boolean;
}

export function Compose({ accounts, defaultAccountId, initialTo = '', initialSubject = '', initialBody = '', initialAttachments, onSend, onSaveDraft, onCancel, resumingDraft = false }: Props) {
    const [accountId, setAccountId] = useState(() => {
        return accounts.some(a => a.id === defaultAccountId) ? defaultAccountId : accounts[0]?.id;
    });
    const [pickerOpen, setPickerOpen] = useState(false);
    const [to,      setTo]      = useState(initialTo);
    const [subject, setSubject] = useState(initialSubject);
    const [body,    setBody]    = useState(initialBody);
    const [attachments,   setAttachments]   = useState<MailAttachment[]>(() => initialAttachments ?? []);
    const [attachSheet,   setAttachSheet]   = useState(false);
    const [attachPicker,  setAttachPicker]  = useState<'photo' | 'audio' | 'note' | null>(null);
    const [exiting,       setExiting]       = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);

    const account = accounts.find(a => a.id === accountId) ?? accounts[0];
    const canSend = to.trim().length > 0 && subject.trim().length > 0 && !!account;
    // Prefilled content (a resumed draft, a reply quote) doesn't count: only the user's own
    // edits are worth guarding, so an untouched compose cancels straight out.
    const dirty = to !== initialTo || subject !== initialSubject || body !== initialBody
        || JSON.stringify(attachments) !== JSON.stringify(initialAttachments ?? []);

    function addAttachments(added: MailAttachment[]) {
        setAttachments(prev => [...prev, ...added].slice(0, MAX_ATTACHMENTS));
    }

    function slideOut(after: () => void) {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(after, 260);
    }

    function requestCancel() {
        if (exiting || confirmCancel) return;
        if (dirty) setConfirmCancel(true);
        else slideOut(onCancel);
    }

    function saveDraftAndClose() {
        if (!account) { slideOut(onCancel); return; }
        const recipients = to.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
        slideOut(() => onSaveDraft({ accountId: account.id, to: recipients, subject: subject.trim(), body, attachments }));
    }

    function commit() {
        if (!canSend || !account || exiting) return;
        const recipients = to.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
        onSend({ accountId: account.id, to: recipients, subject: subject.trim(), body, attachments });
    }

    return (
        <div className="absolute inset-0 z-40">
            <div
                onClick={requestCancel}
                className="absolute inset-0 bg-black/40"
                style={{ animation: exiting ? 'ios-sheet-backdrop-out 0.26s ease forwards' : 'ios-sheet-backdrop-in 0.3s ease' }}
            />

            <div
                className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[14px] bg-[#d4d4d4] text-black dark:bg-base dark:text-white"
                style={{
                    top: 50,
                    animation: exiting
                        ? 'ios-sheet-down 0.26s cubic-bezier(0.32,0,0.68,1) forwards'
                        : 'ios-sheet-up 0.34s cubic-bezier(0.32,0.72,0,1)',
                    willChange: 'transform',
                    boxShadow: '0 -10px 30px rgba(0,0,0,0.3)',
                }}
            >
                <button
                    type="button"
                    onClick={requestCancel}
                    aria-label={t('mail.close', 'Close')}
                    className="absolute left-1/2 top-0 z-10 flex h-8 w-32 -translate-x-1/2 items-start justify-center pt-2 active:opacity-60"
                >
                    <span className="h-[5px] w-9 rounded-full bg-black/25 dark:bg-white/30" />
                </button>

                <div className="relative mt-3 flex h-[44px] shrink-0 items-center px-4">
                    <button type="button" onClick={requestCancel} className="text-[17px] text-ios-blue active:opacity-60">
                        {t('mail.cancel', 'Cancel')}
                    </button>
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="text-[17px] font-semibold">{t('mail.newMessage', 'New Message')}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setAttachSheet(true)}
                        disabled={attachments.length >= MAX_ATTACHMENTS}
                        aria-label={t('mail.addAttachment', 'Add attachment')}
                        className="ml-auto mr-3 text-ios-blue active:opacity-60 disabled:opacity-30"
                    >
                        <Paperclip className="h-[21px] w-[21px]" strokeWidth={2.1} />
                    </button>
                    <button
                        type="button"
                        onClick={commit}
                        disabled={!canSend}
                        className="rounded-full bg-ios-blue px-[18px] py-[7px] text-[16px] font-semibold text-white active:opacity-60 disabled:opacity-30"
                    >
                        {t('mail.send', 'Send')}
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 pt-1">
                    <div className="shrink-0 overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface">
                        <Row label={t('mail.fromLabel', 'From:')}>
                            <button
                                type="button"
                                onClick={() => accounts.length > 1 && setPickerOpen(v => !v)}
                                disabled={accounts.length <= 1}
                                className="flex flex-1 items-center gap-1 text-left active:opacity-60 disabled:active:opacity-100"
                            >
                                <span className="truncate text-[18px]">{account?.email ?? ''}</span>
                                {accounts.length > 1 && (
                                    <ChevronDown className="h-[16px] w-[16px] shrink-0 text-ios-gray" strokeWidth={2.5} />
                                )}
                            </button>
                        </Row>
                        <Divider />
                        <Row label={t('mail.toLabel', 'To:')}>
                            <input
                                type="text"
                                value={to}
                                onChange={e => setTo(e.target.value)}
                                className="flex-1 bg-transparent text-[18px] outline-none placeholder:text-ios-gray"
                            />
                        </Row>
                        <Divider />
                        <Row label={t('mail.subjectLabel', 'Subject:')}>
                            <input
                                type="text"
                                value={subject}
                                onChange={e => setSubject(e.target.value)}
                                className="flex-1 bg-transparent text-[18px] font-semibold outline-none placeholder:text-ios-gray"
                            />
                        </Row>
                    </div>

                    {pickerOpen && (
                        <div className="mt-2 shrink-0 overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface">
                            {accounts.map((a, i) => (
                                <div key={a.id}>
                                    <button
                                        type="button"
                                        onClick={() => { setAccountId(a.id); setPickerOpen(false); }}
                                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-black/5 dark:active:bg-white/5"
                                    >
                                        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                                            {a.id === account?.id && (
                                                <Check className="h-[18px] w-[18px] text-ios-blue" strokeWidth={3} />
                                            )}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-[16px]">{a.name}</div>
                                            <div className="truncate text-[14px] text-ios-gray">{a.email}</div>
                                        </div>
                                    </button>
                                    {i < accounts.length - 1 && <Divider inset={44} />}
                                </div>
                            ))}
                        </div>
                    )}

                    <AttachmentStrip
                        attachments={attachments}
                        max={MAX_ATTACHMENTS}
                        onRemove={i => setAttachments(prev => prev.filter((_, j) => j !== i))}
                    />

                    <div className="mt-3 flex min-h-0 flex-1 overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface">
                        <textarea
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3.5 text-[18px] leading-relaxed outline-none placeholder:text-ios-gray no-scrollbar"
                        />
                    </div>
                </div>
            </div>

            {attachSheet && (
                <ActionSheet
                    actions={[
                        { label: t('mail.attachPhoto', 'Photo'), onClick: () => setAttachPicker('photo') },
                        { label: t('mail.attachMemo', 'Voice Memo'), onClick: () => setAttachPicker('audio') },
                        { label: t('mail.attachNote', 'Note'), onClick: () => setAttachPicker('note') },
                    ]}
                    cancelLabel={t('mail.cancel', 'Cancel')}
                    onClose={() => setAttachSheet(false)}
                />
            )}

            {attachPicker === 'photo' && (
                <MediaPickerSheet
                    multiple
                    max={MAX_ATTACHMENTS - attachments.length}
                    filter={p => !p.video && !attachments.some(a => a.kind === 'photo' && a.url === p.url)}
                    onSelectMany={photos => {
                        addAttachments(photos.map(p => ({ kind: 'photo' as const, url: p.url })));
                        setAttachPicker(null);
                    }}
                    onClose={() => setAttachPicker(null)}
                />
            )}

            {attachPicker === 'audio' && (
                <MemoPickerSheet
                    max={MAX_ATTACHMENTS - attachments.length}
                    excludeUrls={new Set(attachments.filter(a => a.kind === 'audio').map(a => a.url))}
                    onPickMany={memos => {
                        addAttachments(memos.map(m => ({ kind: 'audio' as const, url: m.url, name: m.name, duration: m.duration })));
                        setAttachPicker(null);
                    }}
                    onClose={() => setAttachPicker(null)}
                />
            )}

            {attachPicker === 'note' && (
                <NotePickerSheet
                    max={MAX_ATTACHMENTS - attachments.length}
                    onPickMany={notes => {
                        addAttachments(notes.map(n => ({ kind: 'note' as const, title: noteTitle(n), body: n.body })));
                        setAttachPicker(null);
                    }}
                    onClose={() => setAttachPicker(null)}
                />
            )}

            {confirmCancel && (
                <ActionSheet
                    actions={resumingDraft ? [
                        { label: t('mail.discardChanges', 'Discard Changes'), destructive: true, onClick: () => slideOut(onCancel) },
                        { label: t('mail.saveChanges', 'Save Changes'), onClick: saveDraftAndClose },
                    ] : [
                        { label: t('mail.deleteDraft', 'Delete Draft'), destructive: true, onClick: () => slideOut(onCancel) },
                        { label: t('mail.saveDraft', 'Save Draft'), onClick: saveDraftAndClose },
                    ]}
                    onClose={() => setConfirmCancel(false)}
                />
            )}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-3 px-4 py-[15px]">
            <span className="shrink-0 text-[18px] text-ios-gray">{label}</span>
            {children}
        </div>
    );
}

function Divider({ inset = 16 }: { inset?: number }) {
    return <div className="pointer-events-none bg-black/[0.12] dark:bg-white/10" style={{ marginLeft: inset, height: '0.5px' }} />;
}
