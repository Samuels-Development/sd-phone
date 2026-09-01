import { create } from 'zustand';

import type { ReceivedIdCard } from '@/core/types';

interface IdState {
    received: ReceivedIdCard[];
    unseen:   string | null;
    add:      (card: ReceivedIdCard) => void;
    markSeen: () => void;
    dismiss:  (id: string) => void;
    prune:    (now: number) => void;
}

export const useIdStore = create<IdState>((set) => ({
    received: [],
    unseen:   null,
    add: (card) => set(s => (s.received.some(r => r.id === card.id)
        ? s
        : { received: [card, ...s.received], unseen: card.id })),
    markSeen: () => set({ unseen: null }),
    dismiss:  (id) => set(s => ({ received: s.received.filter(r => r.id !== id), unseen: s.unseen === id ? null : s.unseen })),
    prune: (now) => set(s => {
        const live = s.received.filter(r => r.expiresAt > now);
        if (live.length === s.received.length) return s;
        return { received: live, unseen: live.some(r => r.id === s.unseen) ? s.unseen : null };
    }),
}));
