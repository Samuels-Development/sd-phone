import { useEffect, useState } from 'react';

import { useDeckActive } from '@/shell/deckActive';
import { useTheme } from '@/stores/themeStore';
import { formatClockTime } from '@/lib/time';
import { getOffsetLabel, getZoneTime, WORLD_CITIES } from './data';

export function WorldClock() {
    const { hour24 } = useTheme('hour24');
    const active = useDeckActive();
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        if (!active) return;
        setNow(new Date());
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, [active]);

    return (
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4">
            <div className="space-y-3">
                {WORLD_CITIES.map(city => {
                    const t     = getZoneTime(city.timezone, now);
                    const label = getOffsetLabel(city.timezone, now);
                    const zoneClock = new Date();
                    zoneClock.setHours(t.hours24, t.minutes, t.seconds, 0);
                    return (
                        <div
                            key={city.id}
                            className="flex items-center justify-between gap-3 rounded-[20px] bg-white/55 px-5 py-5 dark:bg-white/[0.08]"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[27px] font-normal leading-tight text-black dark:text-white">
                                    {city.city}
                                </div>
                                <div className="mt-1 text-[15px] font-medium text-ios-gray">{label}</div>
                            </div>
                            <div
                                className="flex shrink-0 items-baseline gap-1.5 tabular-nums text-black dark:text-white"
                                style={{ fontWeight: 300 }}
                            >
                                <span className="text-[48px] leading-none">
                                    {formatClockTime(zoneClock, hour24)}
                                </span>
                                {!hour24 && <span className="text-[18px] font-normal leading-none">{t.ampm}</span>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
