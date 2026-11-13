import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useTheme } from '@/stores/themeStore';
import { useSessionState } from '@/hooks/useSessionState';
import { useAsyncData } from '@/hooks/useAsyncData';
import { SearchBar } from '@/ui/SearchBar';
import { apiHashtagPosts, apiSearch, apiTrending } from '../birdyApi';
import { BG, BLUE, BRAND, BRAND_DIM, META, PILL, postKey, type BirdyAuthor, type BirdyPost} from '../data';
import { BirdyBird } from '../BirdyBird';
import { PostCard } from '../feed/PostCard';

import { Avatar, VerifiedBadge } from '../ui';

export function Search({ me, onOpenProfile, onOpenPost, onToggleLike, onToggleRepost }: {
    me:             BirdyAuthor;
    onOpenProfile:  (handle?: string) => void;
    onOpenPost:     (id: string) => void;
    onToggleLike:   (id: string) => void;
    onToggleRepost: (id: string) => void;
}) {
    const { theme } = useTheme('theme');
    const isDark = theme === 'dark';

    const [query,       setQuery]       = useSessionState('birdy:searchQuery', '');
    const [results,     setResults]     = useState<BirdyAuthor[]>([]);
    const [postResults, setPostResults] = useState<BirdyPost[]>([]);
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

    const { data: trending } = useAsyncData(apiTrending, [searching], { enabled: !searching });

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
                <button type="button" onClick={() => onOpenProfile()} aria-label={t('squawk.yourProfile', 'Your profile')}><Avatar size={44} src={me.avatar} /></button>
                <SearchBar
                    value={query}
                    onChange={setQuery}
                    placeholder={t('squawk.searchSquawk', 'Search Squawk')}
                    pillClassName="min-w-0 flex-1 gap-2 rounded-[12px] px-3.5 py-[10px]"
                    pillStyle={{ background: PILL }}
                    iconClassName="h-[18px] w-[18px] text-label/55"
                    textClassName="text-[17px] font-medium text-label placeholder:text-label/55"
                    caretColor={BLUE}
                />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                {searching ? (
                    tagMode ? (
                        postResults.length === 0 ? (
                            pending ? null : (
                                <div className="px-10 py-16 text-center text-[15px]" style={{ color: META }}>{t('squawk.noPostsFound', 'No posts found.')}</div>
                            )
                        ) : (
                            postResults.map(p => (
                                <PostCard
                                    key={postKey(p)}
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
                            <div className="px-10 py-16 text-center text-[15px]" style={{ color: META }}>{t('squawk.noAccountsFound', 'No accounts found.')}</div>
                        )
                    ) : (
                        results.map(u => (
                            <button
                                key={u.handle}
                                type="button"
                                onClick={() => onOpenProfile(u.handle)}
                                className="flex w-full items-center gap-3.5 px-4 py-3.5 text-start transition-colors active:bg-hairline/[0.04]"
                            >
                                <Avatar size={54} src={u.avatar} />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1">
                                        <span dir="auto" className="truncate text-[18px] font-bold text-label">{u.name}</span>
                                        {u.verified && <VerifiedBadge size={18} type={u.verifiedType} />}
                                    </div>
                                    <div className="truncate text-[16px]" style={{ color: META }}><span dir="ltr">@{u.handle}</span></div>
                                </div>
                            </button>
                        ))
                    )
                ) : (
                    <div>
                        <div className="relative flex h-[200px] w-full items-center justify-center overflow-hidden pb-6" style={{ background: isDark ? BRAND_DIM : BRAND }}>
                            <BirdyBird className={`h-28 w-28 ${isDark ? 'text-white/85' : 'text-white'}`} />
                            <span className="absolute bottom-4 start-4 text-[17px] font-bold text-white">{t('squawk.startSearching', 'Start searching to explore Squawk')}</span>
                        </div>

                        <h2 className="px-4 pb-1.5 pt-4 text-[22px] font-extrabold text-label">{t('squawk.trendingNow', 'Trending now')}</h2>
                        {trending !== null && (
                            trending.length === 0 ? (
                                <div className="px-10 py-10 text-center text-[15px]" style={{ color: META }}>{t('squawk.noTrending', 'No trending hashtags right now.')}</div>
                            ) : (
                                trending.map((row, i) => (
                                    <div key={row.tag}>
                                        <button
                                            type="button"
                                            onClick={() => setQuery(row.tag)}
                                            className="flex w-full flex-col items-start px-4 py-3 text-start active:bg-hairline/[0.04]"
                                        >
                                            <span dir="auto" className="text-[19px] font-bold" style={{ color: BLUE }}>{row.tag}</span>
                                            <span className="mt-0.5 text-[14px]" style={{ color: META }}>
                                                {row.count === 1
                                                    ? t('squawk.onePost', '1 post')
                                                    : t('squawk.postsCount', '{count} posts', { count: row.count.toLocaleString() })}
                                            </span>
                                        </button>
                                        {i < trending.length - 1 && (
                                            <div className="pointer-events-none mx-[6%] h-[0.5px] bg-hairline/15" />
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
