import { fetchNui, isFiveM } from '@/core/nui';
import { getGameRender, PORTRAIT_CROP, type GameRender } from '@/render';
import { blobToBase64, pickVideoMime, videoStreamingSupported } from '@/shared/liveMedia';
import {
    FLAG_NONE,
    FRAME_DELTA,
    FRAME_INIT,
    FRAME_KEY,
    mintRelayToken,
    relayAvailable,
    relayPublish,
    type RelayStreamHandle,
} from '@/shared/mediaSocket';
import { onCameraAnchor, onCameraDemand, type CameraAnchorPush, type CameraDemand, type CameraEncoder } from './cameraBus';
import { mediaDebug } from '@/shared/mediaDebug';

const FALLBACK_ASPECT = 16 / 9;
const CAPTURE_ZOOM = PORTRAIT_CROP.width;
const ANCHOR_MIN_MS = 1000;
const ANCHOR_DEFAULT_MS = 20000;
// Comfortably inside the server's own 600000 byte ceiling on one base64 chunk.
const MAX_EVENT_CHUNK = 400000;

let targetGen: number | null = null;
let startToken = 0;
let teardown: (() => void) | null = null;
/** Restarts the encoder on the running publish, so the next chunk is a fresh header. */
let anchorNow: (() => void) | null = null;
let sampler: ReturnType<typeof setInterval> | null = null;
let encodedBytes = 0;
let render: GameRender | null = null;
let surface: HTMLCanvasElement | null = null;
let reported = '';

function reportState(state: 'ok' | 'unsupported', relay: boolean): void {
    const next = `${state}:${relay ? 'relay' : 'event'}`;
    if (reported === next) return;
    reported = next;
    void fetchNui('sd-phone:mdt:cameraState', { unsupported: state === 'unsupported', relay });
}

function feedAspect(): number {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return FALLBACK_ASPECT;
    const fraction = Math.min(1, PORTRAIT_CROP.width / CAPTURE_ZOOM);
    const aspect = (fraction * w) / h;
    return aspect > 0 ? aspect : FALLBACK_ASPECT;
}

function ensureSurface(): HTMLCanvasElement {
    if (surface) return surface;
    const canvas = document.createElement('canvas');
    canvas.id = 'mdt-bodycam-surface';
    canvas.style.display = 'none';
    document.body.append(canvas);
    surface = canvas;
    return canvas;
}

type Segment = (blob: Blob, init: boolean, key: boolean) => Promise<void>;

interface Encoding {
    stop(): void;
    anchor(): void;
    setSink(sink: Segment): void;
}

function eventSink(gen: number, mime: string): Segment {
    return async (blob, init) => {
        const chunk = await blobToBase64(blob);

        // The server refuses a chunk past its ceiling, and on this transport a refused chunk is a
        // hole rather than a dropped frame: everything after it is undecodable until the next
        // header. A recorder pushed hard enough will produce one, so the encoded run is cut into
        // pieces that fit instead. Any cut is legal here because what travels is a byte run, not a
        // frame, and only the first piece opens it.
        if (chunk.length <= MAX_EVENT_CHUNK) {
            await fetchNui('sd-phone:mdt:cameraChunk', { gen, chunk, init, mime: init ? mime : undefined });
            return;
        }

        for (let at = 0; at < chunk.length; at += MAX_EVENT_CHUNK) {
            const piece = chunk.slice(at, at + MAX_EVENT_CHUNK);
            const opens = init && at === 0;
            await fetchNui('sd-phone:mdt:cameraChunk', { gen, chunk: piece, init: opens, mime: opens ? mime : undefined });
        }
    };
}

function relaySink(handle: RelayStreamHandle, onLost: () => void): Segment {
    return async (blob, init, key) => {
        const buffer = await blob.arrayBuffer();
        const kind = init ? FRAME_INIT : key ? FRAME_KEY : FRAME_DELTA;
        const stamp = Math.max(0, Math.round(performance.now() * 1000));
        const sent = handle.send(kind, FLAG_NONE, stamp, new Uint8Array(buffer));
        if (!sent && kind !== FRAME_DELTA) onLost();
    };
}

function encode(
    source: HTMLCanvasElement,
    enc: CameraEncoder,
    outW: number,
    outH: number,
    mime: string,
    first: Segment,
): Encoding | null {
    const off = document.createElement('canvas');
    off.width = outW;
    off.height = outH;
    const octx = off.getContext('2d');
    if (!octx) return null;

    const pump = setInterval(() => {
        if (source.width && source.height) octx.drawImage(source, 0, 0, outW, outH);
    }, Math.max(1, Math.round(1000 / enc.fps)));

    let stream: MediaStream;
    try {
        stream = off.captureStream(enc.fps);
    } catch {
        clearInterval(pump);
        return null;
    }

    let recorder: MediaRecorder | null = null;
    let stopped = false;
    let sink = first;
    let chain: Promise<void> = Promise.resolve();

    const spin = () => {
        if (stopped) return;
        let seq = 0;
        let rec: MediaRecorder;
        try {
            rec = new MediaRecorder(stream, {
                ...(mime ? { mimeType: mime } : {}),
                videoBitsPerSecond: enc.bitrate,
            });
        } catch {
            try { rec = new MediaRecorder(stream); } catch { return; }
        }
        rec.ondataavailable = (event) => {
            if (rec !== recorder || stopped || !event.data || !event.data.size) return;
            const at = sink;
            const blob = event.data;
            const init = seq === 0;
            const key = seq === 1;
            seq += 1;
            encodedBytes += blob.size;
            chain = chain
                .then(() => (stopped || sink !== at ? undefined : at(blob, init, key)))
                .catch(() => {});
        };
        rec.start(enc.timesliceMs);
        recorder = rec;
    };

    const anchor = () => {
        const old = recorder;
        if (old && old.state !== 'inactive') {
            try { old.stop(); } catch { /* already stopping */ }
        }
        spin();
    };

    const beat = setInterval(anchor, Math.max(ANCHOR_MIN_MS, Math.round(enc.keyframeMs || ANCHOR_DEFAULT_MS)));

    spin();

    return {
        stop() {
            stopped = true;
            clearInterval(beat);
            clearInterval(pump);
            if (recorder && recorder.state !== 'inactive') {
                try { recorder.onstop = null; recorder.stop(); } catch { /* already inactive */ }
            }
            recorder = null;
            try { stream.getTracks().forEach(track => track.stop()); } catch { /* tracks gone */ }
        },
        anchor,
        setSink(next: Segment) {
            sink = next;
            anchor();
        },
    };
}

function stopPublishing(): void {
    if (sampler !== null) { clearInterval(sampler); sampler = null; }
    if (teardown) {
        try { teardown(); } catch { /* best effort */ }
        teardown = null;
    }
    if (render) {
        try {
            render.stop();
            render.setZoom(1);
            render.setOrientation('portrait');
            render.setSelfie(false);
        } catch { /* renderer gone */ }
        render = null;
    }
    reported = '';
}

async function startPublishing(demand: CameraDemand, token: number): Promise<void> {
    const enc = demand.enc;
    const gen = demand.gen ?? 0;
    if (!enc) return;

    if (!videoStreamingSupported()) {
        reportState('unsupported', false);
        return;
    }

    const feed = await getGameRender();
    if (token !== startToken) return;
    if (!feed) {
        reportState('unsupported', false);
        return;
    }

    const canvas = ensureSurface();
    feed.setOrientation('portrait');
    feed.setSelfie(false);
    feed.setZoom(CAPTURE_ZOOM);
    feed.setTargetFps(enc.fps);
    feed.renderToTarget(canvas);
    render = feed;

    if (sampler !== null) clearInterval(sampler);
    let lastFrames = feed.framesRendered();
    sampler = setInterval(() => {
        const now = feed.framesRendered();
        const kbps = Math.round((encodedBytes * 8) / 1000);
        encodedBytes = 0;
        mediaDebug('render', 'fps', { want: enc.fps, got: now - lastFrames, w: enc.width, wantKbps: Math.round(enc.bitrate / 1000), gotKbps: kbps });
        lastFrames = now;
    }, 1000);

    const mime = pickVideoMime();
    const outW = Math.max(120, Math.round(enc.width));
    const outH = Math.max(1, Math.round(outW / feedAspect()));

    let encoding: Encoding | null = null;
    let handle: RelayStreamHandle | null = null;

    const downgrade = () => {
        if (token !== startToken || !handle) return;
        const dead = handle;
        handle = null;
        try { dead.close(); } catch { /* socket already gone */ }
        reportState('ok', false);
        encoding?.setSink(eventSink(gen, mime));
    };

    const key = demand.streamId ?? null;
    if (key && relayAvailable()) {
        const grant = await mintRelayToken('publish', key);
        if (token !== startToken) return;
        if (grant) {
            handle = await relayPublish({
                token: grant.token,
                key,
                gen,
                desc: {
                    mode: 'video',
                    wire: 'mse',
                    codec: '',
                    mime,
                    width: outW,
                    height: outH,
                    fps: enc.fps,
                    bitrate: enc.bitrate,
                },
                onKeyframeRequest: () => encoding?.anchor(),
                onState: (state) => {
                    if (state === 'reset') encoding?.anchor();
                    else if (state === 'ended' || state === 'offline') downgrade();
                },
                onError: (_code, fatal) => { if (fatal) downgrade(); },
            });
        }
    }

    if (token !== startToken) {
        handle?.close();
        return;
    }

    encoding = encode(canvas, enc, outW, outH, mime, handle ? relaySink(handle, downgrade) : eventSink(gen, mime));
    if (!encoding) {
        handle?.close();
        stopPublishing();
        reportState('unsupported', false);
        return;
    }

    const live = encoding;
    anchorNow = () => live.anchor();
    teardown = () => {
        anchorNow = null;
        live.stop();
        if (handle) {
            try { handle.close(); } catch { /* socket already gone */ }
            handle = null;
        }
    };
    reportState('ok', handle !== null);
}

function applyDemand(demand: CameraDemand | undefined): void {
    if (!demand || demand.on !== true || !demand.enc) {
        targetGen = null;
        startToken += 1;
        stopPublishing();
        return;
    }
    const gen = demand.gen ?? 0;
    if (targetGen === gen) return;
    targetGen = gen;
    startToken += 1;
    stopPublishing();
    void startPublishing(demand, startToken);
}

/** The server asking for a fresh header, because a terminal has nothing it can start from. */
function applyAnchor(push: CameraAnchorPush | undefined): void {
    if (targetGen === null) return;
    if (push?.gen !== undefined && push.gen !== targetGen) return;
    anchorNow?.();
}

if (isFiveM) {
    onCameraDemand(applyDemand);
    onCameraAnchor(applyAnchor);

    void fetchNui<{ success?: boolean; data?: CameraDemand }>('sd-phone:mdt:cameraSync')
        .then(res => applyDemand(res?.data))
        .catch(() => {});
}
