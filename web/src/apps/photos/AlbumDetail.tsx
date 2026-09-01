import { useState } from 'react';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';

import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import type { Photo } from '@/core/photosApi';
import { PhotoTile } from './PhotoTile';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

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
    const { goBack, pageStyle } = useIosPush(onBack);
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
        <div className="absolute inset-0 z-20 flex flex-col bg-base" style={pageStyle}>
            <StatusBarSpacer />
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

            <div
                className="flex-1 overflow-y-auto no-scrollbar"
                style={{
                    paddingBottom: isCustom && selectMode ? 112 : 8,
                    transition:    'padding-bottom 0.28s cubic-bezier(0.32,0.72,0,1)',
                }}
            >
                <h1 className="px-4 pb-3 pt-1 text-[26px] font-bold tracking-tight">{title}</h1>

                {photos.length === 0 && !isCustom ? (
                    <p className="px-4 pt-6 text-center text-[14px] text-black/45 dark:text-white/45">
                        {t('photos.noPhotosHereYet','No photos here yet.')}
                    </p>
                ) : (
                    <div className="grid grid-cols-3 gap-[2px]">
                        {isCustom && (
                            <button
                                type="button"
                                onClick={onAddPhotos}
                                disabled={selectMode}
                                tabIndex={selectMode ? -1 : undefined}
                                className="flex aspect-square items-center justify-center bg-black/5 transition-opacity duration-200 active:bg-black/10 disabled:opacity-35 dark:bg-white/5"
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

            {isCustom && (
                <div
                    aria-hidden={!selectMode}
                    className="absolute inset-x-0 bottom-0 flex items-stretch justify-around border-t border-black/10 bg-elevated px-1 pb-9 pt-2.5 dark:border-white/10 dark:bg-base"
                    style={{
                        transform:     selectMode ? 'translateY(0)' : 'translateY(100%)',
                        transition:    'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
                        pointerEvents: selectMode ? undefined : 'none',
                        willChange:    'transform',
                    }}
                >
                    <button
                        type="button"
                        tabIndex={selectMode ? undefined : -1}
                        disabled={selected.size === 0}
                        onClick={() => { onRemovePhotos?.(Array.from(selected)); exitSelect(); }}
                        className="flex flex-1 flex-col items-center gap-1.5 py-1 text-ios-red disabled:opacity-40"
                    >
                        <Trash2 className="h-[33px] w-[33px]" strokeWidth={1.9} />
                        <span className="text-[15px] font-bold tracking-tight">
                            {t('photos.remove','Remove')}{selected.size > 0 ? ` (${selected.size})` : ''}
                        </span>
                    </button>
                </div>
            )}
        </div>
    );
}
