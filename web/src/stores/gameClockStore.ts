import { create } from 'zustand';

export interface GameClock {
    hour:   number;
    minute: number;
    day:    number;
    month:  number;
    year:   number;
}

interface GameClockState {
    clock: GameClock | null;
    setClock: (c: GameClock) => void;
}

export const useGameClockStore = create<GameClockState>(set => ({
    clock: null,
    setClock: (c) => set({ clock: c }),
}));

export function isGameClock(v: unknown): v is GameClock {
    if (!v || typeof v !== 'object') return false;
    const c = v as Record<string, unknown>;
    return ['hour', 'minute', 'day', 'month', 'year'].every(k => typeof c[k] === 'number' && Number.isFinite(c[k]));
}

export function gameClockDate(clock: GameClock, real: Date): Date {
    const d = new Date(real);
    d.setFullYear(clock.year, clock.month - 1, clock.day);
    d.setHours(clock.hour, clock.minute);
    return d;
}
