import { create } from 'zustand';

import type { NotificationItem } from '@/shell/Notifications';

type StackUpdate = NotificationItem[] | ((prev: NotificationItem[]) => NotificationItem[]);

interface NotificationState {
    banners: NotificationItem[];
    lock:    NotificationItem[];
}

export const useNotificationStore = create<NotificationState>(() => ({
    banners: [],
    lock:    [],
}));

function next(prev: NotificationItem[], update: StackUpdate): NotificationItem[] {
    return typeof update === 'function' ? update(prev) : update;
}

export function setNotifs(update: StackUpdate): void {
    useNotificationStore.setState(s => ({ banners: next(s.banners, update) }));
}

export function setLockNotifs(update: StackUpdate): void {
    useNotificationStore.setState(s => ({ lock: next(s.lock, update) }));
}
