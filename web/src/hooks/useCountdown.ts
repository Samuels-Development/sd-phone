import { useEffect, useState } from 'react';

export function useCountdown(seconds: number, running = true): number {
    const [left, setLeft] = useState(() => Math.max(0, Math.floor(seconds)));

    useEffect(() => { setLeft(Math.max(0, Math.floor(seconds))); }, [seconds]);

    useEffect(() => {
        if (!running) return;
        const id = window.setInterval(() => setLeft(l => (l > 0 ? l - 1 : 0)), 1000);
        return () => window.clearInterval(id);
    }, [running]);

    return left;
}
