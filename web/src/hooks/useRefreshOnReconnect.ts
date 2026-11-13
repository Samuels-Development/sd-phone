import { useEffect, useRef } from 'react';

import { useServiceStore } from '@/stores/serviceStore';

export function useRefreshOnReconnect(refresh: () => void): void {
    const hasData = useServiceStore(s => s.data);
    const had = useRef(hasData);

    useEffect(() => {
        if (hasData && !had.current) refresh();
        had.current = hasData;
    }, [hasData, refresh]);
}
