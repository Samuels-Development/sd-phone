import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Check, ChevronLeft, ChevronRight, FastForward, ImagePlus,
    ListMusic, Mic, Minus, Music2, Pause, Pencil, Play, Plus, Repeat,
    Rewind, Search, SearchX, Share, Shuffle, Trash2, Volume1, Volume2, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { t } from '@/i18n';
import { useSessionState, clearSessionState } from '@/hooks/useSessionState';
import { useTheme } from '@/stores/themeStore';
import { useDidEnter } from '@/hooks/useDidEnter';
import { Scrubber } from '@/ui/Scrubber';
import { Sheet } from '@/ui/Sheet';
import { EmptyState } from '@/ui/EmptyState';
import { SearchBar } from '@/ui/SearchBar';
import { PromptDialog } from '@/ui/PromptDialog';
import { AlertDialog } from '@/ui/AlertDialog';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { ShareSheet, type ShareTarget } from '@/shared/ShareSheet';
import { MusicTabBar, type MusicTab } from './MusicTabBar';
import { useMusic, useMusicProgress } from './MusicContext';
import {
    coverColor, coverGradient, fetchYouTubeMeta, fmt, groupByAlbum, groupByArtist,
    allowedTrackList, allowedVideoIds, anySourceEnabled, audioLinksAccepted, hasAllowlist, isSourceAllowed, newId, sourceRejection,
    titleFromUrl, youtubeCurated, youtubeId, youtubePlaybackPossible, youtubeThumb, youtubeWatchUrl,
    shareTrack, sharePlaylist,
} from './data';
import { useMusicLibrary } from '@/stores/musicLibraryStore';
import type { AlbumGroup, ArtistGroup, Folder, Track } from './data';

const PUSH = 'ios-push 0.32s cubic-bezier(0.32,0.72,0,1)';
const POP     = 'swipe-in-left 0.3s cubic-bezier(0.22,1,0.36,1)';
const POP_OUT = 'ios-pop 0.32s cubic-bezier(0.32,0.72,0,1) forwards';
const TAB  = 'swipe-in-left 0.45s cubic-bezier(0.22,1,0.36,1)';

type Detail =
    | { kind: 'artists' }
    | { kind: 'albums' }
    | { kind: 'songs' }
    | { kind: 'playlists' }
    | { kind: 'artist'; name: string }
    | { kind: 'album'; key: string }
    | { kind: 'playlist'; id: string }
    | { kind: 'add' };

export function Music({ onClose: _onClose }: { onClose: () => void }) {
    const m = useMusic();

    const TAB_TITLE: Record<MusicTab, string> = { home: t('music.home', 'Home'), library: t('music.library', 'Library'), search: t('music.search', 'Search') };

    const tracks     = useMusicLibrary(s => s.tracks);
    const folders    = useMusicLibrary(s => s.folders);
    const setTracks  = useMusicLibrary(s => s.setTracks);
    const setFolders = useMusicLibrary(s => s.setFolders);

    const [tab,   setTab]   = useSessionState<MusicTab>('music:tab', 'home');
    const [stack, setStack] = useSessionState<Detail[]>('music:stack', []);
    const [query, setQuery] = useSessionState('music:query', '');

    const [newPlaylist, setNewPlaylist] = useState(false);
    const [picking, setPicking]       = useState(false);
    const [expanded, setExpanded]     = useSessionState('music:expanded', false);
    const [stoppingMini, setStoppingMini] = useState(false);
    const [editing, setEditing]       = useState(false);
    const [confirm, setConfirm]       = useState<{ title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null);
    const [coverFor, setCoverFor]     = useState<string | null>(null);
    const [sharing, setSharing]       = useState<{ kind: 'track'; track: Track } | { kind: 'playlist'; folder: Folder } | null>(null);

    const commitTracks  = setTracks;
    const commitFolders = setFolders;

    const shareTo = useCallback(async (t: ShareTarget): Promise<boolean> => {
        if (!sharing) return false;
        if (sharing.kind === 'track') return shareTrack(sharing.track, t.id);
        const lib = useMusicLibrary.getState().tracks;
        const songs = sharing.folder.trackIds
            .map(id => lib.find(x => x.id === id))
            .filter((x): x is Track => !!x);
        return sharePlaylist(sharing.folder.name, songs, t.id);
    }, [sharing]);

    function addTrack(url: string, title: string, artist: string, album: string) {
        const clean = url.trim();
        if (!clean || !isSourceAllowed(clean)) return;
        const id = newId();
        const track: Track = {
            id, url: clean,
            title:  title.trim() || titleFromUrl(clean),
            artist: artist.trim() || (youtubeId(clean) ? 'YouTube' : t('music.unknownArtist', 'Unknown artist')),
            album:  album.trim() || undefined,
            addedAt: Date.now(),
        };
        commitTracks([track, ...tracks]);
        if (youtubeId(clean) && !title.trim()) {
            void fetchYouTubeMeta(clean).then(meta => {
                if (!meta.title) return;
                setTracks(prev => prev.map(x => x.id === id ? { ...x, title: meta.title, artist: artist.trim() || meta.artist } : x));
            });
        }
    }
    function removeTrack(id: string) {
        commitTracks(tracks.filter(t => t.id !== id));
        commitFolders(folders.map(f => ({ ...f, trackIds: f.trackIds.filter(t => t !== id) })));
    }
    function createFolder(name: string) {
        const n = name.trim();
        if (!n) return;
        commitFolders([{ id: 'f' + newId(), name: n, trackIds: [] }, ...folders]);
        setNewPlaylist(false);
    }
    function deleteFolder(id: string) {
        commitFolders(folders.filter(f => f.id !== id));
        if (top?.kind === 'playlist' && top.id === id) pop();
    }
    function setFolderCover(id: string, cover: string | undefined) {
        commitFolders(folders.map(f => f.id === id ? { ...f, cover } : f));
    }
    function renameFolder(id: string, name: string) {
        commitFolders(folders.map(f => f.id === id ? { ...f, name: name.slice(0, 40) } : f));
    }
    function toggleInFolder(folderId: string, trackId: string) {
        commitFolders(folders.map(f => f.id !== folderId ? f : {
            ...f,
            trackIds: f.trackIds.includes(trackId) ? f.trackIds.filter(t => t !== trackId) : [...f.trackIds, trackId],
        }));
    }

    function exitEdit() { setEditing(false); }

    function stopMini() {
        if (stoppingMini) return;
        setStoppingMini(true);
        window.setTimeout(() => { m.stop(); setStoppingMini(false); }, 300);
    }

    const animateNav = useDidEnter();
    const navAnim = useRef<string | undefined>(undefined);
    const top = stack.length ? stack[stack.length - 1] : null;
    const [exiting, setExiting] = useState<Detail | null>(null);
    const exitTimer = useRef<number | undefined>(undefined);

    const push = useCallback((d: Detail) => { navAnim.current = animateNav ? PUSH : undefined; setEditing(false); setStack(s => [...s, d]); }, [animateNav, setStack]);
    function pop() {
        if (!top) return;
        navAnim.current = POP;
        setEditing(false);
        setExiting(top);
        window.clearTimeout(exitTimer.current);
        exitTimer.current = window.setTimeout(() => setExiting(null), 340);
        setStack(s => s.slice(0, -1));
    }
    function switchTab(t: MusicTab) { navAnim.current = TAB; setStack([]); setTab(t); exitEdit(); }

    function backLabel(): string {
        if (stack.length <= 1) return TAB_TITLE[tab];
        const prev = stack[stack.length - 2];
        return prev.kind === 'artists' ? t('music.artists', 'Artists') : prev.kind === 'albums' ? t('music.albums', 'Albums') : prev.kind === 'songs' ? t('music.songs', 'Songs') : prev.kind === 'playlists' ? t('music.playlists', 'Playlists') : t('music.library', 'Library');
    }

    const artists = useMemo<ArtistGroup[]>(() => groupByArtist(tracks), [tracks]);
    const albums  = useMemo<AlbumGroup[]>(() => groupByAlbum(tracks), [tracks]);
    const recent  = useMemo(() => [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6), [tracks]);

    const q = query.trim().toLowerCase();
    const songHits   = useMemo(() => q ? tracks.filter(t => (t.title + ' ' + t.artist + ' ' + (t.album ?? '')).toLowerCase().includes(q)) : [], [q, tracks]);
    const artistHits = useMemo(() => q ? artists.filter(a => a.name.toLowerCase().includes(q)) : [], [q, artists]);
    const albumHits  = useMemo(() => q ? albums.filter(a => (a.album + ' ' + a.artist).toLowerCase().includes(q)) : [], [q, albums]);

    const librarySongs = tracks;

    const bottomPad = 12;

    function renderHome() {
        return (
            <>
                <BigTitle title={t('music.home', 'Home')} />
                <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto" style={{ paddingBottom: bottomPad }}>
                    <SectionLabel>{t('music.categories', 'Categories')}</SectionLabel>
                    <div className="mb-6">
                        <CategoryRow icon={ListMusic} label={t('music.playlists', 'Playlists')} onPress={() => push({ kind: 'playlists' })} divider />
                        <CategoryRow icon={Mic}       label={t('music.artists', 'Artists')}   onPress={() => push({ kind: 'artists' })} divider />
                        <CategoryRow icon={Music2}    label={t('music.songs', 'Songs')}     onPress={() => push({ kind: 'songs' })} />
                    </div>

                    <SectionLabel>{t('music.recentlyAdded', 'Recently Added')}</SectionLabel>
                    {recent.length > 0 ? (
                        <ArtGrid>
                            {recent.map(t => (
                                <ArtCard key={t.id} track={t} title={t.title} subtitle={t.artist}
                                    playing={m.current?.id === t.id && m.playing}
                                    unplayable={!isSourceAllowed(t.url)}
                                    onPress={() => m.play(t, recent)} />
                            ))}
                        </ArtGrid>
                    ) : (
                        <div className="flex-1">
                            <EmptyState icon={Music2} title={t('music.nothingAddedYet', 'Nothing Added Yet')}
                                subtitle={t('music.nothingAddedSub', 'Songs you add will show up here.')} />
                        </div>
                    )}
                </div>
            </>
        );
    }

    function renderLibrary() {
        return (
            <>
                <BigTitle title={t('music.library', 'Library')} right={
                    <button onClick={() => push({ kind: 'add' })} aria-label={t('music.addSong', 'Add song')} className="text-ios-blue"><Plus className="h-[28px] w-[28px]" strokeWidth={2.2} /></button>
                } />
                <div className="no-scrollbar flex-1 overflow-y-auto" style={{ paddingBottom: bottomPad }}>
                    <div className="mb-2 flex items-center justify-between px-5 pb-1 pt-1">
                        <h2 className="text-[22px] font-bold tracking-tight">{t('music.playlists', 'Playlists')}</h2>
                        <button onClick={() => setNewPlaylist(true)} className="flex items-center gap-1 text-[17px] font-semibold text-ios-blue"><Plus className="h-[20px] w-[20px]" />{t('music.new', 'New')}</button>
                    </div>
                    {folders.length === 0 ? (
                        <p className="px-5 py-7 text-center text-[18px] font-medium text-ios-gray">{t('music.noPlaylistsYet', 'No playlists yet.')}</p>
                    ) : folders.map((f, i) => (
                        <ListRow
                            key={f.id}
                            art={<FolderArt folder={f} size={56} />}
                            title={f.name}
                            subtitle={t('music.playlistSongCount', 'Playlist · {count} song{plural}', { count: f.trackIds.length, plural: f.trackIds.length === 1 ? '' : 's' })}
                            onPress={() => push({ kind: 'playlist', id: f.id })}
                            divider={i < folders.length - 1}
                            action={f.trackIds.length > 0 ? <ShareBtn onShare={() => setSharing({ kind: 'playlist', folder: f })} label={t('music.shareName', 'Share {name}', { name: f.name })} /> : undefined}
                        />
                    ))}

                    <div className="mt-5 flex items-center justify-between px-5 pb-1 pt-1">
                        <h2 className="text-[22px] font-bold tracking-tight">{t('music.songs', 'Songs')}</h2>
                        {librarySongs.length > 0 && (
                            <button onClick={() => (editing ? exitEdit() : setEditing(true))} className="text-[17px] font-semibold text-ios-blue">
                                {editing ? t('music.done', 'Done') : t('music.edit', 'Edit')}
                            </button>
                        )}
                    </div>
                    {librarySongs.length === 0 ? (
                        <p className="px-5 py-7 text-center text-[18px] font-medium text-ios-gray">{t('music.noSongsYet', 'No songs yet — tap + to add a link.')}</p>
                    ) : (
                        <TrackList tracks={librarySongs} current={m.current} playing={m.playing}
                            onPlay={t => m.play(t, librarySongs)} editing={editing}
                            onShare={t => setSharing({ kind: 'track', track: t })}
                            onEditRemove={track => setConfirm({
                                title: t('music.removeSong', 'Remove Song'),
                                message: t('music.removeSongMsg', 'Are you sure you want to remove “{title}” from your library?', { title: track.title }),
                                confirmLabel: t('music.remove', 'Remove'), onConfirm: () => removeTrack(track.id),
                            })}
                            empty="" />
                    )}
                </div>
            </>
        );
    }

    function renderSearch() {
        const hasHits = songHits.length || artistHits.length || albumHits.length;
        return (
            <>
                <BigTitle title={t('music.search', 'Search')} />
                <div className="px-4 pb-2.5"><SearchBar value={query} onChange={setQuery} placeholder={t('music.searchPlaceholder', 'Artists, Songs, Albums')} /></div>
                <div className="no-scrollbar flex-1 overflow-y-auto" style={{ paddingBottom: bottomPad }}>
                    {!q ? (
                        <EmptyState icon={Search} title={t('music.searchYourLibrary', 'Search Your Library')}
                            subtitle={t('music.searchYourLibrarySub', 'Find any artist, song, or album you’ve added.')} />
                    ) : !hasHits ? (
                        <EmptyState icon={SearchX} title={t('music.noResults', 'No Results')}
                            subtitle={t('music.noResultsSub', 'Nothing in your library matches “{query}”.', { query: query.trim() })} />
                    ) : (
                        <>
                            {artistHits.length > 0 && <SectionLabel>{t('music.artists', 'Artists')}</SectionLabel>}
                            {artistHits.map((a, i) => (
                                <ListRow key={a.name} onPress={() => push({ kind: 'artist', name: a.name })} divider={i < artistHits.length - 1}
                                    art={<Cover track={a.tracks[0]} size={48} rounded={24} />}
                                    title={a.name} subtitle={t('music.songCount', '{count} song{plural}', { count: a.tracks.length, plural: a.tracks.length === 1 ? '' : 's' })} />
                            ))}

                            {albumHits.length > 0 && <SectionLabel>{t('music.albums', 'Albums')}</SectionLabel>}
                            {albumHits.map((a, i) => (
                                <ListRow key={a.key} onPress={() => push({ kind: 'album', key: a.key })} divider={i < albumHits.length - 1}
                                    art={<Cover track={a.tracks[0]} size={48} rounded={6} />}
                                    title={a.album} subtitle={a.artist} />
                            ))}

                            {songHits.length > 0 && <SectionLabel>{t('music.songs', 'Songs')}</SectionLabel>}
                            <TrackList tracks={songHits} current={m.current} playing={m.playing}
                                onPlay={t => m.play(t, songHits)} empty="" />
                        </>
                    )}
                </div>
            </>
        );
    }

    function renderDetail(d: Detail) {
        if (d.kind === 'add') {
            return <AddForm onAdd={addTrack} onClose={pop} backLabel={backLabel()} />;
        }
        if (d.kind === 'artists') {
            return (
                <>
                    <DetailHeader title={t('music.artists', 'Artists')} back={backLabel()} onBack={pop} />
                    <div className="no-scrollbar flex-1 overflow-y-auto" style={{ paddingBottom: bottomPad }}>
                        {artists.length === 0 ? (
                            <EmptyState icon={Mic} title={t('music.noArtists', 'No Artists')}
                                subtitle={t('music.noArtistsSub', 'Artists show up here once you add songs.')} />
                        ) : artists.map((a, i) => (
                            <ListRow key={a.name} onPress={() => push({ kind: 'artist', name: a.name })} divider={i < artists.length - 1}
                                art={<Cover track={a.tracks[0]} size={52} rounded={26} />}
                                title={a.name} subtitle={t('music.songCount', '{count} song{plural}', { count: a.tracks.length, plural: a.tracks.length === 1 ? '' : 's' })} />
                        ))}
                    </div>
                </>
            );
        }
        if (d.kind === 'playlists') {
            return (
                <>
                    <DetailHeader title={t('music.playlists', 'Playlists')} back={backLabel()} onBack={pop} />
                    <div className="no-scrollbar flex-1 overflow-y-auto" style={{ paddingBottom: bottomPad }}>
                        {folders.length === 0 ? (
                            <EmptyState icon={ListMusic} title={t('music.noPlaylists', 'No Playlists')}
                                subtitle={t('music.noPlaylistsSub', 'Create a playlist from your Library and it’ll show up here.')} />
                        ) : folders.map((f, i) => (
                            <ListRow key={f.id}
                                art={<FolderArt folder={f} size={52} rounded={10} />}
                                title={f.name}
                                subtitle={t('music.playlistSongCount', 'Playlist · {count} song{plural}', { count: f.trackIds.length, plural: f.trackIds.length === 1 ? '' : 's' })}
                                onPress={() => push({ kind: 'playlist', id: f.id })}
                                divider={i < folders.length - 1}
                                action={f.trackIds.length > 0 ? <ShareBtn onShare={() => setSharing({ kind: 'playlist', folder: f })} label={t('music.shareName', 'Share {name}', { name: f.name })} /> : undefined}
                            />
                        ))}
                    </div>
                </>
            );
        }
        if (d.kind === 'albums') {
            return (
                <>
                    <DetailHeader title={t('music.albums', 'Albums')} back={backLabel()} onBack={pop} />
                    <div className="no-scrollbar flex-1 overflow-y-auto" style={{ paddingBottom: bottomPad }}>
                        <ArtGrid>
                            {albums.map(a => (
                                <ArtCard key={a.key} track={a.tracks[0]} title={a.album} subtitle={a.artist}
                                    onPress={() => push({ kind: 'album', key: a.key })} />
                            ))}
                        </ArtGrid>
                    </div>
                </>
            );
        }
        if (d.kind === 'songs') {
            return (
                <>
                    <DetailHeader title={t('music.songs', 'Songs')} back={backLabel()} onBack={pop} />
                    <div className="no-scrollbar flex-1 overflow-y-auto" style={{ paddingBottom: bottomPad }}>
                        {tracks.length === 0 ? (
                            <EmptyState icon={Music2} title={t('music.noSongs', 'No Songs')}
                                subtitle={t('music.noSongsSub', 'Add songs and they’ll show up here.')} />
                        ) : (
                            <TrackList tracks={tracks} current={m.current} playing={m.playing}
                                onPlay={t => m.play(t, tracks)}
                                onShare={t => setSharing({ kind: 'track', track: t })} empty="" />
                        )}
                    </div>
                </>
            );
        }
        if (d.kind === 'artist') {
            const a = artists.find(x => x.name === d.name);
            if (!a) return <DetailHeader title="" back={backLabel()} onBack={pop} />;
            return (
                <>
                    <DetailHeader title={a.name} back={backLabel()} onBack={pop} />
                    <div className="no-scrollbar flex-1 overflow-y-auto" style={{ paddingBottom: bottomPad }}>
                        <TrackList tracks={a.tracks} current={m.current} playing={m.playing}
                            onPlay={t => m.play(t, a.tracks)}
                            onShare={t => setSharing({ kind: 'track', track: t })} empty="" />
                    </div>
                </>
            );
        }
        if (d.kind === 'album') {
            const a = albums.find(x => x.key === d.key);
            if (!a) return <DetailHeader title="" back={backLabel()} onBack={pop} />;
            return (
                <>
                    <DetailHeader title="" back={backLabel()} onBack={pop} />
                    <div className="no-scrollbar flex-1 overflow-y-auto" style={{ paddingBottom: bottomPad }}>
                        <div className="flex flex-col items-center px-6 pb-4 pt-1">
                            <div className="w-[190px]"><Cover track={a.tracks[0]} size="100%" rounded={10} /></div>
                            <p className="mt-3 text-center text-[20px] font-bold leading-tight">{a.album}</p>
                            <p className="text-center text-[15px] text-ios-blue">{a.artist}</p>
                            <button onClick={() => { const first = a.tracks.find(x => isSourceAllowed(x.url)); if (first) m.play(first, a.tracks); }}
                                disabled={!a.tracks.some(x => isSourceAllowed(x.url))}
                                className="mt-3 flex items-center justify-center gap-2 rounded-[10px] bg-black/5 px-8 py-2.5 text-[16px] font-semibold text-ios-blue disabled:opacity-40 dark:bg-white/10">
                                <Play className="h-5 w-5 fill-current" /> {t('music.play', 'Play')}
                            </button>
                        </div>
                        <TrackList tracks={a.tracks} current={m.current} playing={m.playing}
                            onPlay={t => m.play(t, a.tracks)}
                            onShare={t => setSharing({ kind: 'track', track: t })} empty="" />
                    </div>
                </>
            );
        }
        const folder = folders.find(f => f.id === d.id);
        if (!folder) return <DetailHeader title="" back={t('music.library', 'Library')} onBack={pop} />;
        const folderTracks = folder.trackIds.map(id => tracks.find(t => t.id === id)).filter(Boolean) as Track[];
        return (
            <>
                <div className="shrink-0" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
                    <div className="flex items-center px-2 pb-1">
                        <button onClick={pop} className="-ml-1 flex items-center text-ios-blue active:opacity-60"><ChevronLeft className="h-7 w-7" /><span className="text-[17px]">{t('music.library', 'Library')}</span></button>
                    </div>
                    <div className="flex items-end gap-4 px-5 pb-3 pt-1">
                        <button onClick={() => setCoverFor(folder.id)} className="relative shrink-0 active:opacity-80" aria-label={t('music.editCover', 'Edit cover')}>
                            <FolderArt folder={folder} size={112} rounded={12} />
                            <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/55">
                                <ImagePlus className="h-[16px] w-[16px] text-white" />
                            </span>
                        </button>
                        <div className="min-w-0 pb-1">
                            <p className="text-[13px] font-bold uppercase tracking-wide text-ios-gray">{t('music.playlist', 'Playlist')}</p>
                            {editing ? (
                                <input
                                    value={folder.name}
                                    onChange={e => renameFolder(folder.id, e.target.value)}
                                    onBlur={e => { if (!e.target.value.trim()) renameFolder(folder.id, t('music.playlist', 'Playlist')); }}
                                    placeholder={t('music.playlistName', 'Playlist name')}
                                    maxLength={40}
                                    className="w-full truncate border-b border-ios-blue/50 bg-transparent text-[30px] font-bold leading-tight tracking-ios-display outline-none placeholder-ios-gray/60 focus:border-ios-blue"
                                />
                            ) : (
                                <h1 className="truncate text-[30px] font-bold leading-tight tracking-ios-display">{folder.name}</h1>
                            )}
                            <p className="text-[16px] text-ios-gray">{t('music.songCount', '{count} song{plural}', { count: folderTracks.length, plural: folderTracks.length === 1 ? '' : 's' })}</p>
                        </div>
                    </div>
                    <div className="flex gap-2 px-4 pb-2">
                        <button onClick={() => setPicking(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-3 text-[17px] font-semibold bg-ios-blue/[0.12] text-ios-blue active:bg-ios-blue/25 dark:bg-ios-blue/[0.18] dark:active:bg-ios-blue/30">
                            <Plus className="h-[20px] w-[20px]" /> {t('music.add', 'Add')}
                        </button>
                        {folderTracks.length > 0 && (
                            <button onClick={() => (editing ? exitEdit() : setEditing(true))} className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-3 text-[17px] font-semibold bg-ios-blue/[0.12] text-ios-blue active:bg-ios-blue/25 dark:bg-ios-blue/[0.18] dark:active:bg-ios-blue/30">
                                {editing ? t('music.done', 'Done') : <><Pencil className="h-[18px] w-[18px]" /> {t('music.edit', 'Edit')}</>}
                            </button>
                        )}
                        {folderTracks.length > 0 && (
                            <button onClick={() => setSharing({ kind: 'playlist', folder })} className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] py-3 text-[17px] font-semibold bg-ios-blue/[0.12] text-ios-blue active:bg-ios-blue/25 dark:bg-ios-blue/[0.18] dark:active:bg-ios-blue/30">
                                <Share className="h-[18px] w-[18px]" /> {t('music.share', 'Share')}
                            </button>
                        )}
                    </div>
                </div>
                <div className="no-scrollbar flex-1 overflow-y-auto" style={{ paddingBottom: bottomPad }}>
                    <TrackList tracks={folderTracks} current={m.current} playing={m.playing}
                        onPlay={t => m.play(t, folderTracks)} editing={editing}
                        onEditRemove={track => setConfirm({
                            title: t('music.removeSong', 'Remove Song'),
                            message: t('music.removeFromPlaylistMsg', 'Remove “{title}” from this playlist? It stays in your library.', { title: track.title }),
                            confirmLabel: t('music.remove', 'Remove'),
                            onConfirm: () => { toggleInFolder(folder.id, track.id); if (folderTracks.length <= 1) exitEdit(); },
                        })}
                        empty={t('music.noSongsInPlaylist', 'No songs yet — tap “Add songs”.')} />
                    <div className="px-4 pb-2 pt-3">
                        <button
                            onClick={() => setConfirm({
                                title: t('music.deletePlaylist', 'Delete Playlist'),
                                message: t('music.deletePlaylistMsg', 'Delete the playlist “{name}”? The songs will stay in your library.', { name: folder.name }),
                                confirmLabel: t('music.delete', 'Delete'), onConfirm: () => deleteFolder(folder.id),
                            })}
                            className="flex w-full items-center justify-center gap-2 rounded-[10px] py-3 text-[17px] font-semibold bg-ios-red/[0.12] text-ios-red active:bg-ios-red/25 dark:bg-ios-red/[0.18] dark:active:bg-ios-red/30">
                            <Trash2 className="h-[18px] w-[18px]" /> {t('music.deletePlaylist', 'Delete Playlist')}
                        </button>
                    </div>
                </div>
            </>
        );
    }

    const activeView = top ? renderDetail(top) : tab === 'home' ? renderHome() : tab === 'library' ? renderLibrary() : renderSearch();
    const viewKey = top ? `${stack.length}:${top.kind}:${'name' in top ? top.name : 'key' in top ? top.key : 'id' in top ? top.id : ''}` : `root:${tab}`;

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-base font-sf text-black dark:text-white">
            <div className="relative min-h-0 flex-1">
                <div key={viewKey} className="absolute inset-0 flex flex-col bg-base" style={{ animation: navAnim.current }}>
                    {activeView}
                </div>
                {exiting && (
                    <div className="absolute inset-0 z-20 flex flex-col bg-base" style={{ animation: POP_OUT }}>
                        {renderDetail(exiting)}
                    </div>
                )}
            </div>

            {m.current && (
                <div className={`shrink-0 overflow-hidden transition-all duration-300 ${stoppingMini ? 'max-h-0 opacity-0' : 'max-h-[88px] opacity-100'}`}>
                    <button onClick={() => setExpanded(true)}
                        style={animateNav && !stoppingMini ? { animation: 'mini-rise 0.34s cubic-bezier(0.32,0.72,0,1)' } : undefined}
                        className={`flex w-full items-center gap-3.5 bg-gradient-to-b from-base to-elevated px-4 py-3 text-left transition-transform duration-300 dark:to-surface ${stoppingMini ? 'translate-y-2' : ''}`}>
                        <Cover track={m.current} size={56} rounded={9} playing={m.playing} />
                        <span className="flex min-w-0 flex-1 flex-col leading-tight">
                            <span className="truncate text-[17px] font-semibold">{m.current.title}</span>
                            <span className="truncate text-[16px] font-medium text-black/75 dark:text-white/70">{m.current.artist}</span>
                        </span>
                        <span onClick={e => { e.stopPropagation(); m.toggle(); }} className="flex h-12 w-11 items-center justify-center">
                            {m.playing ? <Pause className="h-8 w-8 fill-current" /> : <Play className="h-8 w-8 fill-current" />}
                        </span>
                        <span onClick={e => { e.stopPropagation(); stopMini(); }} aria-label={t('music.stop', 'Stop')}
                            className="-ml-1.5 flex h-12 w-11 items-center justify-center">
                            <X className="h-8 w-8" strokeWidth={2.5} />
                        </span>
                    </button>
                </div>
            )}

            <MusicTabBar tab={tab} onChange={switchTab} />

            {expanded && m.current && <NowPlaying onClose={() => setExpanded(false)} />}

            {newPlaylist && (
                <PromptDialog title={t('music.newPlaylist', 'New Playlist')} message={t('music.newPlaylistMsg', 'Enter a name for this playlist.')} placeholder={t('music.playlistName', 'Playlist name')}
                    confirmLabel={t('music.create', 'Create')} maxLength={40} onCancel={() => setNewPlaylist(false)} onConfirm={createFolder} />
            )}
            {confirm && (
                <AlertDialog
                    title={confirm.title}
                    message={confirm.message}
                    confirmLabel={confirm.confirmLabel} destructive
                    onCancel={() => setConfirm(null)}
                    onConfirm={() => { confirm.onConfirm(); setConfirm(null); }}
                />
            )}
            {coverFor && (() => {
                const f = folders.find(x => x.id === coverFor);
                if (!f) return null;
                return (
                    <MediaPickerSheet
                        initialSelectedUrls={f.cover ? [f.cover] : undefined}
                        onSelect={p => { setFolderCover(f.id, p.url); setCoverFor(null); }}
                        onClose={() => setCoverFor(null)} />
                );
            })()}
            {picking && top?.kind === 'playlist' && (() => {
                const f = folders.find(x => x.id === top.id);
                if (!f) return null;
                return (
                    <PickerSheet tracks={tracks} selected={f.trackIds}
                        onToggle={id => toggleInFolder(f.id, id)} onClose={() => setPicking(false)} />
                );
            })()}
            {sharing && (
                <ShareSheet onClose={() => setSharing(null)} onShare={shareTo} />
            )}
        </div>
    );
}


function BigTitle({ title, right }: { title: string; right?: React.ReactNode }) {
    return (
        <div className="shrink-0 px-5" style={{ paddingTop: 'calc(var(--safe-top) + 17px)' }}>
            <div className="flex items-center justify-between pb-1 pt-1">
                <h1 className="text-[34px] font-bold tracking-tight">{title}</h1>
                {right}
            </div>
        </div>
    );
}

function DetailHeader({ title, back, onBack }: { title: string; back: string; onBack: () => void }) {
    return (
        <div className="shrink-0" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
            <div className="flex items-center px-2 pb-1">
                <button onClick={onBack} className="-ml-1 flex items-center text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-7 w-7" /><span className="text-[17px]">{back}</span>
                </button>
            </div>
            {title && <h1 className="px-5 pb-1.5 text-[30px] font-bold leading-tight tracking-ios-display">{title}</h1>}
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <h2 className="px-5 pb-2 pt-2 text-[22px] font-bold tracking-tight">{children}</h2>;
}

function Divider() {
    return <div className="pointer-events-none absolute bottom-0 left-[6%] right-[6%] h-[0.5px] bg-hairline/15" />;
}

function CategoryRow({ icon: Icon, label, onPress, divider }: { icon: LucideIcon; label: string; onPress: () => void; divider?: boolean }) {
    return (
        <button onClick={onPress} className="relative flex w-full items-center gap-3.5 px-5 py-[18px] text-left transition-colors hover:bg-black/[0.06] active:bg-black/10 dark:hover:bg-white/[0.07] dark:active:bg-white/10">
            <Icon className="h-[29px] w-[29px] shrink-0 text-ios-blue" strokeWidth={2.1} />
            <span className="flex-1 text-[20px] font-medium">{label}</span>
            <ChevronRight className="h-[26px] w-[26px] shrink-0 text-ios-gray" strokeWidth={2.5} />
            {divider && <Divider />}
        </button>
    );
}

function ListRow({ art, title, subtitle, onPress, divider, action }: { art: React.ReactNode; title: string; subtitle: string; onPress: () => void; divider?: boolean; action?: React.ReactNode }) {
    return (
        <div className="relative flex w-full items-center transition-colors hover:bg-black/[0.06] active:bg-black/10 dark:hover:bg-white/[0.07] dark:active:bg-white/10">
            <button onClick={onPress} className="flex min-w-0 flex-1 items-center gap-3.5 px-4 py-3 text-left">
                <span className="shrink-0">{art}</span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[20px] font-semibold">{title}</p>
                    <p className="truncate text-[16px] text-ios-gray">{subtitle}</p>
                </div>
                {!action && <ChevronRight className="h-[21px] w-[21px] shrink-0 text-ios-gray3" strokeWidth={2.5} />}
            </button>
            {action && <div className="flex shrink-0 items-center pr-3">{action}</div>}
            {divider && <Divider />}
        </div>
    );
}

function ShareBtn({ onShare, label }: { onShare: () => void; label: string }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={e => { e.stopPropagation(); onShare(); }}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-ios-blue/[0.12] text-ios-blue active:bg-ios-blue/25 dark:bg-ios-blue/[0.18] dark:active:bg-ios-blue/30"
        >
            <Share className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </button>
    );
}

function unavailableLabel(url: string): string {
    switch (sourceRejection(url)) {
        case 'host-not-allowed':   return t('music.blockedHost', 'Unavailable: host not allowed here');
        case 'youtube-off':        return t('music.blockedYoutubeOff', 'Unavailable: YouTube is off here');
        case 'video-not-approved': return t('music.blockedNotListed', 'Unavailable: not on the allowlist');
        case 'not-configured':     return t('music.blockedNoSources', 'Unavailable: no music sources set up here');
        case 'not-audio':          return t('music.blockedNotAudio', 'Unavailable: not a supported link');
        default:                   return t('music.blockedInvalid', 'Unavailable: broken link');
    }
}

function ArtGrid({ children }: { children: React.ReactNode }) {
    return <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-4 pb-2 pt-1">{children}</div>;
}

function ArtCard({ track, title, subtitle, onPress, playing = false, unplayable = false }: { track: Track; title: string; subtitle: string; onPress: () => void; playing?: boolean; unplayable?: boolean }) {
    return (
        <button onClick={() => { if (!unplayable) onPress(); }} className={`flex w-full min-w-0 flex-col text-left active:opacity-80 ${unplayable ? 'opacity-60' : ''}`}>
            <Cover track={track} size="100%" rounded={8} playing={playing && !unplayable} />
            <span className="mt-1.5 block w-full truncate text-[17px] font-semibold leading-tight">{title}</span>
            {unplayable
                ? <span className="block w-full truncate text-[16px] font-medium leading-tight text-ios-red">{unavailableLabel(track.url)}</span>
                : <span className="block w-full truncate text-[16px] font-medium leading-tight text-black/75 dark:text-white/70">{subtitle}</span>}
        </button>
    );
}

function TrackList({ tracks, current, playing, onPlay, onRemove, removeIcon = 'trash', empty, editing, onEditRemove, onShare }: {
    tracks: Track[]; current: Track | null; playing: boolean;
    onPlay: (t: Track) => void; onRemove?: (id: string) => void; removeIcon?: 'trash' | 'x';
    empty: string;
    editing?: boolean; onEditRemove?: (t: Track) => void;
    onShare?: (t: Track) => void;
}) {
    if (tracks.length === 0) return empty ? <p className="px-5 py-7 text-center text-[18px] font-medium text-ios-gray">{empty}</p> : null;
    return (
        <div className="px-2">
            {tracks.map((track, idx) => {
                const active = current?.id === track.id;
                const unplayable = !isSourceAllowed(track.url);
                return (
                    <div key={track.id} className="relative flex items-center rounded-lg px-2 py-2.5 transition-colors hover:bg-black/[0.06] active:bg-black/10 dark:hover:bg-white/[0.07] dark:active:bg-white/10">
                        {onEditRemove && (
                            <div className={`flex items-center overflow-hidden transition-all duration-300 ${editing ? 'mr-2.5 w-[30px] opacity-100' : 'w-0 opacity-0'}`}>
                                <button type="button" aria-label={t('music.removeTitle', 'Remove {title}', { title: track.title })} onClick={() => onEditRemove(track)}
                                    className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-ios-red active:opacity-70">
                                    <Minus className="h-[19px] w-[19px] text-white" strokeWidth={3} />
                                </button>
                            </div>
                        )}
                        <button onClick={() => { if (!editing && !unplayable) onPlay(track); }} className={`flex min-w-0 flex-1 items-center gap-3 text-left ${unplayable ? 'opacity-60' : ''}`}>
                            <Cover track={track} size={56} rounded={7} playing={active && playing} />
                            <span className="flex min-w-0 flex-col leading-tight">
                                <span className="truncate text-[20px] font-semibold" style={active && !unplayable ? { color: 'rgb(var(--ios-blue))' } : undefined}>{track.title}</span>
                                {unplayable
                                    ? <span className="truncate text-[16px] text-ios-red">{unavailableLabel(track.url)}</span>
                                    : <span className="truncate text-[16px] text-ios-gray">{track.artist}</span>}
                            </span>
                        </button>
                        {onShare && !editing && (
                            <div className="ml-2 shrink-0">
                                <ShareBtn onShare={() => onShare(track)} label={t('music.shareTitle', 'Share {title}', { title: track.title })} />
                            </div>
                        )}
                        {onRemove && (
                            <button onClick={() => onRemove(track.id)} aria-label={t('music.remove', 'Remove')} className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center text-ios-gray3">
                                {removeIcon === 'trash' ? <Trash2 className="h-[16px] w-[16px]" /> : <X className="h-[18px] w-[18px]" />}
                            </button>
                        )}
                        {idx < tracks.length - 1 && <Divider />}
                    </div>
                );
            })}
        </div>
    );
}

function Cover({ track, size, rounded = 6, playing = false, big = false }: {
    track: Track; size: number | string; rounded?: number; playing?: boolean; big?: boolean;
}) {
    const vid = youtubeId(track.url);
    const [hdFailed, setHdFailed] = useState(false);
    const tryHd = big && !hdFailed;
    const img = vid ? `https://i.ytimg.com/vi/${vid}/${tryHd ? 'maxresdefault' : 'mqdefault'}.jpg` : null;
    const onHdLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        if (tryHd && e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalWidth <= 120) setHdFailed(true);
    };
    return (
        <div className="relative flex shrink-0 items-center justify-center overflow-hidden"
            style={{
                width: size, height: typeof size === 'string' ? undefined : size,
                aspectRatio: typeof size === 'string' ? '1 / 1' : undefined,
                borderRadius: rounded,
                backgroundImage: img ? `url("${img}")` : coverGradient(track.id + track.title),
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                boxShadow: big ? '0 20px 44px -14px rgba(0,0,0,0.5)' : undefined,
            }}>
            {img ? (
                <img src={img} alt="" draggable={false} className="h-full w-full object-cover"
                    onError={big ? () => setHdFailed(true) : undefined}
                    onLoad={tryHd ? onHdLoad : undefined} />
            ) : (
                <Music2 className="text-white/85" style={{ width: big ? 64 : '45%', height: big ? 64 : '45%' }} strokeWidth={1.6} />
            )}
            {playing && !big && (
                <span className="absolute inset-0 flex items-center justify-center gap-[7%] bg-black/35">
                    {([[34, 0.6, 0], [46, 0.72, 0.15], [30, 0.66, 0.3]] as const).map(([h, dur, delay], i) => (
                        <span
                            key={i}
                            style={{
                                width: '7%', height: `${h}%`, borderRadius: '1px', background: '#fff',
                                animation: `eq-bounce ${dur}s ease-in-out ${delay}s infinite`,
                            }}
                        />
                    ))}
                </span>
            )}
        </div>
    );
}

function FolderArt({ folder, size, rounded = 6 }: { folder: Folder; size: number; rounded?: number }) {
    return (
        <div className="flex shrink-0 items-center justify-center overflow-hidden"
            style={{ width: size, height: size, borderRadius: rounded, background: coverGradient(folder.id + folder.name) }}>
            {folder.cover
                ? <img src={folder.cover} alt="" className="h-full w-full object-cover" draggable={false} />
                : <ListMusic className="text-white/85" style={{ width: '42%', height: '42%' }} />}
        </div>
    );
}


type RGB = [number, number, number];

function rgbStr([r, g, b]: RGB, f = 1): string {
    return `rgb(${Math.round(Math.min(255, r * f))}, ${Math.round(Math.min(255, g * f))}, ${Math.round(Math.min(255, b * f))})`;
}

function lightStr([r, g, b]: RGB, t: number): string {
    const m = (c: number) => Math.round(c * (1 - t) + 255 * t);
    return `rgb(${m(r)}, ${m(g)}, ${m(b)})`;
}

function vivid([r, g, b]: RGB): RGB {
    const mx = Math.max(r, g, b, 1);
    const f = mx < 190 ? 190 / mx : 1;
    return [Math.min(255, r * f), Math.min(255, g * f), Math.min(255, b * f)];
}

function extractVibrant(img: HTMLImageElement): RGB | null {
    try {
        const c = document.createElement('canvas');
        const w = (c.width = 24), h = (c.height = 24);
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        let r = 0, g = 0, b = 0, wsum = 0;
        for (let i = 0; i < d.length; i += 4) {
            const R = d[i], G = d[i + 1], B = d[i + 2];
            const sat = Math.max(R, G, B) - Math.min(R, G, B);
            const wt = (sat * sat) / 255 + 3;
            r += R * wt; g += G * wt; b += B * wt; wsum += wt;
        }
        return wsum ? [r / wsum, g / wsum, b / wsum] : null;
    } catch {
        return null;
    }
}

function useArtColor(track: Track | null): RGB {
    const [color, setColor] = useState<RGB>(() => (track ? vivid(coverColor(track.id + track.title)) : [70, 70, 70]));
    useEffect(() => {
        if (!track) return;
        setColor(vivid(coverColor(track.id + track.title)));
        const vid = youtubeId(track.url);
        if (!vid) return;
        let cancelled = false;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { if (!cancelled) { const c = extractVibrant(img); if (c) setColor(vivid(c)); } };
        img.src = `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`;
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [track?.id]);
    return color;
}

function NowPlaying({ onClose }: { onClose: () => void }) {
    const m = useMusic();
    const { time, duration } = useMusicProgress();
    const { theme } = useTheme('theme');
    const dark = theme === 'dark';
    const track = m.current;
    const [exiting, setExiting] = useState(false);
    const color = useArtColor(track);
    if (!track) return null;

    function close() {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(onClose, 300);
    }

    const bg = dark
        ? `linear-gradient(180deg, ${rgbStr(color, 0.13)} 0%, ${rgbStr(color, 0.38)} 50%, ${rgbStr(color, 0.85)} 100%)`
        : `linear-gradient(180deg, ${lightStr(color, 0.86)} 0%, ${rgbStr(color, 0.62)} 42%, ${rgbStr(color, 0.95)} 100%)`;

    return (
        <div
            className="absolute inset-0 z-40 flex flex-col px-5 font-sf text-white"
            style={{
                background: bg,
                paddingTop: 'calc(var(--safe-top) + 4px)',
                paddingBottom: 'calc(var(--safe-bottom) + 70px)',
                animation: exiting
                    ? 'ios-sheet-down 0.3s cubic-bezier(0.32,0,0.68,1) forwards'
                    : 'ios-sheet-up 0.34s cubic-bezier(0.32,0.72,0,1)',
            }}
        >
            <button onClick={close} aria-label={t('music.closeNowPlaying', 'Close Now Playing')} className="mx-auto flex h-9 w-40 shrink-0 items-center justify-center active:opacity-60">
                <span className={`h-[6px] w-[72px] rounded-full ${dark ? 'bg-white/55' : 'bg-black/30'}`} />
            </button>

            <div className="mt-8 w-full shrink-0">
                <Cover key={track.id} track={track} size="100%" rounded={16} big playing={m.playing} />
            </div>

            <div className="mt-6 min-w-0 shrink-0">
                <p className="truncate text-[25px] font-bold leading-tight">{track.title}</p>
                <p className="truncate text-[17px] text-white/65">{track.artist}</p>
            </div>

            <div className="mt-8 shrink-0">
                <Scrubber thick value={time} max={duration} onSeek={m.seek} />
                <div className="flex justify-between text-[12px] text-white/55"><span>{fmt(time)}</span><span>{fmt(duration)}</span></div>
            </div>

            <div className="flex-1" />

            <div className="flex shrink-0 items-center justify-between px-1">
                <button onClick={() => m.setShuffle(!m.shuffle)} aria-label={t('music.shuffle', 'Shuffle')} className="active:opacity-60">
                    <Shuffle className="h-[22px] w-[22px]" style={{ color: m.shuffle ? '#fff' : 'rgba(255,255,255,0.5)' }} strokeWidth={2.4} />
                </button>
                <button onClick={m.prev} aria-label={t('music.previous', 'Previous')} className="active:opacity-60"><Rewind className="h-9 w-9 fill-white" /></button>
                <button onClick={m.toggle} aria-label={t('music.playPause', 'Play/Pause')} className="active:opacity-60">
                    {m.playing ? <Pause className="h-[54px] w-[54px] fill-white" /> : <Play className="h-[54px] w-[54px] fill-white" />}
                </button>
                <button onClick={m.next} aria-label={t('music.next', 'Next')} className="active:opacity-60"><FastForward className="h-9 w-9 fill-white" /></button>
                <button onClick={() => m.setRepeat(!m.repeat)} aria-label={t('music.repeat', 'Repeat')} className="active:opacity-60">
                    <Repeat className="h-[22px] w-[22px]" style={{ color: m.repeat ? '#fff' : 'rgba(255,255,255,0.5)' }} strokeWidth={2.4} />
                </button>
            </div>

            <div className="mt-9 flex shrink-0 items-center gap-3">
                <Volume1 className="h-[18px] w-[18px] shrink-0 text-white/55" />
                <div className="flex-1"><Scrubber thick value={m.volume * 100} max={100} onSeek={v => m.setVolume(v / 100)} /></div>
                <Volume2 className="h-[18px] w-[18px] shrink-0 text-white/55" />
            </div>
        </div>
    );
}

function YouTubeGlyph({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
            <rect x="2" y="5.5" width="20" height="13" rx="3.6" fill="#FF0000" />
            <path d="M10 9 L15.5 12 L10 15 Z" fill="#fff" />
        </svg>
    );
}

function AddForm({ onAdd, onClose, backLabel }: { onAdd: (url: string, title: string, artist: string, album: string) => void; onClose: () => void; backLabel: string }) {
    const [url, setUrl] = useSessionState('music:add:url', '');
    const [title, setTitle] = useSessionState('music:add:title', '');
    const [artist, setArtist] = useSessionState('music:add:artist', '');
    const [ytStatus, setYtStatus] = useState<'idle' | 'loading' | 'filled'>('idle');
    const [pickOpen, setPickOpen] = useState(false);
    function clearDraft() { clearSessionState('music:add:'); }
    const canYt = youtubePlaybackPossible();
    const canAudio = audioLinksAccepted();
    const curated = youtubeCurated();
    const linkLabel = canYt && canAudio ? t('music.pasteAnyLink', 'Paste a song link')
        : canYt ? t('music.pasteYoutubeLink', 'Paste a YouTube link')
            : canAudio ? t('music.pasteAudioLink', 'Paste an audio file link')
                : t('music.pasteNothing', 'Links cannot be added on this server');
    const previewLabel = canYt && canAudio ? t('music.pasteAnyPreview', 'Paste a song link to preview it.')
        : canYt ? t('music.pasteLinkPreview', 'Paste a YouTube link to preview your song.')
            : canAudio ? t('music.pasteAudioPreview', 'Paste a link to an audio file to preview your song.')
                : t('music.pasteNothingPreview', 'This server only allows songs from its own list.');
    const vid = isSourceAllowed(url) ? youtubeId(url) : null;
    const hasUrl = url.trim().length > 0;
    const rejection = hasUrl ? sourceRejection(url) : null;
    const blocked = rejection !== null;
    const showReason = blocked && rejection !== 'invalid';

    useEffect(() => {
        if (!vid) { setYtStatus('idle'); return; }
        let cancelled = false;
        setYtStatus('loading');
        void fetchYouTubeMeta(url).then(meta => {
            if (cancelled) return;
            setTitle(meta.title);
            setArtist(meta.artist);
            setYtStatus('filled');
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [vid]);

    function submit() {
        if (!hasUrl || blocked) return;
        onAdd(url, title, artist, '');
        clearDraft();
        onClose();
    }

    const previewTitle  = title || (vid ? (ytStatus === 'loading' ? t('music.gettingTitle', 'Getting title…') : t('music.youtubeVideo', 'YouTube video')) : titleFromUrl(url));
    const previewArtist = artist || (vid ? 'YouTube' : t('music.unknownArtist', 'Unknown artist'));
    const previewTrack: Track = { id: 'preview', url, title: previewTitle, artist: previewArtist, addedAt: 0 };
    const lastShown = useRef({ track: previewTrack, title: previewTitle, artist: previewArtist, vid: !!vid });
    if (hasUrl) lastShown.current = { track: previewTrack, title: previewTitle, artist: previewArtist, vid: !!vid };
    const shown = hasUrl ? { track: previewTrack, title: previewTitle, artist: previewArtist, vid: !!vid } : lastShown.current;

    return (
        <>
            <div className="shrink-0" style={{ paddingTop: 'calc(var(--safe-top) + 8px)' }}>
                <div className="relative flex items-center px-2 pb-2">
                    <button onClick={() => { clearDraft(); onClose(); }} className="-ml-1 flex items-center text-ios-blue active:opacity-60">
                        <ChevronLeft className="h-7 w-7" /><span className="text-[17px]">{backLabel}</span>
                    </button>
                    <span className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold">{t('music.newSong', 'New Song')}</span>
                    <button onClick={submit} disabled={!hasUrl || blocked} className="ml-auto pr-2 text-[17px] font-semibold text-ios-blue disabled:opacity-40">
                        {t('music.add', 'Add')}
                    </button>
                </div>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pt-3">
                <div className="relative">
                    <div className={`flex min-h-[150px] flex-col items-center justify-center rounded-[18px] border-2 border-dashed border-black/15 px-6 text-center transition-opacity duration-300 dark:border-white/15 ${hasUrl ? 'opacity-0' : 'opacity-100'}`}>
                        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-black/[0.06] dark:bg-white/10">
                            <Music2 className="h-7 w-7 text-ios-gray" strokeWidth={1.7} />
                        </div>
                        <p className="text-[15px] font-medium text-ios-gray">{previewLabel}</p>
                    </div>
                    <div className={`absolute inset-0 flex items-center gap-4 rounded-[18px] bg-elevated px-5 shadow-sm transition-all duration-300 dark:bg-surface ${hasUrl ? 'opacity-100 translate-y-0 scale-100' : 'pointer-events-none opacity-0 translate-y-2 scale-[0.97]'}`}>
                        <Cover track={shown.track} size={80} rounded={14} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[21px] font-semibold leading-tight">{shown.title}</p>
                            <p className="mt-0.5 truncate text-[16px] leading-tight text-ios-gray">{shown.artist}</p>
                        </div>
                        {shown.vid && <YouTubeGlyph size={26} />}
                    </div>
                </div>

                <p className="mb-2.5 mt-6 px-1 text-[19px] font-bold tracking-tight">{t('music.link', 'Link')}</p>
                <Field large value={url} onChange={setUrl} placeholder={linkLabel}
                    icon={canYt && !canAudio ? <YouTubeGlyph size={22} /> : <Music2 className="h-[22px] w-[22px] text-ios-gray" strokeWidth={1.7} />} />
                {hasAllowlist() && (
                    <button type="button" onClick={() => setPickOpen(true)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] bg-black/[0.06] py-3 text-[17px] font-semibold text-ios-blue active:opacity-70 dark:bg-white/10">
                        <ListMusic className="h-[19px] w-[19px]" />
                        {t('music.addFromAllowlist', 'Add from allowlist')}
                    </button>
                )}
                {curated && (
                    <p className="mt-2 px-1 text-[13px] text-ios-gray">
                        {t('music.allowlistOnly', 'Only YouTube links on the allowlist can be added on this server.')}
                    </p>
                )}
                {!anySourceEnabled() && (
                    <p className="mt-2 px-1 text-[13px] text-ios-gray">
                        {t('music.noSources', 'This server has not set up any music sources yet.')}
                    </p>
                )}

                {showReason && (
                    <p className="mt-2 px-1 text-[13px] font-medium text-ios-red">
                        {rejection === 'youtube-off'
                            ? t('music.youtubeDisabled', 'YouTube links are turned off on this server.')
                            : rejection === 'video-not-approved'
                                ? t('music.videoNotApproved', 'This YouTube link is not on the allowlist for this server.')
                                : rejection === 'not-audio'
                                    ? t('music.needsAudioFile', 'Link must point straight to an audio file, like a .mp3 or .ogg.')
                                    : t('music.sourceBlocked', 'That link is not from an allowed source.')}
                    </p>
                )}

                <p className="mb-2.5 mt-6 px-1 text-[19px] font-bold tracking-tight">{t('music.detailsOptional', 'Details (optional)')}</p>
                <Field large value={title} onChange={setTitle} placeholder={t('music.titleField', 'Title')} />
                <Field large value={artist} onChange={setArtist} placeholder={t('music.artist', 'Artist')} />
            </div>

            {pickOpen && (
                <AllowlistSheet
                    onPick={picked => { onAdd(picked, '', '', ''); clearDraft(); onClose(); }}
                    onClose={() => setPickOpen(false)}
                />
            )}
        </>
    );
}

function AllowlistSheet({ onPick, onClose }: { onPick: (url: string) => void; onClose: () => void }) {
    const ids = useMemo(() => (youtubeCurated() ? allowedVideoIds() : []), []);
    const hosted = useMemo(() => allowedTrackList(), []);
    const [titles, setTitles] = useState<Record<string, string>>({});

    useEffect(() => {
        let cancelled = false;
        void Promise.all(ids.map(id =>
            fetchYouTubeMeta(youtubeWatchUrl(id)).then(meta => [id, meta.title] as const),
        )).then(pairs => {
            if (cancelled) return;
            setTitles(Object.fromEntries(pairs.filter(([, title]) => !!title)));
        });
        return () => { cancelled = true; };
    }, [ids]);

    return (
        <Sheet onClose={onClose} top={130} className="bg-base text-black dark:text-white font-sf">
            {({ close }) => (
                <div className="flex min-h-0 flex-1 flex-col pb-[calc(var(--safe-bottom)+16px)]">
                    <div className="flex shrink-0 items-center justify-between px-5 pb-1 pt-6">
                        <h2 className="text-[22px] font-bold tracking-tight">{t('music.allowlistTitle', 'Approved Songs')}</h2>
                        <button onClick={close} className="text-[17px] font-semibold text-ios-blue active:opacity-60">{t('music.done', 'Done')}</button>
                    </div>
                    <p className="shrink-0 px-5 pb-3 text-[15px] text-ios-gray">
                        {t('music.allowlistBlurb', 'Songs this server has approved. Tap one to add it.')}
                    </p>
                    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2">
                        {ids.length === 0 && hosted.length === 0 && (
                            <p className="px-5 py-7 text-center text-[18px] font-medium text-ios-gray">
                                {t('music.allowlistEmpty', 'This server has no approved songs yet.')}
                            </p>
                        )}
                        {hosted.length > 0 && <SectionLabel>{t('music.allowlistHosted', 'From this server')}</SectionLabel>}
                        {hosted.map(entry => {
                            const preview: Track = {
                                id: `al-${entry.url}`,
                                url: entry.url,
                                title: entry.title || titleFromUrl(entry.url),
                                artist: entry.artist || t('music.unknownArtist', 'Unknown artist'),
                                addedAt: 0,
                            };
                            return (
                                <button key={entry.url} type="button" onClick={() => { onPick(entry.url); close(); }}
                                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left active:bg-black/10 dark:active:bg-white/10">
                                    <Cover track={preview} size={52} rounded={7} />
                                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                                        <span className="truncate text-[18px] font-semibold">{preview.title}</span>
                                        <span className="truncate text-[15px] text-ios-gray">{preview.artist}</span>
                                    </span>
                                    <Plus className="h-5 w-5 shrink-0 text-ios-blue" />
                                </button>
                            );
                        })}
                        {ids.length > 0 && <SectionLabel>{t('music.allowlistYouTube', 'From YouTube')}</SectionLabel>}
                        {ids.map(id => (
                            <button key={id} type="button" onClick={() => { onPick(youtubeWatchUrl(id)); close(); }}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left active:bg-black/10 dark:active:bg-white/10">
                                <img src={youtubeThumb(id)} alt="" loading="lazy"
                                    className="h-[52px] w-[92px] shrink-0 rounded-[7px] bg-black/10 object-cover dark:bg-white/10" />
                                <span className="min-w-0 flex-1 truncate text-[18px] font-semibold">
                                    {titles[id] ?? t('music.gettingTitle', 'Getting title…')}
                                </span>
                                <Plus className="h-5 w-5 shrink-0 text-ios-blue" />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </Sheet>
    );
}

function PickerSheet({ tracks, selected, onToggle, onClose }: { tracks: Track[]; selected: string[]; onToggle: (id: string) => void; onClose: () => void }) {
    return (
        <Sheet onClose={onClose} top={130} className="bg-base text-black dark:text-white font-sf">
            {({ close }) => (
                <div className="flex min-h-0 flex-1 flex-col pb-[calc(var(--safe-bottom)+16px)]">
                    <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-6">
                        <h2 className="text-[22px] font-bold tracking-tight">{t('music.addSongs', 'Add Songs')}</h2>
                        <button onClick={close} className="text-[17px] font-semibold text-ios-blue active:opacity-60">{t('music.done', 'Done')}</button>
                    </div>
                    <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-2">
                        {tracks.length === 0 && <p className="px-5 py-7 text-center text-[18px] font-medium text-ios-gray">{t('music.libraryEmpty', 'Your library is empty.')}</p>}
                        {tracks.map((t, idx) => {
                            const on = selected.includes(t.id);
                            return (
                                <button key={t.id} onClick={() => onToggle(t.id)} className="relative flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left active:bg-black/5 dark:active:bg-white/5">
                                    <Cover track={t} size={56} rounded={7} />
                                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                                        <span className="truncate text-[20px] font-semibold">{t.title}</span>
                                        <span className="truncate text-[16px] text-ios-gray">{t.artist}</span>
                                    </span>
                                    <span className={'flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full ' + (on ? 'bg-ios-blue' : 'border-2 border-black/35 dark:border-white/40')}>
                                        {on && <Check className="h-[15px] w-[15px] text-white" strokeWidth={3} />}
                                    </span>
                                    {idx < tracks.length - 1 && <Divider />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </Sheet>
    );
}

function Field({ icon, value, onChange, placeholder, autoFocus, large }: { icon?: React.ReactNode; value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; large?: boolean }) {
    return (
        <div className={large
            ? 'mb-3 flex h-[54px] items-center gap-2.5 rounded-[14px] bg-elevated px-4 shadow-sm dark:bg-surface'
            : 'mb-2 flex h-11 items-center gap-2 rounded-[10px] bg-black/5 px-3 dark:bg-white/10'}>
            {icon}
            <input autoFocus={autoFocus} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                className={'min-w-0 flex-1 bg-transparent text-black outline-none placeholder:text-black/70 dark:text-white dark:placeholder:text-white/65 ' + (large ? 'text-[17px]' : 'text-[15px]')} />
            {value && (
                <button type="button" aria-label={t('music.clear', 'Clear')} onClick={() => onChange('')}
                    className="shrink-0 text-ios-gray active:opacity-50">
                    <X className="h-[19px] w-[19px]" strokeWidth={2.5} />
                </button>
            )}
        </div>
    );
}
