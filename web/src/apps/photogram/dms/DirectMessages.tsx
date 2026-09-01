import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, PenSquare } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { toggleReactionLocal } from '@/shared/chat/messagesApi';
import type { MessageDraft } from '@/shared/chat/ChatView';
import { SearchBar } from '@/ui/SearchBar';
import { ChatView } from './ChatView';
import { IG, nowTime, type DM, type DMsg, type User } from '../data';
import { apiDmList, apiDmReact, apiDmSend, apiDmThread, apiSearch, type Conversation, type FollowUser } from '../photogramApi';
import { VerifiedCheck } from '../ui';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export function DirectMessages({ me, onClose, onOpenPost, animateIn = true }: { me: User; onClose: () => void; onOpenPost?: (id: string) => void; animateIn?: boolean }) {
    const { goBack, pageStyle } = useIosPush(onClose, animateIn);
    const [convos,    setConvos]    = useSessionState<Conversation[]>('photogram:dmConvos', []);
    const [open,      setOpen]      = useSessionState<DM | null>('photogram:dmThread', null);
    const [deepLink,  setDeepLink]  = useSessionState<string | null>('photogram:dmDeepLink', null);
    const [openAnim,  setOpenAnim]  = useState(false);
    const [composing, setComposing] = useState(false);

    const refresh = useCallback(() => { void apiDmList().then(setConvos); }, [setConvos]);
    useEffect(() => { refresh(); }, [refresh]);

    const openThread = useCallback(async (handle: string, animate: boolean) => {
        setOpenAnim(animate);
        const dm = await apiDmThread(handle);
        if (dm) { setOpen(dm); setComposing(false); }
    }, [setOpen]);

    useEffect(() => {
        if (deepLink) {
            setDeepLink(null);
            setOpen(null);
            void openThread(deepLink, false);
            return;
        }
        if (open) void apiDmThread(open.user.handle).then(dm => { if (dm) setOpen(dm); });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function closeThread() { setOpen(null); }

    function send(d: MessageDraft) {
        const peer = open?.user.handle;
        if (!peer) return;
        const temp: DMsg = {
            id: 'tmp-' + Date.now(), body: d.body, at: nowTime(), ts: Date.now(), mine: true,
            kind: d.kind, gifUrl: d.gifUrl, duration: d.duration, audioUrl: d.audioUrl, waveform: d.waveform, replyTo: d.replyTo,
        };
        setOpen(prev => prev ? { ...prev, messages: [...prev.messages, temp] } : prev);
        void apiDmSend(peer, d).then(res => {
            setOpen(prev => {
                if (!prev || prev.user.handle !== peer) return prev;
                if (res.message) return { ...prev, messages: prev.messages.map(m => m.id === temp.id ? res.message! : m) };
                return { ...prev, messages: prev.messages.filter(m => m.id !== temp.id) };
            });
            refresh();
        });
    }

    function react(msgId: string, emoji: string) {
        setOpen(prev => prev
            ? { ...prev, messages: prev.messages.map(m => m.id === msgId ? { ...m, reactions: toggleReactionLocal(m.reactions, emoji) } : m) }
            : prev);
        void apiDmReact(msgId, emoji).then(reactions => {
            if (!reactions) return;
            setOpen(prev => prev
                ? { ...prev, messages: prev.messages.map(m => m.id === msgId ? { ...m, reactions } : m) }
                : prev);
        });
    }

    useNuiEvent('sd-phone:photogram:dmReceived', useCallback((data) => {
        if (!data) return;
        setOpen(prev => {
            if (prev && prev.user.handle === data.peer) {
                if (prev.messages.some(m => m.id === data.message.id)) return prev;
                return { ...prev, messages: [...prev.messages, data.message] };
            }
            return prev;
        });
        void apiDmList().then(setConvos);
    }, []));

    useNuiEvent('sd-phone:photogram:dmReaction', useCallback((data) => {
        if (!data) return;
        setOpen(prev => prev
            ? { ...prev, messages: prev.messages.map(m => m.id === data.id ? { ...m, reactions: data.reactions } : m) }
            : prev);
    }, []));

    return (
        <div className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-[#f2f2f2] font-sf" style={pageStyle}>
            <StatusBarSpacer />
            <List me={me} onClose={goBack} convos={convos} onOpen={(h) => openThread(h, true)} onCompose={() => setComposing(true)} />

            {open && (
                <ChatView
                    convo={open}
                    onBack={closeThread}
                    onSend={send}
                    onReact={react}
                    onOpenPost={onOpenPost}
                    animateIn={openAnim}
                />
            )}

            {composing && <NewMessage onClose={() => setComposing(false)} onPick={(h) => openThread(h, true)} />}
        </div>
    );
}

function previewOf(last: DMsg): string {
    const body = last.kind === 'image' ? t('photogram.photoLabel', '📷 Photo')
        : last.kind === 'gif'   ? 'GIF'
        : last.kind === 'voice' ? t('photogram.voiceMessage', '🎤 Voice message')
        : last.kind === 'post'  ? t('photogram.sharedAPost', '📷 Shared a post')
        : last.body;
    return last.mine ? t('photogram.youColon', 'You: {body}', { body }) : body;
}

function List({ me, onClose, convos, onOpen, onCompose }: {
    me: User; onClose: () => void; convos: Conversation[]; onOpen: (handle: string) => void; onCompose: () => void;
}) {
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const filtered = q ? convos.filter(c => c.user.handle.toLowerCase().includes(q)) : convos;
    return (
        <>
            <div className="flex items-center gap-3 px-4 pb-2">
                <button type="button" onClick={onClose} aria-label={t('photogram.back', 'Back')} className="text-black active:opacity-50"><ArrowLeft className="h-[26px] w-[26px]" strokeWidth={2.2} /></button>
                <div className="flex items-center gap-1.5"><span className="text-[26px] font-bold text-black">{me.handle}</span>{me.verified && <VerifiedCheck size={24} />}</div>
                <div className="flex-1" />
                <button type="button" onClick={onCompose} aria-label={t('photogram.newMessage', 'New message')} className="text-black active:opacity-50"><PenSquare className="h-[24px] w-[24px]" strokeWidth={1.9} /></button>
            </div>
            <div className="shrink-0 px-4 pb-2">
                <SearchBar
                    value={query}
                    onChange={setQuery}
                    placeholder={t('photogram.search', 'Search')}
                    pillClassName="gap-2.5 rounded-[12px] bg-[#e7e7e9] px-3.5 py-2.5"
                    iconClassName="h-[20px] w-[20px] text-[#737373]"
                    textClassName="text-[18px] text-black placeholder:text-[#8e8e8e]"
                />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pt-1">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center px-8 pt-20 text-center">
                        <div className="text-[20px] font-semibold text-black">{t('photogram.noMessagesYet', 'No messages yet')}</div>
                        <div className="mt-1.5 text-[16px] leading-snug text-black/55">{t('photogram.noMessagesDesc', 'Send a message to a friend to start a conversation.')}</div>
                    </div>
                ) : filtered.map((c, i) => (
                    <div key={c.id}>
                        <button type="button" onClick={() => onOpen(c.user.handle)} className="flex w-full items-center gap-4 px-4 py-3.5 text-left active:bg-black/5">
                            <img src={c.user.avatar} alt="" draggable={false} className="h-[68px] w-[68px] rounded-full object-cover" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5"><span className="text-[20px] font-semibold text-black">{c.user.handle}</span>{c.user.verified && <VerifiedCheck size={20} />}</div>
                                <div className={`mt-1 truncate text-[18px] ${c.unread > 0 ? 'font-semibold text-black' : ''}`} style={c.unread > 0 ? undefined : { color: IG.sub }}>{c.last ? previewOf(c.last) : ''}</div>
                            </div>
                            {c.unread > 0 && <span className="h-[10px] w-[10px] shrink-0 rounded-full" style={{ background: IG.blue }} />}
                        </button>
                        {i < filtered.length - 1 && <div className="pointer-events-none mx-[6%] h-[0.5px] bg-black/15" />}
                    </div>
                ))}
            </div>
        </>
    );
}

function NewMessage({ onClose, onPick }: { onClose: () => void; onPick: (handle: string) => void }) {
    const [query,   setQuery]   = useState('');
    const [results, setResults] = useState<FollowUser[]>([]);

    useEffect(() => {
        const q = query.trim();
        if (!q) { setResults([]); return; }
        let alive = true;
        void apiSearch(q).then(r => { if (alive) setResults(r); });
        return () => { alive = false; };
    }, [query]);

    return (
        <div className="absolute inset-0 z-50 flex flex-col bg-[#f2f2f2] font-sf" style={{ animation: 'ios-sheet-up 0.32s cubic-bezier(0.32,0.72,0,1)' }}>
            <StatusBarSpacer />
            <div className="flex items-center justify-between px-4 pb-2">
                <button type="button" onClick={onClose} className="text-[16px] text-black active:opacity-50">{t('photogram.cancel', 'Cancel')}</button>
                <span className="text-[16px] font-semibold text-black">{t('photogram.newMessage', 'New message')}</span>
                <span className="w-[52px]" />
            </div>
            <div className="shrink-0 px-4 pb-2">
                <SearchBar
                    value={query}
                    onChange={setQuery}
                    placeholder={t('photogram.search', 'Search')}
                    autoFocus
                    pillClassName="gap-2.5 rounded-[12px] bg-[#e7e7e9] px-3.5 py-2.5"
                    iconClassName="h-[20px] w-[20px] text-[#737373]"
                    textClassName="text-[18px] text-black placeholder:text-[#8e8e8e]"
                />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pt-1">
                {results.length === 0 ? (
                    <div className="px-8 py-12 text-center text-[16px]" style={{ color: IG.sub }}>{query.trim() ? t('photogram.noAccountsFound', 'No accounts found.') : t('photogram.searchAccountToMessage', 'Search for an account to message.')}</div>
                ) : results.map(u => (
                    <button key={u.handle} type="button" onClick={() => onPick(u.handle)} className="flex w-full items-center gap-4 px-4 py-3 text-left active:bg-black/5">
                        <img src={u.avatar} alt="" draggable={false} className="h-[56px] w-[56px] rounded-full object-cover" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5"><span className="text-[19px] font-semibold text-black">{u.handle}</span>{u.verified && <VerifiedCheck size={18} />}</div>
                            {u.name && <div className="truncate text-[16px]" style={{ color: IG.sub }}>{u.name}</div>}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
