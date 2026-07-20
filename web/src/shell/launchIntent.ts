import { useEffect, useRef } from 'react';

// A one-shot payload handed to an app as it is opened - "open the camera in VIDEO
// mode", not just "open the camera".
//
// onOpenApp() only carries an app id, and widening it is not enough on its own:
// AppDeck keeps apps ALIVE, so an app opened a second time does not remount and an
// `initialMode`-style prop would only ever apply on the first open. Hence a channel
// the app drains both on mount (opened cold) and on notify (already retained).
//
// Intents are one-shot: drained on read, so returning to an app later does not
// silently re-apply an old launch payload.

const pending   = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

/** Queues the payload for `appId`. Call immediately BEFORE onOpenApp(appId). */
export function setLaunchIntent(appId: string, intent: unknown): void {
    pending.set(appId, intent);
    const subs = listeners.get(appId);
    if (subs) for (const fn of [...subs]) fn();
}

/** Takes the pending intent for `appId`, if any. One-shot: a second call returns undefined. */
export function consumeLaunchIntent<T = unknown>(appId: string): T | undefined {
    if (!pending.has(appId)) return undefined;
    const intent = pending.get(appId) as T;
    pending.delete(appId);
    return intent;
}

/** Notifies when an intent is queued for `appId`. Returns the unsubscribe. */
export function subscribeLaunchIntent(appId: string, fn: () => void): () => void {
    let subs = listeners.get(appId);
    if (!subs) { subs = new Set(); listeners.set(appId, subs); }
    subs.add(fn);
    return () => {
        subs.delete(fn);
        if (subs.size === 0) listeners.delete(appId);
    };
}

/** Test seam: drops all queued intents. */
export function resetLaunchIntents(): void {
    pending.clear();
}

/**
 * Applies a pending launch intent for `appId`, once per intent.
 * @param apply called with the payload; safe to call setState from
 */
export function useLaunchIntent<T>(appId: string, apply: (intent: T) => void): void {
    const applyRef = useRef(apply);
    applyRef.current = apply;

    useEffect(() => {
        const drain = () => {
            const intent = consumeLaunchIntent<T>(appId);
            if (intent !== undefined) applyRef.current(intent);
        };
        // Cold open: the intent was queued before this component existed.
        drain();
        return subscribeLaunchIntent(appId, drain);
    }, [appId]);
}
