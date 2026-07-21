import { useEffect, useRef, useState } from 'react';
import { Eye, Heart, RotateCw, X } from 'lucide-react';

import { t } from '@/i18n';
import { formatDuration } from '@/lib/time';
import { fetchNui, isFiveM } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useStatusBarLight } from '@/shell/useStatusBarLight';
import { AlertDialog } from '@/ui/AlertDialog';
import { POSTS, type User } from '../data';
import { apiLiveStart, apiLiveEnd, apiLiveFrame, apiLiveChunk, apiLiveHeart, type LiveComment, type LiveEncoderConfig } from '../photogramApi';
import { videoStreamingSupported, pickVideoMime, blobToBase64 } from '@/shared/liveMedia';
import { getGameRender, type GameRender } from '@/render';
import { VerifiedCheck } from '../ui';

const SIM_VIEWERS: User[] = POSTS.map(p => p.user);
const SIM_LINES = ['hello!! 👋', 'first 🔥', 'lets gooo', 'looking clean 🙌', 'w stream', '😂😂', '🔥🔥🔥'];

interface FloatHeart { id: number; drift: number; left: number; }

function startVideoBroadcast(
    liveCanvas: HTMLCanvasElement,
    enc: LiveEncoderConfig,
    getLiveId: () => string | null,
    isStopped: () => boolean,
): () => void {
    const mime = pickVideoMime();

    const box = liveCanvas.getBoundingClientRect();
    const outW = 540;
    const outH = Math.max(1, Math.round(outW * (box.height / box.width || 16 / 9)));
    const off = document.createElement('canvas');
    off.width = outW;
    off.height = outH;
    const octx = off.getContext('2d');
    if (!octx) return () => {};

    const pump = setInterval(() => {
        if (liveCanvas.width) octx.drawImage(liveCanvas, 0, 0, outW, outH);
    }, Math.max(1, Math.round(1000 / enc.fps)));

    let stream: MediaStream;
    try { stream = off.captureStream(enc.fps); } catch { clearInterval(pump); return () => {}; }

    let recorder: MediaRecorder | null = null;

    const spin = () => {
        if (isStopped()) return;
        let firstChunk = true;
        let rec: MediaRecorder;
        try {
            rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: enc.bitrate });
        } catch {
            try { rec = new MediaRecorder(stream); } catch { return; }
        }
        rec.ondataavailable = (e) => {
            if (rec !== recorder || !e.data || !e.data.size || isStopped()) return;
            const isInit = firstChunk;
            firstChunk = false;
            void blobToBase64(e.data).then((b64) => {
                const id = getLiveId();
                if (id && !isStopped()) void apiLiveChunk(id, b64, isInit, isInit ? mime : undefined);
            });
        };
        rec.start(enc.timesliceMs);
        recorder = rec;
    };

    const anchor = setInterval(() => {
        const old = recorder;
        if (old && old.state !== 'inactive') { try { old.stop(); } catch { /* already stopping */ } }
        spin();
    }, Math.max(1000, enc.keyframeMs));

    spin();

    return () => {
        clearInterval(anchor);
        clearInterval(pump);
        if (recorder && recorder.state !== 'inactive') {
            try { recorder.onstop = null; recorder.stop(); } catch { /* already inactive */ }
        }
        recorder = null;
        try { stream.getTracks().forEach(track => track.stop()); } catch { /* tracks gone */ }
    };
}

export function LiveStream({ onClose }: { onClose: () => void }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [feedReady, setFeedReady] = useState(false);
    const [selfie,    setSelfie]    = useState(false);
    const [elapsed,   setElapsed]   = useState(0);
    const [viewers,   setViewers]   = useState(0);
    const [comments,  setComments]  = useState<LiveComment[]>([]);
    const [hearts,    setHearts]    = useState<FloatHeart[]>([]);
    const [confirmEnd, setConfirmEnd] = useState(false);
    const seq = useRef(0);
    const liveIdRef = useRef<string | null>(null);
    const renderRef = useRef<GameRender | null>(null);

    useStatusBarLight(true);

    function grabFrame(): string | null {
        const src = canvasRef.current;
        if (!src || !src.width || !src.height) return null;
        const box = src.getBoundingClientRect();
        const outW = 480;
        const outH = Math.max(1, Math.round(outW * (box.height / box.width || 16 / 9)));
        const out = document.createElement('canvas');
        out.width = outW;
        out.height = outH;
        const ctx = out.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(src, 0, 0, outW, outH);
        return out.toDataURL('image/jpeg', 0.5);
    }

    useEffect(() => {
        let stopped = false;
        const teardown: Array<() => void> = [];

        void (async () => {
            const started = await apiLiveStart();
            if (stopped || !started) return;
            liveIdRef.current = started.liveId;
            const enc = started.enc;

            await fetchNui('sd-phone:camera:open');
            const render = await getGameRender();
            if (stopped || !render || !canvasRef.current) return;
            renderRef.current = render;
            render.renderToTarget(canvasRef.current);
            setFeedReady(true);

            if (videoStreamingSupported()) {
                teardown.push(startVideoBroadcast(canvasRef.current, enc, () => liveIdRef.current, () => stopped));
            } else {
                const frameTimer = setInterval(() => {
                    const id = liveIdRef.current;
                    if (!id) return;
                    const frame = grabFrame();
                    if (frame) void apiLiveFrame(id, frame);
                }, 2000);
                teardown.push(() => clearInterval(frameTimer));
            }
        })();

        return () => {
            stopped = true;
            teardown.forEach(fn => { try { fn(); } catch { /* best-effort */ } });
            renderRef.current?.stop();
            void fetchNui('sd-phone:camera:close');
            if (liveIdRef.current) void apiLiveEnd(liveIdRef.current);
        };
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => setElapsed(s => s + 1), 1000);
        return () => window.clearInterval(timer);
    }, []);

    useNuiEvent('sd-phone:photogram:liveComment', (data: { liveId?: string; comment?: LiveComment } | undefined) => {
        if (!data?.comment || (liveIdRef.current && data.liveId && data.liveId !== liveIdRef.current)) return;
        setComments(prev => [...prev.slice(-5), data.comment as LiveComment]);
    });
    useNuiEvent('sd-phone:photogram:liveHeart', (data: { liveId?: string } | undefined) => {
        if (liveIdRef.current && data?.liveId && data.liveId !== liveIdRef.current) return;
        spawnHearts(1);
    });
    useNuiEvent('sd-phone:photogram:liveViewers', (data: { liveId?: string; viewers?: number } | undefined) => {
        if (liveIdRef.current && data?.liveId && data.liveId !== liveIdRef.current) return;
        if (typeof data?.viewers === 'number') setViewers(data.viewers);
    });

    useEffect(() => {
        if (isFiveM) return;
        const v = window.setInterval(() => setViewers(n => Math.max(0, n + Math.floor(Math.random() * 5) - 1)), 1600);
        const c = window.setInterval(() => {
            const user = SIM_VIEWERS[Math.floor(Math.random() * SIM_VIEWERS.length)];
            const text = SIM_LINES[Math.floor(Math.random() * SIM_LINES.length)];
            seq.current += 1;
            setComments(prev => [...prev.slice(-5), { id: `sim-${seq.current}`, user, text }]);
        }, 2600);
        const h = window.setInterval(() => spawnHearts(1), 2400);
        return () => { window.clearInterval(v); window.clearInterval(c); window.clearInterval(h); };
         
    }, []);

    useNuiEvent('sd-phone:camera:key', (data) => {
        if (data?.key === 'flip') toggleSelfie();
    });

    function toggleSelfie() {
        setSelfie(prev => {
            const next = !prev;
            void fetchNui('sd-phone:camera:selfie', { on: next });
            return next;
        });
    }

    function spawnHearts(n: number) {
        setHearts(prev => {
            const add: FloatHeart[] = [];
            for (let i = 0; i < n; i++) {
                seq.current += 1;
                add.push({ id: seq.current, drift: Math.round((Math.random() - 0.5) * 60), left: Math.round(Math.random() * 18) });
            }
            return [...prev.slice(-20), ...add];
        });
    }

    function sendHeart() {
        spawnHearts(3);
        const id = liveIdRef.current;
        if (id) void apiLiveHeart(id);
    }

    return (
        <div className="absolute inset-0 z-[60] flex flex-col overflow-hidden bg-black font-sf text-white">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ display: 'block' }} />

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/55" />
            {!feedReady && !isFiveM && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[14px] text-white/50">
                    Live preview unavailable in browser
                </div>
            )}

            <div className="relative z-20 flex shrink-0 items-start justify-between px-4 pt-[62px]">
                <div className="flex items-center gap-2">
                    <span className="rounded-[7px] bg-[#ED4956] px-2 py-[3px] text-[13px] font-bold uppercase tracking-wide">{t('photogram.live', 'Live')}</span>
                    <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-[5px] text-[14px] font-semibold tabular-nums backdrop-blur-sm">
                        <Eye className="h-[15px] w-[15px]" strokeWidth={2.4} />
                        {viewers.toLocaleString()}
                    </span>
                    <span className="rounded-full bg-black/45 px-2.5 py-[5px] text-[13px] font-medium tabular-nums backdrop-blur-sm">
                        {formatDuration(elapsed)}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => setConfirmEnd(true)}
                    aria-label={t('photogram.endLiveVideo', 'End live video')}
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-black/45 backdrop-blur-sm active:scale-90"
                >
                    <X className="h-[20px] w-[20px]" strokeWidth={2.4} />
                </button>
            </div>

            <div className="min-h-0 flex-1" />

            <div className="relative z-20 flex shrink-0 items-end justify-between gap-3 px-4 pb-9">
                <div className="flex min-w-0 flex-1 flex-col justify-end gap-2">
                    {comments.map(c => (
                        <div key={c.id} className="flex items-start gap-2" style={{ animation: 'live-comment-in 0.25s ease-out' }}>
                            <img src={c.user.avatar} alt="" draggable={false} className="mt-[1px] h-[28px] w-[28px] shrink-0 rounded-full object-cover" />
                            <div className="min-w-0 text-[14px] leading-snug" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>
                                <span className="inline-flex items-center gap-1 font-semibold">
                                    {c.user.handle}{c.user.verified && <VerifiedCheck size={13} />}
                                </span>
                                <span className="ml-1.5 text-white/95">{c.text}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="relative flex shrink-0 flex-col items-center gap-3">
                    <div className="pointer-events-none absolute bottom-[52px] left-1/2 h-[180px] w-[80px] -translate-x-1/2">
                        {hearts.map(h => (
                            <Heart
                                key={h.id}
                                onAnimationEnd={() => setHearts(prev => prev.filter(x => x.id !== h.id))}
                                className="absolute bottom-0 h-[26px] w-[26px] text-[#ED4956]"
                                fill="currentColor"
                                style={{ left: `${30 + h.left}%`, ['--drift' as string]: `${h.drift}px`, animation: 'live-heart-rise 1.8s ease-out forwards' }}
                            />
                        ))}
                    </div>

                    <button
                        type="button"
                        aria-label={t('photogram.flipCamera', 'Flip camera')}
                        aria-pressed={selfie}
                        onClick={toggleSelfie}
                        className={[
                            'flex h-[46px] w-[46px] items-center justify-center rounded-full backdrop-blur-md transition-transform active:scale-95',
                            selfie ? 'bg-white text-black' : 'bg-black/45 text-white',
                        ].join(' ')}
                    >
                        <RotateCw className="h-[22px] w-[22px]" strokeWidth={2.2} />
                    </button>
                    <button
                        type="button"
                        aria-label={t('photogram.sendHeart', 'Send heart')}
                        onClick={sendHeart}
                        className="flex h-[46px] w-[46px] items-center justify-center rounded-full bg-black/45 text-[#ED4956] backdrop-blur-md active:scale-90"
                    >
                        <Heart className="h-[24px] w-[24px]" fill="currentColor" strokeWidth={2} />
                    </button>
                </div>
            </div>

            {confirmEnd && (
                <AlertDialog
                    title={t('photogram.endLiveTitle', 'End Live Video?')}
                    message={t('photogram.endLiveMessage', 'Your live video will end and viewers will be disconnected.')}
                    confirmLabel={t('photogram.end', 'End')}
                    cancelLabel={t('photogram.cancel', 'Cancel')}
                    destructive
                    forceDark
                    onCancel={() => setConfirmEnd(false)}
                    onConfirm={() => { setConfirmEnd(false); onClose(); }}
                />
            )}
        </div>
    );
}
