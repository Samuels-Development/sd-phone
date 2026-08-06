import { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';

import { useAsyncData } from '@/hooks/useAsyncData';
import { useTheme } from '@/stores/themeStore';
import { PriceChart } from './PriceChart';
import { fetchHolders } from './stocksApi';
import {
    type Asset, type Holders, formatMoney, formatPct, formatPrice, formatUnits, holdingValue, trendColor,
} from './data';
import { t } from '@/i18n';
import { NavBar } from '@/ui/NavBar';

function StatRow({ label, value, valueColor, divider }: { label: string; value: string; valueColor?: string; divider: boolean }) {
    return (
        <>
            <div className="flex items-center justify-between px-4 py-4">
                <span className="text-[16px] font-medium text-black/80 dark:text-white/80">{label}</span>
                <span className="text-[18px] font-semibold tabular-nums" style={valueColor ? { color: valueColor } : undefined}>{value}</span>
            </div>
            {divider && <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />}
        </>
    );
}

export function AssetDetail({ asset, onBack, onBuy, onSell, onRefresh, animateIn = true }: {
    asset:     Asset;
    onBack:    () => void;
    onBuy:     () => void;
    onSell:    () => void;
    onRefresh: () => void;
    animateIn?: boolean;
}) {
    const { theme } = useTheme('theme');
    const isDark = theme === 'dark';

    const [shown, setShown] = useState(!animateIn);
    const exit = useRef<() => void>(() => {});
    useEffect(() => {
        if (!animateIn) return;
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, [animateIn]);
    function back() { exit.current = onBack; setShown(false); }

    const assetRef = useRef(asset);
    assetRef.current = asset;
    const [snap, setSnap] = useState(asset);
    useEffect(() => { setSnap(asset);   }, [asset.units, asset.avgCost]);

    const [holders, setHolders] = useState<Holders | null>(null);
    useAsyncData(() => fetchHolders(asset.symbol), [asset.symbol], { onData: setHolders });

    const [spinning, setSpinning] = useState(false);
    function doRefresh() {
        if (spinning) return;
        setSpinning(true);
        onRefresh();
        void fetchHolders(assetRef.current.symbol).then(setHolders);
        window.setTimeout(() => { setSnap(assetRef.current); setSpinning(false); }, 500);
    }


    const pageBg = 'rgb(var(--base))';
    const cardBg = 'rgb(var(--surface))';

    const held  = snap.units > 0;
    const value = holdingValue(snap);
    const cost  = snap.units * snap.avgCost;
    const pl    = value - cost;
    const plPct = cost > 0 ? pl / cost : 0;

    return (
        <div
            className="absolute inset-0 z-30 flex flex-col"
            style={{
                background: pageBg,
                color:      isDark ? '#fff' : '#000',
                transform:  shown ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
            }}
            onTransitionEnd={() => { if (!shown) exit.current(); }}
        >
            <div className="shrink-0" style={{ height: 54 }} />

            <NavBar
                backLabel={t('stocks.stocks', 'Stocks')}
                onBack={back}
                right={
                    <button type="button" onClick={doRefresh} aria-label={t('stocks.refresh', 'Refresh')} className="active:opacity-60">
                        <RotateCw className={`h-[20px] w-[20px] ${spinning ? 'animate-spin' : ''}`} strokeWidth={2.5} />
                    </button>
                }
            />

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4">
                <div className="mt-1 flex items-center gap-3.5">
                    <span
                        className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white"
                        style={{ background: snap.color }}
                    >
                        {snap.symbol.slice(0, 3)}
                    </span>
                    <div className="min-w-0">
                        <div className="truncate text-[26px] font-bold tracking-tight leading-tight">{snap.name}</div>
                        <div className="text-[15px] text-ios-gray">{snap.symbol} · {snap.kind === 'crypto' ? t('stocks.cryptocurrency', 'Cryptocurrency') : t('stocks.stock', 'Stock')}</div>
                    </div>
                </div>

                <div className="mt-4 text-[40px] font-bold tabular-nums tracking-tight leading-none">{formatPrice(snap.price)}</div>

                <div className="mt-2">
                    <PriceChart asset={snap} live={asset} />
                </div>

                <div className="mb-2 mt-7 px-1 text-[16px] font-semibold uppercase tracking-wider text-ios-gray">{t('stocks.yourPosition', 'Your Position')}</div>
                {held ? (
                    <div className="overflow-hidden rounded-[14px]" style={{ background: cardBg }}>
                        <StatRow label={t('stocks.unitsLabel', 'Units')} value={formatUnits(snap.units)} divider />
                        <StatRow label={t('stocks.marketValue', 'Market Value')} value={formatMoney(value)} divider />
                        <StatRow label={t('stocks.avgCost', 'Avg Cost')} value={formatMoney(snap.avgCost)} divider />
                        <StatRow
                            label={t('stocks.totalReturn', 'Total Return')}
                            value={`${formatMoney(pl, { showSign: true })} (${formatPct(plPct)})`}
                            valueColor={trendColor(pl)}
                            divider={false}
                        />
                    </div>
                ) : (
                    <p className="px-1 text-[17px] text-ios-gray">{t('stocks.dontOwnAny', "You don't own any {symbol}.", { symbol: snap.symbol })}</p>
                )}

                {holders && (
                    <>
                        <div className="mb-2 mt-7 px-1 text-[16px] font-semibold uppercase tracking-wider text-ios-gray">
                            {t('stocks.ownership', 'Ownership')}{holders.investorCount > 0 ? ` · ${holders.investorCount} ${holders.investorCount === 1 ? t('stocks.investor', 'investor') : t('stocks.investors', 'investors')}` : ''}
                        </div>
                        <div className="overflow-hidden rounded-[14px]" style={{ background: cardBg }}>
                            {holders.holders.map((h, i) => {
                                const label    = h.isMarket ? t('stocks.market', 'Market') : h.isYou ? t('stocks.you', 'You') : t('stocks.holderN', 'Holder {i}', { i });
                                const barColor = h.isMarket ? '#8e8e93' : h.isYou ? '#0a84ff' : snap.color;
                                const pctText  = `${(h.pct * 100).toFixed(h.pct < 0.01 ? 2 : 1)}%`;
                                return (
                                    <div key={i}>
                                        <div className="px-4 py-3.5">
                                            <div className="flex items-baseline justify-between">
                                                <span className="text-[16px] font-semibold" style={h.isYou ? { color: 'rgb(var(--ios-blue))' } : undefined}>{label}</span>
                                                <span className="text-[16px] font-semibold tabular-nums">{pctText}</span>
                                            </div>
                                            <div className="mt-2 h-[7px] w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                                                <div className="h-full rounded-full" style={{ width: `${Math.max(2, h.pct * 100)}%`, background: barColor }} />
                                            </div>
                                            <div className="mt-1 text-[13px] tabular-nums text-ios-gray">
                                                {formatUnits(h.units)} {h.isMarket ? t('stocks.unowned', 'unowned') : t('stocks.units', 'units')}
                                            </div>
                                        </div>
                                        {i < holders.holders.length - 1 && <div className="bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />}
                                    </div>
                                );
                            })}
                        </div>
                        {holders.topPlayerPct >= holders.whaleThreshold && (
                            <p className="mt-2 px-1 text-[14px] font-medium text-ios-red">
                                {t('stocks.whaleWarning', 'One investor holds {pct}% of {symbol} — a large sell could move the price sharply.', { pct: (holders.topPlayerPct * 100).toFixed(0), symbol: snap.symbol })}
                            </p>
                        )}
                    </>
                )}
            </div>

            <div className="flex shrink-0 gap-3 px-4 pb-11 pt-2">
                <button
                    type="button"
                    onClick={onBuy}
                    className="flex-1 rounded-[14px] py-3.5 text-[17px] font-semibold text-white active:opacity-80"
                    style={{ background: '#16c784' }}
                >
                    {t('stocks.buy', 'Buy')}
                </button>
                <button
                    type="button"
                    onClick={onSell}
                    disabled={!held}
                    className="flex-1 rounded-[14px] py-3.5 text-[17px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-30"
                    style={{ background: '#ea3943' }}
                >
                    {t('stocks.sell', 'Sell')}
                </button>
            </div>
        </div>
    );
}
