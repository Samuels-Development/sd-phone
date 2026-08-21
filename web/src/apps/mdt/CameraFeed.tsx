import { useEffect, useRef, useState } from 'react';
import { VideoOff } from 'lucide-react';

import { t } from '@/i18n';
import { useDeckActive } from '@/shell/deckActive';
import { LiveVideoPlayer, base64ToBytes, liveVideoPlaybackSupported, type LiveHealth } from '@/shared/liveMedia';
import {
    FRAME_DELTA,
    FRAME_INIT,
    FRAME_KEY,
    relayAvailable,
    relayJoin,
    type RelayGrant,
    type RelayStreamHandle,
} from '@/shared/mediaSocket';
import { mdtCameraUnwatch, mdtCameraWatch } from './mdtApi';
import {
    onCameraChunk,
    onCameraOff,
    onCameraPrime,
    onCameraTransport,
    type CameraChunkPush,
    type CameraPrimePush,
    type CameraTransport,
} from './cameraBus';
import type { CameraQuality, CameraTile } from './data';
import { mediaDebug } from '@/shared/mediaDebug';

const KEEPALIVE_MS = 5000;
const ATTACH_GAP_MS = 2500;
const SWITCH_IDLE_MS = 1500;
const SILENT_MS = 15000;
const TIMESLICE_MS = 400;
const DEFAULT_MIME = 'video/webm';

export function feedNotice(camera: CameraTile, active: boolean, previews: boolean): string | null {
    if (camera.self) return t('mdt.cameraSelf', 'Your own camera');
    if (camera.status === 'unsupported') return t('mdt.cameraUnsupported', 'This unit cannot publish video');
    if (camera.status === 'busy') return t('mdt.cameraBusy', 'The unit is using its camera');
    if (!active) {
        return previews
            ? t('mdt.cameraIdle', 'Open to connect')
            : t('mdt.cameraPreviewsOff', 'Live thumbnails are off');
    }
    return null;
}

export function CameraFeed({ camera, quality, active, notice, showTransport, onHealth }: {
    camera:         CameraTile;
    quality:        CameraQuality;
    active:         boolean;
    notice:         string | null;
    showTransport?: boolean;
    onHealth?:      (health: LiveHealth) => void;
}) {
    const videoRef  = useRef<HTMLVideoElement>(null);
    const playerRef = useRef<LiveVideoPlayer | null>(null);

    const [health, setHealth] = useState<LiveHealth>('starting');
    const [transport, setTransport] = useState<CameraTransport>('event');
    const [failure, setFailure] = useState<string | null>(null);
    const [silent, setSilent] = useState(false);

    const deckActive = useDeckActive();
    const deckRef = useRef(deckActive);
    deckRef.current = deckActive;

    const healthRef = useRef(onHealth);
    healthRef.current = onHealth;

    const showingRef = useRef(false);
    showingRef.current = health === 'live' || health === 'recovering';

    useEffect(() => {
        playerRef.current?.setActive(deckActive);
    }, [deckActive]);

    useEffect(() => () => {
        playerRef.current?.destroy();
        playerRef.current = null;
    }, []);

    useEffect(() => {
        if (!active || notice) return;

        let alive = true;
        let mime = '';
        let handle: RelayStreamHandle | null = null;
        let joining = false;
        let relayMime = '';
        let committed: CameraTransport | null = null;
        let offered = true;
        let attachedAt = 0;
        let framedAt = Date.now();
        const seen: Record<CameraTransport, number> = { relay: 0, event: 0 };

        setHealth('starting');
        setTransport('event');
        setFailure(null);
        setSilent(false);
        healthRef.current?.('starting');

        const publish = (next: LiveHealth) => {
            if (!alive) return;
            setHealth(next);
            healthRef.current?.(next);
        };

        const destroy = () => {
            playerRef.current?.destroy();
            playerRef.current = null;
        };

        const dropRelay = () => {
            const open = handle;
            handle = null;
            if (!open) return;
            try { open.close(); } catch { /* socket already gone */ }
        };

        const relayWanted = (): boolean => offered && !handle && relayAvailable();

        const needInit = (): void => {
            if (!alive) return;
            if (committed === 'relay' && handle) {
                handle.requestKeyframe();
                return;
            }
            void attach(true, relayWanted());
        };

        const feed = (from: CameraTransport, bytes: Uint8Array, init: boolean, hint: string, gen: number, seq: number | null = null, run: number | null = null) => {
            if (!alive || bytes.byteLength === 0) return;
            const video = videoRef.current;
            if (!video) return;

            const now = Date.now();
            framedAt = now;
            setSilent(false);
            if (committed !== from) {
                if (!init) return;
                if (committed !== null && now - seen[committed] < SWITCH_IDLE_MS) return;
                destroy();
                committed = from;
                setTransport(from);
            }
            seen[from] = now;

            if (init) {
                const want = hint || mime || DEFAULT_MIME;
                if (!liveVideoPlaybackSupported(want)) {
                    setFailure(t('mdt.cameraNoDecoder', 'This terminal cannot play that stream'));
                    return;
                }
                if (want !== mime) {
                    mime = want;
                    destroy();
                }
            }

            if (!playerRef.current) {
                if (!init) return;
                const player = new LiveVideoPlayer(video, mime || DEFAULT_MIME, {
                    timesliceMs: TIMESLICE_MS,
                    onHealth: next => publish(next),
                    onNeedInit: () => needInit(),
                });
                playerRef.current = player;
                player.start();
                player.setActive(deckRef.current);
            }
            playerRef.current.append(bytes, init, gen, seq, run);
        };

        const join = async (grant: RelayGrant) => {
            if (!alive || handle || joining) return;
            joining = true;
            const opened = await relayJoin({
                token: grant.token,
                key:   grant.streamId,
                onFrame: frame => {
                    if (frame.kind !== FRAME_INIT && frame.kind !== FRAME_KEY && frame.kind !== FRAME_DELTA) return;
                    feed('relay', frame.payload, frame.kind === FRAME_INIT, relayMime, frame.gen);
                },
                onDesc: desc => { if (desc.mime) relayMime = desc.mime; },
                onState: (state, reason) => {
                    mediaDebug('camera', 'streamState', { id: camera.id, state, reason });
                    if (state === 'ended' || state === 'offline' || state === 'expired') dropRelay();
                },
                onError: () => dropRelay(),
            });
            joining = false;
            if (!alive || !opened) {
                opened?.close();
                return;
            }
            handle = opened;
        };

        const attach = async (reprime: boolean, wantRelay: boolean) => {
            const now = Date.now();
            if (now - attachedAt < ATTACH_GAP_MS) return;
            attachedAt = now;

            const res = await mdtCameraWatch(camera.id, quality, reprime, wantRelay, offered && !handle && !relayAvailable());
            if (!alive) return;
            if (typeof res === 'string') {
                if (!showingRef.current) setFailure(res || t('mdt.cameraNoFeed', 'No feed from that unit'));
                return;
            }
            setFailure(null);
            if (res.mime && !mime) mime = res.mime;
            if (res.relay) void join(res.relay);
        };

        const offChunk = onCameraChunk(camera.citizenid, (push: CameraChunkPush) => {
            if (!push.chunk) return;
            feed('event', base64ToBytes(push.chunk), push.init === true, push.mime ?? '', push.gen ?? 0, typeof push.seq === 'number' ? push.seq : null, typeof push.run === 'number' ? push.run : null);
        });

        // The cached opening of a run, arriving whole: a header and the chunks behind it, in the
        // order they were encoded, which is the order they have to be fed in.
        const offPrime = onCameraPrime(camera.citizenid, (push: CameraPrimePush) => {
            const chunks = Array.isArray(push.chunks) ? push.chunks : [];
            const first = typeof push.seq === 'number' ? push.seq : null;
            for (let i = 0; i < chunks.length; i++) {
                if (!chunks[i]) continue;
                feed('event', base64ToBytes(chunks[i]), i === 0, push.mime ?? '', push.gen ?? 0, first === null ? null : first + i, typeof push.run === 'number' ? push.run : null);
            }
        });

        const offEnded = onCameraOff(camera.citizenid, () => {
            if (!alive) return;
            dropRelay();
            playerRef.current?.markOffAir('offair');
            publish('offair');
            setFailure(t('mdt.cameraOffAir', 'That unit is no longer on the air'));
        });

        const offTransport = onCameraTransport(camera.citizenid, push => {
            if (!alive) return;
            offered = push.transport === 'relay';
            if (offered) void attach(false, relayWanted());
            else dropRelay();
        });

        void attach(false, relayWanted());
        const keepAlive = window.setInterval(() => {
            setSilent(Date.now() - framedAt > SILENT_MS);
            void attach(false, relayWanted());
        }, KEEPALIVE_MS);

        return () => {
            alive = false;
            window.clearInterval(keepAlive);
            offChunk();
            offPrime();
            offEnded();
            offTransport();
            dropRelay();
            destroy();
            void mdtCameraUnwatch(camera.id);
        };
    }, [camera.id, camera.citizenid, quality, active, notice]);

    const showVideo = notice === null && failure === null && (health === 'live' || health === 'recovering');
    const quiet = silent && !showVideo ? t('mdt.cameraNoPicture', 'No picture from that unit') : null;
    const message = notice ?? failure ?? quiet;
    const stalled = message === null && health === 'failed';

    return (
        <div className="absolute inset-0 overflow-hidden bg-black">
            <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                onCanPlay={() => { void videoRef.current?.play?.().catch(() => {}); }}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ display: showVideo ? 'block' : 'none' }}
            />

            {showVideo && health === 'recovering' && (
                <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/70 px-2 py-[2px] text-[10.5px] font-semibold text-white/80">
                    {t('mdt.cameraRecovering', 'Reconnecting')}
                </span>
            )}

            {showVideo && showTransport && (
                <span className="pointer-events-none absolute bottom-2 right-2 rounded-[6px] bg-black/70 px-1.5 py-[2px] text-[10.5px] font-bold uppercase tracking-wide text-white/70">
                    {transport === 'relay'
                        ? t('mdt.transportRelay', 'Relay')
                        : t('mdt.transportEvent', 'Server')}
                </span>
            )}

            {!showVideo && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
                    {message || stalled ? (
                        <>
                            <VideoOff className="h-6 w-6 text-white/35" strokeWidth={1.8} />
                            <span className="text-[12.5px] font-medium leading-snug text-white/55">
                                {message ?? t('mdt.cameraStalled', 'No usable picture from that unit')}
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="h-6 w-6 animate-pulse rounded-full bg-white/15" />
                            <span className="text-[12.5px] font-medium text-white/45">
                                {t('mdt.cameraConnecting', 'Connecting')}
                            </span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
