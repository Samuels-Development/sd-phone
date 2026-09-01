import { useEffect, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';

import { useTheme } from '@/stores/themeStore';
import { AreaChart, Sparkline } from './Sparkline';
import {
    type Asset, formatMoney, formatPct, formatUnits, holdingValue, trendColor,
} from './data';
import { t } from '@/i18n';

function PortfolioRow({ asset, divider, onOpen }: { asset: Asset; divider: boolean; onOpen: () => void }) {
    const value = holdingValue(asset);
    const cost  = asset.units * asset.avgCost;
    const pl    = value - cost;
    const plPct = cost > 0 ? pl / cost : 0;

    return (
        <>
            <button type="button" onClick={onOpen} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left active:bg-black/5 dark:active:bg-white/5">
                <span className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full text-[14px] font-bold text-white" style={{ background: asset.color }}>
                    {asset.symbol.slice(0, 3)}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[19px] font-semibold text-black dark:text-white">{asset.symbol}</div>
                    <div className="truncate text-[15px] text-black/60 dark:text-white/60">{formatUnits(asset.units)} {t('stocks.units', 'units')}</div>
                </div>
                <Sparkline data={asset.history} width={64} height={32} strokeWidth={2.4} />
                <div className="w-[104px] shrink-0 text-right">
                    <div className="text-[18px] font-semibold tabular-nums text-black dark:text-white">{formatMoney(value)}</div>
                    <div className="text-[15px] font-semibold tabular-nums" style={{ color: trendColor(pl) }}>{formatPct(plPct)}</div>
                </div>
            </button>
            {divider && <div className="pointer-events-none bg-hairline/10" style={{ height: '0.5px' }} />}
        </>
    );
}

export function Portfolio({ assets, cash, onBack, onOpenAsset }: {
    assets:      Asset[];
    cash:        number;
    onBack:      () => void;
    onOpenAsset: (symbol: string) => void;
}) {
    const { theme } = useTheme('theme');
    const isDark = theme === 'dark';

    const [shown, setShown] = useState(false);
    const exit = useRef<() => void>(() => {});
    useEffect(() => {
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, []);
    function back() { exit.current = onBack; setShown(false); }

    const pageBg  = 'rgb(var(--base))';
    const cardBg  = 'rgb(var(--surface))';

    const held     = assets.filter(a => a.units > 0).sort((a, b) => holdingValue(b) - holdingValue(a));
    const invested = held.reduce((s, a) => s + holdingValue(a), 0);
    const cost     = held.reduce((s, a) => s + a.units * a.avgCost, 0);
    const pl       = invested - cost;
    const plPct    = cost > 0 ? pl / cost : 0;
    const total    = invested + cash;

    const L = held.reduce((m, a) => Math.max(m, a.history.length), 0);
    const series = L > 1
        ? Array.from({ length: L }, (_, i) => held.reduce((s, a) => {
            const h = a.history;
            return s + a.units * (h[i] ?? h[h.length - 1] ?? 0);
        }, 0))
        : [];

    return (
        <div
            className="absolute inset-0 z-20 flex flex-col"
            style={{
                background: pageBg,
                color:      isDark ? '#fff' : '#000',
                transform:  shown ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
            }}
            onTransitionEnd={() => { if (!shown) exit.current(); }}
        >
            <div className="shrink-0" style={{ height: 54 }} />

            <div className="relative flex h-11 shrink-0 items-center px-2">
                <button type="button" onClick={back} className="flex items-center text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-[26px] w-[26px]" strokeWidth={2.5} />
                    <span className="-ml-1 text-[17px]">{t('stocks.stocks', 'Stocks')}</span>
                </button>
                <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold">{t('stocks.portfolio', 'Portfolio')}</span>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10">
                <div className="mt-1 text-[15px] font-medium text-black/60 dark:text-white/60">{t('stocks.totalValue', 'Total Value')}</div>
                <div className="text-[42px] font-bold tabular-nums leading-tight">{formatMoney(total)}</div>
                <div className="mt-0.5 text-[17px] font-semibold tabular-nums" style={{ color: trendColor(pl) }}>
                    {formatMoney(pl, { showSign: true })} ({formatPct(plPct)})
                </div>

                {held.length === 0 ? (
                    <p className="mt-16 text-center text-[15px] text-ios-gray">{t('stocks.noInvestments', "You haven't invested in anything yet.")}</p>
                ) : (
                    <>
                        {series.length > 1 && (
                            <div className="mt-4 overflow-hidden rounded-[14px]" style={{ background: cardBg }}>
                                <AreaChart data={series} color={trendColor(pl)} height={150} />
                            </div>
                        )}

                        <div className="mb-1 mt-6 px-1 text-[13px] font-semibold uppercase tracking-wider text-ios-gray">{t('stocks.holdings', 'Holdings')}</div>
                        <div className="overflow-hidden rounded-[14px]" style={{ background: cardBg }}>
                            {held.map((a, i) => (
                                <PortfolioRow key={a.symbol} asset={a} divider={i < held.length - 1} onOpen={() => onOpenAsset(a.symbol)} />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
