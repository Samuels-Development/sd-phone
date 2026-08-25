import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Mic, MicOff, Orbit, Phone, ScanFace, SwitchCamera, Video } from 'lucide-react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import {
    fetchIceConfig, setVideoCamera, setVideoCursor, setVideoZoom, stopVideo,
    toggleVideoFaceCam, toggleVideoLock, CallPeer,
    VIDEO_CAPTURE_FPS, VIDEO_CAPTURE_WIDTH, type Signal,
} from './webrtc';
import { getGameRender, PORTRAIT_CROP, type GameRender } from '@/render';
import { HINT_DEFAULTS, KeyHints, type HintConfig } from '@/ui/KeyHints';
import { clampZoom, ZOOM_KEY_STEP, ZOOM_WHEEL_RATE, nextZoomPreset, zoomLabel } from '@/shared/lens';
import { t } from '@/i18n';

const TRAY_SIZE = 46;

function TrayButton({ label, active, shown = true, onClick, children }: {
    label:     string;
    active:    boolean;
    shown?:    boolean;
    onClick:   () => void;
    children:  ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            aria-hidden={!shown}
            tabIndex={shown ? 0 : -1}
            onClick={onClick}
            className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full transition-all duration-200 ease-out active:opacity-70 ${
                active ? 'bg-white text-black' : 'bg-white/25 text-white'
            }`}
            style={{
                width:        shown ? TRAY_SIZE : 0,
                height:       TRAY_SIZE,
                marginInline: shown ? 6 : 0,
                opacity:      shown ? 1 : 0,
                pointerEvents: shown ? 'auto' : 'none',
            }}
        >
            {children}
        </button>
    );
}

export function VideoCall({ peerName, initiator, muted, canMute, onToggleMute, onEndVideo, onHangup }: {
    peerName:     string;
    initiator:    boolean;
    muted:        boolean;
    canMute:      boolean;
    onToggleMute: () => void;
    onEndVideo:   () => void;
    onHangup:     () => void;
}) {
    const localCanvas = useRef<HTMLCanvasElement>(null);
    const remoteVideo = useRef<HTMLVideoElement>(null);
    const peerRef     = useRef<CallPeer | null>(null);
    const renderRef   = useRef<GameRender | null>(null);
    const pending     = useRef<Signal[]>([]);
    const [front, setFront]   = useState(true);
    const [hasRemote, setHasRemote] = useState(false);
    const [walkable, setWalkable]   = useState(false);
    const [hintCfg,  setHintCfg]    = useState<HintConfig>(HINT_DEFAULTS);
    const [angleLocked, setAngleLocked] = useState(false);
    const [facingCam,   setFacingCam]   = useState(false);
    const [zoom, setZoom] = useState(1);
    const [cursorUp, setCursorUp] = useState(true);

    useEffect(() => {
        let dead = false;
        let raf = 0;
        void setVideoCamera(true, true).then((res) => {
            if (dead) return;
            setWalkable(res?.walkable === true);
            setHintCfg({ ...HINT_DEFAULTS, ...(res?.hints ?? {}) });
        });

        (async () => {
            const render = await getGameRender();
            if (dead) return;

            let local: MediaStream | null = null;
            const out = localCanvas.current;
            if (render && out) {
                renderRef.current = render;
                const live = document.createElement('canvas');
                render.renderToTarget(live);
                render.setOrientation('portrait');
                render.setZoom(1);

                const aspect = (PORTRAIT_CROP.width * window.innerWidth) / window.innerHeight || 0.747;
                out.width  = VIDEO_CAPTURE_WIDTH;
                out.height = Math.max(1, Math.round(out.width / aspect));
                const octx = out.getContext('2d');
                if (octx) {
                    octx.imageSmoothingEnabled = true;
                    octx.imageSmoothingQuality = 'high';
                }

                const pump = () => {
                    if (dead) return;
                    if (octx && live.width) octx.drawImage(live, 0, 0, out.width, out.height);
                    raf = requestAnimationFrame(pump);
                };
                pump();

                try { local = out.captureStream(VIDEO_CAPTURE_FPS); } catch { local = null; }
                local?.getVideoTracks().forEach(t => { t.contentHint = 'detail'; });
            }

            const cfg  = await fetchIceConfig();
            if (dead) return;
            const peer = new CallPeer(cfg, initiator);
            peer.onRemote = (stream) => {
                setHasRemote(true);
                if (remoteVideo.current) remoteVideo.current.srcObject = stream;
            };
            await peer.start(local);
            if (dead) { peer.close(); return; }
            peerRef.current = peer;
            pending.current.splice(0).forEach(s => void peer.handle(s));
        })();

        return () => {
            dead = true;
            if (raf) cancelAnimationFrame(raf);
            peerRef.current?.close();
            peerRef.current = null;
            renderRef.current?.stop();
            void setVideoCamera(false);
            // Walking with the phone open means Esc can close it mid-call, which unmounts this
            // view; tell the peer or their end sits on a frozen frame. Dropped server-side once
            // the call is gone, so the ordinary teardown paths are unaffected.
            stopVideo();
        };
    }, [initiator]);

    useNuiEvent('sd-phone:video:signal', useCallback((data) => {
        if (data?.slot === 'record') return;
        if (peerRef.current) void peerRef.current.handle(data);
        else pending.current.push(data);
    }, []));

    useNuiEvent('sd-phone:video:lock',    (data) => setAngleLocked(!!data?.on));
    useNuiEvent('sd-phone:video:faceCam', (data) => setFacingCam(!!data?.on));
    useNuiEvent('sd-phone:video:cursorState', (data) => setCursorUp(data?.on !== false));

    useEffect(() => {
        setAngleLocked(false);
        setFacingCam(false);
        setZoom(1);
    }, [front]);

    useEffect(() => {
        if (!walkable) return;
        setVideoZoom(zoom);
    }, [zoom, walkable]);

    useNuiEvent('sd-phone:video:key', (data) => {
        switch (data?.key) {
            case 'flip':    flip(); break;
            case 'zoomIn':  setZoom(z => clampZoom(z * ZOOM_KEY_STEP)); break;
            case 'zoomOut': setZoom(z => clampZoom(z / ZOOM_KEY_STEP)); break;
        }
    });

    useEffect(() => {
        if (!walkable) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'AltLeft' || e.key === 'Alt') {
                e.preventDefault();
                setVideoCursor(false);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [walkable]);

    function flip() {
        const next = !front;
        setFront(next);
        void setVideoCamera(true, next);
    }

    async function toggleAngle() {
        const res = await toggleVideoLock();
        if (res?.success) setAngleLocked(res.on === true);
    }

    async function toggleFace() {
        const res = await toggleVideoFaceCam();
        if (res?.success) setFacingCam(res.on === true);
    }

    const hints = [
        { keys: ['Alt'],     label: t('phone.hintToggleCursor', 'Toggle Cursor') },
        { keys: ['↑'],       label: t('phone.hintFlipCamera', 'Flip Camera') },
        { keys: ['Wheel'],   label: t('phone.hintZoom', 'Zoom') },
        { keys: ['↓'],       label: angleLocked
            ? t('camera.hintMoveYourself', 'Move Yourself')
            : t('camera.hintMoveCamera', 'Move Camera'), shown: front },
        { keys: ['R Shift'], label: facingCam
            ? t('camera.hintLookAhead', 'Look Ahead')
            : t('camera.hintFaceCamera', 'Face Camera'), shown: front },
    ];

    return (
        <div
            className="absolute inset-0 z-[70] overflow-hidden bg-black font-sf"
            onWheel={walkable ? (e) => setZoom(z => clampZoom(z * Math.exp(-e.deltaY * ZOOM_WHEEL_RATE))) : undefined}
        >
            {walkable && <KeyHints hints={hints} config={hintCfg} />}
            <video
                ref={remoteVideo}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
            />
            {!hasRemote && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#101015] text-white/70">
                    <Video className="h-10 w-10" strokeWidth={1.6} />
                    <span className="text-[16px]">{t('phone.connectingVideo','Connecting video…')}</span>
                </div>
            )}

            <div className="absolute inset-x-0 top-[58px] flex justify-center">
                <span className="rounded-full bg-black/40 px-4 py-1.5 text-[16px] font-semibold text-white backdrop-blur-md">{peerName}</span>
            </div>

            <div className="absolute right-3 top-[96px] h-[150px] w-[112px] overflow-hidden rounded-[16px] ring-1 ring-white/20 shadow-lg">
                <canvas ref={localCanvas} className="h-full w-full object-cover" style={{ transform: front ? 'scaleX(-1)' : undefined }} />
            </div>

            <div
                className="absolute inset-x-0 bottom-[52px] flex justify-center transition-transform duration-200 ease-out"
                style={{
                    transform:     cursorUp ? 'translateY(0)' : 'translateY(230px)',
                    pointerEvents: cursorUp ? 'auto' : 'none',
                }}
            >
                <div className="flex flex-col items-center gap-3 rounded-[34px] bg-black/55 px-5 py-4 shadow-[0_8px_40px_rgba(0,0,0,0.45)] ring-1 ring-white/15 backdrop-blur-xl">
                    {walkable && (
                        <div className="flex items-center justify-center">
                            <TrayButton
                                label={facingCam ? t('camera.hintLookAhead','Look Ahead') : t('camera.hintFaceCamera','Face Camera')}
                                active={facingCam}
                                shown={front}
                                onClick={() => void toggleFace()}
                            >
                                <ScanFace className="h-[22px] w-[22px]" strokeWidth={2} />
                            </TrayButton>
                            <TrayButton
                                label={angleLocked ? t('camera.hintMoveYourself','Move Yourself') : t('camera.hintMoveCamera','Move Camera')}
                                active={angleLocked}
                                shown={front}
                                onClick={() => void toggleAngle()}
                            >
                                <Orbit className="h-[22px] w-[22px]" strokeWidth={2} />
                            </TrayButton>
                            <TrayButton
                                label={t('phone.hintZoom','Zoom')}
                                active={zoom > 1}
                                onClick={() => setZoom(nextZoomPreset(zoom))}
                            >
                                <span className="text-[13px] font-semibold tabular-nums">{zoomLabel(zoom)}</span>
                            </TrayButton>
                        </div>
                    )}

                    <div className="flex items-center justify-center gap-4">
                        <button
                            type="button"
                            aria-label={t('phone.flipCamera','Flip camera')}
                            onClick={flip}
                            className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white/25 text-white active:opacity-70"
                        >
                            <SwitchCamera className="h-[26px] w-[26px]" strokeWidth={2} />
                        </button>
                        {canMute && (
                            <button
                                type="button"
                                aria-label={t('phone.mute','Mute')}
                                onClick={onToggleMute}
                                className={`flex h-[60px] w-[60px] items-center justify-center rounded-full active:opacity-70 ${
                                    muted ? 'bg-white text-black' : 'bg-white/25 text-white'
                                }`}
                            >
                                {muted
                                    ? <MicOff className="h-[26px] w-[26px]" strokeWidth={2} />
                                    : <Mic className="h-[26px] w-[26px]" strokeWidth={2} />}
                            </button>
                        )}
                        <button
                            type="button"
                            aria-label={t('phone.stopVideo','Stop video')}
                            onClick={() => { stopVideo(); onEndVideo(); }}
                            className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white/25 text-white active:opacity-70"
                        >
                            <Video className="h-[26px] w-[26px]" strokeWidth={2} />
                        </button>
                        <button
                            type="button"
                            aria-label={t('phone.endCall','End call')}
                            onClick={onHangup}
                            className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-ios-red shadow-[0_6px_24px_rgba(255,59,48,0.45)] active:opacity-80"
                        >
                            <Phone className="h-[28px] w-[28px] rotate-[135deg] text-white" fill="currentColor" strokeWidth={0} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
