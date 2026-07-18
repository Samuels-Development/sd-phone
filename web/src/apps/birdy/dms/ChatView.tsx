import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ChevronLeft, Mic, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { t } from '@/i18n';
import { fetchNui, isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';
import { requestOpenMaps } from '@/shell/deeplink';
import { AlertDialog } from '@/ui/AlertDialog';
import { ActionSheet } from '@/ui/ActionSheet';
import { PhotosIcon } from '@/shell/AppIconSVG';
import { decodeWaypoint, encodeWaypoint } from '@/lib/waypointCode';
import { fmtChatSeparator, type Message } from '@/shared/chat/data';
import { MessageBubble } from '@/shared/chat/MessageBubble';
import { useAutoScrollToEnd } from '@/shared/chat/useAutoScrollToEnd';
import { useTapbackDismiss } from '@/shared/chat/useTapbackDismiss';
import { EmojiPanel } from '@/shared/chat/EmojiPanel';
import { GifPickerSheet } from '@/shared/chat/GifPickerSheet';
import { warmGifCategories } from '@/shared/chat/gifsApi';
import { MoneyPanel } from '@/shared/chat/MoneyPanel';
import { VoicePanel } from '@/shared/chat/VoicePanel';
import type { MessageDraft } from '@/shared/chat/ChatView';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { warmPhotos, apiSavePhotoFromUrl } from '@/core/photosApi';
import { BLUE, type BirdyConversation, type BirdyMessage } from '../data';
import { Avatar } from '../ui';

type Panel = 'emoji' | 'money' | 'voice' | null;

function actionBtns(): { id: string; label: string; emoji?: string; Icon?: LucideIcon }[] {
    return [
        { id: 'emoji',    label: t('birdy.emoji', 'Emoji'),    emoji: '😊' },
        { id: 'photos',   label: t('birdy.photos', 'Photos') },
        { id: 'gif',      label: t('birdy.gif', 'GIF') },
        { id: 'voice',    label: t('birdy.voice', 'Voice'),    Icon: Mic },
    ];
}

const RECEIVED_BG   = '#c6c6c6';
const SURFACE       = '#e5e5e5';
const ACTION_BAR_BG = '#d4d4d4';

export function ChatView({ convo, onBack, onSend, onReact, onPayRequest, animateIn = true }: {
    convo:        BirdyConversation;
    onBack:       () => void;
    onSend:       (draft: MessageDraft) => void;
    onReact:      (messageId: string, emoji: string) => void;
    onPayRequest: (messageId: string, amount: number) => void;
    animateIn?:   boolean;
}) {
    const [draft,      setDraft]      = useState('');
    const [panel,      setPanel]      = useState<Panel>(null);
    const [pickerId,   setPickerId]   = useState<string | null>(null);
    const [replyTo,    setReplyTo]    = useState<BirdyMessage | null>(null);
    const [picking,    setPicking]    = useState(false);
    const [gifPicking, setGifPicking] = useState(false);
    const [attachments, setAttachments] = useState<string[]>([]);
    const [closing,    setClosing]    = useState(false);
    const [pendingPay, setPendingPay] = useState<{ id: string; amount: number } | null>(null);
    const [confirmLocation, setConfirmLocation] = useState(false);
    const [locSheet,   setLocSheet]   = useState<BirdyMessage | null>(null);
    const [preview,    setPreview]    = useState<string | null>(null);
    const [savedPreview, setSavedPreview] = useState(false);
    const listRef  = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const btns = actionBtns();

    const messages = convo.messages;
    const name     = convo.user.name;

    useTapbackDismiss(pickerId, setPickerId);

    useEffect(() => { warmGifCategories(); warmPhotos(); }, []);

    useAutoScrollToEnd(listRef, messages.length, panel !== 'money' && panel !== 'voice' && panel !== 'emoji');

    function togglePanel(p: Panel) {
        setPanel(prev => (prev === p ? null : p));
        inputRef.current?.blur();
    }

    function openInMaps(msg: BirdyMessage) {
        const wp = msg.wpCode ? decodeWaypoint(msg.wpCode) : null;
        requestOpenMaps(wp ? { label: wp.label, x: wp.x, y: wp.y, icon: wp.icon, color: wp.color } : null);
    }
    function setWaypointFor(msg: BirdyMessage) {
        const wp = msg.wpCode ? decodeWaypoint(msg.wpCode) : null;
        void fetchNui('sd-phone:maps:waypoint', wp ? { x: wp.x, y: wp.y } : {});
    }

    function replyName(m: BirdyMessage): string { return m.fromMe ? t('birdy.you', 'You') : name; }
    function msgPreview(m: BirdyMessage): string {
        if (m.kind === 'image')    return t('birdy.photoPreview', '📷 Photo');
        if (m.kind === 'gif')      return t('birdy.gif', 'GIF');
        if (m.kind === 'money')    return `$${m.amount}`;
        if (m.kind === 'voice')    return t('birdy.voiceMessagePreview', '🎤 Voice message');
        if (m.kind === 'location') return t('birdy.locationPreview', '📍 Location');
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
        attachments.forEach(url => send({ kind: 'image', gifUrl: url, body: '📷 Photo' }));
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
    const handlePay = useCallback((id: string, amount: number) => setPendingPay({ id, amount }), []);
    const handleLocationTap = useCallback((id: string) => {
        const m = messages.find(x => x.id === id);
        if (m) setLocSheet(m);
    }, [messages]);
    const handleImageTap = useCallback((url: string) => { setPreview(url); setSavedPreview(false); }, []);

    const toMsg = useCallback((m: BirdyMessage): Message => ({
        id:   m.id,
        from: m.fromMe ? 'me' : convo.user.handle,
        body: m.body,
        kind: m.kind ?? 'text',
        ts:   m.ts ?? 0,
        read: true,
        gifUrl: m.gifUrl, amount: m.amount, requested: m.requested,
        duration: m.duration, audioUrl: m.audioUrl, waveform: m.waveform,
        wpCode: m.wpCode, wpSub: m.wpSub, reactions: m.reactions, replyTo: m.replyTo,
    }), [convo.user.handle]);

    interface RenderMsg { kind: 'msg'; msg: BirdyMessage; isLast: boolean; bubbleMsg: Message }
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
            const isLast = !next || next.fromMe !== msg.fromMe || (next.ts ?? 0) - ts > 60_000;
            out.push({ kind: 'msg', msg, isLast, bubbleMsg: toMsg(msg) });
        });
        return out;
    }, [messages, toMsg]);

    return (
        <div
            className="absolute inset-0 z-20 flex flex-col overflow-hidden"
            style={{
                background:  SURFACE,
                animation: closing
                    ? 'ios-pop 0.32s cubic-bezier(0.32,0.72,0,1) forwards'
                    : animateIn ? 'ios-push 0.32s cubic-bezier(0.32,0.72,0,1)' : undefined,
                willChange: 'transform',
            }}
            onAnimationEnd={e => { if (e.target === e.currentTarget && closing) onBack(); }}
        >
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="shrink-0">
                <div className="flex items-center gap-2 px-2 pb-3">
                    <button type="button" onClick={() => setClosing(true)} aria-label={t('birdy.back', 'Back')} className="shrink-0 active:opacity-60" style={{ color: BLUE }}>
                        <ChevronLeft className="h-[38px] w-[38px]" strokeWidth={2.4} />
                    </button>
                    <div className="flex min-w-0 items-center gap-2">
                        <Avatar size={46} src={convo.user.avatar} />
                        <span className="ml-1 min-w-0 truncate text-[24px] font-semibold text-black">{name}</span>
                    </div>
                </div>
                <div className="mx-[6%] h-[0.5px] bg-black/15" />
            </div>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 py-2">
                {messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-8 pb-10 text-center">
                        <Avatar size={104} src={convo.user.avatar} />
                        <p className="mt-4 text-[21px] font-semibold text-black/85">{name}</p>
                        <p className="mt-1.5 text-[16px] font-medium leading-snug text-black/65">{t('birdy.sayHello', 'Say hello to @{handle}', { handle: convo.user.handle })}</p>
                    </div>
                ) : null}
                {items.map((item, i) => {
                    if (item.kind === 'separator') {
                        const { lead, time } = fmtChatSeparator(item.ts);
                        return (
                            <div key={`sep-${i}`} className="flex justify-center pb-3 pt-4">
                                <span className="text-[13px] tracking-wide text-black/40">
                                    <span className="font-semibold text-black/55">{lead}</span> {time}
                                </span>
                            </div>
                        );
                    }
                    const { msg, isLast, bubbleMsg } = item;
                    const sent = msg.fromMe;
                    return (
                        <div key={msg.id} className={`flex items-end ${isLast ? 'mb-3' : 'mb-[2px]'} ${sent ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex flex-col ${sent ? 'max-w-[78%] items-end' : 'max-w-[80%] items-start'}`}>
                                <MessageBubble
                                    msg={bubbleMsg}
                                    sent={sent}
                                    isLast={isLast}
                                    isDark={false}
                                    receivedBg={RECEIVED_BG}
                                    sentBg={BLUE}
                                    pickerOpen={pickerId === msg.id}
                                    onOpenPicker={openPicker}
                                    onReact={handleReact}
                                    onReply={handleReply}
                                    onPay={handlePay}
                                    onLocationTap={handleLocationTap}
                                    onImageTap={handleImageTap}
                                    locationCaption={msg.kind === 'location'
                                        ? (sent ? t('birdy.youSharedLocation', 'You shared your location with {name}', { name }) : t('birdy.sharedTheirLocation', '{name} shared their location', { name }))
                                        : undefined}
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
                        <div className="w-[3px] self-stretch rounded-full" style={{ background: BLUE }} />
                        <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-semibold" style={{ color: BLUE }}>{t('birdy.replyTo', 'Reply to {name}', { name: replyName(replyTo) })}</div>
                            <div className="truncate text-[13px] text-black/55">{msgPreview(replyTo)}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setReplyTo(null)}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-black/10 active:opacity-60"
                        >
                            <X className="h-[14px] w-[14px] text-black/55" strokeWidth={2.5} />
                        </button>
                    </div>
                )}

                {attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-4 pb-1 pt-2">
                        {attachments.map((url, i) => (
                            <div key={`${url}-${i}`} className="relative">
                                <img src={url} alt="" className="h-[85px] w-[85px] rounded-[12px] object-cover" />
                                <button
                                    type="button"
                                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                                    aria-label={t('birdy.removeImage', 'Remove image')}
                                    className="absolute right-1 top-1 flex h-[20px] w-[20px] items-center justify-center rounded-full bg-black/55 active:opacity-70"
                                >
                                    <X className="h-[12px] w-[12px] text-white" strokeWidth={2.75} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="px-3 pb-2 pt-1.5">
                    <div className={`flex items-center gap-1 rounded-[22px] bg-[#d4d4d4] py-[9px] pl-4 ${draft.trim() || attachments.length ? 'pr-[5px]' : 'pr-4'}`}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                            onFocus={() => setPanel(null)}
                            placeholder={t('birdy.textMessage', 'Text Message')}
                            className="min-w-0 flex-1 bg-transparent py-[5px] text-[18px] text-black placeholder-black/35 outline-none"
                        />
                        {(draft.trim() || attachments.length > 0) && (
                            <button
                                type="button"
                                onClick={sendText}
                                className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full active:opacity-70"
                                style={{ background: BLUE }}
                            >
                                <ArrowUp className="h-[19px] w-[19px] text-white" strokeWidth={2.75} />
                            </button>
                        )}
                    </div>
                </div>

                <div
                    className="flex items-center justify-around px-4 pb-11 pt-2.5"
                    style={{ background: ACTION_BAR_BG, borderTop: '0.5px solid rgba(0,0,0,0.10)' }}
                >
                    {btns.map(btn => {
                        const Icon = btn.Icon;
                        return (
                            <button
                                key={btn.id}
                                type="button"
                                onClick={() => (
                                    btn.id === 'photos' ? (setPicking(true), setPanel(null))
                                    : btn.id === 'gif' ? (setGifPicking(true), setPanel(null))
                                    : btn.id === 'location' ? (setConfirmLocation(true), setPanel(null))
                                    : togglePanel(btn.id as Panel)
                                )}
                                className="flex h-[48px] w-[54px] items-center justify-center rounded-[16px] bg-white transition-opacity active:opacity-60"
                                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
                            >
                                {btn.id === 'photos' ? (
                                    <span className="block overflow-hidden rounded-[7px] [&_svg]:block [&_svg]:h-full [&_svg]:w-full" style={{ width: 30, height: 30 }}>
                                        <PhotosIcon />
                                    </span>
                                ) : Icon ? (
                                    <Icon className={`text-black ${btn.id === 'location' ? 'h-[27px] w-[27px]' : 'h-[25px] w-[25px]'}`} strokeWidth={2} />
                                ) : btn.emoji ? (
                                    <span className="text-[23px] leading-none text-black">{btn.emoji}</span>
                                ) : (
                                    <span className="text-[15px] font-black tracking-tight" style={{ color: BLUE }}>
                                        {btn.label}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {picking && (
                <MediaPickerSheet
                    multiple
                    onSelectMany={ps => { setAttachments(prev => [...prev, ...ps.map(p => p.url)]); setPicking(false); }}
                    onClose={() => setPicking(false)}
                />
            )}

            {gifPicking && (
                <GifPickerSheet
                    onSelect={url => { send({ kind: 'gif', gifUrl: url, body: 'GIF' }); setGifPicking(false); }}
                    onClose={() => setGifPicking(false)}
                />
            )}

            {panel === 'voice' && (
                <VoicePanel
                    onSend={(dur, url, wave) => send({ kind: 'voice', duration: dur, body: '🎤 Voice message', audioUrl: url, waveform: wave })}
                    onClose={() => setPanel(null)}
                />
            )}

            {panel === 'money' && (
                <MoneyPanel
                    isDark={false}
                    peerName={name}
                    onSend={amt => send({ kind: 'money', amount: amt, body: `$${amt}` })}
                    onRequest={amt => send({ kind: 'money', amount: amt, body: `$${amt}`, requested: true })}
                    onClose={() => setPanel(null)}
                />
            )}

            {pendingPay && (
                <AlertDialog
                    title={t('birdy.payRequest', 'Pay Request')}
                    message={t('birdy.payAmountTo', 'Pay ${amount} to {name}?', { amount: pendingPay.amount, name })}
                    cancelLabel={t('birdy.cancel', 'Cancel')}
                    confirmLabel={t('birdy.pay', 'Pay')}
                    onCancel={() => setPendingPay(null)}
                    onConfirm={() => { onPayRequest(pendingPay.id, pendingPay.amount); setPendingPay(null); }}
                />
            )}

            {confirmLocation && (
                <AlertDialog
                    title={t('birdy.shareLocation', 'Share Location')}
                    message={t('birdy.shareLocationWith', 'Share your current location with {name}?', { name })}
                    cancelLabel={t('birdy.cancel', 'Cancel')}
                    confirmLabel={t('birdy.share', 'Share')}
                    onCancel={() => setConfirmLocation(false)}
                    onConfirm={async () => {
                        setConfirmLocation(false);
                        const d: MessageDraft = { kind: 'location', body: 'Current Location' };
                        if (isFiveM) {
                            try {
                                const r = await apiData<{ x: number; y: number }>('sd-phone:maps:here');
                                if (r) {
                                    d.wpCode = encodeWaypoint({ label: 'Shared Location', x: r.x, y: r.y, icon: 'MapPin', color: '#eb4b3c' });
                                    d.wpSub  = `${Math.round(r.x)}, ${Math.round(r.y)}`;
                                }
                            } catch { /* fall back to a coordless share */ }
                        }
                        send(d);
                    }}
                />
            )}

            {locSheet && (
                <ActionSheet
                    actions={[
                        { label: t('birdy.openInMaps', 'Open in Maps'), onClick: () => openInMaps(locSheet) },
                        { label: t('birdy.setWaypoint', 'Set Waypoint'), onClick: () => setWaypointFor(locSheet) },
                    ]}
                    onClose={() => setLocSheet(null)}
                />
            )}

            {preview && (
                <div
                    className="absolute inset-0 z-[60] flex flex-col items-center justify-center px-4"
                    style={{ background: 'rgba(0,0,0,0.92)', animation: 'ios-sheet-backdrop-in 0.2s ease-out' }}
                    onClick={() => setPreview(null)}
                >
                    <img src={preview} alt="" className="max-h-[80%] max-w-full rounded-[8px] object-contain" />
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); if (!savedPreview) { void apiSavePhotoFromUrl(preview); setSavedPreview(true); } }}
                        className="mt-6 text-[15px] text-white/85 active:opacity-60"
                    >
                        {savedPreview ? t('birdy.savedToGallery', 'Saved to Gallery') : t('birdy.saveToGallery', 'Save to Gallery')}
                    </button>
                </div>
            )}
        </div>
    );
}
