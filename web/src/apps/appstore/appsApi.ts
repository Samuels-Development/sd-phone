import { device } from '@device';
import { gridFor, isDensity } from '@/device/grid';
import type { Density } from '@/device/types';
import { fitsIn } from '@/shell/widgets/geometry';
import { fetchNui, isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';
import { readJson, writeJson } from '@/lib/storage';

const DEV_KEY = 'sd-phone:installed-apps';

function devRead(): string[] {
    return readJson<string[]>(DEV_KEY) ?? [];
}
function devWrite(ids: string[]): void {
    writeJson(DEV_KEY, ids);
}

export async function listInstalledApps(): Promise<string[]> {
    if (!isFiveM) return devRead();
    return (await apiData<{ installed: string[] }>('sd-phone:apps:list'))?.installed ?? [];
}

export async function installApp(id: string): Promise<string[]> {
    if (!isFiveM) { const ids = [...new Set([...devRead(), id])]; devWrite(ids); return ids; }
    const r = await apiData<{ installed: string[] }>('sd-phone:apps:install', { id });
    return r ? r.installed : listInstalledApps();
}

export async function uninstallApp(id: string): Promise<string[]> {
    if (!isFiveM) { const ids = devRead().filter(x => x !== id); devWrite(ids); return ids; }
    const r = await apiData<{ installed: string[] }>('sd-phone:apps:uninstall', { id });
    return r ? r.installed : listInstalledApps();
}

const LAYOUT_KEY = device.id === 'phone' ? 'sd-phone:home-layout' : `sd-phone:home-layout:${device.id}`;

interface FolderDef { key: string; name: string; appIds: string[] }

export type WidgetSize = 'sm' | 'md' | 'lg';

export type WidgetAlign = 'left' | 'center' | 'right';

export type WidgetTheme = 'dark' | 'light' | 'glass';

export interface WidgetCard {
    kind:   string;
    align?: WidgetAlign;
    theme?: WidgetTheme;
    picks?: string[];
}

export interface WidgetPlacement {
    uid:  string;
    kind: string;
    size: WidgetSize;
    page: number;
    col:  number;
    row:  number;
    align?: WidgetAlign;
    theme?: WidgetTheme;
    picks?: string[];
    stack?: WidgetCard[];
}

export interface SavedLayout { slots: (string | null)[]; folders: FolderDef[]; widgets?: WidgetPlacement[]; dock?: string[]; density?: Density; rows?: number }

function isSlotArray(v: unknown): v is (string | null)[] {
    return Array.isArray(v) && v.every(s => s === null || typeof s === 'string');
}

const SIZES  = new Set(['sm', 'md', 'lg']);
const ALIGNS = new Set(['left', 'center', 'right']);
const THEMES = new Set(['dark', 'light', 'glass']);

function sanitiseWidgets(v: unknown, density: Density): WidgetPlacement[] {
    if (!Array.isArray(v)) return [];
    const { cols, rows } = gridFor(density);
    return v
        .map(w => (w && typeof w === 'object' && !ALIGNS.has((w as WidgetPlacement).align as string)
            ? { ...(w as WidgetPlacement), align: undefined }
            : w))
        .map(w => (w && typeof w === 'object' && !THEMES.has((w as WidgetPlacement).theme as string)
            ? { ...(w as WidgetPlacement), theme: undefined }
            : w))
        .map(w => {
            if (!w || typeof w !== 'object' || (w as WidgetPlacement).picks === undefined) return w;
            const clean = (Array.isArray((w as WidgetPlacement).picks) ? (w as WidgetPlacement).picks! : [])
                .filter(x => typeof x === 'string');
            return { ...(w as WidgetPlacement), picks: clean.length ? clean : undefined };
        })
        .filter((w): w is WidgetPlacement =>
        !!w && typeof w === 'object'
        && typeof (w as WidgetPlacement).uid === 'string'
        && typeof (w as WidgetPlacement).kind === 'string'
        && SIZES.has((w as WidgetPlacement).size)
        && Number.isInteger((w as WidgetPlacement).page) && (w as WidgetPlacement).page >= 0
        && Number.isInteger((w as WidgetPlacement).col)
        && Number.isInteger((w as WidgetPlacement).row)
        && fitsIn(w as WidgetPlacement, cols, rows));
}

const LEGACY_APP_IDS: Record<string, string> = { blackjack: 'casino' };

function healLegacyIds(layout: SavedLayout): SavedLayout {
    const all: string[] = [
        ...layout.slots.filter((s): s is string => typeof s === 'string'),
        ...layout.folders.flatMap(f => (Array.isArray(f.appIds) ? f.appIds.filter(x => typeof x === 'string') : [])),
        ...(layout.dock ?? []),
    ];
    if (!all.some(id => LEGACY_APP_IDS[id] !== undefined)) return layout;

    const taken = new Set(all.filter(id => LEGACY_APP_IDS[id] === undefined));
    const claimed = new Set<string>();
    const heal = (id: string): string | null => {
        const next = LEGACY_APP_IDS[id];
        if (next === undefined) return id;
        if (taken.has(next) || claimed.has(next)) return null;
        claimed.add(next);
        return next;
    };
    const healList = (ids: string[]): string[] =>
        ids.map(heal).filter((x): x is string => x !== null);

    return {
        ...layout,
        slots: layout.slots.map(s => (typeof s === 'string' ? heal(s) : s)),
        folders: layout.folders.map(f => (Array.isArray(f.appIds)
            ? { ...f, appIds: healList(f.appIds.filter(x => typeof x === 'string')) }
            : f)),
        ...(layout.dock ? { dock: healList(layout.dock) } : {}),
    };
}

function parseValue(v: unknown): SavedLayout | null {
    if (isSlotArray(v)) return healLegacyIds({ slots: v, folders: [] });
    if (v && typeof v === 'object' && isSlotArray((v as SavedLayout).slots)) {
        const o = v as SavedLayout;
        const density: Density = isDensity(o.density) ? o.density : 'default';
        const widgets = sanitiseWidgets(o.widgets, density);
        return healLegacyIds({
            slots: o.slots,
            folders: Array.isArray(o.folders) ? o.folders : [],
            ...(isDensity(o.density) ? { density: o.density } : {}),
            ...(typeof o.rows === 'number' && o.rows > 0 ? { rows: Math.floor(o.rows) } : {}),
            ...(widgets.length ? { widgets } : {}),
            ...(Array.isArray(o.dock) ? { dock: o.dock.filter((x): x is string => typeof x === 'string') } : {}),
        });
    }
    return null;
}

interface LayoutEnvelope { devices: Record<string, string> }

function isEnvelope(v: unknown): v is LayoutEnvelope {
    return !!v && typeof v === 'object'
        && !!(v as LayoutEnvelope).devices && typeof (v as LayoutEnvelope).devices === 'object';
}

function ownSlice(v: unknown): unknown {
    if (!isEnvelope(v)) return device.id === 'phone' ? v : undefined;
    const raw = v.devices[device.id];
    if (typeof raw !== 'string') return undefined;
    try { return JSON.parse(raw) as unknown; } catch { return undefined; }
}

export function parseLayout(raw: string | null | undefined): SavedLayout | null {
    if (!raw) return null;
    try {
        const own = ownSlice(JSON.parse(raw) as unknown);
        return own === undefined ? null : parseValue(own);
    } catch {}
    return null;
}

export function loadHomeLayout(): SavedLayout | null {
    if (isFiveM) return null;
    try {
        const raw = window.localStorage.getItem(LAYOUT_KEY);
        return raw ? parseValue(JSON.parse(raw) as unknown) : null;
    } catch { return null; }
}

export function saveHomeLayout(layout: SavedLayout): void {
    if (!isFiveM) { writeJson(LAYOUT_KEY, layout); return; }
    void fetchNui('sd-phone:apps:saveLayout', { layout: JSON.stringify(layout), device: device.id });
}
