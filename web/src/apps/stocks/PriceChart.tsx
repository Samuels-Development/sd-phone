import { useState } from 'react';

import { type Asset, formatMoney, formatPct, formatPrice, genRangeSeries, trendColor } from './data';
import { t } from '@/i18n';

type RangeKey = '1H' | '1D' | '1W' | '1M' | '3M' | '1Y';

const CFG: Record<Exclude<RangeKey, '1H'>, { points: number; vol: number }> = {
    '1D': { points: 50, vol: 0.013 },
    '1W': { points: 56, vol: 0.022 },
    '1M': { points: 60, vol: 0.030 },
    '3M': { points: 66, vol: 0.040 },
    '1Y': { points: 72, vol: 0.055 },
};

function Marker({ fx, fy, label, color, above }: { fx: number; fy: number; label: string; color: string; above: boolean }) {
    return (
        <div className="absolute" style={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}>
            <span
                className="absolute block rounded-full border-2 border-base"
                style={{ width: 9, height: 9, background: color, left: 0, top: 0, transform: 'translate(-50%,-50%)' }}
            />
            <span
                className="absolute whitespace-nowrap text-[11px] font-semibold tabular-nums text-ios-gray"
                style={{ left: 0, top: above ? -13 : 13, transform: 'translate(-50%,-50%)' }}
            >
                {label}
            </span>
        </div>
    );
}

export function PriceChart({ asset, live }: { asset: Asset; live: Asset }) {
    const [range, setRange] = useState<RangeKey>('1D');
    const [hover, setHover] = useState<number | null>(null);

    const RANGES = [
        { key: '1H', label: t('stocks.range1H', '1H'), word: t('stocks.rangeHour', 'hour') },
        { key: '1D', label: t('stocks.range1D', '1D'), word: t('stocks.rangeDay', 'day') },
        { key: '1W', label: t('stocks.range1W', '1W'), word: t('stocks.rangeWeek', 'week') },
        { key: '1M', label: t('stocks.range1M', '1M'), word: t('stocks.rangeMonth', 'month') },
        { key: '3M', label: t('stocks.range3M', '3M'), word: t('stocks.range3Months', '3 months') },
        { key: '1Y', label: t('stocks.range1Y', '1Y'), word: t('stocks.rangeYear', 'year') },
    ] as const satisfies readonly { key: RangeKey; label: string; word: string }[];

    const series = range === '1H'
        ? (live.history.length > 1 ? live.history : [live.price, live.price])
        : genRangeSeries(asset.symbol, range, CFG[range].points, CFG[range].vol, asset.price);

    const n      = series.length;
    const first  = series[0];
    const last   = series[n - 1];
    const change = first ? (last - first) / first : 0;
    const color  = trendColor(change);
    const word   = RANGES.find(r => r.key === range)!.word;

    const W = 100, H = 40;
    const PAD = 0.12;
    const min = Math.min(...series), max = Math.max(...series), span = max - min || 1;
    const fx = (i: number) => (n > 1 ? i / (n - 1) : 0);
    const fy = (v: number) => PAD + (1 - (v - min) / span) * (1 - 2 * PAD);
    const line = series.map((v, i) => `${(fx(i) * W).toFixed(2)},${(fy(v) * H).toFixed(2)}`).join(' ');
    const baseY = fy(first) * H;

    const hiIdx = series.indexOf(max);
    const loIdx = series.indexOf(min);
    const lastIdx = n - 1;

    function onMove(e: React.PointerEvent) {
        const el = (e.target as HTMLElement).closest('[data-i]');
        if (!el) return;
        const i = Number(el.getAttribute('data-i'));
        if (!Number.isNaN(i)) setHover(i);
    }

    const hv = hover != null && hover >= 0 && hover < n ? hover : null;
    const tipLeft = hv != null ? Math.min(86, Math.max(14, fx(hv) * 100)) : 0;

    return (
        <div>
            <div className="mb-8 flex items-baseline gap-2">
                <span className="text-[19px] font-semibold tabular-nums" style={{ color }}>
                    {formatMoney(last - first, { showSign: true })} ({formatPct(change)})
                </span>
                <span className="text-[14px] text-ios-gray">{range === '1D' ? t('stocks.today', 'Today') : t('stocks.pastRange', 'Past {word}', { word })}</span>
            </div>

            <div data-testid="pricechart" className="relative w-full" style={{ height: 168 }}>
                <svg key={range} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full animate-fade-in">
                    <defs>
                        <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                            <stop offset="100%" stopColor={color} stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <polygon points={`0,${H} ${line} ${W},${H}`} fill="url(#pc-fill)" />
                    <line x1="0" y1={baseY} x2={W} y2={baseY} stroke={color} strokeOpacity="0.35" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
                    <polyline
                        points={line}
                        fill="none"
                        stroke={color}
                        strokeWidth="2.4"
                        vectorEffect="non-scaling-stroke"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>

                {hv == null && (
                    <div key={`m-${range}`} className="pointer-events-none absolute inset-0 animate-fade-in">
                        <Marker fx={fx(hiIdx)} fy={fy(max)} label={formatPrice(max)} color={color} above />
                        <Marker fx={fx(loIdx)} fy={fy(min)} label={formatPrice(min)} color={color} above={false} />
                        <div className="absolute" style={{ left: `${fx(lastIdx) * 100}%`, top: `${fy(last) * 100}%`, transform: 'translate(-50%,-50%)' }}>
                            <span className="block rounded-full" style={{ width: 11, height: 11, background: color, boxShadow: `0 0 0 4px ${color}33` }} />
                        </div>
                    </div>
                )}

                {hv != null && (
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute bottom-0 top-0 w-px bg-black/25 dark:bg-white/30" style={{ left: `${fx(hv) * 100}%` }} />
                        <div className="absolute" style={{ left: `${fx(hv) * 100}%`, top: `${fy(series[hv]) * 100}%`, transform: 'translate(-50%,-50%)' }}>
                            <span className="block rounded-full border-2 border-base" style={{ width: 13, height: 13, background: color }} />
                        </div>
                        <div className="absolute top-0 -translate-x-1/2 rounded-md bg-black/80 px-2.5 py-1 text-[15px] font-bold tabular-nums text-white" style={{ left: `${tipLeft}%` }}>
                            {formatPrice(series[hv])}
                        </div>
                    </div>
                )}

                <div
                    className="absolute inset-0 flex"
                    onPointerMove={onMove}
                    onPointerDown={onMove}
                    onPointerLeave={() => setHover(null)}
                    onPointerCancel={() => setHover(null)}
                >
                    {series.map((_, i) => <div key={i} data-i={i} className="h-full" style={{ flex: '1 1 0' }} />)}
                </div>
            </div>

            <div className="mt-6 flex justify-between">
                {RANGES.map(r => (
                    <button
                        key={r.key}
                        type="button"
                        onClick={() => setRange(r.key)}
                        className={`rounded-full px-3 py-2 text-[16px] font-semibold transition-colors ${range === r.key ? 'text-white' : 'text-ios-gray active:opacity-60'}`}
                        style={range === r.key ? { background: color } : undefined}
                    >
                        {r.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
