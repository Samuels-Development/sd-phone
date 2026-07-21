import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, UserRound } from 'lucide-react';

import { ContactPickerSheet } from '@/shared/ContactPickerSheet';
import { Scroller } from '@/ui/Scroller';
import { useSessionState, clearSessionState } from '@/hooks/useSessionState';
import { t } from '@/i18n';
import { digits } from '@/lib/format';
import { formatPhonePartial } from '@/lib/phone';
import { createPersonalInvoice, type PersonalInvoice } from './bankingApi';

const DRAFT_KEY = 'banking:newInvoice';

export function NewInvoicePage({ onClose, onSent }: {
    onClose: () => void;
    onSent:  (invoices: PersonalInvoice[]) => void;
}) {
    const [number,  setNumber]  = useSessionState(`${DRAFT_KEY}:number`, '');
    const [amount,  setAmount]  = useSessionState(`${DRAFT_KEY}:amount`, '');
    const [note,    setNote]    = useSessionState(`${DRAFT_KEY}:note`, '');
    const [picking, setPicking] = useState(false);
    const [busy,    setBusy]    = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const [exiting, setExiting] = useState(false);

    const amountNum = parseInt(amount || '0', 10);
    const canSend   = digits(number).length >= 3 && amountNum > 0 && !busy;

    function clearDraft() { clearSessionState(`${DRAFT_KEY}:`); }

    function dismiss(after: () => void) {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(after, 300);
    }

    function cancel() {
        clearDraft();
        dismiss(onClose);
    }

    async function submit() {
        if (!canSend || exiting) return;
        setBusy(true); setError(null);
        const res = await createPersonalInvoice(digits(number), amountNum, note.trim());
        setBusy(false);
        if (res.success) {
            const invoices = res.data?.invoices ?? [];
            clearDraft();
            dismiss(() => { onSent(invoices); onClose(); });
        } else {
            setError(res.message ?? t('banking.somethingWentWrong', 'Something went wrong'));
        }
    }

    return (
        <>
            <div
                className="absolute inset-0 z-40 flex flex-col bg-[#d4d4d4] font-sf text-black dark:bg-base dark:text-white"
                style={{
                    animation: exiting
                        ? 'ios-pop 0.3s cubic-bezier(0.32,0.72,0,1) forwards'
                        : 'ios-push 0.3s cubic-bezier(0.32,0.72,0,1)',
                    willChange: 'transform',
                }}
            >
                <div className="h-[58px] shrink-0" aria-hidden />

                <div className="flex h-11 shrink-0 items-center justify-between px-2">
                    <button type="button" onClick={cancel} className="flex items-center gap-0.5 text-[17px] text-ios-blue active:opacity-60">
                        <ChevronLeft className="h-[24px] w-[24px]" strokeWidth={2.4} />{t('banking.invoices', 'Invoices')}
                    </button>
                    <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={!canSend}
                        className={`pr-3 text-[17px] font-semibold ${canSend ? 'text-ios-blue active:opacity-60' : 'text-ios-blue/40'}`}
                    >
                        {t('banking.sendShort', 'Send')}
                    </button>
                </div>

                <h1 className="px-5 pb-3 pt-1 text-[34px] font-bold tracking-ios-display">{t('banking.newInvoice', 'New Invoice')}</h1>

                <Scroller className="min-h-0 flex-1 px-5 pb-10 pt-2">
                    <Label required>{t('banking.recipient', 'Recipient')}</Label>
                    <div className="mb-6 flex items-center gap-3">
                        <input
                            type="tel"
                            inputMode="tel"
                            aria-label={t('banking.recipientNumber', 'Recipient number')}
                            value={number ? formatPhonePartial(number) : ''}
                            onChange={e => setNumber(digits(e.target.value).slice(0, 24))}
                            placeholder={t('banking.phonePlaceholder', '(555) 123-4567')}
                            className="w-full rounded-[14px] bg-[#e5e5e5] px-4 py-4 text-[18px] text-black placeholder-black/80 outline-none dark:bg-surface dark:text-white dark:placeholder-white/65"
                        />
                        <button
                            type="button"
                            onClick={() => setPicking(true)}
                            aria-label={t('common.selectContact', 'Select Contact')}
                            className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[14px] bg-[#e5e5e5] text-ios-blue shadow-sm active:opacity-70 dark:bg-surface"
                        >
                            <UserRound className="h-[26px] w-[26px]" strokeWidth={2} />
                        </button>
                    </div>

                    <Label required>{t('banking.amount', 'Amount')}</Label>
                    <div className="mb-6 flex items-center gap-1.5 rounded-[14px] bg-[#e5e5e5] px-4 py-4 dark:bg-surface">
                        <span className="text-[18px] font-medium text-black/45 dark:text-white/45">$</span>
                        <input
                            value={amount ? amountNum.toLocaleString('en-US') : ''}
                            onChange={e => setAmount(digits(e.target.value).replace(/^0+/, '').slice(0, 9))}
                            inputMode="numeric"
                            aria-label={t('banking.amount', 'Amount')}
                            placeholder="0"
                            className="w-full bg-transparent text-[18px] tabular-nums text-black placeholder-black/80 outline-none dark:text-white dark:placeholder-white/65"
                        />
                    </div>

                    <Label>{t('banking.note', 'Note')}</Label>
                    <textarea
                        value={note}
                        maxLength={140}
                        onChange={e => setNote(e.target.value)}
                        placeholder={t('banking.notePlaceholder', "What's this invoice for?")}
                        rows={3}
                        className="ios-scrollbar mb-3 w-full resize-none rounded-[14px] bg-[#e5e5e5] px-4 py-3.5 text-[18px] leading-snug text-black placeholder-black/80 outline-none dark:bg-surface dark:text-white dark:placeholder-white/65"
                    />

                    {error ? (
                        <p className="mt-1 px-1 text-[16px] font-medium leading-snug text-ios-red">{error}</p>
                    ) : (
                        <p className="mt-1 px-1 text-[16px] leading-snug text-ios-gray">
                            {t('banking.invoiceHint', "They'll get a notification and can pay it from their Wallet.")}
                        </p>
                    )}
                </Scroller>
            </div>

            {picking && (
                <ContactPickerSheet
                    onPick={c => { setNumber(digits(c.phone ?? '')); setPicking(false); }}
                    onClose={() => setPicking(false)}
                />
            )}
        </>
    );
}

function Label({ children, required }: { children: ReactNode; required?: boolean }) {
    return (
        <div className="mb-2.5 text-[20px] font-bold tracking-tight text-black dark:text-white">
            {children}
            {required && <span className="text-ios-red"> *</span>}
        </div>
    );
}
