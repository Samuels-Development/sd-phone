import { isFiveM } from './nui';
import { apiCall, apiData } from './api';

function devCover(c1: string, c2: string): string {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='400' height='400' fill='url(#g)'/></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const DEV_ALBUMS: Album[] = [
    { id: 'dev-a1', name: 'Vacation',   count: 24, cover: devCover('#60a5fa', '#1e3a8a') },
    { id: 'dev-a2', name: 'Night Drive', count: 12, cover: devCover('#f472b6', '#7c2d92') },
    { id: 'dev-a3', name: 'Crew',        count: 38, cover: devCover('#34d399', '#065f46') },
];

const DEV_SHARED_ALBUMS: Album[] = [
    { id: 'dev-s1', name: 'Road Trip 2026', count: 41, cover: devCover('#fbbf24', '#b45309') },
    { id: 'dev-s2', name: 'Beach Day',       count: 17, cover: devCover('#22d3ee', '#0e7490') },
];

const DEV_PHOTOS: Photo[] = Array.from({ length: 18 }, (_, i) => {
    const hue = (i * 47) % 360;
    return {
        id:       'dev-p' + i,
        url:      devCover(`hsl(${hue} 70% 55%)`, `hsl(${(hue + 40) % 360} 60% 30%)`),
        favorite: i % 5 === 0,
        date:     `2026-05-${String(28 - Math.floor(i / 6)).padStart(2, '0')}T12:00:00Z`,
        video:    false,
    };
});

export interface Photo {
    id:       string;
    url:      string;
    favorite: boolean;
    date:     string;
    video:    boolean;
}

export function isVideoUrl(url: string): boolean {
    return /\.(mp4|webm|mov|m4v|ogg)(\?|#|$)/i.test(url);
}

export interface Album {
    id:    string;
    name:  string;
    count: number;
    cover: string | null;
}

export type MediaType = 'videos' | 'selfies' | 'screenshots' | 'imports' | 'duplicates';

export type AlbumRef =
    | { kind: 'recents';    name: string }
    | { kind: 'favourites'; name: string }
    | { kind: 'custom';     id: string; name: string }
    | { kind: 'mediaType';  mediaType: MediaType; name: string };

function toIsoDate(value: string | number | undefined): string {
    if (typeof value === 'number') return new Date(value).toISOString();
    if (typeof value === 'string' && value) {
        const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
        const t = Date.parse(normalized);
        if (!Number.isNaN(t)) return new Date(t).toISOString();
    }
    return new Date().toISOString();
}

interface ServerPhoto { id: string; url: string; favorite?: boolean; createdAt: string | number }

export function mapPhoto(sp: ServerPhoto): Photo {
    return { id: sp.id, url: sp.url, favorite: !!sp.favorite, date: toIsoDate(sp.createdAt), video: isVideoUrl(sp.url) };
}

let canImportPhotos = !isFiveM;

/** Whether the server allows URL import; valid after the first apiListPhotos() resolves. */
export function getCanImportPhotos(): boolean { return canImportPhotos; }

export async function apiListPhotos(): Promise<Photo[]> {
    if (!isFiveM) return DEV_PHOTOS;
    const data = await apiData<{ photos: ServerPhoto[]; canImport?: boolean }>('sd-phone:photos:list');
    canImportPhotos = data?.canImport === true;
    return data?.photos.map(mapPhoto) ?? [];
}

export function warmPhotos(): void {
    if (!isFiveM) return;
    void apiListPhotos().then(photos => {
        for (const p of photos) {
            if (p.url && !p.video) { const img = new Image(); img.src = p.url; }
        }
    });
    void apiListAlbums().then(albums => {
        for (const a of albums) {
            if (a.cover) { const img = new Image(); img.src = a.cover; }
        }
    });
}

export async function apiSavePhotoFromUrl(url: string): Promise<{ ok: boolean; message?: string }> {
    if (!isFiveM) return { ok: true };
    const r = await apiCall<unknown>('sd-phone:photos:saveUrl', { url });
    return r.success ? { ok: true } : { ok: false, message: r.message };
}

export async function apiSetFavorite(photoId: string, value: boolean): Promise<boolean> {
    const r = await apiCall<unknown>('sd-phone:photos:setFavorite', { photoId, value });
    return r.success;
}

export async function apiDeletePhoto(photoId: string): Promise<boolean> {
    const r = await apiCall<unknown>('sd-phone:photos:delete', { photoId });
    return r.success;
}

interface ServerAlbum { id: string; name: string; count: number; cover: string | null }

export async function apiListAlbums(): Promise<Album[]> {
    if (!isFiveM) return DEV_ALBUMS;
    return (await apiData<{ albums: ServerAlbum[] }>('sd-phone:albums:list'))?.albums ?? [];
}

export async function apiListSharedAlbums(): Promise<Album[]> {
    if (!isFiveM) return DEV_SHARED_ALBUMS;
    return [];
}

export async function apiCreateAlbum(name: string): Promise<Album | null> {
    return (await apiData<{ album: ServerAlbum }>('sd-phone:albums:create', { name }))?.album ?? null;
}

export async function apiDeleteAlbum(albumId: string): Promise<boolean> {
    const r = await apiCall<unknown>('sd-phone:albums:delete', { albumId });
    return r.success;
}

export async function apiAddPhotosToAlbum(albumId: string, photoIds: string[]): Promise<boolean> {
    const r = await apiCall<unknown>('sd-phone:albums:addPhotos', { albumId, photoIds });
    return r.success;
}

export async function apiRemovePhotoFromAlbum(albumId: string, photoId: string): Promise<boolean> {
    const r = await apiCall<unknown>('sd-phone:albums:removePhoto', { albumId, photoId });
    return r.success;
}

export async function apiListAlbumPhotos(albumId: string): Promise<Photo[]> {
    if (!isFiveM) {
        const seed = albumId.charCodeAt(albumId.length - 1) % 6;
        return DEV_PHOTOS.filter((_, i) => i % 6 === seed % 6 || i % 3 === seed % 3);
    }
    return (await apiData<{ photos: ServerPhoto[] }>('sd-phone:albums:photos', { albumId }))?.photos.map(mapPhoto) ?? [];
}

export function groupByDay(photos: Photo[]): { key: string; label: string; photos: Photo[] }[] {
    const byDay = new Map<string, Photo[]>();
    for (const p of photos) {
        const k = p.date.slice(0, 10);
        const arr = byDay.get(k);
        if (arr) arr.push(p); else byDay.set(k, [p]);
    }
    return Array.from(byDay.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, ps]) => ({ key, label: formatDayLabel(key), photos: ps }));
}

function formatDayLabel(isoDay: string): string {
    const d = new Date(isoDay + 'T00:00:00Z');
    if (Number.isNaN(d.getTime())) return isoDay;
    const day   = d.getUTCDate();
    const month = d.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
    const year  = d.getUTCFullYear();
    return `${day} ${month}, ${year}`;
}
