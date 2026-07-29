import { create } from 'zustand';

import type { WifiNetwork, WifiState } from '@/core/types';

interface WifiStoreState extends WifiState {
    providesData: boolean;
    configured: boolean;
    apply: (push?: WifiPush | null) => void;
}

interface WifiPush {
    enabled?: unknown;
    connected?: unknown;
    networks?: unknown;
    configured?: unknown;
    providesData?: unknown;
}

const MAX_BARS = 3;

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const finite = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

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
        known:    r.known === true,
        strength: clamp(finite(r.strength), 0, 1),
        bars:     clamp(Math.round(finite(r.bars)), 0, MAX_BARS),
    };
}

export const useWifiStore = create<WifiStoreState>()(set => ({
    enabled: false,
    connected: null,
    networks: [],
    providesData: false,
    configured: false,
    apply: push => {
        const raw  = push?.networks;
        const list: unknown[] = Array.isArray(raw) ? raw : [];
        const connected = toNetwork(push?.connected);
        set({
            enabled:   push?.enabled === true,
            configured: push?.configured === true,
            connected,
            networks:  list.map(toNetwork).filter((n): n is WifiNetwork => n !== null),
            providesData: connected !== null && push?.providesData === true,
        });
    },
}));

export function useWifiData(): boolean {
    return useWifiStore(s => s.providesData);
}

export function useWifiConnected(): WifiNetwork | null {
    return useWifiStore(s => s.connected);
}

export function useWifiNetworks(): WifiNetwork[] {
    return useWifiStore(s => s.networks);
}
