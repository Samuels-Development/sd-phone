import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Smile, X } from 'lucide-react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { EmojiPanel } from '@/shared/chat/EmojiPanel';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { BG, BLUE, MAX_POST_LENGTH } from '../data';
import { Avatar } from '../ui';

const MAX_IMAGES = 3;

export function Composer({ onClose, onPost }: {
    onClose: () => void;
    onPost:  (body: string, images: string[]) => void;
}) {
    const [text, setText] = useSessionState('birdy:composerDraft', '');
    const [images, setImages] = useState<string[]>([]);
    const [picking, setPicking] = useState(false);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [exiting, setExiting] = useState(false);
    const canPost = text.trim().length > 0 || images.length > 0;
    const taRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        const t = window.setTimeout(() => taRef.current?.focus({ preventScroll: true }), 360);
        return () => window.clearTimeout(t);
    }, []);

    function submit() {
        if (!canPost) return;
        onPost(text.trim(), images);
        setText('');
    }

    function requestClose() {
        if (!exiting) setExiting(true);
    }

    function addImages(urls: string[]) {
        setImages(prev => [...prev, ...urls].slice(0, MAX_IMAGES));
        setPicking(false);
    }

    function removeImage(idx: number) {
        setImages(prev => prev.filter((_, i) => i !== idx));
    }

    function toggleEmoji() {
        setEmojiOpen(o => {
            if (!o) taRef.current?.blur();
            return !o;
        });
    }

    const atImageLimit = images.length >= MAX_IMAGES;

    return (
        <div
            className="absolute inset-0 z-50 flex flex-col"
            onAnimationEnd={e => { if (exiting && e.animationName === 'ios-sheet-down') onClose(); }}
            style={{
                background: BG,
                animation: exiting
                    ? 'ios-sheet-down 0.3s cubic-bezier(0.32,0,0.68,1) forwards'
                    : 'ios-sheet-up 0.42s cubic-bezier(0.32,0.72,0,1)',
                willChange: 'transform',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                boxShadow: '0 -8px 30px rgba(0,0,0,0.18)',
            }}
        >
            <div className="h-[54px] shrink-0" aria-hidden />

            <header className="flex items-center justify-between px-4 py-2.5">
                <button type="button" onClick={requestClose} className="text-[16px]" style={{ color: BLUE }}>
                    {t('birdy.cancel', 'Cancel')}
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={!canPost}
                    className="rounded-full px-4 py-1.5 text-[15px] font-bold text-white transition-[transform,opacity] active:scale-95 disabled:opacity-50"
                    style={{ background: BLUE }}
                >
                    {t('birdy.post', 'Post')}
                </button>
            </header>

            <div className="flex min-h-0 flex-1 gap-3 overflow-y-auto px-4 pt-3">
                <Avatar size={40} />
                <div className="flex min-w-0 flex-1 flex-col">
                    <textarea
                        ref={taRef}
                        value={text}
                        onChange={e => setText(e.target.value)}
                        onFocus={() => setEmojiOpen(false)}
                        maxLength={MAX_POST_LENGTH}
                        placeholder={t('birdy.whatsHappening', "What's happening?")}
                        className="min-h-[110px] flex-none resize-none bg-transparent pt-1 text-[17px] leading-snug text-black outline-none placeholder:font-semibold placeholder:text-[#536471]"
                        style={{ caretColor: BLUE }}
                    />

                    {images.length > 0 && (
                        <div className="mb-3 mt-1 flex gap-2">
                            {images.map((url, i) => (
                                <div key={`${url}-${i}`} className="relative min-w-0 flex-1">
                                    <img src={url} alt="" draggable={false} className="h-[240px] w-full rounded-[14px] object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removeImage(i)}
                                        aria-label={t('birdy.removeImage', 'Remove image')}
                                        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 active:opacity-70"
                                    >
                                        <X className="h-[16px] w-[16px] text-white" strokeWidth={2.6} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {emojiOpen && <EmojiPanel isDark={false} onSelect={e => setText(t => t + e)} />}

            <div className="flex items-center gap-1 px-3 pb-8 pt-1.5" style={{ background: BG }}>
                <button
                    type="button"
                    aria-label={t('birdy.addImage', 'Add image')}
                    disabled={atImageLimit}
                    onClick={() => setPicking(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-full active:bg-black/5 disabled:opacity-40"
                >
                    <ImageIcon className="h-[26px] w-[26px]" style={{ color: BLUE }} strokeWidth={2} />
                </button>
                <button
                    type="button"
                    aria-label={t('birdy.addEmoji', 'Add emoji')}
                    onClick={toggleEmoji}
                    className="flex h-10 w-10 items-center justify-center rounded-full active:bg-black/5"
                >
                    <Smile className="h-[26px] w-[26px]" style={{ color: BLUE }} strokeWidth={2} />
                </button>
                <CounterRing len={text.length} />
            </div>

            {picking && (
                <MediaPickerSheet
                    multiple
                    onSelectMany={ps => addImages(ps.map(p => p.url))}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}

/** Twitter's character budget as a filling ring: quiet blue while there's room, the remaining
 *  number fades in for the last 20 characters, red when the budget is spent. Hidden until the
 *  first character so an empty composer stays clean. */
function CounterRing({ len }: { len: number }) {
    if (len === 0) return null;
    const remaining = MAX_POST_LENGTH - len;
    const frac = Math.min(1, len / MAX_POST_LENGTH);
    const R = 9;
    const C = 2 * Math.PI * R;
    const color = remaining <= 0 ? '#f4212e' : remaining <= 20 ? '#ffad1f' : BLUE;
    return (
        <span className="ml-auto mr-1 flex items-center gap-1.5">
            {remaining <= 20 && (
                <span className={`text-[13px] tabular-nums ${remaining <= 0 ? 'font-semibold text-[#f4212e]' : 'text-[#536471]'}`}>
                    {remaining}
                </span>
            )}
            <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90" aria-hidden>
                <circle cx="11" cy="11" r={R} fill="none" stroke="#eff3f4" strokeWidth="2.5" />
                <circle
                    cx="11" cy="11" r={R} fill="none"
                    stroke={color} strokeWidth="2.5" strokeLinecap="round"
                    strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
                    className="transition-[stroke-dashoffset,stroke] duration-150"
                />
            </svg>
        </span>
    );
}
