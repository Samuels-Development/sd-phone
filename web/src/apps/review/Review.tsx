import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { BusinessCard } from './BusinessCard';
import { BusinessDetail } from './BusinessDetail';
import type { Business } from './data';
import { reviewList } from './reviewApi';

export function Review({ onClose: _onClose }: { onClose: () => void }) {
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [cat,    setCat]    = useSessionState<string>('review:cat', 'All');
    const [query,  setQuery]  = useSessionState<string>('review:query', '');
    const [openId, setOpenId] = useSessionState<string | null>('review:open', null);

    function load() {
        void reviewList().then(r => { setBusinesses(r.businesses); setCategories(r.categories); });
    }
    useEffect(() => { load(); }, []);

    const open = businesses.find(b => b.id === openId) ?? null;

    const q = query.trim().toLowerCase();
    const filtered = businesses
        .filter(b => cat === 'All' || b.category === cat)
        .filter(b => !q || b.name.toLowerCase().includes(q) || b.category.toLowerCase().includes(q) || b.address.toLowerCase().includes(q))
        .sort((a, b) => b.rating - a.rating || b.count - a.count || a.name.localeCompare(b.name));

    const chips = ['All', ...categories];

    return (
        <div className="absolute inset-0 flex flex-col bg-elevated font-sf dark:bg-base">
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="shrink-0 px-4 pb-2">
                <h1 className="text-[30px] font-bold tracking-tight text-black dark:text-white">{t('review.title', 'Review')}</h1>
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-black/[0.06] px-3 py-2 dark:bg-white/[0.10]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-black/40 dark:text-white/40" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder={t('review.searchPlaceholder', 'Search businesses')}
                        className="w-full bg-transparent text-[15px] text-black outline-none placeholder:text-black/40 dark:text-white dark:placeholder:text-white/40"
                    />
                    {query && (
                        <button type="button" onClick={() => setQuery('')} className="text-black/35 dark:text-white/35" aria-label={t('review.clear', 'Clear')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm3.5 12.1l-1.4 1.4L12 13.4l-2.1 2.1-1.4-1.4L10.6 12 8.5 9.9l1.4-1.4L12 10.6l2.1-2.1 1.4 1.4L13.4 12z" /></svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="shrink-0 overflow-x-auto no-scrollbar pb-2">
                <div className="flex gap-2 px-4">
                    {chips.map(c => (
                        <button
                            key={c}
                            type="button"
                            onClick={() => setCat(c)}
                            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                                cat === c
                                    ? 'bg-ios-blue text-white'
                                    : 'bg-black/[0.06] text-black/70 dark:bg-white/[0.10] dark:text-white/70'
                            }`}
                        >
                            {c === 'All' ? t('review.all', 'All') : c}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar">
                {filtered.length === 0 ? (
                    <p className="px-4 pt-10 text-center text-[14px] text-black/45 dark:text-white/45">{t('review.noBusinesses', 'No businesses found.')}</p>
                ) : (
                    <div className="mx-3 mt-1 divide-y divide-black/[0.06] overflow-hidden rounded-xl bg-elevated dark:divide-white/[0.08] dark:bg-surface">
                        {filtered.map(b => (
                            <BusinessCard key={b.id} b={b} onOpen={() => setOpenId(b.id)} />
                        ))}
                    </div>
                )}
            </div>

            {openId && (
                <BusinessDetail
                    businessId={openId}
                    initial={open ?? undefined}
                    onBack={() => setOpenId(null)}
                    onMutated={load}
                />
            )}
        </div>
    );
}
