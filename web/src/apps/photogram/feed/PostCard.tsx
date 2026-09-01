import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { Bookmark, Heart, MessageCircle, Send, Trash2, Volume2, VolumeX } from 'lucide-react';

import { IG, type Post } from '../data';
import { isVideoUrl } from '../create/Media';
import { VerifiedCheck } from '../ui';
import { useDeckActive } from '@/shell/deckActive';
import { t } from '@/i18n';

export function PostCard({ post, onLike, onDoubleLike, onSave, onComment, onOpenProfile, onShare, onDelete, scrollRoot }: {
    post:          Post;
    onLike:        () => void;
    onDoubleLike:  () => void;
    onSave:        () => void;
    onComment:     () => void;
    onOpenProfile?: (handle: string) => void;
    onShare?:      () => void;
    onDelete?:     () => void;
    scrollRoot?:   RefObject<HTMLElement | null>;
}) {
    const n = post.images.length;
    const [idx, setIdx]     = useState(0);
    const [burstId, setBurstId] = useState(0);
    const [drag, setDrag]   = useState(0);
    const [dragging, setDragging] = useState(false);
    const down  = useRef(false);
    const start = useRef({ x: 0, y: 0 });
    const moved = useRef(0);
    const horiz = useRef(false);
    const wRef  = useRef(1);
    const lastTap = useRef(0);

    const viewportRef = useRef<HTMLDivElement>(null);
    const vids = useRef<Record<number, HTMLVideoElement | null>>({});
    const [inView, setInView] = useState(false);
    const [near,   setNear]   = useState(false);
    const [muted,  setMuted]  = useState(true);
    const hasVideo      = post.images.some(isVideoUrl);
    const activeIsVideo = isVideoUrl(post.images[idx] ?? '');
    // Pause every feed <video> (stops decode CPU) while the app is backgrounded; the
    // frame simply freezes and replays the in-view clip when it foregrounds again.
    const deckActive = useDeckActive();

    useEffect(() => {
        const el = viewportRef.current;
        if (!el || !hasVideo) return;
        const obs = new IntersectionObserver(
            entries => { const e = entries[0]; if (e) setInView(e.isIntersecting && e.intersectionRatio >= 0.55); },
            { root: scrollRoot?.current ?? null, threshold: [0, 0.55, 1] },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [hasVideo, scrollRoot]);

    useEffect(() => {
        const el = viewportRef.current;
        if (!el || !hasVideo) return;
        const obs = new IntersectionObserver(
            entries => { const e = entries[0]; if (e) setNear(e.isIntersecting); },
            { root: scrollRoot?.current ?? null, rootMargin: '150% 0px', threshold: 0 },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [hasVideo, scrollRoot]);

    useEffect(() => {
        for (const [k, v] of Object.entries(vids.current)) {
            if (!v) continue;
            if (Number(k) === idx && inView && deckActive) {
                v.muted = muted;
                void v.play().catch(() => {});
            } else {
                v.pause();
            }
        }
    }, [idx, inView, muted, deckActive, post.images]);

    function fireBurst() {
        setBurstId(id => id + 1);
    }

    function onPointerDown(e: ReactPointerEvent) {
        down.current = true;
        setDragging(true);
        start.current = { x: e.clientX, y: e.clientY };
        moved.current = 0;
        horiz.current = false;
        wRef.current = (e.currentTarget as HTMLElement).clientWidth || 1;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    function onPointerMove(e: ReactPointerEvent) {
        if (!down.current) return;
        const dx = e.clientX - start.current.x;
        const dy = e.clientY - start.current.y;
        moved.current = Math.max(moved.current, Math.abs(dx) + Math.abs(dy));
        if (!horiz.current && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) horiz.current = true;
        if (horiz.current && n > 1) {
            const w = wRef.current;
            const tx = Math.max(-(n - 1) * w, Math.min(0, -idx * w + dx));
            setDrag(tx + idx * w);
        }
    }
    function endDrag(e: ReactPointerEvent) {
        if (!down.current) return;
        down.current = false;
        setDragging(false);
        const dx = e.clientX - start.current.x;
        if (moved.current < 10) {
            const now = Date.now();
            if (now - lastTap.current < 280) { onDoubleLike(); fireBurst(); }
            lastTap.current = now;
            setDrag(0);
            return;
        }
        if (horiz.current && n > 1) {
            const threshold = wRef.current * 0.18;
            if (dx <= -threshold && idx < n - 1) setIdx(idx + 1);
            else if (dx >= threshold && idx > 0) setIdx(idx - 1);
        }
        setDrag(0);
    }

    return (
        <div className="pb-1">
            <button type="button" onClick={() => onOpenProfile?.(post.user.handle)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left active:opacity-60">
                <img src={post.user.avatar} alt="" draggable={false} loading="lazy" decoding="async" className="h-[48px] w-[48px] rounded-full object-cover" />
                <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[20px] font-semibold text-black">{post.user.handle}</span>
                        {post.user.verified && <VerifiedCheck size={24} />}
                    </div>
                    {post.location && <div className="mt-[2px] text-[15px] leading-tight text-black">{post.location}</div>}
                </div>
            </button>

            <div
                ref={viewportRef}
                className="relative aspect-[7/6] w-full touch-none select-none overflow-hidden bg-black"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={() => { down.current = false; setDragging(false); setDrag(0); }}
            >
                <div
                    className="flex h-full w-full"
                    style={{
                        transform: `translateX(calc(${-idx * 100}% + ${drag}px))`,
                        transition: dragging ? 'none' : 'transform 0.32s cubic-bezier(0.22,0.61,0.36,1)',
                    }}
                >
                    {post.images.map((src, i) => (
                        isVideoUrl(src) ? (!near ? (
                            <div key={i} className="h-full w-full shrink-0 bg-black" />
                        ) : (
                            <video
                                key={i}
                                ref={el => { vids.current[i] = el; }}
                                src={src}
                                muted={muted}
                                loop
                                playsInline
                                preload="metadata"
                                className="h-full w-full shrink-0 object-cover"
                            />
                        )) : (
                            <img key={i} src={src} alt={post.caption} draggable={false} loading="lazy" decoding="async" className="h-full w-full shrink-0 object-cover" />
                        )
                    ))}
                </div>
                {n > 1 && (
                    <div className="absolute right-3 top-3 rounded-full bg-black/55 px-2.5 py-[3px] text-[15px] font-semibold text-white">
                        {idx + 1}/{n}
                    </div>
                )}
                {activeIsVideo && (
                    <button
                        type="button"
                        aria-label={muted ? t('photogram.unmute', 'Unmute') : t('photogram.mute', 'Mute')}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); setMuted(m => !m); }}
                        className="absolute bottom-3 right-3 flex h-[34px] w-[34px] items-center justify-center rounded-full bg-black/55 text-white active:scale-90"
                    >
                        {muted ? <VolumeX className="h-[18px] w-[18px]" strokeWidth={2.2} /> : <Volume2 className="h-[18px] w-[18px]" strokeWidth={2.2} />}
                    </button>
                )}
                {burstId > 0 && (
                    <Heart
                        key={burstId}
                        onAnimationEnd={() => setBurstId(0)}
                        className="pointer-events-none absolute inset-0 m-auto h-[112px] w-[112px] text-white"
                        style={{ filter: 'drop-shadow(0 3px 12px rgba(0,0,0,0.4))', animation: 'ig-heart 1s ease-out forwards' }}
                        fill="currentColor"
                    />
                )}
            </div>

            <div className="relative flex items-center justify-between px-3 pt-3">
                <div className="flex items-center gap-5">
                    <button type="button" aria-label={t('photogram.like', 'Like')} onClick={onLike} className="active:opacity-50">
                        <Heart className="h-[30px] w-[30px]" strokeWidth={1.9} fill={post.liked ? IG.red : 'none'} style={{ color: post.liked ? IG.red : '#000' }} />
                    </button>
                    <button type="button" aria-label={t('photogram.comment', 'Comment')} onClick={onComment} className="text-black active:opacity-50">
                        <MessageCircle className="h-[30px] w-[30px] -scale-x-100" strokeWidth={1.9} />
                    </button>
                    <button type="button" aria-label={t('photogram.share', 'Share')} onClick={onShare} className="text-black active:opacity-50">
                        <Send className="h-[28px] w-[28px]" strokeWidth={1.9} />
                    </button>
                </div>

                {n > 1 && (
                    <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-[3px]">
                        {post.images.map((_, i) => (
                            <button key={i} type="button" aria-label={t('photogram.goToSlide', 'Go to slide {n}', { n: i + 1 })} onClick={() => setIdx(i)} className="flex items-center justify-center p-[2px] active:opacity-60">
                                <span className="rounded-full transition-colors" style={{ height: 9, width: 9, background: i === idx ? IG.blue : 'rgba(0,0,0,0.22)' }} />
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-5">
                    {onDelete && (
                        <button type="button" aria-label={t('photogram.deletePost', 'Delete post')} onClick={onDelete} className="text-black active:opacity-50">
                            <Trash2 className="h-[28px] w-[28px]" strokeWidth={1.9} />
                        </button>
                    )}
                    <button type="button" aria-label={t('common.save', 'Save')} onClick={onSave} className="active:opacity-50" style={{ color: post.saved ? '#F5B800' : '#000' }}>
                        <Bookmark className="h-[29px] w-[29px]" strokeWidth={1.9} fill={post.saved ? '#F5B800' : 'none'} />
                    </button>
                </div>
            </div>

            <div className="px-3.5 pt-2.5">
                <div className="text-[19px] font-semibold text-black">{post.likes.toLocaleString()} {post.likes === 1 ? t('photogram.likesCountSingular', 'Like') : t('photogram.likesCountPlural', 'Likes')}</div>
                <div className="mt-[4px] text-[19px] leading-snug text-black">
                    <span className="font-semibold">{post.user.handle}</span> {post.caption}
                </div>
                <button type="button" onClick={onComment} className="mt-[5px] block text-left text-[18px] active:opacity-50" style={{ color: '#555555' }}>
                    {post.comments > 0 ? t('photogram.viewAllComments', 'See all {count} comments', { count: post.comments }) : t('photogram.beFirstToComment', 'Be the first to comment…')}
                </button>
                <div className="mt-[6px] text-[13px] uppercase tracking-wide" style={{ color: '#6a6a6a' }}>{post.time}</div>
            </div>
        </div>
    );
}
