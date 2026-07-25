import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

const ANIM = {
    x: {
        enter:  'ios-push 0.32s cubic-bezier(0.32,0.72,0,1)',
        exit:   'ios-pop 0.32s cubic-bezier(0.32,0.72,0,1) forwards',
        exitMs: 320,
    },
    y: {
        enter:  'ios-sheet-up 0.34s cubic-bezier(0.32,0.72,0,1)',
        exit:   'ios-sheet-down 0.26s cubic-bezier(0.32,0,0.68,1) forwards',
        exitMs: 260,
    },
} as const;

interface SlideOverProps {
    onClose:    () => void;
    animateIn?: boolean;
    direction?: 'x' | 'y';
    className?: string;
    zIndex?:    number;
    children:   (close: (after?: () => void) => void) => ReactNode;
}

export function SlideOver({ onClose, animateIn = true, direction = 'x', className = '', zIndex = 30, children }: SlideOverProps) {
    const [exiting, setExiting] = useState(false);
    const exit = useRef<() => void>(onClose);
    const finished = useRef(false);
    const timer = useRef<number | undefined>(undefined);

    function finish() {
        if (finished.current) return;
        finished.current = true;
        window.clearTimeout(timer.current);
        exit.current();
    }

    function close(after?: () => void) {
        if (finished.current || exiting) return;
        exit.current = typeof after === 'function' ? after : onClose;
        setExiting(true);
        // animationend can be dropped in CEF under load; the timeout guarantees completion
        timer.current = window.setTimeout(finish, ANIM[direction].exitMs + 80);
    }

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const anim = ANIM[direction];
    return (
        <div
            className={`absolute inset-0 ${className}`}
            style={{
                zIndex,
                animation:  exiting ? anim.exit : animateIn ? anim.enter : undefined,
                willChange: 'transform',
            }}
            onAnimationEnd={e => { if (exiting && e.target === e.currentTarget) finish(); }}
        >
            {children(close)}
        </div>
    );
}
