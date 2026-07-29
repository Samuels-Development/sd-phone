import { create } from 'zustand';

import type { WifiNetwork, WifiState } from '@/core/types';

/**
 * Live Wi-Fi, fed by the `sd-phone:wifi` push. Every field is re-derived from the push rather
 * than merged, so a snapshot that drops a network or a connection is the whole truth.
 */
interface WifiStoreState extends WifiState {
    apply: (push?: WifiPush | null) => void;
}

/** The push as it actually arrives: field-by-field unknown, because Lua is not type checked. */
interface WifiPush {
    enabled?: unknown;
    connected?: unknown;
    networks?: unknown;
    providesData?: unknown;
}

/** Arcs the Wi-Fi icon draws, and the cap for a pushed `bars`. */
const MAX_BARS = 3;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const finite = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Normalizes one pushed network, or null when it carries no usable identity. */
function toNetwork(raw: unknown): WifiNetwork | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const id   = typeof r.id === 'string' ? r.id : '';
    const ssid = typeof r.ssid === 'string' ? r.ssid : '';
    if (!id && !ssid) return null;
    return {
        id:       id || ssid,
        ssid:     ssid || id,
        secured:  r.secured === true,
        strength: clamp(finite(r.strength), 0, 1),
        bars:     clamp(Math.round(finite(r.bars)), 0, MAX_BARS),
    };
}

export const useWifiStore = create<WifiStoreState>()(set => ({
    enabled: false,
    connected: null,
    networks: [],
    providesData: false,
    apply: push => {
        const raw  = push?.networks;
        const list: unknown[] = Array.isArray(raw) ? raw : [];
        const connected = toNetwork(push?.connected);
        set({
            enabled:   push?.enabled === true,
            connected,
            networks:  list.map(toNetwork).filter((n): n is WifiNetwork => n !== null),
            // Only ever true alongside a live connection, so a stale flag cannot keep the UI
            // believing there is a data path after the network drops.
            providesData: connected !== null && push?.providesData === true,
        });
    },
}));

/** True when a joined Wi-Fi network is carrying data, whatever the cell towers say. */
export function useWifiData(): boolean {
    return useWifiStore(s => s.providesData);
}

/** The network currently joined, or null when the phone is on cellular only. */
export function useWifiConnected(): WifiNetwork | null {
    return useWifiStore(s => s.connected);
}

/** Networks in range, strongest first as the client ordered them. */
export function useWifiNetworks(): WifiNetwork[] {
    return useWifiStore(s => s.networks);
}
