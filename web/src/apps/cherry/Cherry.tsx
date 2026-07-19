import { useCallback, useEffect, useRef, useState } from 'react';
import { Cherry as CherryGlyph, MessageCircle, User } from 'lucide-react';

import { isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { readJson, writeJson } from '@/lib/storage';
import { useStatusBarLight } from '@/shell/useStatusBarLight';
import { useSessionState } from '@/hooks/useSessionState';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useDeckActive } from '@/shell/deckActive';
import { useAppAuth } from '@/hooks/useAppAuth';
import { AppAuth } from '@/shared/AppAuth';
import { AlertDialog } from '@/ui/AlertDialog';
import { MAIL_DOMAIN, accountsConfirmReset, accountsForgetPassword, accountsLogin, accountsLogout, accountsMe, accountsRegister, accountsRequestReset, accountsSavePassword, accountsSuggestCode } from '@/core/accountsApi';
import { appendThreadMessage, patchThreadMessage, toggleReactionLocal } from '@/shared/chat/messagesApi';
import type { Message, Reaction } from '@/shared/chat/data';
import type { MessageDraft } from '@/shared/chat/ChatView';
import { CHERRY, type Match, type MyProfile, type SwipeProfile } from './data';
import {
    cherryBlock, cherryDeleteAccount, cherryReact, cherryResetDeck, cherryRewind,
    cherrySaveProfile, cherrySend, cherryState, cherrySwipe, cherryThread, cherryUnmatch,
    cherryWatch, toMatch, toMessage, type RawCherryMessage,
} from './cherryApi';
import { MatchOverlay, SwipeDeck } from './SwipeDeck';
import { EditProfile } from './EditProfile';
import { Matches } from './Matches';
import { MatchChat } from './MatchChat';

type View = 'deck' | 'profile' | 'matches' | { chatId: string };

export function Cherry({ onClose: _onClose }: { onClose: () => void }) {
    const { authed, setAuthed, authChecked, justAuthed, setJustAuthed, myNumber, myEmail, savedLogin } = useAppAuth('cherry',
        () => accountsMe('cherry').then(s => s.loggedIn));

    useStatusBarLight(authed ? false : null);

    const [view, setView] = useSessionState<View>('cherry:view', 'deck');

    const [me,      setMe]      = useState('');
    const [profile, setProfile] = useState<MyProfile | null>(null);
    const [deck,    setDeck]    = useState<SwipeProfile[]>([]);
    const [canReset, setCanReset] = useState(true);
    const [matches, setMatches] = useState<Match[]>([]);
    const [sendError, setSendError] = useState<string | null>(null);
    const [lockedIds, setLockedIds] = useState<string[]>([]);
    const [incomingMatch, setIncomingMatch] = useState<Match | null>(null);

    const meRef = useRef(me);
    useEffect(() => { meRef.current = me; }, [me]);
    const matchesRef = useRef(matches);
    useEffect(() => { matchesRef.current = matches; }, [matches]);

    useEffect(() => {
        if (!authed) return;
        cherryWatch(true);
        return () => cherryWatch(false);
    }, [authed]);

    // AppDeck retains this subtree, so a reopen needs an explicit refetch nonce.
    const [stateNonce, setStateNonce] = useState(0);
    const deckActive = useDeckActive();
    const wasActive = useRef(deckActive);
    useEffect(() => {
        if (deckActive && !wasActive.current) setStateNonce(n => n + 1);
        wasActive.current = deckActive;
    }, [deckActive]);

    useEffect(() => {
        if (!authed) return;
        let alive = true;
        void cherryState().then(s => {
            if (!alive || !s) return;
            setMe(s.me);
            setProfile(s.profile);
            setDeck(s.deck);
            setCanReset(s.canReset);
            setMatches(s.matches);
        });
        return () => { alive = false; };
    }, [authed, stateNonce]);

    const saveTimer = useRef<number | null>(null);
    const loadedOnce = useRef(false);
    useEffect(() => {
        if (!profile) return;
        if (!loadedOnce.current) { loadedOnce.current = true; return; }
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
            void cherrySaveProfile(profile).then(async () => {
                if (!isFiveM) return;
                const s = await cherryState();
                if (s) { setDeck(s.deck); setCanReset(s.canReset); }
            });
        }, 700);
        return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
    }, [profile]);

    const [seen, setSeen] = useState<Record<string, number>>(() => readJson<Record<string, number>>('sd-phone:cherry:seen') ?? {});
    const markSeen = useCallback((matchId: string) => {
        setSeen(prev => {
            const next = { ...prev, [matchId]: Date.now() };
            writeJson('sd-phone:cherry:seen', next);
            return next;
        });
    }, []);

    const appendMessage = useCallback((matchId: string, msg: Message) => {
        setMatches(prev => appendThreadMessage(prev, matchId, msg));
    }, []);

    const patchMessage = useCallback((matchId: string, messageId: string, patch: (m: Message) => Message) => {
        setMatches(prev => patchThreadMessage(prev, matchId, messageId, patch));
    }, []);

    const openChat = useCallback((matchId: string) => {
        setView({ chatId: matchId });
        markSeen(matchId);
        const m = matches.find(x => x.id === matchId);
        if (m && !m.loaded) {
            void cherryThread(matchId, meRef.current).then(msgs => {
                if (!msgs) return;
                setMatches(prev => prev.map(x => (x.id === matchId ? { ...x, messages: msgs, loaded: true } : x)));
            });
        }
    }, [matches, setView, markSeen]);

    const sendToMatch = useCallback(async (matchId: string, draft: MessageDraft) => {
        const optimistic: Message = {
            id: `tmp-${Date.now()}`, from: 'me', body: draft.body, kind: draft.kind,
            ts: Date.now(), read: true,
            gifUrl: draft.gifUrl, amount: draft.amount, requested: draft.requested,
            duration: draft.duration, audioUrl: draft.audioUrl, waveform: draft.waveform,
            wpCode: draft.wpCode, wpSub: draft.wpSub, replyTo: draft.replyTo,
        };
        appendMessage(matchId, optimistic);

        const res = await cherrySend(matchId, draft as unknown as Record<string, unknown>, meRef.current);
        if (res.message) {
            patchMessage(matchId, optimistic.id, () => ({ ...res.message!, replyTo: draft.replyTo }));
            return true;
        }
        setMatches(prev => prev.map(m => (
            m.id === matchId ? { ...m, messages: m.messages.filter(x => x.id !== optimistic.id) } : m
        )));
        if (res.error) setSendError(res.error);
        return false;
    }, [appendMessage, patchMessage]);

    const reactToMessage = useCallback((matchId: string, messageId: string, emoji: string) => {
        patchMessage(matchId, messageId, m => {
            const next = toggleReactionLocal(m.reactions, emoji);
            return { ...m, reactions: next.length ? next : undefined };
        });
        void cherryReact(messageId, emoji).then(server => {
            if (server) patchMessage(matchId, messageId, m => ({ ...m, reactions: server.length ? server : undefined }));
        });
    }, [patchMessage]);

    const payRequest = useCallback((matchId: string, messageId: string, amount: number) => {
        void sendToMatch(matchId, { kind: 'money', amount, body: `$${amount}` }).then(sent => {
            if (sent) patchMessage(matchId, messageId, m => ({ ...m, requestStatus: 'paid' as const }));
        });
    }, [sendToMatch, patchMessage]);

    const removeMatch = useCallback((matchId: string, block: boolean) => {
        const partner = matchesRef.current.find(m => m.id === matchId)?.partner.username;
        if (!block && partner) setLockedIds(prev => prev.filter(u => u !== partner));
        void (block ? cherryBlock(matchId) : cherryUnmatch(matchId)).then(async () => {
            if (!block && isFiveM) {
                const s = await cherryState();
                if (s) { setDeck(s.deck); setCanReset(s.canReset); }
            }
        });
        setMatches(prev => prev.filter(m => m.id !== matchId));
        setView('matches');
    }, [setView]);

    const swipe = useCallback(async (p: SwipeProfile, liked: boolean): Promise<Match | null> => {
        const match = await cherrySwipe(p, liked, meRef.current);
        if (match) {
            setMatches(prev => prev.some(m => m.id === match.id) ? prev : [match, ...prev]);
            setLockedIds(prev => prev.includes(p.id) ? prev : [...prev, p.id]);
        }
        return match;
    }, []);

    const resetDeck = useCallback(() => {
        void (async () => {
            await cherryResetDeck();
            const s = await cherryState();
            if (s) { setDeck(s.deck); setCanReset(s.canReset); }
        })();
    }, []);

    const refreshDeck = useCallback(async () => {
        const s = await cherryState();
        if (s) { setDeck(s.deck); setCanReset(s.canReset); }
    }, []);

    const openChatRef = useRef<string | null>(null);
    useEffect(() => { openChatRef.current = typeof view === 'object' ? view.chatId : null; }, [view]);

    useNuiEvent('sd-phone:cherry:message', useCallback((data: { matchId: string; message: unknown }) => {
        if (!data?.matchId || !data.message) return;
        appendMessage(data.matchId, toMessage(data.message as RawCherryMessage, meRef.current));
        if (openChatRef.current === data.matchId) markSeen(data.matchId);
    }, [appendMessage, markSeen]));

    useNuiEvent('sd-phone:cherry:match', useCallback((data: unknown) => {
        const raw = data as { id?: string; partner?: Match['partner'] };
        if (!raw?.id || !raw.partner) return;
        const match = toMatch(raw as Parameters<typeof toMatch>[0], meRef.current);
        setMatches(prev => prev.some(m => m.id === match.id) ? prev : [match, ...prev]);
        setLockedIds(prev => prev.includes(match.partner.username) ? prev : [...prev, match.partner.username]);
        setIncomingMatch(match);
    }, []));

    useNuiEvent('sd-phone:cherry:reaction', useCallback((data: { matchId: string; id: string; reactions: Reaction[] }) => {
        if (!data?.matchId || !data.id) return;
        const next = Array.isArray(data.reactions) ? data.reactions.filter(r => r.count > 0) : [];
        patchMessage(data.matchId, data.id, m => ({ ...m, reactions: next.length ? next : undefined }));
    }, [patchMessage]));

    useNuiEvent('sd-phone:cherry:partner', useCallback((data: { username: string; partner: unknown }) => {
        if (!data?.username || !data.partner) return;
        const partner = data.partner as Match['partner'];
        setMatches(prev => prev.map(m => m.partner.username === data.username ? { ...m, partner } : m));
    }, []));

    useNuiEvent('sd-phone:cherry:unmatch', useCallback((data: { matchId: string }) => {
        if (!data?.matchId) return;
        const partner = matchesRef.current.find(m => m.id === data.matchId)?.partner.username;
        if (partner) setLockedIds(prev => prev.filter(u => u !== partner));
        setMatches(prev => prev.filter(m => m.id !== data.matchId));
        if (openChatRef.current === data.matchId) setView('matches');
        if (isFiveM) {
            void cherryState().then(s => { if (s) { setDeck(s.deck); setCanReset(s.canReset); } });
        }
    }, [setView]));

    const chatId      = typeof view === 'object' ? view.chatId : null;
    const activeMatch = chatId ? matches.find(m => m.id === chatId) ?? null : null;
    const section: 'deck' | 'profile' | 'matches' = typeof view === 'object' ? 'matches' : view;

    const tab = (active: boolean) => active ? '' : 'text-black/35';

    if (!authChecked) {
        return <div className="absolute inset-0 z-10 bg-[#e5e5e5]" />;
    }
    if (!authed) {
        return (
            <AppAuth
                appName="Cherry"
                tagline={t('cherry.tagline', 'Find your person in Los Santos.')}
                icon="cherry"
                theme={{
                    accent:          CHERRY.pink,
                    welcomeBg:       'linear-gradient(180deg, #FF6584 0%, #FF3D6E 50%, #D11149 100%)',
                    welcomeText:     'light',
                    welcomeCtaWhite: true,
                }}
                myNumber={myNumber}
                myEmail={myEmail}
                savedLogin={savedLogin}
                fields={[
                    { key: 'username', label: t('cherry.username', 'Username') },
                    { key: 'name',     label: t('cherry.name', 'Name') },
                    { key: 'age',      label: t('cherry.age', 'Age'), type: 'number' },
                    { key: 'password', label: t('cherry.password', 'Password'), type: 'password' },
                    { key: 'email',    label: t('cherry.email', 'Email'), suffix: `@${MAIL_DOMAIN}`, createOnly: true },
                    { key: 'phone',    label: t('cherry.phone', 'Phone'), type: 'tel',   createOnly: true },
                ]}
                onSubmit={async (mode, vals) => {
                    const res = mode === 'create' ? await accountsRegister('cherry', vals) : await accountsLogin('cherry', vals);
                    if (res.ok && mode === 'create') {
                        void cherrySaveProfile({
                            name: vals.name || vals.username,
                            age: Math.max(18, Math.min(99, parseInt(vals.age, 10) || 21)),
                            about: '', photos: [], gender: 'Man', interestedIn: 'Everyone', visible: true,
                        });
                    }
                    return res;
                }}
                onAuthed={() => { setAuthed(true); setJustAuthed(true); }}
                onRequestReset={(id) => accountsRequestReset('cherry', id)}
                onConfirmReset={(id, code, pw) => accountsConfirmReset('cherry', id, code, pw)}
                onSuggestCode={(id) => accountsSuggestCode('cherry', id)}
                onSaveCredentials={(vals) => accountsSavePassword('cherry', vals)}
            />
        );
    }

    return (
        <div className={`absolute inset-0 flex flex-col bg-[#e5e5e5] font-sf ${justAuthed ? 'animate-swipe-in-left' : ''}`}>
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="flex shrink-0 items-center justify-between px-6 pb-6 pt-3">
                <button type="button" aria-label={t('cherry.yourProfile', 'Your profile')} onClick={() => setView('profile')}
                    className={`-m-2 rounded-full p-2 transition-colors hover:bg-black/[0.06] active:opacity-60 ${tab(section === 'profile')}`}
                    style={section === 'profile' ? { color: CHERRY.pink } : undefined}>
                    <User className="h-[34px] w-[34px]" strokeWidth={2} fill={section === 'profile' ? 'currentColor' : 'none'} />
                </button>
                <button type="button" aria-label={t('cherry.discover', 'Discover')} onClick={() => setView('deck')}
                    className={`-m-2 rounded-full p-2 transition-colors hover:bg-black/[0.06] active:opacity-60 ${tab(section === 'deck')}`}
                    style={section === 'deck' ? { color: CHERRY.pink } : undefined}>
                    <CherryGlyph className="h-[36px] w-[36px]" strokeWidth={2} fill="none" />
                </button>
                <button type="button" aria-label={t('cherry.matches', 'Matches')} onClick={() => setView('matches')}
                    className={`-m-2 rounded-full p-2 transition-colors hover:bg-black/[0.06] active:opacity-60 ${tab(section === 'matches')}`}
                    style={section === 'matches' ? { color: CHERRY.pink } : undefined}>
                    <MessageCircle className="h-[34px] w-[34px]" strokeWidth={2} fill={section === 'matches' ? 'currentColor' : 'none'} />
                </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
                <div className={section === 'deck' ? 'flex min-h-0 flex-1 flex-col animate-swipe-in-left' : 'hidden'}>
                    <SwipeDeck
                        profiles={deck}
                        canReset={canReset}
                        lockedIds={lockedIds}
                        onSwipe={swipe}
                        onRewind={cherryRewind}
                        onReset={resetDeck}
                        onRefresh={refreshDeck}
                        onSendFirst={(matchId, body) => void sendToMatch(matchId, { kind: 'text', body })}
                    />
                </div>
                {section !== 'deck' && (
                    <div key={section} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                        {section === 'profile' && profile && (
                            <EditProfile
                                profile={profile}
                                onChange={setProfile}
                                onSignOut={() => { void accountsLogout('cherry'); setAuthed(false); }}
                                onDeleteAccount={() => {
                                    void (async () => {
                                        await cherryDeleteAccount();
                                        await accountsForgetPassword('cherry');
                                        await accountsLogout('cherry');
                                        setAuthed(false);
                                    })();
                                }}
                            />
                        )}
                        {section === 'matches' && <Matches matches={matches} seen={seen} onOpen={openChat} onDiscover={() => setView('deck')} />}
                    </div>
                )}
            </div>

            {activeMatch && (
                <MatchChat
                    match={activeMatch}
                    onBack={() => setView('matches')}
                    onSend={draft => void sendToMatch(activeMatch.id, draft)}
                    onReact={(messageId, emoji) => reactToMessage(activeMatch.id, messageId, emoji)}
                    onPayRequest={(messageId, amount) => payRequest(activeMatch.id, messageId, amount)}
                    onUnmatch={() => removeMatch(activeMatch.id, false)}
                    onBlock={() => removeMatch(activeMatch.id, true)}
                />
            )}

            {incomingMatch && (
                <MatchOverlay
                    profile={{
                        id:     incomingMatch.partner.username,
                        name:   incomingMatch.partner.name,
                        age:    incomingMatch.partner.age,
                        bio:    incomingMatch.partner.about ?? '',
                        photos: incomingMatch.partner.photos ?? (incomingMatch.partner.photo ? [incomingMatch.partner.photo] : []),
                    }}
                    onSend={body => { void sendToMatch(incomingMatch.id, { kind: 'text', body }); setIncomingMatch(null); }}
                    onClose={() => setIncomingMatch(null)}
                />
            )}

            {sendError && (
                <AlertDialog
                    title={t('cherry.couldntSend', "Couldn't Send")}
                    message={sendError}
                    confirmLabel={t('cherry.ok', 'OK')}
                    hideCancel
                    onCancel={() => setSendError(null)}
                    onConfirm={() => setSendError(null)}
                />
            )}
        </div>
    );
}
