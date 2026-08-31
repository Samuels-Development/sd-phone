import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Newspaper, Settings2 } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { useDidEnter } from '@/hooks/useDidEnter';
import { NavContext } from '@/hooks/useIosPush';
import { useSessionState } from '@/hooks/useSessionState';
import { useTheme } from '@/stores/themeStore';
import { Article } from './Article';
import { ManageDashboard } from './ManageDashboard';
import {
    CATEGORIES, categoryLabel, type Article as ArticleT, type Category, formatViews, WEAZEL_RED,
} from './data';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { weazelFeed, weazelView, weazelWatch } from './weazelnewsApi';

const SB_H = 54;
type Filter = 'All' | Category;

export function WeazelNews({ onClose: _onClose }: { onClose: () => void }) {
    const { theme } = useTheme('theme');
    const dark = theme === 'dark';

    const [filter, setFilter] = useSessionState<Filter>('weazelnews:filter', 'All');
    const [openId, setOpenId] = useSessionState<string | null>('weazelnews:openArticleId', null);
    const [managing, setManaging] = useState(false);

    const [articles, setArticles]   = useState<ArticleT[]>([]);
    const [ticker, setTicker]       = useState<string[]>([]);
    const [canManage, setCanManage] = useState(false);
    const [loading, setLoading]     = useState(true);

    const refresh = useCallback(async () => {
        const feed = await weazelFeed();
        setArticles(feed.articles);
        setTicker(feed.ticker);
        setCanManage(feed.canManage);
        setLoading(false);
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    useEffect(() => {
        if (!canManage) setManaging(false);
    }, [canManage]);

    useEffect(() => {
        void weazelWatch(true);
        return () => { void weazelWatch(false); };
    }, []);

    useNuiEvent('sd-phone:weazelnews:feed', useCallback(() => { void refresh(); }, [refresh]));

    const featured = useMemo(
        () => articles.find(a => a.featured) ?? articles[0] ?? null,
        [articles],
    );

    const list = useMemo<ArticleT[]>(() => {
        return articles.filter(a => {
            if (featured && a.id === featured.id) return false;
            return filter === 'All' || a.category === filter;
        });
    }, [articles, filter, featured]);

    const showFeatured = !!featured;

    const open = openId ? articles.find(a => a.id === openId) ?? null : null;

    const openArticle = useCallback((id: string) => {
        setOpenId(id);
        void weazelView(id).then(views => {
            if (views == null) return;
            setArticles(prev => prev.map(a => (a.id === id ? { ...a, views } : a)));
        });
    }, [setOpenId]);

    const animateNav = useDidEnter();

    const hasAnything = showFeatured || list.length > 0;

    return (
        <div className={`absolute inset-0 z-10 flex flex-col select-none ${dark ? 'bg-black text-white' : 'bg-[#d4d4d4] text-black'}`}>
            <style>{`
                @keyframes weazel-ticker {
                    0%   { transform: translateX(0); }
                    100% { transform: translateX(-50%); }
                }
            `}</style>

            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="shrink-0 px-4 pb-2 pt-1" style={{ background: dark ? '#000000' : 'rgb(var(--base))' }}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2" aria-label={t('weazelnews.weazelNews', 'Weazel News')}>
                        <span
                            className="text-[27px] font-extrabold italic leading-none tracking-tighter"
                            style={{ color: WEAZEL_RED }}
                        >
                            WEAZEL
                        </span>
                        <span
                            className="rounded-[5px] px-2 py-[3px] text-[18px] font-extrabold leading-none tracking-tight text-white"
                            style={{ background: WEAZEL_RED }}
                        >
                            NEWS
                        </span>
                    </div>
                    {canManage && (
                        <button
                            type="button"
                            onClick={() => setManaging(true)}
                            aria-label={t('weazelnews.manageNewsroom', 'Manage newsroom')}
                            className={`-mr-1 flex h-8 w-8 items-center justify-center rounded-full active:opacity-60 ${dark ? 'text-white/80' : 'text-black/70'}`}
                        >
                            <Settings2 className="h-[21px] w-[21px]" strokeWidth={2.2} />
                        </button>
                    )}
                </div>
            </div>

            {ticker.length > 0 && (
                <div className="flex shrink-0 items-stretch overflow-hidden" style={{ background: WEAZEL_RED }}>
                    <span className="z-10 flex shrink-0 items-center gap-2 bg-black pl-3 pr-3.5 text-[13px] font-extrabold uppercase tracking-[0.14em] text-white">
                        <span className="relative flex h-[7px] w-[7px]">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-80" />
                            <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-white" />
                        </span>
                        {t('weazelnews.breaking', 'Breaking')}
                    </span>
                    <div className="relative flex flex-1 items-center overflow-hidden">
                        <div
                            className="flex shrink-0 whitespace-nowrap py-2.5 text-[15px] font-semibold text-white"
                            style={{ animation: 'weazel-ticker 32s linear infinite', textShadow: '0 1px 1.5px rgba(0,0,0,0.22)' }}
                        >
                            <TickerRun ticker={ticker} />
                            <TickerRun ticker={ticker} />
                        </div>
                        <div
                            className="pointer-events-none absolute inset-y-0 right-0 w-9"
                            style={{ background: `linear-gradient(to right, transparent, ${WEAZEL_RED})` }}
                        />
                    </div>
                </div>
            )}

            <div className="shrink-0 px-4 pb-1 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                    {CATEGORIES.map(cat => {
                        const active = filter === cat;
                        return (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setFilter(cat)}
                                className={`rounded-full px-4 py-2 text-[14px] font-semibold transition-colors active:scale-[0.97] ${
                                    active
                                        ? 'text-white'
                                        : dark
                                            ? 'bg-white/[0.14] text-white'
                                            : 'bg-black/[0.05] text-black'
                                }`}
                                style={active ? { background: WEAZEL_RED } : undefined}
                            >
                                {categoryLabel(cat)}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6 pt-1">
                {showFeatured && featured && (
                    <FeaturedCard article={featured} onOpen={() => openArticle(featured.id)} />
                )}

                {list.length > 0 && (
                    <div className="mt-2 mb-2.5 flex items-center gap-2">
                        <span className="h-[14px] w-[4px] rounded-full" style={{ background: WEAZEL_RED }} />
                        <span className="text-[15px] font-extrabold uppercase tracking-wide">
                            {filter === 'All' ? t('weazelnews.latest', 'Latest') : filter}
                        </span>
                    </div>
                )}

                <div className="flex flex-col gap-3">
                    {list.map(a => (
                        <ArticleRow key={a.id} article={a} dark={dark} onOpen={() => openArticle(a.id)} />
                    ))}
                </div>

                {!loading && !hasAnything && (
                    articles.length === 0 ? (
                        <EmptyState
                            icon={Newspaper}
                            title={t('weazelnews.noStoriesYet', 'No Stories Yet')}
                            subtitle={canManage
                                ? t('weazelnews.tapGearToPublish', 'Tap the gear to publish the first story.')
                                : t('weazelnews.checkBackSoon', 'Check back soon for the latest from Weazel News.')}
                        />
                    ) : (
                        <EmptyState
                            icon={Newspaper}
                            title={t('weazelnews.nothingHere', 'Nothing Here')}
                            subtitle={t('weazelnews.noStoriesInCategory', 'No stories in {filter} right now.', { filter })}
                        />
                    )
                )}
            </div>

            {open && (
                <NavContext.Provider value={{ onWillBack: () => {} }}>
                    <Article article={open} onBack={() => setOpenId(null)} animateIn={animateNav} />
                </NavContext.Provider>
            )}

            {managing && (
                <ManageDashboard
                    articles={articles}
                    ticker={ticker}
                    dark={dark}
                    onRefresh={refresh}
                    onClose={() => setManaging(false)}
                />
            )}
        </div>
    );
}

function TickerRun({ ticker }: { ticker: string[] }) {
    return (
        <div className="flex shrink-0 items-center" aria-hidden>
            {ticker.map((t, i) => (
                <span key={i} className="flex items-center">
                    <span className="px-5">{t}</span>
                    <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-white/70" />
                </span>
            ))}
        </div>
    );
}

function Banner({ image, className }: { image?: string; className?: string }) {
    if (image) return <img src={image} alt="" className={className} />;
    return (
        <div
            className={`flex items-center justify-center ${className ?? ''}`}
            style={{ background: `linear-gradient(135deg, ${WEAZEL_RED}, #7a0a1c)` }}
        >
            <span className="text-[13px] font-extrabold italic tracking-tighter text-white/90">WEAZEL</span>
        </div>
    );
}

function FeaturedCard({ article, onOpen }: { article: ArticleT; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="relative block h-60 w-full overflow-hidden rounded-2xl text-left shadow-sm active:opacity-95"
        >
            <Banner image={article.image} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            <span
                className="absolute left-3 top-3 rounded-[5px] px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-wide text-white"
                style={{ background: WEAZEL_RED }}
            >
                {article.category}
            </span>
            <div className="absolute inset-x-0 bottom-0 p-4">
                <h2 className="text-[21px] font-extrabold leading-[1.15] tracking-tight text-white">
                    {article.headline}
                </h2>
                <div className="mt-2 flex items-center gap-2 text-[13.5px] font-semibold text-white/90">
                    <span>{article.author}</span>
                    <span className="opacity-50">&bull;</span>
                    <span className="flex items-center gap-1">
                        <Eye className="h-[15px] w-[15px]" strokeWidth={2.3} />
                        {formatViews(article.views)}
                    </span>
                    <span className="opacity-50">&bull;</span>
                    <span>{article.time}</span>
                </div>
            </div>
        </button>
    );
}

function ArticleRow({ article, dark, onOpen }: { article: ArticleT; dark: boolean; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className={`flex w-full gap-3.5 rounded-2xl p-3 text-left transition-colors active:opacity-90 ${
                dark ? 'bg-surface' : 'bg-surface'
            } shadow-sm`}
        >
            <div className="relative h-[112px] w-[112px] shrink-0 overflow-hidden rounded-xl">
                <Banner image={article.image} className="h-full w-full object-cover" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col py-0.5">
                <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: WEAZEL_RED }}>
                    {article.category}
                </span>
                <h3 className="mt-1 line-clamp-2 text-[16.5px] font-bold leading-[1.2] tracking-tight">
                    {article.headline}
                </h3>
                <p className="mt-1.5 line-clamp-2 text-[14.5px] font-medium leading-[1.42] text-black/85 dark:text-white/75">
                    {article.dek}
                </p>
                <div className="mt-auto flex items-center gap-2 pt-1.5 text-[13.5px] font-semibold text-black/70 dark:text-white/70">
                    <span className="min-w-0 truncate">{article.author}</span>
                    <span className="shrink-0 opacity-40">&bull;</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                        <Eye className="h-[16px] w-[16px]" strokeWidth={2.4} />
                        {formatViews(article.views)}
                    </span>
                    <span className="shrink-0 opacity-40">&bull;</span>
                    <span className="shrink-0">{article.time}</span>
                </div>
            </div>
        </button>
    );
}
