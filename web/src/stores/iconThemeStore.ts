import { create } from 'zustand';

import { fetchNui, isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { customAccent } from '@/stores/customAppsStore';
import { useThemeStore } from '@/stores/themeStore';

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

export type IconTexture = 'none' | 'noise' | 'dots' | 'stripes';

export interface IconThemeBorder {
    color: ColorRecipe;
    width: number;
}

export interface IconThemeLabel {
    color?:  ColorRecipe;
    weight?: number;
    show?:   boolean;
}

export interface IconThemeOverride {
    background?: ColorRecipe;
    glyph?:      ColorRecipe;
    icon?:       string;
}

export interface IconThemeTraits {
    radius?:      number;
    background2?: ColorRecipe;
    angle?:       number;
    gloss?:       number;
    texture?:     IconTexture;
    glyphScale?:  number;
    glyphWeight?: number;
    hue?:         number;
    saturation?:  number;
    border?:      IconThemeBorder;
    bevel?:       boolean;
    glow?:        number;
    label?:       IconThemeLabel;
    overrides?:   Record<string, IconThemeOverride>;
    wallpaper?:   string;
}

export interface IconThemeVariant extends IconThemeTraits {
    background?: ColorRecipe;
    glyph?:      ColorRecipe;
    depth?:      boolean;
}

export interface IconThemeDef extends Omit<IconThemeTraits, 'label'> {
    id:         IconThemeId;
    art:        IconArt;
    background: ColorRecipe;
    glyph:      ColorRecipe;
    depth?:       boolean;
    minContrast?: number;
    dark?:        IconThemeVariant;
    label:        () => string;
    hint:         () => string;
}

export interface CustomIconTheme extends IconThemeVariant {
    id:         CustomIconThemeId;
    name:       string;
    background: ColorRecipe;
    glyph:      ColorRecipe;
    dark?:      IconThemeVariant;
}

export type IconThemeDraft = Omit<CustomIconTheme, 'id' | 'name'>;

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

export const MAX_CUSTOM_ICON_THEMES = 12;
export const MAX_ICON_OVERRIDES = 40;

const CUSTOM_ID = /^custom:[a-z0-9]{4,8}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const APP_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const WALLPAPER_KEY = /^[A-Za-z0-9._:/-]{1,255}$/;
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

const TEXTURES: readonly IconTexture[] = ['none', 'noise', 'dots', 'stripes'];

const DEFAULT_RADIUS       = 0.276;
const DEFAULT_ANGLE        = 166;
const DEFAULT_GLYPH_SIZE   = 40;
const DEFAULT_GLYPH_WEIGHT = 1.9;

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

function bounded(value: unknown, lo: number, hi: number): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    if (value < lo || value > hi) return null;
    return value;
}

function sanitizeThemeWallpaper(value: unknown): string | null {
    if (typeof value !== 'string' || value === '') return null;
    if (/^https?:\/\//.test(value)) {
        if (value.length > 512) return null;
        if (/[\s\u0000-\u001f]/.test(value)) return null;
        return /^https?:\/\/./.test(value) ? value : null;
    }
    return WALLPAPER_KEY.test(value) ? value : null;
}

function sanitizeOverrides(value: unknown): Record<string, IconThemeOverride> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const keys = Object.keys(raw);
    if (keys.length > MAX_ICON_OVERRIDES) return null;
    const out: Record<string, IconThemeOverride> = {};
    for (const key of keys) {
        if (!APP_ID.test(key)) return null;
        const entry = raw[key];
        if (!entry || typeof entry !== 'object') return null;
        const fields = entry as Record<string, unknown>;
        const clean: IconThemeOverride = {};
        if (fields.background !== undefined) {
            const recipe = sanitizeRecipe(fields.background);
            if (!recipe) return null;
            clean.background = recipe;
        }
        if (fields.glyph !== undefined) {
            const recipe = sanitizeRecipe(fields.glyph);
            if (!recipe) return null;
            clean.glyph = recipe;
        }
        if (fields.icon !== undefined) {
            if (typeof fields.icon !== 'string' || !APP_ID.test(fields.icon)) return null;
            clean.icon = fields.icon;
        }
        if (Object.keys(clean).length === 0) return null;
        out[key] = clean;
    }
    return out;
}

function sanitizeLabel(value: unknown): IconThemeLabel | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const clean: IconThemeLabel = {};
    if (raw.color !== undefined) {
        const recipe = sanitizeRecipe(raw.color);
        if (!recipe) return null;
        clean.color = recipe;
    }
    if (raw.weight !== undefined) {
        const weight = bounded(raw.weight, 100, 900);
        if (weight === null) return null;
        clean.weight = weight;
    }
    if (raw.show !== undefined) {
        if (typeof raw.show !== 'boolean') return null;
        clean.show = raw.show;
    }
    return clean;
}

function sanitizeBorder(value: unknown): IconThemeBorder | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    const color = sanitizeRecipe(raw.color);
    const width = bounded(raw.width, 0, 4);
    if (!color || width === null) return null;
    return { color, width };
}

function applyTraits(raw: Record<string, unknown>, clean: IconThemeVariant): boolean {
    if (raw.radius !== undefined) {
        const value = bounded(raw.radius, 0, 0.5);
        if (value === null) return false;
        clean.radius = value;
    }
    if (raw.background2 !== undefined) {
        const recipe = sanitizeRecipe(raw.background2);
        if (!recipe) return false;
        clean.background2 = recipe;
    }
    if (raw.angle !== undefined) {
        const value = bounded(raw.angle, 0, 360);
        if (value === null) return false;
        clean.angle = value;
    }
    if (raw.gloss !== undefined) {
        const value = bounded(raw.gloss, 0, 1);
        if (value === null) return false;
        clean.gloss = value;
    }
    if (raw.texture !== undefined) {
        if (typeof raw.texture !== 'string' || !TEXTURES.includes(raw.texture as IconTexture)) return false;
        clean.texture = raw.texture as IconTexture;
    }
    if (raw.glyphScale !== undefined) {
        const value = bounded(raw.glyphScale, 0.6, 1.4);
        if (value === null) return false;
        clean.glyphScale = value;
    }
    if (raw.glyphWeight !== undefined) {
        const value = bounded(raw.glyphWeight, 1, 3);
        if (value === null) return false;
        clean.glyphWeight = value;
    }
    if (raw.hue !== undefined) {
        const value = bounded(raw.hue, -180, 180);
        if (value === null) return false;
        clean.hue = value;
    }
    if (raw.saturation !== undefined) {
        const value = bounded(raw.saturation, 0, 2);
        if (value === null) return false;
        clean.saturation = value;
    }
    if (raw.border !== undefined) {
        const border = sanitizeBorder(raw.border);
        if (!border) return false;
        clean.border = border;
    }
    if (raw.bevel !== undefined) {
        if (typeof raw.bevel !== 'boolean') return false;
        if (raw.bevel) clean.bevel = true;
    }
    if (raw.glow !== undefined) {
        const value = bounded(raw.glow, 0, 1);
        if (value === null) return false;
        clean.glow = value;
    }
    if (raw.label !== undefined) {
        const label = sanitizeLabel(raw.label);
        if (!label) return false;
        if (Object.keys(label).length > 0) clean.label = label;
    }
    if (raw.overrides !== undefined) {
        const overrides = sanitizeOverrides(raw.overrides);
        if (!overrides) return false;
        if (Object.keys(overrides).length > 0) clean.overrides = overrides;
    }
    if (raw.wallpaper !== undefined) {
        const wallpaper = sanitizeThemeWallpaper(raw.wallpaper);
        if (!wallpaper) return false;
        clean.wallpaper = wallpaper;
    }
    return true;
}

function sanitizeVariant(value: unknown): IconThemeVariant | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const raw = value as Record<string, unknown>;
    if (raw.dark !== undefined) return null;
    const clean: IconThemeVariant = {};
    if (raw.background !== undefined) {
        const recipe = sanitizeRecipe(raw.background);
        if (!recipe) return null;
        clean.background = recipe;
    }
    if (raw.glyph !== undefined) {
        const recipe = sanitizeRecipe(raw.glyph);
        if (!recipe) return null;
        clean.glyph = recipe;
    }
    if (raw.depth !== undefined) {
        if (typeof raw.depth !== 'boolean') return null;
        if (raw.depth) clean.depth = true;
    }
    if (!applyTraits(raw, clean)) return null;
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
    if (!applyTraits(raw, clean)) return null;
    if (raw.dark !== undefined) {
        const dark = sanitizeVariant(raw.dark);
        if (!dark) return null;
        if (Object.keys(dark).length > 0) clean.dark = dark;
    }
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

interface ThemeSource {
    art:          IconArt;
    minContrast?: number;
    base:         IconThemeVariant;
    dark?:        IconThemeVariant;
}

function sourceOfDef(def: IconThemeDef): ThemeSource {
    const { id, label, hint, art, minContrast, dark, ...base } = def;
    return { art, minContrast, base, dark };
}

function sourceOfTheme(theme: IconThemeDraft): ThemeSource {
    const { dark, ...base } = theme;
    return { art: 'glyph', minContrast: CUSTOM_CONTRAST, base, dark };
}

const SOURCE_BY_ID = new Map<string, ThemeSource>(ICON_THEMES.map(def => [def.id, sourceOfDef(def)]));
const DEFAULT_SOURCE = SOURCE_BY_ID.get('default') as ThemeSource;
const CUSTOM_BY_ID = new Map<string, ThemeSource>();

function syncCustomRegistry(list: CustomIconTheme[]) {
    CUSTOM_BY_ID.clear();
    for (const theme of list) CUSTOM_BY_ID.set(theme.id, sourceOfTheme(theme));
}

function knownThemeId(value: unknown): IconThemeId | null {
    if (typeof value !== 'string') return null;
    if (SOURCE_BY_ID.has(value)) return value as BuiltinIconThemeId;
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

function rgbToHsl(rgb: [number, number, number]): [number, number, number] {
    const [r, g, b] = rgb.map(v => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? 60 * (((g - b) / d) % 6)
        : max === g ? 60 * ((b - r) / d + 2)
        : 60 * ((r - g) / d + 4);
    return [((h % 360) + 360) % 360, s, l];
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

function shiftAccent(color: string, hue: number | undefined, saturation: number | undefined): string {
    if (hue === undefined && saturation === undefined) return color;
    const rgb = toRgb(color);
    if (!rgb) return color;
    const [h, s, l] = rgbToHsl(rgb);
    const out = hslToRgb(h + (hue ?? 0), Math.max(0, Math.min(1, s * (saturation ?? 1))), l);
    return `rgb(${clampByte(out[0])}, ${clampByte(out[1])}, ${clampByte(out[2])})`;
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
    const away = target === '#000000' ? '#ffffff' : '#000000';
    for (let step = 1; step <= 10; step++) {
        const lifted = mixColor(glyph, target, step / 10);
        if (clears(lifted)) return lifted;
    }
    for (let step = 1; step <= 10; step++) {
        const lifted = mixColor(glyph, away, step / 10);
        if (clears(lifted)) return lifted;
    }
    const worst = (c: string) => Math.min(...tile.map(shade => contrast(c, shade)));
    return worst(target) >= worst(away) ? target : away;
}

export interface IconAppearance {
    art:          IconArt;
    background:   string;
    glyph:        string;
    radius:       number;
    glyphSize:    number;
    glyphWeight:  number;
    boxShadow:    string;
    labelColor:   string | undefined;
    labelWeight:  number | undefined;
    labelShow:    boolean | undefined;
    icon:         string | undefined;
}

const ACCENT_RECIPE: ColorRecipe = { from: 'accent' };

const TEXTURE_LAYERS: Record<IconTexture, string> = {
    none:    '',
    noise:   'radial-gradient(rgba(255,255,255,0.10) 0.5px, rgba(255,255,255,0) 0.7px) 0 0 / 3px 3px, '
        + 'radial-gradient(rgba(0,0,0,0.08) 0.5px, rgba(0,0,0,0) 0.7px) 1.5px 1.5px / 3px 3px',
    dots:    'radial-gradient(rgba(255,255,255,0.16) 1.2px, rgba(255,255,255,0) 1.5px) 0 0 / 9px 9px',
    stripes: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.10) 0 2px, rgba(255,255,255,0) 2px 6px)',
};

function alpha(n: number): string {
    return String(Math.round(n * 1000) / 1000);
}

function variantFor(source: ThemeSource, dark: boolean): IconThemeVariant {
    return dark && source.dark ? { ...source.base, ...source.dark } : source.base;
}

function appearanceOf(source: ThemeSource, appId: string, accent: string, dark: boolean): IconAppearance {
    const look = variantFor(source, dark);
    const rooted = toRgb(accent) ? accent : customAccent(appId);
    const tint = shiftAccent(rooted, look.hue, look.saturation);

    const override = look.overrides?.[appId];
    const solid  = resolveColor(override?.background ?? look.background ?? ACCENT_RECIPE, tint);
    const symbol = resolveColor(override?.glyph ?? look.glyph ?? ACCENT_RECIPE, tint);

    const depth  = look.depth === true;
    const angle  = look.angle ?? DEFAULT_ANGLE;
    const second = look.background2 ? resolveColor(look.background2, tint) : null;
    const shades = [solid];

    let base: string;
    if (second) {
        base = `linear-gradient(${angle}deg, ${solid} 0%, ${second} 100%)`;
        shades.push(second);
    } else if (depth) {
        const top   = mixColor(solid, '#ffffff', 0.34);
        const mid   = mixColor(solid, '#ffffff', 0);
        const shade = mixColor(solid, '#000000', 0.34);
        base = `linear-gradient(${angle}deg, ${top} 0%, ${mid} 46%, ${shade} 100%)`;
        shades.push(shade);
    } else {
        base = solid;
    }

    const layers: string[] = [];
    const gloss = look.gloss ?? (depth ? 1 : 0);
    if (gloss > 0) {
        layers.push(
            `radial-gradient(115% 78% at 30% -14%, rgba(255,255,255,${alpha(0.46 * gloss)}) 0%, `
                + `rgba(255,255,255,${alpha(0.06 * gloss)}) 54%, rgba(255,255,255,0) 72%)`,
            `radial-gradient(130% 62% at 50% 116%, rgba(255,255,255,${alpha(0.14 * gloss)}) 0%, rgba(255,255,255,0) 62%)`,
        );
        if (look.gloss !== undefined) shades.push(mixColor(solid, '#ffffff', 0.46 * gloss));
    }
    const texture = TEXTURE_LAYERS[look.texture ?? 'none'];
    if (texture) layers.push(texture);
    layers.push(base);

    const shadow: string[] = [];
    if (look.glow !== undefined && look.glow > 0) {
        const lit = toRgb(mixColor(solid, '#ffffff', 0.25)) ?? [255, 255, 255];
        shadow.push(`0 0 ${Math.round(6 + 18 * look.glow)}px rgba(${lit[0]}, ${lit[1]}, ${lit[2]}, ${alpha(0.12 + 0.48 * look.glow)})`);
    }
    if (look.border && look.border.width > 0) {
        shadow.push(`inset 0 0 0 ${look.border.width}px ${resolveColor(look.border.color, tint)}`);
    }
    if (look.bevel === true) {
        shadow.push('inset 0 1px 0 rgba(255,255,255,0.28)', 'inset 0 -1px 0 rgba(0,0,0,0.3)');
    }

    return {
        art:         source.art,
        background:  layers.join(', '),
        glyph:       source.art === 'native'
            ? symbol
            : legible(symbol, shades, source.minContrast ?? MIN_CONTRAST),
        radius:      look.radius ?? DEFAULT_RADIUS,
        glyphSize:   Math.round(DEFAULT_GLYPH_SIZE * (look.glyphScale ?? 1)),
        glyphWeight: look.glyphWeight ?? DEFAULT_GLYPH_WEIGHT,
        boxShadow:   shadow.join(', '),
        labelColor:  look.label?.color ? resolveColor(look.label.color, tint) : undefined,
        labelWeight: look.label?.weight,
        labelShow:   look.label?.show,
        icon:        override?.icon,
    };
}

function sourceFor(theme: IconThemeId): ThemeSource {
    return SOURCE_BY_ID.get(theme) ?? CUSTOM_BY_ID.get(theme) ?? DEFAULT_SOURCE;
}

function darkNow(): boolean {
    return useThemeStore.getState().theme === 'dark';
}

export function resolveIconAppearance(theme: IconThemeId, appId: string, accent: string): IconAppearance {
    return appearanceOf(sourceFor(theme), appId, accent, darkNow());
}

export function resolveDraftAppearance(draft: IconThemeDraft, appId: string, accent: string): IconAppearance {
    return appearanceOf(sourceOfTheme(draft), appId, accent, darkNow());
}

export function iconThemeWallpaper(theme: IconThemeId): string | undefined {
    return variantFor(sourceFor(theme), darkNow()).wallpaper;
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
    const theme = useIconTheme();
    const dark  = useThemeStore(s => s.theme === 'dark');
    return appearanceOf(sourceFor(theme), appId, accent, dark);
}
