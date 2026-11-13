import { useState } from 'react';
import { Check, Heart, Play } from 'lucide-react';

import type { Photo } from '@/core/photosApi';

export function PhotoTile({ photo, selectable, selected, showFavorite, defer, onClick }: {
    photo:       Photo;
    selectable?: boolean;
    selected?:   boolean;
    showFavorite?: boolean;
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
                    decoding="async"
                    draggable={false}
                    onLoad={() => setLoaded(true)}
                    ref={el => { if (el?.complete) setLoaded(true); }}
                    className={media}
                />
            )}
            {photo.favorite && selectable && showFavorite && (
                <span className="pointer-events-none absolute bottom-1 start-1">
                    <Heart className="h-[18px] w-[18px] fill-ios-red text-ios-red drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]" />
                </span>
            )}
            {photo.video && (
                <span className={`pointer-events-none absolute flex h-5 w-5 items-center justify-center rounded-full bg-black/45 ${selectable ? 'start-1 top-1' : 'bottom-1 end-1'}`}>
                    <Play className="h-3 w-3 fill-white text-white" />
                </span>
            )}
            {selectable && (
                <span
                    className={`absolute bottom-1 end-1 flex h-5 w-5 items-center justify-center rounded-full border-2 ${
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
