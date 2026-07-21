import { useCallback, useRef, useState } from 'react';
import { ChevronLeft, Home, Inbox as InboxIcon, Plus, Search, User } from 'lucide-react';

import { useStatusBarLight } from '@/shell/useStatusBarLight';
import { setLaunchIntent } from '@/shell/launchIntent';
import { useSessionState } from '@/hooks/useSessionState';
import { isVideoUrl } from '@/core/photosApi';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useAppAuth } from '@/hooks/useAppAuth';
import { AlertDialog } from '@/ui/AlertDialog';
import { AppAuth } from '@/shared/AppAuth';
import { MAIL_DOMAIN, accountsConfirmReset, accountsLogin, accountsLogout, accountsMe, accountsRegister, accountsRequestReset, accountsSavePassword, accountsSuggestCode } from '@/core/accountsApi';
import { t } from '@/i18n';
import { ACCENT, GRAD_FROM, GRAD_TO, fmt, type VLive, type VPost, type VProfile } from './data';
import {
    apiAddView, apiCounts, apiDeletePost, apiFeed, apiLives, apiPost, apiProfile, apiToggleFollow,
    apiToggleLike, apiToggleSave, type FeedTab,
} from './vibezApi';
import { Feed, type FeedHandlers } from './Feed';
import { Discover } from './Discover';
import { Inbox } from './Inbox';
import { Profile } from './Profile';
import { UploadOverlay } from './UploadOverlay';
import { CommentsSheet } from './CommentsSheet';
import { LiveHost } from './live/LiveHost';
import { LiveViewer } from './live/LiveViewer';

type Tab = 'home' | 'discover' | 'inbox' | 'profile';

interface ViewerState { posts: VPost[]; index: number }

export function Vibez({ onClose: _onClose }: { onClose: () => void }) {
    const { authed, setAuthed, authChecked, justAuthed, setJustAuthed, myNumber, myEmail, savedLogin } = useAppAuth('vibez',
        () => accountsMe('vibez').then(s => s.loggedIn));

    useStatusBarLight(authed ? true : null);

    const [tab,     setTab]     = useSessionState<Tab>('vibez:tab', 'home');
    const [feedTab, setFeedTab] = useSessionState<FeedTab>('vibez:feedTab', 'foryou');
    const [upload,  setUpload]  = useSessionState('vibez:upload', false);
    // Timestamp of a "Record with Camera" hand-off; the next video that lands in the
    // gallery within the window pulls the player back here with the clip preloaded.
    const [pendingRecord, setPendingRecord] = useSessionState<number>('vibez:pendingRecord', 0);
    const [composeUrl,    setComposeUrl]    = useSessionState<string | null>('vibez:composeUrl', null);

    const [posts,         setPosts]         = useState<VPost[]>([]);
    const [viewer,        setViewer]        = useState<ViewerState | null>(null);
    const [profileHandle, setProfileHandle] = useState<string | null>(null);
    const [commentsPost,  setCommentsPost]  = useState<VPost | null>(null);
    const [liveHost,      setLiveHost]      = useState(false);
    const [liveJoin,      setLiveJoin]      = useState<VLive | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [unread,        setUnread]        = useState(0);
    const [refreshKey,    setRefreshKey]    = useState(0);
    const [me,            setMe]            = useState<VProfile | null>(null);

    const viewedRef = useRef(new Set<string>());

    const { loading: feedLoading, refetch: refetchFeed } = useAsyncData<VPost[]>(
        () => apiFeed(feedTab),
        [feedTab, refreshKey],
        { enabled: authed === true, onData: setPosts },
    );
    const { data: lives, refetch: refetchLives } = useAsyncData<VLive[]>(
        () => apiLives(),
        [refreshKey],
        { enabled: authed === true },
    );
    useAsyncData<VProfile | null>(
        () => apiProfile(),
        [refreshKey],
        { enabled: authed === true, onData: setMe },
    );
    useAsyncData<number>(
        () => apiCounts(),
        [],
        { enabled: authed === true, onData: setUnread },
    );

    const bumpRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

    useNuiEvent('sd-phone:vibez:notification', useCallback(() => {
        void apiCounts().then(setUnread);
    }, []));
    // A clip recorded via the camera hand-off just hit the gallery: jump back into
    // Vibez with the compose step preloaded. The 10-minute window keeps unrelated
    // recordings from yanking the player into the app later.
    useNuiEvent('sd-phone:photos:added', useCallback((data) => {
        if (!pendingRecord || Date.now() - pendingRecord > 10 * 60 * 1000) return;
        if (!data?.url || !isVideoUrl(data.url)) return;
        setPendingRecord(0);
        setComposeUrl(data.url);
        setUpload(true);
        window.postMessage({ action: 'sd-phone:launchApp', data: { id: 'vibez' } }, '*');
    }, [pendingRecord, setPendingRecord, setComposeUrl, setUpload]));
    useNuiEvent('sd-phone:vibez:feedChanged', useCallback(() => { bumpRefresh(); }, [bumpRefresh]));
    useNuiEvent('sd-phone:vibez:liveChanged', useCallback(() => { refetchLives(); }, [refetchLives]));
    useNuiEvent('sd-phone:vibez:postChanged', useCallback((data) => {
        if (!data?.postId) return;
        const patch = (p: VPost) => p.id === data.postId
            ? { ...p, ...(data.likes !== undefined ? { likes: data.likes } : {}), ...(data.comments !== undefined ? { comments: data.comments } : {}) }
            : p;
        setPosts(prev => prev.map(patch));
        setViewer(prev => prev ? { ...prev, posts: prev.posts.map(patch) } : prev);
    }, []));
    useNuiEvent('sd-phone:vibez:postRemoved', useCallback((data) => {
        if (!data?.postId) return;
        setPosts(prev => prev.filter(p => p.id !== data.postId));
        setViewer(prev => prev ? { ...prev, posts: prev.posts.filter(p => p.id !== data.postId) } : prev);
    }, []));
    useNuiEvent('sd-phone:vibez:followChanged', useCallback((data) => {
        if (!data?.target) return;
        const patch = (p: VPost) => p.user.handle === data.target ? { ...p, following: data.following } : p;
        setPosts(prev => prev.map(patch));
        setViewer(prev => prev ? { ...prev, posts: prev.posts.map(patch) } : prev);
    }, []));

    const patchEverywhere = useCallback((fn: (p: VPost) => VPost) => {
        setPosts(prev => prev.map(fn));
        setViewer(prev => prev ? { ...prev, posts: prev.posts.map(fn) } : prev);
    }, []);

    const handlers: FeedHandlers = {
        onToggleLike: (id) => {
            patchEverywhere(p => p.id === id
                ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) }
                : p);
            void apiToggleLike(id);
        },
        onLikeOn: (id) => {
            let wasLiked = true;
            patchEverywhere(p => {
                if (p.id !== id) return p;
                wasLiked = p.liked;
                return p.liked ? p : { ...p, liked: true, likes: p.likes + 1 };
            });
            if (!wasLiked) void apiToggleLike(id);
        },
        onToggleSave: (id) => {
            patchEverywhere(p => p.id === id
                ? { ...p, saved: !p.saved, saves: p.saves + (p.saved ? -1 : 1) }
                : p);
            void apiToggleSave(id);
        },
        onOpenComments: (post) => setCommentsPost(post),
        onOpenProfile:  (handle) => setProfileHandle(handle),
        onToggleFollow: (handle) => {
            patchEverywhere(p => p.user.handle === handle ? { ...p, following: !p.following } : p);
            void apiToggleFollow(handle);
        },
        onView: (id) => {
            if (viewedRef.current.has(id)) return;
            viewedRef.current.add(id);
            void apiAddView(id);
        },
        onDelete: (id) => setConfirmDelete(id),
    };

    const openPostList = useCallback((list: VPost[], index: number) => {
        setViewer({ posts: list, index });
    }, []);
    const openPostId = useCallback((postId: string) => {
        void apiPost(postId).then(r => { if (r) setViewer({ posts: [r.post], index: 0 }); });
    }, []);

    if (!authChecked) {
        return <div className="absolute inset-0 z-10 bg-black" />;
    }
    if (!authed) {
        return (
            <AppAuth
                appName="vibez"
                tagline={t('vibez.tagline', 'Catch the vibe. Share yours.')}
                icon="vibez"
                theme={{ accent: ACCENT, welcomeBg: '#0a0518', welcomeText: 'light' }}
                myNumber={myNumber}
                myEmail={myEmail}
                savedLogin={savedLogin}
                fields={[
                    { key: 'username', label: t('vibez.username', 'Username') },
                    { key: 'name',     label: t('vibez.name', 'Name') },
                    { key: 'password', label: t('vibez.password', 'Password'), type: 'password' },
                    { key: 'email',    label: t('vibez.email', 'Email'), suffix: `@${MAIL_DOMAIN}`, createOnly: true },
                    { key: 'phone',    label: t('vibez.phone', 'Phone'), type: 'tel',   createOnly: true },
                ]}
                onSubmit={(mode, vals) => (mode === 'create' ? accountsRegister('vibez', vals) : accountsLogin('vibez', vals))}
                onAuthed={() => { setAuthed(true); setJustAuthed(true); }}
                onRequestReset={(id) => accountsRequestReset('vibez', id)}
                onConfirmReset={(id, code, pw) => accountsConfirmReset('vibez', id, code, pw)}
                onSuggestCode={(id) => accountsSuggestCode('vibez', id)}
                onSaveCredentials={(vals) => accountsSavePassword('vibez', vals)}
            />
        );
    }

    return (
        <div className={`absolute inset-0 z-10 flex flex-col select-none overflow-hidden bg-black text-white ${justAuthed ? 'animate-swipe-in-left' : ''}`}>
            <div className="min-h-0 flex-1 overflow-hidden">
                {tab === 'home' && (
                    <Feed
                        posts={posts}
                        tab={feedTab}
                        onTab={setFeedTab}
                        lives={lives ?? []}
                        onOpenLive={setLiveJoin}
                        myHandle={me?.username}
                        loading={feedLoading}
                        handlers={handlers}
                    />
                )}
                {tab === 'discover' && (
                    <Discover onOpenPost={openPostList} onOpenProfile={setProfileHandle} refreshKey={refreshKey} />
                )}
                {tab === 'inbox' && (
                    <Inbox
                        onOpenPostId={openPostId}
                        onOpenProfile={setProfileHandle}
                        onSeen={() => setUnread(0)}
                        refreshKey={refreshKey}
                    />
                )}
                {tab === 'profile' && (
                    <Profile
                        onOpenPost={openPostList}
                        onSignOut={() => { void accountsLogout('vibez'); setAuthed(false); }}
                        refreshKey={refreshKey}
                    />
                )}
            </div>

            <nav className="shrink-0 bg-black px-2 pb-12 pt-2.5">
                <div className="flex items-end justify-around">
                    <NavItem label={t('vibez.home', 'Home')} active={tab === 'home'} onClick={() => setTab('home')}>
                        <Home className="h-[26px] w-[26px]" strokeWidth={tab === 'home' ? 2.4 : 2} fill={tab === 'home' ? 'currentColor' : 'none'} />
                    </NavItem>
                    <NavItem label={t('vibez.discover', 'Discover')} active={tab === 'discover'} onClick={() => setTab('discover')}>
                        <Search className="h-[25px] w-[25px]" strokeWidth={tab === 'discover' ? 2.6 : 2} />
                    </NavItem>

                    <button
                        type="button"
                        aria-label={t('vibez.create', 'Create')}
                        onClick={() => setUpload(true)}
                        className="relative flex h-[32px] w-[46px] items-center justify-center rounded-[11px] active:scale-95 transition-transform"
                        style={{ background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})`, boxShadow: `0 0 14px ${GRAD_FROM}66` }}
                    >
                        <Plus className="h-5 w-5 text-white" strokeWidth={3} />
                    </button>

                    <NavItem label={t('vibez.inbox', 'Inbox')} active={tab === 'inbox'} onClick={() => setTab('inbox')}>
                        <span className="relative">
                            <InboxIcon className="h-[25px] w-[25px]" strokeWidth={tab === 'inbox' ? 2.6 : 2} />
                            {unread > 0 && (
                                <span
                                    className="absolute -right-2 -top-1 flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                                    style={{ background: GRAD_TO }}
                                >
                                    {fmt(unread)}
                                </span>
                            )}
                        </span>
                    </NavItem>
                    <NavItem label={t('vibez.profile', 'Profile')} active={tab === 'profile'} onClick={() => setTab('profile')}>
                        <User className="h-[25px] w-[25px]" strokeWidth={tab === 'profile' ? 2.6 : 2} fill={tab === 'profile' ? 'currentColor' : 'none'} />
                    </NavItem>
                </div>
            </nav>

            {profileHandle && (
                <div className="absolute inset-0 z-20 bg-black">
                    <Profile
                        handle={profileHandle}
                        onBack={() => setProfileHandle(null)}
                        onOpenPost={openPostList}
                        refreshKey={refreshKey}
                    />
                </div>
            )}

            {viewer && (
                <div className="absolute inset-0 z-30 bg-black">
                    <Feed
                        posts={viewer.posts}
                        myHandle={me?.username}
                        handlers={handlers}
                        initialIndex={viewer.index}
                    />
                    <button
                        type="button"
                        aria-label={t('vibez.back', 'Back')}
                        onClick={() => setViewer(null)}
                        className="absolute left-3 top-[58px] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm active:opacity-70"
                    >
                        <ChevronLeft className="h-5 w-5 text-white" strokeWidth={2.6} />
                    </button>
                </div>
            )}

            {commentsPost && (
                <CommentsSheet
                    post={commentsPost}
                    onClose={() => setCommentsPost(null)}
                    onCountChange={(postId, count) => patchEverywhere(p => p.id === postId ? { ...p, comments: count } : p)}
                />
            )}

            {upload && (
                <UploadOverlay
                    myHandle={me?.username}
                    initialUrl={composeUrl}
                    onRecord={() => {
                        setPendingRecord(Date.now());
                        setUpload(false);
                        setLaunchIntent('camera', { mode: 'VIDEO' });
                        window.postMessage({ action: 'sd-phone:launchApp', data: { id: 'camera' } }, '*');
                    }}
                    onClose={() => { setUpload(false); setComposeUrl(null); }}
                    onPosted={(post) => {
                        setUpload(false);
                        setComposeUrl(null);
                        setPosts(prev => [post, ...prev]);
                        setTab('home');
                        refetchFeed();
                    }}
                    onGoLive={() => { setUpload(false); setLiveHost(true); }}
                />
            )}

            {confirmDelete && (
                <AlertDialog
                    title={t('vibez.deleteVibeTitle', 'Delete this vibe?')}
                    message={t('vibez.deleteVibeMessage', 'The vibe, its comments, likes and saves are permanently removed.')}
                    confirmLabel={t('vibez.delete', 'Delete')}
                    cancelLabel={t('vibez.cancel', 'Cancel')}
                    destructive
                    forceDark
                    onCancel={() => setConfirmDelete(null)}
                    onConfirm={() => {
                        const id = confirmDelete;
                        setConfirmDelete(null);
                        setPosts(prev => prev.filter(p => p.id !== id));
                        setViewer(prev => prev ? { ...prev, posts: prev.posts.filter(p => p.id !== id) } : prev);
                        void apiDeletePost(id);
                    }}
                />
            )}

            {liveHost && <LiveHost onClose={() => { setLiveHost(false); refetchLives(); }} />}
            {liveJoin && <LiveViewer liveId={liveJoin.liveId} host={liveJoin.user} onClose={() => setLiveJoin(null)} />}
        </div>
    );
}

function NavItem({ label, active, onClick, children }: {
    label:    string;
    active:   boolean;
    onClick:  () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="flex w-14 flex-col items-center gap-0.5 active:opacity-70"
            style={{ color: active ? '#fff' : 'rgba(255,255,255,0.6)' }}
        >
            {children}
            <span className="text-[10px] font-medium leading-none">{label}</span>
        </button>
    );
}
