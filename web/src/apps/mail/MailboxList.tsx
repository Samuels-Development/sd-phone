import { useLayoutEffect, useRef, useState } from 'react';
import {
    AlertOctagon, ChevronRight, FileText, Flag, GripVertical, Inbox, Send, SquarePen, Trash2,
} from 'lucide-react';
import type { ComponentType } from 'react';

import { AlertDialog } from '@/ui/AlertDialog';
import { ancestorZoom, trackFractionY } from '@/lib/zoom';
import { t } from '@/i18n';
import { getFolderLabels, unreadCount } from './data';
import type { Folder, MailAccount, MailMessage } from './data';

interface Props {
    accounts:         MailAccount[];
    activeAccount:    MailAccount | null;
    messages:         MailMessage[];
    folderOrder:      Folder[];
    onSelectAccount:  (id: string) => void;
    onOpenFolder:     (f: Folder) => void;
    onCompose:        () => void;
    onAccountAdded:   (account: MailAccount) => void;
    onSignOut:        (id: string) => void;
    onReorderFolders: (next: Folder[]) => void;
    onLockApp:        () => void;
    onDeleteAccount:  (id: string) => void;
    onChangePassword: () => void;
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
    activeAccount, messages, folderOrder, onOpenFolder, onCompose, onReorderFolders, onLockApp, onDeleteAccount, onChangePassword,
}: Props) {
    const [editing, setEditing] = useState(false);
    const [confirmOut, setConfirmOut] = useState(false);
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
        <div className="absolute inset-0 flex flex-col bg-[#d4d4d4] dark:bg-base text-black dark:text-white">
            <div className="h-[58px] shrink-0" aria-hidden />

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
                    <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
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
                                        <div className="pointer-events-none bg-black/12 dark:bg-white/10" style={{ marginLeft: 60, height: '0.5px' }} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeAccount && (
                    <button
                        type="button"
                        onClick={onChangePassword}
                        className="mt-6 w-full rounded-[10px] bg-[#e5e5e5] py-4 text-center text-[18px] font-semibold text-ios-blue active:bg-black/5 dark:bg-surface dark:active:bg-white/5"
                    >
                        {t('mail.changePassword', 'Change Password')}
                    </button>
                )}

                <button
                    type="button"
                    onClick={() => setConfirmOut(true)}
                    className={`${activeAccount ? 'mt-3' : 'mt-6'} w-full rounded-[10px] bg-[#e5e5e5] py-4 text-center text-[18px] font-semibold text-ios-red active:bg-black/5 dark:bg-surface dark:active:bg-white/5`}
                >
                    {t('mail.signOutOfMail', 'Sign out of Mail')}
                </button>

                {activeAccount && (
                    <button
                        type="button"
                        onClick={() => setConfirmDeleteAcc(true)}
                        className="mt-3 w-full rounded-[10px] bg-[#ff3b30] py-4 text-center text-[18px] font-semibold text-white active:opacity-80"
                    >
                        {t('mail.deleteAccount', 'Delete Account')}
                    </button>
                )}
            </div>

            {confirmOut && (
                <AlertDialog
                    title={t('mail.signOut', 'Sign Out')}
                    message={t('mail.signOutConfirm', "Are you sure you want to sign out of Mail? Your accounts stay saved, you'll just need to sign back in on this phone.")}
                    confirmLabel={t('mail.signOut', 'Sign Out')}
                    cancelLabel={t('mail.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirmOut(false)}
                    onConfirm={() => { setConfirmOut(false); onLockApp(); }}
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
