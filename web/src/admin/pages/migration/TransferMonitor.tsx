import { useMemo } from 'react';
import clsx from 'clsx';

import type { MigrationDomain, MigrationMark, MigrationSample, MigrationState } from '../../types';
import { comma, compact, duration } from './format';

interface Props {
    samples:  MigrationSample[];
    marks:    MigrationMark[];
    state:    MigrationState;
    plan:     MigrationDomain[];
    rate:     number;
    peak:     number;
    elapsed:  number;
    eta:      number | null;
    height:   number;
    started:  boolean;
    sourceTitle: string;
}

const VW = 1000;

const WINDOW_SECONDS = 180;

function ratePoints(samples: MigrationSample[]): { t: number; r: number }[] {
    const raw: { t: number; r: number }[] = [];
    for (let i = 1; i < samples.length; i++) {
        const dt = samples[i].t - samples[i - 1].t;
        if (dt <= 0) continue;
        raw.push({ t: samples[i].t, r: Math.max(0, (samples[i].rows - samples[i - 1].rows) / dt) });
    }
    return raw.map((p, i) => {
        const lo = Math.max(0, i - 2);
        const slice = raw.slice(lo, i + 1);
        return { t: p.t, r: slice.reduce((n, x) => n + x.r, 0) / slice.length };
    });
}

export function TransferMonitor({
    samples, marks, state, plan, rate, peak, elapsed, eta, height, started, sourceTitle,
}: Props) {
    const all = useMemo(() => ratePoints(samples), [samples]);
    const latest = all.length ? all[all.length - 1].t : 0;
    const origin = Math.max(all.length ? all[0].t : 0, latest - WINDOW_SECONDS);

    const points = useMemo(
        () => all.filter(p => p.t >= origin).map(p => ({ t: p.t - origin, r: p.r })),
        [all, origin],
    );

    const tMax = Math.max(points.length ? points[points.length - 1].t : 0, 1);
    const windowed = latest - origin > WINDOW_SECONDS - 1;

    const reading = state.currentStage === 'reading';

    const peakShown = useMemo(() => points.reduce((m, p) => Math.max(m, p.r), 0), [points]);
    const yMax = Math.max(peakShown * 1.18, 1);

    const labelled = useMemo(() => {
        const kept: MigrationMark[] = [];
        let lastPct = Number.POSITIVE_INFINITY;
        for (let i = marks.length - 1; i >= 0; i--) {
            const at = ((marks[i].t - origin) / tMax) * 100;
            if (at < -1 || lastPct - at < 9) continue;
            lastPct = at;
            kept.push({ ...marks[i], t: marks[i].t - origin });
        }
        return kept.reverse();
    }, [marks, tMax, origin]);

    const shiftedMarks = useMemo(
        () => marks.map(m => ({ ...m, t: m.t - origin })).filter(m => m.t >= 0),
        [marks, origin],
    );

    const { area, line } = useMemo(() => {
        if (points.length < 2) return { area: '', line: '' };
        const x = (t: number) => (t / tMax) * VW;
        const y = (r: number) => height - (r / yMax) * height;
        const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(2)},${y(p.r).toFixed(2)}`).join(' ');
        const last = x(points[points.length - 1].t).toFixed(2);
        const first = x(points[0].t).toFixed(2);
        return { area: `${d} L${last},${height} L${first},${height} Z`, line: d };
    }, [points, tMax, yMax, height]);

    if (!started) {
        const totalPlanned = plan.reduce((n, d) => n + d.rows, 0);
        const byWeight = plan.filter(d => d.rows > 0).sort((a, b) => b.rows - a.rows);
        return (
            <div className="p-4">
                <div className="mb-3 flex items-baseline justify-between gap-4">
                    <div>
                        <div className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                            Ready to move
                        </div>
                        <div className="mt-1 font-mono text-[26px] font-bold leading-none text-zinc-100 tabular-nums">
                            {comma(totalPlanned)}
                            <span className="ml-2 font-sf text-[13px] font-semibold text-zinc-500">rows</span>
                        </div>
                    </div>
                    <div className="text-right text-[12px] text-zinc-500">
                        across {plan.length} domain{plan.length === 1 ? '' : 's'}
                    </div>
                </div>

                {totalPlanned > 0 ? (
                    <>
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/[0.06]">
                            {byWeight.map((d, i) => (
                                <div
                                    key={d.key}
                                    title={`${d.label}: ${comma(d.rows)} rows`}
                                    style={{
                                        width:      `${(d.rows / totalPlanned) * 100}%`,
                                        background: `rgb(var(--ios-blue) / ${Math.max(0.28, 1 - i * 0.11).toFixed(2)})`,
                                    }}
                                />
                            ))}
                        </div>
                        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                            {byWeight.slice(0, 7).map((d, i) => (
                                <span key={d.key} className="flex items-center gap-1.5 text-[11.5px] text-zinc-400">
                                    <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ background: `rgb(var(--ios-blue) / ${Math.max(0.28, 1 - i * 0.11).toFixed(2)})` }}
                                    />
                                    {d.label}
                                    <span className="font-mono tabular-nums text-zinc-500">{compact(d.rows)}</span>
                                </span>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="rounded-lg bg-white/[0.03] px-3.5 py-3 text-[12.5px] text-zinc-400">
                        Nothing selected. Tick the domains you want and this fills in.
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                        Transfer rate
                        {reading && (
                            <span className="rounded bg-ios-blue/20 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-[#8ecbff]">
                                Reading {state.currentDomain ?? 'source'} from {sourceTitle}
                            </span>
                        )}
                        {state.currentStage === 'writing' && (state.writeTotal ?? 0) > 0 && (
                            <span className="rounded bg-ios-blue/20 px-1.5 py-0.5 font-mono text-[10px] normal-case tracking-normal text-[#8ecbff] tabular-nums">
                                Writing {compact(state.writeDone ?? 0)} / {compact(state.writeTotal ?? 0)}
                            </span>
                        )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                        <span className="font-mono text-[26px] font-bold leading-none text-ios-blue tabular-nums">
                            {comma(rate)}
                        </span>
                        <span className="text-[13px] font-semibold text-zinc-500">rows/sec</span>
                    </div>
                </div>
                <div className="flex gap-6 text-right">
                    <Readout label="Moved" value={comma(state.doneRows ?? 0)} />
                    <Readout label="Peak" value={`${comma(peak)}/s`} />
                    <Readout label="Elapsed" value={duration(elapsed)} />
                    <Readout label="Remaining" value={eta !== null ? duration(eta) : '—'} />
                </div>
            </div>

            <div className="relative w-full overflow-hidden rounded-lg bg-black/30 ring-1 ring-white/[0.05]" style={{ height }}>
                <svg
                    width="100%"
                    height={height}
                    viewBox={`0 0 ${VW} ${height}`}
                    preserveAspectRatio="none"
                    aria-hidden
                    className="absolute inset-0"
                >
                    <defs>
                        <linearGradient id="mig-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="rgb(var(--ios-blue) / 0.42)" />
                            <stop offset="100%" stopColor="rgb(var(--ios-blue) / 0.02)" />
                        </linearGradient>
                    </defs>

                    {[0.25, 0.5, 0.75].map(f => (
                        <line
                            key={f}
                            x1="0" x2={VW}
                            y1={height * f} y2={height * f}
                            stroke="rgb(255 255 255 / 0.05)"
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}

                    {shiftedMarks.map(m => (
                        <line
                            key={`${m.key}-${m.t}`}
                            x1={(m.t / tMax) * VW} x2={(m.t / tMax) * VW}
                            y1="0" y2={height}
                            stroke="rgb(255 255 255 / 0.14)"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                            vectorEffect="non-scaling-stroke"
                        />
                    ))}

                    {area && <path d={area} fill="url(#mig-fill)" />}
                    {line && (
                        <path
                            d={line}
                            fill="none"
                            stroke="rgb(var(--ios-blue))"
                            strokeWidth="2"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                        />
                    )}
                </svg>

                {labelled.map(m => {
                    const at = (m.t / tMax) * 100;
                    const flip = at > 76;
                    const live = m.key === state.currentDomain;
                    return (
                        <span
                            key={`${m.key}-label`}
                            className={clsx(
                                'pointer-events-none absolute top-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                                live ? 'bg-ios-blue/25 text-[#8ecbff]' : 'bg-black/60 text-zinc-400',
                            )}
                            style={flip
                                ? { right: `calc(${(100 - at).toFixed(2)}% + 4px)` }
                                : { left: `calc(${at.toFixed(2)}% + 4px)` }}
                        >
                            {m.key}
                        </span>
                    );
                })}

                {points.length < 2 && (
                    <div className="absolute inset-0 flex items-center justify-center text-[12px] text-zinc-600">
                        {reading
                            ? `Reading ${state.currentDomain ?? 'source'} rows, nothing written yet`
                            : 'Measuring throughput...'}
                    </div>
                )}

                <span className="pointer-events-none absolute bottom-1.5 right-2 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 tabular-nums">
                    {windowed ? `last ${WINDOW_SECONDS / 60}m · ` : ''}{compact(yMax)}/s full scale
                </span>
            </div>
        </div>
    );
}

function Readout({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-zinc-500">{label}</div>
            <div className={clsx('mt-0.5 font-mono text-[13.5px] font-semibold text-zinc-200 tabular-nums')}>{value}</div>
        </div>
    );
}
