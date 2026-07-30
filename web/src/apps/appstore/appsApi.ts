import { device } from '@device';
import { fitsGrid } from '@/shell/widgets/geometry';
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

// Namespaced per device, because a layout is only meaningful against the grid it was arranged on.
// The phone keeps the bare key it has always used, so a harness layout saved before this survives.
const LAYOUT_KEY = device.id === 'phone' ? 'sd-phone:home-layout' : `sd-phone:home-layout:${device.id}`;

interface FolderDef { key: string; name: string; appIds: string[] }

/** 2x2, 4x2 and 4x4 cells, matching iOS small/medium/large. */
export type WidgetSize = 'sm' | 'md' | 'lg';

/** Which edge a widget's contents sit against. Only offered by widgets that declare support. */
export type WidgetAlign = 'left' | 'center' | 'right';

/** Light or dark surface, for widgets whose material is not derived from their content. */
export type WidgetTheme = 'dark' | 'light' | 'glass';

/** One placed widget. `uid` is per-instance so two Clocks can sit on the same page. */
export interface WidgetPlacement {
    uid:  string;
    kind: string;
    size: WidgetSize;
    page: number;
    col:  number;
    row:  number;
    /** Absent means left, so layouts saved before alignment existed keep their look. */
    align?: WidgetAlign;
    /** Absent means dark, which is what every widget looked like before themes existed. */
    theme?: WidgetTheme;
    /**
     * Ids this instance was told to show, in order. Absent means the widget chooses for itself -
     * Favourites falls back to starred contacts - so layouts saved before picking existed, and
     * widgets that do not offer a picker, both keep working untouched.
     */
    picks?: string[];
}

/**
 * `widgets` is a SIBLING of `slots`, deliberately. Encoding widgets into the slot array would
 * mean loosening isSlotArray, which exists to reject foreign layouts (lb-phone stores an array
 * of pages, which passes Array.isArray while being the wrong shape). A separate optional key
 * leaves that guard intact and lets an older build ignore widgets instead of choking on them.
 */
export interface SavedLayout { slots: (string | null)[]; folders: FolderDef[]; widgets?: WidgetPlacement[]; dock?: string[] }

/** Every slot must be an app id or an empty slot; anything else cannot be rendered. */
function isSlotArray(v: unknown): v is (string | null)[] {
    return Array.isArray(v) && v.every(s => s === null || typeof s === 'string');
}

const SIZES  = new Set(['sm', 'md', 'lg']);
const ALIGNS = new Set(['left', 'center', 'right']);
const THEMES = new Set(['dark', 'light', 'glass']);

/**
 * Keeps only placements that could actually be rendered. A widget with a junk size or an
 * off-grid cell would either throw or draw outside the page, so it is dropped rather than
 * trusted - same posture as the slot validation above.
 */
function sanitiseWidgets(v: unknown): WidgetPlacement[] {
    if (!Array.isArray(v)) return [];
    return v
        .map(w => (w && typeof w === 'object' && !ALIGNS.has((w as WidgetPlacement).align as string)
            // Drop a junk alignment rather than the whole widget: losing a tile over a bad
            // cosmetic field would be a worse outcome than falling back to the default.
            ? { ...(w as WidgetPlacement), align: undefined }
            : w))
        .map(w => (w && typeof w === 'object' && !THEMES.has((w as WidgetPlacement).theme as string)
            ? { ...(w as WidgetPlacement), theme: undefined }
            : w))
        .map(w => {
            if (!w || typeof w !== 'object' || (w as WidgetPlacement).picks === undefined) return w;
            // Keep only string ids, and drop the key entirely when nothing survives, so a corrupt
            // selection falls back to the widget's own default instead of rendering empty.
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
        && fitsGrid(w as WidgetPlacement));
}

/**
 * One parsed layout, or null when it cannot be trusted.
 *
 * Validates rather than casts. A layout reaching render with a non-string slot throws inside
 * `icon.startsWith(...)`, which unmounts the phone mid-render and leaves NUI focus held, stranding
 * the player's mouse. lb-phone's layout is an array of PAGES, so it satisfies `Array.isArray` while
 * being the wrong shape entirely.
 */
function parseValue(v: unknown): SavedLayout | null {
    if (isSlotArray(v)) return { slots: v, folders: [] };
    if (v && typeof v === 'object' && isSlotArray((v as SavedLayout).slots)) {
        const o = v as SavedLayout;
        const widgets = sanitiseWidgets(o.widgets);
        // Only attached when there is something to attach, so a widget-less layout keeps the
        // exact shape it had before widgets existed.
        return {
            slots: o.slots,
            folders: Array.isArray(o.folders) ? o.folders : [],
            ...(widgets.length ? { widgets } : {}),
            ...(Array.isArray(o.dock) ? { dock: o.dock.filter((x): x is string => typeof x === 'string') } : {}),
        };
    }
    return null;
}

/**
 * How one stored layout column holds every device. `slots` is a flat array whose page boundaries
 * are the device's own cols * rows - 24 on the phone, 36 on the tablet - so reading a tablet
 * layout as a phone one puts every icon past the first page in a different cell, and a widget
 * saved at column 4 does not exist on a 4-column grid at all. Each device therefore owns its own
 * layout string under its device id, and the server merges by key without ever decoding the
 * layout itself (`slots` is full of nulls, which Lua cannot hold without shredding the array).
 */
interface LayoutEnvelope { devices: Record<string, string> }

function isEnvelope(v: unknown): v is LayoutEnvelope {
    return !!v && typeof v === 'object'
        && !!(v as LayoutEnvelope).devices && typeof (v as LayoutEnvelope).devices === 'object';
}

/** This device's slice of a stored value, or undefined when it holds nothing for us. */
function ownSlice(v: unknown): unknown {
    // No envelope means it was written when the phone was the only device, so it IS the phone's.
    // A tablet starts from its own default rather than inheriting a layout built for 4 columns.
    if (!isEnvelope(v)) return device.id === 'phone' ? v : undefined;
    const raw = v.devices[device.id];
    if (typeof raw !== 'string') return undefined;
    try { return JSON.parse(raw) as unknown; } catch { return undefined; }
}

/** The layout the server stored for THIS device, or null when there is none to trust. */
export function parseLayout(raw: string | null | undefined): SavedLayout | null {
    if (!raw) return null;
    try {
        const own = ownSlice(JSON.parse(raw) as unknown);
        return own === undefined ? null : parseValue(own);
    } catch { /* ignore */ }
    return null;
}

export function loadHomeLayout(): SavedLayout | null {
    if (isFiveM) return null;
    // The harness key is already per-device, so it holds this device's layout directly - there is
    // no envelope to unwrap, and routing it through parseLayout would reject every tablet layout.
    try {
        const raw = window.localStorage.getItem(LAYOUT_KEY);
        return raw ? parseValue(JSON.parse(raw) as unknown) : null;
    } catch { return null; }
}

export function saveHomeLayout(layout: SavedLayout): void {
    if (!isFiveM) { writeJson(LAYOUT_KEY, layout); return; }
    void fetchNui('sd-phone:apps:saveLayout', { layout: JSON.stringify(layout), device: device.id });
}
