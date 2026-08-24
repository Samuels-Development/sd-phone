import { useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Volume2, X } from 'lucide-react';
import clsx from 'clsx';

import type { AdminContentMedia } from '../../types';

export function MediaStrip({ media, size = 64, max = 6, onOpen, className }: {
    media?: AdminContentMedia[] | null;
    size?: number;
    max?: number;
    onOpen: (index: number) => void;
    className?: string;
}) {
    if (!media?.length) return null;

    const shown = media.slice(0, max);
    const extra = media.length - shown.length;

    return (
        <div className={clsx('flex flex-wrap gap-1.5', className)}>
            {shown.map((m, i) => (
                <button
                    key={`${m.url}-${i}`}
                    type="button"
                    onClick={e => { e.stopPropagation(); onOpen(i); }}
                    style={{ width: size, height: size }}
                    className="group relative shrink-0 overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/[0.08] transition-transform hover:scale-[1.04]"
                    title={m.audio ? 'Play recording' : m.video ? 'Play clip' : 'View full size'}
                >
                    {m.audio ? (
                        <span className="flex h-full w-full items-center justify-center bg-ios-blue/15 text-[#6db4ff]">
                            <Volume2 size={size > 56 ? 22 : 16} />
                        </span>
                    ) : (
                        <img src={m.url} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                    )}
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
                    onClick={e => { e.stopPropagation(); onOpen(max); }}
                    style={{ width: size, height: size }}
                    className="shrink-0 rounded-lg bg-white/[0.05] text-[12px] font-bold text-zinc-400 ring-1 ring-white/[0.08] transition-colors hover:bg-white/[0.09] hover:text-zinc-200"
                >
                    +{extra}
                </button>
            )}
        </div>
    );
}

export function MediaLightbox({ media, index, onIndex, onClose, caption }: {
    media: AdminContentMedia[];
    index: number;
    onIndex: (next: number) => void;
    onClose: () => void;
    caption?: React.ReactNode;
}) {
    const count = media.length;
    const step = useCallback((delta: number) => {
        onIndex((index + delta + count) % count);
    }, [index, count, onIndex]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); return; }
            if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); step(1); }
            if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); step(-1); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose, step]);

    const current = media[index];
    if (!current) return null;

    return (
        <div className="fixed inset-0 z-[420] flex flex-col items-center justify-center gap-3 bg-black/85 p-10" onMouseDown={onClose}>
            <div className="relative flex max-h-[78%] max-w-[80%] items-center" onMouseDown={e => e.stopPropagation()}>
                {current.audio
                    ? <audio src={current.audio} controls autoPlay className="w-[420px] max-w-full rounded-xl bg-[#1a1b1f] p-3 shadow-2xl" />
                    : current.video
                        ? <video src={current.video} poster={current.url} controls autoPlay loop className="max-h-[78vh] max-w-full rounded-xl shadow-2xl" />
                        : <img src={current.url} alt="" className="max-h-[78vh] max-w-full rounded-xl object-contain shadow-2xl" />}
            </div>

            {count > 1 && (
                <>
                    <button
                        type="button"
                        onMouseDown={e => { e.stopPropagation(); step(-1); }}
                        className="absolute left-6 rounded-full bg-white/10 p-3 text-zinc-200 transition-colors hover:bg-white/20"
                        title="Previous"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <button
                        type="button"
                        onMouseDown={e => { e.stopPropagation(); step(1); }}
                        className="absolute right-6 rounded-full bg-white/10 p-3 text-zinc-200 transition-colors hover:bg-white/20"
                        title="Next"
                    >
                        <ChevronRight size={20} />
                    </button>
                </>
            )}

            <div
                className="flex max-w-[80%] items-center gap-3 rounded-xl bg-[#1a1b1f] px-4 py-2.5 text-[12.5px] shadow-xl ring-1 ring-white/10"
                onMouseDown={e => e.stopPropagation()}
            >
                {caption}
                {count > 1 && <span className="tabular-nums text-zinc-500">{index + 1} / {count}</span>}
                <button type="button" onClick={onClose} className="text-zinc-500 transition-colors hover:text-zinc-200" title="Close">
                    <X size={15} />
                </button>
            </div>
        </div>
    );
}
