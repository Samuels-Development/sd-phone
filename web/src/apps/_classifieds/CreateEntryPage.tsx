import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ImagePlus, X } from 'lucide-react';

import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { Scroller } from '@/ui/Scroller';
import { useSessionState, clearSessionState } from '@/hooks/useSessionState';
import { ContactFields } from './ContactFields';
import type { ClassifiedDraft, ClassifiedItem } from './types';
import { t } from '@/i18n';

export function CreateEntryPage({ pageTitle = t('classifieds.newPost', 'New Post'), backLabel, bodyPlaceholder = t('classifieds.yourPost', 'Your post'), submitLabel = t('classifieds.post', 'Post'), showPrice = true, initial, draftKey, animateIn = true, onCancel, onCreate }: {
    pageTitle?: string;
    backLabel: string;
    bodyPlaceholder?: string;
    submitLabel?: string;
    showPrice?: boolean;
    initial?: ClassifiedItem;
    draftKey: string;
    animateIn?: boolean;
    onCancel: () => void;
    onCreate: (draft: ClassifiedDraft) => void;
}) {
    const seedImages = initial?.images?.length ? initial.images : initial?.image ? [initial.image] : [];
    const [title,  setTitle]  = useSessionState(`${draftKey}:title`,  () => initial?.title ?? '');
    const [body,   setBody]   = useSessionState(`${draftKey}:body`,   () => initial?.body ?? '');
    const [price,  setPrice]  = useSessionState(`${draftKey}:price`,  () => (initial?.price != null ? String(initial.price) : ''));
    const [images, setImages] = useSessionState<string[]>(`${draftKey}:images`, () => seedImages);
    const [number, setNumber] = useSessionState(`${draftKey}:number`, () => initial?.number ?? '');
    const [email,  setEmail]  = useSessionState(`${draftKey}:email`,  () => initial?.email ?? '');
    const [picking, setPicking] = useState(false);
    const [exiting, setExiting] = useState(false);

    function clearDraft() { clearSessionState(`${draftKey}:`); }

    const MAX_IMAGES = 3;

    const hasContact = number.trim().length > 0 || email.trim().length > 0;
    const canPost = title.trim().length > 0 && body.trim().length > 0 && hasContact;

    function dismiss(after: () => void) {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(after, 300);
    }
    function submit() {
        if (!canPost || exiting) return;
        const draft: ClassifiedDraft = {
            title:  title.trim(),
            body:   body.trim(),
            price:  showPrice && price ? parseInt(price, 10) : undefined,
            image:  images[0],
            images: images.length ? images : undefined,
            number: number.trim(),
            email:  email.trim() || undefined,
        };
        clearDraft();
        dismiss(() => onCreate(draft));
    }
    function cancel() {
        clearDraft();
        dismiss(onCancel);
    }

    return (
        <>
            <div
                className="absolute inset-0 z-40 flex flex-col bg-base font-sf text-black dark:text-white"
                style={{
                    animation: exiting
                        ? 'ios-pop 0.3s cubic-bezier(0.32,0.72,0,1) forwards'
                        : animateIn ? 'ios-push 0.3s cubic-bezier(0.32,0.72,0,1)' : undefined,
                    willChange: 'transform',
                }}
            >
                <div className="h-[58px] shrink-0" aria-hidden />

                <div className="flex h-11 shrink-0 items-center justify-between px-2">
                    <button type="button" onClick={cancel} className="flex items-center gap-0.5 text-[17px] text-ios-blue active:opacity-60">
                        <ChevronLeft className="h-[24px] w-[24px]" strokeWidth={2.4} />{backLabel}
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={!canPost}
                        className={`pr-3 text-[17px] font-semibold ${canPost ? 'text-ios-blue active:opacity-60' : 'text-ios-blue/40'}`}
                    >
                        {submitLabel}
                    </button>
                </div>

                <h1 className="px-5 pb-3 pt-1 text-[34px] font-bold tracking-ios-display">{pageTitle}</h1>

                <Scroller className="min-h-0 flex-1 px-5 pb-10 pt-2">
                    <Label required>{t('classifieds.title', 'Title')}</Label>
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder={t('classifieds.title', 'Title')}
                        className="mb-6 w-full rounded-[14px] bg-surface px-4 py-4 text-[18px] text-black placeholder-black/80 outline-none dark:text-white dark:placeholder-white/65"
                    />

                    <Label required>{t('classifieds.description', 'Description')}</Label>
                    <textarea
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        placeholder={bodyPlaceholder}
                        rows={4}
                        className="ios-scrollbar mb-6 w-full resize-none rounded-[14px] bg-surface px-4 py-3.5 text-[18px] leading-snug text-black placeholder-black/80 outline-none dark:text-white dark:placeholder-white/65"
                    />

                    <Label>{t('classifieds.photos', 'Photos')}</Label>
                    <div className="mb-6 flex flex-wrap gap-3.5">
                        {images.map((url, i) => (
                            <div key={url + i} className="relative h-[114px] w-[114px]">
                                <img src={url} alt="" draggable={false} className="h-full w-full rounded-[16px] object-cover shadow-sm" />
                                <button
                                    type="button"
                                    onClick={() => setImages(imgs => imgs.filter((_, j) => j !== i))}
                                    aria-label={t('classifieds.removePhoto', 'Remove photo')}
                                    className="absolute -right-2 -top-2 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-black/70 text-white shadow active:opacity-70"
                                >
                                    <X className="h-4 w-4" strokeWidth={2.6} />
                                </button>
                            </div>
                        ))}
                        {images.length < MAX_IMAGES && (
                            <button
                                type="button"
                                onClick={() => setPicking(true)}
                                aria-label={t('classifieds.addPhotos', 'Add photos')}
                                className="flex h-[114px] w-[114px] flex-col items-center justify-center gap-1.5 rounded-[16px] bg-surface text-ios-blue shadow-sm active:opacity-70"
                            >
                                <ImagePlus className="h-[30px] w-[30px]" strokeWidth={1.9} />
                                <span className="text-[13px] font-semibold text-black/45 dark:text-white/45">{images.length}/{MAX_IMAGES}</span>
                            </button>
                        )}
                    </div>

                    {showPrice && (
                        <>
                            <Label>{t('classifieds.price', 'Price')}</Label>
                            <div className="mb-6 flex items-center gap-1.5 rounded-[14px] bg-surface px-4 py-4">
                                <span className="text-[18px] font-medium text-black/45 dark:text-white/45">$</span>
                                <input
                                    value={price}
                                    onChange={e => setPrice(e.target.value.replace(/[^\d]/g, ''))}
                                    inputMode="numeric"
                                    placeholder="0"
                                    className="w-full bg-transparent text-[18px] text-black placeholder-black/80 outline-none dark:text-white dark:placeholder-white/65"
                                />
                            </div>
                        </>
                    )}

                    <ContactFields number={number} email={email} onNumber={setNumber} onEmail={setEmail} />
                    <p className="mt-3 px-1 text-[16px] leading-snug text-ios-gray">
                        <span className="text-ios-red">* </span>
                        {t('classifieds.contactHint', 'Add a phone number or email so people can reach you.')}
                    </p>
                </Scroller>
            </div>

            {picking && (
                <MediaPickerSheet
                    multiple
                    max={MAX_IMAGES}
                    initialSelectedUrls={images}
                    onSelectMany={photos => { setImages(photos.slice(0, MAX_IMAGES).map(p => p.url)); setPicking(false); }}
                    onClose={() => setPicking(false)}
                />
            )}
        </>
    );
}

function Label({ children, required }: { children: ReactNode; required?: boolean }) {
    return (
        <div className="mb-2.5 text-[20px] font-bold tracking-tight text-black dark:text-white">
            {children}
            {required && <span className="text-ios-red"> *</span>}
        </div>
    );
}
