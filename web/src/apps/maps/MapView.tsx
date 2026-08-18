import {
    createContext, forwardRef, memo, useCallback, useContext, useEffect,
    useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react';
import type { ReactNode } from 'react';
import { Layers, Locate, Minus, Plus } from 'lucide-react';

import { getMapStyles, loadStyleId, MAX_NATIVE_PX, pctToWorld, projectPct, saveStyleId, styleMaxZoom, stylePx, tileUrl } from './data';
import type { MapStyle, MapStyleId } from './data';
import { t } from '@/i18n';

const MIN_SCALE = 1;
const OVERZOOM = 0.7;
function maxScaleFor(side: number): number {
    if (!side) return 16;
    return Math.max(MIN_SCALE + 2, (MAX_NATIVE_PX / side) * OVERZOOM);
}

function maxLevelFor(side: number): number {
    return Math.max(2, Math.floor(Math.log2(maxScaleFor(side))));
}
function snapLevel(level: number, side: number): number {
    return 2 ** Math.max(0, Math.min(maxLevelFor(side), Math.round(level)));
}

function ancestorZoom(el: HTMLElement | null): number {
    let z = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const cz = parseFloat(getComputedStyle(n).getPropertyValue('zoom'));
        if (cz > 0 && cz !== 1) z *= cz;
    }
    return z || 1;
}

interface MapTransform { scale: number; tx: number; ty: number; side: number; vw: number; vh: number; pow: number; gesturing: boolean }
const MapTransformContext = createContext<MapTransform>({ scale: 1, tx: 0, ty: 0, side: 0, vw: 0, vh: 0, pow: 1, gesturing: false });

export function usePinStyle(x: number, y: number): React.CSSProperties {
    const { scale, tx, ty, side, vw, vh, gesturing } = useContext(MapTransformContext);
    const pct = projectPct(x, y);
    const left = vw / 2 + ((pct.left / 100) * side - side / 2) * scale + tx;
    const top  = vh / 2 + ((pct.top  / 100) * side - side / 2) * scale + ty;
    return {
        position: 'absolute', left, top, transform: 'translate(-50%, -50%)',
        transition: gesturing
            ? 'none'
            : 'left 200ms cubic-bezier(0.22,0.61,0.36,1), top 200ms cubic-bezier(0.22,0.61,0.36,1)',
    };
}

export function useStageProjector(): (x: number, y: number) => { x: number; y: number } {
    const { side, pow } = useContext(MapTransformContext);
    const sideP = side * pow;
    return useCallback((x: number, y: number) => {
        const pct = projectPct(x, y);
        return { x: (pct.left / 100) * sideP, y: (pct.top / 100) * sideP };
    }, [sideP]);
}

export interface MapViewHandle {
    centerOnWorld: (x: number, y: number, minZoom?: number) => void;
    fitWorld: (pts: { x: number; y: number }[], padFrac?: number) => void;
    reset: () => void;
}

interface MapViewProps {
    children?:   ReactNode;
    placing?:    boolean;
    onPlace?:    (x: number, y: number, anchor: { ax: number; ay: number; fx: number; fy: number }) => void;
    onTapEmpty?: () => void;
    overlay?:    ReactNode;
    stageOverlay?: ReactNode;
    fit?:        boolean;
    fitTo?:      { x: number; y: number }[];
    centerTo?:   { x: number; y: number };
    chrome?:       boolean;
    chromeTop?:    string;
    chromeBottom?: string;
    insetBottom?: number;
    insetTop?:    number;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
    { children, placing = false, onPlace, onTapEmpty, overlay, stageOverlay, fit = false, fitTo, centerTo, chrome = true, chromeTop, chromeBottom, insetBottom = 0, insetTop = 0 }, ref,
) {
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const stageRef    = useRef<HTMLDivElement | null>(null);

    const [scale, setScale] = useState(1);
    const [tx, setTx] = useState(0);
    const [ty, setTy] = useState(0);
    const viewRef = useRef({ scale: 1, tx: 0, ty: 0 });
    viewRef.current.scale = scale;
    viewRef.current.tx = tx;
    viewRef.current.ty = ty;
    const [vw, setVw] = useState(0);
    const [vh, setVh] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [pinching, setPinching] = useState(false);
    const side = fit ? Math.min(vw, vh) : Math.max(vw, vh);

    const [styleId, setStyleId] = useState<MapStyleId>(() => loadStyleId());
    const [layersOpen, setLayersOpen] = useState(false);
    const mapStyles = getMapStyles();
    const style = mapStyles.find(s => s.id === styleId) ?? mapStyles[0];

    const [prevStyle, setPrevStyle] = useState<MapStyle | null>(null);
    const styleFadeTimer = useRef<number | null>(null);
    useEffect(() => () => { if (styleFadeTimer.current) window.clearTimeout(styleFadeTimer.current); }, []);

    function chooseStyle(id: MapStyleId) {
        if (id !== styleId) {
            setPrevStyle(style);
            if (styleFadeTimer.current) window.clearTimeout(styleFadeTimer.current);
            styleFadeTimer.current = window.setTimeout(() => setPrevStyle(null), 450);
        }
        setStyleId(id);
        saveStyleId(id);
        setLayersOpen(false);
    }

    useLayoutEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        const measure = () => { setVw(el.clientWidth); setVh(el.clientHeight); };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const minScale = side ? Math.min(1, vw / (side * 0.72)) : 1;

    const stepScale = (dir: 1 | -1): number => {
        const lvl = Math.log2(viewRef.current.scale);
        if (dir > 0) {
            const up = Math.floor(lvl + 1e-6) + 1;
            return up <= 0 ? 1 : 2 ** Math.min(maxLevelFor(side), up);
        }
        const down = Math.ceil(lvl - 1e-6) - 1;
        return down < 0 ? minScale : 2 ** down;
    };

    const clampPan = useCallback((nx: number, ny: number, s: number) => {
        const vp = viewportRef.current;
        const W = vp?.clientWidth ?? 0;
        const H = vp?.clientHeight ?? 0;
        const scaled = side * s;
        const maxX = Math.max(0, (scaled - W) / 2);
        const maxY = Math.max(0, (scaled - H) / 2);
        return {
            x: Math.max(-maxX, Math.min(maxX, nx)),
            y: Math.max(-(maxY + insetBottom), Math.min(maxY + insetTop, ny)),
        };
    }, [side, insetBottom, insetTop]);

    const zoomAround = useCallback((clientX: number, clientY: number, nextScale: number) => {
        const vp = viewportRef.current;
        if (!vp) return;
        const rect = vp.getBoundingClientRect();
        const z = ancestorZoom(vp);
        const cx = (clientX / z - rect.left) - vw / 2;
        const cy = (clientY / z - rect.top)  - vh / 2;
        const view = viewRef.current;
        const s = Math.max(minScale, Math.min(maxScaleFor(side), nextScale));
        if (s === view.scale) return;
        const ratio = s / view.scale;
        const c = clampPan(cx - (cx - view.tx) * ratio, cy - (cy - view.ty) * ratio, s);
        viewRef.current = { scale: s, tx: c.x, ty: c.y };
        setScale(s); setTx(c.x); setTy(c.y);
    }, [clampPan, vw, vh, minScale, side]);

    const lastWheelStep = useRef(0);

    const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
    wheelRef.current = (e: WheelEvent) => {
        e.preventDefault();
        const now = performance.now();
        if (now - lastWheelStep.current < 160) return;
        lastWheelStep.current = now;
        zoomAround(e.clientX, e.clientY, stepScale(e.deltaY < 0 ? 1 : -1));
    };

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => wheelRef.current(e);
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, []);
    function buttonZoom(dir: 1 | -1) {
        const vp = viewportRef.current;
        if (!vp) return;
        const rect = vp.getBoundingClientRect();
        const z = ancestorZoom(vp);
        zoomAround((rect.left + rect.width / 2) * z, (rect.top + rect.height / 2) * z, stepScale(dir));
    }
    function resetView() { setScale(1); setTx(0); setTy(0); }

    const centerOnWorld = useCallback((x: number, y: number, minZoom = 2.4) => {
        const pct = projectPct(x, y);
        const s = snapLevel(Math.log2(Math.max(scale, minZoom)), side);
        const ox = (pct.left / 100 - 0.5) * side;
        const oy = (pct.top  / 100 - 0.5) * side;
        const c = clampPan(-ox * s, -oy * s, s);
        setScale(s); setTx(c.x); setTy(c.y);
    }, [scale, side, clampPan]);

    const fitWorld = useCallback((pts: { x: number; y: number }[], padFrac = 0.16) => {
        if (!pts.length || !side || !vw || !vh) return;
        const ps = pts.map(p => projectPct(p.x, p.y));
        const minL = Math.min(...ps.map(p => p.left)), maxL = Math.max(...ps.map(p => p.left));
        const minT = Math.min(...ps.map(p => p.top)),  maxT = Math.max(...ps.map(p => p.top));
        const midL = (minL + maxL) / 2, midT = (minT + maxT) / 2;
        const spanX = Math.max(1, ((maxL - minL) / 100) * side);
        const spanY = Math.max(1, ((maxT - minT) / 100) * side);
        const target = Math.min((vw * (1 - 2 * padFrac)) / spanX, (vh * (1 - 2 * padFrac)) / spanY);
        const s = target < 1
            ? minScale
            : Math.max(minScale, Math.min(maxScaleFor(side), 2 ** Math.min(maxLevelFor(side), Math.floor(Math.log2(target) + 1e-6))));
        const ox = (midL / 100 - 0.5) * side;
        const oy = (midT / 100 - 0.5) * side;
        const c = clampPan(-ox * s, -oy * s, s);
        setScale(s); setTx(c.x); setTy(c.y);
    }, [side, vw, vh, minScale, clampPan]);

    useImperativeHandle(ref, () => ({ centerOnWorld, fitWorld, reset: resetView }), [centerOnWorld, fitWorld]);

    const didFit = useRef(false);
    useLayoutEffect(() => { didFit.current = false; }, [fitTo]);
    useLayoutEffect(() => {
        if (didFit.current || !fitTo || !fitTo.length || !side || !vw || !vh) return;
        didFit.current = true;
        fitWorld(fitTo);
    }, [fitTo, side, vw, vh, fitWorld]);

    const didCenter = useRef(false);
    useLayoutEffect(() => { didCenter.current = false; }, [centerTo]);
    useLayoutEffect(() => {
        if (didCenter.current || !centerTo || !side || !vw || !vh) return;
        didCenter.current = true;
        centerOnWorld(centerTo.x, centerTo.y);
    }, [centerTo, side, vw, vh, centerOnWorld]);

    const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
    const gesture  = useRef({ startX: 0, startY: 0, tx: 0, ty: 0, moved: 0, pinchDist: 0, pinchScale: 1, z: 1 });

    const panRaf     = useRef<number | null>(null);
    const pendingPan = useRef<{ x: number; y: number } | null>(null);
    const flushPan = useCallback(() => {
        panRaf.current = null;
        const p = pendingPan.current;
        if (p) { setTx(p.x); setTy(p.y); }
    }, []);
    const queuePan = useCallback((x: number, y: number) => {
        pendingPan.current = { x, y };
        if (panRaf.current === null) panRaf.current = requestAnimationFrame(flushPan);
    }, [flushPan]);
    useEffect(() => () => { if (panRaf.current !== null) cancelAnimationFrame(panRaf.current); }, []);

    const zoomRaf     = useRef<number | null>(null);
    const pendingZoom = useRef<{ cx: number; cy: number; scale: number } | null>(null);
    const flushZoom = useCallback(() => {
        zoomRaf.current = null;
        const p = pendingZoom.current;
        pendingZoom.current = null;
        if (p) zoomAround(p.cx, p.cy, p.scale);
    }, [zoomAround]);
    const queueZoom = useCallback((cx: number, cy: number, targetScale: number) => {
        pendingZoom.current = { cx, cy, scale: targetScale };
        if (zoomRaf.current === null) zoomRaf.current = requestAnimationFrame(flushZoom);
    }, [flushZoom]);
    useEffect(() => () => {
        if (zoomRaf.current !== null) cancelAnimationFrame(zoomRaf.current);
    }, []);

    function onPointerDown(e: React.PointerEvent) {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size === 1) {
            setDragging(true);
            const z = ancestorZoom(viewportRef.current);
            gesture.current = { ...gesture.current, startX: e.clientX, startY: e.clientY, tx, ty, moved: 0, z };
        } else if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            gesture.current.pinchDist  = Math.hypot(a.x - b.x, a.y - b.y);
            gesture.current.pinchScale = scale;
            setPinching(true);
        }
    }
    function onPointerMove(e: React.PointerEvent) {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.current.size >= 2) {
            const [a, b] = [...pointers.current.values()];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (gesture.current.pinchDist > 0) {
                queueZoom((a.x + b.x) / 2, (a.y + b.y) / 2, gesture.current.pinchScale * (dist / gesture.current.pinchDist));
            }
            gesture.current.moved += 99;
            return;
        }
        if (!dragging) return;
        const rawDx = e.clientX - gesture.current.startX;
        const rawDy = e.clientY - gesture.current.startY;
        gesture.current.moved = Math.max(gesture.current.moved, Math.hypot(rawDx, rawDy));
        const z = gesture.current.z || 1;
        const c = clampPan(gesture.current.tx + rawDx / z, gesture.current.ty + rawDy / z, scale);
        queuePan(c.x, c.y);
    }
    function onPointerUp(e: React.PointerEvent) {
        if (panRaf.current !== null) { cancelAnimationFrame(panRaf.current); panRaf.current = null; }
        if (pendingPan.current) { setTx(pendingPan.current.x); setTy(pendingPan.current.y); pendingPan.current = null; }
        const wasTap = gesture.current.moved < 6 && pointers.current.size === 1;
        const wasPinch = pointers.current.size === 2;
        pointers.current.delete(e.pointerId);
        if (pointers.current.size === 0) setDragging(false);

        if (wasPinch) {
            gesture.current.pinchDist = 0;
            setPinching(false);
            const vp = viewportRef.current;
            if (vp) {
                const rect = vp.getBoundingClientRect();
                const az = ancestorZoom(vp);
                const live = pendingZoom.current?.scale ?? scale;
                const snapped = live <= Math.sqrt(minScale)
                    ? minScale
                    : snapLevel(Math.log2(live), side);
                zoomAround((rect.left + rect.width / 2) * az, (rect.top + rect.height / 2) * az, snapped);
            }
            const rest = [...pointers.current.values()][0];
            if (rest) {
                gesture.current = { ...gesture.current, startX: rest.x, startY: rest.y, tx, ty };
            }
        }
        if (layersOpen) { setLayersOpen(false); return; }
        if (wasTap && placing && onPlace) {
            const vp = viewportRef.current;
            if (!vp || !vp.clientWidth) return;
            const vpRect = vp.getBoundingClientRect();
            const z = ancestorZoom(vp);
            const localX = e.clientX / z - vpRect.left;
            const localY = e.clientY / z - vpRect.top;
            const rawL = (((localX - vw / 2 - tx) / scale + side / 2) / side) * 100;
            const rawT = (((localY - vh / 2 - ty) / scale + side / 2) / side) * 100;
            const leftPct = Math.max(0, Math.min(100, rawL));
            const topPct  = Math.max(0, Math.min(100, rawT));
            const w = pctToWorld(leftPct, topPct);
            onPlace(w.x, w.y, { ax: localX, ay: localY, fx: leftPct / 100, fy: topPct / 100 });
        } else if (wasTap) {
            onTapEmpty?.();
        }
    }

    useEffect(() => {
        const c = clampPan(tx, ty, scale);
        if (c.x !== tx) setTx(c.x);
        if (c.y !== ty) setTy(c.y);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [side, insetBottom, insetTop]);

    const powRef = useRef(1);
    if (!pinching || powRef.current < 1) {
        powRef.current = 2 ** Math.max(0, Math.min(6, Math.round(Math.log2(Math.max(1, scale)))));
    }
    const pow = powRef.current;
    const stageSide = side * pow;

    const transform: MapTransform = { scale, tx, ty, side, vw, vh, pow, gesturing: dragging || pinching };

    const painted = useRef<{ scale: number; tx: number; ty: number; pow: number } | null>(null);
    const glide = useRef<Animation | null>(null);
    useLayoutEffect(() => {
        const el = stageRef.current;
        const prev = painted.current;
        painted.current = { scale, tx, ty, pow };
        if (!el || !prev) return;
        if (dragging || pinching) return;
        if (prev.scale === scale && prev.tx === tx && prev.ty === ty && prev.pow === pow) return;

        let from: string;
        const running = glide.current?.playState === 'running';
        if (running) {
            const m = new DOMMatrix(getComputedStyle(el).transform);
            from = `translate(${m.e}px, ${m.f}px) scale(${(m.a * prev.pow) / pow})`;
        } else {
            from = `translate(${prev.tx}px, ${prev.ty}px) scale(${prev.scale / pow})`;
        }
        glide.current?.cancel();
        glide.current = el.animate(
            [{ transform: from }, { transform: `translate(${tx}px, ${ty}px) scale(${scale / pow})` }],
            { duration: 200, easing: 'cubic-bezier(0.22,0.61,0.36,1)' },
        );
    }, [scale, tx, ty, pow, dragging, pinching]);

    return (
        <div
            ref={viewportRef}
            className="relative h-full w-full touch-none overflow-hidden"
            style={{ background: style.bg, transition: 'background 400ms ease', cursor: dragging ? 'grabbing' : placing ? 'crosshair' : 'grab' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            <div
                ref={stageRef}
                className="absolute"
                style={{
                    width: stageSide, height: stageSide,
                    left: (vw - stageSide) / 2,
                    top:  (vh - stageSide) / 2,
                    transform: `translate(${tx}px, ${ty}px) scale(${scale / pow})`,
                    transformOrigin: 'center',
                    willChange: 'transform',
                }}
            >
                <div className="absolute inset-0" style={{ background: '#0b2838' }} />
                {prevStyle && (
                    <div className="absolute inset-0">
                        <TileGrid style={prevStyle} side={side} pow={pow} scale={scale} tx={Math.round(tx / 64) * 64} ty={Math.round(ty / 64) * 64} vpW={vw} vpH={vh} />
                    </div>
                )}
                <div key={style.id} className={prevStyle ? 'absolute inset-0 animate-fade-in' : 'absolute inset-0'}>
                    <TileGrid style={style} side={side} pow={pow} scale={scale} tx={Math.round(tx / 64) * 64} ty={Math.round(ty / 64) * 64} vpW={vw} vpH={vh} />
                </div>
                {style.wash && (
                    <div className="absolute inset-0" style={{ background: style.wash, pointerEvents: 'none' }} />
                )}
                {stageOverlay && (
                    <div className="pointer-events-none absolute inset-0">
                        <MapTransformContext.Provider value={transform}>
                            {stageOverlay}
                        </MapTransformContext.Provider>
                    </div>
                )}
            </div>

            <div className="pointer-events-none absolute inset-0 z-10">
                <MapTransformContext.Provider value={transform}>
                    {children}
                </MapTransformContext.Provider>
            </div>

            {chrome && (
            <div
                className="absolute right-3 z-30 flex flex-col items-end gap-2"
                style={{ top: chromeTop ?? '12px' }}
                onPointerDown={e => e.stopPropagation()}
                onPointerMove={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                onWheel={e => e.stopPropagation()}
            >
                <div className="flex flex-col overflow-hidden rounded-[10px] bg-elevated/90 shadow-md ring-1 ring-black/5 dark:bg-elevated/90 dark:ring-white/10">
                    <CtrlBtn onClick={() => buttonZoom(1)} label={t('maps.zoomIn', 'Zoom in')}><Plus className="h-[18px] w-[18px]" /></CtrlBtn>
                    <div className="h-px w-full bg-black/10 dark:bg-white/10" />
                    <CtrlBtn onClick={() => buttonZoom(-1)} label={t('maps.zoomOut', 'Zoom out')}><Minus className="h-[18px] w-[18px]" /></CtrlBtn>
                </div>
                <button
                    onClick={resetView}
                    aria-label={t('maps.fitMap', 'Fit map')}
                    className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-elevated/90 text-ios-blue shadow-md ring-1 ring-black/5 dark:bg-elevated/90 dark:ring-white/10"
                >
                    <Locate className="h-[18px] w-[18px]" />
                </button>
                <button
                    onClick={() => setLayersOpen(o => !o)}
                    aria-label={t('maps.mapStyle', 'Map style')}
                    className={'flex h-9 w-9 items-center justify-center rounded-[10px] shadow-md ring-1 transition-colors ' +
                        (layersOpen
                            ? 'bg-ios-blue text-white ring-black/5'
                            : 'bg-elevated/90 text-ios-blue ring-black/5 dark:bg-elevated/90 dark:ring-white/10')}
                >
                    <Layers className="h-[18px] w-[18px]" />
                </button>

                {layersOpen && (
                    <div
                        className="animate-slide-down-fade overflow-hidden rounded-2xl bg-elevated/95 p-2.5 shadow-xl ring-1 ring-black/5 dark:bg-surface/95 dark:ring-white/10"
                        onPointerDown={e => e.stopPropagation()}
                    >
                        <p className="px-1 pb-2 pt-0.5 text-[13px] font-semibold uppercase tracking-wider text-ios-gray">{t('maps.mapStyleTitle', 'Map Style')}</p>
                        <div className="flex gap-2.5">
                        {mapStyles.map(s => (
                            <button
                                key={s.id}
                                onClick={() => chooseStyle(s.id)}
                                className="flex w-[112px] flex-col items-center gap-2 active:opacity-80"
                            >
                                <span
                                    className={'block h-[94px] w-[108px] overflow-hidden rounded-[14px] transition-shadow ' +
                                        (s.id === styleId
                                            ? 'ring-2 ring-ios-blue'
                                            : 'ring-1 ring-black/10 dark:ring-white/15')}
                                    style={{ background: s.bg }}
                                >
                                    <img
                                        src={tileUrl(s.tiles, 4, 6, 10)}
                                        alt=""
                                        draggable={false}
                                        className="h-full w-full object-cover"
                                    />
                                </span>
                                <span className={'text-[15px] font-semibold ' +
                                    (s.id === styleId ? 'text-ios-blue' : 'text-black/70 dark:text-white/70')}>
                                    {s.label}
                                </span>
                            </button>
                        ))}
                        </div>
                    </div>
                )}
            </div>
            )}

            {chrome && (
            <div className="absolute left-3 z-20 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-bold tracking-[0.06em] text-white/95" style={{ bottom: chromeBottom ?? '12px', transition: 'bottom 300ms cubic-bezier(0.22,0.61,0.36,1)' }}>
                {Math.round(scale * 100)}%
            </div>
            )}

            {overlay}
        </div>
    );
});

const BACKDROP_Z = 2;

const DEBUG_TILES = (() => { try { return localStorage.getItem('sd-phone:maps:debug') === '1'; } catch { return false; } })();
const DBG_COLOR: Record<number, string> = { 2: '#ff0000', 3: '#ff8800', 4: '#00ff00', 5: '#00ffff', 6: '#ff00ff', 7: '#ffff00' };

function tileLayer(
    style: MapStyle, z: number, side: number, scale: number, tx: number, ty: number,
    vpW: number, vpH: number, keyPrefix: string, fullGrid: boolean,
): ReactNode[] {
    const n = 2 ** z;
    const ts = side / n;
    const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));

    let iMin = 0, iMax = n - 1, jMin = 0, jMax = n - 1;
    if (!fullGrid) {
        const qx0 = (-vpW / 2 - tx) / scale + side / 2;
        const qx1 = ( vpW / 2 - tx) / scale + side / 2;
        const qy0 = (-vpH / 2 - ty) / scale + side / 2;
        const qy1 = ( vpH / 2 - ty) / scale + side / 2;
        const margin = 1 + Math.round(32 / Math.max(1, ts * scale));
        iMin = clamp(Math.floor(qx0 / ts) - margin); iMax = clamp(Math.floor(qx1 / ts) + margin);
        jMin = clamp(Math.floor(qy0 / ts) - margin); jMax = clamp(Math.floor(qy1 / ts) + margin);
    }

    const dbg = DEBUG_TILES ? (DBG_COLOR[z] ?? '#ffffff') : undefined;
    const seam = 0.6 / Math.max(1, scale);
    const tiles: ReactNode[] = [];
    for (let j = jMin; j <= jMax; j++) {
        for (let i = iMin; i <= iMax; i++) {
            tiles.push(
                <img
                    key={`${keyPrefix}-${i}-${j}`}
                    src={tileUrl(style.tiles, z, i, j)}
                    alt=""
                    draggable={false}
                    loading="eager"
                    decoding="async"
                    onError={e => {
                        const t = e.currentTarget as HTMLImageElement;
                        if (DEBUG_TILES) { t.style.background = 'rgba(255,0,0,0.5)'; return; }
                        t.style.opacity = '0';
                        const tries = Number(t.dataset.retry ?? '0');
                        if (tries < 2) {
                            t.dataset.retry = String(tries + 1);
                            const base = t.src.replace(/&r=\d+$/, '');
                            window.setTimeout(() => { t.src = `${base}&r=${tries + 1}`; }, 900 * (tries + 1));
                        }
                    }}
                    // Reveal with opacity, NOT visibility: a loaded tile set to visibility:visible
                    // overrides the AppDeck hidden-pool's inherited visibility:hidden and paints the
                    // map through the homescreen while maps is backgrounded. Opacity can't escape it.
                    onLoad={e => { (e.currentTarget as HTMLImageElement).style.opacity = '1'; }}
                    className="absolute select-none"
                    style={{
                        left: i * ts, top: j * ts,
                        width: ts + seam, height: ts + seam,   // hairline overlap hides seams
                        filter: style.filter,
                        outline: dbg ? `1px solid ${dbg}` : undefined,
                        outlineOffset: dbg ? '-1px' : undefined,
                    }}
                />,
            );
            if (dbg) {
                tiles.push(
                    <div key={`${keyPrefix}-lbl-${i}-${j}`} className="pointer-events-none absolute select-none"
                        style={{ left: i * ts + 1, top: j * ts + 1, fontSize: Math.max(7, Math.min(11, ts / 6)), lineHeight: 1, color: dbg, textShadow: '0 0 2px #000,0 0 2px #000', fontFamily: 'monospace', fontWeight: 700 }}>
                        {z}/{i}/{j}
                    </div>,
                );
            }
        }
    }
    return tiles;
}

const TileGrid = memo(function TileGrid({ style, side, pow, scale, tx, ty, vpW, vpH }: {
    style: MapStyle; side: number; pow: number; scale: number; tx: number; ty: number; vpW: number; vpH: number;
}) {
    const sideP  = side * pow;
    const scaleP = scale / pow;

    const backdrop = useMemo(
        () => (side ? tileLayer(style, BACKDROP_Z, sideP, scaleP, 0, 0, vpW, vpH, `${style.tiles}bg`, true) : []),
        [style, sideP, vpW, vpH],
    );

    if (!side) return null;

    const maxZ = styleMaxZoom(style.tiles);
    const need = Math.ceil(Math.log2(Math.max(1, (side * scale) / stylePx(style.tiles))));
    const detailZ = Math.max(BACKDROP_Z, Math.min(maxZ, need));

    const detail: ReactNode[] = [];
    for (let z = Math.max(BACKDROP_Z + 1, detailZ - 1); z <= detailZ; z++) {
        detail.push(
            ...tileLayer(style, z, sideP, scaleP, tx, ty, vpW, vpH, `${style.tiles}${z}`, false),
        );
    }
    return <>{backdrop}{detail}</>;
});

function CtrlBtn({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
    return (
        <button
            onClick={onClick}
            aria-label={label}
            className="flex h-9 w-9 items-center justify-center text-ios-blue transition-colors active:bg-black/5 dark:active:bg-white/10"
        >
            {children}
        </button>
    );
}
