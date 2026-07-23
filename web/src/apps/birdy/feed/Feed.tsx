import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';

import { BirdyBird } from '../BirdyBird';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { BLUE, META, type BirdyAuthor, type BirdyPost } from '../data';
import { FeedSkeleton } from '../polish/Skeleton';
import { usePullToRefresh } from '../polish/usePullToRefresh';
import { PostCard } from './PostCard';
import { Avatar } from '../ui';

type FeedKind = 'all' | 'following';

export function Feed({ posts, me, feed, onFeedChange, onRefresh, onToggleLike, onToggleRepost, onOpenPost, onOpenProfile, onOpenAuthor }: {
    posts:         BirdyPost[] | null;
    me:            BirdyAuthor;
    feed:          FeedKind;
    onFeedChange:  (f: FeedKind) => void;
    onRefresh:     () => Promise<unknown>;
    onToggleLike:  (id: string) => void;
    onToggleRepost: (id: string) => void;
    onOpenPost:    (id: string) => void;
    onOpenProfile: () => void;
    onOpenAuthor?: (handle: string) => void;
}) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const { pull, refreshing, armed } = usePullToRefresh(scrollRef, onRefresh);

    // While the reader is deep in the feed, a background refetch would yank the column out from
    // under them - hold the fresh list back and offer it through the "New posts" pill instead.
    // In-place changes (likes, reposts) keep the same head post and flow straight through.
    const [shown,  setShown]  = useState<BirdyPost[] | null>(posts);
    const [hasNew, setHasNew] = useState(false);
    useEffect(() => {
        const el = scrollRef.current;
        const deep = (el?.scrollTop ?? 0) > 400;
        setShown(prev => {
            if (!posts || !prev || prev.length === 0 || !deep) { setHasNew(false); return posts; }
            if (posts[0]?.id === prev[0]?.id) return posts;
            setHasNew(true);
            return prev;
        });
    }, [posts]);

    function showNewPosts() {
        setShown(posts);
        setHasNew(false);
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    return (
        <div className="flex h-full flex-col">
            <header className="shrink-0">
                <div className="flex items-center px-4 py-2">
                    <button type="button" onClick={onOpenProfile} aria-label={t('birdy.yourProfile', 'Your profile')}><Avatar size={44} src={me.avatar} /></button>
                    <div className="flex flex-1 justify-center">
                        <BirdyBird className="h-8 w-8 text-[#1d9bf0]" />
                    </div>
                    <div className="w-11" aria-hidden />
                </div>
                <div className="relative flex border-b border-black/10">
                    <FeedTab label={t('birdy.all', 'All')}       active={feed === 'all'}       onClick={() => onFeedChange('all')} />
                    <FeedTab label={t('birdy.following', 'Following')} active={feed === 'following'} onClick={() => onFeedChange('following')} />
                    <span
                        aria-hidden
                        className="absolute bottom-0 left-0 flex w-1/2 justify-center transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                        style={{ transform: feed === 'following' ? 'translateX(100%)' : 'translateX(0)' }}
                    >
                        <span className="h-[3.5px] w-14 rounded-full" style={{ background: BLUE }} />
                    </span>
                </div>
            </header>

            <div className="relative min-h-0 flex-1">
                {(pull > 0 || refreshing) && (
                    <div
                        className="pointer-events-none absolute left-1/2 top-2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full bg-white shadow-md"
                        style={{ opacity: Math.min(1, pull / 40) }}
                    >
                        <Loader2
                            className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`}
                            style={refreshing ? { color: BLUE } : { color: armed ? BLUE : META, transform: `rotate(${pull * 3.2}deg)` }}
                            strokeWidth={2.4}
                        />
                    </div>
                )}

                {hasNew && (
                    <button
                        type="button"
                        onClick={showNewPosts}
                        className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-semibold text-white shadow-lg transition-transform active:scale-95"
                        style={{ background: BLUE }}
                    >
                        <ArrowUp className="h-4 w-4" strokeWidth={2.6} />
                        {t('birdy.newPosts', 'New posts')}
                    </button>
                )}

                <div
                    ref={scrollRef}
                    key={feed}
                    className="h-full animate-swipe-in-left overflow-y-auto"
                    style={{
                        transform: pull > 0 ? `translateY(${pull}px)` : undefined,
                        transition: pull === 0 ? 'transform 0.28s cubic-bezier(0.22,1,0.36,1)' : undefined,
                    }}
                >
                    {shown === null ? (
                        <FeedSkeleton />
                    ) : shown.length === 0 ? (
                        <EmptyState
                            center
                            icon={<BirdyBird className="h-8 w-8" />}
                            circleClassName="bg-black/[0.06] text-black/35"
                            title={feed === 'following'
                                ? t('birdy.nothingHereYet', 'Nothing here yet')
                                : t('birdy.noPostsYet', 'No posts yet')}
                            subtitle={feed === 'following'
                                ? t('birdy.followingEmptySubtitle', 'When you follow people, their latest posts will show up here.')
                                : t('birdy.feedEmptySubtitle', 'Posts from you and people you follow will show up here.')}
                            subtitleClassName="text-[#536471]"
                        />
                    ) : (
                        shown.map(p => (
                            <PostCard
                                key={p.id}
                                post={p}
                                isOwn={p.author.handle === me.handle}
                                onToggleLike={() => onToggleLike(p.id)}
                                onToggleRepost={() => onToggleRepost(p.id)}
                                onOpen={() => onOpenPost(p.id)}
                                onOpenAuthor={onOpenAuthor}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function FeedTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="relative flex-1 py-3.5 text-[17px]">
            <span className={`transition-colors duration-200 ${active ? 'font-bold text-black' : 'font-medium'}`} style={active ? undefined : { color: META }}>
                {label}
            </span>
        </button>
    );
}
