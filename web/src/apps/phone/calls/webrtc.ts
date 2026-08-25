import { fetchNui, isFiveM } from '@/core/nui';
import type { HintConfig } from '@/ui/KeyHints';


export interface IceConfig { iceServers: RTCIceServer[] }
export type PeerSlot = 'video' | 'record';
export type Signal = { kind: 'offer' | 'answer' | 'ice'; slot?: PeerSlot; sdp?: string; candidate?: unknown };

const FALLBACK: IceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export const VIDEO_CAPTURE_WIDTH = 900;
export const VIDEO_CAPTURE_FPS   = 30;
const VIDEO_MAX_BITRATE = 3_000_000;

export async function fetchIceConfig(): Promise<IceConfig> {
    if (!isFiveM) return FALLBACK;
    const r = await fetchNui<IceConfig>('sd-phone:video:config');
    return r && Array.isArray(r.iceServers) && r.iceServers.length ? r : FALLBACK;
}

export interface VideoCameraInfo {
    walkable?: boolean;
    hints?:    Partial<HintConfig>;
}

function sendVideoSignal(sig: Signal)            { void fetchNui('sd-phone:video:signal', sig); }
export function requestVideo()                          { void fetchNui('sd-phone:video:request'); }
export function acceptVideo()                           { void fetchNui('sd-phone:video:accept'); }
export function stopVideo()                             { void fetchNui('sd-phone:video:stop'); }
export function setVideoCamera(on: boolean, front = true) { return fetchNui<VideoCameraInfo>('sd-phone:video:camera', { on, front }); }
export function setVideoCursor(on: boolean)             { void fetchNui('sd-phone:video:cursor', { on }); }

export interface LensToggle { success?: boolean; on?: boolean }

export function toggleVideoLock()    { return fetchNui<LensToggle>('sd-phone:video:lock'); }
export function toggleVideoFaceCam() { return fetchNui<LensToggle>('sd-phone:video:faceCam'); }
export function setVideoZoom(zoom: number) { void fetchNui('sd-phone:video:zoom', { zoom }); }

export class CallPeer {
    private pc: RTCPeerConnection;
    private remote = new MediaStream();
    onRemote?: (stream: MediaStream) => void;

    constructor(config: IceConfig, private initiator: boolean, private slot: PeerSlot = 'video') {
        this.pc = new RTCPeerConnection(config);
        this.pc.onicecandidate = (e) => {
            if (e.candidate) this.send({ kind: 'ice', candidate: e.candidate.toJSON() });
        };
        this.pc.ontrack = (e) => {
            this.remote.addTrack(e.track);
            this.onRemote?.(this.remote);
        };
    }

    private send(sig: Signal) {
        sendVideoSignal({ ...sig, slot: this.slot });
    }

    async start(local: MediaStream | null) {
        if (local) local.getTracks().forEach(t => this.pc.addTrack(t, local));
        await this.tuneVideoSender();
        if (this.initiator) {
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            this.send({ kind: 'offer', sdp: this.pc.localDescription?.sdp });
        }
    }

    private async tuneVideoSender() {
        const sender = this.pc.getSenders().find(s => s.track?.kind === 'video');
        if (!sender) return;
        try {
            const params = sender.getParameters();
            params.encodings = params.encodings?.length ? params.encodings : [{}];
            for (const e of params.encodings) {
                e.maxBitrate = VIDEO_MAX_BITRATE;
                e.scaleResolutionDownBy = 1;
            }
            params.degradationPreference = 'maintain-resolution';
            await sender.setParameters(params);
        } catch { /* older CEF rejects some fields; the default encoding still works */ }
    }

    async handle(sig: Signal) {
        try {
            if (sig.kind === 'offer' && sig.sdp) {
                await this.pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                this.send({ kind: 'answer', sdp: this.pc.localDescription?.sdp });
            } else if (sig.kind === 'answer' && sig.sdp) {
                await this.pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
            } else if (sig.kind === 'ice' && sig.candidate) {
                await this.pc.addIceCandidate(sig.candidate as RTCIceCandidateInit);
            }
        } catch { /* late/duplicate signaling is non-fatal */ }
    }

    close() {
        try { this.pc.close(); } catch { /* already closed */ }
        this.remote.getTracks().forEach(t => t.stop());
    }
}
