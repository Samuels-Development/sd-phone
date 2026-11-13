import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { apiData } from '@/core/api';
import { fetchNui, isFiveM } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import type { ClassifiedFeedAction, ClassifiedItem } from './types';

export function useClassifiedsFeed<T extends ClassifiedItem>(
    listEvent: string,
    feedEvent: ClassifiedFeedAction,
    watchEvent: string,
    listKey: string,
    initial: T[],
    onRemoved?: (id: string) => void,
): [T[], Dispatch<SetStateAction<T[]>>] {
    const [entries, setEntries] = useState<T[]>(initial);

    useEffect(() => {
        if (!isFiveM) return;
        let alive = true;
        apiData<Record<string, T[]>>(listEvent)
            .then(data => { if (alive && data) setEntries(data[listKey] ?? []); })
            .catch(() => {});
        return () => { alive = false; };
    }, [listEvent, listKey]);

    useEffect(() => {
        if (!isFiveM) return;
        void fetchNui(watchEvent, { on: true }).catch(() => {});
        return () => { void fetchNui(watchEvent, { on: false }).catch(() => {}); };
    }, [watchEvent]);

    useNuiEvent(feedEvent, useCallback(data => {
        if (!data) return;
        if (data.type === 'removed' && data.id) {
            const rid = data.id;
            setEntries(prev => prev.filter(e => e.id !== rid));
            onRemoved?.(rid);
            return;
        }
        const item = data.item as T | undefined;
        if (!item) return;
        if (data.type === 'added') {
            setEntries(prev => prev.some(e => e.id === item.id)
                ? prev.map(e => (e.id === item.id ? { ...item, mine: e.mine } : e))
                : [item, ...prev]);
        } else if (data.type === 'updated') {
            setEntries(prev => prev.some(e => e.id === item.id)
                ? prev.map(e => (e.id === item.id ? { ...item, mine: e.mine } : e))
                : [item, ...prev]);
        }
    }, [onRemoved]));

    return [entries, setEntries];
}
