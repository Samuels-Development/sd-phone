import { useState } from 'react';

const ACCENT = '#6db4ff';
const W = 132;
const H = 30;
const PAD = 3;

export function Sparkline({ points, days, onHover }: {
    points:   number[];
    days?:    string[];
    onHover?: (index: number | null) => void;
}) {
    const [at, setAt] = useState<number | null>(null);

    if (points.length < 2) return <div style={{ width: W, height: H }} aria-hidden />;

    const top = Math.max(...points, 1);
    const step = (W - PAD * 2) / (points.length - 1);
    const x = (i: number) => PAD + i * step;
    const y = (v: number) => H - PAD - (v / top) * (H - PAD * 2);

    const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z`;

    const last = points.length - 1;
    const shown = at ?? last;

    function pick(e: React.PointerEvent<SVGSVGElement>) {
        const box = e.currentTarget.getBoundingClientRect();
        const rel = ((e.clientX - box.left) / box.width) * W;
        const i = Math.max(0, Math.min(last, Math.round((rel - PAD) / step)));
        setAt(i);
        onHover?.(i);
    }

    function clear() {
        setAt(null);
        onHover?.(null);
    }

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            className="overflow-visible"
            role="img"
            aria-label={days ? `${points.length} day trend, latest ${points[last]}` : undefined}
            onPointerMove={pick}
            onPointerLeave={clear}
        >
            <defs>
                <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
                </linearGradient>
            </defs>

            <path d={area} fill="url(#spark-fill)" />
            <path d={line} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {at !== null && (
                <line x1={x(at)} y1={0} x2={x(at)} y2={H} stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1" />
            )}

            <circle cx={x(shown)} cy={y(points[shown])} r="2.75" fill={ACCENT} stroke="#141416" strokeWidth="2" />
        </svg>
    );
}

export function TrendTile({ icon, label, value, points, days }: {
    icon:    React.ReactNode;
    label:   string;
    value:   number | undefined;
    points?: number[];
    days?:   string[];
}) {
    const [at, setAt] = useState<number | null>(null);
    const line = points ?? [];
    const last = line.length - 1;

    const today = line[last] ?? 0;
    const prior = line[last - 1] ?? 0;
    const delta = today - prior;

    const hovered = at !== null && days ? `${days[at]?.slice(5)} · ${line[at]?.toLocaleString()}` : null;

    return (
        <div className="rounded-xl bg-white/[0.035] px-4 py-3.5 ring-1 ring-white/[0.06]">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-zinc-400">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06]">{icon}</span>
                        <span className="truncate text-[11.5px] font-medium text-zinc-500">{label}</span>
                    </div>
                    <div className="mt-2 text-[22px] font-bold leading-none text-zinc-100 tabular-nums">
                        {value === undefined ? '—' : value.toLocaleString()}
                    </div>
                    <div className="mt-1 h-[15px] text-[11.5px] tabular-nums text-zinc-500">
                        {hovered ?? (line.length > 1
                            ? <span>{delta === 0 ? '—' : delta > 0 ? `▲ ${delta.toLocaleString()}` : `▼ ${Math.abs(delta).toLocaleString()}`} vs yesterday</span>
                            : null)}
                    </div>
                </div>
                {line.length > 1 && (
                    <div className="shrink-0 pt-1">
                        <Sparkline points={line} days={days} onHover={setAt} />
                    </div>
                )}
            </div>
        </div>
    );
}
