import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ChevronLeft, MapPin, Mic, Phone, UserPlus, Video, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { t } from '@/i18n';
import { useTheme } from '@/stores/themeStore';
import { useSessionState } from '@/hooks/useSessionState';
import { fetchNui, isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';
import { requestOpenMaps } from '@/shell/deeplink';
import { AlertDialog } from '@/ui/AlertDialog';
import { ActionSheet } from '@/ui/ActionSheet';
import { ImageLightbox } from '@/ui/ImageLightbox';
import { PhotosIcon } from '@/shell/AppIconSVG';
import { mapsConfig } from '@/apps/maps/config';
import { decodeWaypoint, encodeWaypoint } from '@/lib/waypointCode';
import { dialCall } from '@/apps/phone/callsApi';
import { fmtChatSeparator, type Contact, type Conversation, type Message } from './data';
import { takeSharedMessages } from './sharedInbox';
import { ContactAvatar, GroupAvatar } from '@/shared/ContactAvatar';
import { MessageBubble } from './MessageBubble';
import { useAutoScrollToEnd } from './useAutoScrollToEnd';
import { useTapbackDismiss } from './useTapbackDismiss';
import { EmojiPanel }    from './EmojiPanel';
import { GifPickerSheet } from './GifPickerSheet';
import { warmGifCategories } from './gifsApi';
import { MoneyPanel }    from './MoneyPanel';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { warmPhotos, apiSavePhotoFromUrl } from '@/core/photosApi';
import { VoicePanel }    from './VoicePanel';
import { AddMemberSheet } from './AddMemberSheet';
import { EditGroupSheet } from './EditGroupSheet';
import { AddContact } from '@/apps/phone/contacts/AddContact';
import type { Contact as PhoneContact } from '@/apps/phone/data';

type Panel = 'emoji' | 'photos' | 'gif' | 'money' | 'location' | 'voice' | null;

export type MessageDraft = {
    body:      string;
    kind:      Message['kind'];
    gifUrl?:   string;
    amount?:   number;
    duration?: number;
    wpCode?:   string;
    wpSub?:    string;
    replyTo?:  { name: string; body: string };
    requested?: boolean;
    audioUrl?: string;
    waveform?: number[];
};

interface ChatViewProps {
    conv:        Conversation;
    totalUnread: number;
    contacts:    Contact[];
    myNumber:    string;
    onBack:      () => void;
    onSend:      (draft: MessageDraft) => void;
    onReact:     (messageId: string, emoji: string) => void;
    onPayRequest:(messageId: string, amount: number) => void;
    onLocationRespond:(messageId: string, accept: boolean) => void;
    onAddMembers:(members: Contact[]) => void;
    onUpdateGroup:(name: string, avatar?: string) => void;
    onRemoveMember:(member: Contact) => void;
    onSaveContact?:(c: PhoneContact) => Promise<string | null>;
    animateIn?:   boolean;
}

interface LocShareStatus {
    id?:        string;
    exists?:    boolean;
    pending?:   boolean;
    youShare?:  boolean;
    theyShare?: boolean;
}

export function ChatView({ conv, totalUnread, contacts, myNumber, onBack, onSend, onReact, onPayRequest, onLocationRespond, onAddMembers, onUpdateGroup, onRemoveMember, onSaveContact, animateIn = true }: ChatViewProps) {
    const { theme } = useTheme('theme');
    const isDark    = theme === 'dark';

    const ACTION_BTNS: { id: Panel & string; label: string; emoji?: string; Icon?: LucideIcon }[] = [
        { id: 'emoji',    label: t('messages.emoji', 'Emoji'),       emoji: '😊' },
        { id: 'photos',   label: t('messages.photos', 'Photos') },   // rendered with the Photos app icon
        { id: 'gif',      label: t('messages.gif', 'GIF') },
        { id: 'money',    label: t('messages.money', 'Money'),       emoji: '$' },
        { id: 'location', label: t('messages.location', 'Location'), Icon: MapPin },   // GPS map marker
        { id: 'voice',    label: t('messages.voice', 'Voice'),       Icon: Mic },      // classic mic
    ];

    const messages = useMemo<Message[]>(() => {
        const shared = takeSharedMessages(conv.id);
        if (shared.length === 0) return conv.messages;
        const seen = new Set(conv.messages.map(m => m.id));
        const extra = shared.filter(m => !seen.has(m.id));
        return [...conv.messages, ...extra].sort((a, b) => a.ts - b.ts);
    }, [conv.messages, conv.id]);

    const [draft,    setDraft]    = useSessionState(`messages:draft:${conv.id}`, '');
    const [panel,    setPanel]    = useState<Panel>(null);
    const [closing,  setClosing]  = useState(false);
    const [pickerId, setPickerId] = useState<string | null>(null);
    const [replyTo,  setReplyTo]  = useState<Message | null>(null);
    const [picking,    setPicking]    = useState(false);
    const [gifPicking, setGifPicking] = useState(false);
    const [attachments, setAttachments] = useState<string[]>([]);
    const [pendingPay, setPendingPay] = useState<{ id: string; amount: number } | null>(null);
    const [confirmLocation, setConfirmLocation] = useState(false);
    const [locSheet, setLocSheet] = useState<Message | null>(null);
    const [locShare, setLocShare] = useState<LocShareStatus | null>(null);
    const [confirmLiveShare, setConfirmLiveShare] = useState<LocShareStatus | null>(null);
    const [callConfirm, setCallConfirm] = useState<null | 'voice' | 'video'>(null);
    const [dialError, setDialError] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [savedPreview, setSavedPreview] = useState(false);
    const [addingMembers, setAddingMembers] = useState(false);
    const [editingGroup, setEditingGroup] = useState(false);
    const [addingContact, setAddingContact] = useState(false);
    const listRef   = useRef<HTMLDivElement>(null);
    const inputRef  = useRef<HTMLInputElement>(null);

    useTapbackDismiss(pickerId, setPickerId);

    useEffect(() => { warmGifCategories(); warmPhotos(); }, []);

    useAutoScrollToEnd(listRef, messages.length, panel !== 'money' && panel !== 'voice' && panel !== 'emoji');

    function togglePanel(p: Panel) {
        setPanel(prev => prev === p ? null : p);
        inputRef.current?.blur();
    }

    function openPhotos() {
        setPicking(true);
        setPanel(null);
        inputRef.current?.blur();
    }

    function openGif() {
        setGifPicking(true);
        setPanel(null);
        inputRef.current?.blur();
    }

    async function openShareLocation() {
        setPanel(null);
        inputRef.current?.blur();
        if (conv.groupName || !(await mapsConfig()).people) { setConfirmLocation(true); return; }

        let status: LocShareStatus = {};
        if (isFiveM) {
            status = (await apiData<LocShareStatus>('sd-phone:friends:status', { phone: conv.id })) ?? {};
        }
        setLocShare(status);
    }

    function startLiveShare(status: LocShareStatus) {
        if (!isFiveM) {
            onSend({ kind: 'locrequest', body: t('messages.locationSharingRequestBody', 'Location sharing request'), requested: true });
            return;
        }
        if (status.exists && status.id) {
            void fetchNui('sd-phone:friends:share', { id: status.id, enabled: true });
        } else {
            void fetchNui('sd-phone:friends:add', { phone: conv.id });
        }
    }

    function cancelLiveRequest(status: LocShareStatus) {
        if (isFiveM && status.id) void fetchNui('sd-phone:friends:remove', { id: status.id });
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
        if (m.from === 'me') return t('messages.you', 'You');
        return conv.participants.find(p => p.id === m.from)?.name ?? t('messages.unknown', 'Unknown');
    }

    function msgPreview(m: Message): string {
        if (m.kind === 'image')      return t('messages.photoPreview', '📷 Photo');
        if (m.kind === 'gif')        return t('messages.gif', 'GIF');
        if (m.kind === 'money')      return `$${m.amount}`;
        if (m.kind === 'voice')      return t('messages.voiceMessagePreview', '🎤 Voice message');
        if (m.kind === 'location')   return t('messages.locationPreview', '📍 Location');
        if (m.kind === 'locrequest') return t('messages.locationRequestPreview', '📍 Location sharing request');
        return m.body;
    }

    const openPicker = useCallback((id: string) => setPickerId(id), []);
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

    function send(d: MessageDraft) {
        onSend(replyTo ? { ...d, replyTo: { name: replyName(replyTo), body: msgPreview(replyTo) } } : d);
        setReplyTo(null);
        setPanel(null);
        inputRef.current?.focus();
    }

    function sendText() {
        const text = draft.trim();
        if (!text && attachments.length === 0) return;
        attachments.forEach(url => send({ kind: 'image', gifUrl: url, body: t('messages.photoPreview', '📷 Photo') }));
        if (text) send({ body: text, kind: 'text' });
        setDraft('');
        setAttachments([]);
    }

    function removeAttachment(idx: number) {
        setAttachments(prev => prev.filter((_, i) => i !== idx));
    }

    function handleKey(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
    }

    const name = conv.groupName ?? conv.participants[0]?.name ?? t('messages.unknown', 'Unknown');

    // For a 1:1 thread with a number that isn't saved yet, offer to add it as a contact.
    const soloNumber = !conv.groupName
        ? (conv.participants[0]?.phone ?? conv.participants[0]?.id ?? '').replace(/\D/g, '')
        : '';
    const isKnownNumber = !soloNumber || contacts.some(c => (c.phone ?? '').replace(/\D/g, '') === soloNumber);
    const canAddContact = !!onSaveContact && !!soloNumber && !isKnownNumber;

    interface RenderMsg { kind: 'msg'; msg: Message; isLast: boolean; contact?: Contact }
    interface RenderSep { kind: 'separator'; ts: number }
    type RenderItem = RenderMsg | RenderSep;

    const items = useMemo<RenderItem[]>(() => {
        const out: RenderItem[] = [];
        messages.forEach((msg, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            if (!prev || msg.ts - prev.ts > 5 * 60_000) {
                out.push({ kind: 'separator', ts: msg.ts });
            }
            const isLast  = !next || next.from !== msg.from || next.ts - msg.ts > 60_000;
            const contact = conv.participants.find(p => p.id === msg.from);
            out.push({ kind: 'msg', msg, isLast, contact });
        });
        return out;
    }, [messages, conv.participants]);

    const lastSent = useMemo(() => [...messages].reverse().find(m => m.from === 'me'), [messages]);

    const receivedBg    = isDark ? '#262628' : '#c6c6c6';
    const sentBg        = '#0977e5';
    const actionBarBg   = isDark ? 'rgb(var(--surface))' : '#d4d4d4';
    const composerBdr   = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    const actionBtnBg   = isDark ? 'rgb(var(--elevated))' : '#fff';

    return (
        <div
            className="absolute inset-0 z-20 flex flex-col bg-[#e5e5e5] dark:bg-base text-black dark:text-white overflow-hidden"
            style={{
                animation: closing
                    ? 'ios-pop 0.32s cubic-bezier(0.32,0.72,0,1) forwards'
                    : animateIn ? 'ios-push 0.32s cubic-bezier(0.32,0.72,0,1)' : undefined,
                willChange: 'transform',
            }}
            onAnimationEnd={(e) => {
                if (e.target === e.currentTarget && closing) onBack();
            }}
        >
            <div className="shrink-0" style={{ paddingTop: 64 }}>
                <div className="flex items-center px-2 pb-2.5">
                    <div className="flex flex-1 items-center">
                        <button
                            type="button"
                            onClick={() => setClosing(true)}
                            className="flex items-center text-[#007AFF] active:opacity-60"
                        >
                            <ChevronLeft className="h-[38px] w-[38px]" strokeWidth={2.4} />
                            {totalUnread > 0 && (
                                <span className="-ml-0.5 flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[#007AFF] px-1 text-[14px] font-semibold leading-none text-white">
                                    {totalUnread}
                                </span>
                            )}
                        </button>
                    </div>

                    {conv.groupName && conv.groupOwner ? (
                        <button
                            type="button"
                            onClick={() => setEditingGroup(true)}
                            aria-label={t('messages.editGroupAria', 'Edit group')}
                            className="flex flex-col items-center gap-1.5 active:opacity-60"
                        >
                            <GroupAvatar contacts={conv.participants} size={72} avatar={conv.groupAvatar} />
                            <span className="text-[19px] font-semibold leading-none text-black dark:text-white">{name}</span>
                        </button>
                    ) : canAddContact ? (
                        <button
                            type="button"
                            onClick={() => { setPanel(null); inputRef.current?.blur(); setAddingContact(true); }}
                            aria-label={t('messages.addContact', 'Add Contact')}
                            className="flex flex-col items-center gap-1 active:opacity-60"
                        >
                            <ContactAvatar contact={conv.participants[0]} size={72} />
                            <span className="text-[19px] font-semibold leading-none text-black dark:text-white">{name}</span>
                            <span className="text-[13px] font-medium leading-none text-[#007AFF]">{t('messages.addContact', 'Add Contact')}</span>
                        </button>
                    ) : (
                        <div className="flex flex-col items-center gap-1.5">
                            {conv.groupName
                                ? <GroupAvatar contacts={conv.participants} size={72} avatar={conv.groupAvatar} />
                                : <ContactAvatar contact={conv.participants[0]} size={72} />
                            }
                            <span className="text-[19px] font-semibold leading-none text-black dark:text-white">{name}</span>
                        </div>
                    )}

                    <div className="flex flex-1 items-center justify-end gap-[18px] pr-1.5">
                        {!conv.groupName && (
                            <>
                                <button type="button" onClick={() => setCallConfirm('voice')} className="text-[#007AFF] active:opacity-60">
                                    <Phone className="h-[28px] w-[28px]" strokeWidth={2} />
                                </button>
                                <button type="button" onClick={() => setCallConfirm('video')} className="text-[#007AFF] active:opacity-60">
                                    <Video className="h-[28px] w-[28px]" strokeWidth={2} />
                                </button>
                            </>
                        )}
                        {conv.groupName && (
                            <button type="button" onClick={() => setAddingMembers(true)} aria-label={t('messages.addPeopleAria', 'Add people')} className="text-[#007AFF] active:opacity-60">
                                <UserPlus className="h-[27px] w-[27px]" strokeWidth={2} />
                            </button>
                        )}
                    </div>
                </div>
                <div className="mx-[6%] h-[0.5px] bg-black/15 dark:bg-white/15" />
            </div>

            <div ref={listRef} className="imsg-list min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 py-2">
                {items.map((item, i) => {
                    if (item.kind === 'separator') {
                        const { lead, time } = fmtChatSeparator(item.ts);
                        return (
                            <div key={`sep-${i}`} className="flex justify-center pb-3 pt-4">
                                <span className="text-[13px] tracking-wide text-black/40 dark:text-white/40">
                                    <span className="font-semibold text-black/55 dark:text-white/55">{lead}</span> {time}
                                </span>
                            </div>
                        );
                    }
                    const { msg, isLast, contact } = item;
                    const sent    = msg.from === 'me';

                    return (
                        <div
                            key={msg.id}
                            className={`flex items-end ${isLast ? 'mb-3' : 'mb-[2px]'} ${sent ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`flex flex-col ${sent ? 'items-end' : 'items-start'} ${sent ? 'max-w-[78%]' : 'max-w-[80%]'}`}>
                                {conv.groupName && !sent && (() => {
                                    const prev = items[i - 1];
                                    const showName = !prev || prev.kind === 'separator' ||
                                        (prev.kind === 'msg' && prev.msg.from !== msg.from);
                                    return showName ? (
                                        <span className="mb-0.5 ml-1 text-[15px] font-semibold"
                                            style={{ color: contact?.color ?? '#888' }}>
                                            {contact?.name.split(' ')[0]}
                                        </span>
                                    ) : null;
                                })()}

                                <MessageBubble
                                    msg={msg}
                                    sent={sent}
                                    isLast={isLast}
                                    isDark={isDark}
                                    receivedBg={receivedBg}
                                    sentBg={sentBg}
                                    pickerOpen={pickerId === msg.id}
                                    onOpenPicker={openPicker}
                                    onReact={onReact}
                                    onReply={handleReply}
                                    onPay={handlePay}
                                    onLocationTap={handleLocationTap}
                                    onLocationRespond={onLocationRespond}
                                    onImageTap={handleImageTap}
                                    locationCaption={msg.kind === 'location'
                                        ? (sent
                                            ? t('messages.youSharedLocationWith', 'You shared your location with {name}', { name })
                                            : t('messages.contactSharedLocation', '{name} shared their location', { name: contact?.name ?? t('messages.someone', 'Someone') }))
                                        : msg.kind === 'locrequest'
                                            ? (sent
                                                ? t('messages.youAskedToShareLocations', 'You asked {name} to share locations', { name })
                                                : t('messages.wantsToShareLocations', '{name} wants to share locations with you', { name }))
                                            : undefined}
                                />

                                {sent && isLast && msg === lastSent && msg.kind === 'text' && (
                                    <span className="mt-1 mr-1 text-[11px] text-black/45 dark:text-white/45">{t('messages.delivered', 'Delivered')}</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="relative shrink-0">
                {panel === 'emoji' && (
                    <div className="absolute inset-x-0 bottom-full z-20">
                        <EmojiPanel isDark={isDark} onSelect={e => setDraft(d => d + e)} />
                    </div>
                )}

                {replyTo && (
                    <div className="flex items-center gap-2 px-4 pt-2 pb-1">
                        <div className="w-[3px] self-stretch rounded-full bg-[#007AFF]" />
                        <div className="min-w-0 flex-1">
                            <div className="text-[12px] font-semibold text-[#007AFF]">{t('messages.replyTo', 'Reply to {name}', { name: replyName(replyTo) })}</div>
                            <div className="truncate text-[13px] text-black/55 dark:text-white/55">{msgPreview(replyTo)}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setReplyTo(null)}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-black/10 dark:bg-white/15 active:opacity-60"
                        >
                            <X className="h-[14px] w-[14px] text-black/55 dark:text-white/55" strokeWidth={2.5} />
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
                                    onClick={() => removeAttachment(i)}
                                    aria-label={t('messages.removeImageAria', 'Remove image')}
                                    className="absolute right-1 top-1 flex h-[20px] w-[20px] items-center justify-center rounded-full bg-black/55 active:opacity-70"
                                >
                                    <X className="h-[12px] w-[12px] text-white" strokeWidth={2.75} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="px-3 pb-2 pt-1.5">
                    <div
                        className={`flex items-center gap-1 rounded-[22px] bg-[#d4d4d4] py-[9px] pl-4 dark:bg-surface ${draft.trim() || attachments.length ? 'pr-[5px]' : 'pr-4'}`}
                    >
                        <input
                            ref={inputRef}
                            type="text"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={handleKey}
                            onFocus={() => setPanel(null)}
                            placeholder={t('messages.textMessagePlaceholder', 'Text Message')}
                            className="min-w-0 flex-1 bg-transparent py-[5px] text-[18px] text-black dark:text-white placeholder-black/35 dark:placeholder-white/35 outline-none"
                        />
                        {(draft.trim() || attachments.length > 0) && (
                            <button
                                type="button"
                                onClick={sendText}
                                className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-full bg-[#007AFF] active:opacity-70"
                            >
                                <ArrowUp className="h-[19px] w-[19px] text-white" strokeWidth={2.75} />
                            </button>
                        )}
                    </div>
                </div>

                <div
                    className="flex items-center justify-around px-4 pb-11 pt-2.5"
                    style={{ background: actionBarBg, borderTop: `0.5px solid ${composerBdr}` }}
                >
                    {ACTION_BTNS.filter(btn => btn.id !== 'money' || !conv.groupName).map(btn => {
                        const Icon = btn.Icon;
                        return (
                            <button
                                key={btn.id}
                                type="button"
                                onClick={() => (btn.id === 'photos' ? openPhotos() : btn.id === 'gif' ? openGif() : btn.id === 'location' ? openShareLocation() : togglePanel(btn.id as Panel))}
                                className="flex h-[48px] w-[54px] items-center justify-center rounded-[16px] transition-opacity active:opacity-60"
                                style={{ background: actionBtnBg, boxShadow: '0 1px 3px rgba(0,0,0,0.12)' }}
                            >
                                {btn.id === 'photos' ? (
                                    <span
                                        className="block overflow-hidden rounded-[7px] [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                                        style={{ width: 30, height: 30 }}
                                    >
                                        <PhotosIcon />
                                    </span>
                                ) : Icon ? (
                                    <Icon
                                        className={`text-black dark:text-white ${btn.id === 'location' ? 'h-[27px] w-[27px]' : 'h-[25px] w-[25px]'}`}
                                        strokeWidth={2}
                                    />
                                ) : btn.emoji ? (
                                    <span className="text-[23px] leading-none">{btn.emoji}</span>
                                ) : (
                                    <span className="text-[15px] font-black tracking-tight text-[#007AFF]">
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
                    onSelect={url => { send({ kind: 'gif', gifUrl: url, body: t('messages.gif', 'GIF') }); setGifPicking(false); }}
                    onClose={() => setGifPicking(false)}
                />
            )}

            {panel === 'voice' && (
                <VoicePanel
                    onSend={(dur, url, wave) => send({ kind: 'voice', duration: dur, body: t('messages.voiceMessagePreview', '🎤 Voice message'), audioUrl: url, waveform: wave })}
                    onClose={() => setPanel(null)}
                />
            )}

            {panel === 'money' && (
                <MoneyPanel
                    isDark={isDark}
                    peerName={name}
                    onSend={amt => onSend({ kind: 'money', amount: amt, body: `$${amt}` })}
                    onRequest={amt => onSend({ kind: 'money', amount: amt, body: `$${amt}`, requested: true })}
                    onClose={() => setPanel(null)}
                />
            )}

            {pendingPay && (
                <AlertDialog
                    title={t('messages.payRequestTitle', 'Pay Request')}
                    message={t('messages.payRequestMessage', 'Pay ${amount} to {name}?', { amount: pendingPay.amount, name })}
                    cancelLabel={t('common.cancel', 'Cancel')}
                    confirmLabel={t('messages.pay', 'Pay')}
                    onCancel={() => setPendingPay(null)}
                    onConfirm={() => { onPayRequest(pendingPay.id, pendingPay.amount); setPendingPay(null); }}
                />
            )}

            {confirmLocation && (
                <AlertDialog
                    title={t('messages.shareLocationTitle', 'Share Location')}
                    message={t('messages.shareLocationConfirm', 'Are you sure you want to share your location?')}
                    cancelLabel={t('common.cancel', 'Cancel')}
                    confirmLabel={t('messages.share', 'Share')}
                    onCancel={() => setConfirmLocation(false)}
                    onConfirm={async () => {
                        setConfirmLocation(false);
                        const draft: MessageDraft = { kind: 'location', body: t('messages.currentLocationBody', 'Current Location') };
                        if (isFiveM) {
                            try {
                                const r = await apiData<{ x: number; y: number }>('sd-phone:maps:here');
                                if (r) {
                                    draft.wpCode = encodeWaypoint({ label: t('messages.sharedLocationLabel', 'Shared Location'), x: r.x, y: r.y, icon: 'MapPin', color: '#eb4b3c' });
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
                        { label: t('messages.openInMaps', 'Open in Maps'), onClick: () => openInMaps(locSheet) },
                        { label: t('messages.setWaypoint', 'Set Waypoint'), onClick: () => setWaypointFor(locSheet) },
                    ]}
                    onClose={() => setLocSheet(null)}
                />
            )}

            {locShare && (
                <ActionSheet
                    actions={[
                        { label: t('messages.sendCurrentLocation', 'Send Current Location'), onClick: () => setConfirmLocation(true) },
                        locShare.pending
                            ? { label: t('messages.cancelLocationRequest', 'Cancel Location Request'), destructive: true, onClick: () => cancelLiveRequest(locShare) }
                            : locShare.youShare
                                ? { label: t('messages.sharingLiveLocation', 'Sharing Live Location'), disabled: true, onClick: () => {} }
                                : { label: t('messages.shareLiveLocation', 'Share Live Location'), onClick: () => setConfirmLiveShare(locShare) },
                    ]}
                    onClose={() => setLocShare(null)}
                />
            )}

            {confirmLiveShare && (
                <AlertDialog
                    title={t('messages.shareLiveLocation', 'Share Live Location')}
                    message={confirmLiveShare.exists
                        ? t('messages.liveShareExistingMsg', '{name} will see your live location on the map. You can turn this off anytime in the Maps app.', { name })
                        : t('messages.liveShareRequestMsg', "{name} will get a request, and you'll share live locations once they accept. You can turn this off anytime in the Maps app.", { name })}
                    cancelLabel={t('common.cancel', 'Cancel')}
                    confirmLabel={confirmLiveShare.exists ? t('messages.share', 'Share') : t('messages.sendRequest', 'Send Request')}
                    onCancel={() => setConfirmLiveShare(null)}
                    onConfirm={() => { startLiveShare(confirmLiveShare); setConfirmLiveShare(null); }}
                />
            )}

            {callConfirm && (
                <AlertDialog
                    title={callConfirm === 'video' ? t('messages.videoCall', 'Video Call') : t('messages.call', 'Call')}
                    message={callConfirm === 'video'
                        ? t('messages.confirmVideoCall', 'Are you sure you want to video call {name}?', { name })
                        : t('messages.confirmCall', 'Are you sure you want to call {name}?', { name })}
                    cancelLabel={t('common.cancel', 'Cancel')}
                    confirmLabel={callConfirm === 'video' ? t('messages.videoCall', 'Video Call') : t('messages.call', 'Call')}
                    onCancel={() => setCallConfirm(null)}
                    onConfirm={() => {
                        const num = conv.participants[0]?.phone ?? conv.participants[0]?.id;
                        setCallConfirm(null);
                        if (!num) return;
                        void dialCall(num, name).then(res => {
                            if (!res.success) setDialError(res.message ?? t('messages.unableToPlaceCall', 'Unable to place call'));
                        });
                    }}
                />
            )}

            {dialError !== null && (
                <AlertDialog
                    title={t('messages.callFailed', 'Call Failed')}
                    message={dialError}
                    confirmLabel={t('common.ok', 'OK')}
                    hideCancel
                    onCancel={() => setDialError(null)}
                    onConfirm={() => setDialError(null)}
                />
            )}

            {preview && (
                <ImageLightbox
                    src={preview}
                    onClose={() => setPreview(null)}
                    action={{
                        label: savedPreview ? t('messages.savedToGallery', 'Saved to Gallery') : t('messages.saveToGallery', 'Save to Gallery'),
                        onClick: () => { if (!savedPreview) { void apiSavePhotoFromUrl(preview); setSavedPreview(true); } },
                    }}
                />
            )}

            {addingMembers && conv.groupName && (
                <AddMemberSheet
                    groupName={conv.groupName}
                    contacts={contacts}
                    existing={conv.participants}
                    myNumber={myNumber}
                    onCancel={() => setAddingMembers(false)}
                    onAdd={members => { onAddMembers(members); setAddingMembers(false); }}
                />
            )}

            {editingGroup && conv.groupName && (
                <EditGroupSheet
                    groupName={conv.groupName}
                    groupAvatar={conv.groupAvatar}
                    participants={conv.participants}
                    onCancel={() => setEditingGroup(false)}
                    onSave={(name, avatar) => { onUpdateGroup(name, avatar); setEditingGroup(false); }}
                    onRemoveMember={onRemoveMember}
                />
            )}

            {addingContact && onSaveContact && (
                <div className="absolute inset-0 z-30">
                    <AddContact
                        initialPhone={soloNumber}
                        onCancel={() => setAddingContact(false)}
                        onSave={onSaveContact}
                    />
                </div>
            )}
        </div>
    );
}
