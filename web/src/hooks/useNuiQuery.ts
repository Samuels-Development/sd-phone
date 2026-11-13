import { useRef } from 'react';

import { apiData } from '@/core/api';
import { useAsyncData } from './useAsyncData';

export function useNuiQuery<T>(event: string, opts?: {
    payload?: unknown;
    enabled?: boolean;
    onData?: (data: T) => void;
}): { data: T | null; loading: boolean; refetch: () => void } {
    const payloadRef = useRef(opts?.payload);
    payloadRef.current = opts?.payload;
    const payloadKey = JSON.stringify(opts?.payload ?? null);

    return useAsyncData<T>(
        () => apiData<T>(event, payloadRef.current),
        [event, payloadKey],
        { enabled: opts?.enabled, onData: opts?.onData },
    );
}
