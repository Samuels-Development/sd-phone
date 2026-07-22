import { useCallback, useEffect, useRef, useState } from 'react';

const THRESHOLD = 64;
const MAX_PULL  = 108;
const HOLD_AT   = 56;

/** Drag-down-to-refresh for a scroll container. Pointer-based with plain client-coordinate
 *  deltas (uniform under the phone's CSS zoom, unlike hit-testing), damped past the threshold,
 *  and holding a spinner while `onRefresh` runs. Returns the pull offset to translate the
 *  content by and the state the spinner renders from. */
export function usePullToRefresh(
    ref: React.RefObject<HTMLElement>,
    onRefresh: () => Promise<unknown>,
): { pull: number; refreshing: boolean; armed: boolean } {
    const [pull,       setPull]       = useState(0);
    const [refreshing, setRefreshing] = useState(false);

    const startY     = useRef<number | null>(null);
    const pulling    = useRef(false);
    const refreshRef = useRef(onRefresh);
    refreshRef.current = onRefresh;
    const busy = useRef(false);
    // The listeners live outside React's render loop; mirror the latest pull for onUp.
    const pullRef = useRef(pull);
    pullRef.current = pull;

    const settle = useCallback(() => {
        startY.current  = null;
        pulling.current = false;
        setPull(0);
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        function onDown(e: PointerEvent) {
            if (!e.isPrimary || busy.current) return;
            if ((el as HTMLElement).scrollTop > 0) return;
            startY.current  = e.clientY;
            pulling.current = false;
        }

        function onMove(e: PointerEvent) {
            if (startY.current === null || busy.current) return;
            const dy = e.clientY - startY.current;
            if ((el as HTMLElement).scrollTop > 0 || dy <= 0) {
                if (pulling.current) settle();
                else startY.current = null;
                return;
            }
            // Ignore micro-jitters so ordinary taps never grab the gesture.
            if (!pulling.current && dy < 8) return;
            pulling.current = true;
            // Damped: full drags approach MAX_PULL instead of following the pointer 1:1.
            setPull(Math.min(MAX_PULL, dy * 0.45));
        }

        function onUp() {
            if (!pulling.current) { startY.current = null; return; }
            const past = pullRef.current >= THRESHOLD;
            if (!past) { settle(); return; }
            busy.current = true;
            setRefreshing(true);
            setPull(HOLD_AT);
            void refreshRef.current().finally(() => {
                busy.current = false;
                setRefreshing(false);
                settle();
            });
        }

        el.addEventListener('pointerdown', onDown);
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
        return () => {
            el.removeEventListener('pointerdown', onDown);
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onUp);
        };
    }, [ref, settle]);

    return { pull, refreshing, armed: pull >= THRESHOLD };
}
