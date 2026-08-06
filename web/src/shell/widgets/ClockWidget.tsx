import type { WidgetAlign, WidgetSize, WidgetTheme } from '@/apps/appstore/appsApi';
import { formatClockTime, formatLongDate, useDisplayClock } from '@/hooks/useClock';
import { t } from '@/i18n';
import { useTheme } from '@/stores/themeStore';
import { WidgetTile, alignClasses, palette } from './WidgetTile';

const DIAL_DARK  = 'radial-gradient(115% 95% at 50% 6%, #232327 0%, #131316 58%, #08080a 100%)';
const DIAL_LIGHT = 'radial-gradient(115% 95% at 50% 6%, #ffffff 0%, #f3f3f6 58%, #e7e7ec 100%)';
const DIAL_GLASS = 'radial-gradient(115% 95% at 50% 6%, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.10) 58%, rgba(255,255,255,0.15) 100%)';

const ACCENT = '#ff9f0a';

const CITY = () => t('weather.losSantos', 'Los Santos');

function Face({ d, showDate, light }: { d: Date; showDate: boolean; light: boolean }) {
    const hour = d.getHours() % 12;
    const min  = d.getMinutes();
    const sec  = d.getSeconds();

    const hDeg = hour * 30 + min * 0.5;
    const mDeg = min * 6 + sec * 0.1;
    const sDeg = sec * 6;

    const ink   = light ? '#0b0b0d' : '#ffffff';
    const tick  = light ? 'rgba(11,11,13,0.72)' : 'rgba(255,255,255,0.75)';
    const well  = light ? 'rgba(11,11,13,0.03)' : 'rgba(255,255,255,0.04)';
    const edge  = light ? 'rgba(11,11,13,0.10)' : 'rgba(255,255,255,0.10)';
    const stamp = light ? 'rgba(11,11,13,0.45)' : 'rgba(255,255,255,0.5)';

    return (
        <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
            <circle cx="50" cy="50" r="48" fill={well} stroke={edge} strokeWidth="1" />
            {Array.from({ length: 12 }, (_, i) => {
                const a = (i * 30 * Math.PI) / 180;
                const major = i % 3 === 0;
                const r1 = major ? 36 : 40;
                return (
                    <line
                        key={i}
                        x1={50 + r1 * Math.sin(a)} y1={50 - r1 * Math.cos(a)}
                        x2={50 + 44 * Math.sin(a)} y2={50 - 44 * Math.cos(a)}
                        stroke={tick}
                        strokeWidth={major ? 2.6 : 1.4}
                        strokeLinecap="round"
                    />
                );
            })}
            <g transform={`rotate(${hDeg} 50 50)`}>
                <line x1="50" y1="52" x2="50" y2="27" stroke={ink} strokeWidth="4.6" strokeLinecap="round" />
            </g>
            <g transform={`rotate(${mDeg} 50 50)`}>
                <line x1="50" y1="54" x2="50" y2="16" stroke={ink} strokeWidth="3.2" strokeLinecap="round" />
            </g>
            <g transform={`rotate(${sDeg} 50 50)`}>
                <line x1="50" y1="58" x2="50" y2="14" stroke={ACCENT} strokeWidth="1.6" strokeLinecap="round" />
            </g>
            <circle cx="50" cy="50" r="3" fill={ACCENT} />
            <circle cx="50" cy="50" r="1.3" fill={light ? '#ffffff' : '#1c1c1e'} />
            {showDate && <text x="50" y="70" textAnchor="middle" fill={stamp} fontSize="7" fontWeight="600">{d.getDate()}</text>}
        </svg>
    );
}

export function ClockWidget({ size, width, height, align = 'left', theme = 'dark', digital = false }: {
    size: WidgetSize; width: number; height: number;
    align?: WidgetAlign; theme?: WidgetTheme; digital?: boolean;
}) {
    const al = alignClasses(align);
    const d = useDisplayClock('second');
    const { hour24 } = useTheme('hour24');

    const p     = palette(theme);
    const light = theme === 'light';
    const isGlass = theme === 'glass';
    const dial  = isGlass ? DIAL_GLASS : light ? DIAL_LIGHT : DIAL_DARK;

    const time = formatClockTime(d, hour24);
    const secs = String(d.getSeconds()).padStart(2, '0');
    const date = formatLongDate(d);

    if (digital) {
        const timePx = size === 'sm' ? 44 : size === 'md' ? 74 : 104;
        const cityPx = size === 'sm' ? 12 : size === 'md' ? 17 : 21;
        const datePx = size === 'sm' ? 11 : size === 'md' ? 15 : 19;

        return (
            <WidgetTile width={width} height={height} radius={size === 'sm' ? 22 : 26} tint={dial} glass={isGlass} hairline={false}>
                <div className={`flex h-full w-full flex-col justify-center p-4 ${al}`} style={{ color: p.fg }}>
                    <div className="truncate font-semibold leading-tight" style={{ fontSize: cityPx, color: p.sub }}>
                        {CITY()}
                    </div>
                    <div className="flex items-baseline gap-1.5">
                        <span className="font-light leading-none tabular-nums tracking-tight" style={{ fontSize: timePx }}>
                            {time}
                        </span>
                        {size !== 'sm' && (
                            <span className="font-medium leading-none tabular-nums" style={{ fontSize: timePx * 0.34, color: ACCENT }}>
                                {secs}
                            </span>
                        )}
                    </div>
                    <div className="mt-1 truncate leading-tight" style={{ fontSize: datePx, color: p.sub }}>
                        {date}
                    </div>
                </div>
            </WidgetTile>
        );
    }

    if (size === 'sm') {
        return (
            <WidgetTile width={width} height={height} radius={22} tint={dial} glass={isGlass} hairline={false}>
                <div className="h-full w-full p-3.5">
                    <Face d={d} showDate={false} light={light} />
                </div>
            </WidgetTile>
        );
    }

    if (size === 'lg') {
        return (
            <WidgetTile width={width} height={height} radius={28} tint={dial} glass={isGlass} hairline={false}>
                <div className="flex h-full w-full flex-col items-center gap-3 p-5" style={{ color: p.fg }}>
                    <div className="min-h-0 flex-1" style={{ aspectRatio: '1 / 1' }}>
                        <Face d={d} showDate light={light} />
                    </div>
                    <div className={`flex w-full flex-col ${al}`}>
                        <div className="truncate text-[21px] font-semibold leading-tight">{CITY()}</div>
                        <div className="text-[34px] font-light leading-none tabular-nums tracking-tight">{time}</div>
                        <div className="mt-1.5 truncate text-[16px] leading-tight" style={{ color: p.sub }}>{date}</div>
                    </div>
                </div>
            </WidgetTile>
        );
    }

    return (
        <WidgetTile width={width} height={height} radius={26} tint={dial} glass={isGlass} hairline={false}>
            <div className="flex h-full w-full items-center gap-4 p-4">
                <div className="h-full shrink-0 py-1" style={{ aspectRatio: '1 / 1' }}>
                    <Face d={d} showDate light={light} />
                </div>
                <div className={`flex min-w-0 flex-1 flex-col ${al}`} style={{ color: p.fg }}>
                    <div className="truncate text-[17px] font-semibold leading-tight">{CITY()}</div>
                    <div className="mt-0.5 text-[42px] font-light leading-none tabular-nums tracking-tight">{time}</div>
                    <div className="mt-1.5 truncate text-[14px] leading-tight" style={{ color: p.sub }}>{date}</div>
                </div>
            </div>
        </WidgetTile>
    );
}
