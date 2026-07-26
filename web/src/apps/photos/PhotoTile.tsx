import { useState } from 'react';
import { Check, Play } from 'lucide-react';

import type { Photo } from '@/core/photosApi';

export function PhotoTile({ photo, selectable, selected, defer, onClick }: {
    photo:       Photo;
    selectable?: boolean;
    selected?:   boolean;
    /**
     * Hold the media out of the DOM entirely. A tile shows a 130px square but the source is a
     * full-size capture (measured: 810x1080, a 3.3MB bitmap once decoded, ~52x the pixels the
     * tile can use). A screenful of those is tens of MB the compositor must rasterize, which is
     * what stalls the app's open animation. The grid still lays out, so the app visibly animates
     * in; only the decode waits for it to land.
     */
    defer?:      boolean;
    onClick:     () => void;
}) {
    const [loaded, setLoaded] = useState(false);
    const media = `h-full w-full object-cover transition-[opacity,transform] duration-300 ${selected ? 'scale-90 ' : ''}${loaded ? 'opacity-100' : 'opacity-0'}`;

    return (
        <button
            type="button"
            onClick={onClick}
            className="relative aspect-square overflow-hidden bg-black/10 active:opacity-80 dark:bg-white/10"
        >
            {defer ? null : photo.video ? (
                <video
                    src={photo.url}
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedData={() => setLoaded(true)}
                    className={media}
                />
            ) : (
                <img
                    src={photo.url}
                    alt=""
                    loading="lazy"
                    // Off the main thread: a synchronous decode per tile is what makes a grid of
                    // freshly fetched photos hitch as they arrive.
                    decoding="async"
                    draggable={false}
                    onLoad={() => setLoaded(true)}
                    ref={el => { if (el?.complete) setLoaded(true); }}
                    className={media}
                />
            )}
            {photo.video && !selectable && (
                <span className="pointer-events-none absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/45">
                    <Play className="h-3 w-3 fill-white text-white" />
                </span>
            )}
            {selectable && (
                <span
                    className={`absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                        selected
                            ? 'border-white bg-ios-blue text-white'
                            : 'border-white/90 bg-black/25'
                    }`}
                >
                    {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
            )}
        </button>
    );
}
