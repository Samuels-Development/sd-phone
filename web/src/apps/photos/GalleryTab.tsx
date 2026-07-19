import { useMemo } from 'react';

import { t } from '@/i18n';
import { groupByDay, type Photo } from '@/core/photosApi';
import { PhotoTile } from './PhotoTile';

export function GalleryTab({
    photos, selectionMode, selectedIds, onEnterSelect, onCancelSelect, onPhotoTap, onToggleSelect, onImport,
}: {
    photos:         Photo[];
    selectionMode:  boolean;
    selectedIds:    Set<string>;
    onEnterSelect:  () => void;
    onCancelSelect: () => void;
    onPhotoTap:     (photo: Photo) => void;
    onToggleSelect: (photo: Photo) => void;
    onImport?:      () => void;
}) {
    const groups = useMemo(() => groupByDay(photos), [photos]);

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

            <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
                {groups.map(group => (
                    <section key={group.key} className="mb-3">
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
                                    onClick={() => (selectionMode ? onToggleSelect(p) : onPhotoTap(p))}
                                />
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
