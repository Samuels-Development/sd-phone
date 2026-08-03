import { useEffect, useRef } from 'react';

import { useDeckActive } from '@/shell/deckActive';

export type Phase = 'ready' | 'playing' | 'dead';

interface GameLoopHandlers {
    isActive: () => boolean;
    onFrame: (steps: number) => void;
    onIdle?: (ts: number) => void;
}

export function useGameLoop(handlers: GameLoopHandlers): void {
    const ref = useRef(handlers);
    ref.current = handlers;
    // Suspend the whole loop while this app instance is backgrounded (in a switcher
    // card or the pool): the last painted DOM frame simply freezes at ~0 CPU.
    const active = useDeckActive();
    const activeRef = useRef(active);
    activeRef.current = active;
    const rafRef = useRef<number | undefined>(undefined);
    const lastTs = useRef<number>(0);

    useEffect(() => {
        if (!active) return;
        function frame(ts: number) {
            // Belt-and-braces: an rAF queued by the previous frame can still fire once
            // between the switcher-open re-parent (which flips active during render,
            // before this passive effect's cleanup) and that cleanup. Bail before we
            // advance any physics or reschedule, so the visible card never ticks once.
            if (!activeRef.current) { rafRef.current = undefined; return; }
            rafRef.current = requestAnimationFrame(frame);
            const prev = lastTs.current || ts;
            lastTs.current = ts;
            const steps = Math.min(3, (ts - prev) / 16.6667);

            const h = ref.current;
            if (!h.isActive() || steps <= 0) {
                h.onIdle?.(ts);
                return;
            }
            h.onFrame(steps);
        }

        rafRef.current = requestAnimationFrame(frame);
        return () => {
            if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
            // Reset so the first frame after resume yields steps ~0 (no catch-up jump).
            lastTs.current = 0;
        };
    }, [active]);
}
