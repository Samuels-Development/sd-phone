import { useCallback, useEffect, useRef, useState } from 'react';

export function useAsyncData<T>(
    load: () => Promise<T | null>,
    deps: readonly unknown[],
    opts?: { enabled?: boolean; onData?: (data: T) => void },
): { data: T | null; loading: boolean; settled: boolean; refetch: () => void } {
    const enabled = opts?.enabled !== false;

    const [data, setData]       = useState<T | null>(null);
    const [loading, setLoading] = useState(enabled);
    const [settled, setSettled] = useState(false);
    const [nonce, setNonce]     = useState(0);

    const loadRef = useRef(load);
    loadRef.current = load;
    const onDataRef = useRef(opts?.onData);
    onDataRef.current = opts?.onData;

    useEffect(() => {
        if (!enabled) { setSettled(true); return; }
        let cancelled = false;
        setLoading(true);
        loadRef.current()
            .then(d => {
                if (cancelled) return;
                setLoading(false);
                setSettled(true);
                if (d !== null) { setData(d); onDataRef.current?.(d); }
            })
            .catch(() => { if (!cancelled) { setLoading(false); setSettled(true); } });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, nonce, ...deps]);

    const refetch = useCallback(() => setNonce(n => n + 1), []);
    return { data, loading, settled, refetch };
}
