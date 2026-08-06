import { device } from '@device';
import type { FrameFinish } from './frameColors';
import type {
    FaceBand, Shell, ShellButton, ShellCutout, ShellCutoutSpec, ShellFace, ShellOptics, ShellRail,
} from './shells';

export interface RailButton extends ShellButton {
    x: number;
    w: number;
}

export interface FaceSlotPart {
    t:      'slot';
    x:      number; y: number; w: number; h: number; r: number;
    style:  'solid' | 'slits' | 'dots';
    color:  string;
    bars:   number; barW: number;
    cols:   number; rows: number; dotR: number;
    pitchX: number; pitchY: number;
}

export interface FaceDotPart {
    t:     'dot';
    cx:    number; cy: number; r: number;
    kind:  'lens' | 'sensor' | 'led' | 'screw';
    color: string;
}

export interface FaceKeyPart {
    t:     'key';
    x:     number; y: number; w: number; h: number; r: number;
    ring:  number;
    glyph: 'none' | 'square' | 'dot';
}

export type FacePart = FaceSlotPart | FaceDotPart | FaceKeyPart;

export interface GlassBand {
    x: number; y: number; w: number; h: number;
    dir: 'l' | 'r' | 't' | 'b';
}

export interface RailMarkRect {
    x: number; y: number; w: number; h: number;
}

export interface RailGripRect {
    x: number; y: number; w: number; h: number;
    ticks: number;
    style: 'ticks' | 'hatch';
}

export interface RailCap {
    x: number; y: number; run: number;
}

export interface ChassisMetrics {
    B: number;  SW: number; SH: number; W: number;  H: number;
    SX: number; SY: number; BR: number; SR: number;
    SCREEN_MASK: string;
    BEZEL: string;
    SCREEN_RRECT: string;
    OUTER_RRECT: string;
    cutout: ShellCutout;
    island: boolean;
    hostsIsland: boolean;
    hasCutout: boolean;
    softPatch: boolean;
    pillInCutout: boolean;
    CUT_W: number; CUT_H: number; CUT_X: number; CUT_Y: number; CUT_R: number;
    CUT_COLLAR: number;
    CUT_OPTICS: ShellOptics;
    CUT_PATH: string | null;
    BT: number; BB: number; BS: number;
    CUT_LENS_X: number;
    DI_W: number; DI_H: number; DI_X: number; DI_Y: number; DI_R: number;
    PET_H: number; PET_W: number; PET_TOP: number; LENS_X: number; PET_RIGHT: number;
    petStage: (left: number) => { left: number; run: number };
    CALL_W: number; CALL_X: number;
    MI_W: number; MI_X: number; MI_H: number;
    MIP_W: number; MIP_X: number;
    FINISH: FrameFinish; MATTE: boolean;
    BTN_W: number; BTN_RX: number;
    SHEEN_TOP: number; SHEEN_MID: number; EDGE_LIGHT: number;
    FACE_LIGHT: number; FACE_DARK: number;
    PLATE: string | null;
    RAIL_T: number;
    RAIL_BAND: string | null;
    RIM_W: number; RIM_IN: number;
    RIM_PATH: string | null;
    RIM_COLOR: string | null;
    FACE: FacePart[]; FACE_TOP: FacePart[]; FACE_BOTTOM: FacePart[];
    AUTO_FOREHEAD: boolean;
    GLASS: GlassBand[]; GLASS_STRENGTH: number;
    MARKS: RailMarkRect[]; GRIPS: RailGripRect[]; CAPS: RailCap[];
    CAP_COLOR: string | null;
    BUTTONS: RailButton[];
    VOL_UP_BTN?: RailButton; VOL_DOWN_BTN?: RailButton;
    POWER_BTN?: RailButton;  SCREENSHOT_BTN?: RailButton;
}

const CUTOUT_INSET = 2.5;
const STATUS_BAND_H = 54;
const NOTCH_SHOULDER = 11;
const DI_ISLAND_W = 126;
const DI_NOTCH_W  = 164;
const DI_PUNCH_W  = 34;
const DI_ISLAND_H = 37;
const DI_NOTCH_H  = 30;
const DI_PUNCH_H  = 34;
const PET_H = 26;
const PET_FLOOR = 4;

const CUTOUT_DEFAULTS: Record<ShellCutout, { w: number; h: number }> = {
    island: { w: DI_ISLAND_W, h: DI_ISLAND_H },
    notch:  { w: DI_NOTCH_W,  h: DI_NOTCH_H },
    punch:  { w: DI_PUNCH_W,  h: DI_PUNCH_H },
    none:   { w: 0,           h: 0 },
    soft:   { w: 40,          h: 40 },
};

const PLATE_RAIL = 3.5;
const RIM_WIDTH = 2;
const GLASS_BAND = 22;
const GLASS_STRENGTH = 0.14;
const GLASS_STRENGTH_MAX = 0.16;
const GLASS_QUAD_MAX = 13;
const MARK_W = 2.5;
const SLIT_PITCH = 6;
const SLIT_W = 2;
const PERF_PITCH_X = 9;
const PERF_PITCH_Y = 7;
const TICK_PITCH = 9;
const DOT_DEFAULT = '#0c0c14';
const LED_DEFAULT = '#30d158';
const SLOT_DEFAULT = 'rgba(0,0,0,0.55)';
const LED_GLOW = 1.6;

const CUT_TOP = 11;
const PUNCH_RIGHT_INSET = 26;
const PILL_ANCHOR_Y = 50;
const PILL_DROP = 8;

export function rrect(x: number, y: number, w: number, h: number, r: number): string {
    const rc = Math.min(r, w / 2, h / 2);
    return (
        `M${x + rc},${y} ` +
        `H${x + w - rc} A${rc},${rc} 0 0 1 ${x + w},${y + rc} ` +
        `V${y + h - rc} A${rc},${rc} 0 0 1 ${x + w - rc},${y + h} ` +
        `H${x + rc} A${rc},${rc} 0 0 1 ${x},${y + h - rc} ` +
        `V${y + rc} A${rc},${rc} 0 0 1 ${x + rc},${y} Z`
    );
}

export function notchPath(x: number, y: number, w: number, h: number, r: number, s: number): string {
    const rc = Math.min(r, w / 2, h);
    const sc = Math.min(s, w / 2);
    return (
        `M${x - sc},${y} ` +
        `A${sc},${sc} 0 0 1 ${x},${y + sc} ` +
        `V${y + h - rc} ` +
        `A${rc},${rc} 0 0 0 ${x + rc},${y + h} ` +
        `H${x + w - rc} ` +
        `A${rc},${rc} 0 0 0 ${x + w},${y + h - rc} ` +
        `V${y + sc} ` +
        `A${sc},${sc} 0 0 1 ${x + w + sc},${y} ` +
        `Z`
    );
}

interface BandBox {
    W: number; H: number; SY: number; SH: number; BT: number; BB: number;
}

function bandTop(band: FaceBand, h: number, y: number | undefined, b: BandBox): number {
    return band === 'top'
        ? b.SY - (y ?? (b.BT - h) / 2) - h
        : b.SY + b.SH + (y ?? (b.BB - h) / 2);
}

function fitsBand(band: FaceBand, y0: number, y1: number, b: BandBox): boolean {
    return band === 'top'
        ? y0 >= 0 && y1 <= b.SY
        : y0 >= b.SY + b.SH && y1 <= b.H;
}

function anchorX(x: number | 'center' | undefined, w: number, W: number): number {
    return x === undefined || x === 'center' ? (W - w) / 2 : x;
}

function resolveFace(face: ShellFace | undefined, b: BandBox): { top: FacePart[]; bottom: FacePart[] } {
    const top: FacePart[] = [];
    const bottom: FacePart[] = [];
    const push = (band: FaceBand, part: FacePart) => (band === 'top' ? top : bottom).push(part);

    for (const s of face?.slots ?? []) {
        const y0 = bandTop(s.band, s.h, s.y, b);
        if (!fitsBand(s.band, y0, y0 + s.h, b)) continue;
        const style = s.style ?? 'solid';
        push(s.band, {
            t:      'slot',
            x:      anchorX(s.x, s.w, b.W),
            y:      y0,
            w:      s.w,
            h:      s.h,
            r:      style === 'solid' ? Math.min(s.h / 2, s.w / 2) : Math.min(1, s.h / 2),
            style,
            color:  s.accent ?? SLOT_DEFAULT,
            bars:   style === 'slits' ? Math.floor(s.w / SLIT_PITCH) : 0,
            barW:   SLIT_W,
            cols:   style === 'dots' ? Math.floor(s.w / PERF_PITCH_X) : 0,
            rows:   style === 'dots' ? Math.max(1, Math.floor(s.h / PERF_PITCH_Y)) : 0,
            dotR:   2,
            pitchX: style === 'dots' ? PERF_PITCH_X : SLIT_PITCH,
            pitchY: PERF_PITCH_Y,
        });
    }

    for (const d of face?.dots ?? []) {
        const kind = d.kind ?? 'sensor';
        const r = d.d / 2;
        const reach = kind === 'led' ? r * LED_GLOW : r;
        const y0 = bandTop(d.band, d.d, d.y, b);
        const cy = y0 + r;
        if (!fitsBand(d.band, cy - reach, cy + reach, b)) continue;
        push(d.band, {
            t:     'dot',
            cx:    d.x,
            cy,
            r,
            kind,
            color: d.color ?? (kind === 'led' ? LED_DEFAULT : DOT_DEFAULT),
        });
    }

    for (const k of face?.keys ?? []) {
        const y0 = bandTop(k.band, k.h, k.y, b);
        if (!fitsBand(k.band, y0, y0 + k.h, b)) continue;
        push(k.band, {
            t:     'key',
            x:     anchorX(k.x, k.w, b.W),
            y:     y0,
            w:     k.w,
            h:     k.h,
            r:     k.shape === 'circle' ? Math.min(k.w, k.h) / 2 : k.h / 2,
            ring:  k.ring ?? 0,
            glyph: k.glyph ?? 'none',
        });
    }

    return { top, bottom };
}

function resolveRail(
    spec: ShellRail | undefined,
    W: number, H: number, BS: number, BT: number, BB: number, plated: number | null,
): { marks: RailMarkRect[]; grips: RailGripRect[]; caps: RailCap[] } {
    const marks: RailMarkRect[] = [];
    const grips: RailGripRect[] = [];
    const caps: RailCap[] = [];
    const dS = plated ?? BS;
    const dT = plated ?? BT;
    const dB = plated ?? BB;

    for (const a of spec?.antennas ?? []) {
        const mw = a.w ?? MARK_W;
        if (a.side === 'left')        marks.push({ x: 0,      y: a.at,     w: dS, h: mw });
        else if (a.side === 'right')  marks.push({ x: W - dS, y: a.at,     w: dS, h: mw });
        else if (a.side === 'top')    marks.push({ x: a.at,   y: 0,        w: mw, h: dT });
        else                          marks.push({ x: a.at,   y: H - dB,   w: mw, h: dB });
    }

    for (const g of spec?.grips ?? []) {
        grips.push({
            x:     g.side === 'left' ? 0 : W - dS,
            y:     g.y,
            w:     dS,
            h:     g.h,
            ticks: Math.max(1, Math.floor(g.h / TICK_PITCH)),
            style: g.style ?? 'ticks',
        });
    }

    if (spec?.caps) {
        const run = Math.min(spec.caps.run, Math.min(W, H) / 3);
        caps.push({ x: 0, y: 0, run });
        caps.push({ x: W - run, y: 0, run });
        caps.push({ x: 0, y: H - run, run });
        caps.push({ x: W - run, y: H - run, run });
    }

    return { marks, grips, caps };
}

export function shellHostsPet(shell: Shell | null): boolean {
    return chassisMetrics(shell).pillInCutout;
}

export function chassisMetrics(shell: Shell | null): ChassisMetrics {
    const bez = shell?.bezel ?? device.screen.bezel;
    const BS = typeof bez === 'number' ? bez : bez.side;
    const BT = typeof bez === 'number' ? bez : bez.top;
    const BB = typeof bez === 'number' ? bez : bez.bottom;
    const B  = BS;
    const BR = shell?.radius ?? device.screen.radius;
    const raw = shell?.cutout ?? (device.screen.island ? 'island' : 'notch');
    const spec: ShellCutoutSpec = typeof raw === 'string' ? { kind: raw } : raw;
    const cutout: ShellCutout = spec.kind;
    const finish: FrameFinish = shell?.finish ?? device.screen.finish ?? 'polished';
    const railButtons: readonly ShellButton[] = shell?.buttons ?? device.screen.buttons;

    const SW = device.screen.w;
    const SH = device.screen.h;
    const W  = SW + BS * 2;
    const H  = SH + BT + BB;
    const SX = BS;
    const SY = BT;
    const SR = Math.max(0, shell?.screenRadius ?? BR - BS);

    const SCREEN_MASK =
        `url("data:image/svg+xml,${encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' width='${SW}' height='${SH}'><rect width='${SW}' height='${SH}' rx='${SR}' ry='${SR}' fill='#fff'/></svg>`,
        )}")`;

    const OUTER_RRECT = rrect(0, 0, W, H, BR);
    const SCREEN_RRECT = rrect(SX, SY, SW, SH, SR);

    const BEZEL = OUTER_RRECT + ' ' + rrect(
        SX + CUTOUT_INSET,
        SY + CUTOUT_INSET,
        SW - CUTOUT_INSET * 2,
        SH - CUTOUT_INSET * 2,
        Math.max(0, SR - CUTOUT_INSET),
    );

    const CUT_W = spec.w ?? CUTOUT_DEFAULTS[cutout].w;
    const CUT_H = spec.h ?? CUTOUT_DEFAULTS[cutout].h;

    const defaultX = cutout === 'punch' ? SW - CUT_W - PUNCH_RIGHT_INSET : (SW - CUT_W) / 2;
    const defaultY = cutout === 'notch' ? 0 : cutout === 'none' ? PILL_ANCHOR_Y : CUT_TOP;
    const cutScreenX = spec.x === undefined ? defaultX : spec.x === 'center' ? (SW - CUT_W) / 2 : spec.x;

    const CUT_X = SX + cutScreenX;
    const CUT_Y = SY + (spec.y ?? defaultY);
    const CUT_R = spec.r ?? (cutout === 'notch' ? CUT_H * 0.62 : CUT_H / 2);
    const CUT_LENS_X = CUT_X + CUT_W - Math.min(CUT_R * 1.12, CUT_W / 2);
    const CUT_PATH = cutout === 'notch'
        ? notchPath(CUT_X, CUT_Y, CUT_W, CUT_H, Math.min(CUT_R, CUT_H / 2), NOTCH_SHOULDER)
        : null;
    const CUT_COLLAR = Math.max(0, spec.collar ?? 0);
    const CUT_OPTICS: ShellOptics = spec.optics ?? 'lens';

    const hasCutout = cutout !== 'none' && cutout !== 'soft' && CUT_W > 0 && CUT_H > 0;
    const softPatch = cutout === 'soft' && CUT_W > 0 && CUT_H > 0;

    const DI_W = DI_ISLAND_W;
    const DI_H = DI_ISLAND_H;
    const DI_X = (W - DI_W) / 2;
    const pillInCutout =
        hasCutout &&
        CUT_W >= DI_W && CUT_H >= DI_H &&
        CUT_X <= DI_X && CUT_X + CUT_W >= DI_X + DI_W;
    const DI_Y = pillInCutout
        ? CUT_Y
        : SY + Math.max(hasCutout ? CUT_Y - SY + CUT_H + PILL_DROP : PILL_ANCHOR_Y, STATUS_BAND_H + 6);
    const DI_R = DI_H / 2;

    const PET_W = PET_H * (16 / 13);
    const PET_TOP = DI_Y + DI_H - PET_FLOOR - PET_H;
    const LENS_X = DI_X + DI_W - DI_R * 1.12 - 7;
    const PET_RIGHT = LENS_X - 4;

    const CALL_W = 188;
    const MI_W = 392;
    const MIP_W = 180;

    const MATTE = finish === 'matte';
    const BTN_W = device.screen.buttonWidth ?? 3.5;

    const BUTTONS: RailButton[] = railButtons.map(b => {
        const bw = b.w ?? BTN_W;
        return { ...b, w: bw, x: b.side === 'left' ? -bw : W };
    });

    const PLATE = shell?.plate?.color ?? null;
    const RAIL_T = PLATE
        ? Math.max(0, Math.min(shell?.plate?.rail ?? PLATE_RAIL, Math.min(BS, BT, BB) - 1))
        : 0;
    const RAIL_BAND = PLATE
        ? OUTER_RRECT + ' ' + rrect(RAIL_T, RAIL_T, W - RAIL_T * 2, H - RAIL_T * 2, Math.max(0, BR - RAIL_T))
        : null;

    const RIM_W = shell?.rim?.width ?? RIM_WIDTH;
    const RIM_IN = Math.min(shell?.rim?.inset ?? 0, Math.min(BS, BT, BB) - RIM_W);
    const RIM_PATH = shell?.rim && RIM_IN >= 1
        ? rrect(RIM_IN, RIM_IN, W - RIM_IN * 2, H - RIM_IN * 2, Math.max(0, BR - RIM_IN))
        : null;

    const face = resolveFace(shell?.face, { W, H, SY, SH, BT, BB });
    const FACE_TOP = face.top;
    const FACE_BOTTOM = face.bottom;

    const GB = Math.min(shell?.glass?.band ?? GLASS_BAND, SW / 4);
    const GS = Math.min(shell?.glass?.strength ?? GLASS_STRENGTH, GLASS_STRENGTH_MAX);
    const GLASS: GlassBand[] = [];
    if (shell?.glass) {
        GLASS.push({ x: SX, y: SY, w: GB, h: SH, dir: 'l' });
        GLASS.push({ x: SX + SW - GB, y: SY, w: GB, h: SH, dir: 'r' });
        if (shell.glass.edge === 'quad') {
            const qh = Math.min(GB * 0.6, GLASS_QUAD_MAX);
            GLASS.push({ x: SX, y: SY, w: SW, h: qh, dir: 't' });
            GLASS.push({ x: SX, y: SY + SH - qh, w: SW, h: qh, dir: 'b' });
        }
    }

    const railParts = resolveRail(shell?.rail, W, H, BS, BT, BB, PLATE ? RAIL_T : null);

    return {
        B, SW, SH, W, H, SX, SY, BR, SR,
        SCREEN_MASK, BEZEL, SCREEN_RRECT, OUTER_RRECT,
        cutout,
        island: cutout === 'island',
        hostsIsland: shell ? true : device.screen.island,
        hasCutout,
        softPatch,
        pillInCutout,
        CUT_W, CUT_H, CUT_X, CUT_Y, CUT_R, CUT_PATH, CUT_COLLAR, CUT_OPTICS,
        BT, BB, BS, CUT_LENS_X,
        DI_W, DI_H, DI_X, DI_Y, DI_R,
        PET_H, PET_W, PET_TOP, LENS_X, PET_RIGHT,
        petStage: (left: number) => ({
            left: Math.round(left),
            run:  Math.max(0, Math.floor(PET_RIGHT - Math.round(left) - PET_W)),
        }),
        CALL_W, CALL_X: (W - CALL_W) / 2,
        MI_W, MI_X: (W - MI_W) / 2, MI_H: 152,
        MIP_W, MIP_X: (W - MIP_W) / 2,
        FINISH: finish, MATTE,
        BTN_W, BTN_RX: BTN_W / 2,
        SHEEN_TOP:  MATTE ? 0.05 : 0.10,
        SHEEN_MID:  MATTE ? 0.015 : 0.03,
        EDGE_LIGHT: MATTE ? 0.10 : 0.18,
        FACE_LIGHT: MATTE ? 0.12 : 0.22,
        FACE_DARK:  MATTE ? 0.18 : 0.30,
        PLATE, RAIL_T, RAIL_BAND,
        RIM_W, RIM_IN, RIM_PATH,
        RIM_COLOR: shell?.rim?.color ?? null,
        FACE: [...FACE_TOP, ...FACE_BOTTOM], FACE_TOP, FACE_BOTTOM,
        AUTO_FOREHEAD: (shell ? true : device.screen.island) && !hasCutout && !softPatch && SY >= 14 && FACE_TOP.length === 0,
        GLASS, GLASS_STRENGTH: GS,
        MARKS: railParts.marks, GRIPS: railParts.grips, CAPS: railParts.caps,
        CAP_COLOR: shell?.rail?.caps?.color ?? null,
        BUTTONS,
        VOL_UP_BTN:     BUTTONS.find(b => b.role === 'volumeUp'),
        VOL_DOWN_BTN:   BUTTONS.find(b => b.role === 'volumeDown'),
        POWER_BTN:      BUTTONS.find(b => b.role === 'power'),
        SCREENSHOT_BTN: BUTTONS.find(b => b.role === 'screenshot'),
    };
}
