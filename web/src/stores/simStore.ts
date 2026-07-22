import { create } from 'zustand';

import type { SimStatePush } from '@/core/types';

/**
 * Unique-phones SIM state, fed by the `sd-phone:open` payload and live
 * `sd-phone:simState` pushes. `enabled` is false while the server runs with
 * the feature off, in which case the phone always has service.
 */
interface SimStore {
    enabled: boolean;
    hasSim: boolean;
    number: string | null;
    device: boolean;
    apply: (push: SimStatePush | undefined) => void;
}

export const useSimStore = create<SimStore>()(set => ({
    enabled: false,
    hasSim: false,
    number: null,
    device: false,
    apply: push => set({
        enabled: push?.enabled === true,
        hasSim: push?.hasSim === true,
        number: push?.number ?? null,
        device: push?.device === true,
    }),
}));

/**
 * True when the phone should render the full-screen "No SIM" lock state. LEGACY mode only:
 * in DeviceIdentity mode the phone opens and works without a SIM (see useNoService), so the
 * wall never shows.
 */
export function useNoSim(): boolean {
    return useSimStore(s => s.enabled && !s.device && !s.hasSim);
}

/**
 * True when the phone has no cellular service (SIM out) but still opens and works: DeviceIdentity
 * mode. Surfaces as a "No Service" status-bar label rather than a lock wall.
 */
export function useNoService(): boolean {
    return useSimStore(s => s.enabled && s.device && !s.hasSim);
}
