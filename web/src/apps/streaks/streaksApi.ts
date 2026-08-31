import { fetchNui, isFiveM } from '@/core/nui';
import { apiCall, apiData as call, failText } from '@/core/api';
import {
    SEED_BOARD, SEED_CONFIG, SEED_GALLERY, SEED_STATE,
    type LeaderboardEntry, type StreakConfig, type StreakMilestone, type StreakPost, type StreakState,
} from './data';


export interface SyncData { state: StreakState; config: StreakConfig; gallery: StreakPost[]; }

export async function streaksSync(): Promise<SyncData> {
    if (!isFiveM) return { state: SEED_STATE, config: SEED_CONFIG, gallery: SEED_GALLERY };
    const data = await call<SyncData>('sd-phone:streaks:sync');
    return data ?? { state: SEED_STATE, config: SEED_CONFIG, gallery: [] };
}

/** Subscribe/unsubscribe this phone to live gallery pushes (new posts, like counts). The server
 * only pushes to players watching, so the Streaks screen calls this on mount (on) / unmount (off). */
export function streaksWatch(on: boolean): void {
    if (isFiveM) void fetchNui('sd-phone:streaks:watch', { on });
}

export interface PostResult {
    ok:       boolean;
    message?: string;
    state?:   StreakState;
    post?:    StreakPost;
    reward?:  StreakMilestone | null;
}

export async function streaksPost(p: { imageUrl: string; caption?: string }): Promise<PostResult> {
    if (!isFiveM) {
        const post: StreakPost = {
            id: Math.floor(Math.random() * 1e6), author: 'You', imageUrl: p.imageUrl, caption: p.caption,
            dayStreak: SEED_STATE.current + 1, postDate: '2026-06-22', createdAt: Math.floor(Date.now() / 1000),
            likeCount: 0, likedByMe: false, isMine: true,
        };
        return { ok: true, state: { ...SEED_STATE, current: post.dayStreak, postedToday: true, todayPost: post, resetInSeconds: 29640 }, post, reward: null };
    }
    const res = await apiCall<Omit<PostResult, 'ok'>>('sd-phone:streaks:post', p);
    if (!res.success) return { ok: false, message: failText(res, 'Could not post')};
    return { ok: true, ...(res.data ?? {}) };
}

export async function streaksGallery(before?: number): Promise<StreakPost[]> {
    if (!isFiveM) return [];
    return (await call<StreakPost[]>('sd-phone:streaks:gallery', { before })) ?? [];
}

export async function streaksLike(postId: number): Promise<{ likeCount: number; likedByMe: boolean } | null> {
    if (!isFiveM) return null;
    return await call<{ likeCount: number; likedByMe: boolean }>('sd-phone:streaks:like', { postId });
}

export async function streaksLeaderboard(): Promise<LeaderboardEntry[]> {
    if (!isFiveM) return SEED_BOARD;
    return (await call<LeaderboardEntry[]>('sd-phone:streaks:leaderboard')) ?? [];
}

export async function captureStreakPhoto(): Promise<string | null> {
    return `https://picsum.photos/seed/streak${Math.floor(Math.random() * 1000)}/800`;
}
