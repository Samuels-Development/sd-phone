import { t } from '@/i18n';
import { relTimeCompact } from '@/lib/time';
import { fetchNui, isFiveM } from '@/core/nui';
import { apiData as call } from '@/core/api';
import {
    avatarFor, DEV_COMMENTS, DEV_DISCOVER, DEV_ME, DEV_MY_POSTS, DEV_NOTIFS, DEV_POSTS, DEV_TRENDS,
    type VComment, type VLive, type VNotif, type VNotifKind, type VPost, type VProfile, type VUser,
} from './data';

interface SrvPost extends Omit<VPost, 'time'> { createdAt: number }
interface SrvComment extends Omit<VComment, 'time'> { createdAt: number }
interface SrvNotif { id: string; kind: VNotifKind; user: VUser; text: string; thumb?: string; postId?: string; seen: boolean; createdAt: number }

export interface LiveJoin {
    liveId:    string;
    host:      VUser;
    mode?:     'video' | 'image';
    mime?:     string;
    frame?:    string;
    viewers:   number;
    startedAt: number;
}

export interface LiveEncoderConfig { bitrate: number; fps: number; timesliceMs: number; keyframeMs: number }
const DEFAULT_ENC: LiveEncoderConfig = { bitrate: 900000, fps: 25, timesliceMs: 250, keyframeMs: 4000 };

function relTime(ms: number): string {
    return relTimeCompact(ms, {
        nowLabel:       t('vibez.justNow', 'Just now'),
        yesterdayLabel: t('vibez.yesterday', 'Yesterday'),
        dateAfterDays:  7,
    });
}

function fixUser(u: VUser): VUser {
    return { ...u, avatar: avatarFor(u.handle, u.avatar) };
}

function mapPost(p: SrvPost): VPost {
    return { ...p, user: fixUser(p.user), time: relTime(p.createdAt) };
}
function mapComment(c: SrvComment): VComment {
    return { ...c, user: fixUser(c.user), time: relTime(c.createdAt) };
}
function mapNotif(n: SrvNotif): VNotif {
    return { id: n.id, kind: n.kind, user: fixUser(n.user), text: n.text, thumb: n.thumb, postId: n.postId, seen: n.seen, time: relTime(n.createdAt) };
}

export type FeedTab = 'following' | 'foryou';

export async function apiFeed(tab: FeedTab): Promise<VPost[]> {
    if (!isFiveM) return tab === 'following' ? DEV_POSTS.filter(p => p.following || p.liked) : DEV_POSTS;
    return (await call<{ posts: SrvPost[] }>('sd-phone:vibez:feed', { tab }))?.posts.map(mapPost) ?? [];
}

export async function apiDiscover(): Promise<{ posts: VPost[]; trends: string[] }> {
    if (!isFiveM) return { posts: DEV_DISCOVER, trends: DEV_TRENDS };
    const r = await call<{ posts: SrvPost[]; trends: string[] }>('sd-phone:vibez:discover');
    return { posts: r?.posts.map(mapPost) ?? [], trends: r?.trends ?? [] };
}

export async function apiPost(id: string): Promise<{ post: VPost; comments: VComment[] } | null> {
    if (!isFiveM) {
        const post = [...DEV_POSTS, ...DEV_DISCOVER, ...DEV_MY_POSTS].find(p => p.id === id);
        return post ? { post, comments: DEV_COMMENTS[id] ?? [] } : null;
    }
    const r = await call<{ post: SrvPost; comments: SrvComment[] }>('sd-phone:vibez:post', { id });
    return r ? { post: mapPost(r.post), comments: r.comments.map(mapComment) } : null;
}

export async function apiCreate(video: string, caption: string, sound: string, thumb?: string): Promise<VPost | null> {
    if (!isFiveM) {
        return {
            id: 'new-' + Date.now(), user: { id: 'dev', handle: 'dev', avatar: DEV_ME.avatar, verified: true },
            video, thumb, caption, sound: sound || 'original sound — dev',
            likes: 0, liked: false, saves: 0, saved: false, comments: 0, views: 0, following: false,
            time: t('vibez.justNow', 'Just now'),
        };
    }
    const r = await call<{ post: SrvPost }>('sd-phone:vibez:create', { video, caption, sound, thumb });
    return r?.post ? mapPost(r.post) : null;
}

export async function apiDeletePost(id: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:vibez:deletePost', { id });
}

export async function apiToggleLike(id: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:vibez:toggleLike', { id });
}

export async function apiToggleSave(id: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:vibez:toggleSave', { id });
}

export async function apiAddView(id: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:vibez:addView', { id });
}

export async function apiComments(postId: string): Promise<VComment[]> {
    if (!isFiveM) return DEV_COMMENTS[postId] ?? [];
    return (await call<{ comments: SrvComment[] }>('sd-phone:vibez:comments', { postId }))?.comments.map(mapComment) ?? [];
}

export async function apiAddComment(postId: string, text: string): Promise<{ comment: VComment; count: number } | null> {
    if (!isFiveM) {
        return {
            comment: { id: 'me-' + Date.now(), user: { id: 'dev', handle: 'dev', avatar: DEV_ME.avatar, verified: true }, text, likes: 0, liked: false, time: t('vibez.justNow', 'Just now') },
            count: (DEV_COMMENTS[postId]?.length ?? 0) + 1,
        };
    }
    const r = await call<{ comment: SrvComment; count: number }>('sd-phone:vibez:addComment', { postId, text });
    return r?.comment ? { comment: mapComment(r.comment), count: r.count } : null;
}

export async function apiToggleCommentLike(commentId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:vibez:toggleCommentLike', { commentId });
}

export async function apiProfile(handle?: string): Promise<VProfile | null> {
    if (!isFiveM) {
        if (handle && handle !== DEV_ME.username) {
            const u = [...DEV_POSTS, ...DEV_DISCOVER].map(p => p.user).find(x => x.handle === handle);
            return {
                username: handle, name: u?.handle ?? handle, bio: '', avatar: avatarFor(handle, u?.avatar),
                verified: u?.verified ?? false, isMe: false, following: false, followsMe: false,
                posts: 2, followers: 120, followingCount: 48, likes: 5230,
            };
        }
        return DEV_ME;
    }
    const p = await call<{ profile: VProfile }>('sd-phone:vibez:profile', handle ? { handle } : undefined);
    if (!p?.profile) return null;
    return { ...p.profile, avatar: avatarFor(p.profile.username, p.profile.avatar) };
}

export async function apiProfilePosts(handle?: string): Promise<VPost[]> {
    if (!isFiveM) {
        if (!handle || handle === DEV_ME.username) return DEV_MY_POSTS;
        return DEV_DISCOVER.filter(p => p.user.handle === handle);
    }
    return (await call<{ posts: SrvPost[] }>('sd-phone:vibez:profilePosts', handle ? { handle } : undefined))?.posts.map(mapPost) ?? [];
}

export async function apiLikedPosts(): Promise<VPost[]> {
    if (!isFiveM) return DEV_POSTS.filter(p => p.liked);
    return (await call<{ posts: SrvPost[] }>('sd-phone:vibez:likedPosts'))?.posts.map(mapPost) ?? [];
}

export async function apiSavedPosts(): Promise<VPost[]> {
    if (!isFiveM) return DEV_POSTS.filter(p => p.saved);
    return (await call<{ posts: SrvPost[] }>('sd-phone:vibez:savedPosts'))?.posts.map(mapPost) ?? [];
}

export async function apiUpdateProfile(input: { name: string; bio: string; avatar: string }): Promise<VProfile | null> {
    if (!isFiveM) return { ...DEV_ME, name: input.name, bio: input.bio, avatar: input.avatar || DEV_ME.avatar };
    const p = await call<{ profile: VProfile }>('sd-phone:vibez:updateProfile', input);
    return p?.profile ? { ...p.profile, avatar: avatarFor(p.profile.username, p.profile.avatar) } : null;
}

export async function apiToggleFollow(handle: string): Promise<boolean> {
    if (!isFiveM) return true;
    return (await call<{ following: boolean }>('sd-phone:vibez:toggleFollow', { handle }))?.following ?? false;
}

export interface SearchUser extends VUser { following: boolean }

export async function apiSearch(query: string): Promise<SearchUser[]> {
    if (!isFiveM) {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        const seen = new Set<string>();
        const users: SearchUser[] = [];
        for (const u of [...DEV_POSTS, ...DEV_DISCOVER].map(p => p.user)) {
            if (seen.has(u.handle) || !u.handle.toLowerCase().includes(q)) continue;
            seen.add(u.handle);
            users.push({ ...u, following: false });
        }
        return users;
    }
    return (await call<{ users: SearchUser[] }>('sd-phone:vibez:search', { query }))?.users.map(u => ({ ...u, avatar: avatarFor(u.handle, u.avatar) })) ?? [];
}

export async function apiActivity(): Promise<VNotif[]> {
    if (!isFiveM) return DEV_NOTIFS;
    return (await call<{ notifications: SrvNotif[] }>('sd-phone:vibez:activity'))?.notifications.map(mapNotif) ?? [];
}

export async function apiCounts(): Promise<number> {
    if (!isFiveM) return DEV_NOTIFS.filter(n => !n.seen).length;
    return (await call<{ activity: number }>('sd-phone:vibez:counts'))?.activity ?? 0;
}

export async function apiLives(): Promise<VLive[]> {
    if (!isFiveM) return [];
    const r = await call<{ lives: VLive[] }>('sd-phone:vibez:lives');
    return (r?.lives ?? []).map(l => ({ ...l, user: fixUser(l.user) }));
}

export async function apiLiveStart(): Promise<{ liveId: string; startedAt: number; enc: LiveEncoderConfig } | null> {
    if (!isFiveM) return { liveId: 'dev-live', startedAt: Date.now(), enc: DEFAULT_ENC };
    const r = await call<{ liveId: string; startedAt: number; enc?: Partial<LiveEncoderConfig> }>('sd-phone:vibez:liveStart');
    if (!r) return null;
    return { liveId: r.liveId, startedAt: r.startedAt, enc: { ...DEFAULT_ENC, ...(r.enc ?? {}) } };
}

export async function apiLiveJoin(liveId: string): Promise<LiveJoin | null> {
    if (!isFiveM) return { liveId, host: { id: 'luna.vibe', handle: 'luna.vibe', avatar: avatarFor('luna.vibe'), verified: true }, viewers: 1, startedAt: Date.now() };
    const r = await call<LiveJoin>('sd-phone:vibez:liveJoin', { liveId });
    return r ? { ...r, host: fixUser(r.host) } : null;
}

export async function apiLiveLeave(liveId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:vibez:liveLeave', { liveId });
}

export async function apiLiveEnd(liveId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:vibez:liveEnd', { liveId });
}

export async function apiLiveComment(liveId: string, text: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:vibez:liveComment', { liveId, text });
}

export async function apiLiveHeart(liveId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:vibez:liveHeart', { liveId });
}

export async function apiLiveFrame(liveId: string, frame: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:vibez:liveFrame', { liveId, frame });
}

export async function apiLiveChunk(liveId: string, chunk: string, init: boolean, mime?: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:vibez:liveChunk', { liveId, chunk, init, mime });
}
