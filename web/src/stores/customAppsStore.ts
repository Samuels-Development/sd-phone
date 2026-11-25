import { create } from 'zustand';

import { fetchNui } from '@/core/nui';
import { readJson, writeJson } from '@/lib/storage';
import { device } from '@device';
import type { AppDef, CustomAppDef } from '@/core/types';

const INSTALLED_KEY = 'customApps:installed';
const PROFILE_KEY_PREFIX = `${INSTALLED_KEY}:profile:`;
const MIGRATED_KEY = `${INSTALLED_KEY}:migrated:v1`;

let activeProfile: string | undefined;

function installedKey(profile = activeProfile): string {
    return profile ? `${PROFILE_KEY_PREFIX}${encodeURIComponent(profile)}` : INSTALLED_KEY;
}

function readInstalled(key = installedKey()): string[] {
    const arr = readJson<string[]>(key, v => Array.isArray(v));
    return arr ? arr.filter((x): x is string => typeof x === 'string') : [];
}

/** Selects the active phone data profile and copies the old shared list to its first profile. */
export function setCustomAppsProfile(profile: string | undefined): boolean {
    const next = typeof profile === 'string' && profile.trim() ? profile.trim() : undefined;
    const changed = next !== activeProfile;
    activeProfile = next;

    if (!next) return changed;

    const profileStorageKey = installedKey(next);
    try {
        if (localStorage.getItem(MIGRATED_KEY) === '1') return changed;

        const legacy = readJson<string[]>(INSTALLED_KEY, v => Array.isArray(v));
        if (legacy && localStorage.getItem(profileStorageKey) === null
            && !writeJson(profileStorageKey, legacy)) return changed;

        localStorage.setItem(MIGRATED_KEY, '1');
    } catch {
        // Keep the active profile usable if browser storage is unavailable.
    }
    return changed;
}

export function setCustomInstalled(id: string, installed: boolean, profile = activeProfile): void {
    const set = new Set(readInstalled(installedKey(profile)));
    if (installed) set.add(id); else set.delete(id);
    writeJson(installedKey(profile), [...set]);
}

export function withCustomInstalled(ids: Iterable<string>): Set<string> {
    return new Set([...ids, ...readInstalled()]);
}

export function clearCustomInstalled(): void {
    writeJson(installedKey(), []);
}

function forThisDevice(apps: CustomAppDef[] | null | undefined): CustomAppDef[] {
    if (!Array.isArray(apps)) return [];
    return apps.filter(a => !a.devices?.length || a.devices.includes(device.id));
}

function keepIfSame(prev: CustomAppsState, next: CustomAppDef[]): CustomAppsState | { apps: CustomAppDef[] } {
    return JSON.stringify(prev.apps) === JSON.stringify(next) ? prev : { apps: next };
}

interface CustomAppsState {
    apps:    CustomAppDef[];
    setAll:  (apps: CustomAppDef[] | null | undefined) => void;
    hydrate: () => void;
}

export const useCustomAppsStore = create<CustomAppsState>((set) => ({
    apps: [],
    setAll: (apps) => set(s => keepIfSame(s, forThisDevice(apps))),
    hydrate: () => {
        void fetchNui<CustomAppDef[]>('customApps/get').then(list => {
            if (Array.isArray(list)) set(s => keepIfSame(s, forThisDevice(list)));
        }).catch(() => {});
    },
}));

export function useCustomApps(): CustomAppDef[] {
    return useCustomAppsStore(s => s.apps);
}

export function getCustomApp(id: string | null | undefined): CustomAppDef | undefined {
    if (id == null) return undefined;
    return useCustomAppsStore.getState().apps.find(a => a.id === id);
}

export function isCustomApp(id: string | null | undefined): boolean {
    if (id == null) return false;
    return useCustomAppsStore.getState().apps.some(a => a.id === id);
}

export function customAccent(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360} 62% 48%)`;
}

export function customToAppDef(c: CustomAppDef): AppDef {
    return {
        id:     c.id,
        label:  c.name,
        icon:   `custom:${c.id}`,
        route:  c.id,
        accent: customAccent(c.id),
        base:   !!c.defaultApp,
    };
}
