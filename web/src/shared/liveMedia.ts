import { mediaDebug } from './mediaDebug';


export function pickVideoMime(): string {
    const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    const MR = window.MediaRecorder;
    for (const t of candidates) {
        if (MR && typeof MR.isTypeSupported === 'function' && MR.isTypeSupported(t)) return t;
    }
    return '';
}

export function videoStreamingSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const canCapture =
        typeof HTMLCanvasElement !== 'undefined' &&
        typeof HTMLCanvasElement.prototype.captureStream === 'function';
    return !!window.MediaRecorder && canCapture && pickVideoMime() !== '';
}

export function liveVideoPlaybackSupported(mime?: string): boolean {
    if (typeof window === 'undefined' || typeof window.MediaSource === 'undefined') return false;
    if (mime && typeof MediaSource.isTypeSupported === 'function') return MediaSource.isTypeSupported(mime);
    return true;
}

export function base64ToBytes(b64: string): Uint8Array {
    const comma = b64.indexOf(',');
    const raw = b64.startsWith('data:') && comma >= 0 ? b64.slice(comma + 1) : b64;
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

export function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const res = reader.result as string;
            const comma = res.indexOf(',');
            resolve(comma >= 0 ? res.slice(comma + 1) : res);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

export type LiveHealth = 'starting' | 'live' | 'recovering' | 'failed' | 'offair';

export interface LiveVideoPlayerOptions {
    onHealth?: (health: LiveHealth, reason?: string) => void;
    onNeedInit?: (reason: string) => void;
    timesliceMs?: number;
    keepSeconds?: number;
    maxLag?: number;
}

export interface LiveVideoStats {
    health: LiveHealth;
    framesDecoded: number;
    rebuilds: number;
    lastFrameAtMs: number;
    lastProgressAtMs: number;
    queued: number;
    queuedBytes: number;
    fault: string;
}

const KEEP_SECONDS = 10;
const MAX_LAG = 3;
const DRIFT_TRIM = 0.6;
const TRIM_RATE = 1.06;
const WATCHDOG_MS = 500;
const STALL_TICKS = 3;
const STALL_FEED_MS = 1_500;
const SB_STUCK_MS = 2_000;
const OPS_MAX = 60;
const OPS_MAX_BYTES = 4_194_304;
const SILENCE_FAIL_MS = 10_000;
const REBUILD_WINDOW_MS = 30_000;
const REBUILD_FAIL_COUNT = 3;
const PROGRESS_STALE_MS = 2_000;
const NEED_INIT_GAP_MS = 1_000;
const REORDER_MAX = 3;
const REORDER_MAX_BYTES = 2_097_152;
const DEFAULT_TIMESLICE_MS = 400;

type Op = { append: Uint8Array; init: boolean } | { remove: [number, number] };

export class LiveVideoPlayer {
    private video: HTMLVideoElement;
    private mime: string;
    private opts: LiveVideoPlayerOptions;

    private ms: MediaSource | null = null;
    private sb: SourceBuffer | null = null;
    private ops: Op[] = [];
    private opBytes = 0;
    private objectUrl: string | null = null;

    private watchTimer: ReturnType<typeof setInterval> | null = null;
    private destroyed = false;
    private started = false;
    private rebuilding = false;
    private pumping = false;
    private msOpened = false;
    private active = true;

    private gen: number | null = null;
    private nextSeq: number | null = null;
    private run: number | null = null;
    private pendingRun: number | null = null;
    private pending = new Map<number, Uint8Array>();
    private pendingBytes = 0;
    private sawExplicitInit = false;
    private awaitingInit = false;

    private lastFrameAt = 0;
    private lastProgressAt = 0;
    private lastFrames = 0;
    private lastTime = 0;
    private stallTicks = 0;
    private ticks = 0;
    private updatingSince = 0;
    private quotaStrikes = 0;
    private playingSeen = false;
    private framesEverAdvanced = false;
    private framesDecoded = 0;
    private liveSince = 0;
    private needInitAt = 0;
    private rebuildTimes: number[] = [];
    private healthState: LiveHealth = 'starting';
    private fault = '';

    private silenceMs = DEFAULT_TIMESLICE_MS * 3 + 1_000;
    private keepSeconds = KEEP_SECONDS;
    private maxLag = MAX_LAG;

    constructor(video: HTMLVideoElement, mime: string, opts: LiveVideoPlayerOptions = {}) {
        this.video = video;
        this.mime = mime;
        this.opts = opts;
        if (typeof opts.timesliceMs === 'number' && opts.timesliceMs > 0) {
            this.silenceMs = opts.timesliceMs * 3 + 1_000;
        }
        if (typeof opts.keepSeconds === 'number' && opts.keepSeconds > 1) this.keepSeconds = opts.keepSeconds;
        if (typeof opts.maxLag === 'number' && opts.maxLag > 0.5) this.maxLag = opts.maxLag;
    }

    start(): void {
        if (this.started || this.destroyed) return;
        this.started = true;
        this.setHealth('starting', 'start');
        this.attach();
    }

    append(bytes: Uint8Array, init = false, gen: number | null = null, seq: number | null = null, run: number | null = null): void {
        if (this.destroyed || !bytes || bytes.byteLength === 0) return;
        this.lastFrameAt = Date.now();
        if (this.healthState === 'offair') {
            this.setHealth('starting', 'resumed');
            if (this.started && !this.watchTimer) this.startWatchdog();
        }
        if (init) this.sawExplicitInit = true;

        if (gen !== null && Number.isFinite(gen)) {
            if (this.gen === null) {
                this.gen = gen;
            } else if (this.gen !== gen) {
                this.gen = gen;
                this.rebuild('gen_change');
            }
        }

        // A transport that numbers its chunks lets a hole be told apart from a swap. Both look
        // identical to the decoder - a fault a few hundred milliseconds later with no cause
        // attached - but they want opposite handling: a swap is put back in order and played, a
        // hole means every byte after it is undecodable until the next header.
        const numbered = seq !== null && Number.isFinite(seq);

        // Numbering restarts behind every header, so a number alone cannot say which run a chunk
        // belongs to: the run before this one had a chunk 10 too, and it may still be in flight.
        // The run it names is what tells a straggler from the chunk it would be mistaken for.
        if (numbered && run !== null && Number.isFinite(run)) {
            if (this.run !== null && run < this.run) return;
            if (this.run === null || run > this.run) {
                this.run = run;
                if (this.pendingRun !== run) {
                    this.dropPending();
                    this.pendingRun = run;
                }
                if (!init) this.nextSeq = null;
            }
        }

        if (init) {
            if (numbered) {
                this.nextSeq = seq + 1;
                this.forgetBefore(this.nextSeq);
            } else {
                this.dropPending();
            }
            this.awaitingInit = false;
            this.enqueue(bytes, true);
            this.drainPending();
            return;
        }

        if (numbered) {
            if (this.nextSeq === null) {
                // Nothing to measure against yet: these are the chunks that overtook the header
                // still on its way. Held rather than dropped, so the picture starts on the header
                // rather than on whatever arrives after it.
                this.hold(seq, bytes, false);
                return;
            }
            if (seq < this.nextSeq) return;
            if (seq > this.nextSeq) {
                this.hold(seq, bytes, true);
                return;
            }
            this.nextSeq = seq + 1;
            this.enqueue(bytes, false);
            this.drainPending();
            return;
        }

        // An unnumbered transport can only be taken at its word.
        if (this.awaitingInit) {
            if (this.sawExplicitInit) {
                this.needInit('awaiting_init');
                return;
            }
            this.awaitingInit = false;
        }
        this.enqueue(bytes, false);
    }

    /** Keeps one out-of-order chunk while the one before it is still in flight. */
    private hold(seq: number, bytes: Uint8Array, measured: boolean): void {
        this.pending.set(seq, bytes);
        this.pendingBytes += bytes.byteLength;
        if (this.pending.size <= REORDER_MAX && this.pendingBytes <= REORDER_MAX_BYTES) return;

        if (measured) {
            // The chunk this run is waiting on should have landed by now, so it was lost rather
            // than overtaken. Holding longer only delays the header that actually repairs this.
            this.dropPending();
            this.nextSeq = null;
            this.awaitingInit = true;
            this.needInit('gap');
            return;
        }

        // Still no header, so nothing here can be called missing. Keep the window small and keep
        // asking for the one thing that would make these playable.
        let oldest = Number.POSITIVE_INFINITY;
        for (const held of this.pending.keys()) if (held < oldest) oldest = held;
        const evicted = this.pending.get(oldest);
        if (evicted) {
            this.pending.delete(oldest);
            this.pendingBytes -= evicted.byteLength;
        }
        this.needInit('awaiting_init');
    }

    /** Empties the reorder window. */
    private dropPending(): void {
        this.pending.clear();
        this.pendingBytes = 0;
    }

    /** Forgets anything held from the run a new header has just replaced. */
    private forgetBefore(seq: number): void {
        for (const [held, bytes] of Array.from(this.pending)) {
            if (held >= seq) continue;
            this.pending.delete(held);
            this.pendingBytes -= bytes.byteLength;
        }
    }

    /** Queues one byte run for the SourceBuffer and starts it moving. */
    private enqueue(bytes: Uint8Array, init: boolean): void {
        this.ops.push({ append: bytes, init });
        this.opBytes += bytes.byteLength;
        this.guardQueue();
        this.pump();
    }

    /** Plays out whatever the reorder window is now holding in an unbroken line. */
    private drainPending(): void {
        if (this.nextSeq === null || this.pending.size === 0) return;
        let next = this.pending.get(this.nextSeq);
        while (next) {
            this.pending.delete(this.nextSeq);
            this.pendingBytes -= next.byteLength;
            this.nextSeq += 1;
            this.enqueue(next, false);
            next = this.pending.get(this.nextSeq);
        }
        if (this.pending.size === 0) this.pendingBytes = 0;
    }

    setActive(active: boolean): void {
        if (this.destroyed || this.active === active) return;
        this.active = active;
        if (!active) return;
        this.seekToEdge();
        this.needInit('resumed');
    }

    markOffAir(reason = 'offair'): void {
        if (this.destroyed) return;
        this.stopWatchdog();
        this.setHealth('offair', reason);
    }

    health(): LiveHealth {
        return this.healthState;
    }

    stats(): LiveVideoStats {
        return {
            health: this.healthState,
            framesDecoded: this.framesDecoded,
            rebuilds: this.rebuildTimes.length,
            lastFrameAtMs: this.lastFrameAt,
            lastProgressAtMs: this.lastProgressAt,
            queued: this.ops.length,
            queuedBytes: this.opBytes,
            fault: this.fault,
        };
    }

    destroy(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.stopWatchdog();
        this.teardown(true);
        this.ops = [];
        this.opBytes = 0;
    }

    private attach(): void {
        if (this.destroyed) return;
        let ms: MediaSource;
        try {
            ms = new MediaSource();
        } catch {
            this.fault = 'no_mediasource';
            this.setHealth('failed', 'no_mediasource');
            return;
        }
        this.ms = ms;
        this.msOpened = false;
        this.objectUrl = URL.createObjectURL(ms);
        this.video.muted = true;
        this.video.autoplay = true;
        this.video.playsInline = true;
        ms.addEventListener('sourceopen', this.onSourceOpen, { once: true });
        ms.addEventListener('sourceended', this.onSourceGone);
        ms.addEventListener('sourceclose', this.onSourceGone);
        this.video.addEventListener('playing', this.onPlaying);
        this.video.addEventListener('error', this.onVideoError);
        this.video.src = this.objectUrl;
        this.startWatchdog();
    }

    private teardown(final: boolean): void {
        const ms = this.ms;
        const sb = this.sb;

        if (ms) {
            ms.removeEventListener('sourceopen', this.onSourceOpen);
            ms.removeEventListener('sourceended', this.onSourceGone);
            ms.removeEventListener('sourceclose', this.onSourceGone);
        }
        if (sb) {
            sb.removeEventListener('updateend', this.onUpdateEnd);
            sb.removeEventListener('error', this.onSbError);
            sb.removeEventListener('abort', this.onSbAbort);
        }
        this.video.removeEventListener('playing', this.onPlaying);
        this.video.removeEventListener('error', this.onVideoError);

        if (ms && sb && ms.readyState === 'open') {
            try {
                sb.abort();
            } catch {
                this.fault = 'abort_failed';
            }
            try {
                ms.removeSourceBuffer(sb);
            } catch {
                this.fault = 'remove_buffer_failed';
            }
        }
        if (ms && ms.readyState === 'open' && final) {
            try {
                ms.endOfStream();
            } catch {
                this.fault = 'end_of_stream_failed';
            }
        }

        try {
            this.video.pause();
        } catch {
            this.fault = 'pause_failed';
        }
        try {
            this.video.removeAttribute('src');
            this.video.load();
        } catch {
            this.fault = 'reset_element_failed';
        }
        if (this.objectUrl) {
            URL.revokeObjectURL(this.objectUrl);
            this.objectUrl = null;
        }

        this.sb = null;
        this.ms = null;
        this.msOpened = false;
        this.updatingSince = 0;
    }

    private rebuild(reason: string): void {
        if (this.destroyed || this.rebuilding || !this.started) return;
        mediaDebug('player', 'rebuild', { reason, frames: this.framesDecoded, stallTicks: this.stallTicks });
        this.rebuilding = true;
        this.fault = reason;

        const now = Date.now();
        this.rebuildTimes = this.rebuildTimes.filter(at => now - at < REBUILD_WINDOW_MS);
        this.rebuildTimes.push(now);
        this.setHealth(this.rebuildTimes.length >= REBUILD_FAIL_COUNT ? 'failed' : 'recovering', reason);

        this.stopWatchdog();
        this.teardown(false);

        this.ops = [];
        this.opBytes = 0;
        this.awaitingInit = true;
        this.playingSeen = false;
        this.framesEverAdvanced = false;
        this.lastFrames = 0;
        this.lastTime = 0;
        this.stallTicks = 0;
        this.lastProgressAt = 0;
        this.quotaStrikes = 0;
        this.liveSince = 0;

        this.attach();
        this.rebuilding = false;

        // No init is replayed here, and nothing is appended until a fresh one arrives. These chunks
        // are slices of one continuous byte run rather than standalone segments, so an init only
        // describes the run it opened: re-priming with the last one and resuming at the live edge
        // splices bytes onto a header that does not describe them, the element faults again, and
        // the rebuild that follows repeats it. That loop is what a viewer sees as a flicker.
        this.nextSeq = null;
        this.dropPending();
        this.needInit(reason, true);
    }

    private onSourceOpen = () => {
        if (this.destroyed || !this.ms) return;
        this.msOpened = true;
        let sb: SourceBuffer;
        try {
            sb = this.ms.addSourceBuffer(this.mime);
        } catch {
            this.fault = 'add_source_buffer_failed';
            this.setHealth('failed', 'unsupported_mime');
            return;
        }
        try {
            sb.mode = 'sequence';
        } catch {
            this.fault = 'sequence_mode_failed';
            this.setHealth('failed', 'sequence_mode');
        }
        this.sb = sb;
        sb.addEventListener('updateend', this.onUpdateEnd);
        sb.addEventListener('error', this.onSbError);
        sb.addEventListener('abort', this.onSbAbort);
        this.pump();
    };

    private onSourceGone = () => {
        if (this.destroyed || this.rebuilding || !this.msOpened) return;
        this.rebuild('source_gone');
    };

    private onVideoError = () => {
        if (this.destroyed || this.rebuilding) return;
        this.rebuild('media_error');
    };

    private onPlaying = () => {
        this.playingSeen = true;
    };

    private onUpdateEnd = () => {
        this.updatingSince = 0;
        this.pump();
    };

    private onSbError = () => {
        if (this.destroyed || this.rebuilding) return;
        this.rebuild('sourcebuffer_error');
    };

    private onSbAbort = () => {
        this.updatingSince = 0;
    };

    private pump = () => {
        const sb = this.sb;
        if (!sb || this.destroyed || this.rebuilding || this.pumping) return;
        if (sb.updating) return;
        this.updatingSince = 0;

        const ms = this.ms;
        if (!ms || ms.readyState !== 'open') {
            if (this.msOpened) this.rebuild('source_not_open');
            return;
        }

        const op = this.ops.shift();
        if (!op) return;
        if ('append' in op) this.opBytes = Math.max(0, this.opBytes - op.append.byteLength);

        this.pumping = true;
        try {
            if ('append' in op) sb.appendBuffer(op.append as BufferSource);
            else sb.remove(op.remove[0], op.remove[1]);
        } catch (e) {
            this.pumping = false;
            this.onOpFailed(e, op);
            return;
        }
        this.pumping = false;
        this.updatingSince = Date.now();
        this.quotaStrikes = 0;
        if (this.active) void this.video.play?.().catch(() => {});
    };

    private onOpFailed(e: unknown, op: Op): void {
        const name = e instanceof DOMException ? e.name : '';
        if (name === 'QuotaExceededError') {
            this.quotaStrikes += 1;
            this.fault = 'quota';
            if (this.quotaStrikes >= 2) {
                this.quotaStrikes = 0;
                this.rebuild('quota_loop');
                return;
            }
            this.ops.unshift(op);
            if ('append' in op) this.opBytes += op.append.byteLength;
            if (this.trimNow()) this.pump();
            return;
        }
        this.quotaStrikes = 0;
        if (name === 'InvalidStateError' || this.video.error !== null) {
            this.rebuild('append_failed');
            return;
        }
        this.fault = name || 'append_error';
        this.setHealth('recovering', 'append_error');
        this.needInit('append_error');
    }

    private guardQueue(): void {
        if (this.ops.length <= OPS_MAX && this.opBytes <= OPS_MAX_BYTES) return;
        let anchor = -1;
        for (let i = this.ops.length - 1; i >= 0; i--) {
            const op = this.ops[i];
            if ('append' in op && op.init) {
                anchor = i;
                break;
            }
        }
        if (anchor > 0) {
            this.ops = this.ops.slice(anchor);
            this.recount();
            this.fault = 'queue_trimmed';
            this.needInit('queue_backpressure');
            return;
        }
        this.ops = [];
        this.opBytes = 0;
        this.rebuild('queue_overflow');
    }

    private recount(): void {
        let bytes = 0;
        for (const op of this.ops) if ('append' in op) bytes += op.append.byteLength;
        this.opBytes = bytes;
    }

    private trimNow(): boolean {
        const sb = this.sb;
        if (!sb || !sb.buffered.length) return false;
        const end = sb.buffered.end(sb.buffered.length - 1);
        const start = sb.buffered.start(0);
        if (end - start <= 4) return false;
        this.ops.unshift({ remove: [start, end - 4] });
        return true;
    }

    private seekToEdge(): void {
        const sb = this.sb;
        const v = this.video;
        if (!sb || this.destroyed || sb.updating || !sb.buffered.length) return;
        const end = sb.buffered.end(sb.buffered.length - 1);
        const start = sb.buffered.start(0);
        try {
            v.currentTime = Math.max(start, end - 0.4);
        } catch {
            this.fault = 'seek_failed';
        }
    }

    private keepLiveEdge(): void {
        const sb = this.sb;
        const v = this.video;
        if (!sb || this.destroyed || sb.updating || !sb.buffered.length) return;

        const end = sb.buffered.end(sb.buffered.length - 1);
        const start = sb.buffered.start(0);
        const lag = end - v.currentTime;
        if (v.currentTime < start || lag > this.maxLag) {
            this.seekToEdge();
            v.playbackRate = 1;
        } else if (lag > DRIFT_TRIM) {
            v.playbackRate = TRIM_RATE;
        } else if (v.playbackRate !== 1) {
            v.playbackRate = 1;
        }
        void v.play?.().catch(() => {});

        if (end - start > this.keepSeconds) {
            this.ops.push({ remove: [start, end - this.keepSeconds] });
            this.pump();
        }
    }

    private startWatchdog(): void {
        this.stopWatchdog();
        this.watchTimer = setInterval(this.tick, WATCHDOG_MS);
    }

    private stopWatchdog(): void {
        if (!this.watchTimer) return;
        clearInterval(this.watchTimer);
        this.watchTimer = null;
    }

    private tick = () => {
        if (this.destroyed || this.rebuilding) return;
        const now = Date.now();
        const v = this.video;
        const sb = this.sb;
        const ms = this.ms;

        if (v.error !== null) {
            this.rebuild('media_error');
            return;
        }
        if (this.msOpened && ms && ms.readyState !== 'open') {
            this.rebuild(`source_${ms.readyState}`);
            return;
        }
        if (sb && sb.updating && this.updatingSince > 0 && now - this.updatingSince > SB_STUCK_MS) {
            try {
                sb.abort();
            } catch {
                this.fault = 'abort_failed';
            }
            this.rebuild('sourcebuffer_stuck');
            return;
        }

        const frames =
            typeof v.getVideoPlaybackQuality === 'function' ? v.getVideoPlaybackQuality().totalVideoFrames : 0;
        const at = v.currentTime;
        if (frames !== this.lastFrames || Math.abs(at - this.lastTime) > 0.001) {
            if (frames > this.lastFrames) this.framesEverAdvanced = true;
            this.lastFrames = frames;
            this.lastTime = at;
            this.lastProgressAt = now;
            this.stallTicks = 0;
        } else {
            this.stallTicks += 1;
        }
        this.framesDecoded = frames;

        const silence = this.lastFrameAt > 0 ? now - this.lastFrameAt : 0;
        const feeding = this.lastFrameAt > 0 && silence <= this.silenceMs;

        if (this.lastFrameAt > 0 && !this.awaitingInit && this.stallTicks >= STALL_TICKS && silence <= STALL_FEED_MS) {
            this.rebuild('frame_stall');
            return;
        }

        if (this.ops.length > OPS_MAX || this.opBytes > OPS_MAX_BYTES) this.guardQueue();
        if (this.destroyed) return;
        const live = this.sb;
        if (live && !live.updating && this.ops.length > 0) this.pump();

        this.ticks += 1;
        if (this.active && this.ticks % 2 === 0) this.keepLiveEdge();

        if (this.healthState === 'offair') return;

        if (this.lastFrameAt > 0 && !feeding) {
            if (silence > SILENCE_FAIL_MS) this.setHealth('failed', 'feed_silence');
            else {
                this.setHealth('recovering', 'feed_silence');
                this.needInit('feed_silence');
            }
            return;
        }

        const progressing = this.lastProgressAt > 0 && now - this.lastProgressAt <= PROGRESS_STALE_MS;
        if (progressing && this.playingSeen && this.framesEverAdvanced && !this.awaitingInit) {
            this.setHealth('live', 'progress');
            if (this.liveSince > 0 && now - this.liveSince > REBUILD_WINDOW_MS) this.rebuildTimes = [];
        } else if (this.healthState === 'live') {
            this.setHealth('recovering', 'no_progress');
        }
    };

    private needInit(reason: string, force = false): void {
        const handler = this.opts.onNeedInit;
        if (!handler) return;
        const now = Date.now();
        if (!force && now - this.needInitAt < NEED_INIT_GAP_MS) return;
        this.needInitAt = now;
        handler(reason);
    }

    private setHealth(next: LiveHealth, reason?: string): void {
        if (next === 'live' && this.healthState !== 'live') this.liveSince = Date.now();
        if (next !== 'live') this.liveSince = 0;
        if (this.healthState === next) return;
        mediaDebug('player', 'health', { from: this.healthState, to: next, reason, frames: this.framesDecoded, rebuilds: this.rebuildTimes.length });
        this.healthState = next;
        this.opts.onHealth?.(next, reason);
    }
}
