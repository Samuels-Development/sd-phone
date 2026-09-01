import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUp, ChevronLeft, Mic, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { PhotosIcon } from '@/shell/AppIconSVG';
import { fmtChatSeparator, type Message } from '@/shared/chat/data';
import { MessageBubble } from '@/shared/chat/MessageBubble';
import { useAutoScrollToEnd } from '@/shared/chat/useAutoScrollToEnd';
import { useTapbackDismiss } from '@/shared/chat/useTapbackDismiss';
import { EmojiPanel } from '@/shared/chat/EmojiPanel';
import { GifPickerSheet } from '@/shared/chat/GifPickerSheet';
import { warmGifCategories } from '@/shared/chat/gifsApi';
import { VoicePanel } from '@/shared/chat/VoicePanel';
import type { MessageDraft } from '@/shared/chat/ChatView';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { warmPhotos, apiSavePhotoFromUrl } from '@/core/photosApi';
import { IG, type DM, type DMsg, type SharedPost } from '../data';
import { MediaThumb } from '../create/Media';
import { avatarFor } from '../photogramApi';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

type Panel = 'emoji' | 'voice' | null;

const ACTION_BTNS: { id: string; label: string; emoji?: string; Icon?: LucideIcon }[] = [
    { id: 'emoji',  label: 'Emoji',  emoji: '😊' },
    { id: 'photos', label: 'Photos' },
    { id: 'gif',    label: 'GIF' },
    { id: 'voice',  label: 'Voice',  Icon: Mic },
];

const SURFACE       = '#f2f2f2';
const RECEIVED_BG   = '#e7e7e9';
const ACTION_BAR_BG = '#f2f2f2';

export function ChatView({ convo, onBack, onSend, onReact, onOpenPost, animateIn = true }: {
    convo:   DM;
    onBack:  () => void;
    onSend:  (d: MessageDraft) => void;
    onReact: (msgId: string, emoji: string) => void;
    onOpenPost?: (id: string) => void;
    animateIn?: boolean;
}) {
    const { goBack, pageStyle } = useIosPush(onBack, animateIn);
    const [draft,       setDraft]       = useState('');
    const [panel,       setPanel]       = useState<Panel>(null);
    const [picking,     setPicking]     = useState(false);
    const [gifPicking,  setGifPicking]  = useState(false);
    const [replyTo,     setReplyTo]     = useState<DMsg | null>(null);
    const [pickerId,    setPickerId]    = useState<string | null>(null);
    const [attachments, setAttachments] = useState<string[]>([]);
    const [preview,     setPreview]     = useState<string | null>(null);
    const [savedPreview, setSavedPreview] = useState(false);
    const listRef  = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const messages = convo.messages;
    const name     = convo.user.handle;

    useTapbackDismiss(pickerId, setPickerId);

    useEffect(() => { warmGifCategories(); warmPhotos(); }, []);

    useAutoScrollToEnd(listRef, messages.length, panel !== 'voice' && panel !== 'emoji');

    function togglePanel(p: Panel) { setPanel(prev => (prev === p ? null : p)); inputRef.current?.blur(); }

    function replyName(m: DMsg): string { return m.mine ? t('photogram.you', 'You') : name; }
    function msgPreview(m: DMsg): string {
        if (m.kind === 'image') return t('photogram.photoLabel', '📷 Photo');
        if (m.kind === 'gif')   return 'GIF';
        if (m.kind === 'voice') return t('photogram.voiceMessage', '🎤 Voice message');
        if (m.kind === 'post')  return t('photogram.postLabel', '📷 Post');
        return m.body;
    }

    function send(d: MessageDraft) {
        onSend(replyTo ? { ...d, replyTo: { name: replyName(replyTo), body: msgPreview(replyTo) } } : d);
        setReplyTo(null);
        setPanel(null);
        inputRef.current?.focus();
    }
    function sendText() {
        const text = draft.trim();
        if (!text && attachments.length === 0) return;
        attachments.forEach(url => send({ kind: 'image', gifUrl: url, body: t('photogram.photoLabel', '📷 Photo') }));
        if (text) send({ body: text, kind: 'text' });
        setDraft('');
        setAttachments([]);
    }

    const openPicker = useCallback((id: string) => setPickerId(id), []);
    const handleReact = useCallback((id: string, emoji: string) => { onReact(id, emoji); setPickerId(null); }, [onReact]);
    const handleReply = useCallback((id: string) => {
        const m = messages.find(x => x.id === id);
        if (!m) return;
        setReplyTo(m);
        setPickerId(null);
        inputRef.current?.focus();
    }, [messages]);
    const handlePay = useCallback(() => {}, []);
    const handleImageTap = useCallback((url: string) => { setPreview(url); setSavedPreview(false); }, []);

    const toMsg = useCallback((m: DMsg): Message => ({
        id:   m.id,
        from: m.mine ? 'me' : convo.user.handle,
        body: m.body,
        kind: m.kind && m.kind !== 'post' ? m.kind : 'text',
        ts:   m.ts ?? 0,
        read: true,
        gifUrl: m.gifUrl, duration: m.duration, audioUrl: m.audioUrl, waveform: m.waveform,
        reactions: m.reactions, replyTo: m.replyTo,
    }), [convo.user.handle]);

    interface RenderMsg { kind: 'msg'; msg: DMsg; isLast: boolean; bubbleMsg: Message; customBubble?: ReactNode }
    interface RenderSep { kind: 'separator'; ts: number }
    type RenderItem = RenderMsg | RenderSep;
    const items = useMemo<RenderItem[]>(() => {
        const out: RenderItem[] = [];
        messages.forEach((msg, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const ts     = msg.ts ?? 0;
            const prevTs = prev?.ts ?? 0;
            if (ts > 0 && (!prev || ts - prevTs > 5 * 60_000)) out.push({ kind: 'separator', ts });
            const isLast = !next || next.mine !== msg.mine || (next.ts ?? 0) - ts > 60_000;
            const customBubble = msg.post ? <SharedPostCard post={msg.post} onOpen={() => onOpenPost?.(msg.post!.id)} /> : undefined;
            out.push({ kind: 'msg', msg, isLast, bubbleMsg: toMsg(msg), customBubble });
        });
        return out;
    }, [messages, toMsg, onOpenPost]);

    return (
        <div className="absolute inset-0 z-20 flex flex-col overflow-hidden" style={{ background: SURFACE, ...pageStyle }}>
            <StatusBarSpacer />

            <div className="shrink-0">
                <div className="flex items-center gap-2 px-2 pb-3">
                    <button type="button" onClick={goBack} aria-label={t('photogram.back', 'Back')} className="shrink-0 text-black active:opacity-60">
                        <ChevronLeft className="h-[36px] w-[36px]" strokeWidth={2.4} />
                    </button>
                    <img src={convo.user.avatar} alt="" draggable={false} className="h-[40px] w-[40px] rounded-full object-cover" />
                    <span className="ml-1 min-w-0 truncate text-[20px] font-semibold text-black">{name}</span>
                </div>
                <div className="mx-[6%] h-[0.5px] bg-black/[0.08]" />
            </div>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 py-2">
                {messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-8 pb-10 text-center">
                        <img src={convo.user.avatar} alt="" className="h-[96px] w-[96px] rounded-full object-cover" />
                        <p className="mt-4 text-[20px] font-semibold text-black/85">{name}</p>
                        <p className="mt-1.5 text-[15px] font-medium leading-snug text-black/55">{t('photogram.sendMessageToStart', 'Send a message to start the chat')}</p>
                    </div>
                ) : null}
                {items.map((item, i) => {
                    if (item.kind === 'separator') {
                        const { lead, time } = fmtChatSeparator(item.ts);
                        return (
                            <div key={`sep-${i}`} className="flex justify-center pb-3 pt-4">
                                <span className="text-[13px] tracking-wide text-black/40"><span className="font-semibold text-black/55">{lead}</span> {time}</span>
                            </div>
                        );
                    }
                    const { msg, isLast, bubbleMsg, customBubble } = item;
                    const sent = !!msg.mine;
                    return (
                        <div key={msg.id} className={`flex items-end ${isLast ? 'mb-3' : 'mb-[2px]'} ${sent ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex flex-col ${sent ? 'max-w-[78%] items-end' : 'max-w-[80%] items-start'}`}>
                                <MessageBubble
                                    msg={bubbleMsg}
                                    sent={sent}
                                    isLast={isLast}
                                    isDark={false}
                                    receivedBg={RECEIVED_BG}
                                    sentBg={IG.blue}
                                    pickerOpen={pickerId === msg.id}
                                    onOpenPicker={openPicker}
                                    onReact={handleReact}
                                    onReply={handleReply}
                                    onPay={handlePay}
                                    onImageTap={handleImageTap}
                                    customBubble={customBubble}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="relative shrink-0">
                {panel === 'emoji' && (
                    <div className="absolute inset-x-0 bottom-full z-20">
                        <EmojiPanel isDark={false} onSelect={e => setDraft(d => d + e)} />
                    </div>
                )}

                {replyTo && (
                    <div className="flex items-center gap-2 px-4 pb-1 pt-2">
                        <div className="w-[3px] self-stretch rounded-full" style={{ background: IG.blue }} />
                        <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-semibold" style={{ color: IG.blue }}>{t('photogram.replyingTo', 'In reply to {name}', { name: replyName(replyTo) })}</div>
                            <div className="truncate text-[13px] text-black/55">{msgPreview(replyTo)}</div>
                        </div>
                        <button type="button" onClick={() => setReplyTo(null)} className="flex h-6 w-6 items-center justify-center rounded-full bg-black/10 active:opacity-60">
                            <X className="h-[14px] w-[14px] text-black/55" strokeWidth={2.5} />
                        </button>
                    </div>
                )}

                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 pb-1 pt-2">
                        {attachments.map((url, i) => (
                            <div key={`${url}-${i}`} className="relative">
                                <img src={url} alt="" className="h-[85px] w-[85px] rounded-[12px] object-cover" />
                                <button type="button" onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} aria-label={t('photogram.removeImage', 'Remove image')} className="absolute right-1 top-1 flex h-[20px] w-[20px] items-center justify-center rounded-full bg-black/55 active:opacity-70">
                                    <X className="h-[12px] w-[12px] text-white" strokeWidth={2.75} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="px-3 pb-2 pt-1.5">
                    <div className={`flex items-center gap-1 rounded-[22px] py-[9px] pl-4 ${draft.trim() || attachments.length ? 'pr-[5px]' : 'pr-4'}`} style={{ background: '#e7e7e9' }}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                            onFocus={() => setPanel(null)}
                            placeholder={t('photogram.messagePlaceholder', 'Message…')}
                            className="min-w-0 flex-1 bg-transparent py-[5px] text-[18px] text-black placeholder-black/35 outline-none"
                        />
                        {(draft.trim() || attachments.length > 0) && (
                            <button type="button" onClick={sendText} className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full active:opacity-70" style={{ background: IG.blue }}>
                                <ArrowUp className="h-[19px] w-[19px] text-white" strokeWidth={2.75} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-around px-4 pb-11 pt-2.5" style={{ background: ACTION_BAR_BG, borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
                    {ACTION_BTNS.map(btn => {
                        const Icon = btn.Icon;
                        return (
                            <button
                                key={btn.id}
                                type="button"
                                onClick={() => (
                                    btn.id === 'photos' ? (setPicking(true), setPanel(null))
                                    : btn.id === 'gif' ? (setGifPicking(true), setPanel(null))
                                    : togglePanel(btn.id as Panel)
                                )}
                                className="flex h-[48px] w-[58px] items-center justify-center rounded-[16px] bg-white transition-opacity active:opacity-60"
                                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
                            >
                                {btn.id === 'photos' ? (
                                    <span className="block overflow-hidden rounded-[7px] [&_svg]:block [&_svg]:h-full [&_svg]:w-full" style={{ width: 30, height: 30 }}><PhotosIcon /></span>
                                ) : Icon ? (
                                    <Icon className="h-[25px] w-[25px] text-black" strokeWidth={2} />
                                ) : btn.emoji ? (
                                    <span className="text-[23px] leading-none text-black">{btn.emoji}</span>
                                ) : (
                                    <span className="text-[15px] font-black tracking-tight" style={{ color: IG.blue }}>{btn.label}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {picking && (
                <MediaPickerSheet multiple onSelectMany={ps => { setAttachments(prev => [...prev, ...ps.map(p => p.url)]); setPicking(false); }} onClose={() => setPicking(false)} />
            )}
            {gifPicking && (
                <GifPickerSheet onSelect={url => { send({ kind: 'gif', gifUrl: url, body: 'GIF' }); setGifPicking(false); }} onClose={() => setGifPicking(false)} />
            )}
            {panel === 'voice' && (
                <VoicePanel onSend={(dur, url, wave) => send({ kind: 'voice', duration: dur, body: t('photogram.voiceMessage', '🎤 Voice message'), audioUrl: url, waveform: wave })} onClose={() => setPanel(null)} />
            )}

            {preview && (
                <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.92)', animation: 'ios-sheet-backdrop-in 0.2s ease-out' }} onClick={() => setPreview(null)}>
                    <img src={preview} alt="" className="max-h-[80%] max-w-full rounded-[8px] object-contain" />
                    <button type="button" onClick={e => { e.stopPropagation(); if (!savedPreview) { void apiSavePhotoFromUrl(preview); setSavedPreview(true); } }} className="mt-6 text-[15px] text-white/85 active:opacity-60">
                        {savedPreview ? t('photogram.savedToGallery', 'Saved to Gallery') : t('photogram.saveToGallery', 'Save to Gallery')}
                    </button>
                </div>
            )}
        </div>
    );
}

function SharedPostCard({ post, onOpen }: { post: SharedPost; onOpen: () => void }) {
    return (
        <button type="button" onClick={onOpen} className="w-[274px] overflow-hidden rounded-[18px] border border-black/10 bg-white text-left shadow-sm active:opacity-90">
            <div className="flex items-center gap-2.5 px-3 py-2.5">
                <img src={avatarFor(post.author, post.avatar)} alt="" draggable={false} className="h-[34px] w-[34px] shrink-0 rounded-full object-cover" />
                <span className="truncate text-[17px] font-semibold text-black">{post.author}</span>
            </div>
            {post.image
                ? <MediaThumb url={post.image} className="aspect-square w-full" />
                : <div className="aspect-square w-full bg-black/5" />}
            {post.caption && (
                <div className="px-3.5 py-2.5 text-[17px] leading-snug text-black">
                    <div className="line-clamp-2">
                        <span className="font-semibold">{post.author}</span> {post.caption}
                    </div>
                </div>
            )}
        </button>
    );
}
