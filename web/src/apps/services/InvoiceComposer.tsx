import { useState } from 'react';
import { UserRound } from 'lucide-react';

import { Sheet } from '@/ui/Sheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { ContactPickerSheet } from '@/shared/ContactPickerSheet';
import { t } from '@/i18n';
import { digits } from '@/lib/format';
import { formatPhonePartial } from '@/lib/phone';
import { createInvoice, type SentInvoice } from './servicesApi';

export function InvoiceComposer({ onClose, onSent }: {
    onClose: () => void;
    onSent:  (invoices: SentInvoice[]) => void;
}) {
    const [number,  setNumber]  = useState('');
    const [amount,  setAmount]  = useState('');
    const [note,    setNote]    = useState('');
    const [picking, setPicking] = useState(false);
    const [busy,    setBusy]    = useState(false);
    const [error,   setError]   = useState<string | null>(null);

    const amountNum = parseInt(amount || '0', 10);
    const canSend   = digits(number).length >= 3 && amountNum > 0 && !busy;

    async function submit(close: () => void) {
        if (!canSend) return;
        setBusy(true); setError(null);
        const res = await createInvoice(digits(number), amountNum, note.trim());
        setBusy(false);
        if (res.success) { onSent(res.data?.invoices ?? []); close(); }
        else setError(res.message ?? t('services.somethingWentWrong', 'Something went wrong'));
    }

    const fieldCls = 'w-full rounded-[10px] bg-white px-3.5 py-3 text-[17px] text-black outline-none placeholder:text-black/30 dark:bg-surface dark:text-white dark:placeholder:text-white/30';
    const labelCls = 'mb-1.5 px-1 text-[13px] font-semibold uppercase tracking-wide text-ios-gray';

    return (
        <Sheet onClose={onClose} fit="content" title={t('services.newInvoice', 'New Invoice')} className="font-sf bg-[#d4d4d4] dark:bg-base">
            {({ close }) => (
                <div className="px-4 pb-3 pt-1">
                    <div>
                        <div className={labelCls}>{t('services.recipient', 'Recipient')}</div>
                        <div className="flex items-center gap-2">
                            <input
                                type="tel"
                                inputMode="tel"
                                aria-label={t('services.recipientNumber', 'Recipient number')}
                                value={number ? formatPhonePartial(number) : ''}
                                onChange={e => setNumber(digits(e.target.value).slice(0, 24))}
                                placeholder={t('services.phonePlaceholder', '(555) 123-4567')}
                                className={fieldCls}
                            />
                            <button
                                type="button"
                                onClick={() => setPicking(true)}
                                aria-label={t('common.selectContact', 'Select Contact')}
                                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[10px] bg-white text-ios-blue active:opacity-60 dark:bg-surface"
                            >
                                <UserRound className="h-[22px] w-[22px]" strokeWidth={2.2} />
                            </button>
                        </div>
                    </div>

                    <div className="mt-4">
                        <div className={labelCls}>{t('services.amount', 'Amount')}</div>
                        <div className="flex items-center rounded-[10px] bg-white px-3.5 dark:bg-surface">
                            <span className="text-[17px] font-medium text-ios-gray">$</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                aria-label={t('services.amount', 'Amount')}
                                value={amount ? amountNum.toLocaleString('en-US') : ''}
                                onChange={e => setAmount(digits(e.target.value).replace(/^0+/, '').slice(0, 9))}
                                placeholder="0"
                                className="w-full bg-transparent py-3 pl-1 text-[17px] tabular-nums text-black outline-none placeholder:text-black/30 dark:text-white dark:placeholder:text-white/30"
                            />
                        </div>
                    </div>

                    <div className="mt-4">
                        <div className={labelCls}>{t('services.noteOptional', 'Note (optional)')}</div>
                        <input
                            type="text"
                            value={note}
                            maxLength={140}
                            onChange={e => setNote(e.target.value)}
                            placeholder={t('services.notePlaceholder', "What's this invoice for?")}
                            className={fieldCls}
                        />
                    </div>

                    <button
                        type="button"
                        disabled={!canSend}
                        onClick={() => void submit(close)}
                        className="mt-6 w-full rounded-[13px] bg-ios-blue py-3.5 text-center text-[17px] font-semibold text-white active:opacity-75 disabled:opacity-40"
                    >
                        {t('services.sendInvoice', 'Send Invoice')}
                    </button>

                    {picking && (
                        <ContactPickerSheet
                            onClose={() => setPicking(false)}
                            onPick={c => { setNumber(digits(c.phone || '').slice(0, 24)); setPicking(false); }}
                        />
                    )}

                    {error && (
                        <AlertDialog
                            title={t('services.couldntComplete', "Couldn't complete that")}
                            message={error}
                            confirmLabel={t('services.ok', 'OK')}
                            hideCancel
                            onCancel={() => setError(null)}
                            onConfirm={() => setError(null)}
                        />
                    )}
                </div>
            )}
        </Sheet>
    );
}
