import { apiCall, type Envelope } from '@/core/api';
import type {
    AdminAuditEntry, AdminBirdyPost, AdminCall, AdminContentItem,
    AdminMessage, AdminMute, AdminNumberRow, AdminOverview, AdminPlayerHit, AdminSimLookup, AdminStats,
} from './types';

function call<T>(event: string, payload?: unknown): Promise<Envelope<T>> {
    return apiCall<T>(event, payload);
}

export const adminStats = () =>
    call<AdminStats>('sd-phone:admin:stats');

// Empty q lists the most recently active phones (string keyset cursor); a real
// query searches with a numeric offset cursor. Both return 20 per page.
export const adminSearch = (q: string, cursor?: string | number | null) =>
    call<{ players: AdminPlayerHit[]; nextCursor?: string | number | null }>('sd-phone:admin:search', { q, cursor });

export const adminOverview = (cid: string) =>
    call<AdminOverview>('sd-phone:admin:overview', { cid });

export const adminSetNumber = (cid: string, number: string) =>
    call<{ number: string }>('sd-phone:admin:setNumber', { cid, number });

export const adminSimLookup = (number: string) =>
    call<AdminSimLookup>('sd-phone:admin:simLookup', { number });

export const adminNumbers = (q: string, cursor?: number | null) =>
    call<{ numbers: AdminNumberRow[]; nextCursor?: number | null }>('sd-phone:admin:numbers', { q, cursor });

export const adminGiveSim = (cid: string, bind: boolean) =>
    call<{ number: string }>('sd-phone:admin:giveSim', { cid, bind });

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

export const adminContent = (app: string, cursor?: string | null, q?: string) =>
    call<{ items: AdminContentItem[]; nextCursor?: string | null; deletable: boolean }>('sd-phone:admin:content', { app, cursor, q });

export const adminContentDelete = (app: string, id: string) =>
    call<void>('sd-phone:admin:contentDelete', { app, id });

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
