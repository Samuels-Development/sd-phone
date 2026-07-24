import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { SearchBar } from '@/ui/SearchBar';
import { apiHashtagPosts, apiSearch, apiTrending } from '../birdyApi';
import { BG, BLUE, META, PILL, type BirdyAuthor, type BirdyPost } from '../data';
import { BirdyBird } from '../BirdyBird';
import { PostCard } from '../feed/PostCard';
import type { TrendingTag } from '../hashtags';

import { Avatar, VerifiedBadge } from '../ui';

export function Search({ me, onOpenProfile, onOpenPost, onToggleLike, onToggleRepost }: {
    me:             BirdyAuthor;
    onOpenProfile:  (handle?: string) => void;
    onOpenPost:     (id: string) => void;
    onToggleLike:   (id: string) => void;
    onToggleRepost: (id: string) => void;
}) {
    const [query,       setQuery]       = useSessionState('birdy:searchQuery', '');
    const [results,     setResults]     = useState<BirdyAuthor[]>([]);
    const [postResults, setPostResults] = useState<BirdyPost[]>([]);
    // null = not fetched yet, so the empty state never flashes ahead of the data.
    const [trending,    setTrending]    = useState<TrendingTag[] | null>(null);
    const [pending,     setPending]     = useState(false);
    const trimmedQ  = query.trim();
    const searching = trimmedQ.length > 0;
    const tagMode   = trimmedQ.startsWith('#');

    useEffect(() => {
        if (!searching) { setResults([]); setPostResults([]); setPending(false); return; }
        let alive = true;
        setPending(true);
        const timer = window.setTimeout(() => {
            if (tagMode) {
                void apiHashtagPosts(trimmedQ).then(p => {
                    if (!alive) return;
                    setPostResults(p); setResults([]); setPending(false);
                });
            } else {
                void apiSearch(trimmedQ).then(r => {
                    if (!alive) return;
                    setResults(r); setPostResults([]); setPending(false);
                });
            }
        }, 200);
        return () => { alive = false; window.clearTimeout(timer); };
    }, [trimmedQ, searching, tagMode]);

    useEffect(() => {
        if (searching) return;
        let alive = true;
        void apiTrending().then(tags => { if (alive) setTrending(tags); });
        return () => { alive = false; };
    }, [searching]);

    // Patch the local copy too; the parent's toggle only reaches the feed and open-post copies.
    function flipLike(id: string) {
        setPostResults(prev => prev.map(p => p.id === id
            ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p));
        onToggleLike(id);
    }

    function flipRepost(id: string) {
        setPostResults(prev => prev.map(p => p.id === id
            ? { ...p, reposted: !p.reposted, reposts: p.reposts + (p.reposted ? -1 : 1) } : p));
        onToggleRepost(id);
    }

    return (
        <div className="flex h-full flex-col" style={{ background: BG }}>
            <header className="flex shrink-0 items-center gap-3 px-4 py-2">
                <button type="button" onClick={() => onOpenProfile()} aria-label={t('birdy.yourProfile', 'Your profile')}><Avatar size={44} /></button>
                <SearchBar
                    value={query}
                    onChange={setQuery}
                    placeholder={t('birdy.searchBirdy', 'Search Birdy')}
                    pillClassName="min-w-0 flex-1 gap-2 rounded-[12px] px-3.5 py-[10px]"
                    pillStyle={{ background: PILL }}
                    textClassName="text-[17px] font-medium text-black placeholder:text-black/55"
                    caretColor={BLUE}
                />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                {searching ? (
                    tagMode ? (
                        postResults.length === 0 ? (
                            // While the debounce + fetch run, say nothing rather than a false
                            // "no posts" that corrects itself a beat later.
                            pending ? null : (
                                <div className="px-10 py-16 text-center text-[15px]" style={{ color: META }}>{t('birdy.noPostsFound', 'No posts found.')}</div>
                            )
                        ) : (
                            postResults.map(p => (
                                <PostCard
                                    key={p.id}
                                    post={p}
                                    isOwn={p.author.handle === me.handle}
                                    onToggleLike={() => flipLike(p.id)}
                                    onToggleRepost={() => flipRepost(p.id)}
                                    onOpen={() => onOpenPost(p.id)}
                                    onOpenAuthor={onOpenProfile}
                                />
                            ))
                        )
                    ) : results.length === 0 ? (
                        pending ? null : (
                            <div className="px-10 py-16 text-center text-[15px]" style={{ color: META }}>{t('birdy.noAccountsFound', 'No accounts found.')}</div>
                        )
                    ) : (
                        results.map(u => (
                            <button
                                key={u.handle}
                                type="button"
                                onClick={() => onOpenProfile(u.handle)}
                                className="flex w-full items-center gap-3.5 px-4 py-3 text-left transition-colors active:bg-black/[0.04]"
                            >
                                <Avatar size={48} src={u.avatar} />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1">
                                        <span className="truncate text-[17px] font-bold text-black">{u.name}</span>
                                        {u.verified && <VerifiedBadge size={16} />}
                                    </div>
                                    <div className="truncate text-[15px]" style={{ color: META }}>@{u.handle}</div>
                                </div>
                            </button>
                        ))
                    )
                ) : (
                    <div>
                        <div className="relative flex h-[200px] w-full items-center justify-center overflow-hidden pb-6" style={{ background: BLUE }}>
                            <BirdyBird className="h-28 w-28 text-white" />
                            <span className="absolute bottom-4 left-4 text-[17px] font-bold text-white">{t('birdy.startSearching', 'Start searching to explore Birdy')}</span>
                        </div>

                        <h2 className="px-4 pb-1.5 pt-4 text-[22px] font-extrabold text-black">{t('birdy.trendingHashtags', 'Trending hashtags')}</h2>
                        {trending !== null && (
                            trending.length === 0 ? (
                                <div className="px-10 py-10 text-center text-[15px]" style={{ color: META }}>{t('birdy.noTrending', 'No trending hashtags right now.')}</div>
                            ) : (
                                trending.map((row, i) => (
                                    <div key={row.tag}>
                                        <button
                                            type="button"
                                            onClick={() => setQuery(row.tag)}
                                            className="flex w-full flex-col items-start px-4 py-3 text-left active:bg-black/[0.04]"
                                        >
                                            <span className="text-[19px] font-bold" style={{ color: BLUE }}>{row.tag}</span>
                                            <span className="mt-0.5 text-[14px]" style={{ color: META }}>
                                                {row.count === 1
                                                    ? t('birdy.onePost', '1 post')
                                                    : t('birdy.postsCount', '{count} posts', { count: row.count.toLocaleString() })}
                                            </span>
                                        </button>
                                        {i < trending.length - 1 && (
                                            <div className="pointer-events-none mx-[6%] h-[0.5px] bg-black/15" />
                                        )}
                                    </div>
                                ))
                            )
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
