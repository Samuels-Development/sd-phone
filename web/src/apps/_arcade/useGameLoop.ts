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
    const active = useDeckActive();
    const activeRef = useRef(active);
    activeRef.current = active;
    const rafRef = useRef<number | undefined>(undefined);
    const lastTs = useRef<number>(0);

    useEffect(() => {
        if (!active) return;
        function frame(ts: number) {
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
            lastTs.current = 0;
        };
    }, [active]);
}
