
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

const KEEP_SECONDS = 10;
const MAX_LAG      = 3;

type Op = { append: Uint8Array } | { remove: [number, number] };

export class LiveVideoPlayer {
    private video: HTMLVideoElement;
    private mime: string;
    private ms: MediaSource | null = null;
    private sb: SourceBuffer | null = null;
    private ops: Op[] = [];
    private objectUrl: string | null = null;
    private edgeTimer: ReturnType<typeof setInterval> | null = null;
    private destroyed = false;
    private started = false;

    constructor(video: HTMLVideoElement, mime: string) {
        this.video = video;
        this.mime = mime;
    }

    start(): void {
        if (this.started || this.destroyed) return;
        this.started = true;

        this.ms = new MediaSource();
        this.objectUrl = URL.createObjectURL(this.ms);
        this.video.muted = true;
        this.video.autoplay = true;
        this.video.playsInline = true;
        this.video.src = this.objectUrl;
        this.ms.addEventListener('sourceopen', this.onSourceOpen, { once: true });

        this.edgeTimer = setInterval(this.keepLiveEdge, 1000);
    }

    append(bytes: Uint8Array): void {
        if (this.destroyed) return;
        this.ops.push({ append: bytes });
        this.pump();
    }

    destroy(): void {
        this.destroyed = true;
        if (this.edgeTimer) { clearInterval(this.edgeTimer); this.edgeTimer = null; }
        try { if (this.ms && this.ms.readyState === 'open') this.ms.endOfStream(); } catch { /* already torn down */ }
        try { this.video.removeAttribute('src'); this.video.load(); } catch { /* element gone */ }
        if (this.objectUrl) { URL.revokeObjectURL(this.objectUrl); this.objectUrl = null; }
        this.sb = null;
        this.ms = null;
        this.ops = [];
    }

    private onSourceOpen = () => {
        if (this.destroyed || !this.ms) return;
        try {
            this.sb = this.ms.addSourceBuffer(this.mime);
            this.sb.mode = 'sequence';
            this.sb.addEventListener('updateend', this.pump);
        } catch {
            this.sb = null;
        }
        this.pump();
    };

    private pump = () => {
        const sb = this.sb;
        if (!sb || this.destroyed || sb.updating) return;
        if (this.ms && this.ms.readyState !== 'open') return;

        const op = this.ops.shift();
        if (!op) return;
        try {
            if ('append' in op) sb.appendBuffer(op.append as BufferSource);
            else sb.remove(op.remove[0], op.remove[1]);
        } catch (e) {
            if (e instanceof DOMException && e.name === 'QuotaExceededError') {
                this.ops.unshift(op);
                this.trimNow();
            }
            // Any other append error (a corrupt/partial segment) is skipped — the
            // next keyframe anchor recovers the stream.
        }
        void this.video.play?.().catch(() => {});
    };

    private keepLiveEdge = () => {
        const sb = this.sb;
        const v = this.video;
        if (!sb || this.destroyed || sb.updating || !sb.buffered.length) return;

        const end = sb.buffered.end(sb.buffered.length - 1);
        const start = sb.buffered.start(0);
        if (v.currentTime < start || end - v.currentTime > MAX_LAG) {
            try { v.currentTime = Math.max(start, end - 0.4); } catch { /* not seekable yet */ }
        }
        void v.play?.().catch(() => {});

        if (end - start > KEEP_SECONDS) {
            this.ops.push({ remove: [start, end - KEEP_SECONDS] });
            this.pump();
        }
    };

    private trimNow() {
        const sb = this.sb;
        if (!sb || !sb.buffered.length) return;
        const end = sb.buffered.end(sb.buffered.length - 1);
        const start = sb.buffered.start(0);
        if (end - start > 4) this.ops.unshift({ remove: [start, end - 4] });
    }
}
