import { useEffect, useState } from 'react';

import logoUrl from '@/assets/logo.png';
import { useBatteryStore } from '@/stores/batteryStore';

const FADE_OUT_MS = 620;

export function BootScreen({ seconds }: { seconds: number }) {
    const [leaving, setLeaving] = useState(false);

    useEffect(() => {
        const total = Math.max(1.5, seconds) * 1000;
        const out = window.setTimeout(() => setLeaving(true), total);
        const done = window.setTimeout(() => useBatteryStore.getState().setBooting(null), total + FADE_OUT_MS);
        return () => { window.clearTimeout(out); window.clearTimeout(done); };
    }, [seconds]);

    const barSeconds = Math.max(1.5, seconds) - 0.7;

    return (
        <div
            className={`absolute inset-0 z-[70] flex flex-col items-center justify-center bg-black ${leaving ? 'animate-boot-out' : ''}`}
        >
            <img
                src={logoUrl}
                alt=""
                className="h-[128px] w-[128px] animate-boot-logo select-none"
                draggable={false}
            />

            <div className="absolute bottom-[128px] h-[5px] w-[168px] overflow-hidden rounded-full bg-white/15">
                <div
                    className="h-full rounded-full bg-white animate-boot-bar"
                    style={{ animationDuration: `${barSeconds}s` }}
                />
            </div>
        </div>
    );
}
