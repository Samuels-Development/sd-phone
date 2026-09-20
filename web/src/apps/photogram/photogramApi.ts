import { t } from '@/i18n';
import { relTimeCompact } from '@/lib/time';
import { fetchNui, isFiveM } from '@/core/nui';
import { apiCall, apiData as call } from '@/core/api';
import type { MessageDraft } from '@/shared/chat/ChatView';
import type { RelayGrant } from '@/shared/mediaSocket';
import type { Reaction } from '@/shared/chat/data';
import {
    ACTIVITY, COMMENTS, DMS, EXPLORE, MY_POSTS, POSTS, STORIES,
    type Comment, type DM, type DMsg, type Notif, type Post, type SharedPost, type User,
} from './data';


interface SrvPost extends Omit<Post, 'time'> { createdAt: number }
export interface SrvComment extends Omit<Comment, 'time'> { createdAt: number }
interface SrvNotif { id: string; kind: NotifKind; user: User; text: string; thumb?: string; postId?: string; seen: boolean; createdAt: number }
interface SrvConvo { id: string; user: User; last: DMsg | null; unread: number; ts: number }

export type NotifKind = 'like' | 'comment' | 'mention' | 'follow' | 'follow_request' | 'follow_accept' | 'post' | 'unfollow';
export type FollowStatus = 'none' | 'pending' | 'accepted' | 'self';

export interface ProfileView {
    username: string;
    name: string;
    bio: string;
    avatar: string;
    verified: boolean;
    isPrivate: boolean;
    isMe: boolean;
    followStatus: FollowStatus;
    followsMe: boolean;
    posts: number;
    followers: number;
    following: number;
    locked: boolean;
}

export interface FollowUser extends User { name?: string; followStatus: FollowStatus }
export interface ActivityItem extends Notif { kind: NotifKind; postId?: string; seen: boolean }
export interface Conversation { id: string; user: User; last: DMsg | null; unread: number; ts: number }
export interface StoryGroup { user: User; isMe: boolean; seen: boolean; frames: { id: string; url: string }[] }
export interface LiveEntry { user: User; liveId: string; startedAt: number }
export interface LiveComment { id: string; user: User; text: string }
export interface LiveJoin {
    liveId:    string;
    host:      User;
    mode?:     'video' | 'image';
    mime?:     string;
    frame?:    string;
    viewers:   number;
    startedAt: number;
    relay:     RelayGrant | null;
}

export interface LiveEncoderConfig { bitrate: number; fps: number; timesliceMs: number; keyframeMs: number }
export const DEFAULT_ENC: LiveEncoderConfig = { bitrate: 900000, fps: 25, timesliceMs: 250, keyframeMs: 4000 };

export interface LiveSession {
    liveId:    string;
    startedAt: number;
    enc:       LiveEncoderConfig;
    streamId:  string | null;
}


const NO_AVATAR =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' width='40' height='40'>" +
        "<rect width='40' height='40' fill='#ccd6dd'/>" +
        "<circle cx='20' cy='15.5' r='7.5' fill='#8b98a5'/>" +
        "<path d='M3,40 C3,28 9.5,23 20,23 C30.5,23 37,28 37,40 Z' fill='#8b98a5'/>" +
        '</svg>',
    );

export function avatarFor(_handle: string, url?: string): string {
    return url && url.length > 0 ? url : NO_AVATAR;
}

export function relTime(ms: number): string {
    return relTimeCompact(ms, {
        nowLabel:       t('photogram.justNow', 'Just now'),
        yesterdayLabel: t('photogram.yesterday', 'Yesterday'),
        dateAfterDays:  7,
    });
}

function fixUser(u: User): User {
    return { ...u, avatar: avatarFor(u.handle, u.avatar) };
}

function mapPost(p: SrvPost): Post {
    return { ...p, user: fixUser(p.user), time: relTime(p.createdAt) };
}
export function mapComment(c: SrvComment): Comment {
    return { ...c, user: fixUser(c.user), time: relTime(c.createdAt) };
}
function mapNotif(n: SrvNotif): ActivityItem {
    return { id: n.id, user: fixUser(n.user), text: n.text, time: relTime(n.createdAt), thumb: n.thumb, follow: n.kind === 'follow', kind: n.kind, postId: n.postId, seen: n.seen };
}
function mapConvo(c: SrvConvo): Conversation {
    return { id: c.id, user: fixUser(c.user), last: c.last, unread: c.unread, ts: c.ts };
}


const DEV_ME: ProfileView = {
    username: 'lossantos', name: 'Los Santos', bio: 'living the city life · dm for collabs 📍',
    avatar: MY_POSTS[0], verified: true, isPrivate: false, isMe: true, followStatus: 'self',
    followsMe: false, posts: MY_POSTS.length, followers: 1243, following: 312, locked: false,
};

export async function apiProfile(handle?: string): Promise<ProfileView | null> {
    if (!isFiveM) {
        if (handle && handle !== DEV_ME.username) {
            const u = [...POSTS, ...Object.values(COMMENTS).flat()].map(x => x.user).find(x => x.handle === handle);
            return { username: handle, name: u?.handle ?? handle, bio: '', avatar: avatarFor(handle, u?.avatar), verified: u?.verified ?? false, isPrivate: false, isMe: false, followStatus: 'none', followsMe: false, posts: 0, followers: 0, following: 0, locked: false };
        }
        return DEV_ME;
    }
    const p = await call<{ profile: ProfileView }>('sd-phone:photogram:profile', handle ? { handle } : undefined);
    if (!p?.profile) return null;
    return { ...p.profile, avatar: avatarFor(p.profile.username, p.profile.avatar) };
}

export async function apiProfilePosts(handle?: string): Promise<Post[]> {
    if (!isFiveM) {
        const who = handle ?? DEV_ME.username;
        if (who !== DEV_ME.username) return [];
        return MY_POSTS.map((url, i) => ({ id: `mine-${i}`, user: { id: 'me', handle: 'lossantos', avatar: DEV_ME.avatar, verified: true }, images: [url], caption: '', likes: 0, comments: 0, time: '' }));
    }
    return (await call<{ posts: SrvPost[] }>('sd-phone:photogram:profilePosts', handle ? { handle } : undefined))?.posts.map(mapPost) ?? [];
}

export async function apiUpdateProfile(input: { name: string; bio: string; avatar: string; private: boolean }): Promise<ProfileView | null> {
    if (!isFiveM) return { ...DEV_ME, name: input.name, bio: input.bio, avatar: input.avatar, isPrivate: input.private };
    const p = await call<{ profile: ProfileView }>('sd-phone:photogram:updateProfile', input);
    return p?.profile ? { ...p.profile, avatar: avatarFor(p.profile.username, p.profile.avatar) } : null;
}


/** Subscribe/unsubscribe this phone to the feed, post and live-list pushes. The server only pushes
 * to watchers, so a phone that is closed or backgrounded no longer pays to receive and discard one. */
export function apiWatch(on: boolean): void {
    if (isFiveM) void fetchNui('sd-phone:photogram:watch', { on });
}

export async function apiFeed(): Promise<Post[]> {
    if (!isFiveM) return POSTS;
    return (await call<{ posts: SrvPost[] }>('sd-phone:photogram:feed'))?.posts.map(mapPost) ?? [];
}

export async function apiExplore(): Promise<Post[]> {
    if (!isFiveM) {
        return EXPLORE.map((url, i) => ({ id: `ex-${i}`, user: POSTS[i % POSTS.length].user, images: [url], caption: '', likes: (i * 37) % 900, comments: i % 12, time: '' }));
    }
    return (await call<{ posts: SrvPost[] }>('sd-phone:photogram:explore'))?.posts.map(mapPost) ?? [];
}

export async function apiPost(id: string): Promise<{ post: Post; comments: Comment[] } | null> {
    if (!isFiveM) {
        const post = POSTS.find(p => p.id === id);
        return post ? { post, comments: COMMENTS[id] ?? [] } : null;
    }
    const r = await call<{ post: SrvPost; comments: SrvComment[] }>('sd-phone:photogram:post', { id });
    return r ? { post: mapPost(r.post), comments: r.comments.map(mapComment) } : null;
}

export async function apiCreate(images: string[], caption: string, location?: string): Promise<Post | null> {
    if (!isFiveM) {
        return { id: 'new-' + Date.now(), user: { id: 'me', handle: 'lossantos', avatar: DEV_ME.avatar, verified: true }, images, caption, location, likes: 0, comments: 0, time: 'Just now' };
    }
    const r = await call<{ post: SrvPost }>('sd-phone:photogram:create', { images, caption, location });
    return r?.post ? mapPost(r.post) : null;
}

export async function apiDeletePost(id: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:deletePost', { id });
}

export async function apiToggleLike(id: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:toggleLike', { id });
}

export async function apiToggleSave(id: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:toggleSave', { id });
}

export async function apiSaved(): Promise<Post[]> {
    if (!isFiveM) return POSTS.filter(p => p.saved);
    return (await call<{ posts: SrvPost[] }>('sd-phone:photogram:saved'))?.posts.map(mapPost) ?? [];
}


export async function apiComments(postId: string): Promise<Comment[]> {
    if (!isFiveM) return COMMENTS[postId] ?? [];
    return (await call<{ comments: SrvComment[] }>('sd-phone:photogram:comments', { postId }))?.comments.map(mapComment) ?? [];
}

export async function apiAddComment(postId: string, c: { text?: string; gifUrl?: string }): Promise<{ comment: Comment; count: number } | null> {
    if (!isFiveM) {
        return { comment: { id: 'me-' + Date.now(), user: { id: 'me', handle: 'lossantos', avatar: DEV_ME.avatar, verified: true }, time: 'now', text: c.text, gifUrl: c.gifUrl }, count: (COMMENTS[postId]?.length ?? 0) + 1 };
    }
    const r = await call<{ comment: SrvComment; count: number }>('sd-phone:photogram:addComment', { postId, ...c });
    return r?.comment ? { comment: mapComment(r.comment), count: r.count } : null;
}

export async function apiToggleCommentLike(commentId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:toggleCommentLike', { commentId });
}


export async function apiToggleFollow(handle: string): Promise<FollowStatus> {
    if (!isFiveM) return 'accepted';
    return (await call<{ status: FollowStatus }>('sd-phone:photogram:toggleFollow', { handle }))?.status ?? 'none';
}

export async function apiRespondFollow(handle: string, accept: boolean): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:respondFollow', { handle, accept });
}

export async function apiFollowRequests(): Promise<FollowUser[]> {
    if (!isFiveM) return [];
    return (await call<{ requests: FollowUser[] }>('sd-phone:photogram:followRequests'))?.requests.map(u => ({ ...u, avatar: avatarFor(u.handle, u.avatar) })) ?? [];
}

export async function apiFollowList(kind: 'followers' | 'following', handle?: string): Promise<FollowUser[]> {
    if (!isFiveM) return [];
    return (await call<{ users: FollowUser[] }>('sd-phone:photogram:followList', { kind, handle }))?.users.map(u => ({ ...u, avatar: avatarFor(u.handle, u.avatar) })) ?? [];
}

export async function apiSearch(query: string): Promise<FollowUser[]> {
    if (!isFiveM) {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const seen = new Set<string>();
        const users: FollowUser[] = [];
        for (const u of [...POSTS, ...Object.values(COMMENTS).flat()].map(x => x.user)) {
            if (seen.has(u.handle) || !u.handle.toLowerCase().includes(q)) continue;
            seen.add(u.handle);
            users.push({ ...u, avatar: avatarFor(u.handle, u.avatar), followStatus: 'none' });
        }
        return users;
    }
    return (await call<{ users: FollowUser[] }>('sd-phone:photogram:search', { query }))?.users.map(u => ({ ...u, avatar: avatarFor(u.handle, u.avatar), followStatus: 'none' as FollowStatus })) ?? [];
}


export async function apiStories(): Promise<{ stories: StoryGroup[]; hasOwn: boolean; lives: LiveEntry[] }> {
    if (!isFiveM) {
        const stories: StoryGroup[] = STORIES.map(s => ({ user: s.user, isMe: false, seen: !!s.seen, frames: s.frames.map((url, i) => ({ id: `${s.user.id}-${i}`, url })) }));
        return { stories, hasOwn: false, lives: [] };
    }
    const r = await call<{ stories: StoryGroup[]; hasOwn: boolean; lives?: LiveEntry[] }>('sd-phone:photogram:stories');
    if (!r) return { stories: [], hasOwn: false, lives: [] };
    return {
        stories: r.stories.map(g => ({ ...g, user: fixUser(g.user) })),
        hasOwn: r.hasOwn,
        lives: (r.lives ?? []).map(l => ({ ...l, user: fixUser(l.user) })),
    };
}


export async function apiLiveStart(): Promise<LiveSession | null> {
    if (!isFiveM) return { liveId: 'dev-live', startedAt: Date.now(), enc: DEFAULT_ENC, streamId: null };
    const r = await call<{ liveId: string; startedAt: number; enc?: Partial<LiveEncoderConfig>; streamId?: string }>('sd-phone:photogram:liveStart');
    if (!r) return null;
    return {
        liveId:    r.liveId,
        startedAt: r.startedAt,
        enc:       { ...DEFAULT_ENC, ...(r.enc ?? {}) },
        streamId:  typeof r.streamId === 'string' && r.streamId.length > 0 ? r.streamId : null,
    };
}

export async function apiLiveJoin(liveId: string, relay = false): Promise<LiveJoin | null> {
    if (!isFiveM) return { liveId, host: { id: 'lossantos', handle: 'lossantos', avatar: '', verified: true }, viewers: 1, startedAt: Date.now(), relay: null };
    const r = await call<LiveJoin>('sd-phone:photogram:liveJoin', { liveId, relay });
    if (!r) return null;
    const grant = r.relay ?? null;
    return {
        ...r,
        host:  fixUser(r.host),
        relay: grant && typeof grant.token === 'string' && typeof grant.url === 'string' ? grant : null,
    };
}

export async function apiLiveLeave(liveId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:liveLeave', { liveId });
}

export async function apiLiveEnd(liveId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:liveEnd', { liveId });
}

export async function apiLiveComment(liveId: string, text: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:liveComment', { liveId, text });
}

export async function apiLiveHeart(liveId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:liveHeart', { liveId });
}

export async function apiLiveFrame(liveId: string, frame: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:liveFrame', { liveId, frame });
}

export async function apiLiveChunk(liveId: string, chunk: string, init: boolean, mime?: string): Promise<boolean> {
    if (!isFiveM) return true;
    const res = await fetchNui<{ ok?: boolean } | null>('sd-phone:photogram:liveChunk', { liveId, chunk, init, mime });
    return res?.ok !== false;
}

export async function apiLiveTransport(liveId: string, relay: boolean): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:liveTransport', { liveId, relay });
}

export async function apiAddStory(image: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:addStory', { image });
}

export async function apiMarkStorySeen(storyId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:markStorySeen', { storyId });
}


export async function apiActivity(): Promise<ActivityItem[]> {
    if (!isFiveM) return ACTIVITY.map(n => ({ ...n, kind: (n.follow ? 'follow' : 'like') as NotifKind, seen: true }));
    return (await call<{ notifications: SrvNotif[] }>('sd-phone:photogram:activity'))?.notifications.map(mapNotif) ?? [];
}

export async function apiDismissNotification(id: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:dismissNotification', { id });
}

export async function apiCounts(): Promise<{ activity: number; dms: number }> {
    if (!isFiveM) return { activity: 3, dms: 2 };
    return (await call<{ activity: number; dms: number }>('sd-phone:photogram:counts')) ?? { activity: 0, dms: 0 };
}


export async function apiDmList(): Promise<Conversation[]> {
    if (!isFiveM) return DMS.map(d => ({ id: d.id, user: d.user, last: d.messages[d.messages.length - 1] ?? null, unread: 0, ts: d.messages[d.messages.length - 1]?.ts ?? 0 }));
    return (await call<{ conversations: SrvConvo[] }>('sd-phone:photogram:dmList'))?.conversations.map(mapConvo) ?? [];
}

export async function apiDmThread(handle: string): Promise<DM | null> {
    if (!isFiveM) return DMS.find(d => d.id === handle || d.user.handle === handle) ?? null;
    const r = await call<{ id: string; user: User; messages: DMsg[] }>('sd-phone:photogram:dmThread', { handle });
    return r ? { id: r.id, user: fixUser(r.user), messages: r.messages } : null;
}

export interface DmSendResult { message: DMsg | null; error?: string }

export async function apiDmSend(to: string, draft: MessageDraft): Promise<DmSendResult> {
    if (!isFiveM) {
        return { message: { id: 'me-' + Date.now(), body: draft.body, at: '', ts: Date.now(), mine: true, kind: draft.kind, gifUrl: draft.gifUrl, duration: draft.duration, audioUrl: draft.audioUrl, waveform: draft.waveform, replyTo: draft.replyTo } };
    }
    const r = await apiCall<{ message: DMsg }>('sd-phone:photogram:dmSend', { to, ...draft });
    if (r.success && r.data?.message) return { message: r.data.message };
    return { message: null, error: r.message };
}

export async function apiDmReact(messageId: string, emoji: string): Promise<Reaction[] | null> {
    if (!isFiveM) return null;
    const r = await call<{ id: string; reactions: Reaction[] }>('sd-phone:photogram:dmReact', { id: messageId, emoji });
    if (!r) return null;
    return Array.isArray(r.reactions) ? r.reactions : [];
}

export async function apiSharePost(handles: string[], post: SharedPost): Promise<void> {
    if (!isFiveM) return;
    for (const to of handles) {
        await fetchNui('sd-phone:photogram:dmSend', { to, kind: 'post', post });
    }
}

export async function apiCurrentZone(): Promise<string | null> {
    if (!isFiveM) return 'Vinewood Hills';
    const r = await call<{ name: string | null }>('sd-phone:photogram:currentZone');
    return r?.name ? r.name : null;
}

export async function apiDeleteAccount(): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:photogram:deleteAccount');
}
