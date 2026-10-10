import { apiCall, apiData, type Envelope } from '@/core/api';
import { fetchNui } from '@/core/nui';

export interface DirectUploadActions {
    slot: string;
    done: string;
}

export async function uploadDirect(
    blob: Blob,
    filename: string,
    actions: DirectUploadActions,
    slotPayload?: unknown,
): Promise<string | null> {
    const slot = await apiData<{ url: string }>(actions.slot, slotPayload);
    if (!slot || typeof slot.url !== 'string' || slot.url === '') return null;

    let hosted: string;
    try {
        const form = new FormData();
        form.append('file', blob, filename);
        const res = await fetch(slot.url, { method: 'POST', body: form });
        if (!res.ok) return null;
        const body = await res.json() as { data?: { url?: unknown } } | null;
        const url = body?.data?.url;
        if (typeof url !== 'string' || url === '') return null;
        hosted = url;
    } catch {
        return null;
    }

    const done = await apiCall(actions.done, { url: hosted });
    return done.success ? hosted : null;
}

const NUI_HOST_PREFIX = 'cfx-nui-';
const UPLOADER_READY_TIMEOUT_MS = 4000;
const UPLOAD_BASE_TIMEOUT_MS = 60000;
const UPLOAD_SLOWEST_BYTES_PER_MS = 64;
const ROUTE_PROBE_ACTION = 'sd-phone:media:httpProbe';
const ROUTE_PROBE_TIMEOUT_MS = 5000;
const ROUTE_RECHECK_MS = 5 * 60 * 1000;

interface Uploader {
    frame:  HTMLIFrameElement;
    probes: boolean;
}

type UploaderReply =
    | { answered: true; ok: boolean; result?: unknown }
    | { answered: false; progressed: boolean };

type RouteState = 'unproven' | 'alive' | 'unreachable' | 'stalled';

let uploader: Promise<Uploader | null> | null = null;
let nextRequestId = 0;
let route: RouteState = 'unproven';
let unreachableSince = 0;
let routeCheck: Promise<RouteState> | null = null;

function uploaderOrigin(): string | null {
    const host = window.location.host;
    return host.startsWith(NUI_HOST_PREFIX) ? `nui://${host.slice(NUI_HOST_PREFIX.length)}` : null;
}

function loadUploader(origin: string): Promise<Uploader | null> {
    return new Promise((resolve) => {
        const frame = document.createElement('iframe');
        frame.style.cssText = 'position:fixed;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
        frame.setAttribute('aria-hidden', 'true');

        const settle = (ready: Uploader | null) => {
            window.removeEventListener('message', onMessage);
            clearTimeout(timer);
            if (!ready) frame.remove();
            resolve(ready);
        };
        const onMessage = (event: MessageEvent) => {
            if (event.source !== frame.contentWindow || event.origin !== origin) return;
            const data = event.data as { kind?: unknown; probe?: unknown } | null;
            if (data?.kind === 'sd-phone:upload:ready') settle({ frame, probes: data.probe === true });
        };
        const timer = setTimeout(() => settle(null), UPLOADER_READY_TIMEOUT_MS);

        window.addEventListener('message', onMessage);
        frame.src = `${origin}/web/build/uploader.html`;
        document.body.appendChild(frame);
    });
}

function getUploader(origin: string): Promise<Uploader | null> {
    if (!uploader) {
        uploader = loadUploader(origin).then((ready) => {
            if (!ready) uploader = null;
            return ready;
        });
    }
    return uploader;
}

interface ServerUploadSlot {
    url:       string;
    partBytes: number;
}

type SlotAnswer = Envelope<ServerUploadSlot> & { code?: string };

type ProbeAnswer = Envelope<{ url: string }> & { code?: string };

export type ServerUploadSource = string | Blob;

function isEnvelope(value: unknown): value is Envelope<unknown> {
    return !!value && typeof value === 'object' && typeof (value as { success?: unknown }).success === 'boolean';
}

function refusedByServer(answer: SlotAnswer): boolean {
    return !answer.success && ((!!answer.code && answer.code !== 'unavailable') || !!answer.messageKey);
}

function encodedSize(source: ServerUploadSource): number {
    return typeof source === 'string' ? source.length : Math.ceil(source.size / 3) * 4;
}

function askUploader(
    frame: HTMLIFrameElement,
    origin: string,
    request: Record<string, unknown>,
    timeoutMs: number,
): Promise<UploaderReply> {
    return new Promise((resolve) => {
        const id = ++nextRequestId;
        let progressed = false;
        const settle = (reply: UploaderReply) => {
            window.removeEventListener('message', onMessage);
            clearTimeout(timer);
            resolve(reply);
        };
        const onMessage = (event: MessageEvent) => {
            if (event.source !== frame.contentWindow || event.origin !== origin) return;
            const data = event.data as { kind?: unknown; id?: unknown; ok?: unknown; result?: unknown } | null;
            if (!data || data.id !== id) return;
            if (data.kind === 'sd-phone:upload:progress') progressed = true;
            if (data.kind === 'sd-phone:upload:result') settle({ answered: true, ok: data.ok === true, result: data.result });
        };
        const timer = setTimeout(() => {
            frame.contentWindow?.postMessage({ kind: 'sd-phone:upload:cancel', id }, origin);
            settle({ answered: false, progressed });
        }, timeoutMs);

        window.addEventListener('message', onMessage);
        frame.contentWindow?.postMessage({ ...request, id }, origin);
    });
}

async function probeRoute(origin: string): Promise<boolean | null> {
    const ready = await getUploader(origin);
    if (!ready) return false;
    if (!ready.probes) return null;

    const answer = await fetchNui<ProbeAnswer>(ROUTE_PROBE_ACTION).catch(() => null);
    if (!isEnvelope(answer)) return null;
    if (!answer.success) return answer.code === 'unavailable' ? false : null;

    const url = answer.data?.url;
    if (typeof url !== 'string' || url === '') return null;

    const reply = await askUploader(ready.frame, origin, { kind: 'sd-phone:upload:probe', url }, ROUTE_PROBE_TIMEOUT_MS);
    return reply.answered && reply.ok;
}

function checkRoute(origin: string): Promise<RouteState> {
    if (!routeCheck) {
        routeCheck = probeRoute(origin).catch(() => null).then((reachable) => {
            routeCheck = null;
            if (route === 'stalled') return route;
            if (reachable === null) route = 'unproven';
            else route = reachable ? 'alive' : 'unreachable';
            unreachableSince = Date.now();
            return route;
        });
    }
    return routeCheck;
}

async function routeOpen(origin: string): Promise<boolean> {
    let state = route;
    if (state === 'unproven') state = await checkRoute(origin);
    else if (state === 'unreachable' && Date.now() - unreachableSince >= ROUTE_RECHECK_MS) void checkRoute(origin);
    return state === 'alive' || state === 'unproven';
}

export async function uploadViaServer<T = unknown>(
    source: ServerUploadSource,
    slotAction: string,
    slotPayload?: unknown,
): Promise<Envelope<T> | null> {
    const origin = uploaderOrigin();
    if (!origin) return null;
    if (!(await routeOpen(origin))) return null;

    const ready = await getUploader(origin);
    if (!ready) return null;

    const answer = await fetchNui<SlotAnswer>(slotAction, slotPayload);
    if (!isEnvelope(answer)) return null;
    if (refusedByServer(answer)) return answer as Envelope<T>;

    const slot = answer.success ? answer.data : undefined;
    if (!slot || typeof slot.url !== 'string' || slot.url === '' || typeof slot.partBytes !== 'number') return null;

    const reply = await askUploader(
        ready.frame,
        origin,
        { kind: 'sd-phone:upload', url: slot.url, partBytes: slot.partBytes, body: source },
        UPLOAD_BASE_TIMEOUT_MS + encodedSize(source) / UPLOAD_SLOWEST_BYTES_PER_MS,
    );

    if (!reply.answered && !reply.progressed) {
        route = 'stalled';
        return null;
    }
    if (!reply.answered || !reply.ok) {
        if (route !== 'stalled') route = 'unproven';
        return null;
    }

    route = 'alive';
    return (isEnvelope(reply.result) ? reply.result : { success: true }) as Envelope<T>;
}
