import type { DeviceButton, DeviceId } from '@/device/types';
import type { FrameFinish } from './frameColors';

export type ShellCutout = 'island' | 'notch' | 'punch' | 'none' | 'soft';

export type ShellOptics = 'none' | 'lens' | 'twin' | 'lensIr';

export interface ShellCutoutSpec {
    kind:    ShellCutout;
    w?:      number;
    h?:      number;
    r?:      number;
    x?:      number | 'center';
    y?:      number;
    collar?: number;
    optics?: ShellOptics;
}

export interface ShellBezel {
    side:   number;
    top:    number;
    bottom: number;
}

export type FaceBand = 'top' | 'bottom';

export interface FaceSlot {
    band:    FaceBand;
    w:       number;
    h:       number;
    x?:      number | 'center';
    y?:      number;
    style?:  'solid' | 'slits' | 'dots';
    accent?: string;
}

export interface FaceDot {
    band:   FaceBand;
    x:      number;
    d:      number;
    y?:     number;
    kind?:  'lens' | 'sensor' | 'led' | 'screw';
    color?: string;
}

export interface FaceKey {
    band:   FaceBand;
    shape:  'circle' | 'pill';
    w:      number;
    h:      number;
    x?:     number | 'center';
    y?:     number;
    ring?:  number;
    glyph?: 'none' | 'square' | 'dot';
}

export interface ShellFace {
    slots?: readonly FaceSlot[];
    dots?:  readonly FaceDot[];
    keys?:  readonly FaceKey[];
}

export interface ShellPlate {
    color: string;
    rail?: number;
}

export interface ShellRim {
    inset:  number;
    width?: number;
    color?: string;
}

export interface ShellGlass {
    edge?:     'curved' | 'quad';
    band?:     number;
    strength?: number;
}

export interface RailMark {
    side: 'left' | 'right' | 'top' | 'bottom';
    at:   number;
    w?:   number;
}

export interface RailGrip {
    side:   'left' | 'right';
    y:      number;
    h:      number;
    style?: 'ticks' | 'hatch';
}

export interface ShellRail {
    antennas?: readonly RailMark[];
    grips?:    readonly RailGrip[];
    caps?:     { run: number; color: string };
}

export type ButtonStyle = 'proud' | 'inset' | 'ringed' | 'switch' | 'ridged';

export interface ShellButton extends DeviceButton {
    w?:      number;
    style?:  ButtonStyle;
    accent?: string;
    detent?: 0 | 1 | 2;
}

export interface Shell {
    id:            string;
    devices:       readonly DeviceId[];
    bezel:         number | ShellBezel;
    radius:        number;
    cutout:        ShellCutout | ShellCutoutSpec;
    finish:        FrameFinish;
    buttons:       readonly ShellButton[];
    screenRadius?: number;
    plate?:        ShellPlate;
    face?:         ShellFace;
    rim?:          ShellRim;
    glass?:        ShellGlass;
    rail?:         ShellRail;
}

export const DEFAULT_SHELL = 'ios';

export const SHELLS: readonly Shell[] = [
    {
        id:      'ios',
        devices: ['phone'],
        bezel:   9,
        radius:  55,
        cutout:  'island',
        finish:  'polished',
        buttons: [
            { side: 'left',  y: 174, h: 38, role: 'screenshot' },
            { side: 'left',  y: 252, h: 64, role: 'volumeUp' },
            { side: 'left',  y: 346, h: 64, role: 'volumeDown' },
            { side: 'right', y: 217, h: 80, role: 'power' },
            { side: 'right', y: 566, h: 60 },
        ],
    },
    {
        id:      'android',
        devices: ['phone'],
        bezel:   6,
        radius:  36,
        cutout:  { kind: 'punch', w: 26, h: 26, x: 'center', y: 14 },
        finish:  'matte',
        buttons: [
            { side: 'right', y: 208, h: 62, role: 'power' },
            { side: 'right', y: 316, h: 72, role: 'volumeUp' },
            { side: 'right', y: 392, h: 72, role: 'volumeDown' },
            { side: 'left',  y: 276, h: 28, role: 'screenshot' },
        ],
    },
    {
        id:      'edge',
        devices: ['phone'],
        bezel:   5,
        radius:  34,
        cutout:  { kind: 'punch', w: 24, h: 24, x: 'center', y: 15 },
        finish:  'matte',
        buttons: [
            { side: 'right', y: 226, h: 72, role: 'volumeUp' },
            { side: 'right', y: 302, h: 72, role: 'volumeDown' },
            { side: 'right', y: 414, h: 76, role: 'power' },
            { side: 'left',  y: 300, h: 28, role: 'screenshot' },
        ],
    },
    {
        id:      'classic',
        devices: ['phone'],
        bezel:   16,
        radius:  44,
        cutout:  { kind: 'notch', w: 104, h: 28, r: 14, x: 'center', y: 0 },
        finish:  'matte',
        buttons: [
            { side: 'left',  y: 146, h: 42, role: 'screenshot' },
            { side: 'left',  y: 220, h: 84, role: 'volumeUp' },
            { side: 'left',  y: 328, h: 84, role: 'volumeDown' },
            { side: 'left',  y: 445, h: 80 },
            { side: 'right', y: 206, h: 138, role: 'power' },
        ],
    },
    {
        id:      'compact',
        devices: ['phone'],
        bezel:   { side: 7, top: 32, bottom: 38 },
        radius:  32,
        cutout:  { kind: 'none' },
        finish:  'polished',
        buttons: [
            { side: 'right', y: 232, h: 58, role: 'power' },
            { side: 'right', y: 316, h: 66, role: 'volumeUp' },
            { side: 'right', y: 390, h: 66, role: 'volumeDown' },
            { side: 'left',  y: 300, h: 30, role: 'screenshot' },
        ],
    },
    {
        id:      'droplet',
        devices: ['phone'],
        bezel:   { side: 5, top: 6, bottom: 14 },
        radius:  28,
        cutout:  { kind: 'notch', w: 44, h: 22, r: 11, x: 'center', y: 0 },
        finish:  'polished',
        buttons: [
            { side: 'left',  y: 140, h: 28, role: 'screenshot' },
            { side: 'left',  y: 196, h: 60, role: 'volumeUp' },
            { side: 'left',  y: 264, h: 60, role: 'volumeDown' },
            { side: 'right', y: 150, h: 44 },
            { side: 'right', y: 230, h: 68, role: 'power' },
        ],
    },
    {
        id:      'dual',
        devices: ['phone'],
        bezel:   { side: 4, top: 6, bottom: 12 },
        radius:  30,
        cutout:  { kind: 'punch', w: 62, h: 26, r: 13, x: 'center', y: 14 },
        finish:  'polished',
        buttons: [
            { side: 'left',  y: 246, h: 28, role: 'screenshot' },
            { side: 'right', y: 214, h: 58, role: 'volumeUp' },
            { side: 'right', y: 280, h: 58, role: 'volumeDown' },
            { side: 'right', y: 362, h: 70, role: 'power' },
        ],
    },
    {
        id:      'rugged',
        devices: ['phone'],
        bezel:   { side: 22, top: 34, bottom: 40 },
        radius:  46,
        cutout:  { kind: 'none' },
        finish:  'matte',
        buttons: [
            { side: 'left',  y: 280, h: 44, role: 'screenshot' },
            { side: 'left',  y: 400, h: 60 },
            { side: 'right', y: 264, h: 76, role: 'volumeUp' },
            { side: 'right', y: 352, h: 76, role: 'volumeDown' },
            { side: 'right', y: 460, h: 92, role: 'power' },
        ],
    },
    {
        id:      'gaming',
        devices: ['phone'],
        bezel:   { side: 10, top: 22, bottom: 22 },
        radius:  22,
        cutout:  { kind: 'notch', w: 72, h: 20, r: 10, x: 'center', y: 0 },
        finish:  'matte',
        buttons: [
            { side: 'left',  y: 310, h: 34, role: 'screenshot' },
            { side: 'right', y: 164, h: 96 },
            { side: 'right', y: 346, h: 68, role: 'power' },
            { side: 'right', y: 428, h: 60, role: 'volumeUp' },
            { side: 'right', y: 498, h: 60, role: 'volumeDown' },
            { side: 'right', y: 716, h: 96 },
        ],
    },
    {
        id:           'waterfall',
        devices:      ['phone'],
        bezel:        { side: 3, top: 5, bottom: 7 },
        radius:       26,
        screenRadius: 44,
        cutout:       { kind: 'punch', w: 92, h: 32, r: 16, x: 'center', y: 13, collar: 2, optics: 'lensIr' },
        finish:       'polished',
        glass:        { edge: 'quad', band: 24, strength: 0.15 },
        rim:          { inset: 1, width: 1 },
        face:         {
            slots: [
                { band: 'top', w: 104, h: 3, x: 'center', style: 'solid' },
            ],
        },
        rail:         {
            antennas: [
                { side: 'left',  at: 214, w: 4 },
                { side: 'right', at: 386, w: 4 },
                { side: 'right', at: 742, w: 4 },
                { side: 'top',   at: 123, w: 4 },
                { side: 'top',   at: 337, w: 4 },
            ],
        },
        buttons: [
            { side: 'right', y: 112, h: 56, w: 6, role: 'volumeUp' },
            { side: 'right', y: 176, h: 56, w: 6, role: 'volumeDown' },
            { side: 'right', y: 246, h: 54, w: 6, accent: '#ff7043', role: 'power' },
            { side: 'right', y: 312, h: 22, w: 6, style: 'ringed', role: 'screenshot' },
        ],
    },
];

export function isShellId(v: unknown): v is string {
    return typeof v === 'string' && SHELLS.some(s => s.id === v);
}

export function shellsFor(deviceId: DeviceId): Shell[] {
    return SHELLS.filter(s => s.devices.includes(deviceId));
}

export function shellFor(id: string | undefined, deviceId: DeviceId): Shell | null {
    const allowed = shellsFor(deviceId);
    if (!allowed.length) return null;
    return allowed.find(s => s.id === id) ?? allowed.find(s => s.id === DEFAULT_SHELL) ?? allowed[0];
}
