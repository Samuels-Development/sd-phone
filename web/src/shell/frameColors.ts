
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

export const DEFAULT_FRAME_COLOR = 'black';

export function frameHex(name: string): string {
    return FRAME_COLORS[name] ?? FRAME_COLORS[DEFAULT_FRAME_COLOR];
}

function clamp(n: number): number { return Math.max(0, Math.min(255, Math.round(n))); }

function parse(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('');
}

function mix(hex: string, target: number, amt: number): string {
    const [r, g, b] = parse(hex);
    return toHex(r + (target - r) * amt, g + (target - g) * amt, b + (target - b) * amt);
}

const lighten = (hex: string, amt: number) => mix(hex, 255, amt);
const darken  = (hex: string, amt: number) => mix(hex, 0, amt);

export interface FrameStops { s0: string; s20: string; s45: string; s68: string; s100: string }

const FINISH_RAMP = {
    polished: { top: 0.30, trough: 0.30, tail: 0.14 },
    matte:    { top: 0.11, trough: 0.09, tail: 0.05 },
} as const;

export type FrameFinish = keyof typeof FINISH_RAMP;

export function frameStops(name: string, finish: FrameFinish = 'polished'): FrameStops {
    const base = FRAME_COLORS[name] ?? FRAME_COLORS[DEFAULT_FRAME_COLOR];
    const ramp = FINISH_RAMP[finish] ?? FINISH_RAMP.polished;
    return {
        s0:   lighten(base, ramp.top),
        s20:  base,
        s45:  darken(base, ramp.trough),
        s68:  base,
        s100: lighten(base, ramp.tail),
    };
}
