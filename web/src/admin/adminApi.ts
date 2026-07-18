import { apiCall, type Envelope } from '@/core/api';
import { isFiveM } from '@/core/nui';
import { devAdminCall } from './devMock';
import type {
    AdminAccount, AdminAuditEntry, AdminBirdyPost, AdminCall, AdminMessage,
    AdminMute, AdminOverview, AdminPlayerHit, AdminStats,
} from './types';

// In the browser (vite dev) the in-memory mock backend answers instead of the
// NUI, so the whole panel stays explorable outside FiveM.
function call<T>(event: string, payload?: unknown): Promise<Envelope<T>> {
    return isFiveM ? apiCall<T>(event, payload) : devAdminCall<T>(event, payload);
}

export const adminStats = () =>
    call<AdminStats>('sd-phone:admin:stats');

export const adminSearch = (q: string) =>
    call<{ players: AdminPlayerHit[] }>('sd-phone:admin:search', { q });

export const adminOverview = (cid: string) =>
    call<AdminOverview>('sd-phone:admin:overview', { cid });

export const adminSetNumber = (cid: string, number: string) =>
    call<{ number: string }>('sd-phone:admin:setNumber', { cid, number });

export const adminResetPasscode = (cid: string) =>
    call<void>('sd-phone:admin:resetPasscode', { cid });

export const adminSetApp = (cid: string, id: string, install: boolean) =>
    call<{ installed: string[] }>('sd-phone:admin:setApp', { cid, id, install });

export const adminResetAccountPassword = (accountId: number, password: string) =>
    call<void>('sd-phone:admin:resetAccountPassword', { accountId, password });

export const adminForceLogout = (cid: string, app?: string) =>
    call<void>('sd-phone:admin:forceLogout', { cid, app });

export const adminBirdyPosts = (opts: { cursor?: string | null; q?: string; cid?: string }) =>
    call<{ posts: AdminBirdyPost[]; nextCursor?: string | null }>('sd-phone:admin:birdyPosts', opts);

export const adminBirdyDeletePost = (id: string) =>
    call<void>('sd-phone:admin:birdyDeletePost', { id });

export const adminBirdySetVerified = (cid: string, verified: boolean) =>
    call<void>('sd-phone:admin:birdySetVerified', { cid, verified });

export const adminMessages = (cid: string, cursor?: string | null) =>
    call<{ messages: AdminMessage[]; nextCursor?: string | null }>('sd-phone:admin:messages', { cid, cursor });

export const adminCalls = (cid: string, cursor?: string | null) =>
    call<{ calls: AdminCall[]; nextCursor?: string | null }>('sd-phone:admin:calls', { cid, cursor });

export const adminMute = (cid: string, scopes: string[], duration: number | null, reason: string) =>
    call<{ mutes: AdminMute[] }>('sd-phone:admin:mute', { cid, scopes, duration, reason });

export const adminUnmute = (cid: string, scope?: string) =>
    call<{ mutes: AdminMute[] }>('sd-phone:admin:unmute', { cid, scope });

export const adminMutes = (cursor?: number | null) =>
    call<{ mutes: AdminMute[]; nextCursor?: number | null }>('sd-phone:admin:mutes', { cursor });

export const adminWipePhone = (cid: string, confirm: string) =>
    call<{ rows: number }>('sd-phone:admin:wipePhone', { cid, confirm });

export const adminAudit = (cursor?: number | null) =>
    call<{ entries: AdminAuditEntry[]; nextCursor?: number | null }>('sd-phone:admin:audit', { cursor });

export type { AdminAccount };
