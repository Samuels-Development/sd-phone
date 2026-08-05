export type PaletteMode = 'light' | 'dark';

export type PaletteRecipe = {
    hue:   number;
    tint:  number;
    depth: number;
};

export type PaletteRamp = {
    base:     string;
    surface:  string;
    elevated: string;
    control:  string;
    iosGray:  string;
};

export const MAX_CUSTOM_PALETTES = 12;
export const PALETTE_NAME_MAX = 24;

export const DEFAULT_RECIPE: Record<PaletteMode, PaletteRecipe> = {
    light: { hue: 210, tint: 0, depth: 55 },
    dark:  { hue: 210, tint: 0, depth: 40 },
};

const CUSTOM_ID = /^custom:[a-z0-9]{4,8}$/;

export function isCustomPaletteId(v: unknown): v is string {
    return typeof v === 'string' && CUSTOM_ID.test(v);
}

export function newPaletteId(taken: readonly string[]): string {
    const used = new Set(taken);
    for (let n = 0; n < 9999; n++) {
        const id = `custom:${(n + 1).toString(36).padStart(4, '0')}`;
        if (!used.has(id)) return id;
    }
    return 'custom:zzzz';
}

export function clampRecipe(v: Partial<PaletteRecipe> | undefined, mode: PaletteMode): PaletteRecipe {
    const d = DEFAULT_RECIPE[mode];
    return {
        hue:   clamp(Math.round(num(v?.hue, d.hue)), 0, 359),
        tint:  clamp(Math.round(num(v?.tint, d.tint)), 0, 100),
        depth: clamp(Math.round(num(v?.depth, d.depth)), 0, 100),
    };
}

export function rampFor(mode: PaletteMode, recipe: PaletteRecipe): PaletteRamp {
    const { hue, tint, depth } = clampRecipe(recipe, mode);

    if (mode === 'dark') {
        const l = 1.2 + (depth / 100) * 9.6;
        const s = (tint / 100) * 34;
        return {
            base:     hsl(hue, s, l),
            surface:  hsl(hue, s * 0.92, l + 6.7),
            elevated: hsl(hue, s * 0.86, l + 13),
            control:  hsl(hue, s * 0.8, l + 18.4),
            iosGray:  hsl(hue, s * 0.3, 63),
        };
    }

    const l = 72 + (depth / 100) * 24;
    const s = (tint / 100) * 26;
    return {
        base:     hsl(hue, s, l),
        surface:  hsl(hue, s * 0.82, Math.min(l + 6.7, 100)),
        elevated: hsl(hue, s * 0.68, Math.min(l + 11.8, 100)),
        control:  hsl(hue, s * 1.05, l - 5.5),
        iosGray:  hsl(hue, s * 0.42, 8 + l * 0.31),
    };
}

export function rampVars(ramp: PaletteRamp): Record<string, string> {
    return {
        '--base':     ramp.base,
        '--surface':  ramp.surface,
        '--elevated': ramp.elevated,
        '--control':  ramp.control,
        '--ios-gray': ramp.iosGray,
    };
}

export function cssColor(channels: string): string {
    return `rgb(${channels.split(' ').join(', ')})`;
}

function hsl(h: number, s: number, l: number): string {
    const sat   = clamp(s, 0, 100) / 100;
    const light = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = light - c / 2;

    const sector = Math.floor(((h % 360) + 360) % 360 / 60);
    const [r, g, b] =
        sector === 0 ? [c, x, 0] :
        sector === 1 ? [x, c, 0] :
        sector === 2 ? [0, c, x] :
        sector === 3 ? [0, x, c] :
        sector === 4 ? [x, 0, c] :
                       [c, 0, x];

    return `${byte(r + m)} ${byte(g + m)} ${byte(b + m)}`;
}

function byte(v: number): number {
    return clamp(Math.round(v * 255), 0, 255);
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

function num(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
