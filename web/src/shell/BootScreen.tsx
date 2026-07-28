import { useEffect, useState } from 'react';

import logoUrl from '@/assets/logo.png';
import { useBatteryStore } from '@/stores/batteryStore';

const FADE_OUT_MS = 620;

const RING = 128;
const CIRC = 2 * Math.PI * RING;

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
        <div className={`absolute inset-0 z-[70] flex flex-col items-center justify-center bg-black ${leaving ? 'animate-boot-out' : ''}`}>
            <div className="relative flex h-[320px] w-[320px] items-center justify-center">
                <div
                    className="absolute h-[300px] w-[300px] rounded-full animate-boot-glow"
                    style={{ background: 'radial-gradient(circle, rgba(120,240,255,0.16) 0%, rgba(120,240,255,0.05) 42%, rgba(0,0,0,0) 68%)' }}
                />

                <svg className="absolute h-[320px] w-[320px] -rotate-90" viewBox="0 0 320 320" fill="none" aria-hidden>
                    <circle cx="160" cy="160" r={RING} stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                    <circle
                        cx="160" cy="160" r={RING}
                        stroke="url(#bootTrace)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={CIRC}
                        className="animate-boot-trace"
                        style={{ ['--boot-circ' as string]: `${CIRC}`, animationDuration: `${barSeconds}s` }}
                    />
                    <defs>
                        <linearGradient id="bootTrace" x1="0" y1="0" x2="320" y2="320" gradientUnits="userSpaceOnUse">
                            <stop offset="0%"   stopColor="#f7f560" />
                            <stop offset="100%" stopColor="#7ef0f5" />
                        </linearGradient>
                    </defs>
                </svg>

                <img
                    src={logoUrl}
                    alt=""
                    className="relative h-[196px] w-[196px] animate-boot-logo select-none"
                    draggable={false}
                />
            </div>
        </div>
    );
}
