import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { BringToFront, Check, Minus, Move, Plus, RotateCcw, RotateCw, Trash2, X } from 'lucide-react';

import { t } from '@/i18n';
import { trackFraction, trackFractionY } from '@/lib/zoom';
import { BACK_ASPECT, backPxPerMm, CasePreview, stickerAt, stickerSpot } from './CasePreview';
import {
    atHome, MAX_STICKERS, nearestSize, placedSticker, STICKER_HOME, STICKER_SIZES, stickerPlace, stickersOf,
    type Design, type PhoneBody, type PhoneLook, type Sticker, type StickerPlace,
} from './casesApi';
import { partLabels, stickerName } from './labels';
import { BUY_BG } from './ui';

const ACCENT = '#F5A524';
const TURN_STEP = 5;

type Grip = 'move' | 'size' | 'turn';

/** The first-time hint shows until the player first takes hold of a sticker, once per session. */
const hint = { seen: false };

/** An angle brought into -180..180. */
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/** The next allowed size up (1) or down (-1). */
function stepSize(size: number, dir: 1 | -1): number {
    const i = STICKER_SIZES.indexOf(nearestSize(size) as (typeof STICKER_SIZES)[number]);
    return STICKER_SIZES[Math.max(0, Math.min(STICKER_SIZES.length - 1, i + dir))];
}

const same = (a: StickerPlace, b: StickerPlace) => a.x === b.x && a.z === b.z && a.turn === b.turn && a.size === b.size;

/** A well behind a picture of the phone, lighter than the panel so dark cases still read. */
function Well({ className = '', children }: { className?: string; children?: ReactNode }) {
    return (
        <div className={`relative overflow-hidden rounded-[16px] ${className}`} style={{ background: 'rgb(var(--well, var(--surface)))' }}>
            <span aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_40%,rgba(255,255,255,0.08),rgba(255,255,255,0)_75%)]" />
            {children}
        </div>
    );
}

const ICON_BTN = 'flex h-[32px] w-[32px] items-center justify-center rounded-[9px] bg-white/[0.07] text-white/80 transition-[transform,opacity] duration-150 hover:text-white active:scale-90 disabled:opacity-35';

function Stepper({ value, less, more, lessLabel, moreLabel, onLess, onMore }: {
    value: string; less: ReactNode; more: ReactNode; lessLabel: string; moreLabel: string; onLess: () => void; onMore: () => void;
}) {
    return (
        <div className="flex min-w-0 items-center gap-1.5">
            <button type="button" aria-label={lessLabel} title={lessLabel} onClick={onLess} className={ICON_BTN}>{less}</button>
            <span className="min-w-[50px] text-center text-[14px] font-semibold tabular-nums">{value}</span>
            <button type="button" aria-label={moreLabel} title={moreLabel} onClick={onMore} className={ICON_BTN}>{more}</button>
        </div>
    );
}

/** The design with only one sticker, at home, for a sticker's own little picture. */
const alone = (design: Design, id: string): Design => ({ style: design.style, color: design.color, stickers: [{ id }], photo: design.photo });

/** "On this case": the stickers on the back in stack order (the bottom first), each a chip with its
 *  picture and name and a remove button, the selected one ringed. A chip, or Adjust, opens the
 *  editor on that sticker. */
export function StickersStrip({ design, frameHex, palette, body, look, selected, onOpen, onRemove }: {
    design:   Design;
    frameHex: string;
    palette:  string[];
    body:     PhoneBody;
    look:     PhoneLook;
    selected: number;
    onOpen:   (index: number) => void;
    onRemove: (index: number) => void;
}) {
    const labels = partLabels();
    const list = stickersOf(design);
    return (
        <div className="mb-3 rounded-[16px] bg-surface px-2 pb-2 pt-1.5 ring-1 ring-white/[0.06]">
            <div className="flex h-[32px] items-center gap-2 ps-1.5">
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                    {t('cases.onThisCase', 'On this case')}
                    <span className="ms-1.5 font-normal tabular-nums text-ios-gray">{t('cases.stickerTally', '{n} of {max}', { n: list.length, max: MAX_STICKERS })}</span>
                </span>
                <button
                    type="button"
                    onClick={() => onOpen(selected)}
                    className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] px-3 text-[13.5px] font-semibold transition-[transform,background-color] duration-150 hover:bg-white/[0.12] active:scale-95"
                >
                    <Move className="h-[15px] w-[15px] text-[#F5A524]" strokeWidth={2.4} />
                    {t('cases.adjust', 'Adjust')}
                </button>
            </div>
            <div className="-mx-[3px] mt-1 flex gap-1.5 overflow-x-auto no-scrollbar p-[3px]">
                {list.map((s, i) => (
                    <div
                        key={`${i}:${s.id}`}
                        className={`flex h-[36px] shrink-0 items-center rounded-[10px] bg-white/[0.06] transition-shadow duration-150 ${i === selected ? 'shadow-[0_0_0_1.5px_#F59E0B]' : ''}`}
                    >
                        <button type="button" onClick={() => onOpen(i)} className="flex h-full min-w-0 items-center gap-1.5 ps-1 pe-1.5">
                            <span className="relative block h-[28px] w-[28px] shrink-0 overflow-hidden rounded-[7px]">
                                <CasePreview design={alone(design, s.id)} frameHex={frameHex} palette={palette} body={body} look={look} size={28} crop="sticker" />
                            </span>
                            <span className="max-w-[96px] truncate text-[13px] font-medium">{stickerName(labels, s.id)}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onRemove(i)}
                            aria-label={t('cases.removeSticker', 'Remove {name}', { name: stickerName(labels, s.id) })}
                            title={t('cases.removeSticker', 'Remove {name}', { name: stickerName(labels, s.id) })}
                            className="me-1 flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-white/50 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white"
                        >
                            <X className="h-[14px] w-[14px]" strokeWidth={2.6} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Places the stickers like a small image editor, on a picture of the back of the phone being
 *  customised. Every sticker can be grabbed and dragged (grabbing one selects it; clicking the bare
 *  back keeps the selection); the selected one has the box, with a corner handle that resizes it
 *  through the sizes the game has and a handle above it that turns it in 5 degree steps. The wheel
 *  resizes the selected one, Shift (or Alt) and the wheel turn it; the arrow keys nudge it, + and -
 *  resize, [ and ] turn, Delete removes it. The rows underneath say which one is selected and do
 *  the same with buttons, plus bring to front. `onStickers` gets each new list, already snapped as
 *  the server will; `onAim` asks the game camera onto the stickers when the player takes hold. */
export function StickerEditor({ design, frameHex, palette, body, look, selected, onSelect, onStickers, onAim, onDone }: {
    design:     Design;
    frameHex:   string;
    palette:    string[];
    body:       PhoneBody;
    look:       PhoneLook;
    selected:   number;
    onSelect:   (index: number) => void;
    onStickers: (list: Sticker[]) => void;
    onAim:      () => void;
    onDone:     () => void;
}) {
    const labels = partLabels();
    const list = stickersOf(design);
    const sel = Math.max(0, Math.min(selected, list.length - 1));
    const places = list.map(s => stickerPlace(s));
    const place = places[sel] ?? STICKER_HOME;
    const boxRef = useRef<HTMLDivElement>(null);
    const padRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const [grip, setGrip] = useState<Grip | null>(null);
    const [hover, setHover] = useState(-1);
    const [showHint, setShowHint] = useState(!hint.seen);
    const drag = useRef<{ id: number; grip: Grip; index: number; dx: number; dy: number } | null>(null);
    const live = useRef({ list, sel, onStickers });
    live.current = { list, sel, onStickers };

    useLayoutEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const fit = () => {
            const h = Math.min(el.clientHeight - 16, (el.clientWidth - 16) / BACK_ASPECT);
            setWidth(Math.max(0, Math.floor(h * BACK_ASPECT)));
        };
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const W = width;
    const H = Math.round(W / BACK_ASPECT);
    const mm = backPxPerMm(W);
    const spot = (p: StickerPlace): [number, number] => {
        const [u, v] = stickerSpot(body, p);
        return [u * W, v * H];
    };

    /** Puts sticker `index` at `p`, when that changes anything once snapped. */
    function put(index: number, p: StickerPlace) {
        const { list: cur, onStickers: change } = live.current;
        const old = cur[index];
        if (!old) return;
        const next = placedSticker(old.id, p);
        if (same(stickerPlace(next), stickerPlace(old))) return;
        change(cur.map((s, i) => (i === index ? next : s)));
    }
    const putRef = useRef(put);
    putRef.current = put;

    function remove(index: number) {
        const { list: cur, onStickers: change } = live.current;
        change(cur.filter((_, i) => i !== index));
        onSelect(Math.max(0, index - 1));
    }

    function toFront(index: number) {
        const { list: cur, onStickers: change } = live.current;
        if (index >= cur.length - 1) return;
        change([...cur.filter((_, i) => i !== index), cur[index]]);
        onSelect(cur.length - 1);
    }

    function hideHint() {
        hint.seen = true;
        setShowHint(false);
    }

    useEffect(() => {
        const el = padRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            const delta = e.deltaY || e.deltaX;
            const { list: cur, sel: i } = live.current;
            if (!delta || !cur[i]) return;
            e.preventDefault();
            const p = stickerPlace(cur[i]);
            if (e.shiftKey || e.altKey) putRef.current(i, { ...p, turn: wrap(p.turn + Math.sign(delta) * TURN_STEP) });
            else putRef.current(i, { ...p, size: stepSize(p.size, delta < 0 ? 1 : -1) });
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [W]);

    function pointer(e: ReactPointerEvent): [number, number] | null {
        const el = padRef.current;
        if (!el || W <= 0) return null;
        const fx = trackFraction(el, e.clientX);
        const fy = trackFractionY(el, e.clientY);
        return fx === null || fy === null ? null : [fx * W, fy * H];
    }

    /** The top sticker under a point of the pad (in its own turned square), or -1. */
    function stickerUnder([px, py]: [number, number]): number {
        for (let i = places.length - 1; i >= 0; i--) {
            const p = places[i];
            const [cx, cy] = spot(p);
            const a = (-p.turn * Math.PI) / 180;
            const rx = (px - cx) * Math.cos(a) - (py - cy) * Math.sin(a);
            const ry = (px - cx) * Math.sin(a) + (py - cy) * Math.cos(a);
            const half = (p.size * mm) / 2 + 2;
            if (Math.abs(rx) <= half && Math.abs(ry) <= half) return i;
        }
        return -1;
    }

    function follow(at: [number, number]) {
        const d = drag.current;
        const cur = live.current.list[d?.index ?? -1];
        if (!d || !cur) return;
        const p = stickerPlace(cur);
        if (d.grip === 'move') {
            const to = stickerAt(body, (at[0] + d.dx) / W, (at[1] + d.dy) / H);
            put(d.index, { ...p, x: to.x, z: to.z });
            return;
        }
        const [ox, oy] = spot(p);
        if (d.grip === 'size') put(d.index, { ...p, size: nearestSize((Math.hypot(at[0] - ox, at[1] - oy) * Math.SQRT2) / mm) });
        else put(d.index, { ...p, turn: wrap((Math.atan2(at[1] - oy, at[0] - ox) * 180) / Math.PI + 90) });
    }

    function onDown(e: ReactPointerEvent<HTMLDivElement>) {
        if (e.button !== 0) return;
        const at = pointer(e);
        if (!at) return;
        const handle = (e.target as HTMLElement).closest<HTMLElement>('[data-grip]')?.dataset.grip;
        e.currentTarget.focus();
        let grab: Grip;
        let index = sel;
        let dx = 0, dy = 0;
        if (handle === 'size' || handle === 'turn') {
            grab = handle;
        } else {
            index = stickerUnder(at);
            if (index < 0) return;
            grab = 'move';
            const [cx, cy] = spot(places[index]);
            dx = cx - at[0];
            dy = cy - at[1];
            if (index !== sel) onSelect(index);
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { id: e.pointerId, grip: grab, index, dx, dy };
        setGrip(grab);
        hideHint();
        onAim();
    }

    function onMove(e: ReactPointerEvent<HTMLDivElement>) {
        const at = pointer(e);
        if (!at) return;
        if (drag.current?.id === e.pointerId) follow(at);
        else setHover(stickerUnder(at));
    }

    function onUp(e: ReactPointerEvent<HTMLDivElement>) {
        if (drag.current?.id !== e.pointerId) return;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
        drag.current = null;
        setGrip(null);
    }

    function onKey(e: ReactKeyboardEvent<HTMLDivElement>) {
        if (!list[sel]) return;
        const step = e.shiftKey ? 2.5 : 0.5;
        const nudge: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
        if (nudge[e.key]) put(sel, { ...place, x: place.x + nudge[e.key][0], z: place.z + nudge[e.key][1] });
        else if (e.key === '+' || e.key === '=') put(sel, { ...place, size: stepSize(place.size, 1) });
        else if (e.key === '-' || e.key === '_') put(sel, { ...place, size: stepSize(place.size, -1) });
        else if (e.key === '[' || e.key === ']') put(sel, { ...place, turn: wrap(place.turn + (e.key === ']' ? TURN_STEP : -TURN_STEP)) });
        else if (e.key === 'Delete' || e.key === 'Backspace') remove(sel);
        else return;
        e.preventDefault();
        e.stopPropagation();
        onAim();
    }

    const box = (p: StickerPlace) => {
        const [cx, cy] = spot(p);
        const side = p.size * mm;
        return { left: cx - side / 2, top: cy - side / 2, width: side, height: side, transform: `rotate(${p.turn}deg)` };
    };
    const readout = grip === 'size' ? `${place.size} mm` : grip === 'turn' ? `${place.turn}°` : null;
    const cursor = grip ? 'grabbing' : hover >= 0 ? 'grab' : 'default';
    const name = list[sel] ? stickerName(labels, list[sel].id) : '';

    return (
        <div className="relative mt-3 flex min-h-0 flex-1 flex-col rounded-[14px] bg-base px-3 pb-3 pt-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
            <div className="flex h-[44px] shrink-0 items-center gap-3 px-1">
                <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold">{t('cases.placeTitleMany', 'Place your stickers')}</span>
                <button
                    type="button"
                    onClick={onDone}
                    className="flex h-[32px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold text-[#2b1703] transition-transform duration-150 active:scale-95"
                    style={{ background: BUY_BG }}
                >
                    <Check className="h-[15px] w-[15px]" strokeWidth={3} />
                    {t('cases.placeDone', 'Done')}
                </button>
            </div>

            <div ref={boxRef} className="relative flex min-h-0 flex-1 items-center justify-center">
                <Well className="absolute inset-0" />
                {W > 0 && (
                    <div
                        ref={padRef}
                        tabIndex={0}
                        role="application"
                        aria-label={t('cases.placePadMany', 'Sticker placement: drag a sticker to move it; arrow keys move the selected one, plus and minus resize it, brackets turn it, Delete removes it')}
                        className="relative touch-none rounded-[10px] outline-none focus-visible:shadow-[0_0_0_1px_rgba(255,255,255,0.22)]"
                        style={{ width: W, height: H, cursor }}
                        onPointerDown={onDown}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                        onPointerLeave={() => setHover(-1)}
                        onKeyDown={onKey}
                    >
                        <CasePreview design={design} frameHex={frameHex} palette={palette} body={body} look={look} size={W} crop="body" />
                        {hover >= 0 && hover !== sel && places[hover] && (
                            <span aria-hidden className="pointer-events-none absolute rounded-[3px] shadow-[0_0_0_1px_rgba(255,255,255,0.55)]" style={box(places[hover])} />
                        )}
                        {list[sel] && (
                            <div aria-hidden className="pointer-events-none absolute" style={box(place)}>
                                <span className="absolute -inset-[3px] rounded-[3px]" style={{ boxShadow: `0 0 0 1.5px ${ACCENT}, 0 0 0 3px rgba(0,0,0,0.35)` }} />
                                <span className="absolute bottom-full left-1/2 mb-[3px] h-[14px] w-[1.5px] -translate-x-1/2" style={{ background: ACCENT }} />
                                <span
                                    data-grip="turn"
                                    className="pointer-events-auto absolute bottom-full left-1/2 mb-[15px] h-[14px] w-[14px] -translate-x-1/2 cursor-grab rounded-full bg-white"
                                    style={{ boxShadow: `0 0 0 1.5px ${ACCENT}, 0 1px 4px rgba(0,0,0,0.5)` }}
                                />
                                <span
                                    data-grip="size"
                                    className="pointer-events-auto absolute -bottom-[9px] -end-[9px] h-[12px] w-[12px] cursor-nwse-resize rounded-[3px] bg-white"
                                    style={{ boxShadow: `0 0 0 1.5px ${ACCENT}, 0 1px 4px rgba(0,0,0,0.5)` }}
                                />
                            </div>
                        )}
                        {readout && (
                            <span className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-full bg-black/75 px-2.5 py-1 text-[12.5px] font-semibold tabular-nums text-white">
                                {readout}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {showHint && (
                <p className="shrink-0 px-1 pt-2 text-center text-[12.5px] leading-snug text-ios-gray">
                    {t('cases.placeHint', 'Drag to move. Corner to resize. Top handle to turn.')}
                </p>
            )}

            <div className="mt-2.5 flex shrink-0 items-center gap-2 px-1">
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                    {name}
                    <span className="ms-1.5 font-normal tabular-nums text-ios-gray">
                        · {t('cases.stickerOf', '{n} of {count}', { n: sel + 1, count: list.length })}
                    </span>
                </span>
                <button
                    type="button"
                    onClick={() => toFront(sel)}
                    disabled={sel >= list.length - 1}
                    aria-label={t('cases.bringToFront', 'Bring to front')}
                    title={t('cases.bringToFront', 'Bring to front')}
                    className={ICON_BTN}
                >
                    <BringToFront className="h-[16px] w-[16px]" strokeWidth={2.2} />
                </button>
                <button
                    type="button"
                    onClick={() => remove(sel)}
                    aria-label={t('cases.removeSticker', 'Remove {name}', { name })}
                    title={t('cases.removeSticker', 'Remove {name}', { name })}
                    className={`${ICON_BTN} hover:!text-ios-red`}
                >
                    <Trash2 className="h-[16px] w-[16px]" strokeWidth={2.2} />
                </button>
            </div>

            <div className="mt-2 flex shrink-0 items-center justify-between gap-2 px-1">
                <Stepper
                    value={`${place.size} mm`}
                    less={<Minus className="h-[15px] w-[15px]" strokeWidth={2.6} />}
                    more={<Plus className="h-[15px] w-[15px]" strokeWidth={2.6} />}
                    lessLabel={t('cases.stickerSmaller', 'Smaller')}
                    moreLabel={t('cases.stickerBigger', 'Bigger')}
                    onLess={() => put(sel, { ...place, size: stepSize(place.size, -1) })}
                    onMore={() => put(sel, { ...place, size: stepSize(place.size, 1) })}
                />
                <Stepper
                    value={`${place.turn}°`}
                    less={<RotateCcw className="h-[15px] w-[15px]" strokeWidth={2.4} />}
                    more={<RotateCw className="h-[15px] w-[15px]" strokeWidth={2.4} />}
                    lessLabel={t('cases.turnLeft', 'Turn left')}
                    moreLabel={t('cases.turnRight', 'Turn right')}
                    onLess={() => put(sel, { ...place, turn: wrap(place.turn - TURN_STEP) })}
                    onMore={() => put(sel, { ...place, turn: wrap(place.turn + TURN_STEP) })}
                />
                <button
                    type="button"
                    disabled={atHome(place)}
                    onClick={() => put(sel, STICKER_HOME)}
                    className="h-[32px] shrink-0 rounded-[9px] bg-white/[0.07] px-3 text-[13.5px] font-semibold text-white/80 transition-[transform,opacity] duration-150 hover:text-white active:scale-95 disabled:opacity-35"
                >
                    {t('cases.placeReset', 'Reset')}
                </button>
            </div>
        </div>
    );
}
