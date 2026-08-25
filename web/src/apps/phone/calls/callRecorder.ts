import { fetchNui, isFiveM } from '@/core/nui';
import { LiveAudioMixer } from '@/media/audioMixer';
import { CallPeer, fetchIceConfig, type Signal } from './webrtc';

export interface CallRecordMeta {
    peerNumber: string;
    peerName?: string;
    direction: 'incoming' | 'outgoing';
}

export interface CallRecordResult {
    ok: boolean;
    oneSided: boolean;
    seconds: number;
    error?: string;
}

function audioMime(): string {
    const MR = window.MediaRecorder;
    if (!MR || typeof MR.isTypeSupported !== 'function') return '';
    for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) {
        if (MR.isTypeSupported(t)) return t;
    }
    return '';
}

function toDataUrl(blob: Blob): Promise<string | null> {
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
    });
}

class CallRecorder {
    private peer: CallPeer | null = null;
    private mixer: LiveAudioMixer | null = null;
    private recorder: MediaRecorder | null = null;
    private mic: MediaStream | null = null;
    private chunks: Blob[] = [];
    private startedAt = 0;
    private meta: CallRecordMeta | null = null;
    private capped: ReturnType<typeof setTimeout> | null = null;

    private heardPeer = false;
    private answering = false;
    private pending: Signal[] = [];

    get active() { return this.recorder !== null; }

    private async openPeer(initiator: boolean) {
        const cfg = await fetchIceConfig();
        const peer = new CallPeer(cfg, initiator, 'record');
        peer.onRemote = (stream) => {
            if (stream.getAudioTracks().length === 0) return;
            this.heardPeer = true;
            this.mixer?.addStream(stream);
        };
        this.peer = peer;

        // Anything that arrived while this side was still fetching ICE config and asking for the
        // microphone is replayed now. Without it the offer lands on a null peer and is dropped,
        // negotiation never completes, and the recording comes out one-sided.
        const queued = this.pending;
        this.pending = [];
        for (const sig of queued) void peer.handle(sig);

        return peer;
    }

    private async captureMic(): Promise<MediaStream | null> {
        if (!navigator.mediaDevices?.getUserMedia) return null;
        try {
            return await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            return null;
        }
    }

    async start(meta: CallRecordMeta, maxMinutes: number): Promise<boolean> {
        if (this.active) return false;

        this.mixer = new LiveAudioMixer();
        this.mic = await this.captureMic();
        if (!this.mic) { this.teardown(); return false; }
        this.mixer.addStream(this.mic);

        // The far side is told before the offer is made, not after. It has to mount its own peer
        // and add its microphone before our offer reaches it; sending the offer first means it
        // arrives at a client that has no peer yet and is discarded.
        if (isFiveM) void fetchNui('sd-phone:record:start');

        const peer = await this.openPeer(true);
        await peer.start(this.mic);

        const track = this.mixer.ensureTrack();
        if (!track) { this.teardown(); return false; }

        const mime = audioMime();
        try {
            this.recorder = mime
                ? new MediaRecorder(new MediaStream([track]), { mimeType: mime })
                : new MediaRecorder(new MediaStream([track]));
        } catch {
            this.teardown();
            return false;
        }

        this.chunks = [];
        this.heardPeer = false;
        this.meta = meta;
        this.startedAt = Date.now();
        this.recorder.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
        this.recorder.start();

        this.capped = setTimeout(() => { void this.stop(); }, Math.max(1, maxMinutes) * 60_000);

        return true;
    }

    async acceptPeer() {
        if (this.answering || this.peer) return;
        this.answering = true;
        this.mixer = this.mixer ?? new LiveAudioMixer();
        this.mic = this.mic ?? await this.captureMic();
        const peer = await this.openPeer(false);
        await peer.start(this.mic);
        this.answering = false;
    }

    handleSignal(sig: Signal) {
        if (sig.slot !== 'record') return;
        if (this.peer) void this.peer.handle(sig);
        else this.pending.push(sig);
    }

    private teardown() {
        if (this.capped) { clearTimeout(this.capped); this.capped = null; }
        try { this.recorder?.stop(); } catch { /* already stopped */ }
        this.recorder = null;
        this.peer?.close();
        this.peer = null;
        this.mixer?.destroy();
        this.mixer = null;
        this.mic?.getTracks().forEach(t => { try { t.stop(); } catch { /* gone */ } });
        this.mic = null;
        this.answering = false;
        this.pending = [];
    }

    /** Ends the far side's half without uploading: used when they stopped, or the call dropped. */
    dropPeer() {
        this.peer?.close();
        this.peer = null;
        if (!this.active) this.teardown();
    }

    async stop(): Promise<CallRecordResult> {
        const rec = this.recorder;
        const meta = this.meta;
        if (!rec || !meta) { this.teardown(); return { ok: false, oneSided: true, seconds: 0, error: 'Not recording' }; }

        const seconds = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
        const oneSided = !this.heardPeer;

        const blob = await new Promise<Blob | null>(resolve => {
            rec.onstop = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' }) : null);
            try { rec.stop(); } catch { resolve(null); }
        });

        if (isFiveM) void fetchNui('sd-phone:record:stop');
        this.recorder = null;
        this.teardown();
        this.meta = null;

        if (!blob) return { ok: false, oneSided, seconds, error: 'Nothing was recorded' };

        const dataUrl = await toDataUrl(blob);
        if (!dataUrl) return { ok: false, oneSided, seconds, error: 'Could not read the recording' };

        if (!isFiveM) return { ok: true, oneSided, seconds };

        void fetchNui('sd-phone:callrec:upload', {
            audio:      dataUrl,
            duration:   seconds,
            oneSided,
            peerNumber: meta.peerNumber,
            peerName:   meta.peerName,
            direction:  meta.direction,
        });
        return { ok: true, oneSided, seconds };
    }
}

export const callRecorder = new CallRecorder();
