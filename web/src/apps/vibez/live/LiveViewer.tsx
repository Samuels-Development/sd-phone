import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Eye, Heart, X } from 'lucide-react';

import { t } from '@/i18n';
import { formatDuration } from '@/lib/time';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useDeckActive } from '@/shell/deckActive';
import { useStatusBarLight } from '@/shell/useStatusBarLight';
import { LiveVideoPlayer, base64ToBytes, liveVideoPlaybackSupported } from '@/shared/liveMedia';
import { GRAD_FROM, GRAD_TO, HEART, type VUser } from '../data';
import { apiLiveJoin, apiLiveLeave, apiLiveComment, apiLiveHeart } from '../vibezApi';
import { LiveCommentRow, type LiveComment } from './LiveComment';

interface FloatHeart { id: number; drift: number; left: number; }

export function LiveViewer({ liveId, host, onClose }: { liveId: string; host: VUser; onClose: () => void }) {
    const [frame,    setFrame]    = useState<string | null>(null);
    const [hasVideo, setHasVideo] = useState(false);
    const [viewers,  setViewers]  = useState(1);
    const [elapsed,  setElapsed]  = useState(0);
    const [comments, setComments] = useState<LiveComment[]>([]);
    const [hearts,   setHearts]   = useState<FloatHeart[]>([]);
    const [ended,    setEnded]    = useState(false);
    const [draft,    setDraft]    = useState('');
    const seq = useRef(0);
    const startedRef = useRef<number>(0);
    const videoRef   = useRef<HTMLVideoElement>(null);
    const playerRef  = useRef<LiveVideoPlayer | null>(null);
    const mimeRef    = useRef<string>('');

    // Pause the MSE <video> decode while backgrounded (the frame freezes); on resume
    // seek to the live edge so a long pause doesn't leave you stuck behind.
    const deckActive = useDeckActive();
    useEffect(() => {
        const v = videoRef.current;
        if (!v || !hasVideo) return;
        if (!deckActive) { v.pause(); return; }
        const buffered = v.buffered;
        if (buffered.length) {
            const edge = buffered.end(buffered.length - 1);
            if (edge - v.currentTime > 0.5) v.currentTime = edge;
        }
        void v.play().catch(() => {});
    }, [deckActive, hasVideo]);

    useStatusBarLight(true);

    useEffect(() => {
        let alive = true;
        void apiLiveJoin(liveId).then(res => {
            if (!alive) return;
            if (!res) { setEnded(true); return; }
            if (res.frame) setFrame(res.frame);
            setViewers(res.viewers);
            startedRef.current = res.startedAt;
        });
        return () => { alive = false; void apiLiveLeave(liveId); };
    }, [liveId]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            if (startedRef.current) setElapsed(Math.max(0, Math.floor((Date.now() - startedRef.current) / 1000)));
        }, 1000);
        return () => window.clearInterval(timer);
    }, []);

    const forUs = (id?: string) => !id || id === liveId;

    useEffect(() => () => { playerRef.current?.destroy(); playerRef.current = null; }, []);

    function ingestChunk(b64: string, init: boolean, mime?: string) {
        const v = videoRef.current;
        if (!v) return;
        if (init) {
            if (!playerRef.current) {
                const m = mime || mimeRef.current || 'video/webm';
                if (!liveVideoPlaybackSupported(m)) return;
                mimeRef.current = m;
                const player = new LiveVideoPlayer(v, m);
                player.start();
                playerRef.current = player;
            }
            playerRef.current.append(base64ToBytes(b64));
        } else if (playerRef.current) {
            playerRef.current.append(base64ToBytes(b64));
        }
    }

    useNuiEvent('sd-phone:vibez:liveFrame', (data: { liveId?: string; frame?: string } | undefined) => {
        if (!forUs(data?.liveId) || !data?.frame) return;
        setFrame(data.frame);
    });
    useNuiEvent('sd-phone:vibez:liveChunk', (data: { liveId?: string; chunk?: string; init?: boolean; mime?: string } | undefined) => {
        if (!forUs(data?.liveId) || !data?.chunk) return;
        ingestChunk(data.chunk, data.init === true, data.mime);
    });
    useNuiEvent('sd-phone:vibez:liveComment', (data: { liveId?: string; comment?: LiveComment } | undefined) => {
        if (!forUs(data?.liveId) || !data?.comment) return;
        setComments(prev => [...prev.slice(-5), data.comment as LiveComment]);
    });
    useNuiEvent('sd-phone:vibez:liveHeart', (data: { liveId?: string } | undefined) => {
        if (forUs(data?.liveId)) spawnHearts(1);
    });
    useNuiEvent('sd-phone:vibez:liveViewers', (data: { liveId?: string; viewers?: number } | undefined) => {
        if (forUs(data?.liveId) && typeof data?.viewers === 'number') setViewers(data.viewers);
    });
    useNuiEvent('sd-phone:vibez:liveEnded', (data: { liveId?: string } | undefined) => {
        if (forUs(data?.liveId)) setEnded(true);
    });

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
        spawnHearts(2);
        void apiLiveHeart(liveId);
    }

    function sendComment() {
        const text = draft.trim();
        if (!text) return;
        setDraft('');
        void apiLiveComment(liveId, text);
    }

    return (
        <div className="absolute inset-0 z-[60] flex flex-col overflow-hidden bg-black font-sf text-white">
            <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                onPlaying={() => setHasVideo(true)}
                onCanPlay={() => { void videoRef.current?.play?.().catch(() => {}); }}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ display: hasVideo ? 'block' : 'none' }}
            />
            {!hasVideo && (frame
                ? <img src={frame} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                : <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <img src={host.avatar} alt="" draggable={false} className="h-[88px] w-[88px] rounded-full object-cover opacity-90" />
                    <div className="text-[15px] text-white/70">{t('vibez.connectingToLive', "Connecting to {handle}'s LIVE…", { handle: host.handle })}</div>
                  </div>)}

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/60" />

            <div className="relative z-20 flex shrink-0 items-start justify-between px-4 pt-[62px]">
                <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 rounded-full bg-black/45 py-[3px] pl-[3px] pr-2.5 backdrop-blur-sm">
                        <img src={host.avatar} alt="" draggable={false} className="h-[26px] w-[26px] rounded-full object-cover" />
                        <span className="inline-flex items-center gap-1 text-[14px] font-semibold">
                            {host.handle}
                            {host.verified && (
                                <BadgeCheck className="h-[13px] w-[13px]" style={{ color: GRAD_FROM, fill: GRAD_FROM }} stroke="#000" strokeWidth={1.6} />
                            )}
                        </span>
                    </span>
                    <span
                        className="rounded-[7px] px-2 py-[3px] text-[12px] font-bold uppercase tracking-wide"
                        style={{ background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})` }}
                    >
                        {t('vibez.live', 'LIVE')}
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-[5px] text-[13px] font-semibold tabular-nums backdrop-blur-sm">
                        <Eye className="h-[14px] w-[14px]" strokeWidth={2.4} />
                        {viewers.toLocaleString()}
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => onClose()}
                    aria-label={t('vibez.leaveLive', 'Leave live')}
                    className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-black/45 backdrop-blur-sm active:scale-90"
                >
                    <X className="h-[20px] w-[20px]" strokeWidth={2.4} />
                </button>
            </div>

            <div className="relative z-20 px-4 pt-1.5">
                <span className="rounded-full bg-black/40 px-2 py-[3px] text-[12px] font-medium tabular-nums text-white/85 backdrop-blur-sm">
                    {formatDuration(elapsed)}
                </span>
            </div>

            <div className="min-h-0 flex-1" />

            <div className="relative z-20 flex shrink-0 items-end justify-between gap-3 px-4 pb-2">
                <div className="flex min-w-0 flex-1 flex-col justify-end gap-2">
                    {comments.map(c => <LiveCommentRow key={c.id} comment={c} />)}
                </div>
                <div className="pointer-events-none relative h-[180px] w-[60px] shrink-0">
                    {hearts.map(h => (
                        <Heart
                            key={h.id}
                            onAnimationEnd={() => setHearts(prev => prev.filter(x => x.id !== h.id))}
                            className="absolute bottom-0 h-[26px] w-[26px]"
                            fill="currentColor"
                            style={{ color: HEART, left: `${30 + h.left}%`, ['--drift' as string]: `${h.drift}px`, animation: 'live-heart-rise 1.8s ease-out forwards' }}
                        />
                    ))}
                </div>
            </div>

            <div className="relative z-20 flex shrink-0 items-center gap-2 px-4 pb-9">
                <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); sendComment(); } }}
                    placeholder={t('vibez.addComment', 'Add a comment…')}
                    spellCheck={false}
                    className="h-[44px] min-w-0 flex-1 rounded-full border border-white/30 bg-black/35 px-4 text-[15px] text-white outline-none backdrop-blur-sm placeholder:text-white/55"
                />
                <button
                    type="button"
                    aria-label={t('vibez.sendHeart', 'Send heart')}
                    onClick={sendHeart}
                    className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm active:scale-90"
                    style={{ color: HEART }}
                >
                    <Heart className="h-[24px] w-[24px]" fill="currentColor" strokeWidth={2} />
                </button>
            </div>

            {ended && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/75 backdrop-blur-sm">
                    <img src={host.avatar} alt="" draggable={false} className="h-[84px] w-[84px] rounded-full object-cover" />
                    <div className="text-center">
                        <div className="text-[20px] font-semibold">{t('vibez.liveHasEnded', 'LIVE has ended')}</div>
                        <div className="mt-1 text-[15px] text-white/65">{t('vibez.liveOver', "{handle}'s live is over.", { handle: host.handle })}</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onClose()}
                        className="mt-1 rounded-full bg-white px-6 py-2.5 text-[16px] font-semibold text-black active:opacity-80"
                    >
                        {t('vibez.done', 'Done')}
                    </button>
                </div>
            )}
        </div>
    );
}
