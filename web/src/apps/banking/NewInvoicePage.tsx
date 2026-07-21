import { useEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';

import { ContactPickerSheet } from '@/shared/ContactPickerSheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { t } from '@/i18n';
import { digits } from '@/lib/format';
import { formatPhonePartial } from '@/lib/phone';
import { createPersonalInvoice, type PersonalInvoice } from './bankingApi';

export function NewInvoicePage({ onClose, onSent }: {
    onClose: () => void;
    onSent:  (invoices: PersonalInvoice[]) => void;
}) {
    const [shown,   setShown]   = useState(false);
    const [number,  setNumber]  = useState('');
    const [amount,  setAmount]  = useState('');
    const [note,    setNote]    = useState('');
    const [picking, setPicking] = useState(false);
    const [busy,    setBusy]    = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const exit = useRef<() => void>(() => {});

    useEffect(() => {
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const amountNum = parseInt(amount || '0', 10);
    const canSend   = digits(number).length >= 3 && amountNum > 0 && !busy;

    function close() { exit.current = onClose; setShown(false); }

    async function submit() {
        if (!canSend) return;
        setBusy(true); setError(null);
        const res = await createPersonalInvoice(digits(number), amountNum, note.trim());
        setBusy(false);
        if (res.success) { onSent(res.data?.invoices ?? []); close(); }
        else setError(res.message ?? t('banking.somethingWentWrong', 'Something went wrong'));
    }

    const fieldCls = 'w-full rounded-[10px] bg-white px-3.5 py-3 text-[17px] text-black outline-none placeholder:text-black/30 dark:bg-surface dark:text-white dark:placeholder:text-white/30';
    const labelCls = 'mb-1.5 px-1 text-[13px] font-semibold uppercase tracking-wide text-ios-gray';

    return (
        <div
            className="absolute inset-0 z-20 flex flex-col bg-[#d4d4d4] text-black dark:bg-base dark:text-white"
            style={{
                transform:  shown ? 'translateY(0)' : 'translateY(100%)',
                transition: 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
            }}
            onTransitionEnd={() => { if (!shown) exit.current(); }}
        >
            <div className="h-[54px] shrink-0" aria-hidden />
            <SheetHeader
                cancelLabel={t('banking.cancel', 'Cancel')}
                onCancel={close}
                title={t('banking.newInvoice', 'New Invoice')}
                doneLabel={t('banking.sendShort', 'Send')}
                onDone={() => void submit()}
                doneDisabled={!canSend}
            />

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-8 pt-4">
                <div>
                    <div className={labelCls}>{t('banking.recipient', 'Recipient')}</div>
                    <div className="flex items-center gap-2">
                        <input
                            type="tel"
                            inputMode="tel"
                            aria-label={t('banking.recipientNumber', 'Recipient number')}
                            value={number ? formatPhonePartial(number) : ''}
                            onChange={e => setNumber(digits(e.target.value).slice(0, 24))}
                            placeholder={t('banking.phonePlaceholder', '(555) 123-4567')}
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
                    <div className={labelCls}>{t('banking.amount', 'Amount')}</div>
                    <div className="flex items-center rounded-[10px] bg-white px-3.5 dark:bg-surface">
                        <span className="text-[17px] font-medium text-ios-gray">$</span>
                        <input
                            type="text"
                            inputMode="numeric"
                            aria-label={t('banking.amount', 'Amount')}
                            value={amount ? amountNum.toLocaleString('en-US') : ''}
                            onChange={e => setAmount(digits(e.target.value).replace(/^0+/, '').slice(0, 9))}
                            placeholder="0"
                            className="w-full bg-transparent py-3 pl-1 text-[17px] tabular-nums text-black outline-none placeholder:text-black/30 dark:text-white dark:placeholder:text-white/30"
                        />
                    </div>
                </div>

                <div className="mt-4">
                    <div className={labelCls}>{t('banking.noteOptional', 'Note (optional)')}</div>
                    <input
                        type="text"
                        value={note}
                        maxLength={140}
                        onChange={e => setNote(e.target.value)}
                        placeholder={t('banking.notePlaceholder', "What's this invoice for?")}
                        className={fieldCls}
                    />
                </div>

                {error ? (
                    <p className="mt-3 px-1 text-[14px] font-medium text-ios-red">{error}</p>
                ) : (
                    <p className="mt-3 px-1 text-[13px] text-ios-gray">
                        {t('banking.invoiceHint', "They'll get a notification and can pay it from their Wallet.")}
                    </p>
                )}
            </div>

            {picking && (
                <ContactPickerSheet
                    onPick={c => { setNumber(digits(c.phone ?? '')); setPicking(false); }}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}
