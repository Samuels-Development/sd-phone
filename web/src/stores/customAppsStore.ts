import { create } from 'zustand';

import { fetchNui } from '@/core/nui';
import { readJson, writeJson } from '@/lib/storage';
import { device } from '@device';
import type { AppDef, CustomAppDef } from '@/core/types';

const INSTALLED_KEY = 'customApps:installed';

function readInstalled(): string[] {
    const arr = readJson<string[]>(INSTALLED_KEY, v => Array.isArray(v));
    return arr ? arr.filter((x): x is string => typeof x === 'string') : [];
}

export function setCustomInstalled(id: string, installed: boolean): void {
    const set = new Set(readInstalled());
    if (installed) set.add(id); else set.delete(id);
    writeJson(INSTALLED_KEY, [...set]);
}

export function withCustomInstalled(ids: Iterable<string>): Set<string> {
    return new Set([...ids, ...readInstalled()]);
}

export function clearCustomInstalled(): void {
    writeJson(INSTALLED_KEY, []);
}

function forThisDevice(apps: CustomAppDef[] | null | undefined): CustomAppDef[] {
    if (!Array.isArray(apps)) return [];
    return apps.filter(a => !a.devices?.length || a.devices.includes(device.id));
}

interface CustomAppsState {
    apps:    CustomAppDef[];
    setAll:  (apps: CustomAppDef[] | null | undefined) => void;
    hydrate: () => void;
}

export const useCustomAppsStore = create<CustomAppsState>((set) => ({
    apps: [],
    setAll: (apps) => set({ apps: forThisDevice(apps) }),
    hydrate: () => {
        void fetchNui<CustomAppDef[]>('customApps/get').then(list => {
            if (Array.isArray(list)) set({ apps: forThisDevice(list) });
        }).catch(() => { /* offline / dev: keep current */ });
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
