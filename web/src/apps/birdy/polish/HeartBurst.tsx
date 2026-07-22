import { useEffect, useRef, useState } from 'react';

import { LIKE } from '../data';

/** Wraps a like icon: when `liked` flips true the heart overshoot-pops and a ring blooms out
 *  behind it. Unliking stays quiet - taking a like back deserves no fanfare. */
export function HeartBurst({ liked, children }: { liked: boolean; children: React.ReactNode }) {
    const prev = useRef(liked);
    const [burst, setBurst] = useState(0);

    useEffect(() => {
        if (liked && !prev.current) setBurst(n => n + 1);
        prev.current = liked;
    }, [liked]);

    return (
        <span className="relative inline-flex">
            {burst > 0 && (
                <span
                    key={`ring-${burst}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-[-6px] animate-burst-ring rounded-full"
                    style={{ backgroundColor: LIKE }}
                />
            )}
            <span key={`pop-${burst}`} className={burst > 0 ? 'animate-heart-pop' : undefined}>
                {children}
            </span>
        </span>
    );
}
