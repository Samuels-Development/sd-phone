import { apiCall, type Envelope } from '@/core/api';
import { isFiveM } from '@/core/nui';
import type {
    AdminAuditEntry, AdminBirdyPost, AdminCall, AdminContentItem,
    AdminLivePlayer, AdminMediaItem,
    AdminMessage, AdminMute, AdminNumberRow, AdminOverview, AdminPlayerHit, AdminSimLookup, AdminStats,
    AdminThreadItem,
    MigrationScan, MigrationSnapshot,
} from './types';
import {
    DEV_AUDIT, DEV_LIVE, DEV_MEDIA, DEV_MIGRATION_SCAN, DEV_MIGRATION_SNAPSHOT, DEV_MUTES, DEV_PLAYERS, DEV_STATS,
    devBirdyPosts, devCalls, devContent,
    devMessages, devNumbers, devOverview, devSearch, devSimLookup, devThread,
} from './devData';

function call<T>(event: string, payload?: unknown): Promise<Envelope<T>> {
    return apiCall<T>(event, payload);
}

// Outside FiveM every callback would answer `{ ok: true }`, which reads as a
// failed envelope and leaves every page empty. The browser demo is the only
// place the panel is ever seen by someone who cannot open a real one, so it
// serves a full dataset instead: every page populated, every action a no-op
// that reports success.
function seed<T>(data: T): Promise<Envelope<T>> {
    return Promise.resolve({ success: true, data });
}

const ok = () => Promise.resolve({ success: true } as Envelope<void>);

export const adminMedia = () =>
    isFiveM ? call<{ media: AdminMediaItem[] }>('sd-phone:admin:media') : seed({ media: DEV_MEDIA });

export const adminLivePositions = () =>
    isFiveM ? call<{ players: AdminLivePlayer[] }>('sd-phone:admin:livePositions') : seed({ players: DEV_LIVE });

export const adminStats = () =>
    isFiveM ? call<AdminStats>('sd-phone:admin:stats') : seed(DEV_STATS);

// Empty q lists the most recently active phones (string keyset cursor); a real
// query searches with a numeric offset cursor. Both return 20 per page.
export const adminSearch = (q: string, cursor?: string | number | null) =>
    isFiveM
        ? call<{ players: AdminPlayerHit[]; nextCursor?: string | number | null }>('sd-phone:admin:search', { q, cursor })
        : seed({ players: devSearch(q), nextCursor: null });

export const adminOverview = (cid: string) =>
    isFiveM ? call<AdminOverview>('sd-phone:admin:overview', { cid }) : seed(devOverview(cid));

export const adminSetNumber = (cid: string, number: string) =>
    isFiveM ? call<{ number: string }>('sd-phone:admin:setNumber', { cid, number }) : seed({ number });

export const adminSimLookup = (number: string) =>
    isFiveM ? call<AdminSimLookup>('sd-phone:admin:simLookup', { number }) : seed(devSimLookup(number));

export const adminNumbers = (q: string, cursor?: number | null) =>
    isFiveM
        ? call<{ numbers: AdminNumberRow[]; nextCursor?: number | null }>('sd-phone:admin:numbers', { q, cursor })
        : seed({ numbers: devNumbers(q), nextCursor: null });

export const adminGiveSim = (cid: string, bind: boolean) =>
    isFiveM ? call<{ number: string }>('sd-phone:admin:giveSim', { cid, bind }) : seed({ number: '5551204' });

export const adminResetPasscode = (cid: string) =>
    isFiveM ? call<void>('sd-phone:admin:resetPasscode', { cid }) : ok();

export const adminSetApp = (cid: string, id: string, install: boolean) =>
    isFiveM
        ? call<{ installed: string[] }>('sd-phone:admin:setApp', { cid, id, install })
        : seed({ installed: (devOverview(cid).settings?.installedApps ?? []).concat(install ? [id] : []) });

export const adminResetAccountPassword = (accountId: number, password: string) =>
    isFiveM ? call<void>('sd-phone:admin:resetAccountPassword', { accountId, password }) : ok();

export const adminForceLogout = (cid: string, app?: string) =>
    isFiveM ? call<void>('sd-phone:admin:forceLogout', { cid, app }) : ok();

export const adminBirdyPosts = (opts: { cursor?: string | null; q?: string; cid?: string }) =>
    isFiveM
        ? call<{ posts: AdminBirdyPost[]; nextCursor?: string | null }>('sd-phone:admin:birdyPosts', opts)
        : seed({ posts: devBirdyPosts(opts.q, opts.cid), nextCursor: null });

export const adminBirdyDeletePost = (id: string) =>
    isFiveM ? call<void>('sd-phone:admin:birdyDeletePost', { id }) : ok();

export const adminBirdySetVerified = (handle: string, type: string | null) =>
    isFiveM ? call<void>('sd-phone:admin:birdySetVerified', { handle, type }) : ok();

export const adminContent = (app: string, cursor?: string | null, q?: string) =>
    isFiveM
        ? call<{ items: AdminContentItem[]; nextCursor?: string | null; deletable: boolean; threaded: boolean }>('sd-phone:admin:content', { app, cursor, q })
        : seed({ ...devContent(app, q), nextCursor: null });

export const adminContentDelete = (app: string, id: string) =>
    isFiveM ? call<void>('sd-phone:admin:contentDelete', { app, id }) : ok();

export const adminContentThread = (app: string, id: string) =>
    isFiveM
        ? call<{ items: AdminThreadItem[]; deletable: boolean }>('sd-phone:admin:contentThread', { app, id })
        : seed(devThread(app, id));

export const adminContentThreadDelete = (app: string, id: string) =>
    isFiveM ? call<void>('sd-phone:admin:contentThreadDelete', { app, id }) : ok();

export const adminMessages = (cid: string, cursor?: string | null) =>
    isFiveM
        ? call<{ messages: AdminMessage[]; nextCursor?: string | null }>('sd-phone:admin:messages', { cid, cursor })
        : seed({ messages: devMessages(cid), nextCursor: null });

export const adminCalls = (cid: string, cursor?: string | null) =>
    isFiveM
        ? call<{ calls: AdminCall[]; nextCursor?: string | null }>('sd-phone:admin:calls', { cid, cursor })
        : seed({ calls: devCalls(), nextCursor: null });

export const adminMute = (cid: string, scopes: string[], duration: number | null, reason: string) =>
    isFiveM
        ? call<{ mutes: AdminMute[] }>('sd-phone:admin:mute', { cid, scopes, duration, reason })
        : seed({
            mutes: scopes.map((scope, i) => ({
                id:        900 + i,
                citizenid: cid,
                name:      DEV_PLAYERS.find(p => p.citizenid === cid)?.name,
                online:    false,
                scope,
                reason,
                adminName: 'Demo Admin',
                expiresAt: duration ? Math.floor(Date.now() / 1000) + duration : null,
                createdAt: Math.floor(Date.now() / 1000),
            })),
        });

export const adminUnmute = (cid: string, scope?: string) =>
    isFiveM ? call<{ mutes: AdminMute[] }>('sd-phone:admin:unmute', { cid, scope }) : seed({ mutes: [] });

export const adminMutes = (cursor?: number | null) =>
    isFiveM
        ? call<{ mutes: AdminMute[]; nextCursor?: number | null }>('sd-phone:admin:mutes', { cursor })
        : seed({ mutes: DEV_MUTES, nextCursor: null });

export const adminWipePhone = (cid: string, confirm: string) =>
    isFiveM ? call<{ rows: number }>('sd-phone:admin:wipePhone', { cid, confirm }) : seed({ rows: 1284 });

export const adminAudit = (cursor?: number | null) =>
    isFiveM
        ? call<{ entries: AdminAuditEntry[]; nextCursor?: number | null }>('sd-phone:admin:audit', { cursor })
        : seed({ entries: DEV_AUDIT, nextCursor: null });

export const adminMigrateScan = () =>
    isFiveM ? call<MigrationScan>('sd-phone:admin:migrateScan') : seed(DEV_MIGRATION_SCAN);

export const adminMigrateState = () =>
    isFiveM ? call<MigrationSnapshot>('sd-phone:admin:migrateState') : seed(DEV_MIGRATION_SNAPSHOT);

export const adminMigrateStart = (domains: string[], dryRun: boolean) =>
    isFiveM ? call<void>('sd-phone:admin:migrateStart', { domains, dryRun }) : ok();

export const adminMigrateStop = () =>
    isFiveM ? call<void>('sd-phone:admin:migrateStop') : ok();

export const adminMigrateWatch = (on: boolean) =>
    isFiveM ? call<void>('sd-phone:admin:migrateWatch', { on }) : ok();
