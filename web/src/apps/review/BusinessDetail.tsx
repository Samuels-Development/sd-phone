import { useEffect, useState } from 'react';

import { device } from '@device';
import { t } from '@/i18n';
import { useContactActions } from '@/apps/_classifieds/useContactActions';
import { BusinessLogo } from './BusinessCard';
import type { Business, BusinessEdit, Review, ReviewDraft } from './data';
import { ManageBusiness } from './ManageBusiness';
import { reviewBusiness, reviewCreate, reviewDelete, reviewHelpful, reviewManage } from './reviewApi';
import { Stars } from '@/ui/Stars';
import { WriteReview } from './WriteReview';

export function BusinessDetail({ businessId, initial, onBack, onMutated }: {
    businessId: string;
    initial?:   Business;
    onBack:     () => void;
    onMutated?: () => void;
}) {
    const [business, setBusiness] = useState<Business | null>(initial ?? null);
    const [reviews,  setReviews]  = useState<Review[]>([]);
    const [loading,  setLoading]  = useState(true);
    const [writing,  setWriting]  = useState(false);
    const [managing, setManaging] = useState(false);
    const contact = useContactActions();

    function load() {
        void reviewBusiness(businessId).then(r => {
            if (r) { setBusiness(r.business); setReviews(r.reviews); }
            setLoading(false);
        });
    }
    useEffect(() => { load();   }, [businessId]);

    const myReview = reviews.find(r => r.mine);

    async function submit(draft: ReviewDraft) {
        setWriting(false);
        const rev = await reviewCreate(draft);
        if (rev) { load(); onMutated?.(); }
    }
    async function remove(id: string) {
        setReviews(prev => prev.filter(r => r.id !== id));
        await reviewDelete(id);
        load();
        onMutated?.();
    }
    async function toggleHelpful(id: string) {
        const res = await reviewHelpful(id);
        if (res) setReviews(prev => prev.map(r => r.id === id ? { ...r, helpful: res.helpful, helped: res.helped } : r));
    }
    async function saveManage(edit: BusinessEdit) {
        setManaging(false);
        const biz = await reviewManage(edit);
        if (biz) { setBusiness(biz); onMutated?.(); }
    }

    if (!business) {
        return (
            <div className="absolute inset-0 z-30 flex flex-col bg-elevated font-sf dark:bg-base">
                <div className="h-[58px] shrink-0" aria-hidden />
                <button type="button" onClick={onBack} className="px-4 text-[16px] text-ios-blue">‹ {t('review.title', 'Review')}</button>
                <p className="px-4 pt-10 text-center text-[14px] text-black/45 dark:text-white/45">{loading ? t('review.loading', 'Loading…') : t('review.businessNotFound', 'Business not found.')}</p>
            </div>
        );
    }

    const b = business;

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-elevated font-sf dark:bg-base animate-swipe-in-left">
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="flex h-10 shrink-0 items-center justify-between px-2">
                <button type="button" onClick={onBack} className="flex items-center text-[16px] text-ios-blue">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
                    {t('review.title', 'Review')}
                </button>
                {b.canManage && (
                    <button type="button" onClick={() => setManaging(true)} className="px-2 text-[16px] font-medium text-ios-blue">{t('review.manage', 'Manage')}</button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-8">
                <div className="flex flex-col items-center px-5 pb-4 pt-1 text-center">
                    <BusinessLogo b={b} size={72} radius={18} font={32} />
                    <h1 className="mt-3 text-[22px] font-bold leading-tight text-black dark:text-white">{b.name}</h1>
                    <p className="mt-0.5 text-[13px] text-black/50 dark:text-white/50">{b.category}</p>
                    <div className="mt-2 flex items-center gap-2">
                        <Stars value={b.rating} size={18} />
                        <span className="text-[14px] font-semibold text-black dark:text-white">{b.count > 0 ? b.rating.toFixed(1) : '—'}</span>
                        <span className="text-[13px] text-black/45 dark:text-white/45">({b.count})</span>
                    </div>
                    <p className="mt-3 max-w-[260px] text-[14px] text-black/65 dark:text-white/65">{b.blurb}</p>
                </div>

                <div className="mx-4 mb-4 rounded-xl bg-elevated px-4 py-1 dark:bg-surface">
                    <Row label={t('review.address', 'Address')} value={b.address} />
                    <Row label={t('review.hours', 'Hours')} value={b.hours} last={!b.phone} />
                    {b.phone && (
                        <div className="flex items-center justify-between border-t border-black/[0.06] py-2.5 dark:border-white/[0.08]">
                            <span className="text-[14px] text-black/55 dark:text-white/55">{t('review.contact', 'Contact')}</span>
                            <div className="flex gap-4">
                                {device.calls && <button type="button" onClick={() => contact.call(b.phone!)} className="text-[15px] font-medium text-ios-blue">{t('review.call', 'Call')}</button>}
                                <button type="button" onClick={() => contact.message(b.phone!)} className="text-[15px] font-medium text-ios-blue">{t('review.message', 'Message')}</button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-4 pb-4">
                    {myReview ? (
                        <p className="rounded-xl bg-black/[0.04] py-3 text-center text-[13px] leading-relaxed text-black/55 dark:bg-white/[0.06] dark:text-white/55">
                            {t('review.alreadyReviewed', "You've reviewed this business.")}<br />
                            {t('review.deleteToPost', 'Delete your review to post a new one.')}
                        </p>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setWriting(true)}
                            className="w-full rounded-xl bg-ios-blue py-3 text-[15px] font-semibold text-white active:opacity-80"
                        >
                            {t('review.writeReview', 'Write a Review')}
                        </button>
                    )}
                </div>

                <h2 className="px-4 pb-1 pt-2 text-[13px] font-semibold uppercase tracking-wide text-black/40 dark:text-white/40">
                    {b.count > 0 ? `${b.count} ${b.count === 1 ? t('review.reviewWordCap', 'Review') : t('review.reviewsWordCap', 'Reviews')}` : t('review.reviewsHeader', 'Reviews')}
                </h2>
                {reviews.length === 0 ? (
                    <p className="px-4 pt-6 text-center text-[14px] text-black/45 dark:text-white/45">
                        {t('review.noReviewsBeFirst', 'No reviews yet. Be the first!')}
                    </p>
                ) : (
                    <div className="mx-4 overflow-hidden rounded-xl bg-surface">
                        {reviews.map((r, i) => (
                            <div key={r.id} className={`px-4 py-3 ${i > 0 ? 'border-t border-black/[0.06] dark:border-white/[0.08]' : ''}`}>
                                <div className="flex items-center justify-between">
                                    <span className="text-[14px] font-semibold text-black dark:text-white">{r.author}{r.mine ? t('review.you', ' (You)') : ''}</span>
                                    <span className="text-[12px] text-black/40 dark:text-white/40">{r.date}</span>
                                </div>
                                <div className="mt-1"><Stars value={r.rating} size={13} /></div>
                                <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-snug text-black/80 dark:text-white/80">{r.body}</p>
                                {r.image && <img src={r.image} alt="" className="mt-2 h-32 w-32 rounded-lg object-cover" />}
                                <div className="mt-2 flex items-center gap-4">
                                    {r.mine ? (
                                        <button type="button" onClick={() => remove(r.id)} className="text-[13px] font-medium text-ios-red">{t('review.delete', 'Delete')}</button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => toggleHelpful(r.id)}
                                            className={`flex items-center gap-1.5 text-[13px] font-medium ${r.helped ? 'text-ios-blue' : 'text-black/50 dark:text-white/50'}`}
                                        >
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill={r.helped ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11M2 14v6a1 1 0 001 1h3V10H3a1 1 0 00-1 1zM7 10l4-7a2 2 0 012 2v3h5.5a2 2 0 011.98 2.3l-1.3 8A2 2 0 0117.2 21H7" /></svg>
                                            {t('review.helpful', 'Helpful')}{r.helpful > 0 ? ` · ${r.helpful}` : ''}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {writing && (
                <WriteReview
                    business={b}
                    onCancel={() => setWriting(false)}
                    onSubmit={submit}
                />
            )}

            {managing && (
                <ManageBusiness
                    business={b}
                    onCancel={() => setManaging(false)}
                    onSave={saveManage}
                />
            )}

            {contact.dialog}
        </div>
    );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
    return (
        <div className={`flex items-center justify-between py-2.5 ${last ? '' : 'border-b border-black/[0.06] dark:border-white/[0.08]'}`}>
            <span className="text-[14px] text-black/55 dark:text-white/55">{label}</span>
            <span className="max-w-[60%] truncate text-[14px] text-black dark:text-white">{value}</span>
        </div>
    );
}
