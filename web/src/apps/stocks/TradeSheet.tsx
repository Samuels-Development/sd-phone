import { useState } from 'react';

import { Sheet } from '@/ui/Sheet';
import { Keypad } from '@/ui/Keypad';
import { type Asset, formatMoney, formatUnits } from './data';
import { t } from '@/i18n';

export type TradeMode = 'buy' | 'sell' | 'deposit' | 'withdraw';

export function TradeSheet({ mode, asset, available, onConfirm, onClose }: {
    mode:      TradeMode;
    asset?:    Asset;
    available: number;
    onConfirm: (amount: number, all?: boolean) => Promise<string | null>;
    onClose:   () => void;
}) {
    const TITLES: Record<TradeMode, string> = { buy: t('stocks.buy', 'Buy'), sell: t('stocks.sell', 'Sell'), deposit: t('stocks.deposit', 'Deposit'), withdraw: t('stocks.withdraw', 'Withdraw') };

    const [amountStr, setAmountStr] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy]   = useState(false);

    const amount  = Number(amountStr) || 0;
    const isSell  = mode === 'sell';
    const isBuy   = mode === 'buy';
    const capped  = Number.isFinite(available);
    const overCap = capped && amount > Math.floor(available);

    const accent = mode === 'sell' || mode === 'withdraw' ? '#ea3943' : '#16c784';

    const units = asset && asset.price > 0 ? amount / asset.price : 0;
    const subline = (() => {
        if (isBuy || isSell) {
            const avail = isBuy ? t('stocks.cashAmount', 'Cash {amount}', { amount: formatMoney(available) }) : t('stocks.holdingsAmount', 'Holdings {amount}', { amount: formatMoney(available) });
            return asset ? `≈ ${formatUnits(units)} ${asset.symbol} · ${avail}` : avail;
        }
        if (mode === 'withdraw') return t('stocks.cashAvailable', 'Cash {amount} available', { amount: formatMoney(available) });
        return t('stocks.fromBankAccount', 'From your bank account');
    })();

    function press(d: string) {
        setError(null);
        setAmountStr(s => (s === '0' ? d : (s + d)).slice(0, 12));
    }
    function del() { setError(null); setAmountStr(s => s.slice(0, -1)); }
    function setMax() { if (capped) { setError(null); setAmountStr(String(Math.floor(available))); } }

    async function run(close: () => void, all?: boolean) {
        if (busy) return;
        if (!all && amount <= 0) { setError(t('stocks.enterValidAmount', 'Enter a valid amount')); return; }
        setBusy(true); setError(null);
        const err = await onConfirm(all ? 0 : amount, all);
        setBusy(false);
        if (err) { setError(err); return; }
        close();
    }

    return (
        <Sheet onClose={onClose} top={104} className="bg-surface text-black dark:bg-surface dark:text-white">
            {({ close }) => (
                <div className="flex flex-1 flex-col px-5 pb-6 pt-8">
                    <div className="flex items-center">
                        <button type="button" onClick={close} className="text-[16px] text-ios-blue active:opacity-60">{t('stocks.cancel', 'Cancel')}</button>
                        <span className="absolute left-1/2 -translate-x-1/2 text-[16px] font-semibold">
                            {TITLES[mode]}{asset ? ` ${asset.symbol}` : ''}
                        </span>
                    </div>

                    <div className="mt-6 text-center text-[44px] font-bold tabular-nums leading-none">
                        ${(amount).toLocaleString('en-US')}
                    </div>
                    <div className="mt-2 text-center text-[14px] text-ios-gray">{subline}</div>

                    {capped && (
                        <div className="mt-3 flex justify-center gap-2">
                            <button
                                type="button"
                                onClick={setMax}
                                className="rounded-full bg-black/5 px-4 py-1.5 text-[14px] font-semibold active:opacity-60 dark:bg-white/10"
                            >
                                {t('stocks.max', 'Max')}
                            </button>
                            {isSell && asset && asset.units > 0 && (
                                <button
                                    type="button"
                                    onClick={() => void run(close, true)}
                                    className="rounded-full bg-black/5 px-4 py-1.5 text-[14px] font-semibold active:opacity-60 dark:bg-white/10"
                                >
                                    {t('stocks.sellAll', 'Sell All')}
                                </button>
                            )}
                        </div>
                    )}

                    <Keypad variant="digits" onPress={press} onDelete={del} canDelete={amountStr.length > 0} className="mt-5" />

                    {error && <p className="mt-3 text-center text-[14px] font-medium text-ios-red">{error}</p>}

                    <button
                        type="button"
                        onClick={() => void run(close)}
                        disabled={busy || amount <= 0 || overCap}
                        className="mt-4 rounded-[14px] py-3.5 text-[17px] font-semibold text-white transition-opacity disabled:opacity-40"
                        style={{ background: accent }}
                    >
                        {overCap ? t('stocks.amountTooHigh', 'Amount too high') : `${TITLES[mode]}${asset ? ` ${asset.symbol}` : ''}`}
                    </button>
                </div>
            )}
        </Sheet>
    );
}
