import { memo, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import {
    designKey, PHOTO_STICKER, STICKER_HOME, stickerPlace, stickersOf, type Design, type PhoneBody, type PhoneLook, type Sticker,
    type StickerPlace,
} from './casesApi';
import LAYOUT from './assets/layers.json';

const SRC_W = 300;
const SRC_H = 600;

type Box = readonly [number, number, number, number];

/** Windows into the 300x600 layer frame of the regular body: the whole frame (charm room
 *  included), the phone body, a collection tile (body plus charm), and close-ups of where an
 *  accessory, a sticker, a brand badge and a charm sit. Charms hang from the phone's bottom edge
 *  at x 212 and reach down to y 590 at most; brand badges are the wide middle band of the sticker
 *  square. On another body they move with its parts (moved()). */
const CROPS = {
    full:      [0, 0, SRC_W, SRC_H],
    body:      [38, 6, 224, 420],
    tile:      [12, 4, 276, 592],
    accessory: [78, 173, 144, 144],
    sticker:   [98, 289, 104, 104],
    badge:     [110, 312, 80, 56],
    charm:     [166, 402, 92, 192],
} as const satisfies Record<string, Box>;

/** The layers come per body and design where they differ (sd-phone-props' render_case_ui.py): no
 *  suffix is the regular body and the classic design, `_shut` the foldable shut, `_slate` the slate
 *  design. Accessories, stickers and charms are one picture for every body, drawn on the regular
 *  one; layers.json says how far they move on each body, in frame pixels. */
const BODY_SUFFIX: Record<PhoneBody, string> = { plain: '', shut: '_shut' };
const LOOK_SUFFIX: Record<PhoneLook, string> = { classic: '', slate: '_slate' };

type Shift = readonly [number, number];
const NO_SHIFT: Shift = [0, 0];

function shiftOf(body: PhoneBody, kind: 'part' | 'charm'): Shift {
    const s = LAYOUT.bodies[body]?.[kind];
    return s ? [s[0], s[1]] : NO_SHIFT;
}

const moved = (b: Box, [dx, dy]: Shift): Box => [b[0] + dx, b[1] + dy, b[2], b[3]];
const plus = (a: Shift, b: Shift): Shift => [a[0] + b[0], a[1] + b[1]];

/** Frame pixels per millimetre, and where the regular body's centre and its sticker's home sit in
 *  the frame. The phone's +X runs to the frame's left (the layers show the back), its +Z up. */
const PX_PER_MM = LAYOUT.pxPerMetre / 1000;
const CENTRE: Shift = [150, 216];
const STICKER_PIVOT: Shift = [CENTRE[0] - STICKER_HOME.x * PX_PER_MM, CENTRE[1] - STICKER_HOME.z * PX_PER_MM];

/** How far a sticker sits from its home, in frame pixels, how far it is turned (radians,
 *  clockwise on the back) and how much bigger it is than the 24 mm the layers are drawn at. No
 *  sticker is at home. */
function stickerMove(sticker: Sticker | undefined): { shift: Shift; turn: number; scale: number } {
    if (!sticker) return { shift: NO_SHIFT, turn: 0, scale: 1 };
    const p = stickerPlace(sticker);
    return {
        shift: [-(p.x - STICKER_HOME.x) * PX_PER_MM, -(p.z - STICKER_HOME.z) * PX_PER_MM],
        turn: (p.turn * Math.PI) / 180,
        scale: p.size / STICKER_HOME.size,
    };
}

/** The sticker a sticker close-up frames: the top of the stack. */
const topSticker = (design: Design | null): Sticker | undefined => stickersOf(design).slice(-1)[0];

/** A crop as it sits on a body: the close-ups follow the part they frame (a sticker close-up the
 *  top sticker, wherever it was put and grown or shrunk with it), the rest the body. */
function cropOn(crop: PreviewCrop, body: PhoneBody, design: Design | null = null): Box {
    if (crop === 'full') return CROPS.full;
    const base = moved(CROPS[crop], shiftOf(body, crop === 'charm' ? 'charm' : 'part'));
    if (crop !== 'sticker' && crop !== 'badge') return base;
    const { shift, scale } = stickerMove(topSticker(design));
    const [x, y, w, h] = moved(base, shift);
    return [x + (w * (1 - scale)) / 2, y + (h * (1 - scale)) / 2, w * scale, h * scale];
}

/** The picture of a phone's back the sticker editor shows: its width over its height, and how many
 *  of its pixels a millimetre is when it is drawn `width` CSS px wide. */
export const BACK_ASPECT = CROPS.body[2] / CROPS.body[3];
export const backPxPerMm = (width: number) => (width / CROPS.body[2]) * PX_PER_MM;

/** Where a sticker placed at `p` has its centre on the picture of a body's back (the `body` crop),
 *  as fractions of the picture's width and height. */
export function stickerSpot(body: PhoneBody, p: StickerPlace): [number, number] {
    const [bx, by, bw, bh] = cropOn('body', body);
    const part = shiftOf(body, 'part');
    return [(CENTRE[0] + part[0] - p.x * PX_PER_MM - bx) / bw, (CENTRE[1] + part[1] - p.z * PX_PER_MM - by) / bh];
}

/** The placement (mm, unrounded and unclamped) whose sticker centre is at fractions (u, v) of the
 *  picture of a body's back; the inverse of stickerSpot. */
export function stickerAt(body: PhoneBody, u: number, v: number): { x: number; z: number } {
    const [bx, by, bw, bh] = cropOn('body', body);
    const part = shiftOf(body, 'part');
    return { x: (CENTRE[0] + part[0] - (bx + u * bw)) / PX_PER_MM, z: (CENTRE[1] + part[1] - (by + v * bh)) / PX_PER_MM };
}

/** The box around a layer's opaque pixels inside a region of the frame, or null when the region
 *  is empty or the browser will not let the pixels be read. */
function opaqueBounds(img: HTMLImageElement, region: Box): Box | null {
    try {
        const [rx, ry, rw, rh] = region;
        const c = document.createElement('canvas');
        c.width = rw; c.height = rh;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;
        ctx.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh);
        const px = ctx.getImageData(0, 0, rw, rh).data;
        let x0 = rw, y0 = rh, x1 = -1, y1 = -1;
        for (let y = 0; y < rh; y++) {
            for (let x = 0; x < rw; x++) {
                if (px[(y * rw + x) * 4 + 3] <= 12) continue;
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
        return x1 < 0 ? null : [rx + x0, ry + y0, x1 - x0 + 1, y1 - y0 + 1];
    } catch {
        return null;
    }
}

/** How far down the frame each charm layer reaches, measured from its pixels once it loads. */
const reach = new Map<string, number>();

/** The lowest point a charm hangs to in the 300x600 frame, or the longest any charm goes when it
 *  has not loaded yet. */
function charmReach(id: string): number {
    const a = reach.get(`charm_${id}`);
    const b = reach.get(`charm_${id}_metal`);
    return a === undefined && b === undefined ? 590 : Math.max(a ?? 0, b ?? 0);
}

/** The square a sticker fills on the back, grown from the sticker layers as they load; a photo
 *  print is placed in the same spot at the same height. */
let stickerBox: Box = [124, 314, 52, 53];

function growStickerBox(b: Box) {
    const [x, y, w, h] = stickerBox;
    const x0 = Math.min(x, b[0]), y0 = Math.min(y, b[1]);
    stickerBox = [x0, y0, Math.max(x + w, b[0] + b[2]) - x0, Math.max(y + h, b[1] + b[3]) - y0];
}

function measureLayer(stem: string, img: HTMLImageElement) {
    if (stem.startsWith('charm_')) {
        const b = opaqueBounds(img, [100, 400, 200, 200]);
        if (b) reach.set(stem, b[1] + b[3]);
    } else if (stem.startsWith('stk_')) {
        const b = opaqueBounds(img, [80, 270, 140, 140]);
        if (b) growStickerBox(b);
    }
}

/** Gallery photos for photo stickers, by URL: the decoded picture, or null once it failed. They
 *  load without CORS, so they are only ever drawn onto a visible canvas that is never read back. */
const photos = new Map<string, HTMLImageElement | null>();
const photosPending = new Map<string, Promise<void>>();

function loadPhoto(url: string): Promise<void> {
    if (photos.has(url)) return Promise.resolve();
    let p = photosPending.get(url);
    if (!p) {
        p = new Promise<void>(resolve => {
            if (!url) { photos.set(url, null); resolve(); return; }
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => { photos.set(url, img); resolve(); };
            img.onerror = () => { photos.set(url, null); resolve(); };
            img.src = url;
        });
        photosPending.set(url, p);
    }
    return p;
}

type PreviewCrop = keyof typeof CROPS;

/** Where the phone itself sits in the frame, for the placeholder drawn before the layers decode. */
const PHONE_BOX: Box = [50, 14, 200, 398];

const LAYER_URLS: Record<string, string> = (() => {
    const files = import.meta.glob<string>('./assets/*.webp', { eager: true, import: 'default' });
    const out: Record<string, string> = {};
    for (const path in files) out[path.slice(path.lastIndexOf('/') + 1, -'.webp'.length)] = files[path];
    return out;
})();

const loaded = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<void>>();

function loadLayer(stem: string): Promise<void> {
    if (loaded.has(stem)) return Promise.resolve();
    let p = pending.get(stem);
    if (!p) {
        const url = LAYER_URLS[stem];
        p = new Promise<void>(resolve => {
            if (!url) { resolve(); return; }
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => {
                measureLayer(stem, img);
                loaded.set(stem, img);
                resolve();
            };
            img.onerror = () => resolve();
            img.src = url;
        });
        pending.set(stem, p);
    }
    return p;
}

/** Starts decoding every layer, so the option tiles of a step draw at once instead of popping in. */
export function preloadLayers(): void {
    for (const stem in LAYER_URLS) void loadLayer(stem);
}

/** A layer to draw: its picture, the colour it takes, how far it moves on the body shown, and for a
 *  sticker how far it is turned (radians, clockwise) and scaled about its own centre. */
interface Layer { stem: string; tint?: string; photo?: string; shift?: Shift; turn?: number; scale?: number }

/** The picture made for a body or design, else the regular one, so a layer never goes missing. */
const variant = (stem: string, suffix: string) => (suffix && LAYER_URLS[stem + suffix] ? stem + suffix : stem);

function layersOf(design: Design | null, frameHex: string, palette: string[], body: PhoneBody, look: PhoneLook): Layer[] {
    const hex = (row?: number) => palette[row ?? 0] ?? '#ffffff';
    const own = BODY_SUFFIX[body];
    const part = shiftOf(body, 'part');
    const out: Layer[] = [{ stem: variant(variant('phone', own), LOOK_SUFFIX[look]), tint: frameHex }];
    if (!design) return out;
    out.push({ stem: variant(`shell_${design.style}`, own), tint: hex(design.color) });
    if (design.pattern) out.push({ stem: variant(`pat_${design.pattern}`, own), tint: hex(design.patternColor) });
    if (design.accessory) out.push({ stem: `acc_${design.accessory}`, tint: hex(design.accessoryColor), shift: part });
    for (const sticker of stickersOf(design)) {
        const stk = stickerMove(sticker);
        const placed = { shift: plus(part, stk.shift), turn: stk.turn, scale: stk.scale };
        if (sticker.id === PHOTO_STICKER) out.push({ stem: PHOTO_STICKER, photo: design.photo ?? '', ...placed });
        else out.push({ stem: `stk_${sticker.id}`, ...placed });
    }
    if (design.charm) {
        const charm = shiftOf(body, 'charm');
        out.push({ stem: `charm_${design.charm}`, tint: hex(design.charmColor), shift: charm });
        out.push({ stem: `charm_${design.charm}_metal`, shift: charm });
    }
    return out;
}

const layerReady = (l: Layer) => (l.photo !== undefined ? photos.has(l.photo) : loaded.has(l.stem) || !LAYER_URLS[l.stem]);
const layersReady = (layers: Layer[]) => layers.every(layerReady);
const loadAll = (layers: Layer[]) => Promise.all(layers.map(l => (l.photo !== undefined ? loadPhoto(l.photo) : loadLayer(l.stem))));

/** Traces a rounded rectangle without relying on CanvasRenderingContext2D.roundRect. */
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** A photo sticker: a small instant print, white card with the picture inset 7% at the sides
 *  and top and 20% underneath, cropped to fill, sitting where the stickers sit. With no picture
 *  (still loading, or it failed) the card stays blank. */
function drawPrint(ctx: CanvasRenderingContext2D, crop: Box, w: number, img: HTMLImageElement | null, shift: Shift, turn: number, scale: number) {
    const k = w / crop[2];
    const [bx, by, bw, bh] = moved(stickerBox, shift);
    const cardH = bh * k * scale;
    const cardW = cardH / 1.13;
    ctx.save();
    ctx.translate((bx + bw / 2 - crop[0]) * k, (by + bh / 2 - crop[1]) * k);
    ctx.rotate(turn - 0.06);
    ctx.shadowColor = 'rgba(0,0,0,0.30)';
    ctx.shadowBlur = 2.5 * k;
    ctx.shadowOffsetY = 0.8 * k;
    ctx.fillStyle = '#fbfaf6';
    roundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 1.4 * k);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    const side = cardW * 0.07;
    const px = -cardW / 2 + side;
    const py = -cardH / 2 + side;
    const pw = cardW - side * 2;
    const ph = cardH - side - cardW * 0.2;
    if (img && img.naturalWidth && img.naturalHeight) {
        const want = pw / ph;
        const have = img.naturalWidth / img.naturalHeight;
        const sw = have > want ? img.naturalHeight * want : img.naturalWidth;
        const sh = have > want ? img.naturalHeight : img.naturalWidth / want;
        ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, px, py, pw, ph);
    }
    ctx.restore();
}

let scratch: HTMLCanvasElement | null = null;

/** Colours a greyscale layer: multiply the tint over it, then cut the result back to the layer's
 *  own alpha so the fill does not spill outside the shape. */
function tinted(img: HTMLImageElement, crop: Box, w: number, h: number, hex: string): HTMLCanvasElement {
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width < w || scratch.height < h) { scratch.width = Math.max(scratch.width, w); scratch.height = Math.max(scratch.height, h); }
    const ctx = scratch.getContext('2d')!;
    const [sx, sy, sw, sh] = crop;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    return scratch;
}

function draw(canvas: HTMLCanvasElement, layers: Layer[], crop: Box, w: number, h: number) {
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    for (const layer of layers) {
        const shift = layer.shift ?? NO_SHIFT;
        const turn = layer.turn ?? 0;
        const scale = layer.scale ?? 1;
        if (layer.photo !== undefined) {
            drawPrint(ctx, crop, w, photos.get(layer.photo) ?? null, shift, turn, scale);
            continue;
        }
        const img = loaded.get(layer.stem);
        if (!img) continue;
        if (turn || scale !== 1) {      // a placed sticker: the layer turned and scaled about its home centre, then moved
            const k = w / crop[2];
            ctx.save();
            ctx.setTransform(k, 0, 0, k, -crop[0] * k, -crop[1] * k);
            ctx.translate(STICKER_PIVOT[0] + shift[0], STICKER_PIVOT[1] + shift[1]);
            ctx.rotate(turn);
            ctx.scale(scale, scale);
            ctx.translate(-STICKER_PIVOT[0], -STICKER_PIVOT[1]);
            ctx.drawImage(img, 0, 0);
            ctx.restore();
            continue;
        }
        const src = moved(crop, [-shift[0], -shift[1]]);
        if (layer.tint) ctx.drawImage(tinted(img, src, w, h, layer.tint), 0, 0, w, h, 0, 0, w, h);
        else ctx.drawImage(img, src[0], src[1], src[2], src[3], 0, 0, w, h);
    }
}

/** Device pixels per CSS pixel where the canvas sits: the screen's own ratio times the zoom the
 *  shell draws the phone (or a zoomed panel, `data-ui-zoom`) at, so a picture scaled up to fill a
 *  big window still comes out sharp. */
function pixelScale(el: HTMLElement): number {
    const screen = el.closest<HTMLElement>('[data-phone-screen], [data-ui-zoom]');
    const zoom = screen && screen.offsetWidth ? screen.getBoundingClientRect().width / screen.offsetWidth : 1;
    return (window.devicePixelRatio || 1) * (zoom > 0 ? zoom : 1);
}

function placeholderStyle(crop: Box, body: PhoneBody): CSSProperties | null {
    const [cx, cy, cw, ch] = crop;
    const [px, py, pw, ph] = moved(PHONE_BOX, shiftOf(body, 'part'));
    const l = Math.max(px, cx), t = Math.max(py, cy);
    const r = Math.min(px + pw, cx + cw), b = Math.min(py + ph, cy + ch);
    if (r <= l || b <= t) return null;
    return {
        left: `${((l - cx) / cw) * 100}%`, top: `${((t - cy) / ch) * 100}%`,
        width: `${((r - l) / cw) * 100}%`, height: `${((b - t) / ch) * 100}%`,
        borderRadius: `${(30 / cw) * 100}% / ${(30 / ch) * 100}%`,
    };
}

interface Props {
    design:     Design | null;
    frameHex:   string;
    palette:    string[];
    /** The phone the case is for; the regular classic phone when not given. */
    body?:      PhoneBody;
    look?:      PhoneLook;
    /** Width in CSS px; the height follows the crop's shape. */
    size:       number;
    crop?:      PreviewCrop;
    /** Extra resolution for a canvas that is shown scaled up, as the stage does when it zooms in. */
    detail?:    number;
    className?: string;
}

/** Composites the layers of a design onto a canvas, in prop order: phone, shell, pattern,
 *  accessory, sticker, charm. Redraws key off the design's parts rather than its identity, so a
 *  fresh object with the same parts costs nothing. Until the layers have decoded it shows a soft
 *  placeholder where the phone will be, and the picture fades in over it. */
function CasePreviewImpl({ design, frameHex, palette, body = 'plain', look = 'classic', size, crop = 'full', detail = 1, className = '' }: Props) {
    const ref = useRef<HTMLCanvasElement>(null);
    const box = cropOn(crop, body, design);
    const cssH = Math.round(size * (box[3] / box[2]));
    const key = designKey(design);
    const [ready, setReady] = useState(() => layersReady(layersOf(design, frameHex, palette, body, look)));

    useLayoutEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const k = Math.min(3, pixelScale(canvas) * detail);
        const w = Math.round(size * k);
        const h = Math.round(cssH * k);
        const layers = layersOf(design, frameHex, palette, body, look);
        if (layersReady(layers)) {
            draw(canvas, layers, box, w, h);
            setReady(true);
            return;
        }
        let live = true;
        void loadAll(layers).then(() => {
            if (!live) return;
            draw(canvas, layers, box, w, h);
            setReady(true);
        });
        return () => { live = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, frameHex, palette, body, look, size, cssH, crop, detail]);

    const hold = ready ? null : placeholderStyle(box, body);
    return (
        <span className="relative block shrink-0" style={{ width: size, height: cssH }}>
            {hold && <span aria-hidden className="absolute animate-pulse bg-black/[0.07] dark:bg-white/[0.08]" style={hold} />}
            <canvas
                ref={ref}
                aria-hidden
                className={`absolute inset-0 transition-opacity duration-200 ${className}`}
                style={{ width: size, height: cssH, opacity: ready ? 1 : 0 }}
            />
        </span>
    );
}

export const CasePreview = memo(CasePreviewImpl, (a, b) =>
    designKey(a.design) === designKey(b.design)
    && a.frameHex === b.frameHex
    && a.palette === b.palette
    && a.body === b.body
    && a.look === b.look
    && a.size === b.size
    && a.crop === b.crop
    && a.detail === b.detail
    && a.className === b.className);

export type Framing = 'body' | 'accessory' | 'sticker' | 'charm' | 'whole';

/** What a framing fits into view, and where it centres. Close-ups centre on the part they are
 *  about. The charm framing always leaves room for the longest charm, so picking one does not
 *  zoom, but centres on what actually hangs there; the whole framing fits exactly what is there.
 *  The numbers are the regular body's; on another body the view follows its parts. */
function framingOf(framing: Framing, design: Design | null, body: PhoneBody): { fit: Box; cx: number; cy: number } {
    const [dx, dy] = shiftOf(body, framing === 'charm' ? 'charm' : 'part');
    const low = design?.charm ? charmReach(design.charm) + shiftOf(body, 'charm')[1] : 412;
    const cy = (14 + low) / 2;
    switch (framing) {
        case 'accessory': return { fit: [45, 118, 210, 254], cx: 150 + dx, cy: 245 + dy };
        case 'sticker': {
            const [sx, sy] = stickerMove(topSticker(design)).shift;
            return { fit: [55, 232, 190, 214], cx: 150 + dx + sx, cy: 339 + dy + sy };
        }
        case 'charm':     return { fit: [0, 4, 300, 592], cx: 150 + dx, cy };
        case 'whole':     return { fit: [18, 2, 264, Math.max(424, low + 12)], cx: 150 + dx, cy };
        default:          return { fit: [38, 6, 224, 420], cx: 150 + dx, cy: 216 + dy };
    }
}

/** The scale a framing shows the 300x600 frame at inside a box, never above `maxScale`. */
export function framingScale(framing: Framing, design: Design | null, boxW: number, boxH: number, maxScale: number, body: PhoneBody = 'plain'): number {
    const { fit } = framingOf(framing, design, body);
    return Math.min(boxW / fit[2], boxH / fit[3], maxScale);
}

/** The whole layer frame on one canvas, moved and scaled with a CSS transform so the view can
 *  glide between framings without redrawing. The box it frames into is `boxW` x `boxH` CSS px at
 *  `boxTop` inside a positioned, clipping parent; a soft contact shadow sits under the phone. */
export function FramedPreview({ design, frameHex, palette, body = 'plain', look = 'classic', framing, boxW, boxH, boxTop = 0, maxScale = 3, detail, still = false }: {
    design:    Design | null;
    frameHex:  string;
    palette:   string[];
    body?:     PhoneBody;
    look?:     PhoneLook;
    framing:   Framing;
    boxW:      number;
    boxH:      number;
    boxTop?:   number;
    maxScale?: number;
    /** Canvas resolution as a multiple of the 300x600 frame; match the largest scale shown. */
    detail:    number;
    still?:    boolean;
}) {
    const { cx, cy } = framingOf(framing, design, body);
    const shadowX = 62 + shiftOf(body, 'part')[0];
    const s = framingScale(framing, design, boxW, boxH, maxScale);
    const tx = boxW / 2 - cx * s;
    const ty = boxTop + boxH / 2 - cy * s;
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 origin-top-left"
            style={{
                width: SRC_W,
                height: SRC_H,
                transform: `translate(${tx}px, ${ty}px) scale(${s})`,
                transition: still ? undefined : 'transform 420ms cubic-bezier(0.32,0.72,0,1)',
                willChange: still ? undefined : 'transform',
            }}
        >
            <div
                className="absolute rounded-[50%] opacity-80 dark:opacity-100"
                style={{ left: shadowX, top: 398, width: 176, height: 34, background: 'radial-gradient(closest-side, rgba(0,0,0,0.30), rgba(0,0,0,0.12) 55%, transparent)' }}
            />
            <CasePreview
                design={design}
                frameHex={frameHex}
                palette={palette}
                body={body}
                look={look}
                size={SRC_W}
                detail={detail}
                className="drop-shadow-[0_6px_10px_rgba(0,0,0,0.20)]"
            />
        </div>
    );
}
