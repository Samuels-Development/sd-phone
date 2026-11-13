
export function pickRecorderMime(withAudio: boolean): string {
    const MR = window.MediaRecorder;
    if (!MR || typeof MR.isTypeSupported !== 'function') return '';
    const candidates = withAudio
        ? ['video/webm;codecs="vp9,opus"', 'video/webm;codecs="vp8,opus"', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
        : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (const t of candidates) {
        if (MR.isTypeSupported(t)) return t;
    }
    return '';
}

export class LiveAudioMixer {
    private ctx: AudioContext | null = null;
    private dest: MediaStreamAudioDestinationNode | null = null;
    private sources = new Map<MediaStream, MediaStreamAudioSourceNode>();
    private micStream: MediaStream | null = null;

    private ensure() {
        if (this.ctx) return;
        this.ctx = new AudioContext();
        this.dest = this.ctx.createMediaStreamDestination();
        void this.ctx.resume?.().catch(() => {});
    }

    async addMicrophone(): Promise<MediaStream | null> {
        if (!navigator.mediaDevices?.getUserMedia) return null;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.micStream = stream;
            this.addStream(stream);
            return stream;
        } catch {
            return null;
        }
    }

    addStream(stream: MediaStream) {
        this.ensure();
        if (!this.ctx || !this.dest || this.sources.has(stream)) return;
        if (stream.getAudioTracks().length === 0) return;
        const node = this.ctx.createMediaStreamSource(stream);
        node.connect(this.dest);
        this.sources.set(stream, node);
    }

    removeStream(stream: MediaStream) {
        const node = this.sources.get(stream);
        if (!node) return;
        try { node.disconnect(); } catch {}
        this.sources.delete(stream);
    }

    ensureTrack(): MediaStreamTrack | null {
        this.ensure();
        return this.track;
    }

    get track(): MediaStreamTrack | null {
        return this.dest?.stream.getAudioTracks()[0] ?? null;
    }

    hasAudio(): boolean {
        return this.sources.size > 0;
    }

    destroy() {
        for (const node of this.sources.values()) {
            try { node.disconnect(); } catch {}
        }
        this.sources.clear();
        if (this.micStream) {
            this.micStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
            this.micStream = null;
        }
        if (this.ctx) {
            try { void this.ctx.close(); } catch {}
            this.ctx = null;
            this.dest = null;
        }
    }
}
