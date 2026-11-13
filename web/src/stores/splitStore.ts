import { create } from 'zustand';

import { useThemeStore } from './themeStore';

export const SPLIT_EXIT_MS = 280;

export type SplitSide = 'left' | 'right';

interface SplitStore {
    appId:   string | null;
    side:    SplitSide | null;
    closing: boolean;
    open:    (id: string) => void;
    close:   () => void;
    clear:   () => void;
    swap:    () => void;
}

let exitTimer: ReturnType<typeof setTimeout> | null = null;

function stopExit(): void {
    if (exitTimer !== null) { clearTimeout(exitTimer); exitTimer = null; }
}

export const useSplitStore = create<SplitStore>()((set, get) => ({
    appId:   null,
    side:    null,
    closing: false,

    open: (id) => {
        stopExit();
        set({ appId: id, closing: false });
    },

    close: () => {
        if (!get().appId || get().closing) return;
        set({ closing: true });
        stopExit();
        exitTimer = setTimeout(() => {
            exitTimer = null;
            set({ appId: null, closing: false });
        }, SPLIT_EXIT_MS);
    },

    clear: () => {
        stopExit();
        set({ appId: null, closing: false });
    },

    swap: () => set(s => ({ side: (s.side ?? revealSide()) === 'left' ? 'right' : 'left' })),

}));

export function useSplitId(): string | null {
    return useSplitStore(s => s.appId);
}

function sideForAlign(align: string | null | undefined): SplitSide {
    return (align ?? 'bottom-right').includes('right') ? 'left' : 'right';
}

export function revealSide(): SplitSide {
    return sideForAlign(useThemeStore.getState().phoneAlign);
}

export function useSplitSide(): SplitSide {
    const pinned = useSplitStore(s => s.side);
    const align  = useThemeStore(s => s.phoneAlign);
    return pinned ?? sideForAlign(align);
}

export function useSplitClosing(): boolean {
    return useSplitStore(s => s.closing);
}

export function useSplitPaneActive(): boolean {
    return useSplitStore(s => s.appId !== null && !s.closing);
}
