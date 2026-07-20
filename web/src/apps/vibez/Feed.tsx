import { useEffect, useRef, useState } from 'react';
import {
    BadgeCheck, Bookmark, Heart, MessageCircle, Music2, Plus, Radio, Trash2,
} from 'lucide-react';

import { t } from '@/i18n';
import { isVideoUrl } from '@/core/photosApi';
import { GRAD_FROM, GRAD_TO, HEART, fmt, type VLive, type VPost } from './data';
import type { FeedTab } from './vibezApi';

const SB_H = 54;

interface Pop { id: number; x: number; y: number }

export interface FeedHandlers {
    onToggleLike:   (id: string) => void;
    onLikeOn:       (id: string) => void;
    onToggleSave:   (id: string) => void;
    onOpenComments: (post: VPost) => void;
    onOpenProfile:  (handle: string) => void;
    onToggleFollow: (handle: string) => void;
    onView:         (id: string) => void;
    onDelete?:      (id: string) => void;
}

export function Feed({ posts, tab, onTab, lives, onOpenLive, myHandle, loading, handlers, initialIndex }: {
    posts:         VPost[];
    tab?:          FeedTab;
    onTab?:        (tab: FeedTab) => void;
    lives?:        VLive[];
    onOpenLive?:   (live: VLive) => void;
    myHandle?:     string;
    loading?:      boolean;
    handlers:      FeedHandlers;
    initialIndex?: number;
}) {
    const [active, setActive] = useState(initialIndex ?? 0);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Jump to the requested post before first paint (post viewer opened mid-list).
    useEffect(() => {
        const el = scrollRef.current;
        if (el && initialIndex) el.scrollTop = initialIndex * el.clientHeight;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // One view ping per post per mount.
    const viewed = useRef(new Set<string>());
    useEffect(() => {
        const post = posts[active];
        if (!post || viewed.current.has(post.id)) return;
        viewed.current.add(post.id);
        handlers.onView(post.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, posts]);

    function handleScroll(e: React.UIEvent<HTMLDivElement>) {
        const el = e.currentTarget;
        const idx = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
        setActive(prev => (prev === idx ? prev : idx));
    }

    return (
        <div className="relative h-full w-full">
            <style>{`
                @keyframes vibez-disc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes vibez-heart-pop {
                    0%   { transform: translate(-50%,-50%) scale(0)   rotate(-18deg); opacity: 0; }
                    18%  { transform: translate(-50%,-50%) scale(1.25) rotate(-12deg); opacity: 1; }
                    42%  { transform: translate(-50%,-50%) scale(0.95) rotate(-12deg); opacity: 1; }
                    70%  { transform: translate(-50%,-58%) scale(1)    rotate(-10deg); opacity: 1; }
                    100% { transform: translate(-50%,-92%) scale(1.1)  rotate(-8deg);  opacity: 0; }
                }
            `}</style>

            <div
                ref={scrollRef}
                className="h-full w-full overflow-y-auto no-scrollbar"
                style={{ scrollSnapType: 'y mandatory' }}
                onScroll={handleScroll}
            >
                {posts.map((p, i) => (
                    Math.abs(i - active) <= 1
                        ? (
                            <PostFrame
                                key={p.id}
                                post={p}
                                isActive={i === active}
                                isMine={!!myHandle && p.user.handle === myHandle}
                                handlers={handlers}
                            />
                        )
                        : (
                            <section
                                key={p.id}
                                className="relative h-full w-full overflow-hidden bg-black"
                                style={{ scrollSnapStop: 'always', scrollSnapAlign: 'start' }}
                            />
                        )
                ))}
                {posts.length === 0 && (
                    <section className="flex h-full w-full flex-col items-center justify-center gap-2 px-10 text-center">
                        {loading
                            ? <p className="text-[14px] text-white/50">{t('vibez.loading', 'Loading…')}</p>
                            : <>
                                <p className="text-[16px] font-semibold text-white/85">
                                    {tab === 'following' ? t('vibez.noFollowing', 'Nothing here yet') : t('vibez.noVibes', 'No vibes yet')}
                                </p>
                                <p className="text-[13px] leading-relaxed text-white/50">
                                    {tab === 'following'
                                        ? t('vibez.noFollowingHint', 'Follow creators to fill this feed.')
                                        : t('vibez.noVibesHint', 'Be the first — record a vibe and post it.')}
                                </p>
                            </>}
                    </section>
                )}
            </div>

            {tab && onTab && (
                <div className="pointer-events-none absolute inset-x-0" style={{ top: SB_H - 4 }}>
                    <div className="flex items-center justify-center gap-5">
                        <TopTab active={tab === 'following'} onClick={() => onTab('following')}>{t('vibez.following', 'Following')}</TopTab>
                        <span className="h-3.5 w-px bg-white/30" aria-hidden />
                        <TopTab active={tab === 'foryou'} onClick={() => onTab('foryou')}>{t('vibez.forYou', 'For You')}</TopTab>
                    </div>
                    {!!lives?.length && onOpenLive && (
                        <button
                            type="button"
                            onClick={() => onOpenLive(lives[0])}
                            className="pointer-events-auto absolute left-3 top-0 flex items-center gap-1 rounded-full bg-black/35 px-2.5 py-[5px] backdrop-blur-sm active:opacity-70"
                        >
                            <Radio className="h-[15px] w-[15px]" style={{ color: GRAD_TO }} strokeWidth={2.4} />
                            <span className="text-[12px] font-bold text-white">{t('vibez.live', 'LIVE')}</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function TopTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="pointer-events-auto relative flex flex-col items-center active:opacity-70"
        >
            <span
                className={active ? 'text-[16px] font-bold text-white' : 'text-[16px] font-semibold text-white/55'}
                style={active ? { textShadow: '0 1px 6px rgba(0,0,0,0.5)' } : undefined}
            >
                {children}
            </span>
            {active && <span className="absolute -bottom-1.5 h-[3px] w-6 rounded-full bg-white" />}
        </button>
    );
}

function Media({ post, isActive }: { post: VPost; isActive: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const isVideo = isVideoUrl(post.video);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;
        if (isActive) {
            v.muted = false;
            void v.play().catch(() => {
                // Autoplay with sound blocked (browser dev) — retry muted.
                v.muted = true;
                void v.play().catch(() => {});
            });
        } else {
            v.pause();
            v.currentTime = 0;
        }
    }, [isActive, post.video]);

    if (!isVideo) {
        return <img src={post.video} alt="" draggable={false} className="h-full w-full object-cover" />;
    }
    return (
        <video
            ref={videoRef}
            src={post.video}
            poster={post.thumb}
            loop
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
        />
    );
}

function PostFrame({ post, isActive, isMine, handlers }: {
    post:     VPost;
    isActive: boolean;
    isMine:   boolean;
    handlers: FeedHandlers;
}) {
    const [pops, setPops] = useState<Pop[]>([]);
    const lastTap = useRef(0);
    const popId   = useRef(0);

    function handleTap(e: React.MouseEvent<HTMLDivElement>) {
        const now = Date.now();
        if (now - lastTap.current < 280) {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const id = ++popId.current;
            setPops(prev => [...prev, { id, x, y }]);
            window.setTimeout(() => setPops(prev => prev.filter(p => p.id !== id)), 750);
            handlers.onLikeOn(post.id);
            lastTap.current = 0;
        } else {
            lastTap.current = now;
        }
    }

    return (
        <section
            className="relative h-full w-full overflow-hidden bg-black"
            style={{ scrollSnapStop: 'always', scrollSnapAlign: 'start' }}
        >
            <div className="absolute inset-0" onClick={handleTap}>
                <Media post={post} isActive={isActive} />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/45 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

                {pops.map(p => (
                    <Heart
                        key={p.id}
                        className="pointer-events-none absolute h-24 w-24 drop-shadow-lg"
                        style={{
                            left: p.x, top: p.y,
                            color: HEART, fill: HEART,
                            animation: 'vibez-heart-pop 0.75s ease-out forwards',
                        }}
                    />
                ))}
            </div>

            <div className="absolute bottom-[150px] right-2.5 flex flex-col items-center gap-[18px]">
                <div className="relative mb-1">
                    <button type="button" onClick={() => handlers.onOpenProfile(post.user.handle)} className="block active:opacity-80">
                        <img
                            src={post.user.avatar}
                            alt=""
                            draggable={false}
                            className="h-12 w-12 rounded-full object-cover ring-2 ring-white"
                        />
                    </button>
                    {!isMine && !post.following && (
                        <button
                            type="button"
                            aria-label={t('vibez.follow', 'Follow')}
                            onClick={() => handlers.onToggleFollow(post.user.handle)}
                            className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full text-white active:scale-90"
                            style={{ background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})` }}
                        >
                            <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                        </button>
                    )}
                </div>

                <RailAction label={t('vibez.like', 'Like')} count={fmt(post.likes)} onClick={() => handlers.onToggleLike(post.id)}>
                    <Heart
                        className="h-[34px] w-[34px] drop-shadow"
                        style={post.liked ? { color: HEART, fill: HEART } : { color: '#fff' }}
                        strokeWidth={post.liked ? 0 : 1.8}
                    />
                </RailAction>

                <RailAction label={t('vibez.comments', 'Comments')} count={fmt(post.comments)} onClick={() => handlers.onOpenComments(post)}>
                    <MessageCircle className="h-[33px] w-[33px] text-white drop-shadow" fill="#fff" strokeWidth={0} />
                </RailAction>

                {isMine && handlers.onDelete && (
                    <RailAction label={t('vibez.delete', 'Delete')} onClick={() => handlers.onDelete?.(post.id)}>
                        <Trash2 className="h-[29px] w-[29px] text-white drop-shadow" strokeWidth={1.9} />
                    </RailAction>
                )}

                <RailAction label={t('vibez.save', 'Save')} count={fmt(post.saves)} onClick={() => handlers.onToggleSave(post.id)}>
                    <Bookmark
                        className="h-[31px] w-[31px] drop-shadow"
                        style={post.saved ? { color: '#FACC15', fill: '#FACC15' } : { color: '#fff' }}
                        strokeWidth={post.saved ? 0 : 1.9}
                    />
                </RailAction>

                <div
                    className="mt-1 flex h-12 w-12 items-center justify-center rounded-full ring-[5px] ring-black/30"
                    style={{
                        background: `conic-gradient(${GRAD_FROM}, ${GRAD_TO}, ${GRAD_FROM})`,
                        animation: isActive ? 'vibez-disc-spin 4s linear infinite' : undefined,
                    }}
                >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/80">
                        <Music2 className="h-3.5 w-3.5 text-white" strokeWidth={2.4} />
                    </div>
                </div>
            </div>

            <div className="absolute bottom-[120px] left-3.5 right-20">
                <button
                    type="button"
                    onClick={() => handlers.onOpenProfile(post.user.handle)}
                    className="flex items-center gap-1.5 active:opacity-80"
                >
                    <span className="text-[16px] font-bold text-white drop-shadow">@{post.user.handle}</span>
                    {post.user.verified && (
                        <BadgeCheck className="h-[15px] w-[15px]" style={{ color: GRAD_FROM, fill: GRAD_FROM }} stroke="#fff" strokeWidth={1.6} />
                    )}
                    <span className="text-[13px] text-white/70">· {post.time}</span>
                </button>
                {post.caption !== '' && (
                    <div className="mt-1.5 text-[14px] leading-snug text-white drop-shadow">{post.caption}</div>
                )}
                <div className="mt-2 flex items-center gap-1.5 text-[13px] text-white/90">
                    <Music2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.2} />
                    <span className="truncate">{post.sound}</span>
                </div>
            </div>
        </section>
    );
}

function RailAction({ label, count, onClick, children }: {
    label:    string;
    count?:   string;
    onClick:  () => void;
    children: React.ReactNode;
}) {
    return (
        <button type="button" aria-label={label} onClick={onClick} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
            {children}
            {count !== undefined && (
                <span className="text-[12px] font-semibold text-white drop-shadow">{count}</span>
            )}
        </button>
    );
}
