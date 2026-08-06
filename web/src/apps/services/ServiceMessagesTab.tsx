import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MessageSquare } from 'lucide-react';

import { fetchNui } from '@/core/nui';
import { formatClockTime } from '@/lib/time';
import { requestOpenMaps } from '@/shell/deeplink';
import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useReanimateOnChange } from '@/hooks/useReanimateOnChange';
import { useSessionState } from '@/hooks/useSessionState';
import { useTheme } from '@/stores/themeStore';
import { ActionSheet } from '@/ui/ActionSheet';
import { ImageLightbox } from '@/ui/ImageLightbox';
import { EmptyState } from '@/ui/EmptyState';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { portalToPhoneScreen } from '@/ui/portal';
import { MessageBubble } from '@/shared/chat/MessageBubble';
import { useAutoScrollToEnd } from '@/shared/chat/useAutoScrollToEnd';
import type { Message } from '@/shared/chat/data';
import { formatPhone } from '@/apps/phone/data';
import { decodeWaypoint } from '@/lib/waypointCode';
import { apiSavePhotoFromUrl } from '@/core/photosApi';
import { ServiceAvatar } from './ServiceAvatar';
import { ServiceComposer } from './ServiceComposer';
import {
    messageCompany, replyCompany,
    type Inbox, type InboxMessage, type InboxThread, type ServiceDraft,
} from './servicesApi';

type Scope = 'personal' | 'job';

function clock(ts: number): string {
    return formatClockTime(new Date(ts), true);
}

export function ServiceMessagesTab({ inbox, loaded, onInboxChange, onMarkRead }: {
    inbox: Inbox;
    loaded: boolean;
    onInboxChange: (inbox: Inbox) => void;
    onMarkRead: (scope: Scope, key: string) => void;
}) {
    const [scopePref, setScope] = useSessionState<Scope>('services:msgFilter', 'personal');
    const [openKey, setOpenKey] = useState<string | null>(null);

    const scope: Scope = inbox.hasJob ? scopePref : 'personal';
    const threads = scope === 'personal' ? inbox.personal : inbox.job;

    const personalUnread = inbox.personal.some(t => (t.unread ?? 0) > 0);
    const jobUnread      = inbox.job.some(t => (t.unread ?? 0) > 0);

    const scopeRef = useReanimateOnChange<HTMLDivElement>('animate-swipe-in-left', scope);
    const openThread = openKey ? threads.find(t => t.key === openKey) ?? null : null;

    const openLen = openThread?.messages.length ?? 0;
    useEffect(() => {
        if (openKey) onMarkRead(scope, openKey);
    }, [openKey, openLen, scope, onMarkRead]);

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <h1 className="px-5 pb-2 pt-1 text-[34px] font-bold tracking-tight text-black dark:text-white">{t('services.messages', 'Messages')}</h1>

            {inbox.hasJob && (
                <div className="px-4 pb-3">
                    <SegmentedControl
                        value={scope}
                        onChange={setScope}
                        options={[
                            { value: 'personal', label: t('services.personal', 'Personal'), dot: personalUnread },
                            { value: 'job',      label: t('services.job', 'Job'),      dot: jobUnread },
                        ]}
                        className="mx-auto w-[232px]"
                    />
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
                <div ref={scopeRef}>
                    {!loaded ? null : threads.length === 0 ? (
                        <EmptyState icon={MessageSquare} title={t('services.noMessages', 'No Messages')} subtitle={t('services.noMessagesSubtitle', 'Messages with companies will appear here.')} />
                    ) : (
                        <div className="overflow-hidden rounded-[12px] bg-surface">
                            {threads.map((t, i) => (
                                <div key={t.key}>
                                    <ThreadRow thread={t} scope={scope} onOpen={() => setOpenKey(t.key)} />
                                    {i < threads.length - 1 && (
                                        <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {openThread && (
                <Conversation
                    key={openThread.key}
                    scope={scope}
                    thread={openThread}
                    onBack={() => setOpenKey(null)}
                    onSent={onInboxChange}
                />
            )}
        </div>
    );
}

function ThreadRow({ thread, scope, onOpen }: { thread: InboxThread; scope: Scope; onOpen: () => void }) {
    const title  = scope === 'job' ? formatPhone(thread.key) : thread.name;
    const unread = (thread.unread ?? 0) > 0;
    return (
        <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 px-4 py-4 text-left active:bg-black/5 dark:active:bg-white/5">
            <ServiceAvatar color={thread.color} emoji={thread.emoji} size={58} />

            <div className="min-w-0 flex-1">
                <div className="truncate text-[20px] font-semibold text-black dark:text-white">{title}</div>
                <div className={`mt-0.5 line-clamp-2 text-[17px] leading-snug ${unread ? 'font-semibold text-black dark:text-white' : 'font-medium text-black/90 dark:text-white/85'}`}>
                    {thread.preview}
                </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1.5 self-start pt-0.5">
                <span className="text-[15px] font-medium text-black/70 dark:text-white/60">{clock(thread.ts)}</span>
                {unread
                    ? <span className="h-[11px] w-[11px] rounded-full bg-ios-blue" aria-label={t('services.unread', 'Unread')} />
                    : <ChevronRight className="h-[18px] w-[18px] text-black/25 dark:text-white/25" strokeWidth={2.5} />}
            </div>
        </button>
    );
}

function toBubbleMsg(m: InboxMessage): Message {
    return {
        id:     m.id,
        from:   m.from === 'me' ? 'me' : 'them',
        body:   m.body,
        kind:   m.kind ?? 'text',
        ts:     m.ts,
        read:   true,
        gifUrl: m.mediaUrl,
        wpCode: m.wpCode,
        wpSub:  m.wpSub,
    };
}

function Conversation({ scope, thread, onBack, onSent }: {
    scope: Scope;
    thread: InboxThread;
    onBack: () => void;
    onSent: (inbox: Inbox) => void;
}) {
    const { theme } = useTheme('theme');
    const isDark = theme === 'dark';
    const [sending, setSending]   = useState(false);
    const [locSheet, setLocSheet] = useState<InboxMessage | null>(null);
    const [preview, setPreview]   = useState<string | null>(null);
    const [savedPreview, setSavedPreview] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const { goBack, pageStyle } = useIosPush(onBack);

    useAutoScrollToEnd(listRef, thread.messages.length);

    async function handleSend(draft: ServiceDraft) {
        if (sending) return;
        setSending(true);
        const updated = scope === 'personal'
            ? await messageCompany(thread.key, draft)
            : await replyCompany(thread.key, draft);
        setSending(false);
        if (updated) onSent(updated);
    }

    function openInMaps(m: InboxMessage) {
        const wp = m.wpCode ? decodeWaypoint(m.wpCode) : null;
        requestOpenMaps(wp ? { label: wp.label, x: wp.x, y: wp.y, icon: wp.icon, color: wp.color } : null);
    }
    function setWaypointFor(m: InboxMessage) {
        const wp = m.wpCode ? decodeWaypoint(m.wpCode) : null;
        void fetchNui('sd-phone:maps:waypoint', wp ? { x: wp.x, y: wp.y } : {});
    }

    const bubbleMsgs = useMemo(() => thread.messages.map(toBubbleMsg), [thread.messages]);
    const noop = useCallback(() => {}, []);
    const handleImageTap = useCallback((url: string) => { setPreview(url); setSavedPreview(false); }, []);
    const handleLocationTap = useCallback((id: string) => {
        const m = thread.messages.find(x => x.id === id);
        if (m) setLocSheet(m);
    }, [thread.messages]);

    const receivedBg = isDark ? 'rgb(var(--elevated))' : 'rgb(var(--control))';
    const sentBg     = 'rgb(var(--ios-blue))';

    const view = (
        <div
            className={`absolute inset-0 z-20 flex min-h-0 flex-col bg-surface font-sf dark:bg-base ${isDark ? 'dark' : ''}`}
            style={{ ...pageStyle, willChange: 'transform' }}
        >
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="flex items-center px-2 pb-2.5 pt-0.5">
                <div className="flex flex-1 items-center">
                    <button type="button" onClick={goBack} aria-label={t('services.back', 'Back')} className="flex items-center text-ios-blue active:opacity-60">
                        <ChevronLeft className="h-[34px] w-[34px]" strokeWidth={2.4} />
                    </button>
                </div>
                <div className="flex min-w-0 flex-col items-center gap-1.5">
                    <ServiceAvatar color={thread.color} emoji={thread.emoji} size={64} />
                    <span className="max-w-[200px] truncate text-[18px] font-semibold leading-none text-black dark:text-white">{scope === 'job' ? formatPhone(thread.key) : thread.name}</span>
                </div>
                <div className="flex-1" />
            </div>

            <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                <div className="flex min-h-full flex-col justify-end px-3 py-3">
                    {thread.messages.map((m, i) => {
                        const prev = thread.messages[i - 1];
                        const next = thread.messages[i + 1];
                        const sent     = m.from === 'me';
                        const isLast   = !next || next.from !== m.from;
                        const showName = !sent && scope !== 'job' && (!prev || prev.from !== m.from || prev.name !== m.name);
                        return (
                            <div key={m.id} className={`flex ${isLast ? 'mb-3' : 'mb-[2px]'} ${sent ? 'justify-end' : 'justify-start'}`}>
                                <div className={`flex flex-col ${sent ? 'max-w-[78%] items-end' : 'max-w-[80%] items-start'}`}>
                                    {showName && m.name && (
                                        <span className="mb-0.5 ml-1 text-[12px] font-semibold text-black/45 dark:text-white/45">{m.name}</span>
                                    )}
                                    <MessageBubble
                                        msg={bubbleMsgs[i]}
                                        sent={sent}
                                        isLast={isLast}
                                        isDark={isDark}
                                        receivedBg={receivedBg}
                                        sentBg={sentBg}
                                        hideActions
                                        pickerOpen={false}
                                        onOpenPicker={noop}
                                        onReact={noop}
                                        onReply={noop}
                                        onPay={noop}
                                        onLocationTap={handleLocationTap}
                                        onImageTap={handleImageTap}
                                        locationCaption={m.kind === 'location'
                                            ? (sent ? t('services.youSharedLocation', 'You shared your location') : t('services.sharedALocation', '{name} shared a location', { name: m.name || t('services.they', 'They') }))
                                            : undefined}
                                    />
                                    {!sent && isLast && (
                                        <span className="ml-1 mt-1 text-[11px] text-black/35 dark:text-white/30">{clock(m.ts)}</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <ServiceComposer isDark={isDark} onSend={d => void handleSend(d)} />

            {locSheet && (
                <ActionSheet
                    forceDark={isDark}
                    actions={[
                        { label: 'Open in Maps', onClick: () => openInMaps(locSheet) },
                        { label: 'Set Waypoint', onClick: () => setWaypointFor(locSheet) },
                    ]}
                    onClose={() => setLocSheet(null)}
                />
            )}

            {preview && (
                <ImageLightbox
                    src={preview}
                    onClose={() => setPreview(null)}
                    action={{
                        label: savedPreview ? t('services.savedToGallery', 'Saved to Gallery') : t('services.saveToGallery', 'Save to Gallery'),
                        onClick: () => { if (!savedPreview) { void apiSavePhotoFromUrl(preview); setSavedPreview(true); } },
                    }}
                />
            )}
        </div>
    );

    return portalToPhoneScreen(view);
}
