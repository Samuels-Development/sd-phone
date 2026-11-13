import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, WheelEvent as ReactWheelEvent } from 'react';

import type { WidgetCard } from '@/apps/appstore/appsApi';

const WHEEL_MS = 280;

const SLIDE_MS = 300;

export function WidgetStack({ cards, active, onActive, height, editing, render }: {
    cards:    WidgetCard[];
    active:   number;
    onActive: (index: number) => void;
    height:   number;
    editing:  boolean;
    render:   (card: WidgetCard, index: number) => ReactNode;
}) {
    const lastWheel = useRef(0);
    const [leaving, setLeaving] = useState<{ at: number; dir: number } | null>(null);
    const shown = useRef(active);
    const count = cards.length;
    const index = Math.min(Math.max(active, 0), count - 1);

    useEffect(() => {
        const from = shown.current;
        shown.current = index;
        if (from === index) return;
        setLeaving({ at: from, dir: index > from ? 1 : -1 });
        const t = window.setTimeout(() => setLeaving(null), SLIDE_MS);
        return () => window.clearTimeout(t);
    }, [index]);

    if (count <= 1) return <>{render(cards[0], 0)}</>;

    function step(delta: number) {
        const next = index + delta;
        if (next < 0 || next >= count) return;
        onActive(next);
    }

    function onWheel(e: ReactWheelEvent) {
        if (editing || e.deltaY === 0) return;
        e.stopPropagation();
        const now = Date.now();
        if (now - lastWheel.current < WHEEL_MS) return;
        lastWheel.current = now;
        step(e.deltaY > 0 ? 1 : -1);
    }

    return (
        <div
            className="relative overflow-hidden"
            style={{ height }}
            onWheel={onWheel}
        >
            <div>
                {leaving && cards[leaving.at] && (
                    <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                        style={{
                            '--dir': leaving.dir,
                            animation: `widget-card-out ${SLIDE_MS}ms cubic-bezier(0.32,0.72,0,1) both`,
                        } as CSSProperties}
                    >
                        {render(cards[leaving.at], leaving.at)}
                    </div>
                )}
                <div
                    key={index}
                    style={leaving
                        ? ({ '--dir': leaving.dir, animation: `widget-card-in ${SLIDE_MS}ms cubic-bezier(0.32,0.72,0,1) both` } as CSSProperties)
                        : undefined}
                >
                    {render(cards[index], index)}
                </div>
            </div>

            <div className="pointer-events-none absolute end-[5px] top-1/2 flex -translate-y-1/2 flex-col gap-[4px]">
                {cards.map((_, i) => (
                    <span
                        key={i}
                        className="h-[4px] w-[4px] rounded-full bg-white"
                        style={{
                            opacity: i === index ? 0.95 : 0.35,
                            boxShadow: '0 0 2px rgba(0,0,0,0.5)',
                            transition: 'opacity 0.2s ease',
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
