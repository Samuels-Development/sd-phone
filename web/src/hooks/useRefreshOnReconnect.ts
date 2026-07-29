import { useEffect, useRef } from 'react';

import { useServiceStore } from '@/stores/serviceStore';

/**
 * Runs `refresh` when data service comes back after being lost.
 *
 * Apps already refetch on the deck-active rising edge, which covers leaving an app and returning,
 * reopening the phone, and switching tabs. This covers the one case that misses: a player who
 * stays on the same screen, untouched, across the whole trip out of coverage and back. Without it
 * they keep looking at the cached feed the proxy served them until they touch something.
 *
 * Refetching rather than replaying queued events is deliberate. A feed has no per-event value the
 * way a message does: what you want is its current state, and one fetch cannot arrive out of order
 * or drift from what the server actually holds.
 */
export function useRefreshOnReconnect(refresh: () => void): void {
    const hasData = useServiceStore(s => s.data);
    const had = useRef(hasData);

    useEffect(() => {
        // Only the rising edge fires. A changing `refresh` identity re-runs this effect, but `had`
        // is already true by then, so it cannot cause a second fetch.
        if (hasData && !had.current) refresh();
        had.current = hasData;
    }, [hasData, refresh]);
}
