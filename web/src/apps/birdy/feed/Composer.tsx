import { useEffect, useRef, useState } from 'react';
import { BarChart2, Image as ImageIcon, Plus, Smile, X } from 'lucide-react';

import { t } from '@/i18n';
import { useTheme } from '@/stores/themeStore';
import { useSessionState } from '@/hooks/useSessionState';
import { EmojiPanel } from '@/shared/chat/EmojiPanel';
import { GifPickerSheet } from '@/shared/chat/GifPickerSheet';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { BG, BLUE, CARD, LINE, MAX_POLL_OPTIONS, MAX_POLL_OPTION_LENGTH, MAX_POST_LENGTH, META, POLL_DURATIONS } from '../data';
import { Avatar } from '../ui';
import type { BirdyAuthor, PollDurationKey } from '../data';
import type { PollDraft } from '../birdyApi';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

const MAX_IMAGES = 3;

export function Composer({ me, onClose, onPost }: {
    me:      BirdyAuthor;
    onClose: () => void;
    onPost:  (body: string, images: string[], poll?: PollDraft) => void;
}) {
    const { theme } = useTheme('theme');
    const isDark = theme === 'dark';

    const [text, setText] = useSessionState('birdy:composerDraft', '');
    const [images, setImages] = useState<string[]>([]);
    const [picking, setPicking] = useState(false);
    const [pickingGif, setPickingGif] = useState(false);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [exiting, setExiting] = useState(false);
    const [pollOptions, setPollOptions] = useSessionState<string[] | null>('birdy:composerPoll', null);
    const [pollDuration, setPollDuration] = useSessionState<PollDurationKey>('birdy:composerPollDuration', '1d');
    const [pollClosing, setPollClosing] = useState(false);
    const taRef = useRef<HTMLTextAreaElement>(null);

    const durations: { value: PollDurationKey; label: string }[] = [
        { value: '1h', label: t('squawk.pollHour',  '1 hour') },
        { value: '1d', label: t('squawk.pollDay',   '1 day') },
        { value: '3d', label: t('squawk.pollDays3', '3 days') },
        { value: '7d', label: t('squawk.pollDays7', '7 days') },
    ];

    const filledOptions = (pollOptions ?? []).map(o => o.trim()).filter(o => o.length > 0);
    const canPost = pollOptions
        ? text.trim().length > 0 && filledOptions.length >= 2
        : text.trim().length > 0 || images.length > 0;

    useEffect(() => {
        const t = window.setTimeout(() => taRef.current?.focus({ preventScroll: true }), 360);
        return () => window.clearTimeout(t);
    }, []);

    function submit() {
        if (!canPost) return;
        onPost(text.trim(), images, pollOptions ? { options: filledOptions, duration: POLL_DURATIONS[pollDuration] } : undefined);
        setText('');
        setPollOptions(null);
    }

    function togglePoll() {
        if (pollOptions) {
            if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) setPollOptions(null);
            else setPollClosing(true);
            return;
        }
        setPollClosing(false);
        setPollOptions(['', '']);
        setImages([]);
    }

    function setOption(idx: number, value: string) {
        setPollOptions(prev => (prev ? prev.map((o, i) => (i === idx ? value : o)) : prev));
    }

    function addOption() {
        setPollOptions(prev => (prev && prev.length < MAX_POLL_OPTIONS ? [...prev, ''] : prev));
    }

    function removeOption(idx: number) {
        setPollOptions(prev => (prev && prev.length > 2 ? prev.filter((_, i) => i !== idx) : prev));
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
            <style>{`
                @keyframes sq-poll-in {
                    from { grid-template-rows: 0fr; opacity: 0; transform: translateY(-4px); }
                    to   { grid-template-rows: 1fr; opacity: 1; transform: translateY(0); }
                }
                @keyframes sq-poll-out {
                    from { grid-template-rows: 1fr; opacity: 1; }
                    to   { grid-template-rows: 0fr; opacity: 0; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .sq-poll { animation: none !important; }
                }
            `}</style>

            <StatusBarSpacer />

            <header className="flex items-center justify-between px-4 py-2.5">
                <button type="button" onClick={requestClose} className="text-[16px]" style={{ color: BLUE }}>
                    {t('squawk.cancel', 'Cancel')}
                </button>
                <button
                    type="button"
                    onClick={submit}
                    disabled={!canPost}
                    className="rounded-full px-4 py-1.5 text-[15px] font-bold text-white transition-[transform,opacity] active:scale-95 disabled:opacity-50"
                    style={{ background: BLUE }}
                >
                    {t('squawk.post', 'Post')}
                </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pt-3">
                <div className="flex gap-3">
                    <Avatar size={40} src={me.avatar} />
                    <div className="flex min-w-0 flex-1 flex-col">
                        <textarea
                            ref={taRef}
                            value={text}
                            onChange={e => setText(e.target.value)}
                            onFocus={() => setEmojiOpen(false)}
                            maxLength={MAX_POST_LENGTH}
                            placeholder={t('squawk.whatsHappening', "What's on your mind?")}
                            className="min-h-[110px] flex-none resize-none bg-transparent pt-1 text-[17px] leading-snug text-label outline-none placeholder:font-semibold placeholder:text-ios-gray"
                            style={{ caretColor: BLUE, outline: 'none', boxShadow: 'none' }}
                        />

                        {images.length > 0 && (
                            <div className="mb-3 mt-1 flex gap-2">
                                {images.map((url, i) => (
                                    <div key={`${url}-${i}`} className="relative min-w-0 flex-1">
                                        <img src={url} alt="" draggable={false} className="h-[240px] w-full rounded-[14px] object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => removeImage(i)}
                                            aria-label={t('squawk.removeImage', 'Remove image')}
                                            className="absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 active:opacity-70"
                                        >
                                            <X className="h-[16px] w-[16px] text-white" strokeWidth={2.6} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {pollOptions && (
                    <div
                        className="sq-poll grid"
                        style={{ animation: pollClosing
                            ? 'sq-poll-out 0.24s cubic-bezier(0.32,0,0.68,1) forwards'
                            : 'sq-poll-in 0.32s cubic-bezier(0.32,0.72,0,1) both' }}
                        onAnimationEnd={e => {
                            if (!pollClosing || e.animationName !== 'sq-poll-out') return;
                            setPollOptions(null);
                            setPollClosing(false);
                        }}
                    >
                        <div className="overflow-hidden">
                            <div className="mb-3 mt-1 rounded-[18px] p-3.5" style={{ background: CARD, boxShadow: `inset 0 0 0 1px ${LINE}` }}>
                                <div className="mb-3 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: BLUE }}>
                                        <BarChart2 className="h-[14px] w-[14px] -rotate-90" strokeWidth={3} />
                                        {t('squawk.pollLabel', 'Poll')}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={togglePoll}
                                        aria-label={t('squawk.pollRemove', 'Remove poll')}
                                        className="flex h-[26px] w-[26px] items-center justify-center rounded-full active:bg-hairline/10"
                                        style={{ color: META }}
                                    >
                                        <X className="h-[16px] w-[16px]" strokeWidth={2.6} />
                                    </button>
                                </div>

                                <div className="flex flex-col gap-2">
                                    {pollOptions.map((value, i) => (
                                        <div key={i} className="flex items-center gap-2.5">
                                            <span
                                                className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[12px] font-bold tabular-nums"
                                                style={{ background: 'rgb(var(--ios-blue) / 0.12)', color: BLUE }}
                                            >
                                                {i + 1}
                                            </span>
                                            <input
                                                value={value}
                                                onChange={e => setOption(i, e.target.value)}
                                                maxLength={MAX_POLL_OPTION_LENGTH}
                                                placeholder={t('squawk.pollOptionN', 'Choice {n}', { n: i + 1 })}
                                                className="min-w-0 flex-1 rounded-[12px] px-3.5 py-2.5 text-[16px] text-label outline-none placeholder:text-ios-gray"
                                                style={{ background: BG, caretColor: BLUE }}
                                            />
                                            {pollOptions.length > 2 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeOption(i)}
                                                    aria-label={t('squawk.pollRemoveOption', 'Remove choice')}
                                                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full active:bg-hairline/10"
                                                    style={{ color: META }}
                                                >
                                                    <X className="h-[17px] w-[17px]" strokeWidth={2.4} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {pollOptions.length < MAX_POLL_OPTIONS && (
                                    <button
                                        type="button"
                                        onClick={addOption}
                                        className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[12px] py-2.5 text-[15px] font-semibold active:opacity-60"
                                        style={{ color: BLUE, border: '1px dashed rgb(var(--ios-blue) / 0.35)' }}
                                    >
                                        <Plus className="h-[16px] w-[16px]" strokeWidth={2.8} />
                                        {t('squawk.pollAddOption', 'Add a choice')}
                                    </button>
                                )}

                                <p className="mb-2 mt-4 text-[12px] font-bold uppercase tracking-[0.06em]" style={{ color: META }}>
                                    {t('squawk.pollLength', 'Poll length')}
                                </p>
                                <SegmentedControl
                                    value={pollDuration}
                                    onChange={setPollDuration}
                                    options={durations}
                                    slide
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {emojiOpen && <EmojiPanel isDark={isDark} onSelect={e => setText(t => t + e)} />}

            <div className="flex items-center gap-1 px-3 pb-8 pt-1.5" style={{ background: BG }}>
                <button
                    type="button"
                    aria-label={t('squawk.addImage', 'Add image')}
                    disabled={atImageLimit}
                    onClick={() => setPicking(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-full active:bg-hairline/5 disabled:opacity-40"
                >
                    <ImageIcon className="h-[26px] w-[26px]" style={{ color: BLUE }} strokeWidth={2} />
                </button>
                <button
                    type="button"
                    aria-label={t('squawk.addGif', 'Add GIF')}
                    disabled={atImageLimit}
                    onClick={() => setPickingGif(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-full active:bg-hairline/5 disabled:opacity-40"
                >
                    <span className="rounded-[6px] border-2 px-[4px] py-[2px] text-[11px] font-extrabold leading-none" style={{ borderColor: BLUE, color: BLUE }}>GIF</span>
                </button>
                <button
                    type="button"
                    aria-label={t('squawk.addPoll', 'Add poll')}
                    onClick={togglePoll}
                    className="flex h-10 w-10 items-center justify-center rounded-full active:bg-hairline/5 disabled:opacity-40"
                    style={pollOptions ? { background: 'rgb(var(--ios-blue) / 0.12)' } : undefined}
                >
                    <BarChart2 className="h-[26px] w-[26px] -rotate-90" style={{ color: BLUE }} strokeWidth={2} />
                </button>
                <button
                    type="button"
                    aria-label={t('squawk.addEmoji', 'Add emoji')}
                    onClick={toggleEmoji}
                    className="flex h-10 w-10 items-center justify-center rounded-full active:bg-hairline/5"
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
            {pickingGif && (
                <GifPickerSheet
                    onSelect={url => { addImages([url]); setPickingGif(false); }}
                    onClose={() => setPickingGif(false)}
                />
            )}
        </div>
    );
}

function CounterRing({ len }: { len: number }) {
    if (len === 0) return null;
    const remaining = MAX_POST_LENGTH - len;
    const frac = Math.min(1, len / MAX_POST_LENGTH);
    const R = 9;
    const C = 2 * Math.PI * R;
    const color = remaining <= 0 ? '#f4212e' : remaining <= 20 ? '#ffad1f' : BLUE;
    return (
        <span className="ms-auto me-1 flex items-center gap-1.5">
            {remaining <= 20 && (
                <span className={`text-[13px] tabular-nums ${remaining <= 0 ? 'font-semibold text-[#f4212e]' : 'text-[#536471]'}`}>
                    {remaining}
                </span>
            )}
            <svg width="22" height="22" viewBox="0 0 22 22" className="-rotate-90" aria-hidden>
                <circle cx="11" cy="11" r={R} fill="none" stroke={LINE} strokeWidth="2.5" />
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
