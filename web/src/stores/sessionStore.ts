import { create } from 'zustand';

// Session anchor (wall-clock ms of character load) fed by the 'sd-phone:session' NUI event in
// App.tsx; the Health app reads it so "time awake" is correct on first open, whenever that happens.
interface SessionState {
    startMs: number | null;
    setStartMs: (ms: number) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
    startMs: null,
    setStartMs: (ms) => set({ startMs: ms }),
}));
