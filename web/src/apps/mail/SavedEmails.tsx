import { useState } from 'react';
import { BookUser, Plus, Trash2 } from 'lucide-react';

import { t } from '@/i18n';
import { PromptDialog } from '@/ui/PromptDialog';
import { Sheet } from '@/ui/Sheet';
import { portalToPhoneScreen } from '@/ui/portal';
import { isEmailish } from './mailSuggest';

export function SavedEmailsSheet({ emails, mode, onPick, onAdd, onRemove, onClose }: {
    emails:    string[];
    mode:      'pick' | 'manage';
    onPick?:   (email: string) => void;
    onAdd?:    (email: string) => void;
    onRemove?: (email: string) => void;
    onClose:   () => void;
}) {
    const [adding, setAdding] = useState(false);

    return (
        <>
            <Sheet onClose={onClose} fit="content" title={t('mail.savedEmails', 'Saved Emails')}>
                {({ close }) => (
                    <div className="px-4 pb-2">
                        {mode === 'manage' && (
                            <button
                                type="button"
                                onClick={() => setAdding(true)}
                                className="flex w-full items-center gap-3 rounded-[12px] bg-[#e5e5e5] px-4 py-3.5 text-left active:opacity-60 dark:bg-surface"
                            >
                                <Plus className="h-[20px] w-[20px] text-ios-blue" strokeWidth={2.4} />
                                <span className="text-[17px] text-ios-blue">{t('mail.addEmail', 'Add Email')}</span>
                            </button>
                        )}

                        {emails.length === 0 ? (
                            <div className="px-6 py-10 text-center text-[15px] text-ios-gray">
                                {t('mail.noSavedEmails', 'No saved emails yet.')}
                            </div>
                        ) : (
                            <div className={`overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface ${mode === 'manage' ? 'mt-2' : ''}`}>
                                {emails.map((email, i) => (
                                    <div key={email}>
                                        <div className="flex items-center">
                                            <button
                                                type="button"
                                                disabled={mode !== 'pick'}
                                                onClick={() => { if (onPick) { onPick(email); close(); } }}
                                                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left active:opacity-60 disabled:active:opacity-100"
                                            >
                                                <BookUser className="h-[20px] w-[20px] shrink-0 text-ios-gray" strokeWidth={2} />
                                                <span className="truncate text-[17px] text-black dark:text-white">{email}</span>
                                            </button>
                                            {mode === 'manage' && (
                                                <button
                                                    type="button"
                                                    onClick={() => onRemove?.(email)}
                                                    aria-label={t('mail.removeSavedEmail', 'Remove saved email')}
                                                    className="px-4 py-3.5 text-[#ff3b30] active:opacity-60"
                                                >
                                                    <Trash2 className="h-[19px] w-[19px]" strokeWidth={2} />
                                                </button>
                                            )}
                                        </div>
                                        {i < emails.length - 1 && (
                                            <div className="ml-[52px] bg-black/[0.12] dark:bg-white/10" style={{ height: '0.5px' }} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Sheet>

            {/* Portaled above the sheet: DialogShell's z-50 would otherwise sit under the
                sheet's z-60 in the same phone-screen stacking context. */}
            {adding && portalToPhoneScreen(
                <div className="absolute inset-0" style={{ zIndex: 80 }}>
                    <PromptDialog
                        title={t('mail.addEmail', 'Add Email')}
                        placeholder="name@lifeinvader.com"
                        inputMode="email"
                        maxLength={128}
                        validate={v => (isEmailish(v.trim()) ? null : t('mail.invalidEmail', 'Enter a valid email address'))}
                        confirmLabel={t('mail.save', 'Save')}
                        onCancel={() => setAdding(false)}
                        onConfirm={v => { onAdd?.(v.trim().toLowerCase()); setAdding(false); }}
                    />
                </div>,
            )}
        </>
    );
}
