import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minimize2, Play, X, ZoomIn } from 'lucide-react';
import clsx from 'clsx';

import type { AdminContentMedia } from '../../types';
import { useAdminSurface, useEscapeHandler } from '../../ui';
import { AudioPlayer } from './AudioPlayer';

export function MediaStrip({ media, size = 64, max = 6, onOpen, className }: {
    media?: AdminContentMedia[] | null;
    size?: number;
    max?: number;
    onOpen: (index: number) => void;
    className?: string;
}) {
    const usable = (media ?? []).map((m, at) => ({ m, at })).filter(({ m }) => m.url || m.audio);
    if (usable.length === 0) return null;

    const sounds = usable.filter(({ m }) => m.audio);
    const visuals = usable.filter(({ m }) => !m.audio);

    const shown = visuals.slice(0, max);
    const extra = visuals.length - shown.length;

    return (
        <div className={clsx('flex flex-col gap-2', className)}>
            {sounds.map(({ m }, i) => (
                <AudioPlayer key={`${m.audio}-${i}`} src={m.audio ?? ''} />
            ))}

            {shown.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {shown.map(({ m, at }, i) => (
                        <button
                            key={`${m.url}-${i}`}
                            type="button"
                            onClick={e => { e.stopPropagation(); onOpen(at); }}
                            style={{ width: size, height: size }}
                            className="group relative shrink-0 overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/[0.08] transition-transform hover:scale-[1.04]"
                            title={m.video ? 'Play clip' : 'View full size'}
                        >
                            <img src={m.url ?? undefined} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                            {m.video && (
                                <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                                    <Play size={size > 56 ? 18 : 14} className="fill-white text-white drop-shadow" />
                                </span>
                            )}
                        </button>
                    ))}
                    {extra > 0 && (
                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onOpen(visuals[max]?.at ?? 0); }}
                            style={{ width: size, height: size }}
                            className="shrink-0 rounded-lg bg-white/[0.05] text-[12px] font-bold text-zinc-400 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09] hover:text-zinc-200"
                        >
                            +{extra}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

const ZOOM = 2.4;

export function MediaLightbox({ media, index, onIndex, onClose, caption }: {
    media: AdminContentMedia[];
    index: number;
    onIndex: (next: number) => void;
    onClose: () => void;
    caption?: React.ReactNode;
}) {
    const host = useAdminSurface();
    const count = media.length;

    const [leaving, setLeaving] = useState(false);
    const [zoomed, setZoomed] = useState(false);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);

    const beginClose = useCallback(() => {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) onClose();
        else setLeaving(true);
    }, [onClose]);

    const step = useCallback((delta: number) => {
        onIndex((index + delta + count) % count);
    }, [index, count, onIndex]);

    const resetZoom = useCallback(() => {
        setZoomed(false);
        setPan({ x: 0, y: 0 });
    }, []);

    useEffect(() => { resetZoom(); }, [index, resetZoom]);

    useEscapeHandler(beginClose);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); step(1); }
            if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); step(-1); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [step]);

    const current = media[index];
    if (!current) return null;

    const isAudio = Boolean(current.audio) || !current.url;
    const isVideo = !isAudio && Boolean(current.video);
    const isImage = !isAudio && !isVideo;

    const onPointerDown = (e: React.PointerEvent<HTMLImageElement>) => {
        if (!zoomed) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y, moved: false };
        setDragging(true);
    };

    const onPointerMove = (e: React.PointerEvent<HTMLImageElement>) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
        setPan({ x: d.ox + dx, y: d.oy + dy });
    };

    const endDrag = () => {
        setDragging(false);
        drag.current = null;
    };

    const onImageClick = () => {
        if (drag.current?.moved) return;
        if (zoomed) resetZoom();
        else setZoomed(true);
    };

    const body = (
        <div
            className={clsx(
                'absolute inset-0 z-50 flex flex-col bg-black/85',
                leaving ? 'admin-scrim-out' : 'admin-scrim-in',
            )}
            onMouseDown={beginClose}
            onAnimationEnd={e => { if (leaving && e.target === e.currentTarget) onClose(); }}
        >
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
                {isAudio && (
                    <div className="w-[420px] max-w-full rounded-xl bg-[#1a1b1f] p-3 shadow-2xl" onMouseDown={e => e.stopPropagation()}>
                        <AudioPlayer src={current.audio ?? current.url ?? ''} />
                    </div>
                )}
                {isVideo && (
                    <video
                        src={current.video ?? undefined}
                        poster={current.url ?? undefined}
                        controls
                        autoPlay
                        loop
                        className="max-h-full max-w-full rounded-xl shadow-2xl"
                        onMouseDown={e => e.stopPropagation()}
                    />
                )}
                {isImage && (
                    <img
                        src={current.url ?? undefined}
                        alt=""
                        draggable={false}
                        onMouseDown={e => e.stopPropagation()}
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        onClick={onImageClick}
                        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomed ? ZOOM : 1})` }}
                        className={clsx(
                            'max-h-full max-w-full rounded-xl object-contain shadow-2xl',
                            dragging ? 'transition-none' : 'transition-transform duration-200 ease-out',
                            zoomed ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in',
                        )}
                    />
                )}

                {count > 1 && (
                    <>
                        <button
                            type="button"
                            onMouseDown={e => { e.stopPropagation(); step(-1); }}
                            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-zinc-200 ring-1 ring-white/10 transition-colors hover:bg-black/70 hover:text-white"
                            title="Previous"
                        >
                            <ChevronLeft size={19} />
                        </button>
                        <button
                            type="button"
                            onMouseDown={e => { e.stopPropagation(); step(1); }}
                            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-zinc-200 ring-1 ring-white/10 transition-colors hover:bg-black/70 hover:text-white"
                            title="Next"
                        >
                            <ChevronRight size={19} />
                        </button>
                    </>
                )}
            </div>

            <div className="flex shrink-0 justify-center px-6 pb-5" onMouseDown={e => e.stopPropagation()}>
                <div className="flex max-w-full items-center gap-3 rounded-xl bg-[#1a1b1f]/95 px-4 py-2.5 text-[12.5px] shadow-xl ring-1 ring-white/10">
                    {caption && <span className="min-w-0 truncate">{caption}</span>}
                    {count > 1 && <span className="shrink-0 tabular-nums text-zinc-500">{index + 1} / {count}</span>}
                    {isImage && (
                        <button
                            type="button"
                            onClick={() => (zoomed ? resetZoom() : setZoomed(true))}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-semibold text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
                            title={zoomed ? 'Fit to panel' : 'Zoom in'}
                        >
                            {zoomed ? <Minimize2 size={14} /> : <ZoomIn size={14} />}
                            {zoomed ? 'Fit' : 'Zoom'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={beginClose}
                        className="shrink-0 rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200"
                        title="Close (Esc)"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>
        </div>
    );

    return host ? createPortal(body, host) : body;
}
