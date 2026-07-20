import { useMemo, useState } from 'react';
import { ChevronLeft, SquarePen } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useSessionState } from '@/hooks/useSessionState';
import { AlertDialog } from '@/ui/AlertDialog';
import { SearchBar } from '@/ui/SearchBar';
import { getFolders, formatMailTime, inFolder, previewBody } from './data';
import type { Folder, MailMessage } from './data';

interface Props {
    folder:    Folder;
    accountId?:  string;
    accountName?: string;
    messages:  MailMessage[];
    onBack:    () => void;
    onOpen:    (id: string) => void;
    onCompose: () => void;
    onDeleteMany: (ids: string[]) => void;
    onMarkReadMany: (ids: string[]) => void;
}

export function MailList({ folder, accountId, accountName, messages, onBack, onOpen, onCompose, onDeleteMany, onMarkReadMany }: Props) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const [query, setQuery] = useSessionState('mail:listQuery', '');
    const [editing,       setEditing]       = useState(false);
    const [barExiting,    setBarExiting]    = useState(false);
    const [selected,      setSelected]      = useState<Set<string>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState(false);

    const folderLabel = getFolders().find(f => f.id === folder)?.label ?? t('mail.mailbox', 'Mailbox');
    const label = accountName ?? folderLabel;

    const visible = useMemo(() => {
        const list = inFolder(messages, folder, accountId);
        const sorted = [...list].sort((a, b) => b.sentAt.localeCompare(a.sentAt));
        const q = query.trim().toLowerCase();
        if (!q) return sorted;
        return sorted.filter(m =>
            m.subject.toLowerCase().includes(q)
            || m.from.name.toLowerCase().includes(q)
            || previewBody(m.body).toLowerCase().includes(q),
        );
    }, [messages, folder, accountId, query]);

    function leaveEditing() {
        setSelected(new Set());
        setEditing(false);
        setBarExiting(true);
    }

    function toggleEditing() {
        if (editing) { leaveEditing(); return; }
        setSelected(new Set());
        setBarExiting(false);
        setEditing(true);
    }

    function toggleSelect(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function confirmDeleteNow() {
        onDeleteMany([...selected]);
        setConfirmDelete(false);
        leaveEditing();
    }

    // With rows selected the mark button covers the selection; with none it covers the
    // whole visible list (search-filtered when a query is active).
    const markIds     = selected.size > 0 ? visible.filter(m => selected.has(m.id)) : visible;
    const markableIds = markIds.filter(m => !m.read).map(m => m.id);

    function applyMarkRead() {
        if (markableIds.length === 0) return;
        onMarkReadMany(markableIds);
        setSelected(new Set());
    }

    return (
        <div
            className="absolute inset-0 z-20 flex flex-col bg-[#d4d4d4] dark:bg-base text-black dark:text-white"
            style={pageStyle}
        >
            <div className="h-[54px] shrink-0" aria-hidden />

            <div className="flex items-center px-2 pb-0.5">
                <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-0.5 text-ios-blue active:opacity-60"
                >
                    <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.5} />
                    <span className="text-[17px]">{t('mail.mailboxes', 'Mailboxes')}</span>
                </button>
                <button
                    type="button"
                    onClick={toggleEditing}
                    className="ml-auto text-[17px] text-ios-blue active:opacity-60"
                >
                    {editing ? t('mail.done', 'Done') : t('mail.edit', 'Edit')}
                </button>
                <button
                    type="button"
                    onClick={onCompose}
                    disabled={editing}
                    className="ml-4 pr-3 text-ios-blue active:opacity-60 disabled:opacity-30"
                >
                    <SquarePen className="h-[22px] w-[22px]" strokeWidth={2} />
                </button>
            </div>

            <div className="px-5 pb-2 pt-0.5 text-[34px] font-bold tracking-tight">
                {label}
            </div>

            <SearchBar value={query} onChange={setQuery} className="mx-4 mb-3" />

            <div className={`flex-1 overflow-y-auto no-scrollbar px-4 ${editing || barExiting ? 'pb-28' : 'pb-10'}`}>
                {visible.length === 0 ? (
                    <div className="flex items-center justify-center py-16 text-[15px] text-black/40 dark:text-white/40">
                        {t('mail.noMessages', 'No Messages')}
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                        {visible.map((m, i) => (
                            <div key={m.id}>
                                <MailRow
                                    msg={m}
                                    editing={editing}
                                    selected={selected.has(m.id)}
                                    onOpen={onOpen}
                                    onToggleSelect={toggleSelect}
                                />
                                {i < visible.length - 1 && (
                                    <div
                                        className="pointer-events-none bg-black/[0.14] dark:bg-white/[0.12]"
                                        style={{ height: '0.5px' }}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {(editing || barExiting) && (
                <div
                    onAnimationEnd={e => { if (e.animationName === 'ios-sheet-down') setBarExiting(false); }}
                    className="absolute inset-x-0 bottom-0 z-20 flex items-center border-t border-black/10 bg-[#d4d4d4] px-5 pb-10 pt-5 dark:border-white/10 dark:bg-base"
                    style={{ animation: barExiting
                        ? 'ios-sheet-down 0.26s cubic-bezier(0.32,0,0.68,1) forwards'
                        : 'ios-sheet-up 0.3s cubic-bezier(0.32,0.72,0,1)' }}
                >
                    <button
                        type="button"
                        onClick={applyMarkRead}
                        className={`flex-1 text-left text-[17px] font-medium active:opacity-60 ${
                            markableIds.length > 0 ? 'text-ios-blue' : 'text-black/30 dark:text-white/30'
                        }`}
                    >
                        {selected.size > 0
                            ? t('mail.markRead', 'Mark Read')
                            : t('mail.markAllRead', 'Mark All Read')}
                    </button>
                    <span className="flex-1 whitespace-nowrap text-center text-[16px] text-black/45 dark:text-white/45">
                        {selected.size > 0
                            ? (selected.size === 1
                                ? t('mail.selectedMessage', '1 Message')
                                : t('mail.selectedMessages', '{count} Messages', { count: selected.size }))
                            : t('mail.selectMessages', 'Select Messages')}
                    </span>
                    <button
                        type="button"
                        onClick={() => { if (selected.size > 0) setConfirmDelete(true); }}
                        className={`flex-1 text-right text-[19px] font-semibold active:opacity-60 ${
                            selected.size > 0 ? 'text-ios-red' : 'text-black/30 dark:text-white/30'
                        }`}
                    >
                        {t('common.delete', 'Delete')}
                    </button>
                </div>
            )}

            {confirmDelete && (
                <AlertDialog
                    title={folder === 'bin'
                        ? t('mail.deletePermanentlyTitle', 'Delete Permanently')
                        : (selected.size === 1 ? t('mail.deleteMessageTitle', 'Delete Message') : t('mail.deleteMessagesTitle', 'Delete Messages'))}
                    message={folder === 'bin'
                        ? (selected.size === 1
                            ? t('mail.deletePermanentlyConfirm', "Permanently delete this message? This can't be undone.")
                            : t('mail.deletePermanentlyConfirmMany', "Permanently delete these {count} messages? This can't be undone.", { count: selected.size }))
                        : (selected.size === 1
                            ? t('mail.deleteToBinConfirm', 'Move this message to the Bin?')
                            : t('mail.deleteToBinConfirmMany', 'Move these {count} messages to the Bin?', { count: selected.size }))}
                    confirmLabel={t('common.delete', 'Delete')}
                    cancelLabel={t('mail.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={confirmDeleteNow}
                />
            )}
        </div>
    );
}

function MailRow({ msg, editing, selected, onOpen, onToggleSelect }: {
    msg:            MailMessage;
    editing:        boolean;
    selected:       boolean;
    onOpen:         (id: string) => void;
    onToggleSelect: (id: string) => void;
}) {
    return (
        <button
            type="button"
            onClick={() => (editing ? onToggleSelect(msg.id) : onOpen(msg.id))}
            className="relative flex w-full items-start gap-2.5 px-4 py-3.5 text-left active:bg-black/5 dark:active:bg-white/5"
        >
            <div
                className="flex shrink-0 items-center self-center overflow-hidden"
                style={{
                    width:      editing ? 34 : 0,
                    opacity:    editing ? 1 : 0,
                    transition: 'width 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.3s cubic-bezier(0.32,0.72,0,1)',
                }}
                aria-hidden={!editing}
            >
                <div
                    style={{
                        transform:  editing ? 'translateX(0)' : 'translateX(-16px)',
                        transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
                    }}
                >
                    <div
                        className={`flex h-[24px] w-[24px] items-center justify-center rounded-full border-[1.5px] transition-colors duration-200 ${
                            selected
                                ? 'border-ios-blue bg-ios-blue'
                                : 'border-black/25 bg-transparent dark:border-white/30'
                        }`}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="h-[24px] w-[24px]"
                            fill="none"
                            aria-hidden
                            style={{
                                transform:  selected ? 'scale(1)' : 'scale(0)',
                                transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                            }}
                        >
                            <path d="M6.2 12.5l3.6 3.6L17.8 7.8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                </div>
            </div>
            <span className="mt-[9px] flex h-[11px] w-[11px] shrink-0 items-center justify-center">
                {!msg.read && (
                    <span className="block h-[11px] w-[11px] rounded-full bg-ios-blue" />
                )}
            </span>

            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[19px] font-semibold">{msg.from.name}</span>
                    <span className="shrink-0 text-[14px] text-ios-gray">
                        {formatMailTime(msg.sentAt)}
                    </span>
                </div>
                <div className="mt-0.5 truncate text-[17px]">{msg.subject || t('mail.noSubject', '(No Subject)')}</div>
                <div className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-black/[0.82] dark:text-white/[0.82]">
                    {previewBody(msg.body)}
                </div>
            </div>
        </button>
    );
}
