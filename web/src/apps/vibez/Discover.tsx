import { useEffect, useState } from 'react';
import { BadgeCheck, Play, Search, X } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { isVideoUrl } from '@/core/photosApi';
import { GRAD_FROM, GRAD_TO, fmt, type VPost } from './data';
import { apiDiscover, apiSearch, apiToggleFollow, type SearchUser } from './vibezApi';

const SB_H = 54;

export function Discover({ onOpenPost, onOpenProfile, refreshKey }: {
    onOpenPost:    (posts: VPost[], index: number) => void;
    onOpenProfile: (handle: string) => void;
    refreshKey:    number;
}) {
    const [query, setQuery] = useState('');
    const [trend, setTrend] = useState<string | null>(null);
    const [users, setUsers] = useState<SearchUser[]>([]);

    const { data } = useAsyncData<{ posts: VPost[]; trends: string[] }>(
        () => apiDiscover(),
        [refreshKey],
    );
    const posts  = data?.posts ?? [];
    const trends = data?.trends ?? [];

    const searching = query.trim() !== '';
    useEffect(() => {
        if (!searching) { setUsers([]); return; }
        let alive = true;
        const timer = window.setTimeout(() => {
            void apiSearch(query).then(r => { if (alive) setUsers(r); });
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
                <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5">
                    <Search className="h-4 w-4 text-white/60" strokeWidth={2.4} />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={t('vibez.searchCreators', 'Search creators')}
                        spellCheck={false}
                        className="w-full bg-transparent text-[14px] text-white placeholder:text-white/45 outline-none"
                    />
                    {searching && (
                        <button type="button" aria-label={t('vibez.clear', 'Clear')} onClick={() => setQuery('')} className="active:opacity-60">
                            <X className="h-4 w-4 text-white/60" strokeWidth={2.4} />
                        </button>
                    )}
                </div>
                {!searching && trends.length > 0 && (
                    <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                        {trends.map(tag => {
                            const on = trend === tag;
                            return (
                                <button
                                    key={tag}
                                    type="button"
                                    onClick={() => setTrend(on ? null : tag)}
                                    className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium active:opacity-70"
                                    style={on
                                        ? { background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})`, color: '#fff' }
                                        : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)' }}
                                >
                                    {tag}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-24">
                {searching ? (
                    users.length === 0 ? (
                        <p className="px-4 pt-10 text-center text-[14px] text-white/45">{t('vibez.noResults', 'No creators found.')}</p>
                    ) : users.map(u => (
                        <div key={u.handle} className="flex items-center gap-3 px-4 py-2.5 active:bg-white/5">
                            <button type="button" onClick={() => onOpenProfile(u.handle)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                                <img src={u.avatar} alt="" draggable={false} className="h-11 w-11 shrink-0 rounded-full object-cover" />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1 text-[14px] font-semibold">
                                        @{u.handle}
                                        {u.verified && (
                                            <BadgeCheck className="h-[14px] w-[14px]" style={{ color: GRAD_FROM, fill: GRAD_FROM }} stroke="#000" strokeWidth={1.6} />
                                        )}
                                    </div>
                                    {u.name && u.name !== '' && <div className="truncate text-[12px] text-white/50">{u.name}</div>}
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleFollow(u.handle)}
                                className="shrink-0 rounded-md px-4 py-1.5 text-[13px] font-semibold active:opacity-80"
                                style={u.following
                                    ? { background: 'rgba(255,255,255,0.12)', color: '#fff' }
                                    : { background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})`, color: '#fff' }}
                            >
                                {u.following ? t('vibez.followingBtn', 'Following') : t('vibez.follow', 'Follow')}
                            </button>
                        </div>
                    ))
                ) : (
                    <div className="grid grid-cols-3 gap-0.5 px-0.5">
                        {shown.map((p, i) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => onOpenPost(shown, i)}
                                className="relative aspect-[9/16] overflow-hidden bg-white/5 active:opacity-80"
                            >
                                <Thumb post={p} />
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/70 to-transparent" />
                                <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-white drop-shadow">
                                    <Play className="h-3 w-3" fill="#fff" strokeWidth={0} />
                                    <span className="text-[11px] font-semibold">{fmt(p.views)}</span>
                                </div>
                            </button>
                        ))}
                        {shown.length === 0 && (
                            <p className="col-span-3 px-4 pt-10 text-center text-[14px] text-white/45">{t('vibez.noVibes', 'No vibes yet')}</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export function Thumb({ post }: { post: VPost }) {
    const src = post.thumb || post.video;
    if (isVideoUrl(src)) {
        return <video src={src} muted playsInline preload="metadata" className="h-full w-full object-cover" />;
    }
    return <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />;
}
