import { useEffect, useRef, useState } from 'react';
import { Play, Search, Video } from 'lucide-react';

import { t } from '@/i18n';
import { SearchBar } from '@/ui/SearchBar';
import { EmptyState } from '@/ui/EmptyState';
import { useAsyncData } from '@/hooks/useAsyncData';
import { isVideoUrl } from '@/core/photosApi';
import { fmt, type VPost } from './data';
import { apiDiscover, apiSearch, apiToggleFollow, type SearchUser } from './vibezApi';
import { Avatar, FadeImg, GridSkeleton, VerifiedBadge } from './ui';

const SB_H = 58;

export function Discover({ onOpenPost, onOpenProfile, refreshKey }: {
    onOpenPost:    (posts: VPost[], index: number) => void;
    onOpenProfile: (handle: string) => void;
    refreshKey:    number;
}) {
    const [query, setQuery] = useState('');
    const [trend, setTrend] = useState<string | null>(null);
    const [users, setUsers] = useState<SearchUser[]>([]);
    const [found, setFound] = useState<VPost[]>([]);
    const railRef = useRef<HTMLDivElement>(null);

    const { data, settled } = useAsyncData<{ posts: VPost[]; trends: string[] }>(
        () => apiDiscover(),
        [refreshKey],
    );
    const posts  = data?.posts ?? [];
    const trends = data?.trends ?? [];

    useEffect(() => {
        const el = railRef.current;
        if (!el) return;
        let glide: number | undefined;
        let aim = el.scrollLeft;

        function stopGlide() {
            if (glide !== undefined) { window.clearInterval(glide); glide = undefined; }
        }

        function limit() {
            return el ? el.scrollWidth - el.clientWidth : 0;
        }

        function onWheel(e: WheelEvent) {
            if (!el) return;
            const delta = e.deltaX || e.deltaY;
            if (!delta) return;

            const max = limit();
            const spent = delta > 0 ? el.scrollLeft >= max - 0.5 : el.scrollLeft <= 0.5;
            if (max <= 0 || spent) return;

            e.preventDefault();
            e.stopPropagation();

            if (glide === undefined) aim = el.scrollLeft;
            aim = Math.max(0, Math.min(max, aim + delta));
            stopGlide();
            glide = window.setInterval(() => {
                if (!el) return stopGlide();
                const gap = aim - el.scrollLeft;
                if (Math.abs(gap) < 0.5) { el.scrollLeft = aim; return stopGlide(); }
                el.scrollLeft += gap * 0.22;
            }, 16);
        }

        let holding = false;
        let dragged = false;
        let originX = 0;
        let originLeft = 0;
        let lastX = 0;
        let lastAt = 0;
        let speed = 0;

        function onDown(e: PointerEvent) {
            if (!el) return;
            stopGlide();
            holding = true;
            dragged = false;
            originX = e.clientX;
            originLeft = el.scrollLeft;
            lastX = e.clientX;
            lastAt = e.timeStamp;
            speed = 0;
        }
        function onMove(e: PointerEvent) {
            if (!holding || !el) return;
            const dx = e.clientX - originX;
            if (!dragged && Math.abs(dx) < 4) return;
            dragged = true;
            el.scrollLeft = originLeft - dx;

            const dt = e.timeStamp - lastAt;
            if (dt > 0) speed = (lastX - e.clientX) / dt;
            lastX = e.clientX;
            lastAt = e.timeStamp;
        }
        function onUp() {
            holding = false;
            if (!el || Math.abs(speed) < 0.05) return;
            let v = speed * 16;
            glide = window.setInterval(() => {
                if (!el) return stopGlide();
                v *= 0.94;
                const next = Math.max(0, Math.min(limit(), el.scrollLeft + v));
                if (Math.abs(v) < 0.3 || next === el.scrollLeft) { aim = el.scrollLeft; return stopGlide(); }
                el.scrollLeft = next;
                aim = next;
            }, 16);
        }
        function onClick(e: MouseEvent) {
            if (!dragged) return;
            e.preventDefault();
            e.stopPropagation();
            dragged = false;
        }

        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        el.addEventListener('click', onClick, true);
        return () => {
            stopGlide();
            el.removeEventListener('wheel', onWheel);
            el.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            el.removeEventListener('click', onClick, true);
        };
    }, [trends.length]);

    const searching = query.trim() !== '';
    useEffect(() => {
        if (!searching) { setUsers([]); setFound([]); return; }
        let alive = true;
        const timer = window.setTimeout(() => {
            void apiSearch(query).then(r => {
                if (!alive) return;
                setUsers(r.users);
                setFound(r.posts);
            });
        }, 220);
        return () => { alive = false; window.clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    function toggleFollow(handle: string) {
        setUsers(prev => prev.map(u => u.handle === handle ? { ...u, following: !u.following } : u));
        void apiToggleFollow(handle);
    }

    const shown = trend ? posts.filter(p => p.caption.toLowerCase().includes(trend.toLowerCase())) : posts;

    return (
        <div className="flex h-full flex-col bg-black text-white">
            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="shrink-0 px-3 pb-2">
                <SearchBar
                    forceDark
                    value={query}
                    onChange={setQuery}
                    placeholder={t('vibez.searchAll', 'Search creators, posts and tags')}
                    pillClassName="gap-2 rounded-full bg-white/10 px-4 py-2.5"
                    iconClassName="h-4 w-4 text-white/60"
                    textClassName="text-[14px] text-white placeholder-white/45"
                />
                {!searching && trends.length > 0 && (
                    <div ref={railRef} className="no-scrollbar -mx-3 mt-3 flex gap-2 overflow-x-auto pl-3">
                        {trends.map(tag => {
                            const on = trend === tag;
                            return (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setTrend(on ? null : tag)}
                                    className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[14px] font-semibold transition-colors active:scale-95 ${
                                        on
                                            ? 'bg-white text-black'
                                            : 'bg-white/[0.09] text-white/80 ring-1 ring-white/10 active:bg-white/[0.14]'
                                    }`}
                                >
                                    {tag}
                                </button>
                            );
                        })}
                        <span className="w-3 shrink-0" aria-hidden />
                    </div>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-4">
                {searching ? (
                    users.length === 0 && found.length === 0 ? (
                        <div className="dark">
                            <EmptyState icon={Search} title={t('vibez.noResults', 'No results')} circleClassName="bg-white/10" />
                        </div>
                    ) : <>
                        {users.length > 0 && (
                            <div className="px-4 pb-1 pt-2 text-[13px] font-semibold uppercase tracking-wide text-white/40">
                                {t('vibez.creators', 'Creators')}
                            </div>
                        )}
                        {users.map(u => (
                        <div key={u.handle} className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-white/[0.05]">
                            <button type="button" onClick={() => onOpenProfile(u.handle)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                                <Avatar size={46} src={u.avatar} />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1 text-[15px] font-semibold">
                                        @{u.handle}
                                        {u.verified && (
                                            <VerifiedBadge size={15} />
                                        )}
                                    </div>
                                    {u.name && u.name !== '' && <div className="truncate text-[13px] text-white/50">{u.name}</div>}
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleFollow(u.handle)}
                                className={`shrink-0 rounded-[8px] px-4 py-1.5 text-[14px] font-semibold transition-transform active:scale-95 ${
                                    u.following ? 'bg-white/[0.14] text-white' : 'bg-white text-black'
                                }`}
                            >
                                {u.following ? t('vibez.followingBtn', 'Following') : t('vibez.follow', 'Follow')}
                            </button>
                        </div>
                        ))}

                        {found.length > 0 && (
                            <>
                                <div className="px-4 pb-2 pt-4 text-[13px] font-semibold uppercase tracking-wide text-white/40">
                                    {t('vibez.posts', 'Posts')}
                                </div>
                                <PostGrid posts={found} onOpenPost={onOpenPost} />
                            </>
                        )}
                    </>
                ) : !settled ? (
                    <div className="px-0.5"><GridSkeleton count={12} /></div>
                ) : shown.length === 0 ? (
                    <div className="dark">
                        <EmptyState icon={Video} title={t('vibez.noPosts', 'No posts yet')} circleClassName="bg-white/10" />
                    </div>
                ) : (
                    <PostGrid posts={shown} onOpenPost={onOpenPost} />
                )}
            </div>
        </div>
    );
}

function PostGrid({ posts, onOpenPost }: {
    posts:      VPost[];
    onOpenPost: (posts: VPost[], index: number) => void;
}) {
    return (
        <div className="grid grid-cols-3 gap-[3px] px-[3px]">
            {posts.map((p, i) => (
                <button
                    key={p.id}
                    type="button"
                    onClick={() => onOpenPost(posts, i)}
                    className="relative aspect-[9/16] overflow-hidden rounded-[4px] bg-white/5 transition-transform active:scale-[0.97]"
                >
                    <Thumb post={p} />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                    <div
                        className="absolute bottom-2 left-2 flex items-center gap-1.5 text-white"
                        style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))' }}
                    >
                        <Play className="h-[13px] w-[13px]" fill="#fff" strokeWidth={0} />
                        <span className="text-[13px] font-semibold">{fmt(p.views)}</span>
                    </div>
                </button>
            ))}
        </div>
    );
}

export function Thumb({ post }: { post: VPost }) {
    const src = post.thumb || post.video;
    if (isVideoUrl(src)) {
        return <video src={src} muted playsInline preload="metadata" className="h-full w-full object-cover" />;
    }
    return <FadeImg src={src} className="h-full w-full object-cover" />;
}
