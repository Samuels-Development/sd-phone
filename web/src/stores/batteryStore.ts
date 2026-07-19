import { create } from 'zustand';

// Battery level lives in App.tsx (fed by the 'sd-phone:battery' NUI event); mirrored here so
// apps like Settings can read it without prop-threading through the deck.
interface BatteryState {
    level: number;
    setLevel: (pct: number) => void;
}

export const useBatteryStore = create<BatteryState>((set) => ({
    level: 100,
    setLevel: (pct) => set({ level: Math.max(0, Math.min(100, Math.round(pct))) }),
}));
