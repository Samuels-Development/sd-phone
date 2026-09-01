import { useLayoutEffect, useRef, useState } from 'react';
import {
    AlertOctagon, AtSign, BookUser, Check, ChevronRight, FileText, Flag, GripVertical, Inbox, LogOut,
    Plus, Send, SquarePen, Trash2,
} from 'lucide-react';
import type { ComponentType } from 'react';

import { AlertDialog } from '@/ui/AlertDialog';
import { ancestorZoom, trackFractionY } from '@/lib/zoom';
import { t } from '@/i18n';
import { getFolderLabels, shortEmail, unreadCount } from './data';
import type { Folder, MailAccount, MailMessage } from './data';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

interface Props {
    accounts:         MailAccount[];
    activeAccount:    MailAccount | null;
    messages:         MailMessage[];
    folderOrder:      Folder[];
    onSelectAccount:  (id: string) => void;
    onOpenFolder:     (f: Folder) => void;
    onCompose:        () => void;
    onAddAccount:     () => void;
    onSignOut:        (id: string) => void;
    onSignOutAll:     () => void;
    onReorderFolders: (next: Folder[]) => void;
    onDeleteAccount:  (id: string) => void;
    onChangePassword: () => void;
    onOpenSavedEmails: () => void;
}

const FOLDER_ICONS: Record<Folder, ComponentType<{ className?: string }>> = {
    inbox:   Inbox,
    flagged: Flag,
    drafts:  FileText,
    sent:    Send,
    spam:    AlertOctagon,
    bin:     Trash2,
};

export function MailboxList({
    accounts, activeAccount, messages, folderOrder, onSelectAccount, onOpenFolder, onCompose, onAddAccount, onSignOut, onSignOutAll, onReorderFolders, onDeleteAccount, onChangePassword, onOpenSavedEmails,
}: Props) {
    const [editing, setEditing] = useState(false);
    const [confirmOut, setConfirmOut] = useState(false);
    const [confirmOutAll, setConfirmOutAll] = useState(false);
    const [confirmDeleteAcc, setConfirmDeleteAcc] = useState(false);

    const [draggingId, setDraggingId] = useState<Folder | null>(null);
    const [dragOffset, setDragOffset] = useState(0);
    const dragStartY = useRef(0);
    const dragZoom   = useRef(1);
    const rowsRef    = useRef<Map<Folder, HTMLDivElement>>(new Map());
    const prevTops   = useRef<Map<Folder, number>>(new Map());

    // FLIP the rows a reorder displaces: start each moved row at its old offsetTop via an
    // inverse translate, then let the CSS transition carry it to rest. The reflow read
    // replaces the usual double-rAF trigger, which CEF starves in-game.
    useLayoutEffect(() => {
        const tops = new Map<Folder, number>();
        for (const [id, el] of rowsRef.current) tops.set(id, el.offsetTop);
        for (const [id, el] of rowsRef.current) {
            if (id === draggingId) continue;
            const prev = prevTops.current.get(id);
            const now  = tops.get(id);
            if (prev == null || now == null || prev === now) continue;
            el.style.transition = 'none';
            el.style.transform  = `translateY(${prev - now}px)`;
            void el.offsetHeight;
            el.style.transition = 'transform 0.18s ease';
            el.style.transform  = '';
        }
        prevTops.current = tops;
    });

    function onHandlePointerDown(e: React.PointerEvent, id: Folder) {
        if (!editing) return;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragZoom.current = ancestorZoom(e.currentTarget as HTMLElement);
        setDraggingId(id);
        setDragOffset(0);
        dragStartY.current = e.clientY;
    }

    // clientY deltas are screen px; divide by the phone's CSS zoom so the row tracks the
    // pointer 1:1. Row targeting goes through elementFromPoint (zoom-correct hit-testing);
    // the dragged row is pointer-events:none while lifted so the hit lands on the row under it.
    function onHandlePointerMove(e: React.PointerEvent) {
        if (!draggingId) return;
        setDragOffset((e.clientY - dragStartY.current) / dragZoom.current);

        const row  = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-folder]') as HTMLElement | null;
        const over = row?.getAttribute('data-folder') as Folder | null;
        if (!row || !over || over === draggingId) return;
        const from = folderOrder.indexOf(draggingId);
        const to   = folderOrder.indexOf(over);
        if (from < 0 || to < 0) return;

        // Commit only past the hovered row's midpoint: that is the moment the lifted row
        // fully overlaps its new slot, so the reorder lands without a visible snap.
        const frac = trackFractionY(row, e.clientY);
        if (frac == null || (to > from ? frac < 0.5 : frac > 0.5)) return;

        const next = [...folderOrder];
        next.splice(from, 1);
        next.splice(to, 0, draggingId);
        onReorderFolders(next);
        // Shift the drag origin by the slots traversed (layout px -> screen px) instead of
        // resetting it, keeping the row glued to the finger through the swap.
        dragStartY.current += (to - from) * row.offsetHeight * dragZoom.current;
        setDragOffset((e.clientY - dragStartY.current) / dragZoom.current);
    }

    function onHandlePointerUp() {
        setDraggingId(null);
        setDragOffset(0);
    }

    const composeDisabled = !activeAccount;

    return (
        <div className="absolute inset-0 flex flex-col bg-base text-black dark:text-white">
            <StatusBarSpacer />

            <div className="flex items-center justify-between px-5 pb-0.5">
                <button
                    type="button"
                    onClick={() => setEditing(e => !e)}
                    disabled={!activeAccount}
                    className="text-[17px] text-ios-blue active:opacity-60 disabled:opacity-30"
                >
                    {editing ? t('mail.done', 'Done') : t('mail.edit', 'Edit')}
                </button>
                <button
                    type="button"
                    onClick={onCompose}
                    disabled={composeDisabled}
                    className="text-ios-blue active:opacity-60 disabled:opacity-30"
                >
                    <SquarePen className="h-[22px] w-[22px]" strokeWidth={2} />
                </button>
            </div>

            <div className="px-5 pb-3 pt-0.5">
                {activeAccount ? (
                    <>
                        <div className="truncate text-[34px] font-bold tracking-tight leading-tight">
                            {activeAccount.name}
                        </div>
                        <div className="mt-0.5 truncate text-[15px] text-ios-blue">{activeAccount.email}</div>
                    </>
                ) : (
                    <>
                        <div className="text-[34px] font-bold tracking-tight">{t('mail.mailboxes', 'Mailboxes')}</div>
                        <div className="mt-0.5 text-[15px] text-ios-gray">
                            {t('mail.signInPrompt', 'Sign in to a mail account to get started.')}
                        </div>
                    </>
                )}
            </div>

            <div
                className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10"
                onPointerMove={onHandlePointerMove}
                onPointerUp={onHandlePointerUp}
                onPointerCancel={onHandlePointerUp}
            >
                {activeAccount && (
                    <div className="overflow-hidden rounded-[10px] bg-surface">
                        {folderOrder.map((id, i) => {
                            const Icon  = FOLDER_ICONS[id];
                            const count = unreadCount(messages, id, activeAccount.id);
                            const label = getFolderLabels()[id];
                            const isDragging = draggingId === id;
                            return (
                                <div
                                    key={id}
                                    data-folder={id}
                                    ref={el => {
                                        if (el) rowsRef.current.set(id, el);
                                        else    rowsRef.current.delete(id);
                                    }}
                                    style={{
                                        transform: isDragging ? `translateY(${dragOffset}px)` : undefined,
                                        zIndex:    isDragging ? 5 : undefined,
                                        position:  isDragging ? 'relative' : undefined,
                                        boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.25)' : undefined,
                                        transition: isDragging ? 'none' : 'transform 0.18s ease',
                                        pointerEvents: isDragging ? 'none' : undefined,
                                    }}
                                >
                                    <div className="relative flex w-full items-center gap-4 px-4 py-[15px]">
                                        <Icon className="h-[25px] w-[25px] shrink-0 text-ios-blue" />
                                        <button
                                            type="button"
                                            onClick={() => !editing && onOpenFolder(id)}
                                            disabled={editing}
                                            className="flex flex-1 items-center text-left active:opacity-60 disabled:active:opacity-100"
                                        >
                                            <span className="flex-1 text-[18px]">{label}</span>
                                            {!editing && count > 0 && (
                                                <span className="text-[18px] text-ios-gray">{count}</span>
                                            )}
                                            {!editing && (
                                                <ChevronRight className="ml-1 h-[19px] w-[19px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                                            )}
                                        </button>
                                        {editing && (
                                            <button
                                                type="button"
                                                aria-label={t('mail.reorderFolder', 'Reorder {label}', { label })}
                                                onPointerDown={(e) => onHandlePointerDown(e, id)}
                                                className="touch-none cursor-grab active:cursor-grabbing"
                                                style={{ touchAction: 'none' }}
                                            >
                                                <GripVertical className="h-[22px] w-[22px] text-ios-gray" strokeWidth={2} />
                                            </button>
                                        )}
                                    </div>
                                    {i < folderOrder.length - 1 && (
                                        <div className="pointer-events-none bg-black/12 dark:bg-white/10" style={{ height: '0.5px' }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeAccount && (
                    <button
                        type="button"
                        onClick={onOpenSavedEmails}
                        className="mt-6 w-full overflow-hidden rounded-[10px] bg-surface active:bg-black/5 dark:active:bg-white/5"
                    >
                        <div className="flex w-full items-center gap-4 px-4 py-[15px]">
                            <BookUser className="h-[25px] w-[25px] shrink-0 text-ios-blue" />
                            <span className="flex-1 text-left text-[18px]">{t('mail.savedEmails', 'Saved Emails')}</span>
                            <ChevronRight className="ml-1 h-[19px] w-[19px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                        </div>
                    </button>
                )}

                <div className="mt-6 px-4 pb-1.5 text-[13px] font-medium uppercase tracking-wide text-ios-gray">
                    {t('mail.accounts', 'Accounts')}
                </div>
                <div className="overflow-hidden rounded-[10px] bg-surface">
                    {accounts.map((a, i) => (
                        <div key={a.id}>
                            <div className="relative flex w-full items-center gap-4 px-4 py-[13px]">
                                <AtSign className="h-[25px] w-[25px] shrink-0 text-ios-blue" />
                                <button
                                    type="button"
                                    onClick={() => !editing && onSelectAccount(a.id)}
                                    disabled={editing}
                                    className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-60 disabled:active:opacity-100"
                                >
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-[18px]">{a.name}</span>
                                        <span className="truncate text-[13px] text-ios-gray">{a.email}</span>
                                    </span>
                                    {!editing && a.id === activeAccount?.id && (
                                        <Check className="h-[19px] w-[19px] shrink-0 text-ios-blue" strokeWidth={2.6} />
                                    )}
                                </button>
                                {editing && (
                                    <button
                                        type="button"
                                        onClick={() => onSignOut(a.id)}
                                        className="shrink-0 text-[15px] font-medium text-ios-red active:opacity-60"
                                    >
                                        {t('mail.signOut', 'Sign Out')}
                                    </button>
                                )}
                            </div>
                            {i < accounts.length - 1 && (
                                <div className="pointer-events-none bg-black/12 dark:bg-white/10" style={{ height: '0.5px' }} />
                            )}
                        </div>
                    ))}
                    {accounts.length > 0 && (
                        <div className="pointer-events-none bg-black/12 dark:bg-white/10" style={{ height: '0.5px' }} />
                    )}
                    <button
                        type="button"
                        onClick={onAddAccount}
                        className="flex w-full items-center gap-4 px-4 py-[15px] text-left active:bg-black/5 dark:active:bg-white/5"
                    >
                        <Plus className="h-[25px] w-[25px] shrink-0 text-ios-blue" strokeWidth={2.2} />
                        <span className="flex-1 text-[18px] text-ios-blue">{t('mail.addMailbox', 'Add Mailbox')}</span>
                    </button>
                    {editing && accounts.length > 0 && (
                        <>
                            <div className="pointer-events-none bg-black/12 dark:bg-white/10" style={{ height: '0.5px' }} />
                            <button
                                type="button"
                                onClick={() => setConfirmOutAll(true)}
                                className="flex w-full items-center gap-4 px-4 py-[15px] text-left active:bg-black/5 dark:active:bg-white/5"
                            >
                                <LogOut className="h-[25px] w-[25px] shrink-0 text-ios-red" strokeWidth={2.2} />
                                <span className="flex-1 text-[18px] text-ios-red">{t('mail.signOutAllMailboxes', 'Sign Out of All Mailboxes')}</span>
                            </button>
                        </>
                    )}
                </div>

                {activeAccount && (
                    <button
                        type="button"
                        onClick={onChangePassword}
                        className="mt-3 w-full rounded-[10px] bg-surface py-4 text-center text-[18px] font-semibold text-ios-blue active:bg-black/5 dark:active:bg-white/5"
                    >
                        {t('mail.changePassword', 'Change Password')}
                    </button>
                )}

                {activeAccount && (
                    <button
                        type="button"
                        onClick={() => setConfirmOut(true)}
                        className="mt-3 w-full rounded-[10px] bg-surface py-4 text-center text-[18px] font-semibold text-ios-red active:bg-black/5 dark:active:bg-white/5"
                    >
                        {t('mail.signOut', 'Sign Out')}
                    </button>
                )}

                {activeAccount && (
                    <button
                        type="button"
                        onClick={() => setConfirmDeleteAcc(true)}
                        className="mt-3 w-full rounded-[10px] bg-ios-red py-4 text-center text-[18px] font-semibold text-white active:opacity-80"
                    >
                        {t('mail.deleteAccount', 'Delete Account')}
                    </button>
                )}
            </div>

            {confirmOut && activeAccount && (
                <AlertDialog
                    title={t('mail.signOutOfTitle', 'Sign out of {email}?', { email: shortEmail(activeAccount.email) })}
                    message={accounts.length > 1
                        ? t('mail.signOutNextMessage', "You'll stay signed in to your other mailboxes and land on one of them.")
                        : t('mail.signOutLastMessage', "This is your only mailbox, so you'll be signed out of Mail. Your saved password is kept.")}
                    confirmLabel={t('mail.signOut', 'Sign Out')}
                    cancelLabel={t('mail.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirmOut(false)}
                    onConfirm={() => { setConfirmOut(false); onSignOut(activeAccount.id); }}
                />
            )}

            {confirmOutAll && (
                <AlertDialog
                    title={t('mail.signOutAllTitle', 'Sign out of all mailboxes?')}
                    message={t('mail.signOutAllMessage', 'Every mailbox on this phone will be signed out. Saved passwords are kept, so you can sign back in.')}
                    confirmLabel={t('accounts.signOutAllConfirm', 'Log Out')}
                    cancelLabel={t('mail.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirmOutAll(false)}
                    onConfirm={() => { setConfirmOutAll(false); onSignOutAll(); }}
                />
            )}

            {confirmDeleteAcc && activeAccount && (
                <AlertDialog
                    title={t('mail.deleteAccount', 'Delete Account')}
                    message={t('mail.deleteAccountConfirm', "Permanently delete {email} and all of its mail? This can't be undone.", { email: activeAccount.email })}
                    confirmLabel={t('mail.delete', 'Delete')}
                    cancelLabel={t('mail.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirmDeleteAcc(false)}
                    onConfirm={() => { setConfirmDeleteAcc(false); onDeleteAccount(activeAccount.id); }}
                />
            )}
        </div>
    );
}
