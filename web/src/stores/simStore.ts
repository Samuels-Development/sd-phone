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
    apply: (push: SimStatePush | undefined) => void;
}

export const useSimStore = create<SimStore>()(set => ({
    enabled: false,
    hasSim: false,
    number: null,
    apply: push => set({
        enabled: push?.enabled === true,
        hasSim: push?.hasSim === true,
        number: push?.number ?? null,
    }),
}));

/** True when the phone should render the "No SIM" lock state. */
export function useNoSim(): boolean {
    return useSimStore(s => s.enabled && !s.hasSim);
}
