
import { t } from '@/i18n';
import { isFiveM } from '@/core/nui';
import { apiCall } from '@/core/api';
import { readJson } from '@/lib/storage';
import { newId as libNewId } from '@/lib/format';

export interface Track {
    id:     string;
    title:  string;
    artist: string;
    album?: string;
    url:    string;
    addedAt: number;
    /** Explicit artwork, e.g. from an external now-playing provider. Wins over any YouTube-derived cover. */
    thumb?: string;
}

const STORE_KEY = 'sd-phone:music:v1';

export function newId(): string {
    return libNewId('t');
}

export function youtubeId(url: string): string | null {
    const m = url.match(
        /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
    );
    return m ? m[1] : null;
}

export function isYouTube(url: string): boolean {
    return youtubeId(url) !== null;
}

export interface AllowedTrack {
    url:     string;
    title?:  string;
    artist?: string;
}

export interface MusicSources {
    youtube?:  boolean;
    anyAudio?: boolean;
    hosts?:    string[];
    videos?:   string[];
    tracks?:   AllowedTrack[];
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

let allowYouTube = false;
let allowAnyAudio = false;
let allowedHosts: string[] = [];
let allowedVideos = new Set<string>();
let allowedTracks: AllowedTrack[] = [];
let allowedTrackUrls = new Set<string>();

export function setMusicSources(src: MusicSources | undefined): void {
    allowYouTube = src?.youtube === true;
    allowAnyAudio = src?.anyAudio === true;
    allowedHosts = Array.isArray(src?.hosts)
        ? src.hosts.filter(h => typeof h === 'string' && h !== '').map(h => h.toLowerCase())
        : [];
    allowedVideos = new Set(
        (Array.isArray(src?.videos) ? src.videos : [])
            .filter(v => typeof v === 'string')
            .map(v => youtubeId(v) ?? v.trim())
            .filter(v => VIDEO_ID.test(v)),
    );
    allowedTracks = (Array.isArray(src?.tracks) ? src.tracks : [])
        .filter(x => !!x && typeof x.url === 'string' && x.url.trim() !== '')
        .map(x => ({
            url:    x.url.trim(),
            title:  typeof x.title === 'string' && x.title !== '' ? x.title : undefined,
            artist: typeof x.artist === 'string' && x.artist !== '' ? x.artist : undefined,
        }));
    allowedTrackUrls = new Set(allowedTracks.map(x => x.url));
}

export function allowedTrackList(): AllowedTrack[] {
    return allowedTracks;
}

export function hasAllowlist(): boolean {
    return allowedTracks.length > 0 || (!allowYouTube && allowedVideos.size > 0);
}

export function audioLinksAccepted(): boolean {
    return allowAnyAudio || allowedHosts.length > 0;
}

export function anySourceEnabled(): boolean {
    return allowYouTube || allowAnyAudio
        || allowedHosts.length > 0 || allowedVideos.size > 0 || allowedTracks.length > 0;
}

export function youtubePlaybackPossible(): boolean {
    return allowYouTube || allowedVideos.size > 0;
}

export function youtubeCurated(): boolean {
    return !allowYouTube && allowedVideos.size > 0;
}

export function allowedVideoIds(): string[] {
    return Array.from(allowedVideos);
}

export function youtubeWatchUrl(id: string): string {
    return `https://www.youtube.com/watch?v=${id}`;
}

export function youtubeThumb(id: string): string {
    return `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
}


const AUDIO_FILE = /\.(mp3|ogg|oga|opus|wav|m4a|aac|flac|weba)$/i;

function parseUrl(url: string): URL | null {
    try {
        const u = new URL(url);
        return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
    } catch {
        return null;
    }
}

function hostAllowed(host: string): boolean {
    return allowedHosts.some(h => (h.startsWith('.') ? host === h.slice(1) || host.endsWith(h) : host === h));
}

export type SourceRejection =
    | 'youtube-off'
    | 'video-not-approved'
    | 'host-not-allowed'
    | 'not-configured'
    | 'not-audio'
    | 'invalid';

export function sourceRejection(url: string): SourceRejection | null {
    const clean = url.trim();
    if (!clean) return 'invalid';
    if (allowedTrackUrls.has(clean)) return null;
    const vid = youtubeId(clean);
    if (vid) {
        if (allowYouTube || allowedVideos.has(vid)) return null;
        return allowedVideos.size > 0 ? 'video-not-approved' : 'youtube-off';
    }
    const u = parseUrl(clean);
    if (!u) return 'invalid';
    if (allowedHosts.length) return hostAllowed(u.hostname.toLowerCase()) ? null : 'host-not-allowed';
    if (!allowAnyAudio) return 'not-configured';
    return AUDIO_FILE.test(u.pathname) ? null : 'not-audio';
}

export function isSourceAllowed(url: string): boolean {
    return sourceRejection(url) === null;
}

export async function fetchYouTubeMeta(url: string): Promise<{ title: string; artist: string }> {
    if (!isSourceAllowed(url)) return { title: '', artist: '' };
    try {
        const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (r.ok) {
            const j = await r.json() as { title?: string; author_name?: string };
            return { title: j.title || t('music.youtubeVideo', 'YouTube video'), artist: j.author_name || 'YouTube' };
        }
    } catch { /* ignore */ }
    return { title: t('music.youtubeVideo', 'YouTube video'), artist: 'YouTube' };
}

export { formatDuration as fmt } from '@/lib/time';

const PALETTE: [string, string][] = [
    ['#1DB954', '#0a3d20'], ['#e8455f', '#3d0a14'], ['#0a84ff', '#0a1f3d'],
    ['#ff9f0a', '#3d2a0a'], ['#bf5af2', '#2a0a3d'], ['#64d2ff', '#0a2a3d'],
    ['#ff375f', '#3d0a1e'], ['#30d158', '#0a3d1e'], ['#ffd60a', '#3d3a0a'],
    ['#5e5ce6', '#16153d'],
];
export function coverGradient(seed: string): string {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const [a, b] = PALETTE[Math.abs(h) % PALETTE.length];
    return `linear-gradient(135deg, ${a}, ${b})`;
}

/**
 * Artwork URL for a track, or null when there is none to show. An explicit `thumb` (e.g. from an
 * external now-playing provider) always wins; otherwise falls back to a YouTube-derived cover.
 * Lives here rather than in Music.tsx so the home screen widget can resolve a cover without
 * importing the Music app chunk.
 */
export function coverUrl(track: { url: string; thumb?: string }): string | null {
    if (track.thumb) return track.thumb;
    const vid = youtubeId(track.url);
    return vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : null;
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function coverColor(seed: string): [number, number, number] {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    return hexToRgb(PALETTE[Math.abs(h) % PALETTE.length][0]);
}

export function titleFromUrl(url: string): string {
    const untitled = t('music.untitledTrack', 'Track');
    try {
        const path = new URL(url).pathname.split('/').pop() || untitled;
        return decodeURIComponent(path.replace(/\.[a-z0-9]+$/i, '')).replace(/[-_]+/g, ' ').trim() || untitled;
    } catch {
        return untitled;
    }
}

export function loadTracks(): Track[] {
    const raw = readJson<Track[]>(STORE_KEY, Array.isArray);
    return raw ? raw.filter(t => !/soundhelix\.com/i.test(t.url)) : DEFAULT_TRACKS;
}



export interface Folder {
    id:       string;
    name:     string;
    trackIds: string[];
    cover?:   string;
}

const FOLDERS_KEY = 'sd-phone:music:folders:v1';

export function loadFolders(): Folder[] {
    const raw = readJson<Folder[]>(FOLDERS_KEY, Array.isArray);
    return raw ? raw.filter(f => f.id !== 'f-chill' && f.id !== 'f-drive') : DEFAULT_FOLDERS;
}



export type IncomingTrack = Partial<Track> & { url: string };

export async function shareTrack(track: Track, target: number): Promise<boolean> {
    if (!isFiveM) return true;
    const r = await apiCall<void>('sd-phone:music:share', { target, kind: 'music-track', track });
    return r.success;
}

export async function sharePlaylist(name: string, tracks: Track[], target: number): Promise<boolean> {
    if (tracks.length === 0) return false;
    if (!isFiveM) return true;
    const r = await apiCall<void>('sd-phone:music:share', { target, kind: 'music-playlist', name, tracks });
    return r.success;
}

export function songKey(url: string): string {
    return youtubeId(url) ?? url.trim();
}

const DEFAULT_FOLDERS: Folder[] = [];
const DEFAULT_TRACKS: Track[] = [];


export interface ArtistGroup { name: string; tracks: Track[] }
export interface AlbumGroup  { key: string; album: string; artist: string; tracks: Track[] }

export function groupByArtist(tracks: Track[]): ArtistGroup[] {
    const map = new Map<string, Track[]>();
    for (const track of tracks) {
        const name = track.artist.trim() || t('music.unknownArtist', 'Unknown artist');
        const list = map.get(name);
        if (list) list.push(track); else map.set(name, [track]);
    }
    return [...map.entries()]
        .map(([name, ts]) => ({ name, tracks: ts }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

export function groupByAlbum(tracks: Track[]): AlbumGroup[] {
    const map = new Map<string, AlbumGroup>();
    for (const t of tracks) {
        const album = t.album?.trim();
        if (!album) continue;
        const key = `${t.artist} ${album}`;
        const g = map.get(key);
        if (g) g.tracks.push(t);
        else map.set(key, { key, album, artist: t.artist, tracks: [t] });
    }
    return [...map.values()].sort((a, b) => a.album.localeCompare(b.album));
}
