import { useState } from 'react';
import { ChevronLeft, Newspaper, Pencil, Plus, Radio, Trash2 } from 'lucide-react';

import { t } from '@/i18n';
import { NavContext, useIosPush } from '@/hooks/useIosPush';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { EditArticle } from './EditArticle';
import { EditBreaking } from './EditBreaking';
import { type Article as ArticleT, type ArticleDraft, WEAZEL_RED } from './data';
import { weazelDelete, weazelSave, weazelSetBreaking } from './weazelnewsApi';

const SB_H = 54;

export function ManageDashboard({ articles, ticker, dark, animateIn = true, onRefresh, onClose }: {
    articles:  ArticleT[];
    ticker:    string[];
    dark:      boolean;
    animateIn?: boolean;
    onRefresh: () => void | Promise<void>;
    onClose:   () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onClose, animateIn);

    const [editing, setEditing]   = useState<ArticleT | 'new' | null>(null);
    const [breaking, setBreaking] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<ArticleT | null>(null);

    async function saveArticle(draft: ArticleDraft): Promise<boolean> {
        const saved = await weazelSave(draft);
        if (saved) await onRefresh();
        return !!saved;
    }

    async function saveBreaking(lines: string[]): Promise<boolean> {
        const ok = await weazelSetBreaking(lines);
        if (ok) await onRefresh();
        return !!ok;
    }

    async function confirmDelete() {
        const target = pendingDelete;
        setPendingDelete(null);
        if (!target) return;
        const ok = await weazelDelete(target.id);
        if (ok) await onRefresh();
    }

    const surface = dark ? 'bg-surface' : 'bg-surface';
    const subtle  = dark ? 'text-white/45' : 'text-black/45';

    return (
        <div
            className={`absolute inset-0 z-30 flex flex-col select-none ${dark ? 'bg-black text-white' : 'bg-[#d4d4d4] text-black'}`}
            style={pageStyle}
        >
            <div className="shrink-0" style={{ height: SB_H }} />

            <div className={`relative flex h-11 shrink-0 items-center px-2 ${dark ? 'border-b border-white/10' : 'border-b border-black/[0.08]'}`}>
                <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center gap-0.5 text-[17px] active:opacity-60"
                    style={{ color: WEAZEL_RED }}
                >
                    <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.5} />
                    <span className="font-medium">{t('weazelnews.news', 'News')}</span>
                </button>
                <span className="absolute left-1/2 -translate-x-1/2 text-[16px] font-semibold">{t('weazelnews.newsroom', 'Newsroom')}</span>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-8 pt-4">
                <SectionLabel>{t('weazelnews.breakingTicker', 'Breaking ticker')}</SectionLabel>
                <button
                    type="button"
                    onClick={() => setBreaking(true)}
                    className={`flex w-full items-center gap-4 rounded-2xl p-5 text-left active:opacity-90 ${surface} shadow-sm`}
                >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white" style={{ background: WEAZEL_RED }}>
                        <Radio className="h-[26px] w-[26px]" strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[18.5px] font-bold">{t('weazelnews.editHeadlines', 'Edit headlines')}</span>
                        <span className="mt-1 block truncate text-[15px] font-medium text-ios-gray">
                            {ticker.length > 0 ? t('weazelnews.tickerSummary', '{count} headline{plural} · {first}', { count: ticker.length, plural: ticker.length === 1 ? '' : 's', first: ticker[0] }) : t('weazelnews.noHeadlinesYet', 'No headlines yet, tap to add')}
                        </span>
                    </span>
                    <Pencil className={`h-[21px] w-[21px] shrink-0 ${subtle}`} strokeWidth={2.2} />
                </button>

                <div className="mt-6 flex items-center justify-between">
                    <SectionLabel className="mb-0">{t('weazelnews.stories', 'Stories')}</SectionLabel>
                    <button
                        type="button"
                        onClick={() => setEditing('new')}
                        className="flex items-center gap-1 text-[14px] font-semibold active:opacity-60"
                        style={{ color: WEAZEL_RED }}
                    >
                        <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} /> {t('weazelnews.newPost', 'New post')}
                    </button>
                </div>

                <div className="mt-2 flex flex-col gap-2.5">
                    {articles.length === 0 && (
                        <EmptyState
                            icon={Newspaper}
                            title={t('weazelnews.noStoriesYet', 'No Stories Yet')}
                            subtitle={t('weazelnews.tapNewPost', 'Tap New post to publish the first story.')}
                        />
                    )}
                    {articles.map(a => (
                        <div key={a.id} className={`flex items-center gap-3.5 rounded-2xl p-3 ${surface} shadow-sm`}>
                            <button
                                type="button"
                                onClick={() => setEditing(a)}
                                className="flex min-w-0 flex-1 items-center gap-3.5 text-left active:opacity-80"
                            >
                                <div className="relative h-[112px] w-[112px] shrink-0 overflow-hidden rounded-xl">
                                    {a.image ? (
                                        <img src={a.image} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${WEAZEL_RED}, #7a0a1c)` }}>
                                            <span className="text-[13px] font-extrabold italic tracking-tighter text-white/90">WEAZEL</span>
                                        </div>
                                    )}
                                </div>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5">
                                        <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: WEAZEL_RED }}>{a.category}</span>
                                        {a.featured && (
                                            <span className={`rounded-[4px] px-1.5 py-[2px] text-[10px] font-bold uppercase tracking-wide ${dark ? 'bg-white/10 text-white/75' : 'bg-black/[0.07] text-black/60'}`}>
                                                {t('weazelnews.featured', 'Featured')}
                                            </span>
                                        )}
                                    </span>
                                    <span className="mt-1 line-clamp-2 text-[16.5px] font-bold leading-[1.2] tracking-tight">{a.headline}</span>
                                    <span className="mt-1.5 block text-[13.5px] font-medium text-ios-gray">{a.author} · {a.time}</span>
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setPendingDelete(a)}
                                aria-label={t('weazelnews.deleteStory', 'Delete story')}
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-red/10 text-ios-red transition-colors active:bg-ios-red/25"
                            >
                                <Trash2 className="h-[20px] w-[20px]" strokeWidth={2.1} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {editing && (
                <NavContext.Provider value={{ onWillBack: () => {} }}>
                    <EditArticle
                        initial={editing === 'new' ? null : editing}
                        dark={dark}
                        onClose={() => setEditing(null)}
                        onSave={saveArticle}
                    />
                </NavContext.Provider>
            )}

            {breaking && (
                <NavContext.Provider value={{ onWillBack: () => {} }}>
                    <EditBreaking
                        initial={ticker}
                        dark={dark}
                        onClose={() => setBreaking(false)}
                        onSave={saveBreaking}
                    />
                </NavContext.Provider>
            )}

            {pendingDelete && (
                <AlertDialog
                    title={t('weazelnews.deleteStoryTitle', 'Delete story?')}
                    message={t('weazelnews.deleteStoryMessage', '“{headline}” will be removed for everyone.', { headline: pendingDelete.headline })}
                    confirmLabel={t('weazelnews.delete', 'Delete')}
                    destructive
                    forceDark={dark}
                    onCancel={() => setPendingDelete(null)}
                    onConfirm={confirmDelete}
                />
            )}
        </div>
    );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={`mb-2.5 flex items-center gap-2 ${className}`}>
            <span className="h-[14px] w-[4px] rounded-full" style={{ background: WEAZEL_RED }} />
            <span className="text-[15px] font-extrabold uppercase tracking-wide">{children}</span>
        </div>
    );
}
