import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, SwitchCamera, Video } from 'lucide-react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { fetchIceConfig, setVideoCamera, stopVideo, VideoPeer, type Signal } from './webrtc';
import { getGameRender, PORTRAIT_CROP, type GameRender } from '@/render';
import { t } from '@/i18n';

export function VideoCall({ peerName, initiator, onEndVideo, onHangup }: {
    peerName:   string;
    initiator:  boolean;
    onEndVideo: () => void;
    onHangup:   () => void;
}) {
    const localCanvas = useRef<HTMLCanvasElement>(null);
    const remoteVideo = useRef<HTMLVideoElement>(null);
    const peerRef     = useRef<VideoPeer | null>(null);
    const renderRef   = useRef<GameRender | null>(null);
    const pending     = useRef<Signal[]>([]);
    const [front, setFront]   = useState(true);
    const [hasRemote, setHasRemote] = useState(false);

    useEffect(() => {
        let dead = false;
        let raf = 0;
        setVideoCamera(true, true);

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
                out.width  = 540;
                out.height = Math.max(1, Math.round(out.width / aspect));
                const octx = out.getContext('2d');

                const pump = () => {
                    if (dead) return;
                    if (octx && live.width) octx.drawImage(live, 0, 0, out.width, out.height);
                    raf = requestAnimationFrame(pump);
                };
                pump();

                try { local = out.captureStream(30); } catch { local = null; }
            }

            const cfg  = await fetchIceConfig();
            if (dead) return;
            const peer = new VideoPeer(cfg, initiator);
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
            setVideoCamera(false);
            // Walking with the phone open means Esc can close it mid-call, which unmounts this
            // view; tell the peer or their end sits on a frozen frame. Dropped server-side once
            // the call is gone, so the ordinary teardown paths are unaffected.
            stopVideo();
        };
    }, [initiator]);

    useNuiEvent('sd-phone:video:signal', useCallback((data) => {
        if (peerRef.current) void peerRef.current.handle(data);
        else pending.current.push(data);
    }, []));

    function flip() {
        const next = !front;
        setFront(next);
        setVideoCamera(true, next);
    }

    return (
        <div className="absolute inset-0 z-[70] overflow-hidden bg-black font-sf">
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

            <div className="absolute inset-x-0 bottom-[60px] flex items-center justify-center gap-8">
                <button
                    type="button"
                    aria-label={t('phone.flipCamera','Flip camera')}
                    onClick={flip}
                    className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md active:opacity-70"
                >
                    <SwitchCamera className="h-[26px] w-[26px]" strokeWidth={2} />
                </button>
                <button
                    type="button"
                    aria-label={t('phone.stopVideo','Stop video')}
                    onClick={() => { stopVideo(); onEndVideo(); }}
                    className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md active:opacity-70"
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
    );
}
