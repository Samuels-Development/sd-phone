import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { t } from '@/i18n';
import { fetchNui, isFiveM } from '@/core/nui';
import { useStatusBarLight } from '@/shell/useStatusBarLight';
import { useDeckActive } from '@/shell/deckActive';
import { useRefreshOnReconnect } from '@/hooks/useRefreshOnReconnect';
import { clearSessionState, useSessionState } from '@/hooks/useSessionState';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useAppAuth } from '@/hooks/useAppAuth';
import { AppAuth } from '@/shared/AppAuth';
import { AccountSwitcher } from '@/shared/AccountSwitcher';
import { MAIL_DOMAIN, accountsConfirmReset, accountsForgetPassword, accountsLogin, accountsLogout, accountsMe, accountsRegister, accountsRequestReset, accountsSavePassword, accountsSuggestCode } from '@/core/accountsApi';
import { IG, type Comment as IGComment, type Post, type ProfileData, type User } from './data';
import {
    apiActivity, apiAddComment, apiAddStory, apiComments, apiCounts, apiCreate, apiDeleteAccount, apiDeletePost, apiDismissNotification, apiExplore, apiFeed,
    apiFollowRequests, apiPost, apiProfile, apiProfilePosts, apiStories, apiToggleCommentLike,
    apiToggleLike, apiToggleSave, apiUpdateProfile, apiWatch, mapComment,
    type ActivityItem, type FollowUser, type LiveEntry, type ProfileView, type SrvComment, type StoryGroup,
} from './photogramApi';
import { ActionSheet } from '@/ui/ActionSheet';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { TabBar, type GTab } from './TabBar';
import { Feed } from './feed/Feed';
import { Explore } from './feed/Explore';
import { Activity } from './profile/Activity';
import { Profile } from './profile/Profile';
import { UserProfile } from './profile/UserProfile';
import { FollowList } from './profile/FollowList';
import { PostDetail } from './feed/PostDetail';
import { SharePostSheet } from './create/SharePostSheet';
import { StoryViewer } from './stories/StoryViewer';
import { CreateSheet } from './create/CreateSheet';
import { Comments } from './feed/Comments';
import { DirectMessages } from './dms/DirectMessages';
import { EditProfile } from './profile/EditProfile';
import { LiveStream } from './live/LiveStream';
import { LiveViewer } from './live/LiveViewer';
import { AlertDialog } from '@/ui/AlertDialog';

export function Photogram({ onClose: _onClose }: { onClose: () => void }) {
    const { authed, setAuthed, authChecked, justAuthed, setJustAuthed, myNumber, myEmail, savedLogin } = useAppAuth('photogram',
        () => accountsMe('photogram').then(s => s.loggedIn));

    useStatusBarLight(authed ? false : null);

    const [tab,        setTab]        = useSessionState<GTab>('photogram:tab', 'home');
    const [createOpen, setCreateOpen] = useSessionState('photogram:createOpen', false);
    const [dmOpen,     setDmOpen]     = useSessionState('photogram:dmOpen', false);
    const [commentId,  setCommentId]  = useSessionState<string | null>('photogram:commentId', null);
    const [editing,    setEditing]    = useState(false);

    const [me,         setMe]         = useState<ProfileView | null>(null);
    const [posts,      setPosts]      = useState<Post[]>([]);
    const [explore,    setExplore]    = useState<Post[]>([]);
    const [stories,    setStories]    = useState<StoryGroup[]>([]);
    const [lives,      setLives]      = useState<LiveEntry[]>([]);
    const [hasOwnStory, setHasOwnStory] = useState(false);
    const [activity,   setActivity]   = useState<ActivityItem[]>([]);
    const [requests,   setRequests]   = useState<FollowUser[]>([]);
    const [myGrid,     setMyGrid]     = useState<Post[]>([]);
    const [comments,   setComments]   = useState<Record<string, IGComment[]>>({});
    const [counts,     setCounts]     = useState<{ activity: number; dms: number }>({ activity: 0, dms: 0 });
    const [storyIdx,   setStoryIdx]   = useState<number | null>(null);
    const [viewHandle, setViewHandle] = useSessionState<string | null>('photogram:viewHandle', null);
    const [detail,     setDetail]     = useSessionState<Post | null>('photogram:detail', null);
    const [follows,    setFollows]    = useSessionState<{ handle: string; kind: 'followers' | 'following' } | null>('photogram:follows', null);
    const [storyMenu,  setStoryMenu]  = useState(false);
    const [switching,  setSwitching]  = useState(false);
    const [adding,     setAdding]     = useState(false);
    const [liveEnabled, setLiveEnabled] = useState(!isFiveM);

    useEffect(() => {
        if (!isFiveM) return;
        void fetchNui<{ enabled?: boolean }>('sd-phone:photogram:liveEnabled')
            .then(r => setLiveEnabled(r?.enabled === true))
            .catch(() => setLiveEnabled(false));
    }, []);
    const [storyPick,  setStoryPick]  = useState(false);
    const [sharePost,  setSharePost]  = useState<Post | null>(null);
    const [pendingDelete, setPendingDelete] = useState<Post | null>(null);
    const [liveConfirm, setLiveConfirm] = useState(false);
    const [liveOpen,    setLiveOpen]    = useState(false);
    const [viewLive,    setViewLive]    = useState<LiveEntry | null>(null);

    const [zOrder, setZOrder] = useState<string[]>([]);
    const bump = (key: string, open: boolean) =>
        setZOrder(prev => { const w = prev.filter(k => k !== key); return open ? [...w, key] : w; });
    useLayoutEffect(() => bump('detail',   !!detail),     [detail]);
    useLayoutEffect(() => bump('profile',  !!viewHandle), [viewHandle]);
    useLayoutEffect(() => bump('follows',  !!follows),    [follows]);
    useLayoutEffect(() => bump('comments', !!commentId),  [commentId]);
    const zOf = (key: string) => { const i = zOrder.indexOf(key); return i < 0 ? 41 : 41 + i; };

    const didEnter = useRef(false);
    useEffect(() => { if (authed && me) didEnter.current = true; }, [authed, me]);
    const animateNav = didEnter.current;

    const myUser: User | null = me ? { id: me.username, handle: me.username, avatar: me.avatar, verified: me.verified } : null;

    const refreshHome = useCallback(() => {
        return Promise.all([
            apiFeed().then(setPosts),
            apiStories().then(r => { setStories(r.stories); setHasOwnStory(r.hasOwn); setLives(r.lives); }),
        ]);
    }, []);
    const refreshMe = useCallback(() => {
        void apiProfile().then(setMe);
        void apiProfilePosts().then(setMyGrid);
    }, []);
    const refreshCounts = useCallback(() => { void apiCounts().then(setCounts); }, []);
    const refreshActivity = useCallback(() => {
        void apiActivity().then(items => { setActivity(items); refreshCounts(); });
        void apiFollowRequests().then(setRequests);
    }, [refreshCounts]);

    useEffect(() => {
        if (!authed) return;
        refreshMe();
        refreshHome();
        refreshCounts();
    }, [authed, refreshMe, refreshHome, refreshCounts]);

    useEffect(() => { if (authed) refreshCounts(); }, [dmOpen, authed, refreshCounts]);

    // Content pushes reach only the phones showing Photogram, so the subscription follows the
    // foreground. AppDeck keeps this subtree alive, so returning to it is not a remount.
    const deckActive = useDeckActive();
    const wasActive = useRef(deckActive);
    useEffect(() => {
        if (!deckActive) return;
        apiWatch(true);
        return () => { apiWatch(false); };
    }, [deckActive]);

    // Re-sync on the way back in: anything pushed while this phone was not listening is missed.
    const [syncNonce, setSyncNonce] = useState(0);
    useEffect(() => {
        const returning = deckActive && !wasActive.current;
        wasActive.current = deckActive;
        if (returning) setSyncNonce(n => n + 1);
    }, [deckActive]);

    // The same refresh for someone who never left the screen while driving back into coverage.
    useRefreshOnReconnect(useCallback(() => setSyncNonce(n => n + 1), []));

    useEffect(() => {
        if (!authed) return;
        if (tab === 'home')     refreshHome();
        if (tab === 'search')   void apiExplore().then(setExplore);
        if (tab === 'activity') refreshActivity();
        if (tab === 'profile')  refreshMe();
    }, [tab, authed, syncNonce, refreshActivity, refreshMe, refreshHome]);

    useNuiEvent('sd-phone:photogram:notification', useCallback(() => {
        if (tab === 'activity') refreshActivity(); else refreshCounts();
    }, [tab, refreshActivity, refreshCounts]));
    useNuiEvent('sd-phone:photogram:dmReceived', useCallback(() => { refreshCounts(); }, [refreshCounts]));

    const patch = useCallback((id: string, fn: (p: Post) => Post) => {
        setPosts(prev => prev.map(p => p.id === id ? fn(p) : p));
        setExplore(prev => prev.map(p => p.id === id ? fn(p) : p));
        setDetail(prev => prev && prev.id === id ? fn(prev) : prev);
    }, []);

    const toggleLike = useCallback((id: string) => {
        patch(id, p => ({ ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) }));
        void apiToggleLike(id);
    }, [patch]);
    const likeOn = useCallback((id: string) => {
        patch(id, p => p.liked ? p : { ...p, liked: true, likes: p.likes + 1 });
        void apiToggleLike(id);
    }, [patch]);
    const toggleSave = useCallback((id: string) => {
        patch(id, p => ({ ...p, saved: !p.saved }));
        void apiToggleSave(id);
    }, [patch]);

    const deletePost = useCallback((id: string) => {
        setPosts(prev => prev.filter(p => p.id !== id));
        setExplore(prev => prev.filter(p => p.id !== id));
        setMyGrid(prev => prev.filter(p => p.id !== id));
        setDetail(prev => (prev && prev.id === id ? null : prev));
        setCommentId(prev => (prev === id ? null : prev));
        void apiDeletePost(id).then(() => { void refreshMe(); });
    }, [setDetail, setCommentId, refreshMe]);

    useNuiEvent('sd-phone:photogram:postChanged', useCallback((data) => {
        if (!data) return;
        const { postId, likes, comments, comment } = data;
        patch(postId, p => ({ ...p, likes: likes ?? p.likes, comments: comments ?? p.comments }));
        if (comment) {
            const mapped = mapComment(comment as SrvComment);
            setComments(prev => {
                const list = prev[postId];
                if (!list || list.some(x => x.id === mapped.id)) return prev;
                return { ...prev, [postId]: [...list, mapped] };
            });
        }
    }, [patch]));
    useNuiEvent('sd-phone:photogram:feedChanged', useCallback(() => {
        void apiFeed().then(setPosts);
        if (tab === 'search') void apiExplore().then(setExplore);
    }, [tab]));
    useNuiEvent('sd-phone:photogram:liveChanged', useCallback(() => {
        void apiStories().then(r => { setStories(r.stories); setHasOwnStory(r.hasOwn); setLives(r.lives); });
    }, []));
    useNuiEvent('sd-phone:photogram:postRemoved', useCallback((data) => {
        if (!data) return;
        const id = data.postId;
        setPosts(prev => prev.filter(p => p.id !== id));
        setExplore(prev => prev.filter(p => p.id !== id));
        setDetail(prev => (prev && prev.id === id ? null : prev));
        setCommentId(prev => (prev === id ? null : prev));
    }, [setCommentId, setDetail]));

    async function openComments(postId: string) {
        setCommentId(postId);
        const cs = await apiComments(postId);
        setComments(prev => ({ ...prev, [postId]: cs }));
    }
    async function addComment(id: string, c: { text?: string; gifUrl?: string }) {
        const res = await apiAddComment(id, c);
        if (!res) return;
        setComments(prev => {
            const list = prev[id] ?? [];
            if (list.some(x => x.id === res.comment.id)) return prev;
            return { ...prev, [id]: [...list, res.comment] };
        });
        patch(id, p => ({ ...p, comments: res.count }));
    }
    function toggleCommentLike(postId: string, cid: string) {
        setComments(prev => ({
            ...prev,
            [postId]: (prev[postId] ?? []).map(c => c.id === cid
                ? { ...c, liked: !c.liked, likes: (c.likes ?? 0) + (c.liked ? -1 : 1) }
                : c),
        }));
        void apiToggleCommentLike(cid);
    }
    async function addPost(images: string[], caption: string, location?: string) {
        const post = await apiCreate(images, caption, location);
        if (post) setPosts(prev => [post, ...prev]);
        setCreateOpen(false);
        setTab('home');
        refreshMe();
    }

    async function openDetailById(postId: string) {
        const r = await apiPost(postId);
        if (!r) return;
        setComments(prev => ({ ...prev, [postId]: r.comments }));
        setDetail(r.post);
    }

    const commentPost = commentId ? (posts.find(p => p.id === commentId) ?? explore.find(p => p.id === commentId) ?? (detail?.id === commentId ? detail : null)) : null;

    if (!authChecked) return <div className="absolute inset-0 z-10 bg-[#f2f2f2]" />;

    const authScreen = (
            <AppAuth
                appName="Photogram"
                tagline={t('photogram.tagline', 'Sign up to see photos from your friends.')}
                icon="photogram"
                theme={{ accent: IG.blue, welcomeBg: '#f2f2f2', welcomeText: 'dark' }}
                myNumber={myNumber}
                myEmail={myEmail}
                savedLogin={adding ? null : savedLogin}
                onDismiss={adding ? () => setAdding(false) : undefined}
                modal={adding}
                fields={[
                    { key: 'username', label: t('photogram.username', 'Username') },
                    { key: 'name',     label: t('photogram.name', 'Name') },
                    { key: 'password', label: t('photogram.password', 'Password'), type: 'password' },
                    { key: 'email',    label: t('photogram.email', 'Email'),    suffix: `@${MAIL_DOMAIN}`, createOnly: true },
                    { key: 'phone',    label: t('photogram.phone', 'Phone'),    type: 'tel',   createOnly: true },
                ]}
                onSubmit={(mode, vals) => (mode === 'create' ? accountsRegister('photogram', vals) : accountsLogin('photogram', vals))}
                onAuthed={() => {
                    setAuthed(true);
                    setJustAuthed(true);
                    if (adding) { setAdding(false); clearSessionState('photogram:'); refreshHome(); }
                }}
                onRequestReset={(id) => accountsRequestReset('photogram', id)}
                onConfirmReset={(id, code, pw) => accountsConfirmReset('photogram', id, code, pw)}
                onSuggestCode={(id) => accountsSuggestCode('photogram', id)}
                onSaveCredentials={(vals) => accountsSavePassword('photogram', vals)}
            />
    );

    if (!authed) return authScreen;

    return (
        <div className={`absolute inset-0 flex flex-col bg-[#f2f2f2] font-sf ${justAuthed ? 'animate-swipe-in-left' : ''}`}>
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <TabPane key={tab} animate={animateNav}>
                    {tab === 'home'     && <Feed posts={posts} me={myUser} stories={stories} lives={lives} hasOwnStory={hasOwnStory} onLike={toggleLike} onDoubleLike={likeOn} onSave={toggleSave} onComment={openComments} onOpenStory={setStoryIdx} onOpenLive={setViewLive} onAddStory={() => setStoryMenu(true)} onOpenDMs={() => setDmOpen(true)} onOpenProfile={setViewHandle} onShare={setSharePost} onDelete={setPendingDelete} onRefresh={refreshHome} dmCount={counts.dms} />}
                    {tab === 'search'   && <Explore posts={explore} onOpen={p => setDetail(p)} onOpenProfile={setViewHandle} />}
                    {tab === 'activity' && <Activity items={activity} requests={requests} onRespond={async (h, a) => { await import('./photogramApi').then(m => m.apiRespondFollow(h, a)); refreshActivity(); }} onOpenProfile={setViewHandle} onOpenPost={openDetailById} onDismiss={(id) => { setActivity(prev => prev.filter(n => n.id !== id)); void apiDismissNotification(id); }} />}
                    {tab === 'profile'  && me && <Profile profile={me} posts={myGrid} onEdit={() => setEditing(true)} onOpenPost={p => setDetail(p)} onOpenFollows={(handle, kind) => setFollows({ handle, kind })} />}
                </TabPane>
            </div>

            <TabBar tab={tab} onTab={setTab} onCreate={() => setCreateOpen(true)} avatar={myUser?.avatar} activityCount={counts.activity} />

            {storyIdx !== null && <StoryViewer stories={stories} startIndex={storyIdx} onClose={() => setStoryIdx(null)} />}
            {createOpen && <CreateSheet onClose={() => setCreateOpen(false)} onPost={addPost} animateIn={animateNav} />}
            {dmOpen && myUser && <DirectMessages me={myUser} onClose={() => setDmOpen(false)} onOpenPost={openDetailById} animateIn={animateNav} />}
            {detail && (
                <div className="absolute inset-0" style={{ zIndex: zOf('detail') }}>
                    <PostDetail post={detail} me={myUser} onBack={() => setDetail(null)} onLike={toggleLike} onDoubleLike={likeOn} onSave={toggleSave} onComment={openComments} onOpenProfile={setViewHandle} onShare={setSharePost} onDelete={setPendingDelete} animateIn={animateNav} />
                </div>
            )}
            {viewHandle && myUser && (
                <div className="absolute inset-0" style={{ zIndex: zOf('profile') }}>
                    <UserProfile
                        handle={viewHandle}
                        me={myUser}
                        onBack={() => setViewHandle(null)}
                        onOpenProfile={setViewHandle}
                        onOpenPost={p => setDetail(p)}
                        onOpenFollows={(handle, kind) => setFollows({ handle, kind })}
                        onChanged={refreshHome}
                        animateIn={animateNav}
                    />
                </div>
            )}
            {follows && (
                <div className="absolute inset-0" style={{ zIndex: zOf('follows') }}>
                    <FollowList
                        username={follows.handle}
                        initial={follows.kind}
                        onBack={() => setFollows(null)}
                        onOpenProfile={h => { setFollows(null); setViewHandle(h); }}
                        onChanged={refreshHome}
                        animateIn={animateNav}
                    />
                </div>
            )}
            {storyMenu && (
                <ActionSheet
                    actions={[
                        { label: t('photogram.createStoryAction', 'Create story'), onClick: () => setStoryPick(true) },
                        ...(liveEnabled
                            ? [{ label: t('photogram.goLiveAction', 'Go live'), onClick: () => setLiveConfirm(true) }]
                            : []),
                    ]}
                    onClose={() => setStoryMenu(false)}
                />
            )}
            {storyPick && (
                <MediaPickerSheet
                    onSelect={p => { void apiAddStory(p.url).then(refreshHome); setStoryPick(false); }}
                    onClose={() => setStoryPick(false)}
                />
            )}
            {switching && (
                <AccountSwitcher
                    app="photogram"
                    onClose={() => setSwitching(false)}
                    onSwitched={() => { clearSessionState('photogram:'); refreshHome(); }}
                    onAdd={() => setAdding(true)}
                />
            )}
            {sharePost && <SharePostSheet post={sharePost} onClose={() => setSharePost(null)} />}
            {pendingDelete && (
                <AlertDialog
                    title={t('photogram.deletePostTitle', 'Delete Post?')}
                    message={t('photogram.deletePostMessage', "This post will be permanently removed. This can't be undone.")}
                    confirmLabel={t('photogram.delete', 'Delete')}
                    cancelLabel={t('photogram.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setPendingDelete(null)}
                    onConfirm={() => { deletePost(pendingDelete.id); setPendingDelete(null); }}
                />
            )}
            {liveConfirm && (
                <AlertDialog
                    title={t('photogram.goLiveTitle', 'Go Live?')}
                    message={t('photogram.goLiveMessage', "You're about to start a live video. Anyone who can see your posts can watch.")}
                    confirmLabel={t('photogram.goLiveConfirm', 'Go Live')}
                    cancelLabel={t('photogram.cancel', 'Cancel')}
                    onCancel={() => setLiveConfirm(false)}
                    onConfirm={() => { setLiveConfirm(false); setLiveOpen(true); }}
                />
            )}
            {liveOpen && <LiveStream onClose={() => setLiveOpen(false)} />}
            {viewLive && <LiveViewer liveId={viewLive.liveId} host={viewLive.user} onClose={() => setViewLive(null)} />}
            {commentPost && myUser && (
                <div className="absolute inset-0" style={{ zIndex: zOf('comments') }}>
                    <Comments
                        post={commentPost}
                        me={myUser}
                        comments={comments[commentPost.id] ?? []}
                        onBack={() => setCommentId(null)}
                        onSubmit={c => addComment(commentPost.id, c)}
                        onToggleLike={cid => toggleCommentLike(commentPost.id, cid)}
                        onOpenProfile={setViewHandle}
                        animateIn={animateNav}
                    />
                </div>
            )}
            {editing && me && (
                <EditProfile
                    profile={{ name: me.name, bio: me.bio, avatar: me.avatar, private: me.isPrivate } as ProfileData}
                    onCancel={() => setEditing(false)}
                    onSave={async p => { const updated = await apiUpdateProfile({ name: p.name, bio: p.bio, avatar: p.avatar, private: p.private }); if (updated) setMe(updated); setEditing(false); }}
                    onSignOut={() => { setEditing(false); clearSessionState('photogram:'); void accountsLogout('photogram'); setAuthed(false); }}
                    onSwitchAccount={() => { setEditing(false); setSwitching(true); }}
                    onDelete={() => { setEditing(false); clearSessionState('photogram:'); void apiDeleteAccount(); void accountsForgetPassword('photogram'); void accountsLogout('photogram'); setAuthed(false); }}
                />
            )}

            {adding && <div className="absolute inset-0 z-[70]">{authScreen}</div>}
        </div>
    );
}

function TabPane({ animate, children }: { animate: boolean; children: ReactNode }) {
    const [enter] = useState(animate);
    return <div className={`flex min-h-0 flex-1 flex-col ${enter ? 'animate-swipe-in-left' : ''}`}>{children}</div>;
}
