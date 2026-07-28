import { create } from 'zustand';

export type DeadBehaviour = 'dead' | 'noservice';

interface BatteryPatch {
    level?: number;
    charging?: boolean;
    lowPower?: boolean;
    enabled?: boolean;
    deadBehaviour?: DeadBehaviour;
}

interface BatteryState {
    level: number;
    charging: boolean;
    lowPower: boolean;
    enabled: boolean;
    deadBehaviour: DeadBehaviour;
    warnAt: number | null;
    bootSeconds: number | null;
    patch: (next: BatteryPatch) => void;
    setLevel: (pct: number) => void;
    setWarn: (threshold: number | null) => void;
    setBooting: (seconds: number | null) => void;
    isDead: () => boolean;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export const useBatteryStore = create<BatteryState>((set, get) => ({
    level: 100,
    charging: false,
    lowPower: false,
    enabled: false,
    deadBehaviour: 'dead',
    warnAt: null,
    bootSeconds: null,
    patch: (next) => set((s) => ({
        level:         typeof next.level === 'number' && Number.isFinite(next.level) ? clamp(next.level) : s.level,
        charging:      next.charging ?? s.charging,
        lowPower:      next.lowPower ?? s.lowPower,
        enabled:       next.enabled  ?? s.enabled,
        deadBehaviour: next.deadBehaviour ?? s.deadBehaviour,
    })),
    setLevel: (pct) => set({ level: clamp(pct) }),
    setWarn: (threshold) => set({ warnAt: threshold }),
    setBooting: (seconds) => set({ bootSeconds: seconds }),
    isDead: () => get().enabled && get().level <= 0,
}));
