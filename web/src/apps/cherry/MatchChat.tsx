import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronLeft, ChevronRight, MapPin, Mic, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { fetchNui, isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';
import { t } from '@/i18n';
import { requestOpenMaps } from '@/shell/deeplink';
import { AlertDialog } from '@/ui/AlertDialog';
import { ActionSheet } from '@/ui/ActionSheet';
import { portalToPhoneScreen } from '@/ui/portal';
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
import { GenderBadge } from './GenderBadge';
import { CHERRY, type Match, type MatchPartner, msgPreview } from './data';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

type Panel = 'emoji' | 'money' | 'voice' | null;

export function MatchChat({ match, onBack, onSend, onReact, onPayRequest, onUnmatch, onBlock }: {
    match:        Match;
    onBack:       () => void;
    onSend:       (draft: MessageDraft) => void;
    onReact:      (messageId: string, emoji: string) => void;
    onPayRequest: (messageId: string, amount: number) => void;
    onUnmatch:    () => void;
    onBlock:      () => void;
}) {
    const [draft,    setDraft]    = useState('');
    const [closing,  setClosing]  = useState(false);
    const [panel,    setPanel]    = useState<Panel>(null);
    const [pickerId, setPickerId] = useState<string | null>(null);
    const [replyTo,  setReplyTo]  = useState<Message | null>(null);
    const [picking,    setPicking]    = useState(false);
    const [gifPicking, setGifPicking] = useState(false);
    const [attachments, setAttachments] = useState<string[]>([]);
    const [pendingPay, setPendingPay] = useState<{ id: string; amount: number } | null>(null);
    const [confirmLocation, setConfirmLocation] = useState(false);
    const [locSheet, setLocSheet] = useState<Message | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [savedPreview, setSavedPreview] = useState(false);
    const [showProfile, setShowProfile] = useState(false);
    const listRef  = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const messages = match.messages;
    const name     = match.partner.name;

    const actionBtns: { id: string; label: string; emoji?: string; Icon?: LucideIcon }[] = [
        { id: 'emoji',    label: t('cherry.emoji', 'Emoji'),    emoji: '😊' },
        { id: 'photos',   label: t('cherry.photos', 'Photos') },
        { id: 'gif',      label: t('cherry.gif', 'GIF') },
        { id: 'money',    label: t('cherry.moneyLabel', 'Money'),    emoji: '$' },
        { id: 'location', label: t('cherry.location', 'Location'), Icon: MapPin },
        { id: 'voice',    label: t('cherry.voice', 'Voice'),    Icon: Mic },
    ];

    useTapbackDismiss(pickerId, setPickerId);

    useEffect(() => { warmGifCategories(); warmPhotos(); }, []);

    useAutoScrollToEnd(listRef, messages.length, panel !== 'money' && panel !== 'voice' && panel !== 'emoji');

    function togglePanel(p: Panel) {
        setPanel(prev => prev === p ? null : p);
        inputRef.current?.blur();
    }

    function openInMaps(msg: Message) {
        const wp = msg.wpCode ? decodeWaypoint(msg.wpCode) : null;
        requestOpenMaps(wp ? { label: wp.label, x: wp.x, y: wp.y, icon: wp.icon, color: wp.color } : null);
    }
    function setWaypointFor(msg: Message) {
        const wp = msg.wpCode ? decodeWaypoint(msg.wpCode) : null;
        void fetchNui('sd-phone:maps:waypoint', wp ? { x: wp.x, y: wp.y } : {});
    }

    function replyName(m: Message): string {
        return m.from === 'me' ? t('cherry.you', 'You') : name;
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
        attachments.forEach(url => send({ kind: 'image', gifUrl: url, body: t('cherry.previewPhoto', '📷 Photo') }));
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

    interface RenderMsg { kind: 'msg'; msg: Message; isLast: boolean }
    interface RenderSep { kind: 'separator'; ts: number }
    type RenderItem = RenderMsg | RenderSep;

    const items: RenderItem[] = [];
    messages.forEach((msg, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        if (!prev || msg.ts - prev.ts > 5 * 60_000) items.push({ kind: 'separator', ts: msg.ts });
        const isLast = !next || next.from !== msg.from || next.ts - msg.ts > 60_000;
        items.push({ kind: 'msg', msg, isLast });
    });

    const receivedBg  = '#c6c6c6';
    const sentBg      = CHERRY.pink;
    const actionBarBg = '#d4d4d4';

    return (
        <div
            className="absolute inset-0 z-20 flex flex-col bg-[#e5e5e5]"
            style={{
                animation: closing
                    ? 'ios-pop 0.32s cubic-bezier(0.32,0.72,0,1) forwards'
                    : 'ios-push 0.32s cubic-bezier(0.32,0.72,0,1)',
                willChange: 'transform',
            }}
            onAnimationEnd={e => {
                if (e.target === e.currentTarget && closing) onBack();
            }}
        >
            <StatusBarSpacer />

            <div className="shrink-0">
                <div className="flex items-center gap-2 px-2 pb-3">
                    <button type="button" onClick={() => setClosing(true)} aria-label={t('cherry.back', 'Back')} className="shrink-0 active:opacity-60" style={{ color: CHERRY.pink }}>
                        <ChevronLeft className="h-[38px] w-[38px]" strokeWidth={2.4} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowProfile(true)}
                        aria-label={t('cherry.viewProfile', "View {name}'s profile", { name })}
                        className="flex min-w-0 items-center gap-2 text-left active:opacity-70"
                    >
                        {match.partner.photo
                            ? <img src={match.partner.photo} alt={name} draggable={false} className="h-[58px] w-[58px] shrink-0 rounded-full object-cover" />
                            : <span className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full text-[22px] font-bold text-white" style={{ background: CHERRY.pink }}>{name.slice(0, 1)}</span>}
                        <span className="ml-1 min-w-0 truncate text-[24px] font-semibold text-black">{name}</span>
                    </button>
                </div>
                <div className="mx-[6%] h-[0.5px] bg-black/15" />
            </div>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 py-2">
                {messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-8 pb-10 text-center">
                        {match.partner.photo
                            ? <img src={match.partner.photo} alt={name} draggable={false} className="h-[108px] w-[108px] rounded-full object-cover" />
                            : <span className="flex h-[108px] w-[108px] items-center justify-center rounded-full text-[40px] font-bold text-white" style={{ background: CHERRY.pink }}>{name.slice(0, 1)}</span>}
                        <p className="mt-4 text-[21px] font-semibold text-black/85">{t('cherry.bothLikedEachOther', 'You and {name} liked each other', { name })}</p>
                        <p className="mt-1.5 text-[16px] font-medium leading-snug text-black/65">{t('cherry.breakTheIce', 'Nobody has said anything yet.')}</p>
                    </div>
                ) : (
                    <p className="pb-1 pt-2 text-center text-[12px] text-black/35">{t('cherry.bothLikedEachOther', 'You and {name} liked each other', { name })}</p>
                )}
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
                    const { msg, isLast } = item;
                    const sent = msg.from === 'me';
                    return (
                        <div key={msg.id} className={`flex items-end ${isLast ? 'mb-3' : 'mb-[2px]'} ${sent ? 'justify-end' : 'justify-start'}`}>
                            <div className={`flex flex-col ${sent ? 'items-end' : 'items-start'} ${sent ? 'max-w-[78%]' : 'max-w-[80%]'}`}>
                                <MessageBubble
                                    msg={msg}
                                    sent={sent}
                                    isLast={isLast}
                                    isDark={false}
                                    receivedBg={receivedBg}
                                    sentBg={sentBg}
                                    pickerOpen={pickerId === msg.id}
                                    onOpenPicker={openPicker}
                                    onReact={handleReact}
                                    onReply={handleReply}
                                    onPay={handlePay}
                                    onLocationTap={handleLocationTap}
                                    onImageTap={handleImageTap}
                                    locationCaption={msg.kind === 'location'
                                        ? (sent ? t('cherry.youSharedLocation', 'You shared your location with {name}', { name }) : t('cherry.locationShared', '{name} shared their location', { name }))
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
                    <div className="flex items-center gap-2 px-4 pt-2 pb-1">
                        <div className="w-[3px] self-stretch rounded-full" style={{ background: CHERRY.pink }} />
                        <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-semibold" style={{ color: CHERRY.pink }}>{t('cherry.replyTo', 'In reply to {name}', { name: replyName(replyTo) })}</div>
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
                                    aria-label={t('cherry.removeImage', 'Remove image')}
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
                            placeholder={t('cherry.textMessage', 'Text Message')}
                            className="min-w-0 flex-1 bg-transparent py-[5px] text-[18px] text-black placeholder-black/35 outline-none"
                        />
                        {(draft.trim() || attachments.length > 0) && (
                            <button
                                type="button"
                                onClick={sendText}
                                className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full active:opacity-70"
                                style={{ background: CHERRY.pink }}
                            >
                                <ArrowUp className="h-[19px] w-[19px] text-white" strokeWidth={2.75} />
                            </button>
                        )}
                    </div>
                </div>

                <div
                    className="flex items-center justify-around px-4 pb-11 pt-2.5"
                    style={{ background: actionBarBg, borderTop: '0.5px solid rgba(0,0,0,0.10)' }}
                >
                    {actionBtns.map(btn => {
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
                                    <span className="text-[15px] font-black tracking-tight" style={{ color: CHERRY.pink }}>
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
                    onSelect={url => { send({ kind: 'gif', gifUrl: url, body: t('cherry.previewGif', 'GIF') }); setGifPicking(false); }}
                    onClose={() => setGifPicking(false)}
                />
            )}

            {panel === 'voice' && (
                <VoicePanel
                    onSend={(dur, url, wave) => send({ kind: 'voice', duration: dur, body: t('cherry.previewVoice', '🎤 Voice message'), audioUrl: url, waveform: wave })}
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
                    title={t('cherry.payRequest', 'Pay Request')}
                    message={t('cherry.payAmountTo', 'Pay ${amount} to {name}?', { amount: pendingPay.amount, name })}
                    cancelLabel={t('cherry.cancel', 'Cancel')}
                    confirmLabel={t('cherry.pay', 'Pay')}
                    onCancel={() => setPendingPay(null)}
                    onConfirm={() => { onPayRequest(pendingPay.id, pendingPay.amount); setPendingPay(null); }}
                />
            )}

            {confirmLocation && (
                <AlertDialog
                    title={t('cherry.shareLocation', 'Share Location')}
                    message={t('cherry.shareLocationWith', 'Share your current location with {name}?', { name })}
                    cancelLabel={t('cherry.cancel', 'Cancel')}
                    confirmLabel={t('cherry.share', 'Share')}
                    onCancel={() => setConfirmLocation(false)}
                    onConfirm={async () => {
                        setConfirmLocation(false);
                        const draft: MessageDraft = { kind: 'location', body: t('cherry.currentLocation', 'Current Location') };
                        if (isFiveM) {
                            try {
                                const r = await apiData<{ x: number; y: number }>('sd-phone:maps:here');
                                if (r) {
                                    draft.wpCode = encodeWaypoint({ label: t('cherry.sharedLocation', 'Shared Location'), x: r.x, y: r.y, icon: 'MapPin', color: '#eb4b3c' });
                                    draft.wpSub  = `${Math.round(r.x)}, ${Math.round(r.y)}`;
                                }
                            } catch { /* fall back to a coordless share */ }
                        }
                        send(draft);
                    }}
                />
            )}

            {locSheet && (
                <ActionSheet
                    actions={[
                        { label: t('cherry.openInMaps', 'Open in Maps'), onClick: () => openInMaps(locSheet) },
                        { label: t('cherry.setWaypoint', 'Set Waypoint'), onClick: () => setWaypointFor(locSheet) },
                    ]}
                    onClose={() => setLocSheet(null)}
                />
            )}

            {showProfile && (
                <PartnerProfile
                    partner={match.partner}
                    onClose={() => setShowProfile(false)}
                    onUnmatch={onUnmatch}
                    onBlock={onBlock}
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
                        {savedPreview ? t('cherry.savedToGallery', 'Saved to Gallery') : t('cherry.saveToGallery', 'Save to Gallery')}
                    </button>
                </div>
            )}
        </div>
    );
}

function PartnerProfile({ partner, onClose, onUnmatch, onBlock }: {
    partner:   MatchPartner;
    onClose:   () => void;
    onUnmatch: () => void;
    onBlock:   () => void;
}) {
    const [exiting, setExiting] = useState(false);
    const [photoIdx, setPhotoIdx] = useState(0);
    const [confirming, setConfirming] = useState<null | 'unmatch' | 'block'>(null);
    const photos = partner.photos?.length ? partner.photos : (partner.photo ? [partner.photo] : []);

    function close() {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(onClose, 280);
    }

    const sheet = (
        <div
            className="absolute inset-0 z-[65] flex flex-col bg-[#e5e5e5]"
            style={{
                animation: exiting
                    ? 'ios-sheet-down 0.28s cubic-bezier(0.32,0,0.68,1) forwards'
                    : 'ios-sheet-up 0.32s cubic-bezier(0.32,0.72,0,1)',
                willChange: 'transform',
            }}
        >
            <div className="relative h-[58%] w-full shrink-0 overflow-hidden bg-black">
                {photos.length > 0 ? (
                    photos.map((src, i) => (
                        <img
                            key={`${src}-${i}`}
                            src={src}
                            alt={i === photoIdx ? partner.name : ''}
                            draggable={false}
                            className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
                            style={{
                                opacity: i === photoIdx ? 1 : 0,
                                transform: 'translateZ(0)',
                                willChange: 'opacity',
                                backfaceVisibility: 'hidden',
                            }}
                        />
                    ))
                ) : (
                    <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(165deg, ${CHERRY.pink}, #C81E5A)` }}>
                        <span className="text-[96px] font-extrabold text-white/90">{partner.name.slice(0, 1).toUpperCase()}</span>
                    </div>
                )}

                {photoIdx > 0 && (
                    <button
                        type="button"
                        aria-label={t('cherry.previousPhoto', 'Previous photo')}
                        onClick={() => setPhotoIdx(i => Math.max(0, i - 1))}
                        className="absolute left-3 top-1/2 z-10 flex h-[42px] w-[42px] -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur active:opacity-70"
                    >
                        <ChevronLeft className="-ml-0.5 h-[26px] w-[26px]" strokeWidth={2.6} />
                    </button>
                )}
                {photoIdx < photos.length - 1 && (
                    <button
                        type="button"
                        aria-label={t('cherry.nextPhoto', 'Next photo')}
                        onClick={() => setPhotoIdx(i => Math.min(photos.length - 1, i + 1))}
                        className="absolute right-3 top-1/2 z-10 flex h-[42px] w-[42px] -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur active:opacity-70"
                    >
                        <ChevronRight className="-mr-0.5 h-[26px] w-[26px]" strokeWidth={2.6} />
                    </button>
                )}

                <button
                    type="button"
                    onClick={close}
                    aria-label={t('cherry.closeProfile', 'Close profile')}
                    className="absolute right-4 top-[60px] z-10 flex h-[34px] w-[34px] items-center justify-center rounded-full bg-black/45 text-white backdrop-blur active:opacity-70"
                >
                    <X className="h-[19px] w-[19px]" strokeWidth={2.6} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-6 pt-5">
                <p className="flex items-center leading-tight">
                    <span className="text-[30px] font-bold text-black">{partner.name},</span>
                    <span className="ml-2 text-[25px] font-medium text-black/80">{partner.age}</span>
                    <span className="ml-2.5"><GenderBadge gender={partner.gender} /></span>
                </p>
                <div className="mt-4 h-px bg-black/10" />
                <p className="mt-4 text-[20px] font-bold text-black">{t('cherry.aboutMe', 'About Me')}</p>
                <p className="mt-1.5 text-[18px] leading-snug text-black/80">
                    {partner.about?.trim() || t('cherry.noAbout', "They haven't written anything about themselves yet.")}
                </p>

                <button
                    type="button"
                    onClick={() => setConfirming('unmatch')}
                    className="mt-7 w-full rounded-[12px] bg-black/[0.06] py-3.5 text-[17px] font-semibold text-black active:opacity-80"
                >
                    {t('cherry.unmatch', 'Unmatch')}
                </button>
                <button
                    type="button"
                    onClick={() => setConfirming('block')}
                    className="mb-8 mt-3 w-full rounded-[12px] py-3.5 text-[17px] font-semibold text-white active:opacity-80"
                    style={{ background: '#FF3B30' }}
                >
                    {t('cherry.blockName', 'Block {name}', { name: partner.name })}
                </button>
            </div>

            {confirming === 'unmatch' && (
                <AlertDialog
                    title={t('cherry.unmatchName', 'Unmatch {name}?', { name: partner.name })}
                    message={t('cherry.unmatchMessage', 'Your conversation will be deleted for both of you. You might see each other in the deck again.')}
                    cancelLabel={t('cherry.cancel', 'Cancel')}
                    confirmLabel={t('cherry.unmatch', 'Unmatch')}
                    destructive
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => { setConfirming(null); onUnmatch(); }}
                />
            )}
            {confirming === 'block' && (
                <AlertDialog
                    title={t('cherry.blockNameTitle', 'Block {name}?', { name: partner.name })}
                    message={t('cherry.blockMessage', "The match and conversation will be removed, and you won't see each other on Cherry again.")}
                    cancelLabel={t('cherry.cancel', 'Cancel')}
                    confirmLabel={t('cherry.block', 'Block')}
                    destructive
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => { setConfirming(null); onBlock(); }}
                />
            )}
        </div>
    );

    return portalToPhoneScreen(sheet);
}
