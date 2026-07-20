import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, FolderPlus, Heart, MoreHorizontal, Trash2, Wallpaper } from 'lucide-react';

import { t } from '@/i18n';
import type { Photo } from '@/core/photosApi';
import { useThemeStore } from '@/stores/themeStore';
import { VideoView } from './VideoView';

function fmtDate(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

function fmtTime(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function IosShareIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            className={className} aria-hidden
        >
            <path d="M12 15V3" />
            <path d="m8 7 4-4 4 4" />
            <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7" />
        </svg>
    );
}

export function PhotoViewer({
    photos, index, onClose, onIndexChange, onToggleFavorite, onAddToAlbum, onDelete,
}: {
    photos:           Photo[];
    index:            number;
    onClose:          () => void;
    onIndexChange:    (i: number) => void;
    onToggleFavorite: (photo: Photo) => void;
    onAddToAlbum:     (photo: Photo) => void;
    onDelete:         (photo: Photo) => void;
}) {
    const [drag, setDrag] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [wallpaperHud, setWallpaperHud] = useState(0);
    const startX = useRef(0);
    const activeThumb = useRef<HTMLButtonElement | null>(null);

    function close() {
        if (leaving) return;
        setLeaving(true);
        window.setTimeout(onClose, 200);
    }

    useEffect(() => {
        if (photos.length === 0) { onClose(); return; }
        if (index > photos.length - 1) onIndexChange(photos.length - 1);
    }, [photos.length, index, onClose, onIndexChange]);

    useEffect(() => {
        activeThumb.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [index]);

    const current = photos[index];
    if (!current) return null;

    function endDrag() {
        if (!dragging) return;
        setDragging(false);
        const threshold = 55;
        if (drag < -threshold && index < photos.length - 1) onIndexChange(index + 1);
        else if (drag > threshold && index > 0) onIndexChange(index - 1);
        setDrag(0);
    }

    return (
        <div
            className="absolute inset-0 z-40 flex flex-col bg-[#d4d4d4] text-black dark:bg-base dark:text-white"
            style={{ animation: leaving ? 'photo-out 0.2s ease-in forwards' : 'photo-in 0.24s cubic-bezier(0.22,1,0.36,1)' }}
        >
            <div className="h-[54px] shrink-0" aria-hidden />

            <div className="flex h-14 shrink-0 items-center justify-between px-4">
                <button type="button" onClick={close} aria-label={t('photos.back', 'Back')} className="text-ios-blue">
                    <ChevronLeft className="h-7 w-7" strokeWidth={2.4} />
                </button>
                <div className="text-center leading-tight">
                    <div className="text-[15px] font-semibold">{fmtDate(current.date)}</div>
                    <div className="text-[13px] text-black/45 dark:text-white/45">{fmtTime(current.date)}</div>
                </div>
                <button
                    type="button"
                    onClick={() => setMenuOpen(v => !v)}
                    aria-label={t('photos.moreOptions', 'More options')}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-ios-blue/15 text-ios-blue"
                >
                    <MoreHorizontal className="h-5 w-5" strokeWidth={2.4} />
                </button>
            </div>

            <div
                className="relative flex-1 overflow-hidden"
                style={{ touchAction: 'pan-y' }}
                onPointerDown={e => {
                    setDragging(true);
                    startX.current = e.clientX;
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={e => { if (dragging) setDrag(e.clientX - startX.current); }}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
            >
                <div
                    className="flex h-full"
                    style={{
                        transform: `translateX(calc(${-index * 100}% + ${drag}px))`,
                        transition: dragging ? 'none' : 'transform 0.25s ease-out',
                    }}
                >
                    {photos.map((p, i) => (
                        <div key={p.id} className="flex h-full w-full shrink-0 items-center justify-center">
                            {p.video ? (
                                <VideoView src={p.url} active={i === index} />
                            ) : (
                                <img src={p.url} alt="" draggable={false} className="h-full w-full object-cover" />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Full-bleed portrait filmstrip: no side padding, so the end thumbs
                clip against the screen edges to hint there's more to scroll; the
                active thumb centres itself (scrollIntoView) and stands a bit taller. */}
            <div className="shrink-0 pb-1 pt-2">
                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {photos.map((p, i) => {
                        const active = i === index;
                        return (
                            <button
                                key={p.id}
                                ref={active ? activeThumb : undefined}
                                type="button"
                                onClick={() => onIndexChange(i)}
                                className={`shrink-0 overflow-hidden rounded-[7px] transition-all ${
                                    active ? 'h-[84px] w-[59px] ring-2 ring-ios-blue' : 'h-[70px] w-[49px] opacity-90'
                                }`}
                            >
                                {p.video ? (
                                    <video src={p.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                                ) : (
                                    <img src={p.url} alt="" draggable={false} className="h-full w-full object-cover" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex shrink-0 items-center justify-between px-8 pb-16 pt-3">
                <button type="button" onClick={() => onAddToAlbum(current)} aria-label={t('photos.share', 'Share')} className="text-ios-blue">
                    <IosShareIcon className="h-[32px] w-[32px]" />
                </button>
                <button type="button" onClick={() => onToggleFavorite(current)} aria-label={t('photos.favourite', 'Favourite')} className="text-ios-blue">
                    <Heart className={`h-[32px] w-[32px] ${current.favorite ? 'fill-ios-blue' : ''}`} strokeWidth={2} />
                </button>
            </div>

            {menuOpen && (
                <>
                    <div className="absolute inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-3 top-[108px] z-20 w-56 overflow-hidden rounded-[14px] bg-white/95 shadow-xl backdrop-blur-xl dark:bg-elevated/95">
                        <button
                            type="button"
                            onClick={() => { setMenuOpen(false); onAddToAlbum(current); }}
                            className="flex w-full items-center justify-between px-4 py-3 text-[16px] active:bg-black/5 dark:active:bg-white/10"
                        >
                            {t('photos.addToAlbum', 'Add to Album')}
                            <FolderPlus className="h-5 w-5" strokeWidth={2} />
                        </button>
                        {!current.video && (
                            <>
                                <div className="h-px bg-black/10 dark:bg-white/10" />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setMenuOpen(false);
                                        useThemeStore.getState().setWallpaper(current.url);
                                        setWallpaperHud(v => v + 1);
                                    }}
                                    className="flex w-full items-center justify-between px-4 py-3 text-[16px] active:bg-black/5 dark:active:bg-white/10"
                                >
                                    {t('photos.useAsWallpaper', 'Use as Wallpaper')}
                                    <Wallpaper className="h-5 w-5" strokeWidth={2} />
                                </button>
                            </>
                        )}
                        <div className="h-px bg-black/10 dark:bg-white/10" />
                        <button
                            type="button"
                            onClick={() => { setMenuOpen(false); onDelete(current); }}
                            className="flex w-full items-center justify-between px-4 py-3 text-[16px] text-[#ff3b30] active:bg-black/5 dark:active:bg-white/10"
                        >
                            {t('photos.delete', 'Delete')}
                            <Trash2 className="h-5 w-5" strokeWidth={2} />
                        </button>
                    </div>
                </>
            )}

            {wallpaperHud > 0 && (
                <div key={wallpaperHud} className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
                    <div
                        className="flex flex-col items-center gap-2 rounded-[18px] bg-black/75 px-7 py-5 text-white"
                        style={{ animation: 'wallpaper-hud 1.5s ease forwards' }}
                        onAnimationEnd={() => setWallpaperHud(0)}
                    >
                        <Wallpaper className="h-8 w-8" strokeWidth={1.8} />
                        <span className="text-[14px] font-medium">{t('photos.wallpaperSet', 'Wallpaper Set')}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
