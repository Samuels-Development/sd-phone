import { create } from 'zustand';

import type { SimStatePush } from '@/core/types';

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

export function useNoSim(): boolean {
    return useSimStore(s => s.enabled && !s.device && !s.hasSim);
}

export function useNoService(): boolean {
    return useSimStore(s => s.enabled && s.device && !s.hasSim);
}
