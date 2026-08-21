import { apiData } from '@/core/api';
import { fetchNui, isFiveM } from '@/core/nui';
import { mediaDebug } from '@/shared/mediaDebug';
import { onCameraSignal, type CameraSignalPush } from './cameraBus';

const FALLBACK: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const CONNECT_TIMEOUT_MS = 8000;
// What a peer connection is allowed when the quality profile does not say. Well above the shipped
// full-screen profile, because a direct connection costs the server nothing and the officer's
// uplink is the only budget it spends.
const FALLBACK_BITRATE = 4_000_000;

let iceCached: RTCConfiguration | null = null;

/**
 * ICE servers for a camera peer connection. The same set the voice mesh uses: public STUN, plus a
 * TURN relay when the server has one provisioned, which is what carries the pairs that cannot see
 * each other directly.
 */
async function iceConfig(): Promise<RTCConfiguration> {
    if (iceCached) return iceCached;
    if (!isFiveM) return FALLBACK;
    const res = await apiData<{ iceServers?: RTCIceServer[] }>('sd-phone:voice:ice');
    iceCached = res?.iceServers?.length ? { iceServers: res.iceServers } : FALLBACK;
    return iceCached;
}

function send(citizenid: string, to: number, kind: 'offer' | 'answer' | 'ice', data: unknown): void {
    void fetchNui('sd-phone:mdt:cameraSignal', { citizenid, to, kind, data });
}

/**
 * Tells the encoder where to begin rather than making it discover the link from the floor. A peer
 * connection opens at a few hundred kilobits and climbs as it learns what the path can carry, which
 * is right for a call somebody stays on and wrong for a camera somebody opens for twenty seconds:
 * the whole viewing would be spent ramping. The ceiling is still the ceiling, and congestion
 * control still owns everything after the first seconds.
 *
 * Only the video codecs are touched, and only in the offer this client is about to send as its own
 * description. A malformed result is caught by setLocalDescription, which drops the connection to
 * the path that was already working.
 */
function withStartBitrate(sdp: string | undefined, maxBitrate: number): string | undefined {
    if (!sdp) return sdp;

    const startKbps = Math.max(300, Math.min(Math.round(maxBitrate / 1000 / 2), 4000));
    const maxKbps = Math.max(startKbps, Math.round(maxBitrate / 1000));

    const lines = sdp.split(/\r\n|\n/);

    const video = new Set<number>();
    let inVideo = false;
    for (const line of lines) {
        if (line.startsWith('m=')) inVideo = line.startsWith('m=video');
        if (!inVideo) continue;
        const codec = /^a=rtpmap:(\d+) (?:VP8|VP9|H264|AV1)\//.exec(line);
        if (codec) video.add(Number(codec[1]));
    }
    if (!video.size) return sdp;

    // Which of them already carry parameters decides whether this extends a line or adds one, and
    // a codec must never end up with two.
    const described = new Set<number>();
    for (const line of lines) {
        const fmtp = /^a=fmtp:(\d+) /.exec(line);
        if (fmtp && video.has(Number(fmtp[1]))) described.add(Number(fmtp[1]));
    }

    const params = `x-google-start-bitrate=${startKbps};x-google-max-bitrate=${maxKbps}`;
    const out: string[] = [];

    for (const line of lines) {
        const fmtp = /^a=fmtp:(\d+) (.*)$/.exec(line);
        if (fmtp && video.has(Number(fmtp[1]))) {
            out.push(`a=fmtp:${fmtp[1]} ${fmtp[2]};${params}`);
            continue;
        }
        out.push(line);
        const rtpmap = /^a=rtpmap:(\d+) (?:VP8|VP9|H264|AV1)\//.exec(line);
        if (rtpmap && !described.has(Number(rtpmap[1]))) {
            out.push(`a=fmtp:${rtpmap[1]} ${params}`);
        }
    }

    return out.join('\r\n');
}

/**
 * The broadcasting side. Holds one connection per watching terminal, all fed from the one capture
 * the page is already running, and offers to each as it appears. The server names who may hold one;
 * this only does as it is told, because who may watch a camera is not a decision for a client.
 */
export class CameraPeerHost {
    private peers = new Map<number, RTCPeerConnection>();
    private off: () => void;
    private closed = false;

    constructor(private citizenid: string, private stream: MediaStream, private maxBitrate = FALLBACK_BITRATE) {
        this.off = onCameraSignal(citizenid, sig => void this.handle(sig));
    }

    /** Opens a connection to every terminal named here, and drops the ones no longer named. */
    setViewers(srcs: number[]): void {
        if (this.closed) return;
        const wanted = new Set(srcs.filter(n => Number.isFinite(n)));

        for (const [src, pc] of Array.from(this.peers)) {
            if (wanted.has(src)) continue;
            this.peers.delete(src);
            try { pc.close(); } catch { /* already gone */ }
        }

        for (const src of wanted) {
            if (!this.peers.has(src)) void this.open(src);
        }
    }

    private async open(src: number): Promise<void> {
        const config = await iceConfig();
        if (this.closed || this.peers.has(src)) return;

        const pc = new RTCPeerConnection(config);
        this.peers.set(src, pc);

        pc.onicecandidate = e => {
            if (e.candidate) send(this.citizenid, src, 'ice', e.candidate.toJSON());
        };
        pc.onconnectionstatechange = () => {
            mediaDebug('peer', 'host', { to: src, state: pc.connectionState });
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.drop(src);
        };

        for (const track of this.stream.getVideoTracks()) {
            // Without this the encoder treats the capture as camera video, where softening the
            // picture to hold a frame rate is the right trade. It is the wrong one here: a sharp
            // slower picture is what a plate or a face is read from, and this is a game view, so
            // there is no sensor noise for the usual heuristics to reason about either.
            track.contentHint = 'detail';
            pc.addTrack(track, this.stream);
        }
        this.tune(pc);

        try {
            const offer = await pc.createOffer();
            if (this.closed || this.peers.get(src) !== pc) return;
            offer.sdp = withStartBitrate(offer.sdp, this.maxBitrate);
            await pc.setLocalDescription(offer);
            send(this.citizenid, src, 'offer', { sdp: pc.localDescription?.sdp });
        } catch {
            this.drop(src);
        }
    }

    /**
     * What one viewer may cost the officer's own connection, and how the encoder should spend it.
     * The ceiling is the quality profile's own bitrate, so the two paths are asked for the same
     * picture rather than the peer one quietly being worse. Everything else here says the same
     * thing in a different place: when the link cannot carry the full rate, give up frames, not
     * pixels.
     */
    private tune(pc: RTCPeerConnection): void {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (!sender) return;
        try {
            const params = sender.getParameters();
            params.encodings = params.encodings?.length ? params.encodings : [{}];
            for (const encoding of params.encodings) {
                encoding.maxBitrate = this.maxBitrate;
                encoding.scaleResolutionDownBy = 1;
            }
            params.degradationPreference = 'maintain-resolution';
            void sender.setParameters(params);
        } catch { /* older CEF rejects some fields; the default encoding still works */ }
    }

    private drop(src: number): void {
        const pc = this.peers.get(src);
        if (!pc) return;
        this.peers.delete(src);
        try { pc.close(); } catch { /* already gone */ }
    }

    private async handle(sig: CameraSignalPush): Promise<void> {
        const pc = this.peers.get(sig.from);
        if (!pc) return;
        try {
            if (sig.kind === 'answer' && sig.data?.sdp) {
                await pc.setRemoteDescription({ type: 'answer', sdp: sig.data.sdp });
            } else if (sig.kind === 'ice' && sig.data) {
                await pc.addIceCandidate(sig.data as RTCIceCandidateInit);
            }
        } catch { /* late or duplicate handshake traffic is not fatal */ }
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.off();
        for (const pc of this.peers.values()) {
            try { pc.close(); } catch { /* already gone */ }
        }
        this.peers.clear();
    }
}

export interface CameraPeerViewerOptions {
    citizenid: string;
    host:      number;
    onStream:  (stream: MediaStream) => void;
    onLost:    (reason: string) => void;
}

/**
 * The watching side. Answers the broadcaster's offer and hands up the track when it arrives. It
 * gives up on a deadline rather than waiting forever, because the caller has a working event path
 * to fall back to and a terminal showing nothing is worse than one showing a costlier picture.
 */
export class CameraPeerViewer {
    private pc: RTCPeerConnection | null = null;
    private off: () => void;
    private timer: ReturnType<typeof setTimeout>;
    private closed = false;
    private streaming = false;

    constructor(private opts: CameraPeerViewerOptions) {
        this.off = onCameraSignal(opts.citizenid, sig => void this.handle(sig));
        this.timer = setTimeout(() => {
            if (!this.streaming) this.fail('timeout');
        }, CONNECT_TIMEOUT_MS);
    }

    private async ensure(): Promise<RTCPeerConnection | null> {
        if (this.pc || this.closed) return this.pc;
        const config = await iceConfig();
        if (this.closed) return null;
        if (this.pc) return this.pc;

        const pc = new RTCPeerConnection(config);
        this.pc = pc;
        pc.onicecandidate = e => {
            if (e.candidate) send(this.opts.citizenid, this.opts.host, 'ice', e.candidate.toJSON());
        };
        pc.ontrack = e => {
            const stream = e.streams[0] ?? new MediaStream([e.track]);
            this.streaming = true;
            clearTimeout(this.timer);
            this.opts.onStream(stream);
        };
        pc.onconnectionstatechange = () => {
            mediaDebug('peer', 'viewer', { host: this.opts.host, state: pc.connectionState });
            if (pc.connectionState === 'failed') this.fail('failed');
        };
        return pc;
    }

    private async handle(sig: CameraSignalPush): Promise<void> {
        if (this.closed || sig.from !== this.opts.host) return;
        const pc = await this.ensure();
        if (!pc) return;
        try {
            if (sig.kind === 'offer' && sig.data?.sdp) {
                await pc.setRemoteDescription({ type: 'offer', sdp: sig.data.sdp });
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                send(this.opts.citizenid, this.opts.host, 'answer', { sdp: pc.localDescription?.sdp });
            } else if (sig.kind === 'ice' && sig.data) {
                await pc.addIceCandidate(sig.data as RTCIceCandidateInit);
            }
        } catch {
            this.fail('handshake');
        }
    }

    private fail(reason: string): void {
        if (this.closed) return;
        mediaDebug('peer', 'viewerLost', { host: this.opts.host, reason });
        this.close();
        this.opts.onLost(reason);
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        clearTimeout(this.timer);
        this.off();
        if (this.pc) {
            try { this.pc.close(); } catch { /* already gone */ }
            this.pc = null;
        }
    }
}

/**
 * SDP rewriting is exactly the kind of string work that should be pinned rather than trusted.
 * @testseam
 */
export const __testing = { withStartBitrate };
