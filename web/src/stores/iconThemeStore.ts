import { create } from 'zustand';

import { fetchNui, isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { customAccent } from '@/stores/customAppsStore';

export type IconThemeId = 'default' | 'mono' | 'pastel' | 'tinted';

type IconArt = 'native' | 'glyph';

interface ColorRecipe {
    from:    'accent' | 'fixed';
    color?:  string;
    toward?: string;
    amount?: number;
}

export interface IconThemeDef {
    id:         IconThemeId;
    art:        IconArt;
    background: ColorRecipe;
    glyph:      ColorRecipe;
    label:      () => string;
    hint:       () => string;
}

export const ICON_THEMES: IconThemeDef[] = [
    {
        id:         'default',
        art:        'native',
        background: { from: 'accent' },
        glyph:      { from: 'fixed', color: '#ffffff' },
        label:      () => t('settings.iconThemeDefault', 'Default'),
        hint:       () => t('settings.iconThemeDefaultHint', 'Original app artwork'),
    },
    {
        id:         'mono',
        art:        'glyph',
        background: { from: 'fixed', color: '#26262a' },
        glyph:      { from: 'fixed', color: '#f5f5f7' },
        label:      () => t('settings.iconThemeMono', 'Monochrome'),
        hint:       () => t('settings.iconThemeMonoHint', 'One graphite tile for every app'),
    },
    {
        id:         'pastel',
        art:        'glyph',
        background: { from: 'accent', toward: '#ffffff', amount: 0.66 },
        glyph:      { from: 'accent', toward: '#1b1b1f', amount: 0.55 },
        label:      () => t('settings.iconThemePastel', 'Pastel'),
        hint:       () => t('settings.iconThemePastelHint', 'Softened, pale app colours'),
    },
    {
        id:         'tinted',
        art:        'glyph',
        background: { from: 'accent', toward: '#0c0c0f', amount: 0.78 },
        glyph:      { from: 'accent', toward: '#ffffff', amount: 0.45 },
        label:      () => t('settings.iconThemeTinted', 'Tinted'),
        hint:       () => t('settings.iconThemeTintedHint', 'Dark tiles with a colour wash'),
    },
];

const BY_ID = Object.fromEntries(ICON_THEMES.map(d => [d.id, d])) as Record<IconThemeId, IconThemeDef>;

function clampByte(n: number): number {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = ((((h % 360) + 360) % 360) / 60);
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const seg: [number, number, number] =
        hp < 1 ? [c, x, 0]
        : hp < 2 ? [x, c, 0]
        : hp < 3 ? [0, c, x]
        : hp < 4 ? [0, x, c]
        : hp < 5 ? [x, 0, c]
        : [c, 0, x];
    const m = l - c / 2;
    return [(seg[0] + m) * 255, (seg[1] + m) * 255, (seg[2] + m) * 255];
}

function toRgb(value: string): [number, number, number] | null {
    const v = value.trim().toLowerCase();
    if (v.startsWith('#')) {
        const hex = v.slice(1);
        if (hex.length === 3 || hex.length === 4) {
            const p = [0, 1, 2].map(i => parseInt(hex[i] + hex[i], 16));
            return p.some(Number.isNaN) ? null : [p[0], p[1], p[2]];
        }
        if (hex.length === 6 || hex.length === 8) {
            const p = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
            return p.some(Number.isNaN) ? null : [p[0], p[1], p[2]];
        }
        return null;
    }
    const nums = v.match(/-?\d*\.?\d+/g);
    if (!nums || nums.length < 3) return null;
    if (v.startsWith('rgb')) return [Number(nums[0]), Number(nums[1]), Number(nums[2])];
    if (v.startsWith('hsl')) return hslToRgb(Number(nums[0]), Number(nums[1]) / 100, Number(nums[2]) / 100);
    return null;
}

function mixColor(from: string, toward: string, amount: number): string {
    const a = toRgb(from);
    const b = toRgb(toward);
    if (!a || !b) return from;
    const k = Math.max(0, Math.min(1, amount));
    const c = [0, 1, 2].map(i => clampByte(a[i] + (b[i] - a[i]) * k));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function resolveColor(recipe: ColorRecipe, accent: string): string {
    const base = recipe.from === 'accent' ? accent : (recipe.color ?? accent);
    if (!recipe.toward || recipe.amount === undefined) return base;
    return mixColor(base, recipe.toward, recipe.amount);
}

interface IconAppearance {
    background: string;
    glyph:      string;
    art:        IconArt;
}

export function resolveIconAppearance(theme: IconThemeId, appId: string, accent: string): IconAppearance {
    const def = BY_ID[theme] ?? BY_ID.default;
    const base = toRgb(accent) ? accent : customAccent(appId);
    return {
        art:        def.art,
        background: resolveColor(def.background, base),
        glyph:      resolveColor(def.glyph, base),
    };
}

const ICON_THEME_KEY = 'sd-phone:iconTheme';
const APP_NAMES_KEY  = 'sd-phone:showAppNames';

function loadIconThemeLocal(): IconThemeId {
    try {
        const v = window.localStorage.getItem(ICON_THEME_KEY);
        return v && v in BY_ID ? v as IconThemeId : 'default';
    } catch { return 'default'; }
}
function saveIconThemeLocal(v: IconThemeId) {
    try { window.localStorage.setItem(ICON_THEME_KEY, v); } catch {}
}

function loadShowAppNamesLocal(): boolean {
    try { return window.localStorage.getItem(APP_NAMES_KEY) !== '0'; } catch { return true; }
}
function saveShowAppNamesLocal(v: boolean) {
    try { window.localStorage.setItem(APP_NAMES_KEY, v ? '1' : '0'); } catch {}
}

interface IconThemeState {
    iconTheme:       IconThemeId;
    setIconTheme:    (id: IconThemeId) => void;
    showAppNames:    boolean;
    setShowAppNames: (v: boolean) => void;
    hydrate:         (data: { iconTheme?: unknown; showAppNames?: unknown }) => void;
}

export const useIconThemeStore = create<IconThemeState>(set => ({
    iconTheme:    isFiveM ? 'default' : loadIconThemeLocal(),
    showAppNames: isFiveM ? true : loadShowAppNamesLocal(),

    setIconTheme: (id) => {
        set({ iconTheme: id });
        if (isFiveM) void fetchNui('sd-phone:settings:setIconTheme', { iconTheme: id }).catch(() => {});
        else saveIconThemeLocal(id);
    },

    setShowAppNames: (v) => {
        set({ showAppNames: v });
        if (isFiveM) void fetchNui('sd-phone:settings:setShowAppNames', { on: v }).catch(() => {});
        else saveShowAppNamesLocal(v);
    },

    hydrate: (data) => {
        const stored = data.iconTheme;
        set({
            iconTheme:    typeof stored === 'string' && stored in BY_ID ? stored as IconThemeId : 'default',
            showAppNames: typeof data.showAppNames === 'boolean' ? data.showAppNames : true,
        });
    },
}));

export function useIconTheme(): IconThemeId {
    return useIconThemeStore(s => s.iconTheme);
}

export function useShowAppNames(): boolean {
    return useIconThemeStore(s => s.showAppNames);
}

export function useIconAppearance(appId: string, accent: string): IconAppearance {
    return resolveIconAppearance(useIconTheme(), appId, accent);
}
