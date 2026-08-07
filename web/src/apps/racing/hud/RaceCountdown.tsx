import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { fetchNui } from '@/core/nui';

type Phase = 'counting' | 'go';

const TICK_MS  = 50;
const GO_MS    = 1100;
const RING_PX  = 220;
const TRACK_R  = 44;
const CIRC     = 2 * Math.PI * TRACK_R;
const GO_COLOR = '#22e06a';

export function RaceCountdown({ from, onDone }: { from: number; onDone: () => void }) {
    const seconds = Math.min(10, Math.max(1, Math.floor(from) || 3));
    const endsAt  = useRef(performance.now() + seconds * 1000);
    const lastNum = useRef(seconds + 1);

    const [phase, setPhase]         = useState<Phase>('counting');
    const [remaining, setRemaining] = useState(seconds * 1000);

    useEffect(() => {
        if (phase !== 'counting') return;
        const id = window.setInterval(() => {
            const left = endsAt.current - performance.now();
            if (left <= 0) {
                setRemaining(0);
                setPhase('go');
                void fetchNui('sd-phone:racing:hud:go');
                return;
            }
            setRemaining(left);
            const num = Math.ceil(left / 1000);
            if (num !== lastNum.current) {
                lastNum.current = num;
                void fetchNui('sd-phone:racing:hud:beep');
            }
        }, TICK_MS);
        return () => window.clearInterval(id);
    }, [phase]);

    useEffect(() => {
        if (phase !== 'go') return;
        const id = window.setTimeout(onDone, GO_MS);
        return () => window.clearTimeout(id);
    }, [phase, onDone]);

    const isGo     = phase === 'go';
    const progress = remaining / (seconds * 1000);
    const number   = Math.max(1, Math.ceil(remaining / 1000));
    const fraction = (remaining % 1000) / 1000 || 1;
    const color    = isGo ? GO_COLOR : `hsl(${(1 - progress) * 60}, 100%, 50%)`;

    return (
        <div className="pointer-events-none fixed inset-0 flex items-center justify-center" style={{ zIndex: 3 }}>
            <div className="relative" style={{ width: RING_PX, height: RING_PX }}>
                {!isGo && (
                    <svg viewBox="0 0 100 100" className="h-full w-full" style={{ transform: 'rotate(-90deg)', overflow: 'visible' }}>
                        <circle cx="50" cy="50" r={TRACK_R} fill="none" stroke="rgba(255, 255, 255, 0.12)" strokeWidth={4} />
                        <circle
                            cx="50"
                            cy="50"
                            r={TRACK_R}
                            fill="none"
                            stroke={color}
                            strokeWidth={4}
                            strokeLinecap="round"
                            strokeDasharray={`${CIRC * fraction} ${CIRC}`}
                            style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke 0.12s linear' }}
                        />
                    </svg>
                )}
                <div
                    key={isGo ? 'go' : number}
                    className="animate-plop absolute inset-0 flex items-center justify-center font-extrabold leading-none"
                    style={{
                        color,
                        fontSize:      isGo ? 72 : 96,
                        letterSpacing: isGo ? '2px' : undefined,
                        textShadow:    '0 2px 8px rgba(0, 0, 0, 0.6)',
                    }}
                >
                    {isGo ? t('racing.hudGo', 'GO!') : number}
                </div>
            </div>
        </div>
    );
}
