import { create } from 'zustand';

import { useWifiData } from './wifiStore';

/**
 * Live cellular service, fed by the `sd-phone:service` push. `active` stays false until the
 * first push arrives, which is what keeps a server with no towers configured on its static
 * `StatusBar.SignalBars` value instead of snapping to a computed one.
 */
interface ServiceState {
    bars: number;
    level: number;
    data: boolean;
    active: boolean;
    apply: (push: { bars?: number; level?: number; data?: boolean }) => void;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const useServiceStore = create<ServiceState>()(set => ({
    bars: 4,
    level: 1,
    data: true,
    active: false,
    apply: push => set({
        bars:   clamp(Math.round(push?.bars ?? 4), 0, 4),
        level:  clamp(push?.level ?? 1, 0, 1),
        data:   push?.data !== false,
        active: true,
    }),
}));

/** Bars to draw: the live value once towers are configured, else the static config fallback. */
export function useServiceBars(fallback: number): number {
    return useServiceStore(s => (s.active ? s.bars : fallback));
}

/**
 * True when data-backed features can reach the server: app downloads, social apps, and the like.
 * Answers for both radios, matching the Lua gate, so a phone on Wi-Fi in a cell dead zone is not
 * told it is offline.
 */
export function useHasData(): boolean {
    const cell = useServiceStore(s => s.data);
    const wifi = useWifiData();
    return cell || wifi;
}

/** True when the player is inside a configured dead zone (no bars from any tower). */
export function useNoServiceArea(): boolean {
    return useServiceStore(s => s.active && s.bars === 0);
}
