import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface Viewport {
    zoom: number;
    x:    number;
    y:    number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 16;

const HOME: Viewport = { zoom: 1, x: 0, y: 0 };

function clamp(n: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, n));
}

function settle(next: Viewport): Viewport {
    const zoom = clamp(next.zoom, MIN_ZOOM, MAX_ZOOM);
    const span = (1 - 1 / zoom) / 2;
    return { zoom, x: clamp(next.x, -span, span), y: clamp(next.y, -span, span) };
}

export interface MapViewport {
    view:     Viewport;
    ref:      React.RefObject<HTMLDivElement | null>;
    width:    number;
    panning:  boolean;
    atHome:   boolean;
    zoomBy:   (factor: number) => void;
    home:     () => void;
    focus:    (leftPct: number, topPct: number, zoom?: number) => void;
    toScreen: (leftPct: number, topPct: number) => { left: number; top: number };
    surface:  {
        onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
        onWheel:       (e: React.WheelEvent<HTMLDivElement>) => void;
    };
}

export function useMapViewport(): MapViewport {
    const ref = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);
    const [view, setView] = useState<Viewport>(HOME);
    const [panning, setPanning] = useState(false);

    const live = useRef(view);
    live.current = view;

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setWidth(el.clientWidth));
        ro.observe(el);
        setWidth(el.clientWidth);
        return () => ro.disconnect();
    }, []);

    const zoomAt = useCallback((factor: number, ox: number, oy: number) => {
        setView(prev => {
            const zoom = clamp(prev.zoom * factor, MIN_ZOOM, MAX_ZOOM);
            if (zoom === prev.zoom) return prev;
            const shift = 1 / prev.zoom - 1 / zoom;
            return settle({ zoom, x: prev.x + (ox - 0.5) * shift, y: prev.y + (oy - 0.5) * shift });
        });
    }, []);

    const zoomBy = useCallback((factor: number) => zoomAt(factor, 0.5, 0.5), [zoomAt]);

    const home = useCallback(() => setView(HOME), []);

    const focus = useCallback((leftPct: number, topPct: number, zoom = 6) => {
        setView(settle({ zoom, x: leftPct / 100 - 0.5, y: topPct / 100 - 0.5 }));
    }, []);

    const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        const el = ref.current;
        if (!el) return;
        const box = el.getBoundingClientRect();
        zoomAt(
            e.deltaY < 0 ? 1.3 : 1 / 1.3,
            (e.clientX - box.left) / box.width,
            (e.clientY - box.top) / box.height,
        );
    }, [zoomAt]);

    const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const el = ref.current;
        if (!el || e.button !== 0) return;

        const originX = e.clientX;
        const originY = e.clientY;
        const start = live.current;
        let dragged = false;

        el.setPointerCapture(e.pointerId);

        const move = (ev: PointerEvent) => {
            const dx = ev.clientX - originX;
            const dy = ev.clientY - originY;
            if (!dragged && Math.hypot(dx, dy) > 4) {
                dragged = true;
                setPanning(true);
            }
            if (!dragged) return;
            setView(settle({
                zoom: start.zoom,
                x: start.x - dx / (el.clientWidth * start.zoom),
                y: start.y - dy / (el.clientHeight * start.zoom),
            }));
        };

        const up = (ev: PointerEvent) => {
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            try { el.releasePointerCapture(ev.pointerId); } catch { /* released already */ }
            setPanning(false);
            if (dragged) {
                const swallow = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault(); };
                el.addEventListener('click', swallow, { capture: true, once: true });
                window.setTimeout(() => el.removeEventListener('click', swallow, true), 0);
            }
        };

        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const block = (e: WheelEvent) => e.preventDefault();
        el.addEventListener('wheel', block, { passive: false });
        return () => el.removeEventListener('wheel', block);
    }, []);

    const toScreen = useCallback((leftPct: number, topPct: number) => ({
        left: ((leftPct / 100 - view.x - 0.5) * view.zoom + 0.5) * 100,
        top:  ((topPct / 100 - view.y - 0.5) * view.zoom + 0.5) * 100,
    }), [view]);

    return {
        view, ref, width, panning,
        atHome: view.zoom === 1 && view.x === 0 && view.y === 0,
        zoomBy, home, focus, toScreen,
        surface: { onPointerDown, onWheel },
    };
}
