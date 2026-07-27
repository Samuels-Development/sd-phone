import { useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';

import { Sheet } from '@/ui/Sheet';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import {
    apiListAlbumPhotos, apiListAlbums, apiListPhotos, groupByDay,
    type Album, type Photo,
} from '@/core/photosApi';
import { PhotoTile } from '@/apps/photos/PhotoTile';

export function MediaPickerSheet({ onSelect, onSelectMany, multiple = false, max, forceDark = false, initialSelectedUrls, filter, onClose }: {
    onSelect?:     (photo: Photo) => void;
    onSelectMany?: (photos: Photo[]) => void;
    multiple?:     boolean;
    max?:          number;
    forceDark?:    boolean;
    initialSelectedUrls?: string[];
    filter?:       (p: Photo) => boolean;
    onClose:       () => void;
}) {
    const [seg,      setSeg]      = useState<'photos' | 'albums'>('photos');
    const [selected, setSelected] = useState<Photo[]>([]);

    const selectedIds = new Set(selected.map(p => p.id));

    function pick(p: Photo) {
        if (!multiple) { setSelected([p]); return; }
        setSelected(prev => {
            if (prev.some(x => x.id === p.id)) return prev.filter(x => x.id !== p.id);
            if (max && prev.length >= max) return prev;
            return [...prev, p];
        });
    }

    function confirm() {
        if (selected.length === 0) return;
        if (multiple) onSelectMany?.(selected);
        else onSelect?.(selected[0]);
    }

    const [openAlbum,    setOpenAlbum]    = useState<Album | null>(null);
    const [albumPhotos,  setAlbumPhotos]  = useState<Photo[]>([]);
    const [albumLoading, setAlbumLoading] = useState(false);

    const { data: lib, loading } = useAsyncData<{ photos: Photo[]; albums: Album[] }>(
        async () => {
            // First page only: the picker shows recent media, not the whole library.
            const [page, as] = await Promise.all([apiListPhotos(), apiListAlbums()]);
            return { photos: page.photos, albums: as };
        },
        [],
        {
            onData: d => {
                if (initialSelectedUrls && initialSelectedUrls.length > 0) {
                    const byUrl = new Map(d.photos.map(p => [p.url, p]));
                    const pre = initialSelectedUrls.map(u => byUrl.get(u)).filter((p): p is Photo => !!p);
                    if (pre.length > 0) setSelected(pre);
                }
            },
        },
    );
    const photos = lib?.photos ?? [];
    const albums = lib?.albums ?? [];

    async function openAlbumRef(album: Album) {
        setOpenAlbum(album);
        setAlbumLoading(true);
        const ps = await apiListAlbumPhotos(album.id);
        setAlbumPhotos(ps);
        setAlbumLoading(false);
    }

    return (
        <Sheet onClose={onClose} grabber={false} forceDark={forceDark} className="font-sf bg-[#d4d4d4] dark:bg-base">
            {({ close }) => (
                <>
                    <div className="flex h-12 shrink-0 items-center px-4 pt-1">
                        <div className="flex flex-1 justify-start">
                            <button type="button" onClick={close} className="text-[16px] text-ios-blue active:opacity-60">
                                {t('photos.cancel', 'Cancel')}
                            </button>
                        </div>

                        <div className="flex shrink-0 justify-center">
                            {openAlbum ? (
                                <span className="max-w-[150px] truncate text-[15px] font-semibold text-black dark:text-white">
                                    {openAlbum.name}
                                </span>
                            ) : (
                                <SegmentedControl
                                    value={seg}
                                    onChange={setSeg}
                                    options={[
                                        { value: 'photos', label: t('photos.photosTab', 'Photos') },
                                        { value: 'albums', label: t('photos.albums', 'Albums') },
                                    ]}
                                    className="w-[200px]"
                                />
                            )}
                        </div>

                        <div className="flex flex-1 justify-end">
                            <button
                                type="button"
                                onClick={confirm}
                                disabled={selected.length === 0}
                                className={`text-[16px] font-semibold ${selected.length ? 'text-ios-blue active:opacity-60' : 'text-ios-gray/50'}`}
                            >
                                {multiple
                                    ? `${t('photos.add', 'Add')}${selected.length ? ` (${selected.length}${max ? `/${max}` : ''})` : ''}`
                                    : t('photos.select', 'Select')}
                            </button>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-3">
                        {loading ? (
                            <p className="px-4 pt-10 text-center text-[14px] text-ios-gray">{t('photos.loading', 'Loading…')}</p>
                        ) : seg === 'photos' ? (
                            <PhotoGrid photos={filter ? photos.filter(filter) : photos} selectedIds={selectedIds} onPick={pick} />
                        ) : openAlbum ? (
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setOpenAlbum(null)}
                                    className="flex items-center gap-0.5 px-2 pb-1 pt-1 text-[16px] text-ios-blue active:opacity-60"
                                >
                                    <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.4} /> {t('photos.albums', 'Albums')}
                                </button>
                                {albumLoading
                                    ? <p className="px-4 pt-10 text-center text-[14px] text-ios-gray">{t('photos.loading', 'Loading…')}</p>
                                    : <PhotoGrid photos={filter ? albumPhotos.filter(filter) : albumPhotos} selectedIds={selectedIds} onPick={pick} />}
                            </div>
                        ) : (
                            <AlbumList albums={albums} onOpen={openAlbumRef} />
                        )}
                    </div>
                </>
            )}
        </Sheet>
    );
}

function PhotoGrid({ photos, selectedIds, onPick }: {
    photos:      Photo[];
    selectedIds: Set<string>;
    onPick:      (p: Photo) => void;
}) {
    const groups = useMemo(() => groupByDay(photos), [photos]);

    if (photos.length === 0) {
        return <p className="px-4 pt-10 text-center text-[14px] text-ios-gray">{t('photos.noPhotosToChoose', 'No photos to choose from.')}</p>;
    }

    return (
        <>
            {groups.map(group => (
                <section key={group.key} className="mb-3">
                    <h2 className="px-4 pb-2 pt-1 text-[15px] font-bold tracking-tight text-black dark:text-white">{group.label}</h2>
                    <div className="grid grid-cols-3 gap-[2px]">
                        {group.photos.map(p => (
                            <PhotoTile
                                key={p.id}
                                photo={p}
                                selectable
                                selected={selectedIds.has(p.id)}
                                onClick={() => onPick(p)}
                            />
                        ))}
                    </div>
                </section>
            ))}
        </>
    );
}

function AlbumList({ albums, onOpen }: { albums: Album[]; onOpen: (a: Album) => void }) {
    if (albums.length === 0) {
        return <p className="px-4 pt-10 text-center text-[14px] text-ios-gray">{t('photos.noAlbumsYet', 'No albums yet.')}</p>;
    }

    return (
        <div className="grid grid-cols-2 gap-3 px-4 pt-2">
            {albums.map(a => (
                <button key={a.id} type="button" onClick={() => onOpen(a)} className="text-left active:opacity-70">
                    <div className="aspect-square overflow-hidden rounded-[12px] bg-black/10 dark:bg-white/10">
                        {a.cover && <img src={a.cover} alt="" draggable={false} className="h-full w-full object-cover" />}
                    </div>
                    <div className="mt-1.5 truncate text-[14px] font-semibold text-black dark:text-white">{a.name}</div>
                    <div className="text-[12px] text-ios-gray">{a.count}</div>
                </button>
            ))}
        </div>
    );
}
