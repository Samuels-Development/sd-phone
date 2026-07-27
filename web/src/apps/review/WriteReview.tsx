import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { apiListPhotos, type Photo } from '@/core/photosApi';
import type { Business, ReviewDraft } from './data';
import { Stars } from '@/ui/Stars';
import { SheetHeader } from '@/ui/SheetHeader';

export function WriteReview({ business, onCancel, onSubmit }: {
    business: Business;
    onCancel: () => void;
    onSubmit: (draft: ReviewDraft) => void;
}) {
    const [rating, setRating] = useState(0);
    const [body,   setBody]   = useState('');
    const [image,  setImage]  = useState<string | undefined>(undefined);
    const [picking, setPicking] = useState(false);
    const [photos,  setPhotos]  = useState<Photo[]>([]);

    useEffect(() => {
        // First page only: this is an attachment picker, not the gallery.
        if (picking && photos.length === 0) void apiListPhotos().then(page => setPhotos(page.photos));
    }, [picking, photos.length]);

    const canSubmit = rating > 0 && body.trim().length > 0;

    function submit() {
        if (!canSubmit) return;
        onSubmit({ businessId: business.id, rating, body: body.trim(), image });
    }

    return (
        <div className="absolute inset-0 z-40 flex flex-col bg-[#f2f2f7] font-sf dark:bg-surface animate-sheet-up">
            <div className="h-[54px] shrink-0" aria-hidden />

            <SheetHeader cancelLabel={t('review.cancel', 'Cancel')} onCancel={onCancel} title={t('review.writeReview', 'Write a Review')} doneLabel={t('review.post', 'Post')} onDone={submit} doneDisabled={!canSubmit} />

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
                <p className="pb-4 pt-1 text-center text-[14px] text-black/55 dark:text-white/55">
                    How was <span className="font-semibold text-black dark:text-white">{business.name}</span>?
                </p>

                <div className="flex justify-center pb-5">
                    <Stars value={rating} onChange={setRating} size={36} />
                </div>

                <textarea
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    rows={5}
                    maxLength={600}
                    placeholder={t('review.bodyPlaceholder', 'Share the details of your experience…')}
                    className="w-full resize-none rounded-xl bg-white p-3 text-[15px] text-black outline-none placeholder:text-black/35 dark:bg-elevated dark:text-white dark:placeholder:text-white/35"
                />

                <div className="mt-4">
                    {image ? (
                        <div className="relative inline-block">
                            <img src={image} alt="" className="h-24 w-24 rounded-xl object-cover" />
                            <button
                                type="button"
                                onClick={() => setImage(undefined)}
                                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                                aria-label={t('review.removePhoto', 'Remove photo')}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setPicking(true)}
                            className="flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-[15px] text-ios-blue dark:bg-elevated"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                            {t('review.addPhoto', 'Add a photo')}
                        </button>
                    )}
                </div>
            </div>

            {picking && (
                <div className="absolute inset-0 z-50 flex flex-col bg-[#f2f2f7] dark:bg-base">
                    <div className="h-[54px] shrink-0" aria-hidden />
                    <div className="flex h-11 shrink-0 items-center justify-between px-4">
                        <button type="button" onClick={() => setPicking(false)} className="text-[16px] text-ios-blue">{t('review.cancel', 'Cancel')}</button>
                        <span className="text-[15px] font-semibold text-black dark:text-white">{t('review.choosePhoto', 'Choose a Photo')}</span>
                        <span className="w-12" />
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar pb-2">
                        {photos.length === 0 ? (
                            <p className="px-4 pt-10 text-center text-[14px] text-black/45 dark:text-white/45">{t('review.noPhotos', 'No photos in your gallery.')}</p>
                        ) : (
                            <div className="grid grid-cols-3 gap-[2px]">
                                {photos.filter(p => !p.video).map(p => (
                                    <button
                                        key={p.id}
                                        type="button"
                                        onClick={() => { setImage(p.url); setPicking(false); }}
                                        className="aspect-square overflow-hidden active:opacity-70"
                                    >
                                        <img src={p.url} alt="" className="h-full w-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
