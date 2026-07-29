import { create } from 'zustand';

import { fetchNui, isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { customAccent } from '@/stores/customAppsStore';

export type BuiltinIconThemeId =
    | 'default' | 'glass' | 'flat' | 'light' | 'pastel' | 'sand'
    | 'slate' | 'tinted' | 'noir' | 'mono' | 'contrast';

export type CustomIconThemeId = `custom:${string}`;

export type IconThemeId = BuiltinIconThemeId | CustomIconThemeId;

type IconArt = 'native' | 'glyph';

export interface ColorRecipe {
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
    depth?:       boolean;
    minContrast?: number;
    label:        () => string;
    hint:         () => string;
}

export interface CustomIconTheme {
    id:         CustomIconThemeId;
    name:       string;
    background: ColorRecipe;
    glyph:      ColorRecipe;
    depth?:     boolean;
}

const WHITE_ON_COLOUR = 1.55;
const CUSTOM_CONTRAST = WHITE_ON_COLOUR;

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
        id:          'glass',
        art:         'glyph',
        background:  { from: 'accent' },
        glyph:       { from: 'fixed', color: '#ffffff' },
        depth:       true,
        minContrast: WHITE_ON_COLOUR,
        label:      () => t('settings.iconThemeGlass', 'Glass'),
        hint:       () => t('settings.iconThemeGlassHint', 'Lit, glossy tiles in each app colour'),
    },
    {
        id:          'flat',
        art:         'glyph',
        background:  { from: 'accent' },
        glyph:       { from: 'fixed', color: '#ffffff' },
        minContrast: WHITE_ON_COLOUR,
        label:      () => t('settings.iconThemeFlat', 'Flat'),
        hint:       () => t('settings.iconThemeFlatHint', 'Matching glyphs on full app colour'),
    },
    {
        id:         'light',
        art:        'glyph',
        background: { from: 'fixed', color: '#f4f4f6' },
        glyph:      { from: 'accent', toward: '#1b1b1f', amount: 0.32 },
        label:      () => t('settings.iconThemeLight', 'Light'),
        hint:       () => t('settings.iconThemeLightHint', 'Off-white tiles, app-coloured glyphs'),
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
        id:         'sand',
        art:        'glyph',
        background: { from: 'accent', toward: '#e8dcc4', amount: 0.80 },
        glyph:      { from: 'accent', toward: '#4a3a24', amount: 0.62 },
        label:      () => t('settings.iconThemeSand', 'Sand'),
        hint:       () => t('settings.iconThemeSandHint', 'Warm cream tiles with earthy glyphs'),
    },
    {
        id:         'slate',
        art:        'glyph',
        background: { from: 'accent', toward: '#39414f', amount: 0.86 },
        glyph:      { from: 'accent', toward: '#ffffff', amount: 0.72 },
        label:      () => t('settings.iconThemeSlate', 'Slate'),
        hint:       () => t('settings.iconThemeSlateHint', 'Cool grey tiles, barely tinted'),
    },
    {
        id:         'tinted',
        art:        'glyph',
        background: { from: 'accent', toward: '#0c0c0f', amount: 0.78 },
        glyph:      { from: 'accent', toward: '#ffffff', amount: 0.45 },
        label:      () => t('settings.iconThemeTinted', 'Tinted'),
        hint:       () => t('settings.iconThemeTintedHint', 'Dark tiles with a colour wash'),
    },
    {
        id:         'noir',
        art:        'glyph',
        background: { from: 'fixed', color: '#0a0a0c' },
        glyph:      { from: 'accent', toward: '#ffffff', amount: 0.22 },
        label:      () => t('settings.iconThemeNoir', 'Noir'),
        hint:       () => t('settings.iconThemeNoirHint', 'Black tiles that let the colour glow'),
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
        id:         'contrast',
        art:        'glyph',
        background: { from: 'fixed', color: '#000000' },
        glyph:      { from: 'fixed', color: '#ffffff' },
        label:      () => t('settings.iconThemeContrast', 'High Contrast'),
        hint:       () => t('settings.iconThemeContrastHint', 'Pure black and white for legibility'),
    },
];

const BY_ID = new Map<string, IconThemeDef>(ICON_THEMES.map(d => [d.id, d]));
const DEFAULT_DEF = BY_ID.get('default') as IconThemeDef;

export const MAX_CUSTOM_ICON_THEMES = 12;

const CUSTOM_ID = /^custom:[a-z0-9]{4,8}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

const CUSTOM_BY_ID = new Map<string, IconThemeDef>();

export function newCustomIconThemeId(): CustomIconThemeId {
    let slug = '';
    for (let i = 0; i < 6; i++) slug += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    return `custom:${slug}`;
}

function sanitizeRecipe(value: unknown): ColorRecipe | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    if (raw.from !== 'accent' && raw.from !== 'fixed') return null;
    const clean: ColorRecipe = { from: raw.from };
    if (raw.color !== undefined) {
        if (typeof raw.color !== 'string' || !HEX.test(raw.color)) return null;
        clean.color = raw.color.toLowerCase();
    } else if (raw.from === 'fixed') {
        return null;
    }
    const hasToward = raw.toward !== undefined;
    const hasAmount = raw.amount !== undefined;
    if (hasToward !== hasAmount) return null;
    if (hasToward) {
        if (typeof raw.toward !== 'string' || !HEX.test(raw.toward)) return null;
        if (typeof raw.amount !== 'number' || !Number.isFinite(raw.amount)) return null;
        if (raw.amount < 0 || raw.amount > 1) return null;
        clean.toward = raw.toward.toLowerCase();
        clean.amount = raw.amount;
    }
    return clean;
}

export function sanitizeCustomIconTheme(value: unknown): CustomIconTheme | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.id !== 'string' || !CUSTOM_ID.test(raw.id)) return null;
    if (typeof raw.name !== 'string') return null;
    const name = raw.name.trim();
    if (name.length < 1 || name.length > 24) return null;
    if (raw.depth !== undefined && typeof raw.depth !== 'boolean') return null;
    const background = sanitizeRecipe(raw.background);
    const glyph      = sanitizeRecipe(raw.glyph);
    if (!background || !glyph) return null;
    const clean: CustomIconTheme = { id: raw.id as CustomIconThemeId, name, background, glyph };
    if (raw.depth === true) clean.depth = true;
    return clean;
}

function sanitizeCustomList(value: unknown): CustomIconTheme[] {
    if (!Array.isArray(value)) return [];
    const out: CustomIconTheme[] = [];
    for (const entry of value) {
        if (out.length >= MAX_CUSTOM_ICON_THEMES) break;
        const clean = sanitizeCustomIconTheme(entry);
        if (clean && !out.some(x => x.id === clean.id)) out.push(clean);
    }
    return out;
}

function customDef(theme: CustomIconTheme): IconThemeDef {
    return {
        id:          theme.id,
        art:         'glyph',
        background:  theme.background,
        glyph:       theme.glyph,
        depth:       theme.depth === true,
        minContrast: CUSTOM_CONTRAST,
        label:       () => theme.name,
        hint:        () => t('settings.iconThemeCustomHint', 'Your own tile and symbol colours'),
    };
}

function syncCustomRegistry(list: CustomIconTheme[]) {
    CUSTOM_BY_ID.clear();
    for (const theme of list) CUSTOM_BY_ID.set(theme.id, customDef(theme));
}

function knownThemeId(value: unknown): IconThemeId | null {
    if (typeof value !== 'string') return null;
    if (BY_ID.has(value)) return value as BuiltinIconThemeId;
    return CUSTOM_ID.test(value) ? value as CustomIconThemeId : null;
}

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

const MIN_CONTRAST = 3;

function luminance(rgb: [number, number, number]): number {
    const [r, g, b] = rgb.map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
    const x = toRgb(a);
    const y = toRgb(b);
    if (!x || !y) return MIN_CONTRAST;
    const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
    return (hi + 0.05) / (lo + 0.05);
}

function legible(glyph: string, tile: string[], floor: number): string {
    const clears = (c: string) => tile.every(shade => contrast(c, shade) >= floor);
    if (clears(glyph)) return glyph;
    const bg = toRgb(tile[0]);
    const target = bg && luminance(bg) > 0.4 ? '#000000' : '#ffffff';
    for (let step = 1; step <= 10; step++) {
        const lifted = mixColor(glyph, target, step / 10);
        if (clears(lifted)) return lifted;
    }
    return target;
}

interface IconAppearance {
    background: string;
    glyph:      string;
    art:        IconArt;
}

function litTile(solid: string): { css: string; shade: string } {
    const top   = mixColor(solid, '#ffffff', 0.34);
    const mid   = mixColor(solid, '#ffffff', 0);
    const shade = mixColor(solid, '#000000', 0.34);
    const css = [
        'radial-gradient(115% 78% at 30% -14%, rgba(255,255,255,0.46) 0%, rgba(255,255,255,0.06) 54%, rgba(255,255,255,0) 72%)',
        'radial-gradient(130% 62% at 50% 116%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 62%)',
        `linear-gradient(166deg, ${top} 0%, ${mid} 46%, ${shade} 100%)`,
    ].join(', ');
    return { css, shade };
}

function appearanceOf(def: IconThemeDef, appId: string, accent: string): IconAppearance {
    const base = toRgb(accent) ? accent : customAccent(appId);
    const solid = resolveColor(def.background, base);
    const glyph = resolveColor(def.glyph, base);
    const lit = def.depth ? litTile(solid) : null;
    return {
        art:        def.art,
        background: lit ? lit.css : solid,
        glyph:      def.art === 'native'
            ? glyph
            : legible(glyph, lit ? [solid, lit.shade] : [solid], def.minContrast ?? MIN_CONTRAST),
    };
}

export function resolveIconAppearance(theme: IconThemeId, appId: string, accent: string): IconAppearance {
    return appearanceOf(BY_ID.get(theme) ?? CUSTOM_BY_ID.get(theme) ?? DEFAULT_DEF, appId, accent);
}

export function resolveDraftAppearance(
    draft: { background: ColorRecipe; glyph: ColorRecipe; depth?: boolean },
    appId: string,
    accent: string,
): IconAppearance {
    return appearanceOf(customDef({ id: 'custom:draft', name: '', ...draft }), appId, accent);
}

const ICON_THEME_KEY = 'sd-phone:iconTheme';
const APP_NAMES_KEY  = 'sd-phone:showAppNames';
const CUSTOM_KEY     = 'sd-phone:iconCustom';

function loadIconThemeLocal(): IconThemeId {
    try {
        return knownThemeId(window.localStorage.getItem(ICON_THEME_KEY)) ?? 'default';
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

function loadCustomLocal(): CustomIconTheme[] {
    try {
        return sanitizeCustomList(JSON.parse(window.localStorage.getItem(CUSTOM_KEY) ?? '[]'));
    } catch { return []; }
}
function saveCustomLocal(v: CustomIconTheme[]) {
    try { window.localStorage.setItem(CUSTOM_KEY, JSON.stringify(v)); } catch {}
}

interface IconThemeState {
    iconTheme:       IconThemeId;
    setIconTheme:    (id: IconThemeId) => void;
    showAppNames:    boolean;
    setShowAppNames: (v: boolean) => void;
    customIconThemes:      CustomIconTheme[];
    saveCustomIconTheme:   (theme: CustomIconTheme) => Promise<string | null>;
    deleteCustomIconTheme: (id: CustomIconThemeId) => void;
    hydrate:         (data: { iconTheme?: unknown; showAppNames?: unknown; customIconThemes?: unknown }) => void;
}

const initialCustom = isFiveM ? [] : loadCustomLocal();
syncCustomRegistry(initialCustom);

export const useIconThemeStore = create<IconThemeState>((set, get) => ({
    iconTheme:        isFiveM ? 'default' : loadIconThemeLocal(),
    showAppNames:     isFiveM ? true : loadShowAppNamesLocal(),
    customIconThemes: initialCustom,

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

    saveCustomIconTheme: async (theme) => {
        const clean = sanitizeCustomIconTheme(theme);
        if (!clean) return t('settings.iconThemeSaveFailed', 'Could not save that icon theme.');
        const list = get().customIconThemes;
        const known = list.some(x => x.id === clean.id);
        if (!known && list.length >= MAX_CUSTOM_ICON_THEMES) {
            return t('settings.iconThemeFull', 'You can keep up to {n} of your own themes.', { n: MAX_CUSTOM_ICON_THEMES });
        }
        if (isFiveM) {
            const res = await fetchNui<{ success?: boolean; message?: string }>('sd-phone:settings:saveCustomIconTheme', { theme: clean });
            if (!res?.success) return res?.message ?? t('settings.iconThemeSaveFailed', 'Could not save that icon theme.');
        }
        const next = known ? list.map(x => x.id === clean.id ? clean : x) : [...list, clean];
        set({ customIconThemes: next });
        syncCustomRegistry(next);
        if (!isFiveM) saveCustomLocal(next);
        return null;
    },

    deleteCustomIconTheme: (id) => {
        const next = get().customIconThemes.filter(x => x.id !== id);
        set({ customIconThemes: next });
        syncCustomRegistry(next);
        if (isFiveM) void fetchNui('sd-phone:settings:deleteCustomIconTheme', { id }).catch(() => {});
        else saveCustomLocal(next);
        if (get().iconTheme === id) get().setIconTheme('default');
    },

    hydrate: (data) => {
        const custom = sanitizeCustomList(data.customIconThemes);
        syncCustomRegistry(custom);
        set({
            iconTheme:        knownThemeId(data.iconTheme) ?? 'default',
            showAppNames:     typeof data.showAppNames === 'boolean' ? data.showAppNames : true,
            customIconThemes: custom,
        });
    },
}));

export function useIconTheme(): IconThemeId {
    return useIconThemeStore(s => s.iconTheme);
}

export function useShowAppNames(): boolean {
    return useIconThemeStore(s => s.showAppNames);
}

export function useCustomIconThemes(): CustomIconTheme[] {
    return useIconThemeStore(s => s.customIconThemes);
}

export function useIconAppearance(appId: string, accent: string): IconAppearance {
    return resolveIconAppearance(useIconTheme(), appId, accent);
}
