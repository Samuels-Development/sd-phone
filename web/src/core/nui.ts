import { device } from '@device';

interface FiveMWindowish {
    GetParentResourceName?: () => string;
    location?: { hostname?: string; protocol?: string };
}

export function detectFiveM(win: FiveMWindowish | undefined): boolean {
    if (!win) return false;
    if (typeof win.GetParentResourceName === 'function') return true;
    const hostname = win.location?.hostname ?? '';
    const protocol = win.location?.protocol ?? '';
    return /^cfx-nui-/.test(hostname) || protocol === 'nui:';
}

export function parseResourceName(win: FiveMWindowish | undefined): string {
    if (win && typeof win.GetParentResourceName === 'function') {
        return win.GetParentResourceName();
    }
    const hostname = win?.location?.hostname ?? '';
    const match = /^cfx-nui-(.+)$/.exec(hostname);
    return match ? match[1] : 'sd-phone';
}

const currentWindow = typeof window !== 'undefined' ? (window as FiveMWindowish) : undefined;

export const isFiveM = detectFiveM(currentWindow);

const resourceName: string = parseResourceName(currentWindow);

export const hostResource = resourceName;

function withDevice(event: string, payload?: unknown): unknown {
    if (!event.startsWith('sd-phone:settings:')) return payload;
    if (payload !== undefined && (typeof payload !== 'object' || payload === null || Array.isArray(payload))) return payload;
    return { ...(payload as Record<string, unknown> | undefined), device: device.id };
}

export async function fetchNui<TResp = unknown>(event: string, rawPayload?: unknown): Promise<TResp> {
    const payload = withDevice(event, rawPayload);

    if (!isFiveM) {
        console.debug('[sd-phone:dev] fetchNui ->', event, payload);
        return { ok: true } as unknown as TResp;
    }

    const rpc  = device.rpcAction;
    const url  = rpc ? `https://${resourceName}/${rpc}` : `https://${resourceName}/${event}`;
    const body = rpc ? { action: event, payload: payload ?? {} } : (payload ?? {});

    const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body:    JSON.stringify(body),
    });
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as TResp;
}
