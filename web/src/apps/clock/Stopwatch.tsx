import { useEffect, useReducer } from 'react';

import { t } from '@/i18n';
import { useDeckActive } from '@/shell/deckActive';
import { fmtStopwatch } from './data';
import { swElapsed, swLap, swReset, swStart, swStop, useStopwatch } from '@/stores/stopwatchStore';


export function Stopwatch({ isDark }: { isDark: boolean }) {
    const { running, laps } = useStopwatch();
    const [, tick] = useReducer((n: number) => n + 1, 0);
    const active = useDeckActive();

    useEffect(() => {
        if (!running || !active) return;
        tick();
        const id = window.setInterval(tick, 33);
        return () => window.clearInterval(id);
    }, [running, active]);

    const elapsed = swElapsed();
    const { main, cents } = fmtStopwatch(elapsed);

    const lapTimes = laps.map(l => l.lapMs);
    const bestMs   = lapTimes.length > 1 ? Math.min(...lapTimes) : -1;
    const worstMs  = lapTimes.length > 1 ? Math.max(...lapTimes) : -1;

    return (
        <div className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0" style={{ height: 56 }} />

            <div dir="ltr" className="shrink-0 flex items-baseline justify-center" style={{ paddingBottom: 8, paddingInlineStart: 20, paddingInlineEnd: 20 }}>
                <span className="tabular-nums text-black dark:text-white leading-none" style={{ fontSize: 86, fontWeight: 100, letterSpacing: '-0.03em' }}>
                    {main}
                </span>
                <span className="tabular-nums text-black dark:text-white leading-none" style={{ fontSize: 86, fontWeight: 100, letterSpacing: '-0.03em', opacity: 0.85 }}>
                    .{cents}
                </span>
            </div>

            <div className="shrink-0 flex items-center justify-between px-12 pb-5 pt-12">
                <SwBtn
                    label={running ? t('clock.lap', 'Lap') : t('clock.reset', 'Reset')}
                    onClick={running ? swLap : swReset}
                    disabled={!running && elapsed === 0}
                    variant="gray"
                    isDark={isDark}
                />
                <SwBtn
                    label={running ? t('clock.stop', 'Stop') : t('clock.start', 'Start')}
                    onClick={running ? swStop : swStart}
                    variant={running ? 'red' : 'green'}
                    isDark={isDark}
                />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-4">
                <div className="overflow-hidden rounded-[14px] bg-white/55 dark:bg-white/[0.08]">
                    <div className="grid grid-cols-3 px-4 pb-2 pt-3.5 text-[15px] font-medium text-ios-gray">
                        <span className="text-center">{t('clock.lap', 'Lap')}</span>
                        <span className="text-center">{t('clock.time', 'Time')}</span>
                        <span className="text-center">{t('clock.total', 'Total')}</span>
                    </div>
                    {laps.length === 0 ? (
                        <div
                            className="py-3 text-center text-[18px] text-ios-gray"
                            style={{ borderTop: `0.5px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)'}` }}
                        >
                            {t('clock.noLaps', 'No laps')}
                        </div>
                    ) : (
                        laps.map(l => (
                            <LapRow
                                key={l.index}
                                index={l.index}
                                lapMs={l.lapMs}
                                totalMs={l.totalMs}
                                color={l.lapMs === bestMs ? 'best' : l.lapMs === worstMs ? 'worst' : 'default'}
                                isDark={isDark}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}


function SwBtn({ label, onClick, variant, disabled = false, isDark }: {
    label:    string;
    onClick:  () => void;
    variant:  'green' | 'red' | 'gray';
    disabled?: boolean;
    isDark:   boolean;
}) {
    const bg = disabled           ? (isDark ? 'rgb(var(--surface))' : '#E4E4EA')
             : variant === 'green' ? (isDark ? '#1A3D20' : '#D6F2DD')
             : variant === 'red'   ? (isDark ? '#3D1A1A' : '#FBD9D6')
             :                       (isDark ? 'rgb(var(--elevated))' : '#E4E4EA');
    const fg = disabled           ? (isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)')
             : variant === 'green' ? (isDark ? '#30D158' : '#34C759')
             : variant === 'red'   ? (isDark ? '#FF453A' : '#FF3B30')
             :                       (isDark ? '#FFFFFF' : '#000000');

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="flex items-center justify-center rounded-full active:opacity-60 transition-opacity"
            style={{ width: 76, height: 76, background: bg }}
        >
            <span style={{ fontSize: 17, fontWeight: 600, color: fg }}>{label}</span>
        </button>
    );
}


function LapRow({ index, lapMs, totalMs, color, isDark }: {
    index:   number;
    lapMs:   number;
    totalMs: number;
    color:   'best' | 'worst' | 'default';
    isDark:  boolean;
}) {
    const lap = fmtStopwatch(lapMs);
    const tot = fmtStopwatch(totalMs);
    const col = color === 'best'  ? (isDark ? '#30D158' : '#34C759')
              : color === 'worst' ? (isDark ? '#FF453A' : '#FF3B30')
              :                      (isDark ? '#FFFFFF' : '#000000');
    return (
        <div
            className="animate-lap-in grid grid-cols-3 px-4 py-3 tabular-nums text-[18px]"
            style={{ color: col, borderTop: `0.5px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)'}` }}
        >
            <span className="text-center">{index}</span>
            <span className="text-center">{lap.main}.{lap.cents}</span>
            <span className="text-center">{tot.main}.{tot.cents}</span>
        </div>
    );
}
