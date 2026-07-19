import { useEffect, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Eye, EyeOff, KeyRound } from 'lucide-react';

import { copyToClipboard } from '@/lib/clipboard';
import { formatMediumDate } from '@/lib/time';
import { useSessionState } from '@/hooks/useSessionState';
import { useDidEnter } from '@/hooks/useDidEnter';
import { AlertDialog } from '@/ui/AlertDialog';
import { AppIconSVG } from '@/shell/AppIconSVG';
import { EmptyState } from '@/ui/EmptyState';
import { SearchBar } from '@/ui/SearchBar';
import { accountsDeletePassword, accountsListPasswords, type VaultEntry } from '@/core/accountsApi';
import { SlideOver } from '@/ui/SlideOver';
import { t } from '@/i18n';

const APP_LABELS: Record<string, string> = {
    photogram: 'Photogram', cherry: 'Cherry', vibez: 'Vibez', birdy: 'Birdy', mail: 'Mail',
};
const labelFor = (app: string) => APP_LABELS[app] ?? app.charAt(0).toUpperCase() + app.slice(1);

export function Passwords({ onClose }: { onClose: () => void }) {
    const [entries, setEntries] = useState<VaultEntry[]>([]);
    const [loaded,  setLoaded]  = useState(false);
    const [openId,  setOpenId]  = useSessionState<number | null>('passwords:openId', null);
    const [query,   setQuery]   = useSessionState('passwords:query', '');

    useEffect(() => { void accountsListPasswords().then(e => { setEntries(e); setLoaded(true); }); }, []);

    const open = openId != null ? entries.find(e => e.id === openId) ?? null : null;
    const animateNav = useDidEnter(loaded);

    const q = query.trim().toLowerCase();
    const shown = !q ? entries : entries.filter(e =>
        labelFor(e.app).toLowerCase().includes(q)
        || e.username.toLowerCase().includes(q)
        || (e.email ?? '').toLowerCase().includes(q));

    async function remove(id: number) {
        setEntries(prev => prev.filter(e => e.id !== id));
        setOpenId(null);
        await accountsDeletePassword(id);
    }

    return (
        <div className="absolute inset-0 z-10 overflow-hidden bg-[#d4d4d4] font-sf text-black dark:bg-base dark:text-white">
            <div className="flex h-full flex-col">
                <div className="h-[54px] shrink-0" aria-hidden />

                <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10">
                    <h1 className="pt-3 text-[32px] font-extrabold tracking-tight">{t('passwords.title', 'Passwords')}</h1>

                    <SearchBar value={query} onChange={setQuery} className="mt-3" />

                    {loaded && entries.length === 0 ? (
                        <EmptyState icon={KeyRound} title={t('passwords.emptyTitle', 'No Saved Passwords')}
                            subtitle={t('passwords.emptySubtitle', 'When you create an account in an app, you can choose to save its login details here.')} />
                    ) : (
                        <div className="mt-4 overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                            {shown.map((e, i) => (
                                <button
                                    key={e.id}
                                    type="button"
                                    onClick={() => setOpenId(e.id)}
                                    className={`flex w-full items-center gap-4 px-4 py-[18px] text-left active:bg-black/5 dark:active:bg-white/5 ${i === shown.length - 1 ? '' : 'border-b-[0.5px] border-black/10 dark:border-white/10'}`}
                                >
                                    <span className="h-[56px] w-[56px] shrink-0 overflow-hidden rounded-[13px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full" style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.14)' }}>
                                        <AppIconSVG icon={e.app} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[20px] font-semibold">{labelFor(e.app)}</span>
                                        <span className="block truncate text-[17px] text-ios-gray">{e.username}</span>
                                    </span>
                                    <ChevronRight className="h-5 w-5 shrink-0 text-ios-gray" strokeWidth={2.6} />
                                </button>
                            ))}
                            {shown.length === 0 && (
                                <div className="px-4 py-6 text-center text-[14px] text-ios-gray">{t('passwords.noResults', 'No results for "{query}"', { query: query.trim() })}</div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {open && (
                <SlideOver onClose={() => setOpenId(null)} animateIn={animateNav}>
                    {close => <Detail entry={open} onBack={close} onDelete={() => void remove(open.id)} />}
                </SlideOver>
            )}

            <button
                type="button"
                onClick={onClose}
                aria-label={t('passwords.closeAria', 'Close Passwords')}
                className="absolute inset-x-0 bottom-0 z-50 h-7 cursor-default"
            />
        </div>
    );
}

function Detail({ entry, onBack, onDelete }: { entry: VaultEntry; onBack: () => void; onDelete: () => void }) {
    const [reveal,        setReveal]        = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    return (
        <div className="flex h-full flex-col bg-[#d4d4d4] text-black dark:bg-base dark:text-white">
            <div className="h-[54px] shrink-0" aria-hidden />
            <header className="flex items-center px-3 py-2">
                <button type="button" onClick={onBack} className="flex items-center text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-[28px] w-[28px]" strokeWidth={2.4} />
                    <span className="-ml-0.5 text-[18px]">{t('passwords.title', 'Passwords')}</span>
                </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10">
                <div className="mx-auto h-[84px] w-[84px] overflow-hidden rounded-[19px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full" style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.16)' }}>
                    <AppIconSVG icon={entry.app} />
                </div>
                <div className="mt-3.5 text-center text-[24px] font-bold">{labelFor(entry.app)}</div>
                <div className="mt-1 text-center text-[19px] font-medium text-ios-gray">{entry.username}</div>

                <div className="mt-5 overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                    {entry.app !== 'mail' && <Row label={t('passwords.usernameLabel', 'Username')} value={entry.username} />}
                    <div className="flex items-center border-b-[0.5px] border-black/10 px-4 py-3.5 dark:border-white/10">
                        <div className="min-w-0 flex-1">
                            <div className="text-[14px] text-black/80 dark:text-white/80">{t('passwords.passwordLabel', 'Password')}</div>
                            <div className={`truncate pt-0.5 text-[18px] ${reveal ? 'font-mono' : 'tracking-[0.2em]'}`}>
                                {reveal ? entry.password : '•'.repeat(Math.min(entry.password.length, 12))}
                            </div>
                        </div>
                        <button type="button" onClick={() => setReveal(r => !r)} aria-label={reveal ? t('passwords.hidePassword', 'Hide password') : t('passwords.showPassword', 'Show password')} className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/5 active:opacity-70 dark:bg-white/10">
                            {reveal ? <EyeOff className="h-[18px] w-[18px] text-black/55 dark:text-white/55" strokeWidth={2.1} /> : <Eye className="h-[18px] w-[18px] text-black/55 dark:text-white/55" strokeWidth={2.1} />}
                        </button>
                        <CopyButton value={entry.password} label={t('passwords.passwordLower', 'password')} />
                    </div>
                    {entry.email && <Row label={t('passwords.emailLabel', 'Email')} value={entry.email} />}
                    {entry.phone && <Row label={t('passwords.phoneLabel', 'Phone')} value={entry.phone} />}
                    {entry.created && <Row label={t('passwords.savedLabel', 'Saved')} value={formatMediumDate(entry.created)} last copyable={false} />}
                </div>

                <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="mt-5 w-full rounded-[10px] bg-[#e5e5e5] py-4 text-[18px] font-semibold text-ios-red active:opacity-70 dark:bg-surface"
                >
                    {t('passwords.removeButton', 'Remove Saved Account')}
                </button>
            </div>

            {confirmDelete && (
                <AlertDialog
                    title={t('passwords.removeConfirmTitle', 'Remove Saved Account?')}
                    message={t('passwords.removeConfirmMessage', 'Your saved {app} login will be removed from this phone. The account itself is not deleted.', { app: labelFor(entry.app) })}
                    confirmLabel={t('passwords.remove', 'Remove')} cancelLabel={t('passwords.cancel', 'Cancel')} destructive
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={() => { setConfirmDelete(false); onDelete(); }}
                />
            )}
        </div>
    );
}

function CopyButton({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            type="button"
            aria-label={copied ? t('passwords.copied', 'Copied') : t('passwords.copyLabel', 'Copy {label}', { label })}
            onClick={() => {
                copyToClipboard(value);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
            }}
            className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ios-blue active:opacity-50"
        >
            {copied
                ? <Check className="h-[20px] w-[20px]" strokeWidth={2.5} />
                : <Copy className="h-[18px] w-[18px]" strokeWidth={2} />}
        </button>
    );
}

function Row({ label, value, last, copyable = true }: { label: string; value: string; last?: boolean; copyable?: boolean }) {
    return (
        <div className={`flex items-center px-4 py-3.5 ${last ? '' : 'border-b-[0.5px] border-black/10 dark:border-white/10'}`}>
            <div className="min-w-0 flex-1">
                <div className="text-[14px] text-black/80 dark:text-white/80">{label}</div>
                <div className="truncate pt-0.5 text-[18px]">{value}</div>
            </div>
            {copyable && <CopyButton value={value} label={label.toLowerCase()} />}
        </div>
    );
}

