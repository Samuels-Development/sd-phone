import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const DRAG_START = 6;
const FADE = 22;

/** Which physical sides of a sideways-scrolling element have more to show. */
function hiddenSides(el: HTMLElement): { left: boolean; right: boolean } {
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 1) return { left: false, right: false };
    const rtl = getComputedStyle(el).direction === 'rtl';
    const fromLeft = rtl ? max + el.scrollLeft : el.scrollLeft;
    return { left: fromLeft > 1, right: fromLeft < max - 1 };
}

/** A row that scrolls sideways with a mouse as well as a finger: drag it (past a few pixels, so a
 *  click on something inside still lands when the pointer barely moved), or turn the wheel over it.
 *  The wheel only scrolls the row while it has further to go, so at either end it carries on
 *  scrolling the page. Edges fade where more is hidden. */
export function ScrollRow({ className = '', children }: { className?: string; children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [sides, setSides] = useState({ left: false, right: false });

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const update = () => {
            const next = hiddenSides(el);
            setSides(s => (s.left === next.left && s.right === next.right ? s : next));
        };
        let drag: { id: number; x: number; left: number; moved: boolean } | null = null;
        let swallowClick = false;

        const down = (e: PointerEvent) => {
            if (e.pointerType !== 'mouse' || e.button !== 0) return;
            drag = { id: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false };
            swallowClick = false;
        };
        const move = (e: PointerEvent) => {
            if (!drag || e.pointerId !== drag.id) return;
            const dx = e.clientX - drag.x;
            if (!drag.moved) {
                if (Math.abs(dx) < DRAG_START || el.scrollWidth <= el.clientWidth) return;
                drag.moved = true;
                el.setPointerCapture(e.pointerId);
                el.style.cursor = 'grabbing';
            }
            el.scrollLeft = drag.left - dx;
        };
        const up = (e: PointerEvent) => {
            if (!drag || e.pointerId !== drag.id) return;
            if (drag.moved) {
                swallowClick = true;
                el.style.cursor = '';
                if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
            }
            drag = null;
        };
        const click = (e: MouseEvent) => {
            if (!swallowClick) return;
            swallowClick = false;
            e.preventDefault();
            e.stopPropagation();
        };
        const wheel = (e: WheelEvent) => {
            if (e.ctrlKey) return;
            const raw = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            const delta = e.deltaMode === 1 ? raw * 16 : e.deltaMode === 2 ? raw * el.clientWidth : raw;
            const rtl = getComputedStyle(el).direction === 'rtl';
            const side = hiddenSides(el);
            const towardsEnd = delta > 0;
            const canMove = rtl ? (towardsEnd ? side.left : side.right) : (towardsEnd ? side.right : side.left);
            if (!delta || !canMove) return;
            e.preventDefault();
            el.scrollLeft += rtl ? -delta : delta;
        };

        update();
        el.addEventListener('pointerdown', down);
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
        el.addEventListener('pointercancel', up);
        el.addEventListener('click', click, true);
        el.addEventListener('wheel', wheel, { passive: false });
        el.addEventListener('scroll', update, { passive: true });
        const ro = new ResizeObserver(update);
        ro.observe(el);
        const mo = new MutationObserver(update);
        mo.observe(el, { childList: true, subtree: true, characterData: true });
        return () => {
            mo.disconnect();
            el.removeEventListener('pointerdown', down);
            el.removeEventListener('pointermove', move);
            el.removeEventListener('pointerup', up);
            el.removeEventListener('pointercancel', up);
            el.removeEventListener('click', click, true);
            el.removeEventListener('wheel', wheel);
            el.removeEventListener('scroll', update);
            ro.disconnect();
        };
    }, []);

    const mask = sides.left || sides.right
        ? `linear-gradient(to right, ${sides.left ? 'transparent' : '#000'} 0, #000 ${FADE}px, #000 calc(100% - ${FADE}px), ${sides.right ? 'transparent' : '#000'} 100%)`
        : undefined;

    return (
        <div
            ref={ref}
            data-scroll-row
            className={`flex select-none overflow-x-auto no-scrollbar ${className}`}
            style={{ maskImage: mask, WebkitMaskImage: mask, touchAction: 'pan-x pan-y' }}
        >
            {children}
        </div>
    );
}
