import { useCallback, useEffect, useRef, useState } from 'react';

export interface PagedResult<T, C> {
    items:      T[];
    nextCursor: C | null | undefined;
}

// Cursor-based pagination over an admin list endpoint. `key` resets the list
// whenever the underlying query changes (new search text, different player).
export function usePaged<T, C>(
    fetchPage: (cursor: C | null) => Promise<PagedResult<T, C> | null>,
    key: string,
) {
    const [items, setItems]     = useState<T[]>([]);
    const [cursor, setCursor]   = useState<C | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState<string | null>(null);
    const generation = useRef(0);

    const load = useCallback(async (reset: boolean) => {
        const gen = ++generation.current;
        setLoading(true);
        if (reset) setError(null);
        const res = await fetchPage(reset ? null : cursor);
        if (gen !== generation.current) return;
        setLoading(false);
        if (!res) {
            setError('Request failed');
            if (reset) { setItems([]); setHasMore(false); }
            return;
        }
        setItems(prev => reset ? res.items : [...prev, ...res.items]);
        setCursor(res.nextCursor ?? null);
        setHasMore(res.nextCursor != null);
    }, [fetchPage, cursor]);

    useEffect(() => {
        void load(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return {
        items,
        loading,
        hasMore,
        error,
        loadMore: () => { if (!loading && hasMore) void load(false); },
        reload:   () => { void load(true); },
        setItems,
    };
}
