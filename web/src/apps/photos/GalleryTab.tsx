import { useEffect, useMemo, useRef } from 'react';

import { t } from '@/i18n';
import { groupByDay, type Photo } from '@/core/photosApi';
import { PhotoTile } from './PhotoTile';

export function GalleryTab({
    photos, selectionMode, selectedIds, onEnterSelect, onCancelSelect, onPhotoTap, onToggleSelect, onImport,
    hasMore, loadingMore, onLoadMore, paused, deferMedia,
}: {
    photos:         Photo[];
    selectionMode:  boolean;
    selectedIds:    Set<string>;
    onEnterSelect:  () => void;
    onCancelSelect: () => void;
    onPhotoTap:     (photo: Photo) => void;
    onToggleSelect: (photo: Photo) => void;
    onImport?:      () => void;
    hasMore:        boolean;
    loadingMore:    boolean;
    onLoadMore:     () => void;
    /** True while the Albums tab is showing. The pane stays mounted, so paging must stop. */
    paused?:        boolean;
    /** Keep tile media out of the DOM while the app is animating in. See PhotoTile. */
    deferMedia?:    boolean;
}) {
    const groups = useMemo(() => groupByDay(photos), [photos]);

    const scrollRef   = useRef<HTMLDivElement>(null);
    const sentinelRef = useRef<HTMLDivElement>(null);
    const loadMoreRef = useRef(onLoadMore);
    loadMoreRef.current = onLoadMore;

    // Infinite scroll. The observer root MUST be the scroll container, not the viewport: the
    // phone renders under a CSS zoom, and a viewport-rooted observer computes the wrong
    // intersection and either never fires or fires constantly.
    useEffect(() => {
        const sentinel = sentinelRef.current;
        const root     = scrollRef.current;
        if (!sentinel || !root || !hasMore || paused) return;
        const io = new IntersectionObserver(
            entries => { if (entries.some(e => e.isIntersecting)) loadMoreRef.current(); },
            { root, rootMargin: '600px 0px' },
        );
        io.observe(sentinel);
        return () => io.disconnect();
    }, [hasMore, paused]);

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-12 shrink-0 items-center justify-end gap-2 px-4">
                {onImport && !selectionMode && (
                    <button
                        type="button"
                        onClick={onImport}
                        className="rounded-full bg-black/[0.07] px-4 py-1.5 text-[15px] font-medium text-black/80 dark:bg-white/15 dark:text-white/85"
                    >
                        {t('photos.import', 'Import')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={selectionMode ? onCancelSelect : onEnterSelect}
                    className="rounded-full bg-black/[0.07] px-4 py-1.5 text-[15px] font-medium text-black/80 dark:bg-white/15 dark:text-white/85"
                >
                    {selectionMode ? t('photos.cancel','Cancel') : t('photos.select','Select')}
                </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar pb-2">
                {groups.map(group => (
                    // Off-screen day sections skip layout, paint and image decode entirely, so
                    // the cost of the grid stops tracking how far the player has scrolled. Without
                    // it every mounted tile is restyled on each tab switch, deck re-parent and
                    // app reopen, which is what made a paged gallery still feel heavy.
                    // `auto` in contain-intrinsic-size makes the browser remember each section's
                    // real height once measured, so the scrollbar does not jump.
                    <section
                        key={group.key}
                        className="mb-3"
                        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 240px' }}
                    >
                        <h2 className="px-4 pb-2 pt-1 text-[16px] font-bold tracking-tight text-black dark:text-white">
                            {group.label}
                        </h2>
                        <div className="grid grid-cols-3 gap-[2px]">
                            {group.photos.map(p => (
                                <PhotoTile
                                    key={p.id}
                                    photo={p}
                                    selectable={selectionMode}
                                    selected={selectedIds.has(p.id)}
                                    defer={deferMedia}
                                    onClick={() => (selectionMode ? onToggleSelect(p) : onPhotoTap(p))}
                                />
                            ))}
                        </div>
                    </section>
                ))}

                {hasMore && (
                    <div ref={sentinelRef} className="flex h-12 items-center justify-center">
                        {loadingMore && (
                            <span className="text-[13px] text-black/45 dark:text-white/45">
                                {t('photos.loadingMore', 'Loading more…')}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
