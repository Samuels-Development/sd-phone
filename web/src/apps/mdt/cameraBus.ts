export interface CameraEncoder {
    fps:         number;
    width:       number;
    bitrate:     number;
    timesliceMs: number;
    keyframeMs:  number;
}

export interface CameraDemand {
    on:         boolean;
    citizenid?: string;
    gen?:      number;
    quality?:  string;
    enc?:      CameraEncoder;
    streamId?: string;
}

export type CameraTransport = 'relay' | 'event' | 'peer';

export interface CameraTransportPush {
    citizenid: string;
    transport: CameraTransport;
}

export interface CameraChunkPush {
    citizenid: string;
    gen?:      number;
    run?:      number;
    seq?:      number;
    chunk?:    string;
    init?:     boolean;
    mime?:     string;
}

export interface CameraPrimePush {
    citizenid: string;
    gen?:      number;
    run?:      number;
    seq?:      number;
    mime?:     string;
    chunks?:   string[];
}

export interface CameraSignalPush {
    citizenid: string;
    from:      number;
    kind:      'offer' | 'answer' | 'ice';
    data?:     { sdp?: string } & Record<string, unknown>;
}

export interface CameraPeersPush {
    gen?:     number;
    viewers?: number[];
    encode?:  boolean;
}

export interface CameraAnchorPush {
    gen?: number;
}

export interface CameraOffPush {
    citizenid: string;
    reason?:   string;
}

type Handler<T> = (data: T) => void;

const CHUNK_ACTION     = 'sd-phone:mdt:cameraChunk';
const OFF_ACTION       = 'sd-phone:mdt:cameraOff';
const DEMAND_ACTION    = 'sd-phone:mdt:cameraDemand';
const TRANSPORT_ACTION = 'sd-phone:mdt:cameraTransport';
const ANCHOR_ACTION    = 'sd-phone:mdt:cameraAnchor';
const PRIME_ACTION     = 'sd-phone:mdt:cameraPrime';
const SIGNAL_ACTION    = 'sd-phone:mdt:cameraSignal';
const PEERS_ACTION     = 'sd-phone:mdt:cameraPeers';

const chunkSubs = new Map<string, Set<Handler<CameraChunkPush>>>();
const offSubs = new Map<string, Set<Handler<CameraOffPush>>>();
const transportSubs = new Map<string, Set<Handler<CameraTransportPush>>>();
const primeSubs = new Map<string, Set<Handler<CameraPrimePush>>>();
const signalSubs = new Map<string, Set<Handler<CameraSignalPush>>>();
const peersSubs = new Set<Handler<CameraPeersPush | undefined>>();
const demandSubs = new Set<Handler<CameraDemand | undefined>>();
const anchorSubs = new Set<Handler<CameraAnchorPush | undefined>>();

let listening = false;

function fan<T extends { citizenid: string }>(subs: Map<string, Set<Handler<T>>>, data: T | undefined): void {
    if (!data || typeof data.citizenid !== 'string') return;
    const set = subs.get(data.citizenid);
    if (!set?.size) return;
    for (const handler of Array.from(set)) handler(data);
}

function ensureListener(): void {
    if (listening || typeof window === 'undefined') return;
    listening = true;
    window.addEventListener('message', (event: MessageEvent) => {
        const msg = event.data as { action?: string; data?: unknown } | undefined;
        if (!msg?.action) return;
        if (msg.action === CHUNK_ACTION) fan(chunkSubs, msg.data as CameraChunkPush | undefined);
        else if (msg.action === PRIME_ACTION) fan(primeSubs, msg.data as CameraPrimePush | undefined);
        else if (msg.action === SIGNAL_ACTION) fan(signalSubs, msg.data as CameraSignalPush | undefined);
        else if (msg.action === OFF_ACTION) fan(offSubs, msg.data as CameraOffPush | undefined);
        else if (msg.action === TRANSPORT_ACTION) fan(transportSubs, msg.data as CameraTransportPush | undefined);
        else if (msg.action === DEMAND_ACTION) {
            for (const handler of Array.from(demandSubs)) handler(msg.data as CameraDemand | undefined);
        } else if (msg.action === PEERS_ACTION) {
            for (const handler of Array.from(peersSubs)) handler(msg.data as CameraPeersPush | undefined);
        } else if (msg.action === ANCHOR_ACTION) {
            for (const handler of Array.from(anchorSubs)) handler(msg.data as CameraAnchorPush | undefined);
        }
    });
}

function subscribe<T>(subs: Map<string, Set<Handler<T>>>, key: string, handler: Handler<T>): () => void {
    ensureListener();
    let set = subs.get(key);
    if (!set) { set = new Set(); subs.set(key, set); }
    set.add(handler);
    return () => {
        set.delete(handler);
        if (set.size === 0) subs.delete(key);
    };
}

export function onCameraChunk(citizenid: string, handler: Handler<CameraChunkPush>): () => void {
    return subscribe(chunkSubs, citizenid, handler);
}

export function onCameraSignal(citizenid: string, handler: Handler<CameraSignalPush>): () => void {
    return subscribe(signalSubs, citizenid, handler);
}

export function onCameraPeers(handler: Handler<CameraPeersPush | undefined>): () => void {
    ensureListener();
    peersSubs.add(handler);
    return () => { peersSubs.delete(handler); };
}

export function onCameraPrime(citizenid: string, handler: Handler<CameraPrimePush>): () => void {
    return subscribe(primeSubs, citizenid, handler);
}

export function onCameraOff(citizenid: string, handler: Handler<CameraOffPush>): () => void {
    return subscribe(offSubs, citizenid, handler);
}

export function onCameraTransport(citizenid: string, handler: Handler<CameraTransportPush>): () => void {
    return subscribe(transportSubs, citizenid, handler);
}

export function onCameraDemand(handler: Handler<CameraDemand | undefined>): () => void {
    ensureListener();
    demandSubs.add(handler);
    return () => { demandSubs.delete(handler); };
}

export function onCameraAnchor(handler: Handler<CameraAnchorPush | undefined>): () => void {
    ensureListener();
    anchorSubs.add(handler);
    return () => { anchorSubs.delete(handler); };
}
