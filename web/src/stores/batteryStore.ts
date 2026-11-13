import { create } from 'zustand';

interface BatteryState {
    level: number;
    setLevel: (pct: number) => void;
}

export const useBatteryStore = create<BatteryState>((set) => ({
    level: 100,
    setLevel: (pct) => set({ level: Math.max(0, Math.min(100, Math.round(pct))) }),
}));
