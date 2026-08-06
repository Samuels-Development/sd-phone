import { useState } from 'react';
import { ChevronLeft, UserRound } from 'lucide-react';

import { useSessionState, seedSessionState } from '@/hooks/useSessionState';
import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import { Keypad } from '@/ui/Keypad';
import { ContactPickerSheet } from '@/shared/ContactPickerSheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { formatPhonePartial } from '@/lib/phone';
import { sendMoney, type BankTx } from './bankingApi';

function fmtAmount(d: string): string {
    const n = parseInt(d || '0', 10);
    return n.toLocaleString('en-US');
}

export function prefillTransferAgain(number: string, name?: string) {
    seedSessionState('banking:sendStep', 'amount');
    seedSessionState('banking:sendNumber', number);
    seedSessionState('banking:sendName', name);
}

export function SendMoney({ balance, onClose, onSent }: {
    balance: number;
    onClose: () => void;
    onSent:  (newBalance: number, tx: BankTx) => void;
}) {
    const [step,    setStep]    = useSessionState<'recipient' | 'amount'>('banking:sendStep', 'recipient');
    const [number,  setNumber]  = useSessionState('banking:sendNumber', '');
    const [name,    setName]    = useSessionState<string | undefined>('banking:sendName', undefined);
    const [amount,  setAmount]  = useState('');
    const [picking, setPicking] = useState(false);

    const { goBack: backToWallet, pageStyle } = useIosPush(onClose);

    const canNext = number.length >= 3;

    function pressNumber(d: string) { setNumber(p => (p.length >= 24 ? p : p + d)); }

    function handleSent(newBalance: number, tx: BankTx) {
        setStep('recipient'); setNumber(''); setName(undefined); setAmount('');
        onSent(newBalance, tx);
    }

    return (
        <div
            className="absolute inset-0 z-30 flex flex-col bg-base font-sf"
            style={pageStyle}
        >
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="flex h-11 shrink-0 items-center justify-between px-3">
                <button
                    type="button"
                    onClick={backToWallet}
                    className="flex items-center gap-0.5 text-[17px] text-ios-blue active:opacity-60"
                >
                    <ChevronLeft className="h-[24px] w-[24px]" strokeWidth={2.4} />
                    {t('banking.wallet', 'Wallet')}
                </button>
                <button
                    type="button"
                    disabled={!canNext}
                    onClick={() => setStep('amount')}
                    className={`text-[17px] font-semibold ${canNext ? 'text-ios-blue active:opacity-60' : 'text-ios-gray/50'}`}
                >
                    {t('banking.next', 'Next')}
                </button>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center px-6">
                <input
                    type="tel"
                    inputMode="tel"
                    aria-label={t('banking.recipientNumber', 'Recipient number')}
                    value={number ? formatPhonePartial(number) : ''}
                    onChange={e => setNumber(e.target.value.replace(/\D/g, '').slice(0, 24))}
                    placeholder={t('banking.phonePlaceholder', '(555) 123-4567')}
                    className="w-full bg-transparent text-center text-[40px] font-light tracking-tight text-black outline-none placeholder:text-black/25 dark:text-white dark:placeholder:text-white/25"
                />
                <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="mt-4 flex items-center gap-1.5 rounded-full bg-black/[0.07] px-5 py-2.5 text-[16.5px] font-semibold text-black/75 active:opacity-60 dark:bg-white/[0.12] dark:text-white/85"
                >
                    <UserRound className="h-[18px] w-[18px]" strokeWidth={2.4} />
                    {t('banking.selectContact', 'Select Contact')}
                </button>
                <p className="mt-6 max-w-[310px] text-center text-[19px] font-medium leading-snug text-black/60 dark:text-white/60">
                    {t('banking.transferDisclaimer', 'Transfers are instant and final, with no refunds. Make sure this number is right before you send.')}
                </p>
            </div>

            <Keypad variant="phone" onPress={pressNumber} onDelete={() => setNumber(p => p.slice(0, -1))} canDelete={number.length > 0} className="shrink-0 px-8 pb-14 pt-6" />

            {step === 'amount' && (
                <AmountStage
                    balance={balance}
                    number={number}
                    toLabel={name ?? formatPhonePartial(number)}
                    amount={amount}
                    setAmount={setAmount}
                    onBack={() => setStep('recipient')}
                    onSent={handleSent}
                />
            )}

            {picking && (
                <ContactPickerSheet
                    onClose={() => setPicking(false)}
                    onPick={(c) => { setNumber((c.phone || '').replace(/\D/g, '')); setName(c.name); setPicking(false); }}
                />
            )}
        </div>
    );
}

function AmountStage({ balance, number, toLabel, amount, setAmount, onBack, onSent }: {
    balance:   number;
    number:    string;
    toLabel:   string;
    amount:    string;
    setAmount: (updater: (prev: string) => string) => void;
    onBack:    () => void;
    onSent:    (newBalance: number, tx: BankTx) => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const [busy,       setBusy]       = useState(false);
    const [error,      setError]      = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);

    const amountNum = parseInt(amount || '0', 10);
    const canSend   = amountNum > 0 && amountNum <= balance && !busy;

    function pressAmount(d: string) {
        setAmount(p => (p.length >= 12 ? p : (p === '' && d === '0' ? p : p + d)));
        setError(null);
    }

    async function submit() {
        if (!canSend) return;
        setBusy(true); setError(null);
        const res = await sendMoney(number, amountNum);
        setBusy(false);
        if (res.success && res.data) onSent(res.data.balance, res.data.transaction);
        else setError(res.message ?? t('banking.transferFailed', 'Transfer failed'));
    }

    return (
        <div
            className="absolute inset-0 z-10 flex flex-col bg-base font-sf"
            style={pageStyle}
        >
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="flex h-11 shrink-0 items-center justify-between px-3">
                <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-0.5 text-[17px] text-ios-blue active:opacity-60"
                >
                    <ChevronLeft className="h-[24px] w-[24px]" strokeWidth={2.4} />
                    {t('banking.back', 'Back')}
                </button>
                <button
                    type="button"
                    disabled={!canSend}
                    onClick={() => setConfirming(true)}
                    className={`text-[17px] font-semibold ${canSend ? 'text-ios-blue active:opacity-60' : 'text-ios-gray/50'}`}
                >
                    {t('banking.send', 'Send')}
                </button>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center px-6">
                <div className="text-[22px] font-medium text-ios-gray">
                    {t('banking.to', 'To')} <span className="font-semibold text-black dark:text-white">{toLabel}</span>
                </div>
                <div className="mt-2 flex items-start justify-center text-black dark:text-white">
                    <span className="mt-2 text-[34px] font-light">$</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        aria-label={t('banking.amount', 'Amount')}
                        value={amount ? fmtAmount(amount) : ''}
                        onChange={e => {
                            const d = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 12);
                            setAmount(() => d);
                            setError(null);
                        }}
                        placeholder="0"
                        style={{ width: `${Math.max(1, (amount ? fmtAmount(amount) : '0').length)}ch` }}
                        className="bg-transparent p-0 text-[64px] font-light leading-none tracking-tight tabular-nums text-black outline-none placeholder:text-black/30 dark:text-white dark:placeholder:text-white/30"
                    />
                </div>
                <div className={`mt-5 rounded-full px-5 py-2.5 text-[18.5px] font-semibold ${error ? 'bg-ios-red/10 text-ios-red' : 'bg-black/[0.06] text-black/65 dark:bg-white/10 dark:text-white/70'}`}>
                    {error ?? t('banking.available', '${amount} available', { amount: balance.toLocaleString('en-US') })}
                </div>
            </div>

            <Keypad variant="phone" onPress={pressAmount} onDelete={() => setAmount(p => p.slice(0, -1))} canDelete={amount.length > 0} className="shrink-0 px-8 pb-14 pt-6" />

            {confirming && (
                <AlertDialog
                    title={t('banking.confirmTransfer', 'Confirm Transfer')}
                    message={t('banking.confirmTransferMessage', "Send ${amount} to {name}? This can't be undone.", { amount: amountNum.toLocaleString('en-US'), name: toLabel })}
                    confirmLabel={t('banking.send', 'Send')}
                    cancelLabel={t('banking.cancel', 'Cancel')}
                    onCancel={() => setConfirming(false)}
                    onConfirm={() => { setConfirming(false); void submit(); }}
                />
            )}
        </div>
    );
}

