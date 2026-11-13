import { useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

import { dirSign } from '@/stores/directionStore';

function ancestorZoom(el: HTMLElement | null): number {
    let z = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const cz = parseFloat(getComputedStyle(n).getPropertyValue('zoom'));
        if (cz > 0 && cz !== 1) z *= cz;
    }
    return z || 1;
}

export function SwipeToDismiss({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
    const [dx, setDx]         = useState(0);
    const [exiting, setExiting] = useState(false);
    const start    = useRef({ x: 0, y: 0 });
    const zoom     = useRef(1);
    const dragging = useRef(false);
    const axis     = useRef<'h' | 'v' | null>(null);

    function onDown(e: ReactPointerEvent) {
        start.current = { x: e.clientX, y: e.clientY };
        zoom.current = ancestorZoom(e.currentTarget as HTMLElement);
        dragging.current = true;
        axis.current = null;
    }
    function onMove(e: ReactPointerEvent) {
        if (!dragging.current) return;
        const rdx = (e.clientX - start.current.x) * dirSign();
        const rdy = e.clientY - start.current.y;
        if (!axis.current && (Math.abs(rdx) > 6 || Math.abs(rdy) > 6)) {
            axis.current = Math.abs(rdx) > Math.abs(rdy) ? 'h' : 'v';
            if (axis.current === 'h') { try { e.currentTarget.setPointerCapture(e.pointerId); } catch {} }
        }
        if (axis.current !== 'h') return;
        setDx(Math.min(0, rdx) / zoom.current);
    }
    function onUp(e: ReactPointerEvent) {
        if (!dragging.current) return;
        dragging.current = false;
        const rdx = (e.clientX - start.current.x) * dirSign();
        if (axis.current === 'h' && rdx < -90) {
            setExiting(true);
            window.setTimeout(onDismiss, 230);
        } else {
            setDx(0);
        }
    }

    const style: CSSProperties = exiting
        ? { transform: 'translateX(calc(var(--dir-x, 1) * -115%))', opacity: 0, transition: 'transform 0.24s cubic-bezier(0.4,0,1,1), opacity 0.24s ease-in' }
        : dx
        ? { transform: `translateX(calc(var(--dir-x, 1) * ${dx}px))`, opacity: Math.max(0.2, 1 + dx / 280), transition: dragging.current ? 'none' : 'transform 0.24s cubic-bezier(0.2,0.8,0.3,1), opacity 0.2s' }
        : {};

    return (
        <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{ touchAction: 'pan-y', ...style }}
            className="touch-pan-y"
        >
            {children}
        </div>
    );
}
