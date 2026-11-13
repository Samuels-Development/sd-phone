import { useEffect, useState } from 'react';

import { gameClockDate, useGameClockStore } from '@/stores/gameClockStore';
import { useTheme } from '@/stores/themeStore';

export { formatClockTime, formatLongDate } from '@/lib/time';

export function useClock(granularity: 'minute' | 'second' = 'minute'): Date {
    const [now, setNow] = useState<Date>(() => new Date());

    useEffect(() => {
        if (granularity === 'second') {
            const handle = window.setInterval(() => setNow(new Date()), 1000);
            return () => window.clearInterval(handle);
        }
        let handle: number;
        const arm = () => {
            const d = new Date();
            setNow(d);
            handle = window.setTimeout(arm, 60_050 - (d.getSeconds() * 1000 + d.getMilliseconds()));
        };
        arm();
        return () => window.clearTimeout(handle);
    }, [granularity]);

    return now;
}

export function useDisplayClock(granularity: 'minute' | 'second' = 'minute'): Date {
    const real = useClock(granularity);
    const gameTime = useTheme('gameTime').gameTime;
    const clock = useGameClockStore(s => s.clock);
    return gameTime && clock ? gameClockDate(clock, real) : real;
}
