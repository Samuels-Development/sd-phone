import type { PaletteMode } from './paletteRamp';

export type AccentPreset = {
    id:  string;
    hue: number;
    sat: number;
};

export const ACCENT_PRESETS: readonly AccentPreset[] = [
    { id: 'blue',   hue: 211, sat: 100 },
    { id: 'indigo', hue: 245, sat: 74  },
    { id: 'purple', hue: 280, sat: 74  },
    { id: 'pink',   hue: 340, sat: 90  },
    { id: 'red',    hue: 4,   sat: 88  },
    { id: 'orange', hue: 28,  sat: 96  },
    { id: 'yellow', hue: 46,  sat: 96  },
    { id: 'green',  hue: 135, sat: 70  },
    { id: 'mint',   hue: 168, sat: 62  },
    { id: 'teal',   hue: 190, sat: 82  },
    { id: 'brown',  hue: 25,  sat: 34  },
    { id: 'gray',   hue: 220, sat: 10  },
];

export const DEFAULT_ACCENT = 'blue';

const CUSTOM_ACCENT = /^custom:(\d{1,3})$/;

export function isCustomAccentId(v: unknown): v is string {
    if (typeof v !== 'string') return false;
    const m = CUSTOM_ACCENT.exec(v);
    return !!m && Number(m[1]) <= 359;
}

export function isAccentChoice(v: unknown): v is string {
    return typeof v === 'string' && (isCustomAccentId(v) || ACCENT_PRESETS.some(p => p.id === v));
}

export function customAccentId(hue: number): string {
    return `custom:${clamp(Math.round(hue), 0, 359)}`;
}

export function accentRecipe(choice: string): { hue: number; sat: number } {
    const m = CUSTOM_ACCENT.exec(choice);
    if (m) return { hue: clamp(Number(m[1]), 0, 359), sat: 100 };
    const preset = ACCENT_PRESETS.find(p => p.id === choice);
    return preset ? { hue: preset.hue, sat: preset.sat } : { hue: 211, sat: 100 };
}

export function accentFor(mode: PaletteMode, choice: string): string {
    const { hue, sat } = accentRecipe(choice);
    const target = mode === 'dark' ? 52 : 50;

    let light = target;
    for (let i = 0; i < 40; i++) {
        const lum = luminance(rgb(hue, sat, light));
        if (mode === 'dark' ? lum >= 0.22 : lum <= 0.42) break;
        light += mode === 'dark' ? 2 : -2;
        if (light <= 12 || light >= 88) break;
    }

    const [r, g, b] = rgb(hue, sat, light);
    return `${r} ${g} ${b}`;
}

export function accentVars(mode: PaletteMode, choice: string): Record<string, string> {
    return {
        '--ios-blue':    accentFor(mode, choice),
        '--accent-dark': accentFor('dark', choice),
    };
}

export function accentCss(mode: PaletteMode, choice: string): string {
    return `rgb(${accentFor(mode, choice).split(' ').join(', ')})`;
}

function rgb(h: number, s: number, l: number): [number, number, number] {
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

    return [byte(r + m), byte(g + m), byte(b + m)];
}

function luminance([r, g, b]: [number, number, number]): number {
    const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function byte(v: number): number {
    return clamp(Math.round(v * 255), 0, 255);
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}
