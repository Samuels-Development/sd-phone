import { useLayoutEffect, useRef, useState } from 'react';
import { BookUser, ChevronLeft, Plus, Trash2 } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { PromptDialog } from '@/ui/PromptDialog';
import { Sheet } from '@/ui/Sheet';
import { isEmailish } from './mailSuggest';

/** Compose's quick picker: tap an address to append it to the To field. */
export function SavedEmailsSheet({ emails, onPick, onClose }: {
    emails:  string[];
    onPick:  (email: string) => void;
    onClose: () => void;
}) {
    const listRef = useRef<HTMLDivElement>(null);
    const [moreBelow, setMoreBelow] = useState(false);

    function updateMoreBelow() {
        const el = listRef.current;
        if (el) setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
    }

    useLayoutEffect(updateMoreBelow, [emails.length]);

    return (
        <Sheet onClose={onClose} fit="content" title={t('mail.savedEmails', 'Saved Emails')} className="bg-[#ececec] dark:bg-surface">
            {({ close }) => (
                <div className="px-4 pb-2">
                    {emails.length === 0 ? (
                        <div className="px-6 py-10 text-center text-[15px] text-ios-gray">
                            {t('mail.noSavedEmails', 'No saved emails yet.')}
                        </div>
                    ) : (
                        <div className="relative">
                            {/* Capped at five rows; longer lists scroll inside the card. */}
                            <div
                                ref={listRef}
                                onScroll={updateMoreBelow}
                                className="max-h-[260px] overflow-y-auto rounded-[12px] bg-[#e5e5e5] no-scrollbar dark:bg-white/5"
                            >
                                {emails.map((email, i) => (
                                    <div key={email}>
                                        <button
                                            type="button"
                                            onClick={() => { onPick(email); close(); }}
                                            className="flex w-full min-w-0 items-center gap-3 px-4 py-3.5 text-left active:opacity-60"
                                        >
                                            <BookUser className="h-[20px] w-[20px] shrink-0 text-ios-gray" strokeWidth={2} />
                                            <span className="truncate text-[17px] text-black dark:text-white">{email}</span>
                                        </button>
                                        {i < emails.length - 1 && (
                                            <div className="bg-black/[0.12] dark:bg-white/10" style={{ height: '0.5px' }} />
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div
                                aria-hidden
                                className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-[12px] bg-gradient-to-t from-[#e5e5e5] to-transparent transition-opacity duration-200 dark:from-surface"
                                style={{ opacity: moreBelow ? 1 : 0 }}
                            />
                        </div>
                    )}
                </div>
            )}
        </Sheet>
    );
}

/** Full-page manager, pushed from the mailboxes screen like a folder list. */
export function SavedEmailsPage({ emails, onAdd, onRemove, onBack }: {
    emails:   string[];
    onAdd:    (email: string) => void;
    onRemove: (email: string) => void;
    onBack:   () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const [adding,        setAdding]        = useState(false);
    const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

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
                    onClick={() => setAdding(true)}
                    aria-label={t('mail.addEmail', 'Add Email')}
                    className="ml-auto pr-3 text-ios-blue active:opacity-60"
                >
                    <Plus className="h-[24px] w-[24px]" strokeWidth={2.2} />
                </button>
            </div>

            <div className="px-5 pb-2 pt-0.5 text-[34px] font-bold tracking-tight">
                {t('mail.savedEmails', 'Saved Emails')}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10">
                {emails.length === 0 ? (
                    <EmptyState
                        icon={BookUser}
                        title={t('mail.noSavedEmailsTitle', 'No Saved Emails')}
                        subtitle={t('mail.noSavedEmailsSubtitle', 'Addresses you save show up here and autofill when you compose.')}
                    />
                ) : (
                    <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                        {emails.map((email, i) => (
                            <div key={email}>
                                <div className="flex items-center gap-4 px-4 py-[15px]">
                                    <BookUser className="h-[25px] w-[25px] shrink-0 text-ios-blue" strokeWidth={2} />
                                    <span className="min-w-0 flex-1 truncate text-[18px]">{email}</span>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmRemove(email)}
                                        aria-label={t('mail.removeSavedEmail', 'Remove saved email')}
                                        className="shrink-0 text-[#ff3b30] active:opacity-60"
                                    >
                                        <Trash2 className="h-[20px] w-[20px]" strokeWidth={2} />
                                    </button>
                                </div>
                                {i < emails.length - 1 && (
                                    <div className="pointer-events-none bg-black/12 dark:bg-white/10" style={{ height: '0.5px' }} />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {adding && (
                <PromptDialog
                    title={t('mail.addEmail', 'Add Email')}
                    placeholder="name@lifeinvader.com"
                    inputMode="email"
                    maxLength={128}
                    validate={v => (isEmailish(v.trim()) ? null : t('mail.invalidEmail', 'Enter a valid email address'))}
                    confirmLabel={t('mail.save', 'Save')}
                    onCancel={() => setAdding(false)}
                    onConfirm={v => { onAdd(v.trim().toLowerCase()); setAdding(false); }}
                />
            )}

            {confirmRemove && (
                <AlertDialog
                    title={t('mail.removeSavedEmailTitle', 'Remove Saved Email')}
                    message={t('mail.removeSavedEmailConfirm', 'Remove {email} from your saved emails?', { email: confirmRemove })}
                    confirmLabel={t('mail.remove', 'Remove')}
                    cancelLabel={t('mail.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirmRemove(null)}
                    onConfirm={() => { onRemove(confirmRemove); setConfirmRemove(null); }}
                />
            )}
        </div>
    );
}
