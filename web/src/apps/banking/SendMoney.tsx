import { useState } from 'react';
import { ChevronLeft, UserRound, EyeOff } from 'lucide-react';

import { useSessionState, seedSessionState } from '@/hooks/useSessionState';
import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import { Keypad } from '@/ui/Keypad';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { ContactPickerSheet } from '@/shared/ContactPickerSheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { formatPhonePartial } from '@/lib/phone';
import { sendMoney, sendTarget, type BankTx, type SendMode, type SendTarget } from './bankingApi';
import { failText } from '@/core/api';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

const MAX_ID_DIGITS = 5;

function fmtAmount(d: string): string {
    const n = parseInt(d || '0', 10);
    return n.toLocaleString('en-US');
}

export function prefillTransferAgain(number: string, name?: string) {
    seedSessionState('banking:sendStep', 'amount');
    seedSessionState('banking:sendMode', 'number');
    seedSessionState('banking:sendNumber', number);
    seedSessionState('banking:sendName', name);
}

export function SendMoney({ balance, allowAnonymous = false, onClose, onSent }: {
    balance: number;
    allowAnonymous?: boolean;
    onClose: () => void;
    onSent:  (newBalance: number, tx: BankTx) => void;
}) {
    const [step,    setStep]    = useSessionState<'recipient' | 'amount'>('banking:sendStep', 'recipient');
    const [mode,    setMode]    = useSessionState<SendMode>('banking:sendMode', 'number');
    const [number,  setNumber]  = useSessionState('banking:sendNumber', '');
    const [name,    setName]    = useSessionState<string | undefined>('banking:sendName', undefined);
    const [amount,  setAmount]  = useState('');
    const [picking, setPicking] = useState(false);
    const [swapDir, setSwapDir] = useState<'forward' | 'back' | null>(null);
    const [anon,    setAnon]    = useSessionState('banking:sendAnon', false);

    const { goBack: backToWallet, pageStyle } = useIosPush(onClose);

    const byId    = mode === 'playerId';
    const maxLen  = byId ? MAX_ID_DIGITS : 24;
    const canNext = number.length >= (byId ? 1 : 3);

    function pressNumber(d: string) { setNumber(p => (p.length >= maxLen ? p : p + d)); }

    function switchMode(next: SendMode) {
        if (next === mode) return;
        setSwapDir(next === 'playerId' ? 'forward' : 'back');
        setMode(next); setNumber(''); setName(undefined);
    }

    function handleSent(newBalance: number, tx: BankTx) {
        setStep('recipient'); setMode('number'); setNumber(''); setName(undefined); setAmount('');
        setSwapDir(null); setAnon(false);
        onSent(newBalance, tx);
    }

    return (
        <div
            className="absolute inset-0 z-30 flex flex-col bg-base font-sf"
            style={pageStyle}
        >
            <StatusBarSpacer />

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

            <div className="shrink-0 px-6 pt-3">
                <SegmentedControl<SendMode>
                    value={mode}
                    onChange={switchMode}
                    options={[
                        { value: 'number',   label: t('banking.modePhone', 'Phone Number') },
                        { value: 'playerId', label: t('banking.modePlayerId', 'Player ID') },
                    ]}
                    className="mx-auto max-w-[280px]"
                    slide
                />
            </div>

            <div className="flex flex-1 flex-col items-center justify-center px-6">
                <div
                    key={mode}
                    className={`flex min-h-[236px] w-full flex-col items-center ${
                        swapDir === 'forward' ? 'animate-pin-phase' : swapDir === 'back' ? 'animate-pin-phase-back' : ''
                    }`}
                >
                    <input
                        type="tel"
                        inputMode={byId ? 'numeric' : 'tel'}
                        aria-label={byId ? t('banking.recipientPlayerId', 'Recipient player ID') : t('banking.recipientNumber', 'Recipient number')}
                        value={number ? (byId ? number : formatPhonePartial(number)) : ''}
                        onChange={e => setNumber(e.target.value.replace(/\D/g, '').slice(0, maxLen))}
                        placeholder={byId ? t('banking.playerIdPlaceholder', '9') : t('banking.phonePlaceholder', '(555) 123-4567')}
                        className="w-full bg-transparent text-center text-[40px] font-light tracking-tight text-black outline-none placeholder:text-black/25 dark:text-white dark:placeholder:text-white/25"
                    />
                    {!byId && (
                        <button
                            type="button"
                            onClick={() => setPicking(true)}
                            className="mt-4 flex items-center gap-1.5 rounded-full bg-black/[0.07] px-5 py-2.5 text-[16.5px] font-semibold text-black/75 active:opacity-60 dark:bg-white/[0.12] dark:text-white/85"
                        >
                            <UserRound className="h-[18px] w-[18px]" strokeWidth={2.4} />
                            {t('banking.selectContact', 'Select Contact')}
                        </button>
                    )}
                    <p className="mt-6 max-w-[310px] text-center text-[19px] font-medium leading-snug text-black/60 dark:text-white/60">
                        {byId
                            ? t('banking.transferDisclaimerId', 'Transfers are instant and final, with no refunds. The player must be online, and their ID has to be right before you send.')
                            : t('banking.transferDisclaimer', 'Transfers are instant and final, with no refunds. Make sure this number is right before you send.')}
                    </p>
                </div>
            </div>

            <Keypad variant="phone" onPress={pressNumber} onDelete={() => setNumber(p => p.slice(0, -1))} canDelete={number.length > 0} className="shrink-0 px-8 pb-14 pt-6" />

            {step === 'amount' && (
                <AmountStage
                    balance={balance}
                    target={sendTarget(mode, number)}
                    toLabel={byId ? t('banking.playerIdLabel', 'Player ID {id}', { id: number }) : (name ?? formatPhonePartial(number))}
                    amount={amount}
                    setAmount={setAmount}
                    anon={anon}
                    setAnon={setAnon}
                    allowAnonymous={allowAnonymous}
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

function AmountStage({ balance, target, toLabel, amount, setAmount, anon, setAnon, allowAnonymous, onBack, onSent }: {
    balance:   number;
    target:    SendTarget;
    toLabel:   string;
    amount:    string;
    setAmount: (updater: (prev: string) => string) => void;
    anon:      boolean;
    setAnon:   (v: boolean) => void;
    allowAnonymous: boolean;
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
        const res = await sendMoney(target, amountNum, anon);
        setBusy(false);
        if (res.success && res.data) onSent(res.data.balance, res.data.transaction);
        else setError(failText(res, t('banking.transferFailed', 'Transfer failed')));
    }

    return (
        <div
            className="absolute inset-0 z-10 flex flex-col bg-base font-sf"
            style={pageStyle}
        >
            <StatusBarSpacer />

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
                    {error ?? t('banking.availableAmount', '${amount} available', { amount: balance.toLocaleString('en-US') })}
                </div>

                {allowAnonymous && (
                    <button
                        type="button"
                        role="switch"
                        aria-checked={anon}
                        onClick={() => setAnon(!anon)}
                        className={`mt-4 flex items-center gap-2 rounded-full px-4 py-2 text-[16.5px] font-semibold transition-colors active:opacity-60 ${
                            anon
                                ? 'bg-ios-blue text-white'
                                : 'bg-black/[0.06] text-black/60 dark:bg-white/10 dark:text-white/65'
                        }`}
                    >
                        <EyeOff className="h-[17px] w-[17px]" strokeWidth={2.4} />
                        {t('banking.sendAnonymously', 'Send Anonymously')}
                    </button>
                )}
            </div>

            <Keypad variant="phone" onPress={pressAmount} onDelete={() => setAmount(p => p.slice(0, -1))} canDelete={amount.length > 0} className="shrink-0 px-8 pb-14 pt-6" />

            {confirming && (
                <AlertDialog
                    title={t('banking.confirmTransfer', 'Confirm Transfer')}
                    message={anon
                        ? t('banking.confirmTransferAnonMessage', "Send ${amount} to {name} anonymously? They won't see who it came from, and this can't be undone.", { amount: amountNum.toLocaleString('en-US'), name: toLabel })
                        : t('banking.confirmTransferMessage', "Send ${amount} to {name}? This can't be undone.", { amount: amountNum.toLocaleString('en-US'), name: toLabel })}
                    confirmLabel={t('banking.send', 'Send')}
                    cancelLabel={t('banking.cancel', 'Cancel')}
                    onCancel={() => setConfirming(false)}
                    onConfirm={() => { setConfirming(false); void submit(); }}
                />
            )}
        </div>
    );
}

