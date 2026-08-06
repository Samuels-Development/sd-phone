import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { device } from '@device';
import type { DeviceAlign } from '@/device/types';
import lockscreenAsset from '@/assets/wallpapers/lockscreen.webp';
import devDefaultAsset from '@/assets/photos/background5.webp';
import { fetchNui, isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import type { IslandPetId } from '@/shell/islandPets';
import { isDemo } from '@/core/demo';
import { wallpaperKey } from '@/shell/wallpapers';
import { useIconThemeStore } from '@/stores/iconThemeStore';
import { DEFAULT_LOCK_CLOCK, loadLockClockLocal, saveLockClockLocal, type LockClock } from '@/shell/lockClock';
import { DEFAULT_NOTIFICATION, DEFAULT_RINGTONE } from '@/apps/settings/tones';
import type { CustomTone, ToneKind } from '@/apps/settings/tones';
import { warmYouTube } from '@/apps/settings/tonePlayer';
import { clampRecipe, isCustomPaletteId, MAX_CUSTOM_PALETTES, PALETTE_NAME_MAX } from '@/apps/settings/appearance/paletteRamp';
import { DEFAULT_ACCENT, isAccentChoice } from '@/apps/settings/appearance/accentRamp';
import { DEFAULT_SHELL, isShellId, SHELLS } from '@/shell/shells';
import type { PaletteMode, PaletteRecipe } from '@/apps/settings/appearance/paletteRamp';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'sd-phone:theme';
function loadThemeLocal(): Theme {
    try {
        return window.localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch { return 'light'; }
}
function saveThemeLocal(v: Theme) {
    try { window.localStorage.setItem(THEME_KEY, v); } catch { /* ignore */ }
}

export type DarkTheme = 'graphite' | 'black' | 'warm' | 'midnight' | 'moss' | 'plum' | 'slate' | 'ocean' | 'rose' | 'clay';
export type LightTheme = 'silver' | 'snow' | 'linen' | 'sky' | 'mint' | 'blush' | 'sand' | 'lavender' | 'stone' | 'dusk';
export type CustomPaletteId = `custom:${string}`;
export type DarkThemeChoice = DarkTheme | CustomPaletteId;
export type LightThemeChoice = LightTheme | CustomPaletteId;
export interface CustomPalette extends PaletteRecipe {
    id:   CustomPaletteId;
    name: string;
    mode: PaletteMode;
}
const PALETTES_KEY = 'sd-phone:customPalettes';
function sanitizePalette(v: unknown): CustomPalette | null {
    if (!v || typeof v !== 'object') return null;
    const raw = v as Record<string, unknown>;
    if (!isCustomPaletteId(raw.id)) return null;
    if (raw.mode !== 'light' && raw.mode !== 'dark') return null;
    if (typeof raw.name !== 'string') return null;
    const name = raw.name.trim().slice(0, PALETTE_NAME_MAX);
    if (!name) return null;
    return { id: raw.id as CustomPaletteId, name, mode: raw.mode, ...clampRecipe(raw as Partial<PaletteRecipe>, raw.mode) };
}
function decodePalettes(v: unknown): CustomPalette[] {
    if (!Array.isArray(v)) return [];
    const out: CustomPalette[] = [];
    const seen = new Set<string>();
    for (const entry of v) {
        const clean = sanitizePalette(entry);
        if (clean && !seen.has(clean.id) && out.length < MAX_CUSTOM_PALETTES) {
            seen.add(clean.id);
            out.push(clean);
        }
    }
    return out;
}
function loadPalettesLocal(): CustomPalette[] {
    try { return decodePalettes(JSON.parse(window.localStorage.getItem(PALETTES_KEY) ?? '[]')); }
    catch { return []; }
}
function savePalettesLocal(v: CustomPalette[]) {
    try { window.localStorage.setItem(PALETTES_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}
function savePaletteChoiceLocal(key: string, v: string) {
    try { window.localStorage.setItem(key, v); } catch { /* ignore */ }
}
const DARK_THEME_KEY = 'sd-phone:darkTheme';
const LIGHT_THEME_KEY = 'sd-phone:lightTheme';
const SHELL_KEY = 'sd-phone:shell';
function loadShellLocal(): string {
    try {
        const v = window.localStorage.getItem(SHELL_KEY);
        return isShellId(v) ? v : DEFAULT_SHELL;
    } catch { return DEFAULT_SHELL; }
}
function saveShellLocal(v: string) {
    try { window.localStorage.setItem(SHELL_KEY, v); } catch { /* ignore */ }
}
const ACCENT_KEY = 'sd-phone:accent';
function loadAccentLocal(): string {
    try {
        const v = window.localStorage.getItem(ACCENT_KEY);
        return isAccentChoice(v) ? v : DEFAULT_ACCENT;
    } catch { return DEFAULT_ACCENT; }
}
function saveAccentLocal(v: string) {
    try { window.localStorage.setItem(ACCENT_KEY, v); } catch { /* ignore */ }
}
const DARK_THEMES: DarkTheme[] = ['graphite', 'black', 'warm', 'midnight', 'moss', 'plum', 'slate', 'ocean', 'rose', 'clay'];
const LIGHT_THEMES: LightTheme[] = ['silver', 'snow', 'linen', 'sky', 'mint', 'blush', 'sand', 'lavender', 'stone', 'dusk'];
function loadLightThemeLocal(): LightTheme {
    try {
        const v = window.localStorage.getItem(LIGHT_THEME_KEY) as LightTheme | null;
        return v && LIGHT_THEMES.includes(v) ? v : 'silver';
    } catch { return 'silver'; }
}
function saveLightThemeLocal(v: LightTheme) {
    try { window.localStorage.setItem(LIGHT_THEME_KEY, v); } catch { /* ignore */ }
}
function loadDarkThemeLocal(): DarkTheme {
    try {
        const v = window.localStorage.getItem(DARK_THEME_KEY) as DarkTheme | null;
        return v && DARK_THEMES.includes(v) ? v : 'graphite';
    } catch { return 'graphite'; }
}
function saveDarkThemeLocal(v: DarkTheme) {
    try { window.localStorage.setItem(DARK_THEME_KEY, v); } catch { /* ignore */ }
}

interface Security { passcode: string | null; faceId: boolean }
const SECURITY_KEY = 'sd-phone:security';
function loadSecurityLocal(): Security {
    try {
        const raw = window.localStorage.getItem(SECURITY_KEY);
        if (raw) {
            const p = JSON.parse(raw) as Security;
            return { passcode: typeof p.passcode === 'string' ? p.passcode : null, faceId: !!p.faceId };
        }
    } catch { /* ignore */ }
    return { passcode: '1234', faceId: false };
}
function saveSecurityLocal(s: Security) {
    try { window.localStorage.setItem(SECURITY_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// hydrate() reads every persisted setting in one settings:get. On first join the phone NUI mounts
// before the framework finishes loading the character, so that call can't resolve the citizenid and
// comes back empty. Primary recovery is the client's sd-phone:client:characterLoaded push (App.tsx
// re-runs hydrate the moment the framework reports the player in - multichar picks can outlast any
// polling window). This bounded retry remains as the fallback for setups with no loaded event.
const HYDRATE_RETRY_MS = 1500;
const HYDRATE_MAX_RETRIES = 20;

export type WallpaperTarget = 'lock' | 'home' | 'both';

const WALLPAPER_KEY = 'sd-phone:wallpaper';
function loadWallpaperLocal(): string | null {
    try { return window.localStorage.getItem(WALLPAPER_KEY); } catch { return null; }
}
function saveWallpaperLocal(v: string) {
    try { window.localStorage.setItem(WALLPAPER_KEY, v); } catch { /* ignore */ }
}

// The home screen's own wallpaper; the legacy single key above doubles as the lock
// wallpaper so an existing dev profile keeps its wallpaper on both screens.
const WALLPAPER_HOME_KEY = 'sd-phone:wallpaperHome';
function loadWallpaperHomeLocal(): string | null {
    try { return window.localStorage.getItem(WALLPAPER_HOME_KEY); } catch { return null; }
}
function saveWallpaperHomeLocal(v: string) {
    try { window.localStorage.setItem(WALLPAPER_HOME_KEY, v); } catch { /* ignore */ }
}

const BLUR_LOCK_KEY = 'sd-phone:blurLock';
const BLUR_HOME_KEY = 'sd-phone:blurHome';
const ISLAND_PET_KEY = 'sd-phone:islandPet';
function loadIslandPetLocal(): IslandPetId {
    try { return (window.localStorage.getItem(ISLAND_PET_KEY) as IslandPetId | null) ?? 'none'; }
    catch { return 'none'; }
}
function saveIslandPetLocal(v: IslandPetId) {
    try { window.localStorage.setItem(ISLAND_PET_KEY, v); } catch { /* ignore */ }
}
function loadBlurLocal(key: string): boolean {
    try { return window.localStorage.getItem(key) === '1'; } catch { return false; }
}
function saveBlurLocal(key: string, v: boolean) {
    try { window.localStorage.setItem(key, v ? '1' : '0'); } catch { /* ignore */ }
}

const CUSTOM_WALLPAPERS_KEY = 'sd-phone:customWallpapers';
export const MAX_CUSTOM_WALLPAPERS = 24;
function loadCustomWallpapersLocal(): string[] {
    try {
        const parsed: unknown = JSON.parse(window.localStorage.getItem(CUSTOM_WALLPAPERS_KEY) ?? '[]');
        return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === 'string') : [];
    } catch { return []; }
}
function saveCustomWallpapersLocal(v: string[]) {
    try { window.localStorage.setItem(CUSTOM_WALLPAPERS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
}

const clampVol = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

const CHAT_SCALE_KEY = 'sd-phone:chatTextScale';
const clampChatScale = (n: number) => Math.min(1.5, Math.max(0.8, n));
function loadChatScaleLocal(): number {
    try {
        const n = parseFloat(window.localStorage.getItem(CHAT_SCALE_KEY) ?? '');
        return Number.isFinite(n) ? clampChatScale(n) : 1;
    } catch { return 1; }
}
function saveChatScaleLocal(v: number) {
    try { window.localStorage.setItem(CHAT_SCALE_KEY, String(v)); } catch { /* ignore */ }
}

const PHONE_SCALE_KEY = 'sd-phone:phoneScale';
// Shared by the phone frame scale and screen brightness; both are 0-100 sliders.
const clampPhoneScale = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
function loadPhoneScaleLocal(): number {
    try {
        const n = parseFloat(window.localStorage.getItem(PHONE_SCALE_KEY) ?? '');
        return Number.isFinite(n) ? clampPhoneScale(n) : 50;
    } catch { return 50; }
}
function savePhoneScaleLocal(v: number) {
    try { window.localStorage.setItem(PHONE_SCALE_KEY, String(v)); } catch { /* ignore */ }
}

export type PhoneAlign = DeviceAlign;

const PHONE_ALIGN_KEY = 'sd-phone:phoneAlign';
const PHONE_ALIGNS: PhoneAlign[] = [
    'top-left',    'top-center',    'top-right',
    'middle-left', 'middle-center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right',
];
function loadPhoneAlignLocal(): PhoneAlign {
    try {
        const v = window.localStorage.getItem(PHONE_ALIGN_KEY) as PhoneAlign | null;
        return v && PHONE_ALIGNS.includes(v) ? v : device.defaultAlign;
    } catch { return device.defaultAlign; }
}
function savePhoneAlignLocal(v: PhoneAlign) {
    try { window.localStorage.setItem(PHONE_ALIGN_KEY, v); } catch { /* ignore */ }
}

interface ThemeState {
    theme:             Theme;
    setTheme:          (t: Theme) => void;
    darkTheme:         DarkThemeChoice;
    setDarkTheme:      (t: DarkThemeChoice) => void;
    lightTheme:        LightThemeChoice;
    setLightTheme:     (t: LightThemeChoice) => void;
    accent:            string;
    setAccent:         (a: string) => void;
    shell:             string;
    setShell:          (s: string) => void;
    shellChoice:       boolean;
    shellsAllowed:     string[];
    customPalettes:      CustomPalette[];
    saveCustomPalette:   (p: CustomPalette) => Promise<string | null>;
    deleteCustomPalette: (id: CustomPaletteId) => void;
    wallpaperLock:     string;
    wallpaperHome:     string;
    setWallpaper:      (url: string, target: WallpaperTarget) => void;
    customWallpapers:      string[];
    addCustomWallpaper:    (url: string) => Promise<string | null>;
    removeCustomWallpaper: (url: string) => void;
    blurLock:          boolean;
    setBlurLock:       (v: boolean) => void;
    blurHome:          boolean;
    setBlurHome:       (v: boolean) => void;
    islandPet:         IslandPetId;
    setIslandPet:      (v: IslandPetId) => void;
    brightness:        number;
    setBrightness:     (v: number) => void;
    phoneScale:        number;
    setPhoneScale:     (v: number) => void;
    chatTextScale:     number;
    setChatTextScale:  (v: number) => void;
    phoneAlign:        PhoneAlign;
    setPhoneAlign:     (v: PhoneAlign) => void;
    ringtoneVol:       number;
    setRingtoneVol:    (v: number) => void;
    callVol:           number;
    setCallVol:        (v: number) => void;
    airplaneMode:      boolean;
    setAirplaneMode:   (on: boolean) => void;
    hour24:            boolean;
    setHour24:         (on: boolean) => void;
    reopenLastApp:     boolean;
    setReopenLastApp:  (on: boolean) => void;
    ringtone:            string;
    setRingtone:         (id: string) => void;
    notificationTone:    string;
    setNotificationTone: (id: string) => void;
    customRingtones:         CustomTone[];
    customNotificationTones: CustomTone[];
    addCustomTone:    (kind: ToneKind, name: string, url: string) => string;
    removeCustomTone: (kind: ToneKind, id: string) => void;
    statusLightOverride:    boolean | null;
    setStatusLightOverride: (v: boolean | null) => void;
    statusBarAutoLight: boolean | null;
    homeAutoLight:      boolean | null;
    setAutoContrast:    (top: boolean | null, bottom: boolean | null) => void;
    hideHomeIndicator:    boolean;
    setHideHomeIndicator: (v: boolean) => void;
    lockClock:    LockClock;
    setLockClock: (cfg: LockClock) => void;
    passcode:    string | null;
    setPasscode: (pin: string | null) => void;
    faceId:      boolean;
    setFaceId:   (on: boolean) => void;
    setSecurity: (pin: string | null, faceId: boolean) => void;
    /** Server-side first-run-setup flag for the acting profile; null until its hydrate lands. */
    setupDone: boolean | null;
    resetProfileVisuals: () => void;
    applyWallpaperProfile: (key: string | null) => void;
    hydrate: (attempt?: number) => void;
}

const initialSecurity = isFiveM ? { passcode: null, faceId: false } : loadSecurityLocal();

// In-game last-known-wallpaper cache, keyed per phone profile (unique phones) or bare (stock
// servers): painted in the same frame as the reveal so the first open never flashes the stock
// wallpaper while the settings hydrate is in flight. The hydrate stays authoritative.
const WALLPAPER_CACHE_BASE = 'sd-phone:wallpaperCache:v1';
let wallpaperProfileKey: string | null = null;
function wallpaperCacheKey(): string {
    return wallpaperProfileKey ? `${WALLPAPER_CACHE_BASE}:${wallpaperProfileKey}` : WALLPAPER_CACHE_BASE;
}
function cacheWallpapers(lock: string, home: string): void {
    try { window.localStorage.setItem(wallpaperCacheKey(), JSON.stringify({ lock, home })); } catch { /* ignore */ }
}
function readWallpaperCache(): { lock?: string; home?: string } | null {
    try {
        const raw = window.localStorage.getItem(wallpaperCacheKey());
        if (!raw) return null;
        // Pre-split caches stored a bare string that painted both screens.
        if (!raw.startsWith('{')) return { lock: raw, home: raw };
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as { lock?: string; home?: string } : null;
    } catch { return null; }
}

function persistSecurity(pin: string | null, face: boolean) {
    if (isFiveM) void fetchNui('sd-phone:settings:setSecurity', { passcode: pin, faceId: face }).catch(() => {});
    else saveSecurityLocal({ passcode: pin, faceId: face });
}

// Range sliders fire a persist per drag tick; store state must follow every tick, but one
// server write per gesture is enough. Trailing timer, keyed per setting so concurrent
// sliders never cancel each other's writes. The NUI document survives phone close/holster,
// so a pending timer still fires - only a resource restart inside the window can drop one.
const PERSIST_DEBOUNCE_MS = 300;
const persistTimers: Record<string, number> = {};
function persistDebounced(key: string, send: () => void) {
    window.clearTimeout(persistTimers[key]);
    persistTimers[key] = window.setTimeout(send, PERSIST_DEBOUNCE_MS);
}

export const useThemeStore = create<ThemeState>((set, get) => ({
    theme: isFiveM ? 'light' : loadThemeLocal(),
    darkTheme: isFiveM ? 'graphite' : loadDarkThemeLocal(),
    lightTheme: isFiveM ? 'silver' : loadLightThemeLocal(),
    accent: isFiveM ? DEFAULT_ACCENT : loadAccentLocal(),
    shell: isFiveM ? DEFAULT_SHELL : loadShellLocal(),
    shellChoice: true,
    shellsAllowed: SHELLS.map(s => s.id),
    customPalettes: isFiveM ? [] : loadPalettesLocal(),
    wallpaperLock: isFiveM ? lockscreenAsset : (loadWallpaperLocal() ?? devDefaultAsset),
    wallpaperHome: isFiveM ? lockscreenAsset : (loadWallpaperHomeLocal() ?? loadWallpaperLocal() ?? devDefaultAsset),
    customWallpapers: isFiveM ? [] : loadCustomWallpapersLocal(),
    blurLock: isFiveM ? false : loadBlurLocal(BLUR_LOCK_KEY),
    blurHome: isFiveM ? false : loadBlurLocal(BLUR_HOME_KEY),
    islandPet: isFiveM ? 'none' : loadIslandPetLocal(),
    brightness: 100,
    phoneScale: isFiveM ? 50 : loadPhoneScaleLocal(),
    chatTextScale: isFiveM ? 1 : loadChatScaleLocal(),
    phoneAlign: isFiveM && device.id === 'phone' ? device.defaultAlign : loadPhoneAlignLocal(),
    ringtoneVol: 40,
    callVol: 60,
    airplaneMode: false,
    hour24: false,
    reopenLastApp: false,
    ringtone: DEFAULT_RINGTONE,
    // The website demo opens on Chime, which carries better than the stock
    // tone through laptop speakers. In game the default is unchanged.
    notificationTone: isDemo ? 'chime' : DEFAULT_NOTIFICATION,
    customRingtones: [],
    customNotificationTones: [],
    statusLightOverride: null,
    statusBarAutoLight: null,
    homeAutoLight: null,
    hideHomeIndicator: false,
    lockClock: isFiveM ? DEFAULT_LOCK_CLOCK : loadLockClockLocal(),
    passcode: initialSecurity.passcode,
    faceId: initialSecurity.faceId,
    setupDone: null,

    setTheme: (next) => {
        if (isFiveM) void fetchNui('sd-phone:settings:setTheme', { theme: next }).catch(() => {});
        else saveThemeLocal(next);
        if (typeof document === 'undefined') { set({ theme: next }); return; }
        document.documentElement.classList.add('theme-transitioning');
        window.setTimeout(() => {
            set({ theme: next });
            window.setTimeout(() => {
                document.documentElement.classList.remove('theme-transitioning');
            }, 340);
        }, 0);
    },

    setWallpaper: (value, target) => {
        const lock = target !== 'home';
        const home = target !== 'lock';
        set(s => ({
            wallpaperLock: lock ? value : s.wallpaperLock,
            wallpaperHome: home ? value : s.wallpaperHome,
        }));
        const key = wallpaperKey(value);
        if (isFiveM) {
            cacheWallpapers(get().wallpaperLock, get().wallpaperHome);
            // Absent fields serialize away, so the server's COALESCE leaves that screen alone.
            void fetchNui('sd-phone:settings:setWallpaper', { lock: lock ? key : undefined, home: home ? key : undefined }).catch(() => {});
        } else {
            if (lock) saveWallpaperLocal(key);
            if (home) saveWallpaperHomeLocal(key);
        }
    },

    // Resolves to null on success, or an error message ('' = caller supplies a generic one).
    // A network failure rejects, which PromptDialog surfaces with its own localized message.
    addCustomWallpaper: async (url) => {
        const list = get().customWallpapers;
        if (list.includes(url)) return null;
        if (list.length >= MAX_CUSTOM_WALLPAPERS) return '';
        if (isFiveM) {
            const r = await fetchNui<{ success?: boolean; message?: string }>('sd-phone:settings:wallpapers:add', { url });
            if (!r?.success) return r?.message ?? '';
        } else {
            saveCustomWallpapersLocal([...list, url]);
        }
        set(s => ({ customWallpapers: [...s.customWallpapers, url] }));
        return null;
    },

    removeCustomWallpaper: (url) => {
        const next = get().customWallpapers.filter(u => u !== url);
        set({ customWallpapers: next });
        if (isFiveM) void fetchNui('sd-phone:settings:wallpapers:remove', { url }).catch(() => {});
        else saveCustomWallpapersLocal(next);
    },

    setDarkTheme: (next) => {
        set({ darkTheme: next });
        if (isFiveM) void fetchNui('sd-phone:settings:setDarkTheme', { darkTheme: next }).catch(() => {});
        else if (isCustomPaletteId(next)) savePaletteChoiceLocal(DARK_THEME_KEY, next);
        else saveDarkThemeLocal(next);
    },

    setLightTheme: (next) => {
        set({ lightTheme: next });
        if (isFiveM) void fetchNui('sd-phone:settings:setLightTheme', { lightTheme: next }).catch(() => {});
        else if (isCustomPaletteId(next)) savePaletteChoiceLocal(LIGHT_THEME_KEY, next);
        else saveLightThemeLocal(next);
    },

    setAccent: (next) => {
        if (!isAccentChoice(next)) return;
        set({ accent: next });
        if (isFiveM) void fetchNui('sd-phone:settings:setAccent', { accent: next }).catch(() => {});
        else saveAccentLocal(next);
    },

    setShell: (next) => {
        if (!isShellId(next)) return;
        set({ shell: next });
        if (isFiveM) void fetchNui('sd-phone:settings:setShell', { shell: next }).catch(() => {});
        else saveShellLocal(next);
    },

    saveCustomPalette: async (palette) => {
        const clean = sanitizePalette(palette);
        if (!clean) return '';
        const list = get().customPalettes;
        const at = list.findIndex(p => p.id === clean.id);
        if (at < 0 && list.length >= MAX_CUSTOM_PALETTES) {
            return t('settings.paletteFull', 'You can keep up to {n} of your own palettes.', { n: MAX_CUSTOM_PALETTES });
        }
        if (isFiveM) {
            const r = await fetchNui<{ success?: boolean; message?: string }>('sd-phone:settings:savePalette', { palette: clean });
            if (!r?.success) return r?.message ?? '';
        }
        const next = at < 0 ? [...list, clean] : list.map(p => (p.id === clean.id ? clean : p));
        set({ customPalettes: next });
        if (!isFiveM) savePalettesLocal(next);
        return null;
    },

    deleteCustomPalette: (id) => {
        const next = get().customPalettes.filter(p => p.id !== id);
        const patch: Partial<ThemeState> = { customPalettes: next };
        if (get().darkTheme === id) patch.darkTheme = 'graphite';
        if (get().lightTheme === id) patch.lightTheme = 'silver';
        set(patch);
        if (isFiveM) void fetchNui('sd-phone:settings:deletePalette', { id }).catch(() => {});
        else savePalettesLocal(next);
    },

    setBrightness: (v) => {
        set({ brightness: clampPhoneScale(v) });
        if (isFiveM) persistDebounced('brightness', () => { void fetchNui('sd-phone:settings:setBrightness', { brightness: get().brightness }).catch(() => {}); });
    },

    setBlurLock: (v) => {
        set({ blurLock: v });
        if (isFiveM) void fetchNui('sd-phone:settings:setBlur', { lock: v, home: get().blurHome }).catch(() => {});
        else saveBlurLocal(BLUR_LOCK_KEY, v);
    },
    setBlurHome: (v) => {
        set({ blurHome: v });
        if (isFiveM) void fetchNui('sd-phone:settings:setBlur', { lock: get().blurLock, home: v }).catch(() => {});
        else saveBlurLocal(BLUR_HOME_KEY, v);
    },
    setIslandPet: (v) => {
        set({ islandPet: v });
        if (isFiveM) void fetchNui('sd-phone:settings:setIslandPet', { pet: v }).catch(() => {});
        else saveIslandPetLocal(v);
    },

    // Where the device sits is the one setting that is NOT shared with the phone: the two have
    // different shapes and want different spots, and phone_settings holds a single value. A
    // companion device keeps its own position in its own NUI origin's storage instead.
    setPhoneAlign: (v) => {
        set({ phoneAlign: v });
        if (isFiveM && device.id === 'phone') void fetchNui('sd-phone:settings:setPhoneAlign', { align: v }).catch(() => {});
        else savePhoneAlignLocal(v);
    },

    setPhoneScale: (v) => {
        const next = clampPhoneScale(v);
        set({ phoneScale: next });
        if (isFiveM) persistDebounced('phoneScale', () => { void fetchNui('sd-phone:settings:setPhoneScale', { scale: get().phoneScale }).catch(() => {}); });
        else savePhoneScaleLocal(next);
    },

    setRingtoneVol: (v) => {
        set({ ringtoneVol: v });
        if (isFiveM) persistDebounced('volumes', () => { void fetchNui('sd-phone:settings:setVolumes', { ringtone: get().ringtoneVol, call: get().callVol }).catch(() => {}); });
    },
    setCallVol: (v) => {
        set({ callVol: v });
        if (isFiveM) {
            persistDebounced('volumes', () => { void fetchNui('sd-phone:settings:setVolumes', { ringtone: get().ringtoneVol, call: get().callVol }).catch(() => {}); });
            // Live in-call volume must track the drag in real time - never debounced. Only the
            // device that owns the call may set it; a companion would stomp the phone's call.
            if (device.calls) void fetchNui('sd-phone:call:setVolume', { volume: v }).catch(() => {});
        }
    },

    setChatTextScale: (v) => {
        const next = clampChatScale(v);
        set({ chatTextScale: next });
        if (isFiveM) persistDebounced('chatTextScale', () => { void fetchNui('sd-phone:settings:setChatTextScale', { scale: get().chatTextScale }).catch(() => {}); });
        else saveChatScaleLocal(next);
    },

    setAirplaneMode: (on) => {
        set({ airplaneMode: on });
        void fetchNui('sd-phone:settings:setAirplane', { on }).catch(() => {});
    },

    setHour24: (on) => {
        set({ hour24: on });
        void fetchNui('sd-phone:settings:setHour24', { on }).catch(() => {});
    },

    setReopenLastApp: (on) => {
        set({ reopenLastApp: on });
        void fetchNui('sd-phone:settings:setReopenApp', { on }).catch(() => {});
    },

    setRingtone: (id) => {
        set({ ringtone: id });
        void fetchNui('sd-phone:settings:setTones', { ringtone: id, notificationTone: get().notificationTone }).catch(() => {});
    },

    setNotificationTone: (id) => {
        set({ notificationTone: id });
        void fetchNui('sd-phone:settings:setTones', { ringtone: get().ringtone, notificationTone: id }).catch(() => {});
    },

    addCustomTone: (kind, name, url) => {
        const item: CustomTone = { id: (kind === 'ringtone' ? 'c-' : 'cn-') + Math.random().toString(36).slice(2, 10), name, url };
        if (kind === 'ringtone') set(s => ({ customRingtones: [...s.customRingtones, item] }));
        else                     set(s => ({ customNotificationTones: [...s.customNotificationTones, item] }));
        warmYouTube();
        void fetchNui('sd-phone:settings:tones:add', { kind, ...item }).catch(() => {});
        return item.id;
    },

    removeCustomTone: (kind, id) => {
        if (kind === 'ringtone') {
            set(s => ({ customRingtones: s.customRingtones.filter(c => c.id !== id) }));
            if (get().ringtone === id) get().setRingtone(DEFAULT_RINGTONE);
        } else {
            set(s => ({ customNotificationTones: s.customNotificationTones.filter(c => c.id !== id) }));
            if (get().notificationTone === id) get().setNotificationTone(DEFAULT_NOTIFICATION);
        }
        void fetchNui('sd-phone:settings:tones:remove', { kind, id }).catch(() => {});
    },

    setStatusLightOverride: (v) => set({ statusLightOverride: v }),
    setAutoContrast:        (top, bottom) => set({ statusBarAutoLight: top, homeAutoLight: bottom }),
    setHideHomeIndicator:   (v) => set({ hideHomeIndicator: v }),

    setLockClock: (cfg) => {
        set({ lockClock: cfg });
        if (isFiveM) void fetchNui('sd-phone:settings:setLockClock', cfg).catch(() => {});
        else saveLockClockLocal(cfg);
    },

    setPasscode: (pin) => {
        const face = pin === null ? false : get().faceId;
        set({ passcode: pin, faceId: pin === null ? false : get().faceId });
        persistSecurity(pin, face);
    },
    setFaceId: (on) => {
        const next = get().passcode === null ? false : on;
        set({ faceId: next });
        persistSecurity(get().passcode, next);
    },
    setSecurity: (pin, face) => {
        const finalFace = pin === null ? false : face;
        set({ passcode: pin, faceId: finalFace });
        persistSecurity(pin, finalFace);
    },

    resetProfileVisuals: () => {
        // Profile switch/restore: paint the stock look NOW, so the previous phone's wallpaper
        // and clock never show on this one while the async hydrate is still in flight. The
        // setup flag goes back to "unknown" so Hello waits for THIS profile's answer.
        const stock = isFiveM ? lockscreenAsset : (loadWallpaperLocal() ?? devDefaultAsset);
        set({
            wallpaperLock: stock,
            wallpaperHome: stock,
            blurLock: false,
            blurHome: false,
            islandPet: 'none',
            lockClock: DEFAULT_LOCK_CLOCK,
            setupDone: null,
        });
    },

    applyWallpaperProfile: (key) => {
        // Selects the acting profile's wallpaper cache and paints its last-known value NOW
        // (same render batch as the phone reveal). Dev already persists wallpaper locally.
        if (!isFiveM) return;
        wallpaperProfileKey = key;
        const cached = readWallpaperCache();
        if (cached && (cached.lock || cached.home)) {
            set(s => ({
                wallpaperLock: cached.lock ?? s.wallpaperLock,
                wallpaperHome: cached.home ?? cached.lock ?? s.wallpaperHome,
            }));
        }
    },

    hydrate: (attempt = 0) => {
        // In-game only: on first join the character may not be loaded yet, so settings:get returns
        // no data. Reschedule until it does (or we hit the cap). In dev there is no server, so no
        // retry - the store already seeded itself from localStorage.
        const retry = () => {
            if (isFiveM && attempt < HYDRATE_MAX_RETRIES) {
                window.setTimeout(() => get().hydrate(attempt + 1), HYDRATE_RETRY_MS);
            }
        };
        const keyAtRequest = wallpaperProfileKey;
        void fetchNui<{ data?: { ringtone?: string; notificationTone?: string; customRingtones?: CustomTone[]; customNotificationTones?: CustomTone[]; airplaneMode?: boolean; hour24?: boolean; reopenApp?: boolean; setupDone?: boolean; lockClock?: Partial<LockClock>; passcode?: string | null; faceId?: boolean; wallpaper?: string; wallpaperHome?: string; blurLock?: boolean; blurHome?: boolean; islandPet?: string; customWallpapers?: string[]; chatTextScale?: number; phoneScale?: number; brightness?: number; phoneAlign?: string; ringtoneVol?: number; callVol?: number; theme?: string; darkTheme?: string; lightTheme?: string; accent?: string; shell?: string; shellChoice?: boolean; shellsAllowed?: unknown[]; customPalettes?: unknown; iconTheme?: string; showAppNames?: boolean; customIconThemes?: unknown } }>('sd-phone:settings:get')
            .then(res => {
                if (!res?.data) { retry(); return; }
                const d = res.data;
                const patch: Partial<ThemeState> = {};
                // Always assigned: a profile that never saved one must PAINT the default, not
                // keep the previous phone's wallpaper (unique phones swap profiles live). A
                // profile without a distinct home wallpaper mirrors its lock one.
                const stockWall = isFiveM ? lockscreenAsset : (loadWallpaperLocal() ?? devDefaultAsset);
                const lockWall  = (typeof d.wallpaper === 'string' && d.wallpaper) ? wallpaperKey(d.wallpaper) : stockWall;
                const homeWall  = (typeof d.wallpaperHome === 'string' && d.wallpaperHome) ? wallpaperKey(d.wallpaperHome) : lockWall;
                patch.wallpaperLock = lockWall;
                patch.wallpaperHome = homeWall;
                patch.blurLock = d.blurLock === true;
                patch.blurHome = d.blurHome === true;
                if (typeof d.islandPet === 'string') patch.islandPet = d.islandPet as IslandPetId;
                if (Array.isArray(d.customWallpapers)) {
                    patch.customWallpapers = d.customWallpapers.filter((u): u is string => typeof u === 'string');
                }
                if (d.ringtone)         patch.ringtone = d.ringtone;
                if (d.notificationTone) patch.notificationTone = d.notificationTone;
                if (typeof d.airplaneMode === 'boolean') patch.airplaneMode = d.airplaneMode;
                if (typeof d.hour24 === 'boolean') patch.hour24 = d.hour24;
                if (typeof d.reopenApp === 'boolean') patch.reopenLastApp = d.reopenApp;
                // Always assigned (true/false, never left null) - the per-profile answer is
                // what lets the Hello gate decide, and a stale previous-profile value may not leak.
                patch.setupDone = d.setupDone === true;
                if (d.theme === 'light' || d.theme === 'dark') patch.theme = d.theme;
                if (typeof d.darkTheme === 'string' && (DARK_THEMES as string[]).includes(d.darkTheme)) patch.darkTheme = d.darkTheme as DarkTheme;
                if (typeof d.lightTheme === 'string' && (LIGHT_THEMES as string[]).includes(d.lightTheme)) patch.lightTheme = d.lightTheme as LightTheme;
                patch.customPalettes = decodePalettes(d.customPalettes);
                if (isCustomPaletteId(d.darkTheme)) patch.darkTheme = d.darkTheme as CustomPaletteId;
                if (isCustomPaletteId(d.lightTheme)) patch.lightTheme = d.lightTheme as CustomPaletteId;
                if (isAccentChoice(d.accent)) patch.accent = d.accent;
                if (isShellId(d.shell)) patch.shell = d.shell;
                if (typeof d.shellChoice === 'boolean') patch.shellChoice = d.shellChoice;
                if (Array.isArray(d.shellsAllowed)) patch.shellsAllowed = d.shellsAllowed.filter(isShellId);
                if (isShellId(d.shell)) patch.shell = d.shell;
                if (typeof d.chatTextScale === 'number') patch.chatTextScale = clampChatScale(d.chatTextScale);
                if (typeof d.phoneScale === 'number') patch.phoneScale = clampPhoneScale(d.phoneScale);
                if (typeof d.brightness === 'number') patch.brightness = clampPhoneScale(d.brightness);
                // Position is device-local (see setPhoneAlign): a companion must not adopt the
                // phone's corner out of the shared settings row.
                if (device.id === 'phone' && typeof d.phoneAlign === 'string' && (PHONE_ALIGNS as string[]).includes(d.phoneAlign)) patch.phoneAlign = d.phoneAlign as PhoneAlign;
                if (typeof d.ringtoneVol === 'number') patch.ringtoneVol = clampVol(d.ringtoneVol);
                if (typeof d.callVol === 'number') patch.callVol = clampVol(d.callVol);
                patch.lockClock = (d.lockClock && typeof d.lockClock === 'object')
                    ? { ...DEFAULT_LOCK_CLOCK, ...d.lockClock }
                    : DEFAULT_LOCK_CLOCK;
                const pin = typeof d.passcode === 'string' && d.passcode ? d.passcode : null;
                patch.passcode = pin;
                patch.faceId   = pin !== null && !!d.faceId;
                const ring  = Array.isArray(d.customRingtones)         ? d.customRingtones         : [];
                const notif = Array.isArray(d.customNotificationTones) ? d.customNotificationTones : [];
                patch.customRingtones         = ring;
                patch.customNotificationTones = notif;
                set(patch);
                useIconThemeStore.getState().hydrate(d);
                // Freshest server answer becomes the profile's cached wallpapers - unless the
                // acting profile changed while this request was in flight.
                if (isFiveM && keyAtRequest === wallpaperProfileKey) {
                    cacheWallpapers(lockWall, homeWall);
                }
                // Same rule on hydrate: a companion opening would push its volume onto the call.
                if (isFiveM && device.calls) void fetchNui('sd-phone:call:setVolume', { volume: get().callVol }).catch(() => {});
                const ringIsYt  = !!d.ringtone         && ring.some(c => c.id === d.ringtone);
                const notifIsYt = !!d.notificationTone && notif.some(c => c.id === d.notificationTone);
                if (ringIsYt || notifIsYt) warmYouTube();
            })
            .catch(retry);
    },
}));

export function useTheme(): ThemeState;
export function useTheme<K extends keyof ThemeState>(...keys: K[]): Pick<ThemeState, K>;
// Pick-style subscription: consumers name the fields they render, and only
// changes to THOSE fields re-render them (shallow compare on the picked
// object; store actions are stable references so naming them is free). The
// zero-arg form subscribes to the whole store — avoid it in components.
export function useTheme(...keys: (keyof ThemeState)[]): unknown {
    return useThemeStore(
        useShallow((s: ThemeState) => {
            if (keys.length === 0) return s;
            const out: Record<string, unknown> = {};
            for (const k of keys) out[k] = s[k];
            return out;
        }),
    );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const chatTextScale = useThemeStore(s => s.chatTextScale);
    useEffect(() => { useThemeStore.getState().hydrate(); }, []);
    useEffect(() => {
        document.documentElement.style.setProperty('--chat-text-scale', String(chatTextScale));
    }, [chatTextScale]);
    return <>{children}</>;
}
