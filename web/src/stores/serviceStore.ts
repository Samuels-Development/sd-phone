import { create } from 'zustand';

import { useWifiData } from './wifiStore';

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

export function useServiceBars(fallback: number): number {
    return useServiceStore(s => (s.active ? s.bars : fallback));
}

export function useHasData(): boolean {
    const cell = useServiceStore(s => s.data);
    const wifi = useWifiData();
    return cell || wifi;
}

export function useNoServiceArea(): boolean {
    return useServiceStore(s => s.active && s.bars === 0);
}
