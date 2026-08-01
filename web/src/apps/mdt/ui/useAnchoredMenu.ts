import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { ancestorZoom } from '@/lib/zoom';

const GAP = 6;
const EDGE = 8;

export interface AnchoredMenuStyle {
    left:      number;
    top:       number;
    maxHeight: number;
    minWidth?: number;
    origin:    string;
}

export interface AnchoredMenuOptions {
    anchor:      HTMLElement | null;
    onClose:     () => void;
    /** Which edge of the menu lines up with the anchor. Menus read from the left, action lists hang off the right. */
    align?:      'start' | 'end';
    /** Floor the menu at the anchor's own width, so a select never looks narrower than its trigger. */
    matchWidth?: boolean;
    /** Any value that should force a re-measure, such as the option count. */
    revision?:   unknown;
}

/**
 * Positions a floating menu against an anchor and wires its dismissal. Coordinates are resolved
 * inside the menu's own offsetParent and divided by the ancestor CSS zoom, so callers can portal
 * the menu out of a clipping row as long as the destination sits in the same zoom space.
 */
export function useAnchoredMenu({ anchor, onClose, align = 'end', matchWidth = false, revision }: AnchoredMenuOptions) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [style, setStyle] = useState<AnchoredMenuStyle | null>(null);

    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host || !anchor) return;

        const parent = host.offsetParent as HTMLElement | null;
        const zoom = ancestorZoom(host) || 1;
        const a = anchor.getBoundingClientRect();
        const p = parent?.getBoundingClientRect();

        const boxW = parent ? parent.clientWidth : window.innerWidth;
        const boxH = parent ? parent.clientHeight : window.innerHeight;
        const w = host.offsetWidth;
        const h = host.offsetHeight;

        const anchorLeft   = (a.left   - (p?.left ?? 0)) / zoom;
        const anchorRight  = (a.right  - (p?.left ?? 0)) / zoom;
        const anchorTop    = (a.top    - (p?.top  ?? 0)) / zoom;
        const anchorBottom = (a.bottom - (p?.top  ?? 0)) / zoom;

        let left = align === 'start' ? anchorLeft : anchorRight - w;
        if (left < EDGE) left = Math.min(align === 'start' ? anchorLeft : anchorRight - w, boxW - w - EDGE);
        left = Math.max(EDGE, Math.min(left, boxW - w - EDGE));

        // Prefer below, but take whichever side actually has room for the list.
        const roomBelow = boxH - EDGE - (anchorBottom + GAP);
        const roomAbove = anchorTop - GAP - EDGE;
        const below = h <= roomBelow || roomBelow >= roomAbove;

        const maxHeight = Math.max(96, Math.floor(below ? roomBelow : roomAbove));
        const top = below
            ? anchorBottom + GAP
            : Math.max(EDGE, anchorTop - GAP - Math.min(h, maxHeight));

        setStyle({
            left,
            top,
            maxHeight,
            minWidth: matchWidth ? a.width / zoom : undefined,
            origin: `${below ? 'top' : 'bottom'} ${align === 'start' ? 'left' : 'right'}`,
        });
    }, [anchor, align, matchWidth, revision]);

    useEffect(() => {
        function onDown(e: PointerEvent) {
            const host = hostRef.current;
            if (host && e.target instanceof Node && host.contains(e.target)) return;
            onClose();
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        }
        // Anchored to a rect measured once, so a scroll underneath would leave it stranded.
        function onScroll(e: Event) {
            const host = hostRef.current;
            if (host && e.target instanceof Node && host.contains(e.target)) return;
            onClose();
        }
        window.addEventListener('pointerdown', onDown, true);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('scroll', onScroll, true);
        return () => {
            window.removeEventListener('pointerdown', onDown, true);
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('scroll', onScroll, true);
        };
    }, [onClose]);

    return { hostRef, style };
}
