import { useRef, useState } from 'react';

import { trackFraction } from '@/lib/zoom';

export function Slider({ value, min = 0, max = 100, step = 1, onChange, ariaLabel, className = '' }: {
    value:      number;
    min?:       number;
    max?:       number;
    step?:      number;
    onChange:   (v: number) => void;
    ariaLabel?: string;
    className?: string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    const [drag, setDrag] = useState<number | null>(null);
    const span = max - min;
    const shown = drag ?? value;
    const pct = span > 0 ? Math.max(0, Math.min(100, ((shown - min) / span) * 100)) : 0;

    function posFrom(e: React.PointerEvent): number | null {
        const el = ref.current;
        if (!el || span <= 0) return null;
        const f = trackFraction(el, e.clientX);
        if (f === null) return null;
        const snapped = Math.round((min + f * span) / step) * step;
        return Math.max(min, Math.min(max, snapped));
    }

    return (
        <div
            ref={ref}
            role="slider"
            aria-label={ariaLabel}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={Math.round(shown)}
            className={`relative h-7 cursor-pointer touch-none ${className}`}
            onPointerDown={e => {
                const p = posFrom(e);
                if (p === null) return;
                dragging.current = true;
                ref.current?.setPointerCapture?.(e.pointerId);
                setDrag(p);
                onChange(p);
            }}
            onPointerMove={e => {
                if (!dragging.current) return;
                const p = posFrom(e);
                if (p !== null) { setDrag(p); onChange(p); }
            }}
            onPointerUp={() => { dragging.current = false; setDrag(null); }}
            onPointerCancel={() => { dragging.current = false; setDrag(null); }}
        >
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-black/[0.14] dark:bg-white/[0.18]">
                <div className="h-full rounded-full bg-ios-blue" style={{ width: `${pct}%` }} />
            </div>
            <div
                className="pointer-events-none absolute top-1/2 h-[22px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                style={{
                    left:      `${pct}%`,
                    boxShadow: '0 2px 7px rgba(0,0,0,0.24), 0 0.5px 1.5px rgba(0,0,0,0.16)',
                }}
            />
        </div>
    );
}
