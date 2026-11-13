import { create } from 'zustand';


interface BadgeState {
    local:  Record<string, number>;
    server: Record<string, number>;
    bump:        (id: string) => void;
    setServer:   (map: Record<string, number>) => void;
    patchServer: (map: Record<string, number>) => void;
    clear:       (id: string) => void;
}

export const useBadgeStore = create<BadgeState>((set) => ({
    local:  {},
    server: {},
    bump:      (id) => set(s => ({ local: { ...s.local, [id]: (s.local[id] ?? 0) + 1 } })),
    setServer: (map) => set({ server: map ?? {} }),
    patchServer: (map) => set(s => ({ server: { ...s.server, ...(map ?? {}) } })),
    clear:     (id) => set(s => (s.local[id] ? { local: { ...s.local, [id]: 0 } } : s)),
}));

export function useBadges(): Record<string, number> {
    const local  = useBadgeStore(s => s.local);
    const server = useBadgeStore(s => s.server);
    return { ...local, ...server };
}
