import { useEffect, useState } from 'react';

export const LOW_CLOCK = 20;

export function useTurnClock(seconds: number, running: boolean, resetKey: unknown): number {
    const [left, setLeft] = useState(seconds);
    useEffect(() => {
        setLeft(seconds);
        if (!running || seconds <= 0) return;
        const end = Date.now() + seconds * 1000;
        const id = window.setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 500);
        return () => window.clearInterval(id);
    }, [seconds, running, resetKey]);
    return left;
}
