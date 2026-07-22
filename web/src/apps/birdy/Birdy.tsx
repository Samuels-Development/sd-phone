import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, ChevronLeft, House, Mail, Pen, Search as SearchIcon } from 'lucide-react';

import { t } from '@/i18n';
import { useAppAuth } from '@/hooks/useAppAuth';
import { useIosPush } from '@/hooks/useIosPush';
import { useDidEnter } from '@/hooks/useDidEnter';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { useDeckActive } from '@/shell/deckActive';
import { AppAuth } from '@/shared/AppAuth';
import { AlertDialog } from '@/ui/AlertDialog';
import { MAIL_DOMAIN, accountsConfirmReset, accountsRequestReset, accountsSavePassword, accountsSuggestCode } from '@/core/accountsApi';
import { toggleReactionLocal } from '@/shared/chat/messagesApi';
import type { MessageDraft } from '@/shared/chat/ChatView';
import {
    apiCreate, apiDmList, apiDmMarkRead, apiDmReact, apiDmResolve, apiDmSend, apiDmThread, apiFeed, apiLogin, apiMe, apiPostDetail, apiProfile, apiRegister, apiNotificationCount, apiReply, apiToggleFollow, apiToggleLike, apiToggleRepost,
} from './birdyApi';
import { ChatView } from './dms/ChatView';
import { Composer } from './feed/Composer';
import { BG, BLUE, CURRENT_USER, type BirdyAuthor, type BirdyConversation, type BirdyMessage, type BirdyPost, type BirdyProfile } from './data';
import { EditProfile } from './profile/EditProfile';
import { Feed } from './feed/Feed';
import { MessagesList } from './dms/Messages';
import { Notifications } from './discover/Notifications';
import { PostDetail } from './feed/PostDetail';
import { Profile } from './profile/Profile';
import { Search } from './discover/Search';

type Tab = 'home' | 'search' | 'notifications' | 'messages';

export function Birdy({ onClose }: { onClose: () => void }) {
    const [me,          setMe]          = useState<BirdyAuthor>(CURRENT_USER);
    const { authed, setAuthed, authChecked, justAuthed, setJustAuthed, myNumber, myEmail, savedLogin } = useAppAuth('birdy',
        () => apiMe().then(s => { if (s.me) setMe(s.me); return s.loggedIn; }));
    // null = not fetched yet (the feed shows skeletons instead of a false "no posts" flash).
    const [posts,       setPosts]       = useState<BirdyPost[] | null>(null);
    const [convos,      setConvos]      = useState<BirdyConversation[]>([]);
    const [tab,         setTab]         = useSessionState<Tab>('birdy:tab', 'home');
    const [feed,        setFeed]        = useSessionState<'all' | 'following'>('birdy:feed', 'all');
    const [composing,   setComposing]   = useSessionState('birdy:composing', false);
    const [openPostId,  setOpenPostId]  = useSessionState<string | null>('birdy:openPostId', null);
    const [openPost,    setOpenPost]    = useState<BirdyPost | null>(null);
    const [openConvoId, setOpenConvoId] = useSessionState<string | null>('birdy:openConvoId', null);
    const [openConvo,   setOpenConvo]   = useState<BirdyConversation | null>(null);
    const [profileOpen,    setProfileOpen]    = useSessionState('birdy:profileOpen', false);
    const [profileTarget,  setProfileTarget]  = useSessionState<string | null>('birdy:profileTarget', null);
    const [editingProfile, setEditingProfile] = useState(false);
    const [profile,        setProfile]        = useState<BirdyProfile | null>(null);
    const [sendError,      setSendError]      = useState<string | null>(null);

    // AppDeck retains this subtree, so refetching needs an explicit nonce.
    const [feedNonce, setFeedNonce] = useState(0);
    const refreshFeed = useCallback(() => setFeedNonce(n => n + 1), []);

    useNuiEvent('sd-phone:birdy:feedChanged', refreshFeed);

    // Transition only; the mount fetch below already covers first open.
    const deckActive = useDeckActive();
    const wasActive = useRef(deckActive);
    useEffect(() => {
        if (deckActive && !wasActive.current) refreshFeed();
        wasActive.current = deckActive;
    }, [deckActive, refreshFeed]);

    useEffect(() => {
        if (!authed) return;
        let alive = true;
        void apiFeed(feed === 'following').then(p => { if (alive) setPosts(p); });
        return () => { alive = false; };
    }, [authed, feed, feedNonce]);

    useEffect(() => {
        if (!authed) return;
        let alive = true;
        void apiDmList().then(c => { if (alive) setConvos(c); });
        return () => { alive = false; };
    }, [authed, tab]);

    const [notifCount, setNotifCount] = useState(0);
    useEffect(() => {
        if (!authed) return;
        // The Bell tab's own fetch marks everything seen server-side, so zero locally.
        if (tab === 'notifications') { setNotifCount(0); return; }
        let alive = true;
        void apiNotificationCount().then(n => { if (alive) setNotifCount(n); });
        return () => { alive = false; };
    }, [authed, tab, feedNonce]);

    useNuiEvent('sd-phone:birdy:notification', useCallback(() => {
        setNotifCount(n => n + 1);
    }, []));

    useEffect(() => {
        if (!openPostId) { setOpenPost(null); return; }
        let alive = true;
        void apiPostDetail(openPostId).then(p => { if (alive) setOpenPost(p); });
        return () => { alive = false; };
    }, [openPostId]);

    const openConvoIdRef = useRef<string | null>(openConvoId);
    useEffect(() => { openConvoIdRef.current = openConvoId; }, [openConvoId]);

    const markConvoRead = useCallback((id: string) => {
        setConvos(prev => prev.map(c => ((c.unread ?? 0) > 0 && c.id === id ? { ...c, unread: 0 } : c)));
        void apiDmMarkRead(id);
    }, []);

    useEffect(() => {
        if (!openConvoId) { setOpenConvo(null); return; }
        let alive = true;
        void apiDmThread(openConvoId).then(c => { if (alive) setOpenConvo(c); });
        markConvoRead(openConvoId);
        return () => { alive = false; };
    }, [openConvoId, markConvoRead]);

    useEffect(() => {
        if (!profileOpen) return;
        let alive = true;
        void apiProfile(profileTarget ?? undefined).then(p => { if (alive) setProfile(p); });
        return () => { alive = false; };
    }, [profileOpen, profileTarget]);

    useNuiEvent('sd-phone:birdy:dmReceived', useCallback(data => {
        if (!data) return;
        const forOpen = !!data.conversationId && data.conversationId === openConvoIdRef.current;
        if (forOpen) void apiDmMarkRead(data.conversationId);
        void apiDmList().then(list => setConvos(
            forOpen ? list.map(c => (c.id === data.conversationId ? { ...c, unread: 0 } : c)) : list,
        ));
        setOpenConvo(prev =>
            prev && prev.id === data.conversationId
                ? (prev.messages.some(m => m.id === data.message.id)
                    ? prev
                    : { ...prev, messages: [...prev.messages, data.message] })
                : prev);
    }, []));

    useNuiEvent('sd-phone:birdy:dmReaction', useCallback(data => {
        if (!data) return;
        setOpenConvo(prev =>
            prev && prev.id === data.conversationId
                ? { ...prev, messages: prev.messages.map(m => (m.id === data.id ? { ...m, reactions: data.reactions } : m)) }
                : prev);
    }, []));

    async function openDmWith(targetHandle: string) {
        const r = await apiDmResolve(targetHandle);
        if (!r) return;
        setProfileOpen(false); setProfileTarget(null);
        setTab('messages');
        setOpenConvoId(r.id);
    }

    function toggleLike(id: string) {
        const flip = (p: BirdyPost): BirdyPost =>
            p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p;
        setPosts(prev => (prev ? prev.map(flip) : prev));
        setOpenPost(prev => prev ? { ...flip(prev), thread: prev.thread?.map(flip) } : prev);
        void apiToggleLike(id);
    }

    function toggleRepost(id: string) {
        const flip = (p: BirdyPost): BirdyPost =>
            p.id === id ? { ...p, reposted: !p.reposted, reposts: p.reposts + (p.reposted ? -1 : 1) } : p;
        setPosts(prev => (prev ? prev.map(flip) : prev));
        setOpenPost(prev => prev ? { ...flip(prev), thread: prev.thread?.map(flip) } : prev);
        void apiToggleRepost(id);
    }

    async function addPost(body: string, images: string[]) {
        const post = await apiCreate(body, images.length ? images : undefined);
        if (post) setPosts(prev => (prev ? [post, ...prev] : [post]));
        setComposing(false);
        setTab('home');
        setFeed('all');
    }

    // Switching feeds drops back to skeletons; a same-tab tap changes nothing.
    function switchFeed(f: 'all' | 'following') {
        if (f !== feed) setPosts(null);
        setFeed(f);
    }

    const refreshNow = useCallback(
        () => apiFeed(feed === 'following').then(p => setPosts(p)),
        [feed],
    );

    async function sendMessage(convoId: string, draft: MessageDraft) {
        const optimistic: BirdyMessage = {
            id: `tmp-${Date.now()}`, fromMe: true, body: draft.body, at: '', ts: Date.now(),
            kind: draft.kind, gifUrl: draft.gifUrl, amount: draft.amount, requested: draft.requested,
            duration: draft.duration, audioUrl: draft.audioUrl, waveform: draft.waveform,
            wpCode: draft.wpCode, wpSub: draft.wpSub, replyTo: draft.replyTo,
        };
        setOpenConvo(prev => (prev && prev.id === convoId ? { ...prev, messages: [...prev.messages, optimistic] } : prev));

        const res = await apiDmSend(convoId, draft);
        if (res.message) {
            const real = res.message;
            setOpenConvo(prev => (prev && prev.id === convoId
                ? { ...prev, messages: prev.messages.map(m => (m.id === optimistic.id ? { ...real, replyTo: draft.replyTo } : m)) }
                : prev));
            void apiDmList().then(setConvos);
        } else {
            setOpenConvo(prev => (prev && prev.id === convoId
                ? { ...prev, messages: prev.messages.filter(m => m.id !== optimistic.id) }
                : prev));
            setSendError(res.error ?? t('birdy.failedToSend', 'Failed to send'));
        }
    }

    function reactToMessage(messageId: string, emoji: string) {
        setOpenConvo(prev => (prev
            ? { ...prev, messages: prev.messages.map(m => (m.id === messageId ? { ...m, reactions: toggleReactionLocal(m.reactions, emoji) } : m)) }
            : prev));
        void apiDmReact(messageId, emoji).then(rx => {
            if (!rx) return;
            setOpenConvo(prev => (prev
                ? { ...prev, messages: prev.messages.map(m => (m.id === messageId ? { ...m, reactions: rx } : m)) }
                : prev));
        });
    }

    function payRequest(_messageId: string, amount: number) {
        if (!openConvoId) return;
        void sendMessage(openConvoId, { kind: 'money', body: `$${amount}`, amount });
    }

    function selectTab(t: Tab) {
        setTab(t);
        setOpenPostId(null);
        setOpenConvoId(null);
        setProfileOpen(false);
        setEditingProfile(false);
    }

    function openProfile(handle?: string) {
        const target = typeof handle === 'string' ? handle : undefined;
        setProfile(null);
        setProfileTarget(target ?? null);
        setProfileOpen(true);
    }

    function toggleFollow(handle: string) {
        void apiToggleFollow(handle);
    }

    async function addReply(parentId: string, body: string) {
        const reply = await apiReply(parentId, body);
        if (!reply) return;
        setOpenPost(prev => prev && prev.id === parentId
            ? { ...prev, replies: prev.replies + 1, thread: [...(prev.thread ?? []), reply] }
            : prev);
    }

    const animateNav = useDidEnter(authed && (!openConvoId || !!openConvo));

    let content: React.ReactNode;
    if (tab === 'home') {
        content = <Feed posts={posts} me={me} feed={feed} onFeedChange={switchFeed} onRefresh={refreshNow} onToggleLike={toggleLike} onToggleRepost={toggleRepost} onOpenPost={setOpenPostId} onOpenProfile={openProfile} onOpenAuthor={openProfile} />;
    } else if (tab === 'search') {
        content = <Search onOpenProfile={openProfile} />;
    } else if (tab === 'notifications') {
        content = <Notifications onOpenProfile={openProfile} />;
    } else {
        content = <MessagesList conversations={convos} onOpen={setOpenConvoId} onOpenProfile={openProfile} onCompose={openDmWith} />;
    }

    const postOverlay = openPostId ? (
        <PostPush onClose={() => setOpenPostId(null)} animateIn={animateNav}>
            {close => openPost
                ? (
                    <PostDetail
                        post={openPost}
                        me={me}
                        onBack={close}
                        onToggleLike={() => toggleLike(openPost.id)}
                        onToggleRepost={() => toggleRepost(openPost.id)}
                        onToggleReplyLike={rid => toggleLike(rid)}
                        onOpenAuthor={openProfile}
                        onReply={b => addReply(openPost.id, b)}
                    />
                )
                : <LoadingPane onBack={close} />}
        </PostPush>
    ) : null;

    const showComposeFab = tab === 'home' && !profileOpen;

    if (!authChecked) {
        return <div className="absolute inset-0 z-10" style={{ background: BG }} />;
    }
    if (!authed) {
        return (
            <AppAuth
                appName="Birdy"
                tagline={t('birdy.tagline', 'Where the city starts conversations.')}
                icon="birdy"
                theme={{
                    accent:      BLUE,
                    welcomeBg:   '#ffffff',
                    welcomeText: 'dark',
                }}
                myNumber={myNumber}
                myEmail={myEmail}
                savedLogin={savedLogin}
                fields={[
                    { key: 'username', label: t('birdy.username', 'Username') },
                    { key: 'name',     label: t('birdy.name', 'Name') },
                    { key: 'password', label: t('birdy.password', 'Password'), type: 'password' },
                    { key: 'email',    label: t('birdy.email', 'Email'), suffix: `@${MAIL_DOMAIN}`, createOnly: true },
                    { key: 'phone',    label: t('birdy.phone', 'Phone'), type: 'tel',   createOnly: true },
                    { key: 'bio',      label: t('birdy.bio', 'Bio'), createOnly: true, optional: true },
                ]}
                onSubmit={async (mode, vals) => {
                    if (mode === 'create') {
                        const r = await apiRegister({ name: vals.name ?? '', username: vals.username ?? '', password: vals.password ?? '', bio: vals.bio ?? '', email: vals.email ?? '', phone: vals.phone });
                        return { ok: r.ok, message: r.message };
                    }
                    const r = await apiLogin({ username: vals.username ?? '', password: vals.password ?? '' });
                    return { ok: r.ok, message: r.message };
                }}
                onAuthed={() => { setAuthed(true); setJustAuthed(true); void apiMe().then(s => { if (s.me) setMe(s.me); }); }}
                onRequestReset={(id) => accountsRequestReset('birdy', id)}
                onConfirmReset={(id, code, pw) => accountsConfirmReset('birdy', id, code, pw)}
                onSuggestCode={(id) => accountsSuggestCode('birdy', id)}
                onSaveCredentials={(vals) => accountsSavePassword('birdy', vals)}
            />
        );
    }

    return (
        <div className={`absolute inset-0 z-10 flex flex-col text-black ${justAuthed ? 'animate-swipe-in-left' : ''}`} style={{ background: BG }}>
            <div className="h-[54px] shrink-0" aria-hidden />

            <div key={tab} className="relative z-0 min-h-0 flex-1 overflow-hidden animate-swipe-in-left">
                {content}
                {showComposeFab && (
                    <FabButton onClick={() => setComposing(true)} label={t('birdy.newPost', 'New post')} className="bottom-[9px] right-5 z-10">
                        <Pen className="h-6 w-6 text-white" strokeWidth={2} />
                    </FabButton>
                )}
                {postOverlay}
            </div>

            <nav className="shrink-0 border-t border-black/10 px-2 pb-12 pt-4" style={{ background: BG }}>
                <div className="flex items-stretch justify-around">
                    <NavButton active={tab === 'home'} onClick={() => selectTab('home')}>
                        <House className="h-[34px] w-[34px]" strokeWidth={tab === 'home' ? 2.2 : 2} fill="none" />
                    </NavButton>
                    <NavButton active={tab === 'search'} onClick={() => selectTab('search')}>
                        <SearchIcon className="h-[34px] w-[34px]" strokeWidth={tab === 'search' ? 2.7 : 2} />
                    </NavButton>
                    <NavButton active={tab === 'notifications'} onClick={() => selectTab('notifications')} badge={notifCount}>
                        <Bell className="h-[34px] w-[34px]" strokeWidth={2} fill={tab === 'notifications' ? 'currentColor' : 'none'} />
                    </NavButton>
                    <NavButton
                        active={tab === 'messages'}
                        onClick={() => selectTab('messages')}
                        badge={convos.reduce((n, c) => n + (c.unread ?? 0), 0)}
                    >
                        <Mail className="h-[34px] w-[34px]" strokeWidth={tab === 'messages' ? 2.7 : 2} />
                    </NavButton>
                </div>
            </nav>

            {tab === 'messages' && openConvoId && (
                openConvo ? (
                    <ChatView
                        convo={openConvo}
                        onBack={() => setOpenConvoId(null)}
                        onSend={d => sendMessage(openConvo.id, d)}
                        onReact={reactToMessage}
                        onPayRequest={payRequest}
                        animateIn={animateNav}
                    />
                ) : (
                    <div className="absolute inset-0 z-20 flex flex-col" style={{ background: '#e5e5e5' }}>
                        <div className="h-[58px] shrink-0" aria-hidden />
                        <div className="flex shrink-0 items-center px-2 pb-3">
                            <button type="button" onClick={() => setOpenConvoId(null)} aria-label={t('birdy.back', 'Back')} className="active:opacity-60" style={{ color: BLUE }}>
                                <ChevronLeft className="h-[38px] w-[38px]" strokeWidth={2.4} />
                            </button>
                        </div>
                        <div className="flex flex-1 items-center justify-center text-[14px] text-black/40">{t('birdy.loading', 'Loading…')}</div>
                    </div>
                )
            )}

            {/* Not gated on !openPostId, or comment authors are unreachable. */}
            {profileOpen && !openConvoId && (
                <SlideOver onClose={() => { setProfileOpen(false); setProfileTarget(null); }} animateIn={animateNav}>
                    {close => (
                        <Profile
                            profile={profile}
                            me={me}
                            handle={profileTarget ?? undefined}
                            onBack={close}
                            onEdit={() => setEditingProfile(true)}
                            onOpenPost={setOpenPostId}
                            onToggleLike={toggleLike}
                            onToggleRepost={toggleRepost}
                            onToggleFollow={toggleFollow}
                            onMessage={openDmWith}
                            onOpenAuthor={openProfile}
                        />
                    )}
                </SlideOver>
            )}

            {composing && <Composer onClose={() => setComposing(false)} onPost={addPost} />}

            {editingProfile && profile && (
                <EditProfile
                    profile={profile}
                    onCancel={() => setEditingProfile(false)}
                    onSaved={p => { setProfile(p); setMe({ name: p.name, handle: p.handle, verified: p.verified }); setEditingProfile(false); }}
                    onSignOut={() => { setEditingProfile(false); setProfileOpen(false); setAuthed(false); }}
                    onDeleted={() => { setEditingProfile(false); setProfileOpen(false); setAuthed(false); }}
                />
            )}

            {sendError && (
                <AlertDialog
                    title={t('birdy.couldntSend', "Couldn't send")}
                    message={sendError}
                    hideCancel
                    confirmLabel={t('birdy.ok', 'OK')}
                    onCancel={() => setSendError(null)}
                    onConfirm={() => setSendError(null)}
                />
            )}

            <button
                type="button"
                onClick={onClose}
                aria-label={t('birdy.closeBirdy', 'Close Birdy')}
                className="absolute inset-x-0 bottom-0 z-[5] h-5 cursor-default"
            />
        </div>
    );
}

function LoadingPane({ onBack }: { onBack: () => void }) {
    return (
        <div className="flex h-full flex-col" style={{ background: BG }}>
            <header className="flex shrink-0 items-center border-b border-black/10 px-3 py-2.5">
                <button type="button" onClick={onBack} aria-label={t('birdy.back', 'Back')} style={{ color: BLUE }} className="text-[15px]">{t('birdy.back', 'Back')}</button>
            </header>
            <div className="flex flex-1 items-center justify-center text-[13px]" style={{ color: '#536471' }}>{t('birdy.loading', 'Loading…')}</div>
        </div>
    );
}

function FabButton({ onClick, label, children, className }: { onClick: () => void; label: string; children: React.ReactNode; className?: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className={`absolute flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 ${className ?? 'bottom-[124px] right-5 z-30'}`}
            style={{ background: BLUE }}
        >
            {children}
        </button>
    );
}

function NavButton({ active, onClick, children, badge = 0 }: { active: boolean; onClick: () => void; children: React.ReactNode; badge?: number }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex flex-1 items-center justify-center py-2 ${active ? 'text-black' : ''}`}
            style={active ? undefined : { color: 'rgba(0,0,0,0.45)' }}
        >
            <span className="relative inline-flex">
                {children}
                {badge > 0 && (
                    <span
                        className="absolute -top-1.5 -right-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold leading-none text-white"
                        style={{ background: BLUE, boxShadow: `0 0 0 2px ${BG}` }}
                    >
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </span>
        </button>
    );
}

function PostPush({ onClose, children, animateIn = true }: { onClose: () => void; children: (close: () => void) => React.ReactNode; animateIn?: boolean }) {
    const { goBack, pageStyle } = useIosPush(onClose, animateIn);
    return <div className="absolute inset-0 z-20" style={{ ...pageStyle, background: BG }}>{children(goBack)}</div>;
}

function SlideOver({ onClose, children, animateIn = true }: { onClose: () => void; children: (close: () => void) => React.ReactNode; animateIn?: boolean }) {
    const [shown, setShown] = useState(!animateIn);
    useEffect(() => {
        if (!animateIn) return;
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, [animateIn]);
    return (
        <div
            className="absolute inset-0 z-30"
            style={{
                transform:  shown ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
                willChange: 'transform',
            }}
            onTransitionEnd={e => { if (e.target === e.currentTarget && !shown) onClose(); }}
        >
            {children(() => setShown(false))}
        </div>
    );
}
