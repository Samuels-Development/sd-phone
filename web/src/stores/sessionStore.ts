import { create } from 'zustand';

interface SessionState {
    startMs: number | null;
    setStartMs: (ms: number) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
    startMs: null,
    setStartMs: (ms) => set({ startMs: ms }),
}));
