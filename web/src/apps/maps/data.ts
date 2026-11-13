import { t } from '@/i18n';
import { newId as libNewId } from '@/lib/format';
import { readJson, writeJson } from '@/lib/storage';
import { ICON_KEYS } from '@/lib/waypointCode';

export const WORLD = { xMin: -5355, xMax: 6167, yMin: -3833, yMax: 7688 };

export function projectPct(x: number, y: number) {
    return {
        left: ((x - WORLD.xMin) / (WORLD.xMax - WORLD.xMin)) * 100,
        top:  ((WORLD.yMax - y) / (WORLD.yMax - WORLD.yMin)) * 100,
    };
}

export function pctToWorld(leftPct: number, topPct: number) {
    return {
        x: WORLD.xMin + (leftPct / 100) * (WORLD.xMax - WORLD.xMin),
        y: WORLD.yMax - (topPct  / 100) * (WORLD.yMax - WORLD.yMin),
    };
}

export function newId(): string {
    return libNewId('m');
}

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function timeAgo(ms?: number): string {
    if (!ms) return t('maps.offline', 'offline');
    const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (s < 15) return t('maps.now', 'now');
    if (s < 60) return t('maps.secondsAgo', '{s}s ago', { s });
    const m = Math.floor(s / 60);
    if (m < 60) return t('maps.minutesAgo', '{m}m ago', { m });
    return t('maps.hoursAgo', '{h}h ago', { h: Math.floor(m / 60) });
}


export type MapStyleId = 'satellite' | 'atlas';

export interface TileSource {
    base:    string;
    ext:     'jpg' | 'png';
    maxZoom: number;
    px:      number;
}

const CDN = 'https://sd-maptiles.pages.dev';

export const TILE_SOURCES: Record<'satellite' | 'atlas', TileSource> = {
    satellite: { base: CDN, ext: 'jpg', maxZoom: 6, px: 1024 },
    atlas:     { base: CDN, ext: 'jpg', maxZoom: 5, px: 1024 },
};

export const MAX_NATIVE_PX = Math.max(
    ...Object.values(TILE_SOURCES).map(s => (2 ** s.maxZoom) * s.px),
);

export interface MapStyle {
    id:     MapStyleId;
    label:  string;
    tiles:  'atlas' | 'satellite';
    filter: string;
    wash?:  string;
    bg:     string;
    credit?: string;
}

export function getMapStyles(): MapStyle[] {
    return [
        { id: 'satellite', label: t('maps.styleSatellite', 'Satellite'), tiles: 'satellite', filter: 'none', bg: '#0d2b4f', credit: '© gtadb.org · CC BY 4.0' },
        { id: 'atlas',     label: t('maps.styleAtlas', 'Atlas'),     tiles: 'atlas',     filter: 'none', bg: '#acc6e0' },
    ];
}

const TILE_V = 6;

export function tileUrl(tiles: 'atlas' | 'satellite', z: number, x: number, y: number): string {
    const s = TILE_SOURCES[tiles];
    return `${s.base}/${tiles}/${z}/${x}/${y}.${s.ext}?v=${TILE_V}`;
}

export function styleMaxZoom(tiles: 'atlas' | 'satellite'): number {
    return TILE_SOURCES[tiles].maxZoom;
}

export function stylePx(tiles: 'atlas' | 'satellite'): number {
    return TILE_SOURCES[tiles].px;
}

const STYLE_KEY = 'sd-phone:maps:style:v1';

export function loadStyleId(): MapStyleId {
    try {
        const raw = window.localStorage.getItem(STYLE_KEY);
        if (raw && getMapStyles().some(s => s.id === raw)) return raw as MapStyleId;
    } catch {}
    return 'satellite';
}

export function saveStyleId(id: MapStyleId): void {
    try { window.localStorage.setItem(STYLE_KEY, id); } catch {}
}


export interface MapMarker {
    id:    string;
    label: string;
    x:     number;
    y:     number;
    color: string;
    icon:  string;
}

export const COLOR_SWATCHES = [
    '#f0c43a', '#5c6cf3', '#f5a242', '#3dd2bb', '#e573e1', '#7adcff',
    '#e53e57', '#a78bfa', '#22c55e', '#fb7185', '#06b6d4', '#84cc16',
];

export { ICON_KEYS };
export type IconKey = (typeof ICON_KEYS)[number];

const STORE_KEY = 'sd-phone:maps:v1';

export function loadMarkers(): MapMarker[] {
    return readJson<MapMarker[]>(STORE_KEY, Array.isArray) ?? getDefaultMarkers();
}

export function saveMarkers(markers: MapMarker[]): void {
    writeJson(STORE_KEY, markers);
}

export function getDefaultMarkers(): MapMarker[] {
    return [
        { id: 'seed-home', label: t('maps.seedHome', 'Home'),     x: -1037, y: -2738, color: '#3dd2bb', icon: 'Home' },
        { id: 'seed-gar',  label: t('maps.seedMechanic', 'Mechanic'), x:  -337, y: -136,  color: '#f5a242', icon: 'Wrench' },
    ];
}
