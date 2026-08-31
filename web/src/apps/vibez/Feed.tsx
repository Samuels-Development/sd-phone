import { useEffect, useRef, useState } from 'react';
import {
    Bookmark, Heart, Loader2, MessageCircle, Music2, Plus, Radio, Trash2, Video,
} from 'lucide-react';

import { t } from '@/i18n';
import { useDeckActive } from '@/shell/deckActive';
import { EmptyState } from '@/ui/EmptyState';
import { VerifiedBadge } from './ui';
import { isVideoUrl } from '@/core/photosApi';
import { GRAD_FROM, GRAD_TO, HEART, fmt, type VLive, type VPost } from './data';
import type { FeedTab } from './vibezApi';

const SB_H = 58;

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

    // The shell animates wheel input by nudging scrollTop a few pixels per tick, which a mandatory
    // snap container undoes on every one of those ticks - it re-snaps to the slide already under
    // the viewport, so the feed never advances. Claiming the event here (preventDefault marks it
    // handled for the window listener) and jumping a whole slide is what makes the wheel work.
    const count = posts.length;
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        let lock = 0;
        function onWheel(e: WheelEvent) {
            if (!e.deltaY || !el) return;
            e.preventDefault();
            e.stopPropagation();
            const now = Date.now();
            if (now < lock) return;
            lock = now + 420;
            const step = Math.max(1, el.clientHeight);
            const here = Math.round(el.scrollTop / step);
            const next = Math.max(0, Math.min(count - 1, here + (e.deltaY > 0 ? 1 : -1)));
            if (next === here) return;
            el.scrollTo({ top: next * step, behavior: 'smooth' });
        }
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [count]);

    return (
        <div className="relative h-full w-full">

            <div
                key={tab ?? 'viewer'}
                ref={scrollRef}
                className={`h-full w-full overflow-y-auto no-scrollbar ${
                    tab === 'foryou' ? 'animate-tab-in-right' : tab === 'following' ? 'animate-tab-in-left' : ''
                }`}
                style={{ scrollSnapType: 'y mandatory' }}
                onScroll={handleScroll}
            >
                {posts.map((p, i) => (
                    <section
                        key={p.id}
                        className="relative h-full w-full overflow-hidden bg-black"
                        style={{ scrollSnapStop: 'always', scrollSnapAlign: 'start' }}
                    >
                        {Math.abs(i - active) <= 1 && (
                            <PostFrame
                                post={p}
                                isActive={i === active}
                                isMine={!!myHandle && p.user.handle === myHandle}
                                handlers={handlers}
                            />
                        )}
                    </section>
                ))}
                {posts.length === 0 && (
                    <section className="flex h-full w-full items-center justify-center px-8">
                        {loading
                            ? <Loader2 className="h-7 w-7 animate-spin text-white/40" strokeWidth={2.2} />
                            : (
                                <div className="dark">
                                    <EmptyState
                                        icon={Video}
                                        center
                                        title={tab === 'following' ? t('vibez.noFollowing', 'Nothing here yet') : t('vibez.noVibes', 'No vibes yet')}
                                        subtitle={tab === 'following'
                                            ? t('vibez.noFollowingHint', 'Follow creators to fill this feed.')
                                            : t('vibez.noVibesHint', 'Be the first, record a clip and post it.')}
                                        circleClassName="bg-white/10"
                                    />
                                </div>
                            )}
                    </section>
                )}
            </div>

            {tab && onTab && (
                <div className="pointer-events-none absolute inset-x-0" style={{ top: SB_H + 10 }}>
                    <div className="flex items-center justify-center gap-6">
                        <TopTab active={tab === 'following'} onClick={() => onTab('following')}>{t('vibez.following', 'Following')}</TopTab>
                        <span className="h-4 w-px bg-white/25" aria-hidden />
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
            className="pointer-events-auto relative flex flex-col items-center px-1 transition-transform active:scale-95"
        >
            <span
                className={`text-[18px] font-bold transition-colors duration-200 ${active ? 'text-white' : 'text-white/50'}`}
                style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
            >
                {children}
            </span>
            <span
                className={`absolute -bottom-2 h-[3px] w-7 origin-center rounded-full bg-white transition-all duration-200 ease-out ${
                    active ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
                }`}
                aria-hidden
            />
        </button>
    );
}

function Media({ post, isActive }: { post: VPost; isActive: boolean }) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const deckActive = useDeckActive();
    const isVideo = isVideoUrl(post.video);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;

        if (isActive && deckActive) {
            v.muted = false;
            void v.play().catch(() => {
                v.muted = true;
                void v.play().catch(() => {});
            });
            return;
        }

        v.pause();
        if (!isActive) v.currentTime = 0;
    }, [isActive, deckActive, post.video]);

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
    const [burstId, setBurstId] = useState(0);
    const lastTap = useRef(0);

    function handleTap() {
        const now = Date.now();
        if (now - lastTap.current < 280) {
            setBurstId(id => id + 1);
            handlers.onLikeOn(post.id);
            lastTap.current = 0;
        } else {
            lastTap.current = now;
        }
    }

    return (
        <>
            <div className="absolute inset-0" onClick={handleTap}>
                <Media post={post} isActive={isActive} />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/45 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

                {burstId > 0 && (
                    <Heart
                        key={burstId}
                        onAnimationEnd={() => setBurstId(0)}
                        className="pointer-events-none absolute inset-0 m-auto h-[130px] w-[130px] text-white"
                        style={{ filter: 'drop-shadow(0 3px 12px rgba(0,0,0,0.4))', animation: 'ig-heart 1s ease-out forwards' }}
                        fill="currentColor"
                    />
                )}
            </div>

            <div
                className="pointer-events-none absolute bottom-0 right-0 top-[18%] w-[104px]"
                style={{ background: 'radial-gradient(70% 50% at 78% 62%, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.18) 55%, transparent 100%)' }}
                aria-hidden
            />

            <div
                className="absolute bottom-[40px] right-2.5 flex flex-col items-center gap-[22px]"
                style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.55)) drop-shadow(0 0 9px rgba(0,0,0,0.4))' }}
            >
                <div className="relative mb-1">
                    <button type="button" onClick={() => handlers.onOpenProfile(post.user.handle)} className="block active:opacity-80">
                        <img
                            src={post.user.avatar}
                            alt=""
                            draggable={false}
                            className="h-[54px] w-[54px] rounded-full object-cover ring-2 ring-white"
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
                        className="h-[40px] w-[40px] drop-shadow"
                        style={post.liked ? { color: HEART, fill: HEART } : { color: '#fff' }}
                        strokeWidth={post.liked ? 0 : 1.8}
                    />
                </RailAction>

                <RailAction label={t('vibez.comments', 'Comments')} count={fmt(post.comments)} onClick={() => handlers.onOpenComments(post)}>
                    <MessageCircle className="h-[39px] w-[39px] text-white drop-shadow" fill="#fff" strokeWidth={0} />
                </RailAction>

                {isMine && handlers.onDelete && (
                    <RailAction label={t('vibez.delete', 'Delete')} onClick={() => handlers.onDelete?.(post.id)}>
                        <Trash2 className="h-[34px] w-[34px] text-white drop-shadow" strokeWidth={1.9} />
                    </RailAction>
                )}

                <RailAction label={t('vibez.save', 'Save')} count={fmt(post.saves)} onClick={() => handlers.onToggleSave(post.id)}>
                    <Bookmark
                        className="h-[36px] w-[36px] drop-shadow"
                        style={post.saved ? { color: '#FACC15', fill: '#FACC15' } : { color: '#fff' }}
                        strokeWidth={post.saved ? 0 : 1.9}
                    />
                </RailAction>

                <div
                    className="mt-1 flex h-[52px] w-[52px] items-center justify-center rounded-full ring-[5px] ring-black/30"
                    style={{
                        background: `conic-gradient(${GRAD_FROM}, ${GRAD_TO}, ${GRAD_FROM})`,
                        animation: isActive ? 'disc-spin 4s linear infinite' : undefined,
                    }}
                >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/80">
                        <Music2 className="h-4 w-4 text-white" strokeWidth={2.4} />
                    </div>
                </div>
            </div>

            <div className="absolute bottom-[14px] left-3.5 right-20">
                <button
                    type="button"
                    onClick={() => handlers.onOpenProfile(post.user.handle)}
                    className="flex items-center gap-1.5 active:opacity-80"
                >
                    <span className="text-[18px] font-bold text-white drop-shadow">@{post.user.handle}</span>
                    {post.user.verified && (
                        <VerifiedBadge size={17} />
                    )}
                    <span className="text-[14.5px] text-white/70">· {post.time}</span>
                </button>
                {post.caption !== '' && (
                    <div className="mt-2 text-[15.5px] leading-snug text-white drop-shadow">{post.caption}</div>
                )}
                <div className="mt-2.5 flex items-center gap-2 text-[14.5px] text-white/90">
                    <Music2 className="h-[17px] w-[17px] shrink-0" strokeWidth={2.2} />
                    <span className="truncate">
                        {post.sound !== ''
                            ? post.sound
                            : t('vibez.originalSound', 'original sound — {handle}', { handle: post.user.handle })}
                    </span>
                </div>
            </div>
        </>
    );
}

function RailAction({ label, count, onClick, children }: {
    label:    string;
    count?:   string;
    onClick:  () => void;
    children: React.ReactNode;
}) {
    return (
        <button type="button" aria-label={label} onClick={onClick} className="flex flex-col items-center gap-1.5 transition-transform active:scale-90">
            {children}
            {count !== undefined && (
                <span className="text-[13.5px] font-semibold text-white drop-shadow">{count}</span>
            )}
        </button>
    );
}
