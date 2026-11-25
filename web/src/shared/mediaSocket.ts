import { device } from '@device';
import { apiData } from '@/core/api';
import { isHostMessage } from '@/core/messageSource';
import { mediaDebug } from './mediaDebug';

export const SDMR_HEADER_BYTES = 24;
export const SDMR_MAGIC = 0xa7;
export const SDMR_VERSION = 0x01;
export const SDMR_SUBPROTOCOL = 'sdphone-media-v1';

export const FRAME_INIT = 0x01;
export const FRAME_KEY = 0x02;
export const FRAME_DELTA = 0x03;
export const FRAME_JPEG = 0x04;

export const FLAG_NONE = 0x00;
export const FLAG_REPLAY = 0x01;
export const FLAG_DISCONTINUITY = 0x02;

export const MAX_MESSAGE_BYTES = 1_048_576;
export const MAX_CONTROL_BYTES = 8_192;
export const MAX_STREAMS_PER_SOCKET = 12;

const CLIENT_PING_MS = 10_000;
const CONNECT_TIMEOUT_MS = 4_000;
const OP_TIMEOUT_MS = 3_000;
const SOFT_LIMIT = 1_048_576;
const HARD_LIMIT = 4_194_304;
const RECONNECT_BACKOFF_MS = [500, 1_000, 2_000, 4_000, 8_000];
const RECONNECT_MAX_ATTEMPTS = 5;
const RELAY_PENALTY_MS = 60_000;
const RELAY_PENALTY_LONG_MS = 300_000;

const ENDPOINT_EVENT = 'sd-phone:relay:endpoint';
const TOKEN_EVENT = 'sd-phone:relay:token';
const CHARACTER_LOADED = 'sd-phone:client:characterLoaded';

export type RelayState =
    | 'disabled'
    | 'idle'
    | 'connecting'
    | 'open'
    | 'reconnecting'
    | 'failed'
    | 'closed';

export interface RelayEndpoint {
    url: string | null;
    enabled: boolean;
    ttlSeconds: number;
    refreshLeadSeconds: number;
}

export type RelayRole = 'session' | 'publish' | 'watch';

export interface RelayGrant {
    url: string;
    token: string;
    streamId: string;
    role: RelayRole;
    gen: number;
    expiresAt: number;
    expiresInMs: number;
    ttlSeconds: number;
}

export interface RelayStreamDesc {
    mode: 'video' | 'image';
    wire: 'chunks' | 'mse';
    codec: string;
    mime: string;
    width: number;
    height: number;
    fps: number;
    bitrate?: number;
}

export interface RelayFrame {
    sid: number;
    kind: number;
    flags: number;
    gen: number;
    seq: number;
    timestampUs: number;
    payload: Uint8Array;
    replay: boolean;
    discontinuity: boolean;
}

export interface RelayStreamHandle {
    sid: number;
    key: string;
    gen: number;
    send(kind: number, flags: number, timestampUs: number, payload: Uint8Array): boolean;
    requestKeyframe(): void;
    close(): void;
}

export interface RelayPublishOptions {
    token: string;
    key: string;
    gen: number;
    desc: RelayStreamDesc;
    session?: string | null;
    onKeyframeRequest?: (reason: string) => void;
    onViewers?: (n: number) => void;
    onState?: (state: string, reason: string) => void;
    onError?: (code: string, fatal: boolean) => void;
}

export interface RelayJoinOptions {
    token: string;
    key: string;
    session?: string | null;
    onFrame: (f: RelayFrame) => void;
    onDesc?: (d: RelayStreamDesc, gen: number) => void;
    onState?: (state: string, reason: string) => void;
    onDrop?: (frames: number, bytes: number) => void;
    onError?: (code: string, fatal: boolean) => void;
}

export function encodeMediaFrame(
    sid: number,
    gen: number,
    seq: number,
    kind: number,
    flags: number,
    timestampUs: number,
    payload: Uint8Array,
): Uint8Array {
    const out = new Uint8Array(SDMR_HEADER_BYTES + payload.byteLength);
    const dv = new DataView(out.buffer);
    dv.setUint8(0, SDMR_MAGIC);
    dv.setUint8(1, SDMR_VERSION);
    dv.setUint8(2, kind & 0xff);
    dv.setUint8(3, flags & 0xff);
    dv.setUint32(4, sid >>> 0);
    dv.setUint32(8, gen >>> 0);
    dv.setUint32(12, seq >>> 0);
    const us = Number.isFinite(timestampUs) ? Math.max(0, Math.floor(timestampUs)) : 0;
    dv.setBigUint64(16, BigInt(us));
    out.set(payload, SDMR_HEADER_BYTES);
    return out;
}

export function decodeMediaFrame(data: ArrayBuffer): RelayFrame | null {
    if (data.byteLength < SDMR_HEADER_BYTES) return null;
    const dv = new DataView(data);
    if (dv.getUint8(0) !== SDMR_MAGIC || dv.getUint8(1) !== SDMR_VERSION) return null;
    const kind = dv.getUint8(2);
    if (kind < FRAME_INIT || kind > FRAME_JPEG) return null;
    const flags = dv.getUint8(3);
    return {
        sid: dv.getUint32(4),
        gen: dv.getUint32(8),
        seq: dv.getUint32(12),
        kind,
        flags,
        timestampUs: Number(dv.getBigUint64(16)),
        payload: new Uint8Array(data, SDMR_HEADER_BYTES),
        replay: (flags & FLAG_REPLAY) !== 0,
        discontinuity: (flags & FLAG_DISCONTINUITY) !== 0,
    };
}

export function relayUrlUsable(url: string): boolean {
    if (!url) return false;
    if (url.startsWith('wss://')) return true;
    if (!url.startsWith('ws://')) return false;
    const authority = url.slice(5).split('/')[0];
    const host = (authority.split('@').pop() ?? '').replace(/:\d+$/, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

const warned = new Set<string>();

function warnOnce(reason: string, detail?: unknown): void {
    if (warned.has(reason)) return;
    warned.add(reason);
    console.warn('[sd-phone:relay]', reason, detail ?? '');
}

interface EndpointResponse {
    url?: string;
    enabled?: boolean;
    ttlSeconds?: number;
    refreshLeadSeconds?: number;
}

interface GrantResponse {
    enabled?: boolean;
    url?: string;
    token?: string;
    streamId?: string;
    role?: string;
    gen?: number;
    expiresAt?: number;
    expiresInMs?: number;
    ttlSeconds?: number;
}

const DISABLED_ENDPOINT: RelayEndpoint = { url: null, enabled: false, ttlSeconds: 45, refreshLeadSeconds: 10 };

let endpointCache: RelayEndpoint | null = null;
let endpointInflight: Promise<RelayEndpoint> | null = null;

function normalizeEndpoint(res: EndpointResponse | null): RelayEndpoint {
    const url = typeof res?.url === 'string' && res.url.length > 0 ? res.url : null;
    const enabled = res?.enabled === true && url !== null && relayUrlUsable(url);
    if (url !== null && res?.enabled === true && !enabled) warnOnce('insecure_url', url);
    return {
        url,
        enabled,
        ttlSeconds: typeof res?.ttlSeconds === 'number' && res.ttlSeconds > 0 ? res.ttlSeconds : 45,
        refreshLeadSeconds:
            typeof res?.refreshLeadSeconds === 'number' && res.refreshLeadSeconds > 0 ? res.refreshLeadSeconds : 10,
    };
}

export async function mintRelayToken(role: RelayRole, streamId?: string): Promise<RelayGrant | null> {
    const endpoint = await fetchRelayEndpoint();
    if (!endpoint.enabled) return null;
    let res: GrantResponse | null;
    try {
        res = await apiData<GrantResponse>(TOKEN_EVENT, { role, streamId: streamId ?? '' });
    } catch {
        return null;
    }
    if (!res || res.enabled === false) return null;
    if (typeof res.token !== 'string' || res.token.length === 0) return null;
    const url = typeof res.url === 'string' && res.url.length > 0 ? res.url : (endpoint.url ?? '');
    if (!relayUrlUsable(url)) return null;
    return {
        url,
        token: res.token,
        streamId: typeof res.streamId === 'string' ? res.streamId : (streamId ?? ''),
        role: res.role === 'publish' || res.role === 'watch' || res.role === 'session' ? res.role : role,
        gen: typeof res.gen === 'number' ? res.gen : 0,
        expiresAt: typeof res.expiresAt === 'number' ? res.expiresAt : 0,
        expiresInMs: typeof res.expiresInMs === 'number' ? res.expiresInMs : endpoint.ttlSeconds * 1000,
        ttlSeconds: typeof res.ttlSeconds === 'number' ? res.ttlSeconds : endpoint.ttlSeconds,
    };
}

export function fetchRelayEndpoint(force = false): Promise<RelayEndpoint> {
    if (!force && endpointCache) return Promise.resolve(endpointCache);
    if (endpointInflight) return endpointInflight;
    endpointInflight = apiData<EndpointResponse>(ENDPOINT_EVENT)
        .then(res => {
            const value = normalizeEndpoint(res);
            endpointCache = value;
            endpointInflight = null;
            return value;
        })
        .catch(() => {
            endpointCache = DISABLED_ENDPOINT;
            endpointInflight = null;
            return DISABLED_ENDPOINT;
        });
    return endpointInflight;
}

export function resetRelayEndpoint(): void {
    endpointCache = null;
    endpointInflight = null;
}

type StreamRole = 'publish' | 'join';

interface StreamRec {
    sid: number;
    key: string;
    gen: number;
    role: StreamRole;
    seq: number;
    closed: boolean;
    onFrame?: (f: RelayFrame) => void;
    onDesc?: (d: RelayStreamDesc, gen: number) => void;
    onState?: (state: string, reason: string) => void;
    onDrop?: (frames: number, bytes: number) => void;
    onError?: (code: string, fatal: boolean) => void;
    onViewers?: (n: number) => void;
    onKeyframeRequest?: (reason: string) => void;
}

interface PendingOp {
    role: StreamRole;
    key: string;
    rec: StreamRec;
    settle: (handle: RelayStreamHandle | null) => void;
}

interface ControlMessage {
    t?: string;
    v?: number;
    sid?: number;
    key?: string;
    gen?: number;
    code?: string | number;
    reason?: string;
    message?: string;
    fatal?: boolean;
    state?: string;
    viewers?: number;
    frames?: number;
    bytes?: number;
    ts?: number;
    mode?: string;
    wire?: string;
    codec?: string;
    mime?: string;
    width?: number;
    height?: number;
    fps?: number;
    live?: boolean;
}

function descFrom(msg: ControlMessage): RelayStreamDesc {
    return {
        mode: msg.mode === 'image' ? 'image' : 'video',
        wire: msg.wire === 'mse' ? 'mse' : 'chunks',
        codec: typeof msg.codec === 'string' ? msg.codec : '',
        mime: typeof msg.mime === 'string' ? msg.mime : '',
        width: typeof msg.width === 'number' ? msg.width : 0,
        height: typeof msg.height === 'number' ? msg.height : 0,
        fps: typeof msg.fps === 'number' ? msg.fps : 0,
    };
}

function backoffFor(attempt: number): number {
    const base = RECONNECT_BACKOFF_MS[Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1)];
    return Math.round(base * (0.8 + Math.random() * 0.4));
}

class RelayConnection {
    private ws: WebSocket | null = null;
    private state: RelayState = 'idle';
    private attempts = 0;
    private penaltyUntil = 0;
    private pinned = false;
    private disposed = false;
    private closing = false;
    private sessionOverride: string | null = null;
    private byeReason = '';

    private connectTimer = 0;
    private pingTimer = 0;
    private reconnectTimer = 0;

    private streams = new Map<number, StreamRec>();
    private pending = new Map<string, PendingOp>();
    private waiters: ((ok: boolean) => void)[] = [];

    setSession(token: string | null): void {
        this.sessionOverride = token && token.length > 0 ? token : null;
    }

    available(): boolean {
        if (this.disposed || this.pinned) return false;
        if (Date.now() < this.penaltyUntil) return false;
        return endpointCache === null || endpointCache.enabled;
    }

    dispose(): void {
        this.disposed = true;
        this.closing = true;
        this.clearTimers();
        this.failPending();
        this.detachStreams('disposed');
        const ws = this.ws;
        this.ws = null;
        if (ws) {
            try {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'bye', reason: 'closing' }));
            } catch {
                warnOnce('bye_failed');
            }
            try {
                ws.close(1000, 'closing');
            } catch {
                warnOnce('close_failed');
            }
        }
        this.setState('closed');
    }

    async publish(o: RelayPublishOptions): Promise<RelayStreamHandle | null> {
        const gen = Number.isFinite(o.gen) ? Math.max(0, Math.floor(o.gen)) : 0;
        const rec: StreamRec = {
            sid: 0,
            key: o.key,
            gen,
            role: 'publish',
            seq: 0,
            closed: false,
            onState: o.onState,
            onError: o.onError,
            onViewers: o.onViewers,
            onKeyframeRequest: o.onKeyframeRequest,
        };
        const d = o.desc;
        return this.request('publish', o.key, o.token, o.session ?? null, rec, {
            t: 'publish',
            token: o.token,
            key: o.key,
            gen,
            mode: d.mode,
            wire: d.wire,
            codec: d.codec,
            mime: d.mime,
            width: Math.max(0, Math.floor(d.width)),
            height: Math.max(0, Math.floor(d.height)),
            fps: Math.max(0, Math.floor(d.fps)),
            bitrate: Math.max(1, Math.min(12_000_000, Math.floor(d.bitrate ?? 1_000_000))),
        });
    }

    async join(o: RelayJoinOptions): Promise<RelayStreamHandle | null> {
        const rec: StreamRec = {
            sid: 0,
            key: o.key,
            gen: 0,
            role: 'join',
            seq: 0,
            closed: false,
            onFrame: o.onFrame,
            onDesc: o.onDesc,
            onState: o.onState,
            onDrop: o.onDrop,
            onError: o.onError,
        };
        return this.request('join', o.key, o.token, o.session ?? null, rec, {
            t: 'join',
            token: o.token,
            key: o.key,
        });
    }

    private async request(
        role: StreamRole,
        key: string,
        token: string,
        session: string | null,
        rec: StreamRec,
        control: Record<string, unknown>,
    ): Promise<RelayStreamHandle | null> {
        if (this.disposed || this.pinned) return null;
        if (typeof token !== 'string' || token.length === 0) return null;
        if (typeof key !== 'string' || key.length === 0) return null;
        if (session) this.setSession(session);
        if (this.streams.size + this.pending.size >= MAX_STREAMS_PER_SOCKET) return null;

        const id = `${role}:${key}`;
        if (this.pending.has(id)) return null;

        const ok = await this.ensure();
        if (!ok || this.disposed) return null;

        return new Promise<RelayStreamHandle | null>(resolve => {
            let settled = false;
            let timer = 0;
            const settle = (handle: RelayStreamHandle | null) => {
                if (settled) return;
                settled = true;
                if (timer) window.clearTimeout(timer);
                this.pending.delete(id);
                resolve(handle);
            };
            timer = window.setTimeout(() => settle(null), OP_TIMEOUT_MS);
            this.pending.set(id, { role, key, rec, settle });
            if (!this.sendControl(control)) settle(null);
        });
    }

    private ensure(): Promise<boolean> {
        if (this.disposed || this.pinned) return Promise.resolve(false);
        if (this.state === 'open' && this.ws && this.ws.readyState === WebSocket.OPEN) {
            return Promise.resolve(true);
        }
        if (Date.now() < this.penaltyUntil) return Promise.resolve(false);
        if (this.state === 'connecting' || this.state === 'reconnecting') return this.wait();
        return this.connect();
    }

    private wait(): Promise<boolean> {
        return new Promise<boolean>(resolve => {
            this.waiters.push(resolve);
        });
    }

    private settleWaiters(ok: boolean): void {
        const list = this.waiters;
        this.waiters = [];
        for (const resolve of list) resolve(ok);
    }

    private async connect(): Promise<boolean> {
        this.setState(this.attempts > 0 ? 'reconnecting' : 'connecting');
        this.closing = false;

        const endpoint = await fetchRelayEndpoint(true);
        if (this.disposed) return false;
        if (!endpoint.enabled || !endpoint.url) {
            this.setState('disabled');
            this.settleWaiters(false);
            return false;
        }

        let session = this.sessionOverride;
        this.sessionOverride = null;
        if (!session) {
            const grant = await mintRelayToken('session');
            if (this.disposed) return false;
            session = grant ? grant.token : null;
        }
        if (!session) {
            warnOnce('no_session_token', 'the server would not mint a relay session token');
            this.giveUp('no_session', RELAY_PENALTY_MS);
            return false;
        }
        const sessionToken: string = session;

        let ws: WebSocket;
        try {
            ws = new WebSocket(endpoint.url, SDMR_SUBPROTOCOL);
        } catch (e) {
            warnOnce('construct_failed', e);
            this.pin('construct_failed');
            return false;
        }
        ws.binaryType = 'arraybuffer';
        this.ws = ws;
        this.byeReason = '';

        ws.onopen = () => {
            if (this.ws !== ws) return;
            this.sendControl({
                t: 'hello',
                v: 1,
                token: sessionToken,
                app: 'sd-phone',
                device: device.id === 'tablet' ? 'tablet' : 'phone',
                build: '1',
            });
        };
        ws.onmessage = (ev: MessageEvent) => {
            if (this.ws !== ws) return;
            if (typeof ev.data === 'string') this.onText(ev.data);
            else if (ev.data instanceof ArrayBuffer) this.onBinary(ev.data);
        };
        ws.onerror = () => {
            if (this.ws !== ws) return;
            warnOnce('socket_error');
        };
        ws.onclose = (ev: CloseEvent) => {
            if (this.ws !== ws) return;
            this.onClose(ev.code);
        };

        if (this.connectTimer) window.clearTimeout(this.connectTimer);
        this.connectTimer = window.setTimeout(() => {
            if (this.state === 'open' || this.disposed) return;
            warnOnce('connect_timeout');
            this.hardClose();
            this.giveUp('connect_timeout', RELAY_PENALTY_MS);
        }, CONNECT_TIMEOUT_MS);

        return this.wait();
    }

    private onText(raw: string): void {
        let msg: ControlMessage;
        try {
            msg = JSON.parse(raw) as ControlMessage;
        } catch {
            return;
        }
        if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

        switch (msg.t) {
            case 'welcome':
                this.onWelcome();
                return;
            case 'ready':
                this.onReady(msg);
                return;
            case 'joined':
                this.onJoined(msg);
                return;
            case 'stream':
                this.onStreamState(msg);
                return;
            case 'viewers': {
                const rec = this.recFor(msg.sid);
                rec?.onViewers?.(typeof msg.viewers === 'number' ? msg.viewers : 0);
                return;
            }
            case 'keyframe': {
                const rec = this.recFor(msg.sid);
                rec?.onKeyframeRequest?.(typeof msg.reason === 'string' ? msg.reason : 'viewer_request');
                return;
            }
            case 'drop': {
                const rec = this.recFor(msg.sid);
                rec?.onDrop?.(
                    typeof msg.frames === 'number' ? msg.frames : 0,
                    typeof msg.bytes === 'number' ? msg.bytes : 0,
                );
                return;
            }
            case 'error':
                this.onError(msg);
                return;
            case 'bye':
                this.byeReason = typeof msg.reason === 'string' ? msg.reason : '';
                return;
            case 'pong':
                return;
            default:
                return;
        }
    }

    private onWelcome(): void {
        if (this.connectTimer) {
            window.clearTimeout(this.connectTimer);
            this.connectTimer = 0;
        }
        this.attempts = 0;
        this.setState('open');
        this.startPing();
        this.settleWaiters(true);
    }

    private onReady(msg: ControlMessage): void {
        const op = this.takePending('publish', msg.key);
        if (!op) { this.releaseOrphan(msg, 'unpublish'); return; }
        this.attachStream(op, msg);
    }

    private onJoined(msg: ControlMessage): void {
        const op = this.takePending('join', msg.key);
        if (!op) { this.releaseOrphan(msg, 'leave'); return; }
        const handle = this.attachStream(op, msg);
        if (handle) op.rec.onDesc?.(descFrom(msg), op.rec.gen);
    }

    private releaseOrphan(msg: ControlMessage, op: 'leave' | 'unpublish'): void {
        const sid = typeof msg.sid === 'number' ? msg.sid : 0;
        if (sid > 0) this.sendControl({ t: op, sid });
    }

    private attachStream(op: PendingOp, msg: ControlMessage): RelayStreamHandle | null {
        const sid = typeof msg.sid === 'number' ? msg.sid : 0;
        if (sid <= 0) {
            op.settle(null);
            return null;
        }
        const rec = op.rec;
        rec.sid = sid;
        if (typeof msg.gen === 'number') rec.gen = msg.gen;
        this.streams.set(sid, rec);
        const handle = this.makeHandle(rec);
        op.settle(handle);
        return handle;
    }

    private onStreamState(msg: ControlMessage): void {
        const rec = this.recFor(msg.sid);
        if (!rec) return;
        if (typeof msg.gen === 'number' && msg.gen !== rec.gen) rec.gen = msg.gen;
        const state = typeof msg.state === 'string' ? msg.state : '';
        const reason = typeof msg.reason === 'string' ? msg.reason : '';
        mediaDebug('stream', state || '?', { key: rec.key, role: rec.role, gen: rec.gen, reason });
        if (state === 'live' && rec.role === 'join') rec.onDesc?.(descFrom(msg), rec.gen);
        rec.onState?.(state, reason);
    }

    private onError(msg: ControlMessage): void {
        const code = typeof msg.code === 'string' ? msg.code : 'internal';
        const fatal = msg.fatal === true;
        const rec = this.recFor(msg.sid);
        if (rec) {
            rec.onError?.(code, fatal);
            return;
        }
        for (const op of Array.from(this.pending.values())) {
            op.rec.onError?.(code, fatal);
            op.settle(null);
        }
        if (fatal) {
            for (const stream of Array.from(this.streams.values())) stream.onError?.(code, true);
        }
    }

    private onBinary(data: ArrayBuffer): void {
        const frame = decodeMediaFrame(data);
        if (!frame) return;
        const rec = this.streams.get(frame.sid);
        if (!rec || rec.closed || !rec.onFrame) return;
        if (frame.gen !== rec.gen) {
            if (frame.kind !== FRAME_INIT && frame.kind !== FRAME_KEY && frame.kind !== FRAME_JPEG) return;
            rec.gen = frame.gen;
        }
        rec.onFrame(frame);
    }

    private recFor(sid: number | undefined): StreamRec | null {
        if (typeof sid !== 'number') return null;
        const rec = this.streams.get(sid);
        return rec && !rec.closed ? rec : null;
    }

    private takePending(role: StreamRole, key: string | undefined): PendingOp | null {
        if (typeof key !== 'string') return null;
        const id = `${role}:${key}`;
        const op = this.pending.get(id);
        if (!op) return null;
        this.pending.delete(id);
        return op;
    }

    private makeHandle(rec: StreamRec): RelayStreamHandle {
        return {
            get sid() {
                return rec.sid;
            },
            get key() {
                return rec.key;
            },
            get gen() {
                return rec.gen;
            },
            send: (kind: number, flags: number, timestampUs: number, payload: Uint8Array): boolean =>
                this.sendFrame(rec, kind, flags, timestampUs, payload),
            requestKeyframe: (): void => {
                if (rec.closed) return;
                this.sendControl({ t: 'keyframe', sid: rec.sid });
            },
            close: (): void => {
                this.closeStream(rec);
            },
        };
    }

    private sendFrame(
        rec: StreamRec,
        kind: number,
        flags: number,
        timestampUs: number,
        payload: Uint8Array,
    ): boolean {
        const ws = this.ws;
        if (rec.closed || this.state !== 'open' || !ws || ws.readyState !== WebSocket.OPEN) return false;
        const total = SDMR_HEADER_BYTES + payload.byteLength;
        if (total > MAX_MESSAGE_BYTES) return false;
        const buffered = ws.bufferedAmount;
        if (buffered + total > HARD_LIMIT) return false;
        if (buffered > SOFT_LIMIT && kind === FRAME_DELTA) return false;
        const seq = rec.seq;
        rec.seq = (rec.seq + 1) >>> 0;
        try {
            ws.send(encodeMediaFrame(rec.sid, rec.gen, seq, kind, flags, timestampUs, payload) as BufferSource);
        } catch {
            return false;
        }
        return true;
    }

    private closeStream(rec: StreamRec): void {
        if (rec.closed) return;
        rec.closed = true;
        this.streams.delete(rec.sid);
        this.sendControl(rec.role === 'publish' ? { t: 'unpublish', sid: rec.sid } : { t: 'leave', sid: rec.sid });
    }

    private sendControl(msg: Record<string, unknown>): boolean {
        const ws = this.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) return false;
        const text = JSON.stringify(msg);
        if (text.length > MAX_CONTROL_BYTES) return false;
        try {
            ws.send(text);
        } catch {
            return false;
        }
        return true;
    }

    private startPing(): void {
        if (this.pingTimer) window.clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => {
            if (!this.sendControl({ t: 'ping', ts: Date.now() })) {
                window.clearInterval(this.pingTimer);
                this.pingTimer = 0;
            }
        }, CLIENT_PING_MS);
    }

    private clearTimers(): void {
        if (this.connectTimer) window.clearTimeout(this.connectTimer);
        if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
        if (this.pingTimer) window.clearInterval(this.pingTimer);
        this.connectTimer = 0;
        this.reconnectTimer = 0;
        this.pingTimer = 0;
    }

    private failPending(): void {
        for (const op of Array.from(this.pending.values())) op.settle(null);
        this.pending.clear();
    }

    private detachStreams(reason: string): boolean {
        const had = this.streams.size > 0;
        for (const rec of Array.from(this.streams.values())) {
            rec.closed = true;
            rec.onState?.('offline', reason);
        }
        this.streams.clear();
        return had;
    }

    private hardClose(): void {
        const ws = this.ws;
        this.ws = null;
        if (!ws) return;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
            ws.close();
        } catch {
            warnOnce('close_failed');
        }
    }

    private onClose(code: number): void {
        const wasOpen = this.state === 'open';
        this.ws = null;
        this.clearTimers();
        this.failPending();
        const had = this.detachStreams(this.byeReason || `close_${code}`);

        if (this.disposed || this.closing) {
            this.setState(this.disposed ? 'closed' : 'idle');
            this.settleWaiters(false);
            return;
        }

        if (code === 4400 || code === 4413 || code === 4500) {
            this.pin(`close_${code}`);
            return;
        }
        if (!wasOpen) {
            warnOnce('handshake_failed', code);
            this.giveUp('handshake_failed', RELAY_PENALTY_MS);
            return;
        }
        if (!had) {
            this.setState('idle');
            this.settleWaiters(false);
            return;
        }
        this.scheduleReconnect();
    }

    private scheduleReconnect(): void {
        if (this.attempts >= RECONNECT_MAX_ATTEMPTS) {
            this.giveUp('reconnect_exhausted', RELAY_PENALTY_LONG_MS);
            return;
        }
        const delay = backoffFor(this.attempts);
        this.attempts += 1;
        this.setState('reconnecting');
        this.settleWaiters(false);
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = 0;
            if (this.disposed || this.pinned) return;
            void this.connect();
        }, delay);
    }

    private giveUp(reason: string, penaltyMs: number): void {
        this.penaltyUntil = Date.now() + penaltyMs;
        this.attempts = 0;
        this.hardClose();
        this.clearTimers();
        this.failPending();
        this.detachStreams(reason);
        this.setState('failed');
        this.settleWaiters(false);
    }

    private pin(reason: string): void {
        warnOnce(`pinned_${reason}`);
        this.pinned = true;
        this.penaltyUntil = Number.MAX_SAFE_INTEGER;
        this.hardClose();
        this.clearTimers();
        this.failPending();
        this.detachStreams(reason);
        this.setState('disabled');
        this.settleWaiters(false);
    }

    private setState(next: RelayState): void {
        if (this.state !== next) mediaDebug('socket', 'state', { from: this.state, to: next });
        this.state = next;
    }
}

const connection = new RelayConnection();

export function relayAvailable(): boolean {
    return connection.available();
}

export function relayPublish(o: RelayPublishOptions): Promise<RelayStreamHandle | null> {
    return connection.publish(o).catch(() => null);
}

export function relayJoin(o: RelayJoinOptions): Promise<RelayStreamHandle | null> {
    return connection.join(o).catch(() => null);
}

if (typeof window !== 'undefined') {
    window.addEventListener('message', (event: MessageEvent) => {
        if (!isHostMessage(event)) return;
        const msg = event.data as { action?: string } | undefined;
        if (msg?.action === CHARACTER_LOADED) resetRelayEndpoint();
    });
    window.addEventListener('pagehide', () => connection.dispose());
}
