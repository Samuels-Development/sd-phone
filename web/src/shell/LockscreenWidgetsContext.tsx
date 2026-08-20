import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

import type { ActiveLockscreenWidget } from '@/core/types';
import { useNuiEvent } from '@/hooks/useNuiEvent';

const Ctx = createContext<ActiveLockscreenWidget[]>([]);

export function useLockscreenWidgets(): ActiveLockscreenWidget[] {
    return useContext(Ctx);
}

export function LockscreenWidgetsProvider({ children }: { children: ReactNode }) {
    const [items, setItems] = useState<ActiveLockscreenWidget[]>([]);
    useNuiEvent('sd-phone:lockscreenWidget:show', useCallback((item: ActiveLockscreenWidget) => {
        setItems(current => {
            const index = current.findIndex(value => value.key === item.key);
            if (index < 0) return [...current, item];
            return current.map((value, i) => i === index ? item : value);
        });
    }, []));
    useNuiEvent('sd-phone:lockscreenWidget:hide', useCallback((data: { key: string }) => {
        setItems(current => current.filter(item => item.key !== data.key));
    }, []));
    return <Ctx.Provider value={items}>{children}</Ctx.Provider>;
}
