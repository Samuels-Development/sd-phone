
import { fetchNui, isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';

interface SignalIn { from?: number; sid: string; kind: 'offer' | 'answer' | 'ice'; data: unknown }

function sendSignal(to: number, sid: string, kind: 'offer' | 'answer' | 'ice', data: unknown) {
    void fetchNui('sd-phone:voice:signal', { to, sid, kind, data });
}

function newSid(): string {
    return `v${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

let localTalking = false;
const gatedMics = new Set<MediaStream>();
let gateConsumers = 0;

function applyGate(stream: MediaStream) {
    stream.getAudioTracks().forEach(t => { t.enabled = localTalking; });
}

export function registerGatedMic(stream: MediaStream) {
    gatedMics.add(stream);
    applyGate(stream);
}

export function unregisterGatedMic(stream: MediaStream) {
    gatedMics.delete(stream);
}

export function setLocalTalking(on: boolean) {
    localTalking = on;
    for (const stream of gatedMics) applyGate(stream);
}

export function gateAcquire() {
    gateConsumers += 1;
    if (gateConsumers === 1) void fetchNui('sd-phone:voice:micActive', { on: true });
}
export function gateRelease() {
    gateConsumers = Math.max(0, gateConsumers - 1);
    if (gateConsumers === 0) void fetchNui('sd-phone:voice:micActive', { on: false });
}

let sharedMic: Promise<MediaStream | null> | null = null;
let sharedMicStream: MediaStream | null = null;
let micRefs = 0;

async function acquireMic(): Promise<MediaStream | null> {
    if (!sharedMic) {
        sharedMic = (async () => {
            if (!navigator.mediaDevices?.getUserMedia) return null;
            try { return await navigator.mediaDevices.getUserMedia({ audio: true }); }
            catch { return null; }
        })();
    }
    const stream = await sharedMic;
    if (stream) {
        sharedMicStream = stream;
        registerGatedMic(stream);
        micRefs += 1;
    }
    return stream;
}

function releaseMic() {
    micRefs = Math.max(0, micRefs - 1);
    if (micRefs === 0 && sharedMic) {
        const s = sharedMic;
        sharedMic = null;
        if (sharedMicStream) { unregisterGatedMic(sharedMicStream); sharedMicStream = null; }
        void s.then(stream => stream?.getTracks().forEach(t => { try { t.stop(); } catch {} }));
    }
}


class PeerSession {
    readonly sid: string;
    private peerId: number;
    private pc: RTCPeerConnection;
    private onRemote?: (s: MediaStream) => void;
    private onGone?: (s: MediaStream | null) => void;
    private remote: MediaStream | null = null;
    private usedMic = false;
    private pendingIce: RTCIceCandidateInit[] = [];
    private remoteSet = false;
    private closed = false;
    private everConnected = false;

    private constructor(
        sid: string, peerId: number, ice: RTCIceServer[],
        cbs: { onRemote?: (s: MediaStream) => void; onGone?: (s: MediaStream | null) => void },
    ) {
        this.sid = sid;
        this.peerId = peerId;
        this.onRemote = cbs.onRemote;
        this.onGone = cbs.onGone;
        this.pc = new RTCPeerConnection({ iceServers: ice });

        this.pc.onicecandidate = (e) => {
            if (e.candidate) sendSignal(this.peerId, this.sid, 'ice', e.candidate.toJSON());
        };
        this.pc.ontrack = (e) => {
            this.remote = e.streams[0] ?? new MediaStream([e.track]);
            this.onRemote?.(this.remote);
        };
        this.pc.onconnectionstatechange = () => {
            const st = this.pc.connectionState;
            if (st === 'connected') this.everConnected = true;
            if (st === 'failed' || st === 'closed' || st === 'disconnected') this.close();
        };
    }

    get peer(): number { return this.peerId; }
    get connected(): boolean { return this.everConnected; }

    static recv(sid: string, peerId: number, ice: RTCIceServer[], onRemote: (s: MediaStream) => void, onGone: (s: MediaStream | null) => void): PeerSession {
        return new PeerSession(sid, peerId, ice, { onRemote, onGone });
    }

    static send(sid: string, peerId: number, ice: RTCIceServer[], onGone: (s: MediaStream | null) => void): PeerSession {
        return new PeerSession(sid, peerId, ice, { onGone });
    }

    async startOffer() {
        try {
            this.pc.addTransceiver('audio', { direction: 'recvonly' });
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            sendSignal(this.peerId, this.sid, 'offer', { type: offer.type, sdp: offer.sdp });
        } catch {
            this.close();
        }
    }

    async onSignal(msg: SignalIn) {
        if (this.closed) return;
        try {
            if (msg.kind === 'offer') {
                await this.pc.setRemoteDescription(msg.data as RTCSessionDescriptionInit);
                this.remoteSet = true;
                await this.flushIce();
                const mic = await acquireMic();
                if (this.closed) { if (mic) releaseMic(); return; }
                if (mic) {
                    this.usedMic = true;
                    mic.getAudioTracks().forEach(t => this.pc.addTrack(t, mic));
                }
                const answer = await this.pc.createAnswer();
                await this.pc.setLocalDescription(answer);
                sendSignal(this.peerId, this.sid, 'answer', { type: answer.type, sdp: answer.sdp });
            } else if (msg.kind === 'answer') {
                await this.pc.setRemoteDescription(msg.data as RTCSessionDescriptionInit);
                this.remoteSet = true;
                await this.flushIce();
            } else if (msg.kind === 'ice') {
                const cand = msg.data as RTCIceCandidateInit;
                if (this.remoteSet) await this.pc.addIceCandidate(cand);
                else this.pendingIce.push(cand);
            }
        } catch {
            this.close();
        }
    }

    private async flushIce() {
        const queued = this.pendingIce;
        this.pendingIce = [];
        for (const c of queued) {
            try { await this.pc.addIceCandidate(c); } catch {}
        }
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        try { this.pc.onicecandidate = null; this.pc.ontrack = null; this.pc.onconnectionstatechange = null; } catch {}
        try { this.pc.close(); } catch {}
        if (this.usedMic) releaseMic();
        this.onGone?.(this.remote);
        this.remote = null;
    }
}


const INBOUND_MAX = 10;
const INBOUND_PER_PEER = 2;
const INBOUND_CONNECT_MS = 30000;

const ICE_MAX_AGE_MS = 20 * 60 * 1000;

class VoiceHub {
    private sessions = new Map<string, PeerSession>();
    private inbound = new Map<string, number>();
    private ice: RTCIceServer[] | null = null;
    private iceAt = 0;

    setIce(ice?: RTCIceServer[] | null) { if (ice && ice.length) { this.ice = ice; this.iceAt = Date.now(); } }

    async getIce(): Promise<RTCIceServer[]> {
        if (this.ice && Date.now() - this.iceAt < ICE_MAX_AGE_MS) return this.ice;
        try {
            const r = await apiData<{ iceServers?: RTCIceServer[] }>('sd-phone:voice:ice');
            this.ice = r?.iceServers ?? [];
        } catch {
            this.ice = [];
        }
        this.iceAt = Date.now();
        return this.ice;
    }

    register(s: PeerSession) { this.sessions.set(s.sid, s); }

    drop(sid: string) {
        const s = this.sessions.get(sid);
        if (!s) return;
        this.sessions.delete(sid);
        this.inbound.delete(sid);
        s.close();
    }

    private evictInbound(peerId: number) {
        let mine = 0;
        for (const id of this.inbound.values()) if (id === peerId) mine += 1;
        for (const [sid, id] of this.inbound) {
            const overPeer = id === peerId && mine >= INBOUND_PER_PEER;
            if (!overPeer && this.inbound.size < INBOUND_MAX) continue;
            if (id === peerId) mine -= 1;
            this.drop(sid);
        }
    }

    async handleIncoming(msg: SignalIn | undefined) {
        if (!msg || !msg.sid) return;
        let s = this.sessions.get(msg.sid);
        if (!s) {
            if (msg.kind !== 'offer' || msg.from == null) return;
            const ice = await this.getIce();
            s = this.sessions.get(msg.sid);
            if (!s) {
                const sid = msg.sid, from = msg.from;
                this.evictInbound(from);
                gateAcquire();
                s = PeerSession.send(sid, from, ice, () => { this.sessions.delete(sid); this.inbound.delete(sid); gateRelease(); });
                this.sessions.set(sid, s);
                this.inbound.set(sid, from);
                window.setTimeout(() => {
                    const cur = this.sessions.get(sid);
                    if (cur && cur.peer === from && !cur.connected) this.drop(sid);
                }, INBOUND_CONNECT_MS);
            }
        }
        if (msg.from != null && msg.from !== s.peer) return;
        void s.onSignal(msg);
    }
}

export const voiceHub = new VoiceHub();


export class NearbyVoiceCapture {
    private mixer: { addStream: (s: MediaStream) => void; removeStream: (s: MediaStream) => void };
    private sids = new Set<string>();
    private stopped = false;

    constructor(mixer: { addStream: (s: MediaStream) => void; removeStream: (s: MediaStream) => void }) {
        this.mixer = mixer;
    }

    async start() {
        if (!isFiveM || typeof RTCPeerConnection === 'undefined') return;
        let resp: { data?: { targets?: { id: number; name: string }[]; iceServers?: RTCIceServer[] } } | undefined;
        try { resp = await fetchNui('sd-phone:voice:nearby'); } catch { return; }
        if (this.stopped) return;

        const targets = resp?.data?.targets ?? [];
        const ice = resp?.data?.iceServers ?? await voiceHub.getIce();
        voiceHub.setIce(ice);

        for (const t of targets) {
            if (this.stopped) break;
            const sid = newSid();
            const session = PeerSession.recv(
                sid, t.id, ice,
                (stream) => { if (!this.stopped) this.mixer.addStream(stream); },
                (stream) => { if (stream) this.mixer.removeStream(stream); },
            );
            this.sids.add(sid);
            voiceHub.register(session);
            void session.startOffer();
        }
    }

    stop() {
        this.stopped = true;
        for (const sid of this.sids) voiceHub.drop(sid);
        this.sids.clear();
    }
}
