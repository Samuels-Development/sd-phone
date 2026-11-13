import { create } from 'zustand';

import { fetchNui, isFiveM } from '@/core/nui';
import { getLocale, setLocale as applyLocale, SUPPORTED_LOCALES } from '@/i18n';
import type { LocaleOption } from '@/i18n';

export type { LocaleOption };
export { SUPPORTED_LOCALES };

const LOCALE_KEY = 'sd-phone:locale';
function loadLocal(): string | null {
    try { return window.localStorage.getItem(LOCALE_KEY); } catch { return null; }
}
function saveLocal(code: string) {
    try { window.localStorage.setItem(LOCALE_KEY, code); } catch {}
}

interface LocaleState {
    locale: string;
    changedAt: number;
    initialized: boolean;
    setLocale: (code: string) => void;
    applyServerDefault: (code: string) => void;
    hydrate: () => void;
}

export const useLocaleStore = create<LocaleState>((set, get) => {
    const adopt = () => {
        const next = getLocale();
        if (next !== get().locale) set({ locale: next, changedAt: Date.now() });
    };

    return {
        locale: getLocale(),
        changedAt: 0,
        initialized: false,

        setLocale: (code) => {
            set({ initialized: true });
            void applyLocale(code).then(adopt);
            if (isFiveM) void fetchNui('sd-phone:settings:setLocale', { locale: code }).catch(() => {});
            else saveLocal(code);
        },

        applyServerDefault: (code) => {
            if (get().initialized) return;
            set({ initialized: true });
            void applyLocale(code).then(adopt);
        },

        hydrate: () => {
            if (isFiveM) {
                void fetchNui<{ data?: { locale?: string } }>('sd-phone:settings:get')
                    .then(res => {
                        const code = res?.data?.locale;
                        if (code) {
                            set({ initialized: true });
                            void applyLocale(code).then(adopt);
                        }
                    })
                    .catch(() => {});
            } else {
                const code = loadLocal();
                if (code) {
                    set({ initialized: true });
                    void applyLocale(code).then(adopt);
                }
            }
        },
    };
});
