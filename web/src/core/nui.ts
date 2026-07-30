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

/** The resource serving this NUI page. Custom-app iframes load their SDK from it. */
export const hostResource = resourceName;

export async function fetchNui<TResp = unknown>(event: string, payload?: unknown): Promise<TResp> {
    if (!isFiveM) {
        console.debug('[sd-phone:dev] fetchNui ->', event, payload);
        return { ok: true } as unknown as TResp;
    }

    // Phone: post straight to the action's own callback, as it always has.
    // Companion device (sd-tablet): wrap every action in one envelope posted to a single
    // callback, which forwards it into sd-phone's client. A companion cannot register the
    // ~460 action names this UI uses - many are built at runtime - and a missing callback
    // would 404 into a JSON parse error rather than a usable response.
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
