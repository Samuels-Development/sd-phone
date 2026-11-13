import { create } from 'zustand';

import { fetchNui, isFiveM } from '@/core/nui';
import type { Envelope } from '@/core/api';

export interface NotifPref {
    enabled: boolean;
    sounds:  boolean;
    tone?:   string;
}

export const DEFAULT_PREF: NotifPref = Object.freeze({ enabled: true, sounds: true });

const HYDRATE_RETRY_MS = 1500;
const HYDRATE_MAX_RETRIES = 20;

interface NotifPrefsState {
    prefs:    Record<string, NotifPref>;
    hydrated: boolean;
    hydrate:  (attempt?: number) => Promise<void>;
    patch:    (app: string, patch: Partial<NotifPref>) => void;
    reset:    () => void;
}

export const useNotifPrefsStore = create<NotifPrefsState>((set, get) => ({
    prefs: {},
    hydrated: !isFiveM,

    hydrate: async (attempt = 0) => {
        if (!isFiveM) return;
        const retry = () => {
            if (attempt < HYDRATE_MAX_RETRIES) {
                window.setTimeout(() => void get().hydrate(attempt + 1), HYDRATE_RETRY_MS);
            }
        };

        const res = await fetchNui<Envelope<Record<string, NotifPref>>>('sd-phone:settings:getNotifPrefs')
            .catch(() => null);
        if (!res?.success || !res.data || typeof res.data !== 'object') { retry(); return; }

        const clean: Record<string, NotifPref> = {};
        for (const [app, p] of Object.entries(res.data)) {
            clean[app] = {
                enabled: p?.enabled !== false,
                sounds:  p?.sounds !== false,
                tone:    typeof p?.tone === 'string' && p.tone ? p.tone : undefined,
            };
        }
        set({ prefs: clean, hydrated: true });
    },

    patch: (app, patch) => {
        const next = { ...(get().prefs[app] ?? DEFAULT_PREF), ...patch };
        set(s => ({ prefs: { ...s.prefs, [app]: next } }));
        if (!isFiveM) return;
        void fetchNui('sd-phone:settings:setNotifPref', {
            app,
            on:     next.enabled,
            sounds: next.sounds,
            tone:   next.tone ?? '',
        }).catch(() => {});
    },

    reset: () => set({ prefs: {}, hydrated: !isFiveM }),
}));

export function prefFor(app: string): NotifPref {
    return useNotifPrefsStore.getState().prefs[app] ?? DEFAULT_PREF;
}

export function useNotifPref(app: string): NotifPref {
    return useNotifPrefsStore(s => s.prefs[app]) ?? DEFAULT_PREF;
}
