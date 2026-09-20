import { blobToBase64, pickVideoMime } from '@/shared/liveMedia';
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

export type LiveTransport = 'relay' | 'event';

export interface LiveBroadcastEncoder {
    bitrate:     number;
    fps:         number;
    timesliceMs: number;
    keyframeMs:  number;
}

export interface LiveBroadcastOptions {
    source:      HTMLCanvasElement;
    enc:         LiveBroadcastEncoder;
    width?:      number;
    streamId:    string | null;
    liveId:      () => string | null;
    stopped:     () => boolean;
    sendChunk:   (liveId: string, chunk: string, init: boolean, mime: string | undefined) => Promise<boolean | void> | void;
    onTransport?: (transport: LiveTransport) => void;
}

export interface LiveBroadcast {
    stop(): void;
    transport(): LiveTransport;
}

const ANCHOR_MIN_MS = 1000;
const ANCHOR_DEFAULT_MS = 20000;
const DEFAULT_WIDTH = 540;
const FALLBACK_ASPECT = 16 / 9;
const BITRATE_FLOOR = 250000;
const SHED_FACTOR = 0.7;
const RECOVER_FACTOR = 1.2;
const RECOVER_RUNS = 5;

type Segment = (blob: Blob, init: boolean, key: boolean) => Promise<boolean | void>;

interface Encoding {
    stop(): void;
    anchor(): void;
    setSink(sink: Segment): void;
}

function encode(
    source: HTMLCanvasElement,
    enc: LiveBroadcastEncoder,
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
    let bitrate = enc.bitrate;
    let cleanRuns = 0;
    let run: { shed: boolean } | null = null;

    const spin = () => {
        if (stopped) return;
        if (run?.shed) {
            bitrate = Math.max(Math.min(BITRATE_FLOOR, enc.bitrate), Math.round(bitrate * SHED_FACTOR));
            cleanRuns = 0;
        } else if (run && bitrate < enc.bitrate && ++cleanRuns >= RECOVER_RUNS) {
            bitrate = Math.min(enc.bitrate, Math.round(bitrate * RECOVER_FACTOR));
            cleanRuns = 0;
        }
        const mine = { shed: false };
        run = mine;
        let seq = 0;
        let rec: MediaRecorder;
        try {
            rec = new MediaRecorder(stream, {
                ...(mime ? { mimeType: mime } : {}),
                videoBitsPerSecond: bitrate,
            });
        } catch {
            try {
                rec = new MediaRecorder(stream);
            } catch {
                return;
            }
        }
        rec.ondataavailable = event => {
            if (rec !== recorder || stopped || !event.data || !event.data.size) return;
            const at = sink;
            const blob = event.data;
            const init = seq === 0;
            const key = seq === 1;
            seq += 1;
            chain = chain
                .then(async () => {
                    if (stopped || sink !== at || mine.shed) return;
                    if ((await at(blob, init, key)) === false) mine.shed = true;
                })
                .catch(() => {});
        };
        rec.start(enc.timesliceMs);
        recorder = rec;
    };

    const anchor = () => {
        const old = recorder;
        if (old && old.state !== 'inactive') {
            try {
                old.stop();
            } catch {}
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
                try {
                    recorder.onstop = null;
                    recorder.stop();
                } catch {}
            }
            recorder = null;
            try {
                stream.getTracks().forEach(track => track.stop());
            } catch {}
        },
        anchor,
        setSink(next: Segment) {
            sink = next;
            anchor();
        },
    };
}

export function startLiveBroadcast(o: LiveBroadcastOptions): LiveBroadcast {
    const mime = pickVideoMime();

    const box = o.source.getBoundingClientRect();
    const outW = Math.max(120, Math.round(o.width ?? DEFAULT_WIDTH));
    const outH = Math.max(1, Math.round(outW * (box.height / box.width || FALLBACK_ASPECT)));

    const eventSink = (): Segment => async (blob, init) => {
        const bytes = await blobToBase64(blob);
        const id = o.liveId();
        if (!id || o.stopped()) return;
        return o.sendChunk(id, bytes, init, init ? mime : undefined);
    };

    const relaySink = (handle: RelayStreamHandle, onLost: () => void): Segment => async (blob, init, key) => {
        const buffer = await blob.arrayBuffer();
        const kind = init ? FRAME_INIT : key ? FRAME_KEY : FRAME_DELTA;
        const stamp = Math.max(0, Math.round(performance.now() * 1000));
        const sent = handle.send(kind, FLAG_NONE, stamp, new Uint8Array(buffer));
        if (!sent && kind !== FRAME_DELTA) onLost();
    };

    const encoding = encode(o.source, o.enc, outW, outH, mime, eventSink());
    if (!encoding) {
        return { stop() {}, transport: () => 'event' };
    }

    let handle: RelayStreamHandle | null = null;
    let current: LiveTransport = 'event';
    let stopped = false;

    const report = (next: LiveTransport) => {
        if (current === next) return;
        current = next;
        o.onTransport?.(next);
    };

    const downgrade = () => {
        const dead = handle;
        handle = null;
        if (dead) {
            try {
                dead.close();
            } catch {}
        }
        if (stopped || current !== 'relay') return;
        report('event');
        encoding.setSink(eventSink());
    };

    void (async () => {
        const key = o.streamId;
        if (!key || !relayAvailable()) return;
        const grant = await mintRelayToken('publish', key);
        if (stopped || !grant) return;
        const opened = await relayPublish({
            token: grant.token,
            key,
            gen:   grant.gen,
            desc: {
                mode:    'video',
                wire:    'mse',
                codec:   '',
                mime,
                width:   outW,
                height:  outH,
                fps:     o.enc.fps,
                bitrate: o.enc.bitrate,
            },
            onKeyframeRequest: () => encoding.anchor(),
            onState: state => {
                if (state === 'reset') encoding.anchor();
                else if (state === 'ended' || state === 'offline' || state === 'expired') downgrade();
            },
            onError: (_code, fatal) => {
                if (fatal) downgrade();
            },
        });
        if (stopped || !opened) {
            opened?.close();
            return;
        }
        handle = opened;
        report('relay');
        encoding.setSink(relaySink(opened, downgrade));
    })();

    return {
        stop() {
            stopped = true;
            encoding.stop();
            const dead = handle;
            handle = null;
            if (dead) {
                try {
                    dead.close();
                } catch {}
            }
        },
        transport: () => current,
    };
}
