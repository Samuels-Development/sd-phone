import { useState } from 'react';
import { AlertOctagon, ChevronDown, ChevronLeft, ChevronUp, Flag, Reply, Trash2 } from 'lucide-react';

import { AlertDialog } from '@/ui/AlertDialog';
import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { AttachmentsView } from './Attachments';
import { avatarColor, formatFullDate, formatMailTime, initials } from './data';
import type { Folder, MailMessage } from './data';

interface Props {
    msg:        MailMessage;
    backLabel:  string;
    prevId:     string | null;
    nextId:     string | null;
    onBack:     () => void;
    onOpenSibling: (id: string) => void;
    onToggleFlag: (id: string) => void;
    onDelete:   (id: string) => void;
    onMove:     (id: string, folder: Folder) => void;
    onReply:    (msg: MailMessage) => void;
}

export function MailDetail({ msg, backLabel, prevId, nextId, onBack, onOpenSibling, onToggleFlag, onDelete, onMove, onReply }: Props) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [confirmSpam, setConfirmSpam] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [navDir, setNavDir] = useState<'up' | 'down' | null>(null);

    function goSibling(id: string | null, dir: 'up' | 'down') {
        if (!id) return;
        setNavDir(dir);
        setDetailsOpen(false);
        onOpenSibling(id);
    }

    const recipients = msg.to.length ? msg.to.join(', ') : t('mail.noRecipients', '(no recipients)');

    return (
        <div
            className="absolute inset-0 z-30 flex flex-col bg-[#d4d4d4] dark:bg-base text-black dark:text-white"
            style={pageStyle}
        >
            <div className="h-[54px] shrink-0" aria-hidden />

            <div className="flex items-center px-2 pb-1">
                <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-0.5 text-ios-blue active:opacity-60"
                >
                    <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.5} />
                    <span className="text-[17px]">{backLabel}</span>
                </button>
                <div className="ml-auto flex items-center gap-4 pr-3">
                    <button
                        type="button"
                        onClick={() => goSibling(prevId, 'up')}
                        disabled={!prevId}
                        className={prevId ? 'text-ios-blue active:opacity-60' : 'text-black/25 dark:text-white/25'}
                        aria-label={t('mail.previous', 'Previous')}
                    >
                        <ChevronUp className="h-[20px] w-[20px]" strokeWidth={2.5} />
                    </button>
                    <button
                        type="button"
                        onClick={() => goSibling(nextId, 'down')}
                        disabled={!nextId}
                        className={nextId ? 'text-ios-blue active:opacity-60' : 'text-black/25 dark:text-white/25'}
                        aria-label={t('mail.next', 'Next')}
                    >
                        <ChevronDown className="h-[20px] w-[20px]" strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            <div
                key={msg.id}
                className="flex-1 overflow-y-auto no-scrollbar"
                style={{ animation: navDir
                    ? `${navDir === 'down' ? 'mail-nav-from-bottom' : 'mail-nav-from-top'} 0.22s ease-out`
                    : undefined }}
            >
                <div className="px-5 pt-3 pb-3 text-[25px] font-bold leading-tight tracking-tight">
                    {msg.subject || t('mail.noSubject', '(No Subject)')}
                </div>

                <div className="px-5 pb-3.5">
                    <div className="flex items-center gap-3">
                        <div
                            className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full text-[18px] font-semibold text-white"
                            style={{ background: avatarColor(msg.from.name) }}
                        >
                            {initials(msg.from.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                                <span className="truncate text-[18px] font-semibold">{msg.from.name}</span>
                                <span className="ml-auto shrink-0 whitespace-nowrap text-[15px] text-ios-gray">
                                    {formatMailTime(msg.sentAt)}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setDetailsOpen(o => !o)}
                                className="mt-0.5 flex w-full items-center gap-1 text-left active:opacity-60"
                            >
                                <span className="truncate text-[16px] text-ios-gray">{t('mail.toRecipients', 'to {recipients}', { recipients })}</span>
                                <ChevronDown
                                    className={`h-[15px] w-[15px] shrink-0 text-ios-gray transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
                                    strokeWidth={2.5}
                                />
                            </button>
                        </div>
                    </div>

                    {detailsOpen && (
                        <div className="mt-3 overflow-hidden rounded-[12px] bg-[#e5e5e5] px-3.5 py-2.5 text-[15px] dark:bg-white/[0.06]">
                            <DetailRow k={t('mail.detailFrom', 'From')} v={`${msg.from.name} <${msg.from.email}>`} />
                            <DetailRow k={t('mail.detailTo', 'To')}   v={recipients} />
                            <DetailRow k={t('mail.detailDate', 'Date')} v={formatFullDate(msg.sentAt)} last />
                        </div>
                    )}
                </div>

                <div className="bg-black/[0.10] dark:bg-white/[0.12]" style={{ height: '0.5px' }} />

                <div className={`whitespace-pre-wrap px-5 pt-4 text-[16px] leading-[1.55] ${msg.attachments?.length ? 'pb-4' : 'pb-36'}`}>
                    {msg.body}
                </div>

                {(msg.attachments?.length ?? 0) > 0 && (
                    <div className="px-5 pb-36">
                        <div className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-gray">
                            {msg.attachments!.length === 1
                                ? t('mail.attachmentOne', '1 Attachment')
                                : t('mail.attachmentCount', '{count} Attachments', { count: msg.attachments!.length })}
                        </div>
                        <AttachmentsView
                            attachments={msg.attachments!}
                            accountEmail={msg.accountId}
                            messageId={msg.id}
                            canSave={msg.from.email.toLowerCase() !== msg.accountId.toLowerCase()}
                        />
                    </div>
                )}
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-around border-t border-black/10 bg-[#f7f7f7]/95 px-4 pb-9 pt-2.5 backdrop-blur-xl dark:border-white/10 dark:bg-base/80">
                <ActionBtn
                    label={t('mail.flag', 'Flag')}
                    icon={Flag}
                    active={msg.flagged}
                    onPress={() => onToggleFlag(msg.id)}
                />
                <ActionBtn label={t('mail.moveToSpam', 'Move to Spam')} icon={AlertOctagon} onPress={() => setConfirmSpam(true)} />
                <ActionBtn
                    label={t('mail.bin', 'Bin')}
                    icon={Trash2}
                    onPress={() => setConfirmDelete(true)}
                />
                <ActionBtn
                    label={t('mail.reply', 'Reply')}
                    icon={Reply}
                    onPress={() => onReply(msg)}
                />
            </div>

            {confirmDelete && (
                <AlertDialog
                    title={t('mail.deleteEmail', 'Delete Email')}
                    message={t('mail.deleteEmailConfirm', 'Are you sure you want to delete this email?')}
                    confirmLabel={t('mail.delete', 'Delete')}
                    cancelLabel={t('mail.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={() => { setConfirmDelete(false); onDelete(msg.id); }}
                />
            )}

            {confirmSpam && (
                <AlertDialog
                    title={t('mail.moveToSpam', 'Move to Spam')}
                    message={t('mail.moveToSpamConfirm', 'Move this email to the Spam folder?')}
                    confirmLabel={t('mail.spam', 'Spam')}
                    cancelLabel={t('mail.cancel', 'Cancel')}
                    onCancel={() => setConfirmSpam(false)}
                    onConfirm={() => { setConfirmSpam(false); onMove(msg.id, 'spam'); }}
                />
            )}
        </div>
    );
}

function DetailRow({ k, v, last = false }: { k: string; v: string; last?: boolean }) {
    return (
        <div className={`flex gap-2 ${last ? '' : 'mb-1.5'}`}>
            <span className="shrink-0 text-ios-gray">{k}:</span>
            <span className="min-w-0 flex-1 break-words">{v}</span>
        </div>
    );
}

function ActionBtn({
    label,
    icon: Icon,
    onPress,
    active,
}: {
    label:   string;
    icon:    React.ComponentType<{ className?: string; strokeWidth?: number | string }>;
    onPress?: () => void;
    active?: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            aria-label={label}
            className="flex h-[46px] w-[46px] items-center justify-center rounded-full transition-colors hover:bg-black/[0.06] active:bg-black/[0.12] dark:hover:bg-white/[0.06] dark:active:bg-white/[0.12]"
        >
            <Icon
                className={`h-[30px] w-[30px] ${active ? 'text-ios-orange' : 'text-ios-blue'}`}
                strokeWidth={2}
            />
        </button>
    );
}
