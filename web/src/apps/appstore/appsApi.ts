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

const LAYOUT_KEY = 'sd-phone:home-layout';

interface FolderDef { key: string; name: string; appIds: string[] }
export interface SavedLayout { slots: (string | null)[]; folders: FolderDef[] }

/** Every slot must be an app id or an empty slot; anything else cannot be rendered. */
function isSlotArray(v: unknown): v is (string | null)[] {
    return Array.isArray(v) && v.every(s => s === null || typeof s === 'string');
}

/**
 * A stored layout, or null when it cannot be trusted.
 *
 * Validates rather than casts. A layout reaching render with a non-string slot throws inside
 * `icon.startsWith(...)`, which unmounts the phone mid-render and leaves NUI focus held, stranding
 * the player's mouse. lb-phone's layout is an array of PAGES, so it satisfies `Array.isArray` while
 * being the wrong shape entirely.
 */
export function parseLayout(raw: string | null | undefined): SavedLayout | null {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw) as unknown;
        if (isSlotArray(v)) return { slots: v, folders: [] };
        if (v && typeof v === 'object' && isSlotArray((v as SavedLayout).slots)) {
            const o = v as SavedLayout;
            return { slots: o.slots, folders: Array.isArray(o.folders) ? o.folders : [] };
        }
    } catch { /* ignore */ }
    return null;
}

export function loadHomeLayout(): SavedLayout | null {
    if (isFiveM) return null;
    try { return parseLayout(window.localStorage.getItem(LAYOUT_KEY)); } catch { return null; }
}

export function saveHomeLayout(layout: SavedLayout): void {
    if (!isFiveM) { writeJson(LAYOUT_KEY, layout); return; }
    void fetchNui('sd-phone:apps:saveLayout', { layout: JSON.stringify(layout) });
}
