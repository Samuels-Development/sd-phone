import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, Heart, Image as ImageIcon, Loader2 } from 'lucide-react';

import { EmptyState } from '@/ui/EmptyState';
import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import type { StreakPost } from './data';

const STREAK_ORANGE = '#FF7A1A';

export function GalleryTab({ posts, dark, onLike, onLoadMore, loadingMore, hasMore }: {
    posts: StreakPost[];
    dark: boolean;
    onLike: (postId: number) => void;
    onLoadMore: () => void;
    loadingMore: boolean;
    hasMore: boolean;
}) {
    const [openId, setOpenId] = useState<number | null>(null);
    const isOpen = openId != null && posts.some(p => p.id === openId);

    const [burst, setBurst] = useState<{ id: number; key: number } | null>(null);
    const burstKey = useRef(0);
    const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTap = useRef<{ id: number; t: number } | null>(null);
    const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    function fireBurst(id: number) {
        burstKey.current += 1;
        setBurst({ id, key: burstKey.current });
        if (burstTimer.current) clearTimeout(burstTimer.current);
        burstTimer.current = setTimeout(() => setBurst(null), 650);
    }

    function handleTap(p: StreakPost) {
        const now = Date.now();
        if (lastTap.current && lastTap.current.id === p.id && now - lastTap.current.t < 300) {
            if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; }
            lastTap.current = null;
            fireBurst(p.id);
            if (!p.likedByMe) onLike(p.id);
        } else {
            lastTap.current = { id: p.id, t: now };
            if (openTimer.current) clearTimeout(openTimer.current);
            openTimer.current = setTimeout(() => { openTimer.current = null; setOpenId(p.id); }, 250);
        }
    }

    if (posts.length === 0) {
        return (
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <EmptyState
                    icon={ImageIcon}
                    title={t('streaks.noPhotosTitle', 'No Photos Yet')}
                    subtitle={t('streaks.noPhotosSubtitle', "Be the first to post today's photo and start a streak.")}
                />
            </div>
        );
    }

    return (
        <div className="relative flex-1 overflow-y-auto no-scrollbar px-3 pb-6 pt-2">
            <style>{`@keyframes heart-burst {0%{transform:scale(.3);opacity:0}30%{transform:scale(1.15);opacity:.95}62%{transform:scale(1);opacity:.95}100%{transform:scale(1.12);opacity:0}}`}</style>
            <div className="grid grid-cols-2 gap-2.5">
                {posts.map(p => (
                    <div
                        key={p.id}
                        role="button"
                        onClick={() => handleTap(p)}
                        className="relative aspect-square cursor-pointer overflow-hidden rounded-2xl shadow-sm active:opacity-90"
                    >
                        <img src={p.imageUrl} alt="" draggable={false} className="h-full w-full object-cover" />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15" />

                        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-black/40 py-0.5 pl-1.5 pr-2 text-[15px] font-extrabold text-white shadow-sm ring-1 ring-white/15">
                            <Flame className="h-[16px] w-[16px]" strokeWidth={2.4} style={{ color: STREAK_ORANGE }} fill={STREAK_ORANGE} />
                            {p.dayStreak}
                        </span>

                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onLike(p.id); }}
                            aria-label={p.likedByMe ? t('streaks.unlike', 'Unlike') : t('streaks.like', 'Like')}
                            className="absolute bottom-2 right-2 flex items-center gap-1.5 px-1 py-1 text-[15px] font-bold text-white drop-shadow active:scale-90"
                        >
                            <Heart
                                className="h-[19px] w-[19px]"
                                strokeWidth={2.6}
                                fill={p.likedByMe ? '#FF3B5C' : 'none'}
                                color={p.likedByMe ? '#FF3B5C' : 'white'}
                            />
                            {p.likeCount}
                        </button>

                        {burst?.id === p.id && (
                            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <Heart
                                    key={burst.key}
                                    className="h-16 w-16"
                                    strokeWidth={1.5}
                                    fill="#FF3B5C"
                                    color="#FF3B5C"
                                    style={{ animation: 'heart-burst 0.6s ease-out forwards', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))' }}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {hasMore && (
                <div className="flex justify-center pt-4">
                    <button
                        type="button"
                        onClick={onLoadMore}
                        disabled={loadingMore}
                        className={`flex items-center gap-2 rounded-full px-5 py-2 text-[14px] font-semibold ${
                            dark ? 'bg-white/[0.12] text-white' : 'bg-black/[0.06] text-black'
                        } active:opacity-70 disabled:opacity-60`}
                    >
                        {loadingMore ? (
                            <>
                                <Loader2 className="h-[15px] w-[15px] animate-spin" strokeWidth={2.6} />
                                {t('streaks.loading', 'Loading')}
                            </>
                        ) : (
                            t('streaks.loadMore', 'Load more')
                        )}
                    </button>
                </div>
            )}

            {isOpen && openId != null && (
                <PhotoViewer
                    posts={posts}
                    openId={openId}
                    dark={dark}
                    onClose={() => setOpenId(null)}
                    onNavigate={setOpenId}
                    onLike={onLike}
                    onLoadMore={onLoadMore}
                    hasMore={hasMore}
                />
            )}
        </div>
    );
}

function PhotoViewer({ posts, openId, dark, onClose, onNavigate, onLike, onLoadMore, hasMore }: {
    posts: StreakPost[];
    openId: number;
    dark: boolean;
    onClose: () => void;
    onNavigate: (id: number) => void;
    onLike: (postId: number) => void;
    onLoadMore: () => void;
    hasMore: boolean;
}) {
    const { goBack, pageStyle } = useIosPush(onClose);
    const [dir, setDir] = useState<'next' | 'prev'>('next');
    const [burst, setBurst] = useState(false);
    const areaRef = useRef<HTMLDivElement>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const lastTap = useRef(0);
    const burstKey = useRef(0);
    const burstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    function fireBurst() {
        burstKey.current += 1;
        setBurst(true);
        if (burstTimer.current) clearTimeout(burstTimer.current);
        burstTimer.current = setTimeout(() => setBurst(false), 650);
    }

    const index = posts.findIndex(p => p.id === openId);
    if (index < 0) return null;
    const post = posts[index];
    const atStart = index <= 0;
    const atEnd = index >= posts.length - 1;

    function prev() {
        if (atStart) return;
        setDir('prev');
        onNavigate(posts[index - 1].id);
    }
    function next() {
        if (atEnd) { if (hasMore) onLoadMore(); return; }
        setDir('next');
        onNavigate(posts[index + 1].id);
    }

    function onPointerDown(e: React.PointerEvent) {
        start.current = { x: e.clientX, y: e.clientY };
    }
    function onPointerUp(e: React.PointerEvent) {
        const s = start.current;
        start.current = null;
        if (!s || !areaRef.current) return;
        const w = areaRef.current.getBoundingClientRect().width || 1;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.abs(dx) > w * 0.12 && Math.abs(dx) > Math.abs(dy) * 1.3) {
            if (dx < 0) next(); else prev();
            lastTap.current = 0;
            return;
        }
        const onButton = (e.target as HTMLElement | null)?.closest('button');
        if (!onButton && Math.abs(dx) < 14 && Math.abs(dy) < 14) {
            const now = Date.now();
            if (now - lastTap.current < 300) {
                lastTap.current = 0;
                fireBurst();
                if (!post.likedByMe) onLike(post.id);
            } else {
                lastTap.current = now;
            }
        }
    }

    const arrowBtn = 'absolute top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white shadow-[0_2px_6px_rgba(0,0,0,0.55)] ring-1 ring-white/30 transition active:scale-90 active:bg-black/65';
    const chevronCls = 'h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]';

    return (
        <div className={`absolute inset-0 z-20 flex flex-col ${dark ? 'bg-black text-white' : 'bg-[#d4d4d4] text-black'}`} style={pageStyle}>
            <style>{`@keyframes heart-burst {0%{transform:scale(.3);opacity:0}30%{transform:scale(1.15);opacity:.95}62%{transform:scale(1);opacity:.95}100%{transform:scale(1.12);opacity:0}}`}</style>
            <div className="flex shrink-0 items-center justify-between pb-1.5 pl-2 pr-3 pt-1">
                <button
                    type="button"
                    onClick={goBack}
                    aria-label={t('streaks.back', 'Back')}
                    className="flex h-9 items-center pl-1 pr-2 text-[16px] font-semibold active:opacity-60"
                    style={{ color: STREAK_ORANGE }}
                >
                    <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.6} />
                    {t('streaks.gallery', 'Gallery')}
                </button>
                <span className={`text-[13px] font-semibold tabular-nums ${dark ? 'text-white/55' : 'text-black/45'}`}>
                    {index + 1} / {posts.length}
                </span>
            </div>

            <div
                ref={areaRef}
                className="relative min-h-0 flex-1 select-none overflow-hidden"
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
            >
                <div
                    key={post.id}
                    className={`flex h-full flex-col px-4 pb-4 pt-1 ${dir === 'next' ? 'animate-tab-in-right' : 'animate-tab-in-left'}`}
                >
                    <div className={`min-h-0 flex-1 rounded-[20px] p-2.5 shadow-md ${dark ? 'bg-[#1c1c1e] ring-1 ring-white/[0.07]' : 'bg-white ring-1 ring-black/[0.06]'}`}>
                        <div className="relative h-full overflow-hidden rounded-[13px]">
                            <img src={post.imageUrl} alt="" draggable={false} className="h-full w-full object-cover" />
                            {burst && (
                                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                    <Heart
                                        key={burstKey.current}
                                        className="h-24 w-24"
                                        strokeWidth={1.5}
                                        fill="#FF3B5C"
                                        color="#FF3B5C"
                                        style={{ animation: 'heart-burst 0.65s ease-out forwards', filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.4))' }}
                                    />
                                </div>
                            )}

                            {!atStart && (
                                <button
                                    type="button"
                                    onClick={prev}
                                    aria-label={t('streaks.previousPhoto', 'Previous photo')}
                                    className={`${arrowBtn} left-2`}
                                >
                                    <ChevronLeft className={chevronCls} strokeWidth={2.5} />
                                </button>
                            )}
                            {(!atEnd || hasMore) && (
                                <button
                                    type="button"
                                    onClick={next}
                                    aria-label={t('streaks.nextPhoto', 'Next photo')}
                                    className={`${arrowBtn} right-2`}
                                >
                                    <ChevronRight className={chevronCls} strokeWidth={2.5} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="shrink-0 pt-0.5">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-baseline gap-1">
                                <span className="truncate text-[22px] font-bold leading-tight">{post.author}</span>
                                <span className={`flex shrink-0 items-center gap-1 text-[14px] font-semibold ${dark ? 'text-white/55' : 'text-black/50'}`}>
                                    <Flame className="h-[13px] w-[13px]" style={{ color: STREAK_ORANGE }} strokeWidth={2.6} />
                                    {t('streaks.dayN', 'Day {day}', { day: post.dayStreak })}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => onLike(post.id)}
                                aria-label={post.likedByMe ? t('streaks.unlike', 'Unlike') : t('streaks.like', 'Like')}
                                className="flex shrink-0 flex-col items-center active:scale-90"
                            >
                                <Heart
                                    className="h-[36px] w-[36px]"
                                    strokeWidth={2.1}
                                    fill={post.likedByMe ? '#FF3B5C' : 'none'}
                                    color={post.likedByMe ? '#FF3B5C' : (dark ? 'white' : 'black')}
                                />
                                <span className="mt-1 text-[15px] font-bold tabular-nums">{post.likeCount}</span>
                            </button>
                        </div>

                        {post.caption && (
                            <p className={`-mt-1.5 line-clamp-2 text-[18px] leading-snug ${dark ? 'text-white/95' : 'text-black/90'}`}>
                                {post.caption}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
