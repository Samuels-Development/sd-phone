import { useEffect, useRef, type MutableRefObject } from 'react';

import type { NuiMessage } from '@/core/types';

type AnyHandlerRef = MutableRefObject<(data: unknown) => void>;

const registry = new Map<string, Set<AnyHandlerRef>>();
let listening = false;

function ensureListener(): void {
    if (listening || typeof window === 'undefined') return;
    listening = true;
    window.addEventListener('message', (event: MessageEvent) => {
        const msg = event.data as { action?: string; data?: unknown } | undefined;
        if (!msg?.action) return;
        const refs = registry.get(msg.action);
        if (!refs?.size) return;
        for (const ref of Array.from(refs)) ref.current(msg.data);
    });
}

type HandlerFor<TAction extends NuiMessage['action']> =
    (data: Extract<NuiMessage, { action: TAction }> extends { data: infer D } ? D : undefined) => void;

export function subscribeNui<TAction extends NuiMessage['action']>(
    action: TAction,
    handler: HandlerFor<TAction>,
): () => void {
    const entry = { current: handler as (data: unknown) => void } as AnyHandlerRef;
    ensureListener();
    let refs = registry.get(action);
    if (!refs) { refs = new Set(); registry.set(action, refs); }
    refs.add(entry);
    return () => {
        refs.delete(entry);
        if (refs.size === 0) registry.delete(action);
    };
}

export function useNuiEvent<TAction extends NuiMessage['action']>(
    action: TAction,
    handler: (data: Extract<NuiMessage, { action: TAction }> extends { data: infer D } ? D : undefined) => void,
): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;

    useEffect(() => {
        ensureListener();
        let refs = registry.get(action);
        if (!refs) { refs = new Set(); registry.set(action, refs); }
        const entry = handlerRef as unknown as AnyHandlerRef;
        refs.add(entry);
        return () => {
            refs.delete(entry);
            if (refs.size === 0) registry.delete(action);
        };
    }, [action]);
}
