import { fetchNui, isFiveM } from '@/core/nui';
import { apiCall, apiData as call } from '@/core/api';
import { formatClockTime } from '@/lib/time';
import type { MessageDraft } from '@/shared/chat/ChatView';
import type { Reaction } from '@/shared/chat/data';
import devBanner    from '@/assets/photos/background14.webp';
import devBannerAlt from '@/assets/photos/background9.webp';
import devPfp1 from '@/assets/photos/background3.webp';
import devPfp2 from '@/assets/photos/background4.webp';
import devPfp3 from '@/assets/photos/background6.webp';
import devPfp4 from '@/assets/photos/background11.webp';
import devPfp5 from '@/assets/photos/background16.webp';
import {
    MARCUS, CURRENT_USER, TOMMY, newId, SEED_CONVERSATIONS, SEED_NOTIFICATIONS, SEED_POSTS,
    type BirdyAuthor, type BirdyConversation, type BirdyFollowUser, type BirdyMessage, type BirdyNotification, type BirdyPost, type BirdyProfile,
} from './data';



function clock(): string {
    return formatClockTime(new Date(), true);
}

let devLoggedIn = import.meta.env.DEV;

export interface AuthState { loggedIn: boolean; me: BirdyAuthor | null }
export interface AuthResult { ok: boolean; me?: BirdyAuthor; message?: string }

export async function apiMe(): Promise<AuthState> {
    if (!isFiveM) return { loggedIn: devLoggedIn, me: devLoggedIn ? CURRENT_USER : null };
    const data = await call<{ loggedIn: boolean; me?: BirdyAuthor }>('sd-phone:birdy:me');
    return { loggedIn: !!data?.loggedIn, me: data?.me ?? null };
}

export async function apiRegister(input: { name: string; username: string; password: string; bio: string; email: string; phone?: string }): Promise<AuthResult> {
    if (!isFiveM) { devLoggedIn = true; return { ok: true, me: CURRENT_USER }; }
    const res = await apiCall<{ me: BirdyAuthor }>('sd-phone:birdy:register', input);
    return res.success ? { ok: true, me: res.data?.me } : { ok: false, message: res.message };
}

export async function apiLogin(input: { username: string; password: string }): Promise<AuthResult> {
    if (!isFiveM) { devLoggedIn = true; return { ok: true, me: CURRENT_USER }; }
    const res = await apiCall<{ me: BirdyAuthor }>('sd-phone:birdy:login', input);
    return res.success ? { ok: true, me: res.data?.me } : { ok: false, message: res.message };
}

export async function apiLogout(): Promise<void> {
    if (!isFiveM) { devLoggedIn = false; return; }
    await fetchNui('sd-phone:birdy:logout');
}

export async function apiFeed(following: boolean): Promise<BirdyPost[]> {
    // Dev seed: treat other authors as followed so the tab is not empty.
    if (!isFiveM) return following ? SEED_POSTS.filter(p => p.author.handle !== 'you') : SEED_POSTS;
    return (await call<{ posts: BirdyPost[] }>('sd-phone:birdy:feed', { following }))?.posts ?? [];
}

export async function apiPostDetail(id: string): Promise<BirdyPost | null> {
    if (!isFiveM) return SEED_POSTS.find(p => p.id === id) ?? null;
    return (await call<{ post: BirdyPost }>('sd-phone:birdy:post', { id }))?.post ?? null;
}

export async function apiCreate(body: string, images?: string[]): Promise<BirdyPost | null> {
    if (!isFiveM) {
        return { id: newId('post'), author: CURRENT_USER, body, images, createdAt: Date.now(), replies: 0, reposts: 0, likes: 0, liked: false, views: 0 };
    }
    return (await call<{ post: BirdyPost }>('sd-phone:birdy:create', { body, images }))?.post ?? null;
}

export async function apiReply(parentId: string, body: string): Promise<BirdyPost | null> {
    if (!isFiveM) {
        return { id: newId('reply'), author: CURRENT_USER, body, createdAt: Date.now(), replies: 0, reposts: 0, likes: 0, liked: false };
    }
    return (await call<{ post: BirdyPost }>('sd-phone:birdy:reply', { parentId, body }))?.post ?? null;
}

export async function apiToggleLike(id: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:birdy:toggleLike', { id });
}

export async function apiNotificationCount(): Promise<number> {
    if (!isFiveM) return SEED_NOTIFICATIONS.length;
    return (await call<{ count: number }>('sd-phone:birdy:notificationCount'))?.count ?? 0;
}

export async function apiToggleRepost(id: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:birdy:toggleRepost', { id });
}

export async function apiNotifications(): Promise<BirdyNotification[]> {
    if (!isFiveM) return SEED_NOTIFICATIONS;
    return (await call<{ notifications: BirdyNotification[] }>('sd-phone:birdy:notifications'))?.notifications ?? [];
}

export async function apiDmList(): Promise<BirdyConversation[]> {
    if (!isFiveM) return DEV_DMS;
    return (await call<{ conversations: BirdyConversation[] }>('sd-phone:birdy:dmList'))?.conversations ?? [];
}

export async function apiDmThread(id: string): Promise<BirdyConversation | null> {
    if (!isFiveM) return DEV_DMS.find(c => c.id === id) ?? null;
    const data = await call<{ id: string; user: BirdyAuthor; messages: BirdyMessage[] }>('sd-phone:birdy:dmThread', { id });
    return data ? { id: data.id, user: data.user, updated: '', messages: data.messages } : null;
}

export async function apiDmResolve(handle: string): Promise<{ id: string; user: BirdyAuthor } | null> {
    if (!isFiveM) {
        const u = [MARCUS, TOMMY].find(a => a.handle === handle);
        return u ? { id: `c-${u.handle}`, user: u } : null;
    }
    return (await call<{ id: string; user: BirdyAuthor }>('sd-phone:birdy:dmResolve', { handle })) ?? null;
}

export async function apiDmMarkRead(id: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:birdy:dmMarkRead', { id });
}

export interface DmSendResult { message: BirdyMessage | null; error?: string }

export async function apiDmSend(toCid: string, draft: MessageDraft): Promise<DmSendResult> {
    if (!isFiveM) {
        return { message: {
            id: newId('m'), fromMe: true, body: draft.body, at: clock(), ts: Date.now(),
            kind: draft.kind,
            gifUrl: draft.gifUrl, amount: draft.amount, requested: draft.requested,
            duration: draft.duration, audioUrl: draft.audioUrl, waveform: draft.waveform,
            wpCode: draft.wpCode, wpSub: draft.wpSub,
        } };
    }
    const r = await apiCall<{ message: BirdyMessage }>('sd-phone:birdy:dmSend', { toCid, ...draft });
    if (r.success && r.data?.message) return { message: r.data.message };
    return { message: null, error: r.message };
}

export async function apiDmReact(messageId: string, emoji: string): Promise<Reaction[] | null> {
    if (!isFiveM) return null;
    const r = await call<{ id: string; reactions: Reaction[] }>('sd-phone:birdy:dmReact', { id: messageId, emoji });
    if (!r) return null;
    return Array.isArray(r.reactions) ? r.reactions : [];
}

const DEV_PROFILE: BirdyProfile = {
    name: 'Los Santos', handle: 'lossantos', verified: true,
    bio: 'Just living the Los Santos life',
    joined: 'May 2021', following: 4, followers: 5, protected: false,
    banner: devBanner,
};

const DEV_FOLLOWERS: BirdyFollowUser[] = [
    { name: 'Marcus',        handle: 'marcus', verified: false, bio: 'Sandy Shores local',            avatar: devPfp1, followsYou: true,  isFollowing: true },
    { name: 'Tommy V',       handle: 'tommy',  verified: false, bio: 'Vinewood dreamer',              avatar: devPfp2, followsYou: false, isFollowing: true },
    { name: 'Los Santos Gov', handle: 'lspd',  verified: false, bio: 'Official government account',   avatar: devPfp3, followsYou: false, isFollowing: true },
    { name: 'Marina V.',     handle: 'marina', verified: false, bio: 'Photography · coffee · code',   avatar: devPfp4, followsYou: false, isFollowing: true },
    { name: '/dev/null',     handle: 'devnull', verified: false, bio: 'I swallow bugs for a living',  avatar: devPfp5, followsYou: false, isFollowing: true },
];
const DEV_FOLLOWING: BirdyFollowUser[] = DEV_FOLLOWERS.filter(u => u.handle !== 'lspd');

const DEV_DMS: BirdyConversation[] = DEV_FOLLOWING
    .filter(f => DEV_FOLLOWERS.some(r => r.handle === f.handle))
    .map(u => SEED_CONVERSATIONS.find(c => c.user.handle === u.handle) ?? {
        id:       `dm-${u.handle}`,
        user:     { name: u.name, handle: u.handle, verified: u.verified },
        updated:  '',
        messages: [],
    });

export async function apiProfile(handle?: string): Promise<BirdyProfile> {
    if (!isFiveM) {
        if (handle && handle !== CURRENT_USER.handle) {
            const a = [MARCUS, TOMMY].find(x => x.handle === handle);
            return { name: a?.name ?? handle, handle, verified: a?.verified ?? false, bio: '', joined: 'May 2021', following: 0, followers: 0, protected: false, banner: devBannerAlt, isMe: false, isFollowing: false };
        }
        return { ...DEV_PROFILE, isMe: true, isFollowing: false };
    }
    return (await call<{ profile: BirdyProfile }>('sd-phone:birdy:profile', handle ? { handle } : undefined))?.profile ?? DEV_PROFILE;
}

export async function apiProfilePosts(kind: 'posts' | 'replies' | 'media' | 'likes', handle?: string): Promise<BirdyPost[]> {
    if (!isFiveM) {
        const who = handle ?? CURRENT_USER.handle;
        const theirs = SEED_POSTS.filter(p => p.author.handle === who);
        if (kind === 'posts')  return theirs;
        if (kind === 'media')  return theirs.filter(p => !!p.images && p.images.length > 0);
        if (kind === 'likes')  return who === CURRENT_USER.handle ? SEED_POSTS.filter(p => p.liked) : [];
        return [];
    }
    return (await call<{ posts: BirdyPost[] }>('sd-phone:birdy:profilePosts', { kind, handle }))?.posts ?? [];
}

export async function apiSearch(query: string): Promise<BirdyAuthor[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    if (!isFiveM) {
        return [CURRENT_USER, MARCUS, TOMMY].filter(a => a.handle.toLowerCase().includes(q) || a.name.toLowerCase().includes(q));
    }
    return (await call<{ users: BirdyAuthor[] }>('sd-phone:birdy:search', { query }))?.users ?? [];
}

export async function apiToggleFollow(handle: string): Promise<boolean> {
    if (!isFiveM) return true;
    return (await call<{ following: boolean }>('sd-phone:birdy:toggleFollow', { handle }))?.following ?? false;
}

export async function apiFollowList(kind: 'followers' | 'following', handle?: string): Promise<BirdyFollowUser[]> {
    if (!isFiveM) {
        if (handle && handle !== CURRENT_USER.handle) return [];
        return kind === 'following' ? DEV_FOLLOWING : DEV_FOLLOWERS;
    }
    return (await call<{ users: BirdyFollowUser[] }>('sd-phone:birdy:followList', { kind, handle }))?.users ?? [];
}

// `joined` is derived from created_at server-side.
export async function apiUpdateProfile(input: { name: string; bio: string; protected: boolean; avatar?: string; banner?: string }): Promise<BirdyProfile | null> {
    if (!isFiveM) return { ...DEV_PROFILE, ...input };
    return (await call<{ profile: BirdyProfile }>('sd-phone:birdy:updateProfile', input))?.profile ?? null;
}

export async function apiDeleteAccount(): Promise<void> {
    if (!isFiveM) { devLoggedIn = false; return; }
    await fetchNui('sd-phone:birdy:deleteAccount');
}
