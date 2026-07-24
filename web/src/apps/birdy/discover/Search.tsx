import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { SearchBar } from '@/ui/SearchBar';
import { apiSearch } from '../birdyApi';
import { BG, BLUE, META, PILL, type BirdyAuthor } from '../data';
import { BirdyBird } from '../BirdyBird';

import { Avatar, VerifiedBadge } from '../ui';

const TRENDING = [
    { tag: '#LosSantos',   posts: '4,812 posts' },
    { tag: '#Vinewood',    posts: '2,140 posts' },
    { tag: '#GrandSenora', posts: '1,309 posts' },
    { tag: '#PaletoBay',   posts: '861 posts' },
    { tag: '#SandyShores', posts: '512 posts' },
];

export function Search({ onOpenProfile }: { onOpenProfile: (handle?: string) => void }) {
    const [query,   setQuery]   = useSessionState('birdy:searchQuery', '');
    const [results, setResults] = useState<BirdyAuthor[]>([]);
    const [pending, setPending] = useState(false);
    const searching = query.trim().length > 0;

    useEffect(() => {
        if (!searching) { setResults([]); setPending(false); return; }
        let alive = true;
        setPending(true);
        const t = window.setTimeout(() => {
            void apiSearch(query).then(r => {
                if (!alive) return;
                setResults(r);
                setPending(false);
            });
        }, 200);
        return () => { alive = false; window.clearTimeout(t); };
    }, [query, searching]);

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
                    results.length === 0 ? (
                        // While the debounce + fetch run, say nothing rather than a false
                        // "no accounts" that corrects itself a beat later.
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
                        {TRENDING.map((t, i) => (
                            <div key={t.tag}>
                                <button
                                    type="button"
                                    onClick={() => setQuery(t.tag)}
                                    className="flex w-full flex-col items-start px-4 py-3 text-left active:bg-black/[0.04]"
                                >
                                    <span className="text-[19px] font-bold" style={{ color: BLUE }}>{t.tag}</span>
                                    <span className="mt-0.5 text-[14px]" style={{ color: META }}>{t.posts}</span>
                                </button>
                                {i < TRENDING.length - 1 && (
                                    <div className="pointer-events-none mx-[6%] h-[0.5px] bg-black/15" />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
