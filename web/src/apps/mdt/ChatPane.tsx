import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUp, RadioTower } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { ContactAvatar } from '@/shared/ContactAvatar';
import { MessageBubble } from '@/shared/chat/MessageBubble';
import { useAutoScrollToEnd } from '@/shared/chat/useAutoScrollToEnd';
import { colorFor, initialsFor } from '@/lib/format';
import { format12h } from '@/lib/time';
import { isFiveM } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useTheme } from '@/stores/themeStore';
import type { ChatMsg } from './data';
import { mdtRowMeta, mdtRuleX } from './mdtTheme';
import { mdtChatHistory, mdtSendChat } from './mdtApi';
import { useDeckRefresh, useMdtSession } from './useMdtSession';

const CAP = 50;
const GROUP_WINDOW = 120;

function noop() {}

export function ChatPane() {
    const { me, can } = useMdtSession();
    const { theme } = useTheme('theme');
    const dark = theme === 'dark';

    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [draft, setDraft] = useState('');
    const [loaded, setLoaded] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const canSend = can('chat.send');

    const refresh = useCallback(async () => {
        setMessages(await mdtChatHistory());
        setLoaded(true);
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);
    useDeckRefresh(() => { void refresh(); });

    const append = useCallback((msg: ChatMsg) => {
        setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg].slice(-CAP)));
    }, []);

    useNuiEvent('sd-phone:mdt:chat', data => append(data.message));

    useAutoScrollToEnd(scrollRef, messages.length);

    async function send() {
        const body = draft.trim();
        if (!body || !canSend) return;
        setDraft('');
        const sent = await mdtSendChat(body);
        if (sent) append(sent);
    }

    const receivedBg = 'rgb(var(--elevated))';
    const sentBg = 'var(--mdt-accent, #0a84ff)';

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2.5 px-6 pb-3.5 pt-4">
                <span
                    className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                    style={{ background: 'var(--mdt-accent, #0a84ff)' }}
                >
                    <RadioTower className="h-[18px] w-[18px] text-white" strokeWidth={2.2} />
                </span>
                <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[16px] font-semibold leading-tight text-black dark:text-white">
                        {t('mdt.departmentChannel', 'Department Channel')}
                    </span>
                    <span className="truncate text-[12.5px] text-ios-gray">
                        {t('mdt.channelSub', 'Every terminal on duty hears this')}
                    </span>
                </div>
            </div>

            <div className={mdtRuleX} />

            {loaded && messages.length === 0 ? (
                <div className="flex min-h-0 flex-1 items-center justify-center px-6">
                    <EmptyState
                        center
                        icon={RadioTower}
                        title={t('mdt.channelQuiet', 'Channel Is Quiet')}
                        subtitle={canSend
                            ? t('mdt.channelQuietSub', 'Nothing on the air. Send the first transmission.')
                            : t('mdt.channelQuietReadOnly', 'Nothing on the air right now.')}
                    />
                </div>
            ) : (
                <div ref={scrollRef} className="ios-scrollbar min-h-0 flex-1 overflow-y-auto px-6 py-4">
                    <div
                        className="flex flex-col"
                        style={{ '--chat-text-scale': '0.82' } as CSSProperties}
                    >
                        {messages.map((m, i) => {
                            const mine = !!me && m.citizenid === me.citizenid;
                            const prev = messages[i - 1];
                            const grouped = !!prev
                                && prev.citizenid === m.citizenid
                                && m.createdAt - prev.createdAt < GROUP_WINDOW;
                            const when = new Date(m.createdAt * 1000);

                            return (
                                <div key={m.id} className={`flex flex-col ${grouped ? 'mt-[3px]' : 'mt-3'}`}>
                                    {!grouped && (
                                        <div className={`mb-1 flex items-center gap-2 ${mine ? 'justify-end' : 'pl-[34px]'} ${mdtRowMeta}`}>
                                            {!mine && m.callsign && <Pill tone="green">{m.callsign}</Pill>}
                                            {!mine && (
                                                <span className="min-w-0 truncate font-semibold text-black/70 dark:text-white/70">
                                                    {m.name}
                                                </span>
                                            )}
                                            <span className="shrink-0 tabular-nums">
                                                {format12h(when.getHours(), when.getMinutes())}
                                            </span>
                                        </div>
                                    )}

                                    <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                                        {!mine && (
                                            <span className={grouped ? 'invisible' : ''}>
                                                <ContactAvatar
                                                    size={26}
                                                    contact={{
                                                        name:     m.name,
                                                        initials: initialsFor(m.name),
                                                        color:    colorFor(m.citizenid),
                                                        avatar:   m.avatar,
                                                    }}
                                                />
                                            </span>
                                        )}
                                        <div className={`flex min-w-0 max-w-[min(620px,72%)] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                                            <MessageBubble
                                                hideActions
                                                msg={{
                                                    id:   m.id,
                                                    from: mine ? 'me' : m.citizenid,
                                                    body: m.body,
                                                    kind: 'text',
                                                    ts:   m.createdAt * 1000,
                                                    read: true,
                                                }}
                                                sent={mine}
                                                isLast
                                                isDark={dark}
                                                receivedBg={receivedBg}
                                                sentBg={sentBg}
                                                pickerOpen={false}
                                                onOpenPicker={noop}
                                                onReact={noop}
                                                onReply={noop}
                                                onPay={noop}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {canSend && (
                <>
                    <div className={mdtRuleX} />
                    <div className="flex shrink-0 items-center gap-2.5 px-6 py-3">
                        <input
                            type="text"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
                            placeholder={t('mdt.chatPlaceholder', 'Transmit to the department')}
                            maxLength={300}
                            className="min-w-0 flex-1 rounded-full bg-black/[0.05] px-4 py-2 text-[15px] text-black outline-none ring-1 ring-inset ring-black/[0.07] transition-colors duration-150 placeholder:text-black/40 focus:bg-black/[0.07] focus:ring-ios-blue dark:bg-white/[0.07] dark:text-white dark:ring-white/[0.10] dark:placeholder:text-white/40 dark:focus:bg-white/[0.10]"
                        />
                        <button
                            type="button"
                            disabled={!draft.trim()}
                            onClick={() => void send()}
                            onKeyDown={e => { if (e.key === ' ' && isFiveM) e.preventDefault(); }}
                            aria-label={t('mdt.send', 'Send')}
                            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full transition-opacity duration-150 disabled:opacity-30"
                            style={{ background: 'var(--mdt-accent, #0a84ff)' }}
                        >
                            <ArrowUp className="h-[18px] w-[18px] text-white" strokeWidth={2.8} />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
