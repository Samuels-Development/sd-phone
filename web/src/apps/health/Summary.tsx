import { useRef } from 'react';
import type { ReactNode } from 'react';
import { Activity, Footprints, Heart, MoonStar, Route } from 'lucide-react';

import { getLocaleTag, t } from '@/i18n';
import type { HealthDay, HealthSummary } from './healthApi';

const M_PER_MILE = 1609.34;
const RING = 176;
const RING_STROKE = 16;

const ACCENT = {
    steps:    '#FB8C00',
    distance: '#1E90FF',
    heart:    '#FF2D55',
    awake:    '#7C3AED',
    active:   '#34C759',
} as const;

export function Summary({ summary, pendingSteps, pendingDistanceM, pendingActiveMs, hr, awakeMs }: {
    summary:          HealthSummary | null;
    pendingSteps:     number;
    pendingDistanceM: number;
    pendingActiveMs:  number;
    hr:               number;
    awakeMs:          number;
}) {
    const goal    = summary?.goal ?? 10000;
    const peakRef = useRef({ steps: 0, metres: 0, active: 0 });

    const rawSteps  = (summary?.today.steps ?? 0) + pendingSteps;
    const rawMetres = (summary?.today.distanceM ?? 0) + pendingDistanceM;
    const rawActive = (summary?.today.activeMs ?? 0) + pendingActiveMs;

    peakRef.current.steps  = Math.max(peakRef.current.steps, rawSteps);
    peakRef.current.metres = Math.max(peakRef.current.metres, rawMetres);
    peakRef.current.active = Math.max(peakRef.current.active, rawActive);
    const steps   = peakRef.current.steps;
    const metres  = peakRef.current.metres;
    const active  = peakRef.current.active;
    const history = summary?.history ?? [];

    return (
        <div className="px-3 pb-4 pt-1">
            <StepRing steps={steps} goal={goal} />

            {history.length > 0 && (
                <WeekChart
                    history={history.map((d, i) => (i === history.length - 1 ? { ...d, steps } : d))}
                    goal={goal}
                />
            )}

            <div className="mt-2 grid grid-cols-2 gap-2">
                <Metric
                    accent={ACCENT.distance}
                    icon={<Route className="h-[17px] w-[17px]" strokeWidth={2.5} />}
                    title={t('health.distance', 'Distance')}
                    value={(metres / M_PER_MILE).toFixed(2)}
                    unit={t('health.miUnit', 'mi')}
                />
                <Metric
                    accent={ACCENT.heart}
                    icon={<Heart className="h-[17px] w-[17px]" strokeWidth={2.5} />}
                    title={t('health.heartRate', 'Heart Rate')}
                    value={hr > 0 ? String(hr) : '0'}
                    unit={t('health.bpmUnit', 'BPM')}
                    pulse={hr > 0 ? hr : undefined}
                />
                <Metric
                    accent={ACCENT.active}
                    icon={<Activity className="h-[17px] w-[17px]" strokeWidth={2.5} />}
                    title={t('health.activeTime', 'Active Time')}
                    value={formatMinutes(active)}
                    unit={t('health.minUnit', 'min')}
                />
                <Metric
                    accent={ACCENT.awake}
                    icon={<MoonStar className="h-[17px] w-[17px]" strokeWidth={2.5} />}
                    title={t('health.timeAwake', 'Time Awake')}
                    value={formatAwake(awakeMs)}
                    unit=""
                />
            </div>
        </div>
    );
}

function StepRing({ steps, goal }: { steps: number; goal: number }) {
    const pct    = Math.max(0, Math.min(1, goal > 0 ? steps / goal : 0));
    const r      = (RING - RING_STROKE) / 2;
    const circ   = 2 * Math.PI * r;
    const offset = circ * (1 - pct);
    const hit    = steps >= goal;

    return (
        <div className="flex flex-col items-center rounded-[18px] bg-surface px-4 py-4">
            <div className="relative" style={{ width: RING, height: RING }}>
                <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} style={{ transform: 'rotate(-90deg)' }}>
                    <circle
                        cx={RING / 2} cy={RING / 2} r={r} fill="none"
                        stroke={ACCENT.steps} strokeOpacity={0.18} strokeWidth={RING_STROKE}
                    />
                    <circle
                        cx={RING / 2} cy={RING / 2} r={r} fill="none"
                        stroke={ACCENT.steps} strokeWidth={RING_STROKE} strokeLinecap="round"
                        strokeDasharray={circ} strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.32,0.72,0,1)' }}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <Footprints className="h-[22px] w-[22px]" strokeWidth={2.4} style={{ color: ACCENT.steps }} />
                    <span className="mt-1 text-[44px] font-bold leading-none tabular-nums">
                        {steps.toLocaleString()}
                    </span>
                    <span className="mt-1.5 text-[15px] font-medium text-ios-gray">
                        {t('health.goalOf', 'of {goal}', { goal: goal.toLocaleString() })}
                    </span>
                </div>
            </div>
            <div className="mt-3 text-[16px] font-semibold" style={{ color: hit ? ACCENT.active : ACCENT.steps }}>
                {hit
                    ? t('health.goalHit', 'Daily goal reached')
                    : t('health.goalLeft', '{n} steps to go', { n: (goal - steps).toLocaleString() })}
            </div>
        </div>
    );
}

function WeekChart({ history, goal }: { history: HealthDay[]; goal: number }) {
    const peak = Math.max(goal, ...history.map(d => d.steps), 1);

    return (
        <div className="mt-2 rounded-[18px] bg-surface px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-[17px] font-semibold" style={{ color: ACCENT.steps }}>
                <Footprints className="h-[17px] w-[17px]" strokeWidth={2.5} />
                <span>{t('health.last7Days', 'Last 7 Days')}</span>
            </div>

            <div className="mt-3 flex h-[100px] items-end gap-1.5">
                {history.map((day, i) => {
                    const today = i === history.length - 1;
                    return (
                        <div key={day.day} className="flex flex-1 flex-col items-center gap-1.5">
                            <div className="flex w-full flex-1 items-end">
                                <div
                                    className="w-full rounded-[4px]"
                                    style={{
                                        height:     `${Math.max(2, (day.steps / peak) * 100)}%`,
                                        background: ACCENT.steps,
                                        opacity:    today ? 1 : 0.35,
                                        transition: 'height 0.5s cubic-bezier(0.32,0.72,0,1)',
                                    }}
                                />
                            </div>
                            <span className={`text-[12px] tabular-nums ${today ? 'font-bold' : 'text-ios-gray'}`}>
                                {weekday(day.day)}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="mt-2.5 flex items-baseline justify-between border-t border-black/5 pt-3 dark:border-white/10">
                <span className="text-[15px] text-ios-gray">{t('health.dailyAverage', 'Daily average')}</span>
                <span className="text-[20px] font-semibold tabular-nums">
                    {Math.round(history.reduce((sum, d) => sum + d.steps, 0) / Math.max(1, history.length)).toLocaleString()}
                </span>
            </div>
        </div>
    );
}

function Metric({ accent, icon, title, value, unit, pulse }: {
    accent: string;
    icon:   ReactNode;
    title:  string;
    value:  string;
    unit:   string;
    pulse?: number;
}) {
    return (
        <div className="rounded-[16px] bg-surface p-3">
            <div className="flex items-center gap-1.5 text-[15px] font-semibold" style={{ color: accent }}>
                <span className="flex h-[18px] w-[18px] items-center justify-center">{icon}</span>
                <span className="truncate">{title}</span>
            </div>
            <div className="mt-2 flex items-end gap-1">
                <span className="text-[30px] font-semibold leading-none tabular-nums">{value}</span>
                {unit && <span className="text-[15px] font-medium text-ios-gray">{unit}</span>}
                {pulse !== undefined && <HeartPulse hr={pulse} />}
            </div>
        </div>
    );
}

function HeartPulse({ hr }: { hr: number }) {
    return (
        <span
            className="ml-auto inline-block"
            style={{ animation: `sdph-pulse ${(60 / Math.max(30, hr)).toFixed(2)}s ease-in-out infinite` }}
        >
            <Heart className="h-[18px] w-[18px]" fill={ACCENT.heart} color={ACCENT.heart} strokeWidth={0} />
        </span>
    );
}

function weekday(iso: string): string {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(getLocaleTag(), { weekday: 'narrow' });
}

function formatMinutes(ms: number): string {
    return String(Math.floor(ms / 60000));
}

function formatAwake(ms: number): string {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return t('health.awakeHm', '{h}h {m}m', { h, m });
    const s = total % 60;
    return t('health.awakeMs', '{m}m {s}s', { m, s: s.toString().padStart(2, '0') });
}
