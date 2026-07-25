import { create } from 'zustand';

import { useMocks } from '@/core/demo';


interface AuthRecord {
    profile: Record<string, string>;
    at:      number;
}

const keyFor = (appKey: string) => `sd-phone:auth:${appKey}`;

function loadFromDisk(appKey: string): AuthRecord | null {
    try {
        const raw = localStorage.getItem(keyFor(appKey));
        return raw ? (JSON.parse(raw) as AuthRecord) : null;
    } catch {
        return null;
    }
}

interface AuthState {
    records: Record<string, AuthRecord | null | undefined>;
    ensure:  (appKey: string) => void;
    signIn:  (appKey: string, profile: Record<string, string>) => void;
    signOut: (appKey: string) => void;
}

const useAuthStore = create<AuthState>((set, get) => ({
    records: {},
    ensure: (appKey) => {
        if (get().records[appKey] === undefined) {
            set(s => ({ records: { ...s.records, [appKey]: loadFromDisk(appKey) } }));
        }
    },
    signIn: (appKey, profile) => {
        const rec: AuthRecord = { profile, at: Date.now() };
        try { localStorage.setItem(keyFor(appKey), JSON.stringify(rec)); } catch { /* non-fatal */ }
        set(s => ({ records: { ...s.records, [appKey]: rec } }));
    },
    signOut: (appKey) => {
        try { localStorage.removeItem(keyFor(appKey)); } catch { /* non-fatal */ }
        set(s => ({ records: { ...s.records, [appKey]: null } }));
    },
}));

function readAuth(appKey: string): AuthRecord | null {
    const rec = useAuthStore.getState().records[appKey];
    return rec !== undefined ? rec : loadFromDisk(appKey);
}

export function isAuthed(appKey: string): boolean {
    if (useMocks) return true;
    return readAuth(appKey) !== null;
}

export function signIn(appKey: string, profile: Record<string, string>): void {
    useAuthStore.getState().signIn(appKey, profile);
}

export function signOut(appKey: string): void {
    useAuthStore.getState().signOut(appKey);
}

export function resetAuth(): void {
    useAuthStore.setState({ records: {} });
}

