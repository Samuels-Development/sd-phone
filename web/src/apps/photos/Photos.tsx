import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera as CameraIcon, FolderPlus, Heart, Trash2 } from 'lucide-react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { useDeckActive } from '@/shell/deckActive';
import { t } from '@/i18n';
import { PromptDialog } from '@/ui/PromptDialog';
import {
    apiAddPhotosToAlbum, apiCreateAlbum, apiDeleteAlbum, apiDeletePhoto,
    apiListAlbumPhotos, apiListAlbums, apiListPhotos, apiListSharedAlbums,
    apiRemovePhotoFromAlbum, apiSavePhotoFromUrl, apiSetFavorite, getCanImportPhotos, mapPhoto,
    FIRST_PAGE_SIZE, getCachedFirstPhotoPage,
    type Album, type AlbumRef, type Photo, type PhotoCounts,
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
    // Seeded from the last first page so a reopen has tiles on frame one and the open animation
    // has something to animate. A fresh fetch still runs underneath and replaces it.
    const cached = getCachedFirstPhotoPage();
    const [photos,  setPhotos]  = useState<Photo[]>(cached?.photos ?? []);
    const [albums,  setAlbums]  = useState<Album[]>([]);
    const [sharedAlbums, setSharedAlbums] = useState<Album[]>([]);
    const [loading, setLoading] = useState(!cached);

    // The gallery is paged: `photos` holds what has been fetched so far, `counts` holds the
    // server-side totals the album tiles need (a page cannot report them).
    const [nextCursor,  setNextCursor]  = useState<string | null>(cached?.nextCursor ?? null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [counts,      setCounts]      = useState<PhotoCounts>(
        cached?.counts ?? { total: 0, favorites: 0, videos: 0 });
    const fetchingMore = useRef(false);

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

    // The gallery waits only on its own page. The two album reads used to be awaited together
    // with it, so the default tab sat on "Loading…" for three round trips instead of one.
    useEffect(() => {
        let cancelled = false;
        void apiListPhotos(null, undefined, FIRST_PAGE_SIZE).then(page => {
            if (cancelled) return;
            setPhotos(page.photos);
            setNextCursor(page.nextCursor);
            if (page.counts) setCounts(page.counts);
            setCanImport(getCanImportPhotos());
            setLoading(false);
        });
        void apiListAlbums().then(as => { if (!cancelled) setAlbums(as); });
        void apiListSharedAlbums().then(s => { if (!cancelled) setSharedAlbums(s); });
        return () => { cancelled = true; };
    }, []);

    // Tile media is held back for the length of the shell's open animation, on mount and on every
    // subsequent foreground. The grid itself still renders, so the app visibly animates in; only
    // the full-size decodes wait. Without this the deck was animating a layer holding tens of MB
    // of decoded bitmap, which is why the FIRST open was smooth (nothing decoded yet) and every
    // one after it was choppy.
    const deckActive = useDeckActive();
    const [settling, setSettling] = useState(true);
    useEffect(() => {
        if (!deckActive) return;
        setSettling(true);
        const id = window.setTimeout(() => setSettling(false), 420);
        return () => window.clearTimeout(id);
    }, [deckActive]);

    // Restarts the pane's swipe animation on a tab change. The panes deliberately stay mounted
    // (a key= remount rebuilt every tile), and a CSS animation on an already-mounted element
    // will not replay on its own, so it is cleared and reassigned around a forced reflow. Reading
    // offsetHeight is what flushes it; rAF is starved in CEF, so the double-rAF trick is out.
    const paneRefs = useRef<Record<PhotosTab, HTMLDivElement | null>>({ gallery: null, albums: null });
    useEffect(() => {
        const el = paneRefs.current[tab];
        if (!el) return;
        el.style.animation = 'none';
        void el.offsetHeight;
        el.style.animation = '';
    }, [tab]);

    // Appends the next page. Guarded on a ref rather than `loadingMore` so a burst of scroll
    // events cannot fire two requests for the same cursor before the first setState lands.
    const loadMore = useCallback(async () => {
        if (fetchingMore.current || !nextCursor) return;
        fetchingMore.current = true;
        setLoadingMore(true);
        try {
            const page = await apiListPhotos(nextCursor);
            setPhotos(prev => {
                const seen = new Set(prev.map(p => p.id));
                return [...prev, ...page.photos.filter(p => !seen.has(p.id))];
            });
            setNextCursor(page.nextCursor);
        } finally {
            fetchingMore.current = false;
            setLoadingMore(false);
        }
    }, [nextCursor]);

    useEffect(() => {
        if (!openAlbum) return;
        let cancelled = false;
        void loadAlbumPhotos(openAlbum).then(ps => { if (!cancelled) setCustomAlbumPhotos(ps); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useNuiEvent('sd-phone:photos:added', useCallback((photo: unknown) => {
        if (!photo || typeof photo !== 'object') return;
        const p = mapPhoto(photo as { id: string; url: string; createdAt: string | number });
        if (!p.id || !p.url) return;
        setPhotos(prev => (prev.some(x => x.id === p.id) ? prev : [p, ...prev]));
    }, []));

    const refreshAlbums = useCallback(async () => {
        setAlbums(await apiListAlbums());
    }, []);

    // Favourites and Videos are resolved server-side now. Deriving them from `photos` would only
    // ever see the pages fetched so far, so a favourite further down the library went missing.
    async function loadAlbumPhotos(ref: AlbumRef): Promise<Photo[]> {
        if (ref.kind === 'custom')     return apiListAlbumPhotos(ref.id);
        if (ref.kind === 'favourites') return (await apiListPhotos(null, 'favorites')).photos;
        if (ref.kind === 'mediaType' && ref.mediaType === 'videos') {
            return (await apiListPhotos(null, 'videos')).photos;
        }
        return [];
    }

    function albumPhotosFor(ref: AlbumRef): Photo[] {
        if (ref.kind === 'recents') return photos;
        return customAlbumPhotos;
    }

    async function openAlbumRef(ref: AlbumRef) {
        setOpenAlbum(ref);
        setCustomAlbumPhotos([]);
        setCustomAlbumPhotos(await loadAlbumPhotos(ref));
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
                    // NO key={tab} here. The usual house pattern remounts the pane to replay the
                    // swipe animation, which is free for a list of rows but not for a grid of
                    // hundreds of image tiles: every tab switch tore the whole gallery down and
                    // rebuilt it. Both panes stay mounted and the inactive one is just hidden,
                    // so switching is a visibility toggle rather than a full remount.
                    <div className="flex h-full min-h-0 flex-col">
                        <div
                            ref={el => { paneRefs.current.gallery = el; }}
                            className={`flex h-full min-h-0 flex-col ${tab === 'gallery' ? 'animate-swipe-in-left' : 'hidden'}`}
                        >
                            {isEmpty ? (
                                <EmptyState />
                            ) : (
                                <GalleryTab
                                    photos={photos}
                                    selectionMode={gallerySelect}
                                    selectedIds={gallerySelected}
                                    onEnterSelect={() => setGallerySelect(true)}
                                    onCancelSelect={exitGallerySelect}
                                    onPhotoTap={openViewerFromGallery}
                                    onToggleSelect={toggleGallerySelect}
                                    onImport={canImport ? () => setImportOpen(true) : undefined}
                                    hasMore={nextCursor !== null}
                                    loadingMore={loadingMore}
                                    onLoadMore={() => void loadMore()}
                                    deferMedia={settling}
                                    paused={tab !== 'gallery'}
                                />
                            )}
                        </div>
                        <div
                            ref={el => { paneRefs.current.albums = el; }}
                            className={`flex h-full min-h-0 flex-col ${tab === 'albums' ? 'animate-swipe-in-left' : 'hidden'}`}
                        >
                            <AlbumsTab
                                photos={photos}
                                counts={counts}
                                albums={albums}
                                sharedAlbums={sharedAlbums}
                                editMode={albumsEdit}
                                onToggleEdit={() => setAlbumsEdit(v => !v)}
                                onCreateAlbum={() => setCreateState({ addIds: [] })}
                                onOpenAlbum={openAlbumRef}
                                onDeleteAlbum={async (a) => { if (await apiDeleteAlbum(a.id)) setAlbums(prev => prev.filter(x => x.id !== a.id)); }}
                            />
                        </div>
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

