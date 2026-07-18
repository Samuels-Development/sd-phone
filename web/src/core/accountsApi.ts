import { fetchNui, isFiveM } from './nui';
import { apiCall, apiData } from '@/core/api';

export let MAIL_DOMAIN = 'lifeinvader.com';

export function setMailDomain(domain: string): void {
    if (domain) MAIL_DOMAIN = domain;
}

export interface AccountMe { username: string; name: string; email?: string; phone?: string }
export interface ApiResult { ok: boolean; message?: string }

const devSessions: Record<string, AccountMe | null> = {};

export async function accountsMe(app: string): Promise<{ loggedIn: boolean; me: AccountMe | null }> {
    if (!isFiveM) {
        const me = devSessions[app] ?? (import.meta.env.DEV ? { username: 'dev', name: 'Dev User' } : null);
        return { loggedIn: !!me, me };
    }
    const data = await apiData<{ loggedIn: boolean; me?: AccountMe }>('sd-phone:accounts:me', { app });
    return { loggedIn: !!data?.loggedIn, me: data?.me ?? null };
}

export async function accountsRegister(app: string, values: Record<string, string>): Promise<ApiResult> {
    if (!isFiveM) { devSessions[app] = { username: values.username ?? 'dev', name: values.name ?? 'Dev User' }; return { ok: true }; }
    const res = await apiCall<unknown>('sd-phone:accounts:register', { app, ...values });
    return res.success ? { ok: true } : { ok: false, message: res.message };
}

export async function accountsLogin(app: string, values: Record<string, string>): Promise<ApiResult> {
    if (!isFiveM) { devSessions[app] = { username: values.username ?? 'dev', name: 'Dev User' }; return { ok: true }; }
    const res = await apiCall<unknown>('sd-phone:accounts:login', { app, ...values });
    return res.success ? { ok: true } : { ok: false, message: res.message };
}

export async function accountsLogout(app: string): Promise<void> {
    if (!isFiveM) { devSessions[app] = null; return; }
    await fetchNui('sd-phone:accounts:logout', { app });
}

export type ResetChannel = 'email' | 'sms';

export async function accountsRequestReset(app: string, identity: string): Promise<ApiResult & { channel?: ResetChannel }> {
    if (!isFiveM) return { ok: true, channel: identity.includes('@') ? 'email' : 'sms' };
    const res = await apiCall<{ channel?: ResetChannel }>('sd-phone:accounts:requestReset', { app, identity });
    return res.success ? { ok: true, channel: res.data?.channel } : { ok: false, message: res.message };
}

export interface CodeSuggestion { code?: string; source?: 'mail' | 'messages' }

export async function accountsSuggestCode(app: string, identity: string): Promise<CodeSuggestion> {
    if (!isFiveM) return { code: '123456', source: identity.includes('@') || /[a-z]/i.test(identity) ? 'mail' : 'messages' };
    return (await apiData<CodeSuggestion>('sd-phone:accounts:suggestCode', { app, identity })) ?? {};
}

export async function accountsConfirmReset(app: string, identity: string, code: string, password: string): Promise<ApiResult> {
    if (!isFiveM) return { ok: true };
    const res = await apiCall<unknown>('sd-phone:accounts:confirmReset', { app, identity, code, password });
    return res.success ? { ok: true } : { ok: false, message: res.message };
}

export interface VaultEntry {
    id:       number;
    app:      string;
    username: string;
    password: string;
    email?:   string | null;
    phone?:   string | null;
    /** Unix timestamp in SECONDS. Formatted in the UI so it follows the app's language. */
    created?: number;
}

const DEV_DAY = 86_400;
const DEV_CREATED = Math.floor(Date.UTC(2026, 5, 1) / 1000);

const DEV_VAULT: VaultEntry[] = [
    { id: 1, app: 'photogram', username: 'dev', password: 'hunter22', email: `dev@${MAIL_DOMAIN}`, phone: '5551234567', created: DEV_CREATED },
    { id: 2, app: 'birdy',     username: 'dev', password: 'hunter22', email: `dev@${MAIL_DOMAIN}`, created: DEV_CREATED + DEV_DAY },
    { id: 3, app: 'mail', username: `you@${MAIL_DOMAIN}`,  password: 'hunter22', email: `you@${MAIL_DOMAIN}`,  created: DEV_CREATED },
    { id: 4, app: 'mail', username: `work@${MAIL_DOMAIN}`, password: 'hunter22', email: `work@${MAIL_DOMAIN}`, created: DEV_CREATED + DEV_DAY * 2 },
    { id: 5, app: 'cherry', username: 'dev', password: 'hunter22', email: `dev@${MAIL_DOMAIN}`, created: DEV_CREATED + DEV_DAY * 3 },
    { id: 6, app: 'vibez',  username: 'dev', password: 'hunter22', email: `dev@${MAIL_DOMAIN}`, created: DEV_CREATED + DEV_DAY * 4 },
    { id: 7, app: 'ryde',   username: 'dev', password: 'hunter22', email: `dev@${MAIL_DOMAIN}`, created: DEV_CREATED + DEV_DAY * 5 },
];

export async function accountsSavePassword(app: string, values: Record<string, string | undefined>): Promise<void> {
    if (!isFiveM) {
        DEV_VAULT.push({ id: Date.now(), app, username: values.username ?? '', password: values.password ?? '', email: values.email, phone: values.phone, created: Math.floor(Date.now() / 1000) });
        return;
    }
    await fetchNui('sd-phone:accounts:savePassword', {
        app, username: values.username, password: values.password, email: values.email, phone: values.phone,
    });
}

export async function accountsListPasswords(): Promise<VaultEntry[]> {
    if (!isFiveM) return [...DEV_VAULT];
    return (await apiData<{ entries: VaultEntry[] }>('sd-phone:accounts:listPasswords'))?.entries ?? [];
}

export async function accountsDeletePassword(id: number): Promise<void> {
    if (!isFiveM) {
        const i = DEV_VAULT.findIndex(e => e.id === id);
        if (i >= 0) DEV_VAULT.splice(i, 1);
        return;
    }
    await fetchNui('sd-phone:accounts:deletePassword', { id });
}

export async function accountsForgetPassword(app: string): Promise<void> {
    const entries = await accountsListPasswords();
    for (const e of entries) {
        if (e.app === app) await accountsDeletePassword(e.id);
    }
}

export async function accountsSavedLogin(app: string): Promise<{ username: string; password: string } | null> {
    const entries = await accountsListPasswords();
    const e = entries.find(x => x.app === app);
    return e ? { username: e.username, password: e.password } : null;
}

export async function accountsChangePassword(app: string, identity: string, currentPassword: string, newPassword: string): Promise<ApiResult> {
    if (!isFiveM) {
        const entry = DEV_VAULT.find(e => e.app === app && (e.username === identity || e.email === identity));
        if (entry && entry.password !== currentPassword) return { ok: false, message: 'Current password is incorrect' };
        if (newPassword.length < 6) return { ok: false, message: 'New password must be at least 6 characters' };
        if (entry) entry.password = newPassword;
        return { ok: true };
    }
    const res = await apiCall<unknown>('sd-phone:accounts:changePassword', { app, identity, currentPassword, newPassword });
    return res.success ? { ok: true } : { ok: false, message: res.message };
}

export async function accountsMyNumber(): Promise<string | null> {
    if (!isFiveM) return '5551234567';
    return (await apiData<{ number?: string }>('sd-phone:accounts:myNumber'))?.number ?? null;
}

export async function accountsMyEmail(): Promise<string | null> {
    if (!isFiveM) return `dev@${MAIL_DOMAIN}`;
    return (await apiData<{ email?: string }>('sd-phone:accounts:myEmail'))?.email ?? null;
}
