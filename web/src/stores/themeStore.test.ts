import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PHONE_SCALE_KEY = 'sd-phone:phoneScale';
const PHONE_ALIGN_KEY = 'sd-phone:phoneAlign';

function fakeLocalStorage() {
    const map = new Map<string, string>();
    return {
        getItem:    (k: string) => map.get(k) ?? null,
        setItem:    (k: string, v: string) => { map.set(k, String(v)); },
        removeItem: (k: string) => { map.delete(k); },
        clear:      () => { map.clear(); },
    };
}

let storage: ReturnType<typeof fakeLocalStorage>;

beforeEach(() => {
    storage = fakeLocalStorage();
    vi.stubGlobal('window', { localStorage: storage, setTimeout, clearTimeout });
    vi.resetModules();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('@/core/nui');
});

async function importStore() {
    const mod = await import('./themeStore');
    return mod.useThemeStore;
}

describe('themeStore phone scale persistence (dev)', () => {
    it('saves the scale to localStorage when set', async () => {
        const store = await importStore();
        store.getState().setPhoneScale(72);
        expect(store.getState().phoneScale).toBe(72);
        expect(storage.getItem(PHONE_SCALE_KEY)).toBe('72');
    });

    it('clamps out-of-range values before storing them', async () => {
        const store = await importStore();
        store.getState().setPhoneScale(500);
        expect(store.getState().phoneScale).toBe(100);
        expect(storage.getItem(PHONE_SCALE_KEY)).toBe('100');
        store.getState().setPhoneScale(-20);
        expect(store.getState().phoneScale).toBe(0);
        expect(storage.getItem(PHONE_SCALE_KEY)).toBe('0');
    });

    it('seeds the initial scale from localStorage', async () => {
        storage.setItem(PHONE_SCALE_KEY, '80');
        const store = await importStore();
        expect(store.getState().phoneScale).toBe(80);
    });

    it('falls back to the default when the stored value is garbage', async () => {
        storage.setItem(PHONE_SCALE_KEY, 'not-a-number');
        const store = await importStore();
        expect(store.getState().phoneScale).toBe(50);
    });
});

describe('themeStore phone scale persistence (in-game)', () => {
    it('persists the scale through the settings NUI callback', async () => {
        const fetchNui = vi.fn().mockResolvedValue({ success: true });
        vi.doMock('@/core/nui', () => ({ isFiveM: true, fetchNui }));
        const store = await importStore();
        store.getState().setPhoneScale(35);
        expect(fetchNui).toHaveBeenCalledWith('sd-phone:settings:setPhoneScale', { scale: 35 });
    });

    it('applies the server-saved scale on hydrate', async () => {
        const fetchNui = vi.fn().mockImplementation((event: string) => {
            if (event === 'sd-phone:settings:get') {
                return Promise.resolve({ data: { phoneScale: 30 } });
            }
            return Promise.resolve({ success: true });
        });
        vi.doMock('@/core/nui', () => ({ isFiveM: true, fetchNui }));
        const store = await importStore();
        store.getState().hydrate();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(store.getState().phoneScale).toBe(30);
    });
});

describe('themeStore phone align persistence (dev)', () => {
    it('saves the anchor to localStorage when set', async () => {
        const store = await importStore();
        store.getState().setPhoneAlign('top-left');
        expect(store.getState().phoneAlign).toBe('top-left');
        expect(storage.getItem(PHONE_ALIGN_KEY)).toBe('top-left');
    });

    it('seeds the initial anchor from localStorage', async () => {
        storage.setItem(PHONE_ALIGN_KEY, 'middle-center');
        const store = await importStore();
        expect(store.getState().phoneAlign).toBe('middle-center');
    });

    it('falls back to the default when the stored value is garbage', async () => {
        storage.setItem(PHONE_ALIGN_KEY, 'under-the-sofa');
        const store = await importStore();
        expect(store.getState().phoneAlign).toBe('bottom-right');
    });
});

describe('themeStore phone align persistence (in-game)', () => {
    it('persists the anchor through the settings NUI callback', async () => {
        const fetchNui = vi.fn().mockResolvedValue({ success: true });
        vi.doMock('@/core/nui', () => ({ isFiveM: true, fetchNui }));
        const store = await importStore();
        store.getState().setPhoneAlign('bottom-left');
        expect(fetchNui).toHaveBeenCalledWith('sd-phone:settings:setPhoneAlign', { align: 'bottom-left' });
    });

    it('applies the server-saved anchor on hydrate and drops unknown values', async () => {
        const fetchNui = vi.fn().mockImplementation((event: string) => {
            if (event === 'sd-phone:settings:get') {
                return Promise.resolve({ data: { phoneAlign: 'top-right' } });
            }
            return Promise.resolve({ success: true });
        });
        vi.doMock('@/core/nui', () => ({ isFiveM: true, fetchNui }));
        const store = await importStore();
        store.getState().hydrate();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(store.getState().phoneAlign).toBe('top-right');

        fetchNui.mockImplementation((event: string) => {
            if (event === 'sd-phone:settings:get') {
                return Promise.resolve({ data: { phoneAlign: 'sideways' } });
            }
            return Promise.resolve({ success: true });
        });
        store.getState().hydrate();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(store.getState().phoneAlign).toBe('top-right');
    });
});
