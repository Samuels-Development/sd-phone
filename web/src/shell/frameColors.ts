
const FRAME_COLORS: Record<string, string> = {
    black:         '#292e28',
    blue:          '#3a9bc8',
    green:         '#28c329',
    orange:        '#c68028',
    pink:          '#d75fc9',
    purple:        '#a689b7',
    red:           '#9d3431',
    yellow:        '#dfb431',
    white:         '#f3f3ef',
    silver:        '#d5d8db',
    graphite:      '#4b4d52',
    titanium:      '#beb6aa',
    gold:          '#ecd6aa',
    rosegold:      '#ecc4ba',
    bronze:        '#b88c68',
    mocha:         '#684a3a',
    cream:         '#f6ecd6',
    burgundy:      '#6e1828',
    coral:         '#fa7060',
    peach:         '#ffbe98',
    lime:          '#b0d63e',
    mint:          '#a0e2c4',
    sage:          '#96aa8c',
    forest:        '#1e4e36',
    teal:          '#1a8c8c',
    cyan:          '#40c8e0',
    skyblue:       '#8cc4f0',
    navy:          '#18244c',
    indigo:        '#4640aa',
    lavender:      '#c4b2ec',
    magenta:       '#d43096',
    rose:          '#e85a78',
    jetblack:      '#0c0d10',
    pearl:         '#f4f1ea',
    ruby:          '#8e0f1f',
    sapphire:      '#12357a',
    blackgold:     '#c9a45c',
    whitegold:     '#d4b06a',
    leather_brown: '#7a4a2a',
    leather_black: '#222224',
    leather_tan:   '#c08a54',
};

/** What a colour's rail is made of where it is not plain metal: polished glass, the gold frame of a
 *  two-tone (its FRAME_COLORS entry is the frame's gold, not the back's colour), or the leather case
 *  the phone comes in. Both tables are written from sd-phone-props by its wire_sd_phone.py. */
export type FrameMaterial = 'metal' | 'gloss' | 'gold' | 'leather';

const FRAME_MATERIALS: Record<string, FrameMaterial> = {
    jetblack:      'gloss',
    pearl:         'gloss',
    ruby:          'gloss',
    sapphire:      'gloss',
    blackgold:     'gold',
    whitegold:     'gold',
    leather_brown: 'leather',
    leather_black: 'leather',
    leather_tan:   'leather',
};

export const DEFAULT_FRAME_COLOR = 'black';

export function frameHex(name: string): string {
    return FRAME_COLORS[name] ?? FRAME_COLORS[DEFAULT_FRAME_COLOR];
}

export function frameMaterial(name: string): FrameMaterial {
    return FRAME_MATERIALS[name] ?? 'metal';
}

function clamp(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }

function parse(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
}

type Rgb = readonly [number, number, number];

function mix(hex: string, target: Rgb, amt: number): string {
    const [r, g, b] = parse(hex);
    return toHex(r + (target[0] - r) * amt, g + (target[1] - g) * amt, b + (target[2] - b) * amt);
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const GOLD_LIGHT: Rgb = [255, 247, 222];
const GOLD_SHADE: Rgb = [58, 36, 8];

export interface FrameStops { s0: string; s20: string; s45: string; s68: string; s100: string }

const FINISH_RAMP = {
    polished: { top: 0.30, trough: 0.30, tail: 0.14 },
    matte:    { top: 0.11, trough: 0.09, tail: 0.05 },
} as const;

export type FrameFinish = keyof typeof FINISH_RAMP;

const MATERIAL_RAMP = {
    gloss:   { top: 0.50, trough: 0.42, tail: 0.24 },
    gold:    { top: 0.42, trough: 0.34, tail: 0.18 },
    leather: { top: 0.08, trough: 0.16, tail: 0.03 },
} as const;

/** The rail's gradient. Metal takes the shell's finish; glass, gold and leather keep their own
 *  whatever the shell, and gold lights and shades warm instead of towards white and black. */
export function frameStops(name: string, finish: FrameFinish = 'polished'): FrameStops {
    const base = frameHex(name);
    const material = frameMaterial(name);
    const ramp = material === 'metal' ? FINISH_RAMP[finish] ?? FINISH_RAMP.polished : MATERIAL_RAMP[material];
    const light = material === 'gold' ? GOLD_LIGHT : WHITE;
    const shade = material === 'gold' ? GOLD_SHADE : BLACK;
    return {
        s0:   mix(base, light, ramp.top),
        s20:  base,
        s45:  mix(base, shade, ramp.trough),
        s68:  base,
        s100: mix(base, light, ramp.tail),
    };
}
