import { useRef, useState } from 'react';

import { trackFraction } from '@/lib/zoom';

export function Scrubber({ value, max, onSeek, thick }: { value: number; max: number; onSeek: (t: number) => void; thick?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    const [drag, setDrag] = useState<number | null>(null);
    const shown = drag ?? value;
    const pct = max > 0 ? Math.max(0, Math.min(100, (shown / max) * 100)) : 0;
    function posFrom(e: React.PointerEvent): number | null {
        const el = ref.current;
        if (!el || max <= 0) return null;
        const f = trackFraction(el, e.clientX);
        return f === null ? null : f * max;
    }
    return (
        <div ref={ref} dir="ltr" className={`relative my-3 cursor-pointer touch-none ${thick ? 'h-7' : 'h-6'}`}
            onPointerDown={e => { const p = posFrom(e); if (p === null) return; dragging.current = true; ref.current?.setPointerCapture?.(e.pointerId); setDrag(p); onSeek(p); }}
            onPointerMove={e => { if (!dragging.current) return; const p = posFrom(e); if (p !== null) { setDrag(p); onSeek(p); } }}
            onPointerUp={() => { dragging.current = false; setDrag(null); }}
            onPointerCancel={() => { dragging.current = false; setDrag(null); }}>
            <div className={`pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full bg-white/25 ${thick ? 'h-[7px]' : 'h-1'}`}>
                <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
            </div>
            <div className={`pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ${thick ? 'h-[15px] w-[15px]' : 'h-3 w-3'}`} style={{ left: `${pct}%` }} />
        </div>
    );
}
