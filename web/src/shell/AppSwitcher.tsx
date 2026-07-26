import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { AppIconSVG } from './AppIconSVG';
import { AppBadge } from './AppBadge';
import { registerCardStage } from './appDeckBridge';
import { useBadges } from '@/stores/badgeStore';
import type { AppDef } from '@/core/types';
import { t } from '@/i18n';

const SW         = 440;
const SH         = 956;
const SR         = 49;
const CARD_W     = 362;
const CARD_H     = Math.round(SH * CARD_W / SW);
const SCALE      = CARD_W / SW;
const CARD_STEP  = Math.round(CARD_W * 0.74);   // overlap so the focused card sits forward
const CENTER     = (SW - CARD_W) / 2;
const FLICK_VX   = 0.35;               // px/ms - a quick flick pages even on a short drag
const HEADER_H   = 42;
const HEADER_TOP = 46;
const CARD_TOP   = HEADER_TOP + HEADER_H + 8;
const EJECT_MS   = 260;

const SNAP_TRANSITION  = 'transform 0.5s cubic-bezier(0.32,0.72,0,1), filter 0.4s ease';
const EJECT_TRANSITION = `transform ${EJECT_MS / 1000}s cubic-bezier(0.5,0,0.8,0.45), opacity ${EJECT_MS / 1000}s ease-in`;

const ICON_NATIVE = 60;
const ICON_DISP   = 36;
const ICON_SCALE  = ICON_DISP / ICON_NATIVE;

// Resting/drag pose of a card. `d` is the signed distance from the centre in card
// units (shifts continuously while dragging): centre card 100%, then the iOS depth
// ladder 96%, 92%... with spacing compressing as cards recede (parallax).
function cardPose(idx: number, focused: number, dragPx: number) {
    const d    = (idx - focused) + dragPx / CARD_STEP;
    const ad   = Math.abs(d);
    const disp = d * (1 - Math.min(ad, 2.5) * 0.055);
    return {
        tx:     CENTER + disp * CARD_STEP,
        scale:  Math.max(0.86, 1 - Math.min(ad, 3) * 0.04),
        bright: Math.max(0.55, 1 - Math.min(ad, 1.6) * 0.3),
        z:      Math.round(120 - Math.min(ad, 4) * 25),
    };
}

interface Props {
    apps:        AppDef[];
    recents:     string[];
    closing:     boolean;
    onDone:      () => void;
    onReady:     () => void;
    onOpen:      (id: string, origin: { x: number; y: number }) => void;
    onRemove:    (id: string) => void;
    onRemoveAll: () => void;
    onDismiss:   () => void;
}

// The live app view inside each card is NOT rendered here - a card renders only its
// chrome (label, close button, rounded frame) plus an empty <CardStage/> whose DOM
// node the AppDeck re-parents the single live app instance into. Non-preview apps
// (and any card the deck chooses not to fill) keep showing the icon fallback beneath.
function CardStage({ appId }: { appId: string }) {
    const ref = useRef<HTMLDivElement>(null);
    // Layout effect, NOT a passive one: the stage must be registered (and the deck's
    // re-parent pass run) BEFORE the first paint, otherwise the focused card paints one
    // frame of icon fallback before the live app view arrives - a visible blink right
    // at the start of the open-switcher transition.
    useLayoutEffect(() => {
        registerCardStage(appId, ref.current);
        return () => registerCardStage(appId, null);
    }, [appId]);
    return (
        <div
            ref={ref}
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: SW, height: SH, transform: `scale(${SCALE})`, transformOrigin: 'top left' }}
        />
    );
}

export function AppSwitcher({
    apps, recents, closing, onDone, onReady, onOpen, onRemove, onRemoveAll, onDismiss,
}: Props) {
    const badges = useBadges();
    const [focusedIdx, setFocusedIdx] = useState(0);
    const [ejectingId, setEjectingId] = useState<string | null>(null);

    const isDraggingRef   = useRef(false);
    const startXRef       = useRef(0);
    const startYRef       = useRef(0);
    const capturedRef     = useRef(false);
    const axisRef         = useRef<'h' | 'v' | null>(null);
    const suppressClick   = useRef(false);
    const lastWheelRef    = useRef(0);
    const dragXRef        = useRef(0);
    const swipeUpYRef     = useRef(0);
    const swipeDragIdx    = useRef(-1);
    const suppressMount  = useRef(true);
    const focusedRef     = useRef(focusedIdx);
    focusedRef.current   = focusedIdx;
    const lastXRef       = useRef(0);   // last pointer x + time, for release velocity
    const lastTRef       = useRef(0);
    const vxRef          = useRef(0);   // px/ms
    // Direct handles to the positioned card wrappers. While a drag is live the cards
    // are moved by writing transforms straight to the DOM (compositor-only work) - NO
    // React state per pointer move. Re-rendering the whole card list (SVG icons and
    // all) on every move plus per-frame brightness repaints is what made dragging lag.
    const cardEls        = useRef<Map<string, HTMLDivElement>>(new Map());
    const recentsRef     = useRef(recents);
    recentsRef.current   = recents;

    // Card entrances only play on the switcher's OWN entrance; afterwards the same
    // wrappers must stay static or every recents reshuffle would replay the cascade.
    const [entered, setEntered] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setEntered(true), 700);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => { suppressMount.current = false; }, 200);
        return () => clearTimeout(t);
    }, []);

    // A removal can leave the focus index past the last card - snap it back in range.
    useEffect(() => {
        setFocusedIdx(f => Math.min(f, Math.max(0, recents.length - 1)));
    }, [recents.length]);

    // iOS: opening the switcher with nothing running just shows the blurred, dimmed
    // depth layer for a beat and then settles back to the home screen on its own.
    // Also covers ejecting the last remaining card while the switcher is up.
    useEffect(() => {
        if (recents.length > 0 || closing) return;
        const t = setTimeout(onDismiss, 500);
        return () => clearTimeout(t);
    }, [recents.length, closing, onDismiss]);

    function ejectCard(id: string) {
        if (ejectingId) return;
        setEjectingId(id);
        setTimeout(() => {
            onRemove(id);
            setEjectingId(null);
        }, EJECT_MS);
    }

    // ---- imperative drag styling (no React renders while the finger is down) ----

    function poseTransform(idx: number, focused: number, dragPx: number, ty = 0, extraScale = 1) {
        const p = cardPose(idx, focused, dragPx);
        return { p, css: `translateX(${p.tx}px) translateY(${ty}px) scale(${p.scale * extraScale})` };
    }

    function applyHDrag() {
        const list = recentsRef.current;
        for (let idx = 0; idx < list.length; idx++) {
            const el = cardEls.current.get(list[idx]);
            if (!el) continue;
            const { p, css } = poseTransform(idx, focusedRef.current, dragXRef.current);
            el.style.transition = 'none';
            el.style.transform  = css;
            el.style.zIndex     = String(p.z);
        }
    }

    function applyVDrag(y: number) {
        const id = recentsRef.current[swipeDragIdx.current];
        const el = id ? cardEls.current.get(id) : null;
        if (!el) return;
        const upScale = Math.max(0.92, 1 + y / 3000);
        const { css } = poseTransform(swipeDragIdx.current, focusedRef.current, 0, y, upScale);
        el.style.transition = 'none';
        el.style.transform  = css;
        el.style.opacity    = String(Math.max(0.15, 1 + y / 160));
    }

    /** Spring every card to its resting pose for the given focus index. Values match
        the render formula exactly, so React's next render changes nothing visually. */
    function springTo(focused: number) {
        const list = recentsRef.current;
        for (let idx = 0; idx < list.length; idx++) {
            const el = cardEls.current.get(list[idx]);
            if (!el) continue;
            const { p, css } = poseTransform(idx, focused, 0);
            el.style.transition = `${SNAP_TRANSITION}, opacity 0.3s ease`;
            el.style.transform  = css;
            el.style.opacity    = '1';
            el.style.zIndex     = String(p.z);
            el.style.filter     = `brightness(${p.bright})`;
        }
    }

    function onWheel(e: React.WheelEvent) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastWheelRef.current < 280) return;
        lastWheelRef.current = now;

        const next = e.deltaY < 0
            ? Math.min(focusedRef.current + 1, recents.length - 1)
            : e.deltaY > 0
                ? Math.max(focusedRef.current - 1, 0)
                : focusedRef.current;
        if (next !== focusedRef.current) {
            springTo(next);
            setFocusedIdx(next);
        }
    }

    function onPointerDown(e: React.PointerEvent) {
        startXRef.current     = e.clientX;
        startYRef.current     = e.clientY;
        isDraggingRef.current = true;
        capturedRef.current   = false;
        axisRef.current       = null;
        swipeDragIdx.current  = focusedRef.current;
        dragXRef.current      = 0;
        swipeUpYRef.current   = 0;
        lastXRef.current      = e.clientX;
        lastTRef.current      = Date.now();
        vxRef.current         = 0;
    }

    function onPointerMove(e: React.PointerEvent) {
        if (!isDraggingRef.current) return;
        const dx = e.clientX - startXRef.current;
        const dy = e.clientY - startYRef.current;

        // Favour horizontal: vertical (card-kill) only locks when clearly dominant, so
        // a browse swipe with a little upward drift still pans the carousel.
        if (!axisRef.current && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
            axisRef.current = Math.abs(dy) > Math.abs(dx) * 1.25 ? 'v' : 'h';
        }

        if (axisRef.current === 'h') {
            if (!capturedRef.current) {
                capturedRef.current = true;
                try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic */ }
            }
            const now = Date.now();
            const dt  = now - lastTRef.current;
            if (dt > 0) vxRef.current = (e.clientX - lastXRef.current) / dt;
            lastXRef.current = e.clientX;
            lastTRef.current = now;

            const fi   = focusedRef.current;
            const maxL = fi * CARD_STEP;
            const maxR = (recents.length - 1 - fi) * CARD_STEP;
            // Follow the finger within range; past the first/last card apply rubber-band
            // resistance so the carousel feels elastic instead of hitting a hard wall.
            dragXRef.current = dx > maxL  ? maxL + (dx - maxL) * 0.35
                             : dx < -maxR ? -maxR + (dx + maxR) * 0.35
                             : dx;
            applyHDrag();
        } else if (axisRef.current === 'v') {
            if (!capturedRef.current) {
                capturedRef.current = true;
                try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* synthetic */ }
            }
            swipeUpYRef.current = Math.min(0, dy);
            applyVDrag(swipeUpYRef.current);
        }
    }

    function onPointerUp() {
        if (axisRef.current === 'h') {
            suppressClick.current = true;
            setTimeout(() => { suppressClick.current = false; }, 80);

            // Snap to whichever card the DRAG actually landed nearest (past half a
            // step commits); a quick flick nudges exactly ONE card on a short drag.
            // No velocity projection - that is what made a one-card swipe overshoot
            // to the card after next.
            const fi = focusedRef.current;
            let step = -Math.round(dragXRef.current / CARD_STEP);
            if (step === 0 && Math.abs(vxRef.current) > FLICK_VX) step = vxRef.current < 0 ? 1 : -1;
            const next = Math.max(0, Math.min(recents.length - 1, fi + step));
            dragXRef.current = 0;
            springTo(next);
            if (next !== fi) setFocusedIdx(next);
        } else if (axisRef.current === 'v') {
            // Swallow the click that follows a vertical drag: without this the overlay's
            // own onClick fired right after a card-kill swipe and DISMISSED the whole
            // switcher (which now lands on home) - only the swiped card may react.
            suppressClick.current = true;
            setTimeout(() => { suppressClick.current = false; }, 80);

            const draggedId = recentsRef.current[swipeDragIdx.current];
            const y = swipeUpYRef.current;
            swipeUpYRef.current = 0;
            if (y < -80 && draggedId) {
                ejectCard(draggedId);
            } else {
                // Not far enough: spring only the touched card back into its slot.
                springTo(focusedRef.current);
            }
        }
        isDraggingRef.current = false;
        axisRef.current       = null;
        capturedRef.current   = false;
    }

    return (
        <div
            data-switcher-ignore="1"
            className="absolute inset-0 z-30"
            style={{
                // Only the EXIT animates on this root (fade+recede of everything at
                // once). The entrance must NOT live here: fading the root would fade
                // the cards too - including the focused card carrying the live app
                // view - which blinked the app out for the first frames of the
                // transition. On entry the root is fully opaque from frame one; the
                // backdrop child below fades its blur/dim in on its own.
                animation: closing ? 'switcher-out 0.3s cubic-bezier(0.4,0,0.7,1) forwards' : undefined,
            }}
            onAnimationEnd={e => {
                // Matched by NAME, not target: the entrance lives on the backdrop
                // child, the exit on this root, and card/app animations also bubble.
                if (e.animationName === 'switcher-out') { if (closing) onDone(); }
                else if (e.animationName === 'switcher-in') onReady();
            }}
            onWheel={onWheel}
            onClick={e => {
                if (!suppressMount.current && !suppressClick.current) onDismiss();
                e.stopPropagation();
            }}
        >
            {/* iOS depth layer: gaussian blur + light dim over whatever sits behind
                (revealed home screen / a non-preview app). Fades in independently so
                the cards above never dip in opacity. */}
            <div
                className="pointer-events-none absolute inset-0"
                style={{
                    animation:            'switcher-in 0.26s ease-out both',
                    backdropFilter:       'blur(18px) saturate(0.85) brightness(0.7)',
                    WebkitBackdropFilter: 'blur(18px) saturate(0.85) brightness(0.7)',
                    backgroundColor:      'rgba(0,0,0,0.22)',
                }}
            />
            <div
                className="absolute inset-x-0"
                style={{ top: HEADER_TOP, height: HEADER_H + 8 + CARD_H }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                {recents.map((appId, idx) => {
                    const appDef     = apps.find(a => a.id === appId);
                    const isEjecting = ejectingId === appId;
                    const pose       = cardPose(idx, focusedIdx, 0);

                    // Only the centred card shows its icon / name / close chrome. The cards
                    // overlap heavily, so leaving the neighbours' header rows visible smudges
                    // the focused card's top - they fade as they leave centre.
                    const adInt         = Math.abs(idx - focusedIdx);
                    const headerOpacity = Math.max(0, 1 - adInt * 1.3);
                    const headerFocused = adInt < 0.5;

                    return (
                        <div
                            key={appId}
                            ref={el => {
                                if (el) cardEls.current.set(appId, el);
                                else cardEls.current.delete(appId);
                            }}
                            className="absolute"
                            style={{
                                left:            0,
                                top:             0,
                                width:           CARD_W,
                                zIndex:          pose.z,
                                transform:       `translateX(${pose.tx}px) translateY(${isEjecting ? -(SH + 80) : 0}px) scale(${pose.scale})`,
                                transformOrigin: '50% 0%',
                                opacity:         isEjecting ? 0 : 1,
                                filter:          `brightness(${pose.bright})`,
                                transition:      isEjecting ? EJECT_TRANSITION : SNAP_TRANSITION,
                                willChange:      'transform, opacity, filter',
                            }}
                        >
                            {/* Entrance: focused card settles down from slightly larger (the
                                app shrinking into its card), neighbours rise with a cascade.
                                Lives on an inner wrapper so it never fights the positioning
                                transform above; dropped entirely once the entrance played. */}
                            <div
                                style={entered ? undefined : {
                                    animation: `${idx === 0 ? 'switcher-card-in-focus 0.38s' : 'switcher-card-in 0.44s'} cubic-bezier(0.32,0.72,0,1) both`,
                                    animationDelay: `${Math.min(idx, 4) * 40}ms`,
                                    willChange: 'transform, opacity',
                                }}
                            >
                            <div
                                className="mb-2 flex items-center gap-2.5 pl-3 pr-1"
                                style={{
                                    opacity:       headerOpacity,
                                    pointerEvents: headerFocused ? 'auto' : 'none',
                                    transition:    'opacity 0.38s ease',
                                }}
                            >
                                <div className="relative shrink-0">
                                    <div
                                        className="overflow-hidden"
                                        style={{ width: ICON_DISP, height: ICON_DISP, borderRadius: '27.6%' }}
                                    >
                                        <div style={{
                                            width:           ICON_NATIVE,
                                            height:          ICON_NATIVE,
                                            transform:       `scale(${ICON_SCALE})`,
                                            transformOrigin: 'top left',
                                        }}>
                                            <AppIconSVG icon={appDef?.icon ?? ''} />
                                        </div>
                                    </div>
                                    <AppBadge count={badges[appId]} small />
                                </div>

                                <span
                                    className="flex-1 truncate text-[16px] font-semibold text-white"
                                    style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}
                                >
                                    {appDef?.label ?? appId}
                                </span>

                                {/* Close: to the RIGHT of the name, a larger
                                    circular glass button. Translucent over the switcher's own blur
                                    (no per-button backdrop-filter - it nests under the switcher blur
                                    and flickers in CEF). */}
                                <button
                                    type="button"
                                    aria-label={`Close ${appDef?.label ?? appId}`}
                                    onClick={e => { e.stopPropagation(); ejectCard(appId); }}
                                    className="shrink-0 flex h-[30px] w-[30px] items-center justify-center rounded-full text-white transition-colors duration-200 active:bg-white/30"
                                    style={{
                                        background: 'rgba(255,255,255,0.18)',
                                        boxShadow:  'inset 0 0 0 0.5px rgba(255,255,255,0.28)',
                                    }}
                                >
                                    <X className="h-[15px] w-[15px]" strokeWidth={2.25} />
                                </button>
                            </div>

                            <div
                                className="relative overflow-hidden"
                                style={{
                                    width:        CARD_W,
                                    height:       CARD_H,
                                    borderRadius: Math.round(SR * SCALE),
                                    boxShadow:    '0 14px 44px rgba(0,0,0,0.7), 0 2px 10px rgba(0,0,0,0.45)',
                                }}
                            >
                                {/* Icon fallback: shown until (or unless) the deck parents a
                                    live app host over it. Non-preview apps stay on this. */}
                                <div className="absolute inset-0 flex items-center justify-center bg-[#1c1c1e]">
                                    <div className="overflow-hidden" style={{ width: 76, height: 76, borderRadius: '22%' }}>
                                        <div style={{ width: 60, height: 60, transform: 'scale(1.2667)', transformOrigin: 'top left' }}>
                                            <AppIconSVG icon={appDef?.icon ?? ''} />
                                        </div>
                                    </div>
                                </div>

                                <CardStage appId={appId} />

                                {/* Transparent tap target sits ABOVE the live view (which is
                                    inert / pointer-events:none while parented into the card). */}
                                <button
                                    type="button"
                                    aria-label={appDef?.label ?? appId}
                                    className="absolute inset-0 z-[2]"
                                    onClick={e => {
                                        e.stopPropagation();
                                        if (suppressClick.current) return;
                                        const cx = (pose.tx + CARD_W / 2) / SW;
                                        const cy = (CARD_TOP + CARD_H / 2) / SH;
                                        onOpen(appId, {
                                            x: Math.max(0, Math.min(1, cx)),
                                            y: Math.max(0, Math.min(1, cy)),
                                        });
                                    }}
                                />
                            </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {recents.length > 0 && (
                <div className="absolute bottom-7 left-0 right-0 flex justify-center">
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); onRemoveAll(); }}
                        className="rounded-full bg-white/20 px-6 py-2 text-[15px] font-semibold text-white backdrop-blur-md active:opacity-70"
                        style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
                    >
                        {t('shell.closeAll','Close All')}
                    </button>
                </div>
            )}
        </div>
    );
}
