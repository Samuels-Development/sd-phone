import { useEffect, useRef } from 'react';


const pending   = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

export function setLaunchIntent(appId: string, intent: unknown): void {
    pending.set(appId, intent);
    const subs = listeners.get(appId);
    if (subs) for (const fn of [...subs]) fn();
}

export function consumeLaunchIntent<T = unknown>(appId: string): T | undefined {
    if (!pending.has(appId)) return undefined;
    const intent = pending.get(appId) as T;
    pending.delete(appId);
    return intent;
}

export function subscribeLaunchIntent(appId: string, fn: () => void): () => void {
    let subs = listeners.get(appId);
    if (!subs) { subs = new Set(); listeners.set(appId, subs); }
    subs.add(fn);
    return () => {
        subs.delete(fn);
        if (subs.size === 0) listeners.delete(appId);
    };
}

/** @testseam */
export function resetLaunchIntents(): void {
    pending.clear();
}

export function useLaunchIntent<T>(appId: string, apply: (intent: T) => void): void {
    const applyRef = useRef(apply);
    applyRef.current = apply;

    useEffect(() => {
        const drain = () => {
            const intent = consumeLaunchIntent<T>(appId);
            if (intent !== undefined) applyRef.current(intent);
        };
        drain();
        return subscribeLaunchIntent(appId, drain);
    }, [appId]);
}
