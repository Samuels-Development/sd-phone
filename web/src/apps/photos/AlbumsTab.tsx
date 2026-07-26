import { useMemo } from 'react';
import {
    ChevronRight, CircleUserRound, Copy, Heart, Image as ImageIcon,
    Import, Minus, Plus, Scan, Users, Video, type LucideIcon,
} from 'lucide-react';

import { t } from '@/i18n';
import type { Album, AlbumRef, MediaType, Photo, PhotoCounts } from '@/core/photosApi';

interface AlbumCard {
    key:           string;
    title:         string;
    count:         number;
    cover:         string | null;
    isFavourites?: boolean;
    isShared?:     boolean;
    deletable?:    boolean;
    ref:           AlbumRef;
}

export function AlbumsTab({
    photos, counts, albums, sharedAlbums, editMode, onToggleEdit, onCreateAlbum, onOpenAlbum, onDeleteAlbum,
}: {
    photos:        Photo[];
    /** Server-side totals; `photos` only holds the pages fetched so far, so it cannot count. */
    counts:        PhotoCounts;
    albums:        Album[];
    sharedAlbums:  Album[];
    editMode:      boolean;
    onToggleEdit:  () => void;
    onCreateAlbum: () => void;
    onOpenAlbum:   (ref: AlbumRef) => void;
    onDeleteAlbum: (album: Album) => void;
}) {
    const MEDIA_TYPES: { type: MediaType; label: string; Icon: LucideIcon }[] = [
        { type: 'videos',      label: t('photos.videos', 'Videos'),      Icon: Video },
        { type: 'selfies',     label: t('photos.selfies', 'Selfies'),     Icon: CircleUserRound },
        { type: 'screenshots', label: t('photos.screenshots', 'Screenshots'), Icon: Scan },
        { type: 'imports',     label: t('photos.imports', 'Imports'),     Icon: Import },
        { type: 'duplicates',  label: t('photos.duplicates', 'Duplicates'),  Icon: Copy },
    ];

    const cards = useMemo<AlbumCard[]>(() => {
        // Covers come from the loaded pages (newest first, so the first page always has one);
        // the counts come from the server.
        const standard: AlbumCard[] = [
            {
                key: 'recents', title: t('photos.recents', 'Recents'), count: counts.total,
                cover: photos[0]?.url ?? null, ref: { kind: 'recents', name: t('photos.recents', 'Recents') },
            },
            {
                key: 'favourites', title: t('photos.favourites', 'Favourites'), count: counts.favorites,
                cover: photos.find(p => p.favorite)?.url ?? null, isFavourites: true,
                ref: { kind: 'favourites', name: t('photos.favourites', 'Favourites') },
            },
        ];
        const custom: AlbumCard[] = albums.map(a => ({
            key: a.id, title: a.name, count: a.count, cover: a.cover, deletable: true,
            ref: { kind: 'custom', id: a.id, name: a.name },
        }));
        return [...standard, ...custom];
    }, [photos, counts, albums]);

    const sharedCards = useMemo<AlbumCard[]>(() => sharedAlbums.map(a => ({
        key: a.id, title: a.name, count: a.count, cover: a.cover, isShared: true,
        ref: { kind: 'custom', id: a.id, name: a.name },
    })), [sharedAlbums]);

    const typeCounts = useMemo<Record<MediaType, number>>(() => ({
        videos:      counts.videos,
        selfies:     0,
        screenshots: 0,
        imports:     0,
        duplicates:  0,
    }), [counts]);

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between px-4">
                <button
                    type="button"
                    onClick={onToggleEdit}
                    className="text-[16px] font-medium text-ios-blue"
                >
                    {editMode ? t('photos.done', 'Done') : t('photos.edit', 'Edit')}
                </button>
                <button type="button" onClick={onCreateAlbum} aria-label={t('photos.newAlbumAria', 'New album')}>
                    <Plus className="h-6 w-6 text-ios-blue" strokeWidth={2.4} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-4">
                <h1 className="pb-3 pt-1 text-[28px] font-bold tracking-tight">{t('photos.albums', 'Albums')}</h1>
                <h2 className="pb-3 text-[20px] font-bold tracking-tight">{t('photos.myAlbums', 'My Albums')}</h2>

                <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                    {cards.map(card => (
                        <AlbumCardTile
                            key={card.key}
                            card={card}
                            editMode={editMode && !!card.deletable}
                            onOpen={() => onOpenAlbum(card.ref)}
                            onDelete={() => {
                                if (card.ref.kind === 'custom') {
                                    onDeleteAlbum({ id: card.ref.id, name: card.title, count: card.count, cover: card.cover });
                                }
                            }}
                        />
                    ))}
                </div>

                {sharedCards.length > 0 && (
                    <>
                        <h2 className="pb-3 pt-6 text-[20px] font-bold tracking-tight">{t('photos.sharedAlbums', 'Shared Albums')}</h2>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                            {sharedCards.map(card => (
                                <AlbumCardTile
                                    key={card.key}
                                    card={card}
                                    editMode={false}
                                    onOpen={() => onOpenAlbum(card.ref)}
                                    onDelete={() => {}}
                                />
                            ))}
                        </div>
                    </>
                )}

                <h2 className="pb-3 pt-6 text-[20px] font-bold tracking-tight">{t('photos.mediaTypes', 'Media Types')}</h2>
                <div className="overflow-hidden rounded-[12px] bg-black/[0.04] dark:bg-white/[0.06]">
                    {MEDIA_TYPES.map((mt, i) => {
                        const Icon = mt.Icon;
                        return (
                            <div key={mt.type}>
                                {i > 0 && <div className="h-px bg-black/[0.09] dark:bg-white/[0.12]" />}
                                <button
                                    type="button"
                                    onClick={() => onOpenAlbum({ kind: 'mediaType', mediaType: mt.type, name: mt.label })}
                                    className="flex w-full items-center gap-3.5 px-4 py-4 active:bg-black/[0.06] dark:active:bg-white/10"
                                >
                                    <Icon className="h-[24px] w-[24px] shrink-0 text-ios-blue" strokeWidth={2} />
                                    <span className="flex-1 text-left text-[17px] text-ios-blue">{mt.label}</span>
                                    <span className="text-[16px] tabular-nums text-black/55 dark:text-white/55">{typeCounts[mt.type]}</span>
                                    <ChevronRight className="h-[18px] w-[18px] text-black/45 dark:text-white/45" strokeWidth={2.5} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function AlbumCardTile({ card, editMode, onOpen, onDelete }: {
    card:     AlbumCard;
    editMode: boolean;
    onOpen:   () => void;
    onDelete: () => void;
}) {
    return (
        <div className="relative">
            <button
                type="button"
                onClick={editMode ? undefined : onOpen}
                className="block w-full text-left active:opacity-90"
            >
                <div className="relative aspect-square overflow-hidden rounded-[14px] bg-black/10 dark:bg-white/10">
                    {card.cover ? (
                        <img src={card.cover} alt="" draggable={false} className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center">
                            <ImageIcon className="h-10 w-10 text-black/25 dark:text-white/25" strokeWidth={1.5} />
                        </div>
                    )}
                    {card.isFavourites && (
                        <div className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 shadow">
                            <Heart className="h-4 w-4 fill-ios-blue text-ios-blue" />
                        </div>
                    )}
                    {card.isShared && (
                        <div className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/85 shadow">
                            <Users className="h-4 w-4 text-ios-blue" strokeWidth={2.4} />
                        </div>
                    )}
                </div>
                <div className="mt-1.5 text-[15px] font-semibold tracking-tight">{card.title}</div>
                <div className="text-[13px] text-black/45 dark:text-white/45">{card.count}</div>
            </button>

            {editMode && (
                <button
                    type="button"
                    onClick={onDelete}
                    aria-label={t('photos.deleteName', 'Delete {name}', { name: card.title })}
                    className="absolute -left-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow"
                >
                    <Minus className="h-4 w-4" strokeWidth={3} />
                </button>
            )}
        </div>
    );
}
