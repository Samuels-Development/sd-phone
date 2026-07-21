import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Info, Users } from 'lucide-react';

import { fetchNui } from '@/core/nui';
import { t } from '@/i18n';
import { requestOpenMaps } from '@/shell/deeplink';
import { useIosPush } from '@/hooks/useIosPush';
import { hashColor } from '@/lib/format';
import { ActionSheet } from '@/ui/ActionSheet';
import { ImageLightbox } from '@/ui/ImageLightbox';
import { MessageBubble } from '@/shared/chat/MessageBubble';
import { useAutoScrollToEnd } from '@/shared/chat/useAutoScrollToEnd';
import { useTapbackDismiss } from '@/shared/chat/useTapbackDismiss';
import { decodeWaypoint } from '@/lib/waypointCode';
import { apiSavePhotoFromUrl } from '@/core/photosApi';
import { Composer } from './Composer';
import { RoomSettingsSheet } from './RoomSettingsSheet';
import { toBubbleMsg, type ChatMessage, type DarkChatDraft, type Room } from './data';

export function RoomView({ room, nickname, onBack, onSend, onReact, onLeave, onMemberRemoved, animateIn = true }: {
    room:     Room;
    nickname: string;
    onBack:   () => void;
    onSend:   (draft: DarkChatDraft) => void;
    onReact:  (messageId: string, emoji: string) => void;
    onLeave:  () => void;
    onMemberRemoved: () => void;
    animateIn?: boolean;
}) {
    const { goBack, pageStyle } = useIosPush(onBack, animateIn);
    const [pickerId, setPickerId] = useState<string | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [reply,    setReply]    = useState<ChatMessage | null>(null);
    const [preview,  setPreview]  = useState<string | null>(null);
    const [savedPreview, setSavedPreview] = useState(false);
    const [locSheet, setLocSheet] = useState<ChatMessage | null>(null);
    const listRef = useRef<HTMLDivElement>(null);

    useAutoScrollToEnd(listRef, room.messages.length);
    useTapbackDismiss(pickerId, setPickerId);

    const replyName    = (m: ChatMessage) => (m.mine ? t('darkchat.you', 'You') : m.author);
    const msgPreview    = (m: ChatMessage) => {
        switch (m.kind) {
            case 'image':    return t('darkchat.photoPreview', '📷 Photo');
            case 'gif':      return t('darkchat.gifPreview', 'GIF');
            case 'voice':    return t('darkchat.voicePreview', '🎤 Voice message');
            case 'location': return t('darkchat.locationPreview', '📍 Location');
            default:         return m.body;
        }
    };

    const bubbleMsgs = useMemo(() => room.messages.map(toBubbleMsg), [room.messages]);
    const openPicker = useCallback((id: string) => setPickerId(id), []);
    const handleReply = useCallback((id: string) => {
        const m = room.messages.find(x => x.id === id);
        if (!m) return;
        setReply(m);
        setPickerId(null);
    }, [room.messages]);
    const handlePay = useCallback(() => {}, []);
    const handleLocationTap = useCallback((id: string) => {
        const m = room.messages.find(x => x.id === id);
        if (m) setLocSheet(m);
    }, [room.messages]);
    const handleImageTap = useCallback((url: string) => { setPreview(url); setSavedPreview(false); }, []);

    function handleSend(draft: DarkChatDraft) {
        onSend(reply ? { ...draft, replyTo: { name: replyName(reply), body: msgPreview(reply) } } : draft);
        if (reply) setReply(null);
    }

    function openInMaps(m: ChatMessage) {
        const wp = m.wpCode ? decodeWaypoint(m.wpCode) : null;
        requestOpenMaps(wp ? { label: wp.label, x: wp.x, y: wp.y, icon: wp.icon, color: wp.color } : null);
    }
    function setWaypointFor(m: ChatMessage) {
        const wp = m.wpCode ? decodeWaypoint(m.wpCode) : null;
        void fetchNui('sd-phone:maps:waypoint', wp ? { x: wp.x, y: wp.y } : {});
    }

    return (
        <div
            className="absolute inset-0 z-20 flex flex-col bg-[#0b0b0c]"
            style={{ ...pageStyle, willChange: 'transform' }}
        >
            <div className="h-[58px] shrink-0" aria-hidden />

            <header className="relative flex shrink-0 items-center justify-between border-b border-white/10 px-3 pb-2.5 pt-[15px]">
                <button type="button" onClick={goBack} aria-label={t('darkchat.back', 'Back')} className="z-10 text-ios-blue active:opacity-60">
                    <ArrowLeft className="h-[26px] w-[26px]" strokeWidth={2.2} />
                </button>

                <div className="pointer-events-none absolute inset-x-0 flex flex-col items-center">
                    <span className="max-w-[58%] truncate text-[19px] font-semibold leading-tight text-white">{room.name}</span>
                    <span className="flex items-center gap-1 text-[13px] text-white/45">
                        <Users className="h-[12px] w-[12px]" strokeWidth={2.4} />
                        {room.isPrivate
                            ? <>{room.members} {room.members === 1 ? t('darkchat.member', 'member') : t('darkchat.members', 'members')} <span className="text-white/25">·</span> {t('darkchat.codeLabel', 'Code')} {room.code}</>
                            : <>{room.members} {t('darkchat.activeLabel', 'Active')}</>}
                    </span>
                </div>

                {room.isPrivate ? (
                    <button type="button" onClick={() => setSettingsOpen(true)} aria-label={t('darkchat.roomSettings', 'Room Settings')} className="z-10 text-ios-blue active:opacity-60">
                        <Info className="h-[25px] w-[25px]" strokeWidth={2.2} />
                    </button>
                ) : (
                    <div className="h-[26px] w-[26px] shrink-0" aria-hidden />
                )}
            </header>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                <div className="flex min-h-full flex-col justify-end px-3 py-3">
                    <p className="mb-3 text-center text-[12px] text-white/30">{t('darkchat.youJoinedAs', 'You joined as {nickname}', { nickname })}</p>
                    {room.messages.map((m, i) => {
                        const prev = room.messages[i - 1];
                        const next = room.messages[i + 1];
                        const isLast   = !next || next.author !== m.author || !!next.mine !== !!m.mine;
                        const showName = !m.mine && (!prev || prev.author !== m.author || !!prev.mine !== !!m.mine);

                        return (
                            <div key={m.id} className={`flex ${isLast ? 'mb-3' : 'mb-[2px]'} ${m.mine ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex flex-col ${m.mine ? 'max-w-[78%] items-end' : 'max-w-[80%] items-start'}`}>
                                    {showName && (
                                        <span className="mb-0.5 ml-1 text-[12px] font-semibold" style={{ color: authorColor(m.author) }}>
                                            {m.author}
                                        </span>
                                    )}

                                    <MessageBubble
                                        msg={bubbleMsgs[i]}
                                        sent={!!m.mine}
                                        isLast={isLast}
                                        isDark
                                        receivedBg="#262628"
                                        sentBg="#0977e5"
                                        pickerOpen={pickerId === m.id}
                                        onOpenPicker={openPicker}
                                        onReact={onReact}
                                        onReply={handleReply}
                                        onPay={handlePay}
                                        onLocationTap={handleLocationTap}
                                        onImageTap={handleImageTap}
                                        locationCaption={m.kind === 'location'
                                            ? (m.mine ? t('darkchat.youSharedLocation', 'You shared your location') : t('darkchat.authorSharedLocation', '{author} shared their location', { author: m.author }))
                                            : undefined}
                                    />

                                    {!m.mine && isLast && (
                                        <span className="ml-1 mt-1 text-[11px] text-white/30">{m.at}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <Composer
                onSend={handleSend}
                reply={reply ? { name: replyName(reply), body: msgPreview(reply) } : null}
                onCancelReply={() => setReply(null)}
            />

            {locSheet && (
                <ActionSheet
                    forceDark
                    actions={[
                        { label: t('darkchat.openInMaps', 'Open in Maps'), onClick: () => openInMaps(locSheet) },
                        { label: t('darkchat.setWaypoint', 'Set Waypoint'), onClick: () => setWaypointFor(locSheet) },
                    ]}
                    onClose={() => setLocSheet(null)}
                />
            )}

            {preview && (
                <ImageLightbox
                    src={preview}
                    onClose={() => setPreview(null)}
                    action={{
                        label: savedPreview ? t('darkchat.savedToGallery', 'Saved to Gallery') : t('darkchat.saveToGallery', 'Save to Gallery'),
                        onClick: () => { if (!savedPreview) { void apiSavePhotoFromUrl(preview); setSavedPreview(true); } },
                    }}
                />
            )}

            {settingsOpen && (
                <RoomSettingsSheet
                    room={room}
                    nickname={nickname}
                    onClose={() => setSettingsOpen(false)}
                    onLeave={onLeave}
                    onMemberRemoved={onMemberRemoved}
                />
            )}
        </div>
    );
}

const PALETTE = ['#5ac8fa', '#34c759', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a', '#ff453a'];
const authorColor = (name: string) => hashColor(name, PALETTE);
