import { apiCall } from '@/core/api';
import { getGameRender, type GameRender } from '@/render';
import { pickVideoMime, videoStreamingSupported } from '@/shared/liveMedia';

export interface RecorderMeta {
    cameraId: string;
    kind:     string;
    officer:  string;
    callsign: string | null;
    plate:    string | null;
    model:    string | null;
}

export interface RecorderState {
    recording: boolean;
    uploading: boolean;
    startedAt: number | null;
    error:     string | null;
}

export interface RecorderProfile {
    fps:        number;
    width:      number;
    bitrate:    number;
    maxSeconds: number;
    minSeconds: number;
}

const SLICE_BYTES = 192 * 1024;

const listeners = new Set<(state: RecorderState) => void>();

let state: RecorderState = { recording: false, uploading: false, startedAt: null, error: null };
let render: GameRender | null = null;
let surface: HTMLCanvasElement | null = null;
let recorder: MediaRecorder | null = null;
let pump: number | null = null;
let capTimer: number | null = null;
let parts: Blob[] = [];
let meta: RecorderMeta | null = null;
let startedAt = 0;

function emit(next: Partial<RecorderState>): void {
    state = { ...state, ...next };
    for (const fn of listeners) fn(state);
}

export function onRecorder(fn: (next: RecorderState) => void): () => void {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
}

export function recordingSupported(): boolean {
    return videoStreamingSupported();
}

function ensureSurface(): HTMLCanvasElement {
    if (surface) return surface;
    const canvas = document.createElement('canvas');
    canvas.id = 'mdt-bodycam-capture';
    canvas.style.display = 'none';
    document.body.append(canvas);
    surface = canvas;
    return canvas;
}

function teardown(): void {
    if (capTimer !== null) {
        window.clearTimeout(capTimer);
        capTimer = null;
    }
    if (pump !== null) {
        window.clearInterval(pump);
        pump = null;
    }
    try { render?.stop(); } catch { void 0; }
    render = null;
    recorder = null;
}

function encodeSlice(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('slice read failed'));
        reader.onload = () => {
            const value = typeof reader.result === 'string' ? reader.result : '';
            const comma = value.indexOf(',');
            resolve(comma >= 0 ? value.slice(comma + 1) : '');
        };
        reader.readAsDataURL(blob);
    });
}

async function upload(blob: Blob, mime: string, duration: number, forMeta: RecorderMeta): Promise<void> {
    const total = Math.max(1, Math.ceil(blob.size / SLICE_BYTES));

    emit({ uploading: true, error: null });

    const begun = await apiCall('sd-phone:mdt:recBegin', {
        cameraId: forMeta.cameraId,
        kind:     forMeta.kind,
        officer:  forMeta.officer,
        callsign: forMeta.callsign,
        plate:    forMeta.plate,
        model:    forMeta.model,
        mime,
        duration,
        total,
    });
    if (begun.success !== true) {
        emit({ uploading: false, error: begun.message ?? 'Could not start the upload' });
        return;
    }

    for (let seq = 1; seq <= total; seq++) {
        const from = (seq - 1) * SLICE_BYTES;
        const to = Math.min(blob.size, from + SLICE_BYTES);
        let part = '';
        try {
            part = await encodeSlice(blob.slice(from, to));
        } catch {
            void apiCall('sd-phone:mdt:recCancel', {});
            emit({ uploading: false, error: 'Could not read the recording' });
            return;
        }
        if (!part) {
            void apiCall('sd-phone:mdt:recCancel', {});
            emit({ uploading: false, error: 'Could not read the recording' });
            return;
        }
        await apiCall('sd-phone:mdt:recSlice', { seq, part });
    }
}

export async function startRecording(forMeta: RecorderMeta, profile: RecorderProfile): Promise<boolean> {
    if (state.recording || state.uploading) return false;

    const mime = recordingSupported() ? pickVideoMime() : '';
    if (!mime) {
        emit({ error: 'This terminal cannot record' });
        return false;
    }

    meta = forMeta;
    parts = [];

    try {
        const feed = await getGameRender();
        if (!feed) {
            emit({ error: 'This terminal cannot record' });
            return false;
        }
        render = feed;

        const source = ensureSurface();
        feed.setZoom(1);
        feed.setTargetFps(profile.fps);
        feed.renderToTarget(source);

        const screenW = Math.max(1, window.innerWidth);
        const screenH = Math.max(1, window.innerHeight);
        const outW = Math.max(160, Math.min(profile.width, screenW));
        const outH = Math.max(90, Math.round(outW * (screenH / screenW)));

        const off = document.createElement('canvas');
        off.width = outW;
        off.height = outH;
        const octx = off.getContext('2d');
        if (!octx) {
            teardown();
            emit({ error: 'This terminal cannot record' });
            return false;
        }
        octx.imageSmoothingEnabled = true;
        octx.imageSmoothingQuality = 'high';

        pump = window.setInterval(() => {
            if (source.width && source.height) octx.drawImage(source, 0, 0, outW, outH);
        }, Math.max(1, Math.round(1000 / profile.fps)));

        const stream = off.captureStream(profile.fps);
        const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: profile.bitrate });

        rec.ondataavailable = event => {
            if (event.data && event.data.size > 0) parts.push(event.data);
        };

        rec.onstop = () => {
            const duration = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
            const forWhat = meta;
            const collected = parts;
            parts = [];
            teardown();
            try { stream.getTracks().forEach(track => track.stop()); } catch { void 0; }
            emit({ recording: false, startedAt: null });

            if (!forWhat || collected.length === 0 || duration < profile.minSeconds) return;
            void upload(new Blob(collected, { type: mime }), mime, duration, forWhat);
        };

        startedAt = Date.now();
        rec.start(1000);
        recorder = rec;
        emit({ recording: true, startedAt, error: null });

        capTimer = window.setTimeout(() => { void stopRecording(); }, profile.maxSeconds * 1000);
        return true;
    } catch {
        teardown();
        emit({ recording: false, startedAt: null, error: 'Could not start recording' });
        return false;
    }
}

export function stopRecording(): void {
    const rec = recorder;
    if (!rec) return;
    try {
        if (rec.state !== 'inactive') rec.stop();
    } catch {
        teardown();
        emit({ recording: false, startedAt: null });
    }
}

export function abandonRecording(): void {
    const rec = recorder;
    parts = [];
    meta = null;
    if (rec) {
        try {
            if (rec.state !== 'inactive') {
                rec.ondataavailable = null;
                rec.onstop = null;
                rec.stop();
            }
        } catch { void 0; }
    }
    teardown();
    emit({ recording: false, startedAt: null });
}

export function uploadSettled(error?: string | null): void {
    emit({ uploading: false, error: error ?? null });
}

export function devPreviewState(next: Partial<RecorderState>): void {
    emit(next);
}
