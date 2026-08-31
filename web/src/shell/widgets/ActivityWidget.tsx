import { Footprints, Heart, Route } from 'lucide-react';

import type { WidgetSize, WidgetTheme } from '@/apps/appstore/appsApi';
import { t } from '@/i18n';
import { useWidgetData } from '@/stores/widgetDataStore';
import { WidgetTile, palette } from './WidgetTile';

const FITNESS_DARK  = 'radial-gradient(120% 90% at 50% 8%, #26262a 0%, #17171a 62%, #101012 100%)';
const FITNESS_LIGHT = 'radial-gradient(120% 90% at 50% 8%, #ffffff 0%, #f4f4f7 62%, #eaeaef 100%)';
const FITNESS_GLASS = 'radial-gradient(120% 90% at 50% 8%, rgba(255,255,255,0.20) 0%, rgba(10,10,11,0.28) 62%, rgba(10,10,11,0.38) 100%)';

const STEP_GOAL = 10_000;
const DIST_GOAL = 8_000;
const RINGS = [
    { key: 'steps', color: '#ff375f', track: 'rgba(255,55,95,0.22)' },
    { key: 'dist',  color: '#a3f930', track: 'rgba(163,249,48,0.22)' },
    { key: 'hr',    color: '#04d3ec', track: 'rgba(4,211,236,0.22)' },
] as const;

function Rings({ size, values }: { size: number; values: [number, number, number] }) {
    const stroke = Math.max(5, Math.round(size * 0.085));
    const gap    = Math.round(stroke * 0.55);
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
            {RINGS.map((ring, i) => {
                const r = size / 2 - stroke / 2 - i * (stroke + gap);
                if (r <= stroke) return null;
                const circ = 2 * Math.PI * r;
                const pct  = Math.max(0, Math.min(1, values[i]));
                return (
                    <g key={ring.key} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.track} strokeWidth={stroke} />
                        <circle
                            cx={size / 2} cy={size / 2} r={r}
                            fill="none" stroke={ring.color} strokeWidth={stroke} strokeLinecap="round"
                            strokeDasharray={circ}
                            strokeDashoffset={circ * (1 - pct)}
                            style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.3,0.8,0.35,1)' }}
                        />
                    </g>
                );
            })}
        </svg>
    );
}

function Stat({ icon: Icon, value, unit, color, fg }: {
    icon: typeof Footprints; value: string; unit: string; color: string; fg: string;
}) {
    return (
        <div className="min-w-0">
            <div className="flex items-center gap-1">
                <Icon className="h-[11px] w-[11px] shrink-0" strokeWidth={2.6} style={{ color }} />
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color }}>{unit}</span>
            </div>
            <div className="text-[17px] font-semibold leading-tight tabular-nums" style={{ color: fg }}>{value}</div>
        </div>
    );
}

export function ActivityWidget({ size, width, height, theme = 'dark' }: {
    size: WidgetSize; width: number; height: number; theme?: WidgetTheme;
}) {
    const health = useWidgetData(s => s.health);
    const p  = palette(theme);
    const isGlass = theme === 'glass';
    const bg = isGlass ? FITNESS_GLASS : theme === 'light' ? FITNESS_LIGHT : FITNESS_DARK;

    const steps = health?.steps ?? 0;
    const dist  = health?.distanceM ?? 0;
    const hr    = health?.heartRate ?? 0;

    const values: [number, number, number] = [steps / STEP_GOAL, dist / DIST_GOAL, hr / 180];

    const km = (dist / 1000).toFixed(2);

    if (size === 'sm') {
        const ring = Math.min(width, height) - 44;
        return (
            <WidgetTile width={width} height={height} radius={22} tint={bg} glass={isGlass} hairline={false}>
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 p-3">
                    <Rings size={ring} values={values} />
                    <div className="text-[12px] font-semibold tabular-nums" style={{ color: p.fg }}>
                        {steps.toLocaleString()}
                        <span className="ml-1 text-[10px] font-medium" style={{ color: p.sub }}>{t('health.stepsUnit', 'steps')}</span>
                    </div>
                </div>
            </WidgetTile>
        );
    }

    const ring = height - 44;
    return (
        <WidgetTile width={width} height={height} radius={26} tint={bg} glass={isGlass} hairline={false}>
            <div className={`flex h-full w-full gap-4 p-4 ${size === 'lg' ? 'flex-col items-center' : 'items-center'}`}>
                <Rings size={size === 'lg' ? Math.min(width - 60, height * 0.52) : ring} values={values} />
                <div className={`flex min-w-0 flex-1 flex-col justify-center gap-2.5 ${size === 'lg' ? 'w-full flex-row justify-around' : ''}`}>
                    <Stat icon={Footprints} color="#ff375f" fg={p.fg} unit={t('health.steps', 'Steps')} value={steps.toLocaleString()} />
                    <Stat icon={Route}      color="#a3f930" fg={p.fg} unit={t('health.distance', 'Distance')} value={t('health.kmValue', '{n} km', { n: km })} />
                    <Stat icon={Heart}      color="#04d3ec" fg={p.fg} unit={t('health.heart', 'Heart')} value={hr ? t('health.bpmValue', '{n} bpm', { n: hr }) : '—'} />
                </div>
            </div>
        </WidgetTile>
    );
}
