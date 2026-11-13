
import type { Message } from './data';

const KEY = 'sd-phone:messages:shared-inbox:v1';

type Inbox = Record<string, Message[]>;

function read(): Inbox {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) { const p = JSON.parse(raw); if (p && typeof p === 'object') return p as Inbox; }
    } catch {}
    return {};
}
export function takeSharedMessages(convId: string): Message[] {
    return read()[convId] ?? [];
}
