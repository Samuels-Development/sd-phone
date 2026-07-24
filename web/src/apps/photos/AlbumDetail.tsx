import { useState } from 'react';
import { ChevronLeft, Plus } from 'lucide-react';

import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import type { Photo } from '@/core/photosApi';
import { PhotoTile } from './PhotoTile';

export function AlbumDetail({
    title, photos, isCustom, onBack, onPhotoTap, onAddPhotos, onRemovePhotos,
}: {
    title:          string;
    photos:         Photo[];
    isCustom:       boolean;
    onBack:         () => void;
    onPhotoTap:     (photo: Photo) => void;
    onAddPhotos?:   () => void;
    onRemovePhotos?: (ids: string[]) => void;
}) {
    const { goBack, pageStyle, animating } = useIosPush(onBack);
    const [selectMode, setSelectMode] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    function toggle(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function exitSelect() {
        setSelectMode(false);
        setSelected(new Set());
    }

    return (
        <div className="absolute inset-0 z-20 flex flex-col bg-[#d4d4d4] dark:bg-base" style={pageStyle}>
            <div className="h-[54px] shrink-0" aria-hidden />
            <div className="flex h-11 shrink-0 items-center justify-between px-2">
                <button type="button" onClick={goBack} className="flex items-center text-ios-blue">
                    <ChevronLeft className="h-7 w-7" strokeWidth={2.4} />
                    <span className="-ml-1 text-[16px] font-medium">{t('photos.albums','Albums')}</span>
                </button>
                {isCustom && (
                    <button
                        type="button"
                        onClick={selectMode ? exitSelect : () => setSelectMode(true)}
                        className="px-2 text-[16px] font-medium text-ios-blue"
                    >
                        {selectMode ? t('photos.cancel','Cancel') : t('photos.select','Select')}
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
                <h1 className="px-4 pb-3 pt-1 text-[26px] font-bold tracking-tight">{title}</h1>

                {photos.length === 0 && !isCustom ? (
                    <p className="px-4 pt-6 text-center text-[14px] text-black/45 dark:text-white/45">
                        {t('photos.noPhotosHereYet','No photos here yet.')}
                    </p>
                ) : (
                    <div className="grid grid-cols-3 gap-[2px]">
                        {isCustom && !selectMode && (
                            <button
                                type="button"
                                onClick={onAddPhotos}
                                className="flex aspect-square items-center justify-center bg-black/5 active:bg-black/10 dark:bg-white/5"
                                aria-label={t('photos.addPhotos','Add photos')}
                            >
                                <Plus className="h-8 w-8 text-ios-blue" strokeWidth={2} />
                            </button>
                        )}
                        {photos.map(p => (
                            <PhotoTile
                                key={p.id}
                                photo={p}
                                selectable={selectMode}
                                selected={selected.has(p.id)}
                                onClick={() => (selectMode ? toggle(p.id) : onPhotoTap(p))}
                            />
                        ))}
                    </div>
                )}
            </div>

            {isCustom && selectMode && (
                <div className={`flex shrink-0 items-center justify-center gap-2 border-t border-black/10 px-4 pb-7 pt-3 dark:border-white/10 ${animating ? 'bg-[#f7f7f7] dark:bg-base' : 'bg-[#f7f7f7]/95 backdrop-blur-xl dark:bg-base/80'}`}>
                    <button
                        type="button"
                        disabled={selected.size === 0}
                        onClick={() => { onRemovePhotos?.(Array.from(selected)); exitSelect(); }}
                        className="rounded-full bg-[#ff3b30] px-5 py-2 text-[15px] font-semibold text-white disabled:opacity-40"
                    >
                        {t('photos.remove','Remove')}{selected.size > 0 ? ` (${selected.size})` : ''}
                    </button>
                </div>
            )}
        </div>
    );
}
