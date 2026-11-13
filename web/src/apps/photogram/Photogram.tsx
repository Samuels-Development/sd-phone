import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { t } from '@/i18n';
import { fetchNui, isFiveM } from '@/core/nui';
import { useStatusBarLight } from '@/shell/useStatusBarLight';
import { useDeckActive } from '@/shell/deckActive';
import { useDeeplinkTarget } from '@/shell/deeplink';
import { useRefreshOnReconnect } from '@/hooks/useRefreshOnReconnect';
import { clearSessionState, useSessionState } from '@/hooks/useSessionState';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useAppAuth } from '@/hooks/useAppAuth';
import { AppAuth } from '@/shared/AppAuth';
import { AccountSwitcher } from '@/shared/AccountSwitcher';
import { MAIL_DOMAIN, accountsConfirmReset, accountsLogin, accountsLogout, accountsMe, accountsRegister, accountsRequestReset, accountsSavePassword, accountsSuggestCode, accountsSwitch } from '@/core/accountsApi';
import { signOutAllForApp } from '@/shared/signOutAll';
import { logOutOrSwitch, switchTargetLabel } from '@/shared/logOutOrSwitch';
import { IG, type Comment as IGComment, type Post, type ProfileData, type User } from './data';
import {
    apiActivity, apiAddComment, apiAddStory, apiComments, apiCounts, apiCreate, apiDeleteAccount, apiDeletePost, apiDeleteStory, apiDismissNotification, apiShareProfile, apiExplore, apiFeed,
    apiFollowRequests, apiPost, apiProfile, apiProfilePosts, apiRespondFollow, apiStories, apiToggleCommentLike,
    apiToggleLike, apiToggleSave, apiUpdateProfile, apiWatch, mapComment,
    type ActivityItem, type FollowUser, type LiveEntry, type NewStory, type ProfileView, type SrvComment, type StoryGroup,
} from './photogramApi';
import { ActionSheet } from '@/ui/ActionSheet';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { ShareSheet } from '@/shared/ShareSheet';
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
import { StoryComposer } from './stories/StoryComposer';
import { CreateSheet } from './create/CreateSheet';
import { Comments } from './feed/Comments';
import { DirectMessages } from './dms/DirectMessages';
import { EditProfile } from './profile/EditProfile';
import { LiveStream } from './live/LiveStream';
import { LiveViewer } from './live/LiveViewer';
import { AlertDialog } from '@/ui/AlertDialog';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export function Photogram({ onClose: _onClose }: { onClose: () => void }) {
    const { authed, setAuthed, authChecked, justAuthed, setJustAuthed, myNumber, myEmails, savedLogin, savedAccounts, refreshAccounts } = useAppAuth('photogram',
        () => accountsMe('photogram').then(s => s.loggedIn));

    useStatusBarLight(authed ? false : null);

    const [tab,        setTab]        = useSessionState<GTab>('photogram:tab', 'home');
    const [createOpen, setCreateOpen] = useSessionState('photogram:createOpen', false);
    const [dmOpen,     setDmOpen]     = useSessionState('photogram:dmOpen', false);
    const [commentId,  setCommentId]  = useSessionState<string | null>('photogram:commentId', null);
    const [editing,    setEditing]    = useState(false);
    const [sharingMe,  setSharingMe]  = useState(false);

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

    function openProfileFromLink(handle: string) {
        setDetail(null);
        setFollows(null);
        setCommentId(null);
        setDmOpen(false);
        setCreateOpen(false);
        setEditing(false);
        setViewHandle(handle);
    }
    useDeeplinkTarget('photogram', target => openProfileFromLink(String(target.handle)));
    useNuiEvent('sd-phone:photogram:openProfile', data => { if (data?.handle) openProfileFromLink(String(data.handle)); });

    useEffect(() => {
        if (!isFiveM) return;
        void fetchNui<{ enabled?: boolean }>('sd-phone:photogram:liveEnabled')
            .then(r => setLiveEnabled(r?.enabled === true))
            .catch(() => setLiveEnabled(false));
    }, []);
    const [storyPick,  setStoryPick]  = useState(false);
    const [storyDraft, setStoryDraft] = useState<{ media?: string[] } | null>(null);
    const [profileStory, setProfileStory] = useState<StoryGroup | null>(null);
    const [storyNonce, setStoryNonce] = useState(0);
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

    const refreshStories = useCallback(() => {
        return apiStories().then(r => { setStories(r.stories); setHasOwnStory(r.hasOwn); setLives(r.lives); });
    }, []);
    const refreshHome = useCallback(() => {
        return Promise.all([apiFeed().then(setPosts), refreshStories()]);
    }, [refreshStories]);
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

    const afterAccountChange = useCallback(() => {
        clearSessionState('photogram:');
        setTab('home');
        setDetail(null);
        setViewHandle(null);
        setFollows(null);
        setCommentId(null);
        setDmOpen(false);
        setCreateOpen(false);
        setEditing(false);
        setActivity([]);
        setRequests([]);
        setExplore([]);
        setComments({});
        refreshAccounts();
        refreshMe();
        void refreshHome();
        refreshCounts();
        refreshActivity();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshAccounts, refreshMe, refreshHome, refreshCounts, refreshActivity]);

    useEffect(() => { if (authed) refreshCounts(); }, [dmOpen, authed, refreshCounts]);

    const deckActive = useDeckActive();
    const wasActive = useRef(deckActive);
    useEffect(() => {
        if (!deckActive) return;
        apiWatch(true);
        return () => { apiWatch(false); };
    }, [deckActive]);

    const [syncNonce, setSyncNonce] = useState(0);
    useEffect(() => {
        const returning = deckActive && !wasActive.current;
        wasActive.current = deckActive;
        if (returning) setSyncNonce(n => n + 1);
    }, [deckActive]);

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
        void refreshStories();
    }, [refreshStories]));
    useNuiEvent('sd-phone:photogram:postRemoved', useCallback((data) => {
        if (!data) return;
        const id = data.postId;
        setPosts(prev => prev.filter(p => p.id !== id));
        setExplore(prev => prev.filter(p => p.id !== id));
        setDetail(prev => (prev && prev.id === id ? null : prev));
        setCommentId(prev => (prev === id ? null : prev));
    }, [setCommentId, setDetail]));

    const shareStory = useCallback(async (story: NewStory) => {
        const res = await apiAddStory(story);
        if (res.success) {
            setStoryDraft(null);
            setStoryNonce(n => n + 1);
            void refreshHome();
        }
        return res;
    }, [refreshHome]);
    const deleteStory = useCallback(async (storyId: string) => {
        const res = await apiDeleteStory(storyId);
        if (res.success) {
            setStories(prev => prev.map(g => (g.isMe ? { ...g, frames: g.frames.filter(f => f.id !== storyId) } : g)));
            setProfileStory(prev => prev && { ...prev, frames: prev.frames.filter(f => f.id !== storyId) });
            setStoryNonce(n => n + 1);
            void refreshHome();
        }
        return res;
    }, [refreshHome]);
    const afterStoryViewer = useCallback(() => {
        setStoryNonce(n => n + 1);
        void refreshStories();
    }, [refreshStories]);

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
                appId="photogram"
                appName="Photogram"
                tagline={t('photogram.tagline', 'Sign up to see photos from your friends.')}
                icon="photogram"
                theme={{ accent: IG.blue, welcomeBg: '#f2f2f2', welcomeText: 'dark' }}
                myNumber={myNumber}
                myEmails={myEmails}
                savedAccounts={savedAccounts}
                onPickAccount={u => accountsSwitch('photogram', u)}
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
                    if (adding) { setAdding(false); afterAccountChange(); }
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
            <StatusBarSpacer />

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <TabPane key={tab} animate={animateNav}>
                    {tab === 'home'     && <Feed posts={posts} me={myUser} stories={stories} lives={lives} hasOwnStory={hasOwnStory} onLike={toggleLike} onDoubleLike={likeOn} onSave={toggleSave} onComment={openComments} onOpenStory={setStoryIdx} onOpenLive={setViewLive} onAddStory={() => setStoryMenu(true)} onOpenDMs={() => setDmOpen(true)} onOpenProfile={setViewHandle} onShare={setSharePost} onDelete={setPendingDelete} onRefresh={refreshHome} dmCount={counts.dms} />}
                    {tab === 'search'   && <Explore posts={explore} onOpen={p => setDetail(p)} onOpenProfile={setViewHandle} />}
                    {tab === 'activity' && <Activity items={activity} requests={requests} onRespond={async (h, a) => { await apiRespondFollow(h, a); refreshActivity(); }} onOpenProfile={setViewHandle} onOpenPost={openDetailById} onDismiss={(id) => { setActivity(prev => prev.filter(n => n.id !== id)); void apiDismissNotification(id); }} />}
                    {tab === 'profile'  && me && <Profile profile={me} posts={myGrid} story={stories.find(g => g.isMe) ?? null} onEdit={() => setEditing(true)} onShare={() => setSharingMe(true)} onOpenPost={p => setDetail(p)} onOpenFollows={(handle, kind) => setFollows({ handle, kind })} onOpenStory={setProfileStory} />}
                </TabPane>
            </div>

            <TabBar tab={tab} onTab={setTab} onCreate={() => setCreateOpen(true)} avatar={myUser?.avatar} activityCount={counts.activity} />

            {storyIdx !== null && <StoryViewer stories={stories} startIndex={storyIdx} onClose={() => { setStoryIdx(null); afterStoryViewer(); }} onDelete={deleteStory} onOpenProfile={h => { setStoryIdx(null); afterStoryViewer(); setViewHandle(h); }} />}
            {profileStory && <StoryViewer stories={[profileStory]} startIndex={0} onClose={() => { setProfileStory(null); afterStoryViewer(); }} onDelete={deleteStory} onOpenProfile={h => { setProfileStory(null); afterStoryViewer(); setViewHandle(h); }} />}
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
                        onOpenStory={setProfileStory}
                        onChanged={refreshHome}
                        storyNonce={storyNonce}
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
                        { label: t('photogram.createTextStoryAction', 'Create text story'), onClick: () => setStoryDraft({}) },
                        ...(liveEnabled
                            ? [{ label: t('photogram.goLiveAction', 'Go live'), onClick: () => setLiveConfirm(true) }]
                            : []),
                    ]}
                    onClose={() => setStoryMenu(false)}
                />
            )}
            {storyPick && (
                <MediaPickerSheet
                    multiple
                    max={10}
                    onSelectMany={ps => { if (ps.length > 0) setStoryDraft({ media: ps.map(p => p.url) }); setStoryPick(false); }}
                    onClose={() => setStoryPick(false)}
                />
            )}
            {storyDraft && <StoryComposer media={storyDraft.media} me={myUser} onClose={() => setStoryDraft(null)} onShare={shareStory} />}
            {switching && (
                <AccountSwitcher
                    app="photogram"
                    onClose={() => setSwitching(false)}
                    onSwitched={afterAccountChange}
                    onAdd={() => setAdding(true)}
                />
            )}
            {sharePost && <SharePostSheet post={sharePost} onClose={() => setSharePost(null)} />}
            {sharingMe && (
                <ShareSheet top="60%" onClose={() => setSharingMe(false)} onShare={target => apiShareProfile(target.id)}>
                    <p className="px-2 pb-2 text-center text-[15px] leading-snug text-ios-gray">
                        {t('photogram.shareProfileHint', 'Tap someone nearby to send your profile. When they accept, they follow you.')}
                    </p>
                </ShareSheet>
            )}
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
                    switchTo={switchTargetLabel(savedAccounts[0])}
                    onSignOut={() => {
                        setEditing(false);
                        void logOutOrSwitch('photogram').then(switched => {
                            if (switched) afterAccountChange();
                            else { clearSessionState('photogram:'); refreshAccounts(); setAuthed(false); }
                        });
                    }}
                    onSignOutAll={() => {
                        setEditing(false);
                        void signOutAllForApp('photogram').then(() => { refreshAccounts(); setAuthed(false); });
                    }}
                    onSwitchAccount={() => { setEditing(false); setSwitching(true); }}
                    onDelete={() => { setEditing(false); clearSessionState('photogram:'); void apiDeleteAccount(); void accountsLogout('photogram'); refreshAccounts(); setAuthed(false); }}
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
