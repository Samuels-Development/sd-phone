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
    align?:      'start' | 'end';
    matchWidth?: boolean;
    revision?:   unknown;
}

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
            if (!(e.target instanceof Node)) { onClose(); return; }
            if (host && host.contains(e.target)) return;
            if (anchor && anchor.contains(e.target)) return;
            onClose();
        }
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        }
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
    }, [onClose, anchor]);

    return { hostRef, style };
}
