import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera as CameraIcon, FolderPlus, Heart, Trash2 } from 'lucide-react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { t } from '@/i18n';
import { PromptDialog } from '@/ui/PromptDialog';
import {
    apiAddPhotosToAlbum, apiCreateAlbum, apiDeleteAlbum, apiDeletePhoto,
    apiListAlbumPhotos, apiListAlbums, apiListPhotos, apiListSharedAlbums,
    apiRemovePhotoFromAlbum, apiSavePhotoFromUrl, apiSetFavorite, getCanImportPhotos, mapPhoto,
    type Album, type AlbumRef, type Photo,
} from '@/core/photosApi';
import { AlbumDetail } from './AlbumDetail';
import { AlbumPickerSheet } from './AlbumPickerSheet';
import { AlbumsTab } from './AlbumsTab';
import { GalleryTab } from './GalleryTab';
import { PhotoPicker } from './PhotoPicker';
import { PhotoTabBar, type PhotosTab } from './PhotoTabBar';
import { PhotoViewer } from './PhotoViewer';

interface ViewerState { source: 'gallery' | 'album'; index: number }
interface CreateState { addIds: string[] }

export function Photos({ onClose }: { onClose: () => void }) {
    const [tab,     setTab]     = useSessionState<PhotosTab>('photos:tab', 'gallery');
    const [photos,  setPhotos]  = useState<Photo[]>([]);
    const [albums,  setAlbums]  = useState<Album[]>([]);
    const [sharedAlbums, setSharedAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(true);

    const [gallerySelect, setGallerySelect] = useState(false);
    const [gallerySelected, setGallerySelected] = useState<Set<string>>(new Set());

    const [albumsEdit, setAlbumsEdit] = useState(false);
    const [canImport,  setCanImport]  = useState(false);
    const [importOpen, setImportOpen] = useState(false);

    const [openAlbum, setOpenAlbum] = useSessionState<AlbumRef | null>('photos:openAlbum', null);
    const [customAlbumPhotos, setCustomAlbumPhotos] = useState<Photo[]>([]);

    const [viewer, setViewer] = useState<ViewerState | null>(null);
    const [albumPicker, setAlbumPicker] = useState<{ photoIds: string[] } | null>(null);
    const [photoPicker, setPhotoPicker] = useState(false);
    const [createState, setCreateState] = useState<CreateState | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [ps, as, shared] = await Promise.all([apiListPhotos(), apiListAlbums(), apiListSharedAlbums()]);
            if (cancelled) return;
            setPhotos(ps);
            setAlbums(as);
            setSharedAlbums(shared);
            setCanImport(getCanImportPhotos());
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (openAlbum?.kind !== 'custom') return;
        let cancelled = false;
        void apiListAlbumPhotos(openAlbum.id).then(ps => { if (!cancelled) setCustomAlbumPhotos(ps); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useNuiEvent('sd-phone:photos:added', useCallback((photo: unknown) => {
        if (!photo || typeof photo !== 'object') return;
        const p = mapPhoto(photo as { id: string; url: string; createdAt: string | number });
        if (!p.id || !p.url) return;
        setPhotos(prev => (prev.some(x => x.id === p.id) ? prev : [p, ...prev]));
    }, []));

    const favourites = useMemo(() => photos.filter(p => p.favorite), [photos]);

    const refreshAlbums = useCallback(async () => {
        setAlbums(await apiListAlbums());
    }, []);

    function albumPhotosFor(ref: AlbumRef): Photo[] {
        if (ref.kind === 'recents')    return photos;
        if (ref.kind === 'favourites') return favourites;
        if (ref.kind === 'mediaType')  return ref.mediaType === 'videos' ? photos.filter(p => p.video) : [];
        return customAlbumPhotos;
    }

    async function openAlbumRef(ref: AlbumRef) {
        setOpenAlbum(ref);
        setCustomAlbumPhotos([]);
        if (ref.kind === 'custom') {
            setCustomAlbumPhotos(await apiListAlbumPhotos(ref.id));
        }
    }

    async function toggleFavorite(photo: Photo) {
        const next = !photo.favorite;
        const apply = (arr: Photo[]) => arr.map(p => (p.id === photo.id ? { ...p, favorite: next } : p));
        setPhotos(apply);
        setCustomAlbumPhotos(apply);
        const ok = await apiSetFavorite(photo.id, next);
        if (!ok) {
            const revert = (arr: Photo[]) => arr.map(p => (p.id === photo.id ? { ...p, favorite: photo.favorite } : p));
            setPhotos(revert);
            setCustomAlbumPhotos(revert);
        }
    }

    async function favoritePhotos(ids: string[]) {
        if (ids.length === 0) return;
        const set = new Set(ids);
        const chosen = photos.filter(p => set.has(p.id));
        // Batch toggle: if everything selected is already a favourite, unfavourite all; else
        // favourite all. Optimistic, with the Favourites album count refreshed after.
        const next = !(chosen.length > 0 && chosen.every(p => p.favorite));
        const apply = (arr: Photo[]) => arr.map(p => (set.has(p.id) ? { ...p, favorite: next } : p));
        setPhotos(apply);
        setCustomAlbumPhotos(apply);
        for (const id of ids) await apiSetFavorite(id, next);
        void refreshAlbums();
    }

    async function deletePhotos(ids: string[]) {
        let any = false;
        for (const id of ids) { if (await apiDeletePhoto(id)) any = true; }
        if (!any) return;
        const drop = (arr: Photo[]) => arr.filter(p => !ids.includes(p.id));
        setPhotos(drop);
        setCustomAlbumPhotos(drop);
        void refreshAlbums();
    }

    async function addToAlbum(albumId: string, ids: string[]) {
        if (!await apiAddPhotosToAlbum(albumId, ids)) return;
        await refreshAlbums();
        if (openAlbum?.kind === 'custom' && openAlbum.id === albumId) {
            setCustomAlbumPhotos(await apiListAlbumPhotos(albumId));
        }
    }

    async function removeFromAlbum(albumId: string, ids: string[]) {
        for (const id of ids) await apiRemovePhotoFromAlbum(albumId, id);
        await refreshAlbums();
        if (openAlbum?.kind === 'custom' && openAlbum.id === albumId) {
            setCustomAlbumPhotos(prev => prev.filter(p => !ids.includes(p.id)));
        }
    }

    async function submitCreate(rawName: string) {
        const name = rawName.trim();
        if (!name) return;
        const addIds = createState?.addIds ?? [];
        setCreateState(null);
        const album = await apiCreateAlbum(name);
        if (!album) return;
        setAlbums(prev => [album, ...prev]);
        if (addIds.length) await addToAlbum(album.id, addIds);
        exitGallerySelect();
    }

    function exitGallerySelect() {
        setGallerySelect(false);
        setGallerySelected(new Set());
    }

    function toggleGallerySelect(photo: Photo) {
        setGallerySelected(prev => {
            const next = new Set(prev);
            if (next.has(photo.id)) next.delete(photo.id); else next.add(photo.id);
            return next;
        });
    }

    function openViewerFromGallery(photo: Photo) {
        const i = photos.findIndex(p => p.id === photo.id);
        if (i >= 0) setViewer({ source: 'gallery', index: i });
    }

    function openViewerFromAlbum(photo: Photo) {
        if (!openAlbum) return;
        const i = albumPhotosFor(openAlbum).findIndex(p => p.id === photo.id);
        if (i >= 0) setViewer({ source: 'album', index: i });
    }

    const viewerList = viewer
        ? (viewer.source === 'album' && openAlbum ? albumPhotosFor(openAlbum) : photos)
        : [];

    const isEmpty = !loading && photos.length === 0;

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-[#d4d4d4] text-black dark:bg-base dark:text-white">
            <div className="h-[54px] shrink-0" aria-hidden />

            <div className="relative flex-1 min-h-0">
                {loading ? (
                    <div className="flex h-full items-center justify-center text-[13px] text-black/45 dark:text-white/45">
                        {t('photos.loading','Loading…')}
                    </div>
                ) : (
                    <div key={tab} className="flex h-full min-h-0 flex-col animate-swipe-in-left">
                        {tab === 'gallery' && isEmpty ? (
                            <EmptyState />
                        ) : tab === 'gallery' ? (
                            <GalleryTab
                                photos={photos}
                                selectionMode={gallerySelect}
                                selectedIds={gallerySelected}
                                onEnterSelect={() => setGallerySelect(true)}
                                onCancelSelect={exitGallerySelect}
                                onPhotoTap={openViewerFromGallery}
                                onToggleSelect={toggleGallerySelect}
                                onImport={canImport ? () => setImportOpen(true) : undefined}
                            />
                        ) : (
                            <AlbumsTab
                                photos={photos}
                                albums={albums}
                                sharedAlbums={sharedAlbums}
                                editMode={albumsEdit}
                                onToggleEdit={() => setAlbumsEdit(v => !v)}
                                onCreateAlbum={() => setCreateState({ addIds: [] })}
                                onOpenAlbum={openAlbumRef}
                                onDeleteAlbum={async (a) => { if (await apiDeleteAlbum(a.id)) setAlbums(prev => prev.filter(x => x.id !== a.id)); }}
                            />
                        )}
                    </div>
                )}
            </div>

            {tab === 'gallery' && gallerySelect ? (
                <div className="flex shrink-0 items-stretch justify-around border-t border-black/10 bg-[#f7f7f7]/95 px-1 pb-9 pt-2.5 backdrop-blur-xl dark:border-white/10 dark:bg-base/80">
                    <button
                        type="button"
                        disabled={gallerySelected.size === 0}
                        onClick={() => setAlbumPicker({ photoIds: Array.from(gallerySelected) })}
                        className="flex flex-1 flex-col items-center gap-1.5 py-1 text-ios-blue disabled:opacity-40"
                    >
                        <FolderPlus className="h-[33px] w-[33px]" strokeWidth={1.9} />
                        <span className="text-[15px] font-bold tracking-tight">{t('photos.addToAlbum','Add to Album')}</span>
                    </button>
                    <button
                        type="button"
                        disabled={gallerySelected.size === 0}
                        onClick={() => favoritePhotos(Array.from(gallerySelected)).then(exitGallerySelect)}
                        className="flex flex-1 flex-col items-center gap-1.5 py-1 text-ios-blue disabled:opacity-40"
                    >
                        <Heart className="h-[31px] w-[31px]" strokeWidth={1.9} />
                        <span className="text-[15px] font-bold tracking-tight">{t('photos.favourite','Favourite')}</span>
                    </button>
                    <button
                        type="button"
                        disabled={gallerySelected.size === 0}
                        onClick={() => deletePhotos(Array.from(gallerySelected)).then(exitGallerySelect)}
                        className="flex flex-1 flex-col items-center gap-1.5 py-1 text-[#ff3b30] disabled:opacity-40"
                    >
                        <Trash2 className="h-[33px] w-[33px]" strokeWidth={1.9} />
                        <span className="text-[15px] font-bold tracking-tight">{t('photos.delete','Delete')}</span>
                    </button>
                </div>
            ) : (
                <PhotoTabBar tab={tab} onChange={(t) => { setTab(t); exitGallerySelect(); setAlbumsEdit(false); }} />
            )}

            {openAlbum && (
                <AlbumDetail
                    title={openAlbum.name}
                    photos={albumPhotosFor(openAlbum)}
                    isCustom={openAlbum.kind === 'custom'}
                    onBack={() => setOpenAlbum(null)}
                    onPhotoTap={openViewerFromAlbum}
                    onAddPhotos={openAlbum.kind === 'custom' ? () => setPhotoPicker(true) : undefined}
                    onRemovePhotos={openAlbum.kind === 'custom'
                        ? (ids) => { if (openAlbum.kind === 'custom') void removeFromAlbum(openAlbum.id, ids); }
                        : undefined}
                />
            )}

            {viewer && (
                <PhotoViewer
                    photos={viewerList}
                    index={viewer.index}
                    onClose={() => setViewer(null)}
                    onIndexChange={(i) => setViewer(v => (v ? { ...v, index: i } : v))}
                    onToggleFavorite={toggleFavorite}
                    onAddToAlbum={(p) => setAlbumPicker({ photoIds: [p.id] })}
                    onDelete={(p) => void deletePhotos([p.id])}
                />
            )}

            {photoPicker && openAlbum?.kind === 'custom' && (
                <PhotoPicker
                    photos={photos}
                    existingIds={new Set(customAlbumPhotos.map(p => p.id))}
                    onClose={() => setPhotoPicker(false)}
                    onConfirm={(ids) => { if (openAlbum.kind === 'custom') void addToAlbum(openAlbum.id, ids); setPhotoPicker(false); }}
                />
            )}

            {importOpen && (
                <PromptDialog
                    title={t('photos.importTitle', 'Import Photo')}
                    message={t('photos.importMessage', 'Paste a direct link to an image.')}
                    placeholder="https://"
                    inputMode="url"
                    maxLength={512}
                    confirmLabel={t('photos.import', 'Import')}
                    onCancel={() => setImportOpen(false)}
                    onConfirm={async url => {
                        const trimmed = url.trim();
                        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return t('photos.importInvalidUrl', 'Enter a full image URL');
                        const r = await apiSavePhotoFromUrl(trimmed);
                        if (!r.ok) return r.message ?? t('photos.importFailed', 'Could not import that image');
                        setImportOpen(false);
                        return null;
                    }}
                />
            )}

            {albumPicker && (
                <AlbumPickerSheet
                    albums={albums}
                    count={albumPicker.photoIds.length}
                    onClose={() => setAlbumPicker(null)}
                    onPick={(albumId) => { void addToAlbum(albumId, albumPicker.photoIds); setAlbumPicker(null); exitGallerySelect(); }}
                    onNewAlbum={() => { setCreateState({ addIds: albumPicker.photoIds }); setAlbumPicker(null); }}
                />
            )}

            {createState && (
                <PromptDialog
                    title={t('photos.newAlbumTitle','New Album')}
                    message={t('photos.newAlbumMessage','Enter a name for this album.')}
                    placeholder={t('photos.albumNamePlaceholder','Album Name')}
                    confirmLabel={t('photos.create','Create')}
                    maxLength={40}
                    onCancel={() => setCreateState(null)}
                    onConfirm={(name) => void submitCreate(name)}
                />
            )}

            <button
                type="button"
                onClick={onClose}
                aria-label={t('photos.closePhotos','Close Photos')}
                className="absolute inset-x-0 bottom-0 z-[5] h-5 cursor-default"
            />
        </div>
    );
}

function EmptyState() {
    return (
        <div className="flex h-full flex-col items-center justify-center px-10 pb-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-black/8 dark:bg-white/8">
                <CameraIcon className="h-8 w-8 text-black/55 dark:text-white/60" strokeWidth={1.6} />
            </div>
            <div className="text-[17px] font-semibold">{t('photos.noPhotosYet','No Photos Yet')}</div>
            <div className="mt-1 text-[13px] leading-snug text-black/55 dark:text-white/55">
                {t('photos.emptyStateBody','Photos you take with the Camera app will appear here.')}
            </div>
        </div>
    );
}

