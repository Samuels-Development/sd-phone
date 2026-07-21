
import { fetchNui, isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { apiCall, apiData, type Envelope } from '@/core/api';
import { readJson, writeJson } from '@/lib/storage';
import { format12h, formatListDate } from '@/lib/time';
import { newId } from '@/lib/format';

export type Folder = 'inbox' | 'flagged' | 'drafts' | 'sent' | 'spam' | 'bin';

export interface MailAccount {
    id:    string;
    name:  string;
    email: string;
}

export type MailAttachment =
    | { kind: 'photo'; url: string }
    | { kind: 'audio'; url: string; name: string; duration: number }
    | { kind: 'note';  title: string; body: string };

export interface MailMessage {
    id:        string;
    accountId: string;
    folder:    Folder;
    from:      { name: string; email: string };
    to:        string[];
    subject:   string;
    body:      string;
    sentAt:    string;
    read:      boolean;
    flagged:   boolean;
    attachments?: MailAttachment[];
}

const FOLDER_IDS: Folder[] = ['inbox', 'flagged', 'drafts', 'sent', 'spam', 'bin'];

export function getFolders(): { id: Folder; label: string }[] {
    return [
        { id: 'inbox',   label: t('mail.folderInbox', 'Inbox')     },
        { id: 'flagged', label: t('mail.folderFlagged', 'Flagged') },
        { id: 'drafts',  label: t('mail.folderDrafts', 'Drafts')   },
        { id: 'sent',    label: t('mail.folderSent', 'Sent')       },
        { id: 'spam',    label: t('mail.folderSpam', 'Spam')       },
        { id: 'bin',     label: t('mail.folderBin', 'Bin')         },
    ];
}

export function getFolderLabels(): Record<Folder, string> {
    return getFolders().reduce((acc, f) => {
        acc[f.id] = f.label;
        return acc;
    }, {} as Record<Folder, string>);
}

const DEFAULT_FOLDER_ORDER: Folder[] = FOLDER_IDS;


const FOLDER_ORDER_KEY = 'sd-phone:mail:folderOrder:v1';

function sanitizeFolderOrder(input: unknown): Folder[] {
    const valid = new Set<Folder>(DEFAULT_FOLDER_ORDER);
    const seen  = new Set<Folder>();
    const out: Folder[] = [];
    if (Array.isArray(input)) {
        for (const x of input) {
            if (typeof x === 'string' && valid.has(x as Folder) && !seen.has(x as Folder)) {
                out.push(x as Folder);
                seen.add(x as Folder);
            }
        }
    }
    for (const id of DEFAULT_FOLDER_ORDER) {
        if (!seen.has(id)) out.push(id);
    }
    return out;
}

export function loadFolderOrder(): Folder[] {
    const raw = readJson<unknown>(FOLDER_ORDER_KEY);
    return raw ? sanitizeFolderOrder(raw) : DEFAULT_FOLDER_ORDER;
}

export function saveFolderOrder(order: Folder[]): void {
    writeJson(FOLDER_ORDER_KEY, order);
}


const ACTIVE_ACCOUNT_KEY = 'sd-phone:mail:activeAccount:v1';

export function loadActiveAccountId(): string | null {
    try {
        const raw = window.localStorage.getItem(ACTIVE_ACCOUNT_KEY);
        if (typeof raw === 'string' && raw.length > 0) return raw;
    } catch { /* ignore */ }
    return null;
}

export function saveActiveAccountId(id: string | null): void {
    try {
        if (id) window.localStorage.setItem(ACTIVE_ACCOUNT_KEY, id);
        else    window.localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    } catch { /* ignore */ }
}


const PRIMARY_EMAIL = 'you@lifeinvader.com';

const MIN = 60_000, HR = 3_600_000, DAY = 86_400_000;
const MOCK_NOW = Date.now();
const ago = (ms: number) => new Date(MOCK_NOW - ms).toISOString();
const ME = { name: 'Personal', email: PRIMARY_EMAIL };

const MOCK: { accounts: MailAccount[]; messages: MailMessage[] } = {
    accounts: [{ id: PRIMARY_EMAIL, name: 'Personal', email: PRIMARY_EMAIL }],
    messages: [
        {
            id: 'm1', accountId: PRIMARY_EMAIL, folder: 'inbox',
            from: { name: 'LifeInvader', email: 'noreply@lifeinvader.com' }, to: [PRIMARY_EMAIL],
            subject: 'Welcome to LifeInvader Mail',
            body: 'Your inbox is ready.\n\nTap the pencil to compose, or pick an email to read.\n\nThe LifeInvader Team',
            sentAt: ago(8 * MIN), read: false, flagged: false,
        },
        {
            id: 'm2', accountId: PRIMARY_EMAIL, folder: 'inbox',
            from: { name: 'Maze Bank', email: 'statements@mazebank.com' }, to: [PRIMARY_EMAIL],
            subject: 'Your monthly statement is ready',
            body: 'Hi,\n\nYour account statement for this month is now available to view online. Your closing balance and recent transactions are included.\n\nThank you for banking with Maze Bank.',
            sentAt: ago(35 * MIN), read: false, flagged: true,
        },
        {
            id: 'm3', accountId: PRIMARY_EMAIL, folder: 'inbox',
            from: { name: 'Los Santos Customs', email: 'service@lscustoms.com' }, to: [PRIMARY_EMAIL],
            subject: 'Your vehicle is ready for pickup',
            body: 'Good news! The work on your vehicle is complete and it is ready for collection.\n\nWe are open until 9pm. Bring your ID and booking reference.\n\nThe LSC Team',
            sentAt: ago(2 * HR), read: false, flagged: false,
        },
        {
            id: 'm4', accountId: PRIMARY_EMAIL, folder: 'inbox',
            from: { name: 'Legendary Motorsport', email: 'showroom@legendarymotorsport.com' }, to: [PRIMARY_EMAIL],
            subject: 'New arrivals on the showroom floor',
            body: 'Fresh stock just landed. Reserve a test drive this week and skip the waiting list.\n\nViewings by appointment only.',
            sentAt: ago(1 * DAY), read: true, flagged: true,
        },
        {
            id: 'm5', accountId: PRIMARY_EMAIL, folder: 'inbox',
            from: { name: 'Vinewood Realty', email: 'lettings@vinewoodrealty.com' }, to: [PRIMARY_EMAIL],
            subject: 'Viewing confirmed for Friday',
            body: 'Your apartment viewing is confirmed for Friday at 2pm. The agent will meet you in the lobby.\n\nReply to reschedule.',
            sentAt: ago(2 * DAY), read: true, flagged: false,
        },

        {
            id: 'd1', accountId: PRIMARY_EMAIL, folder: 'drafts',
            from: ME, to: ['mike@lifeinvader.com'],
            subject: 'Re: this weekend',
            body: 'Hey, sounds good, I should be free after',
            sentAt: ago(20 * MIN), read: true, flagged: false,
        },
        {
            id: 'd2', accountId: PRIMARY_EMAIL, folder: 'drafts',
            from: ME, to: [],
            subject: 'Garage lease enquiry',
            body: 'To whom it may concern,\n\nI am writing to ask about availability for',
            sentAt: ago(3 * HR), read: true, flagged: false,
        },

        {
            id: 's1', accountId: PRIMARY_EMAIL, folder: 'sent',
            from: ME, to: ['support@mazebank.com'],
            subject: 'Disputed transaction',
            body: 'Hi,\n\nI noticed a charge I do not recognise on my account and would like to dispute it. Please can you look into reference 88231.\n\nThanks.',
            sentAt: ago(1 * HR), read: true, flagged: false,
        },
        {
            id: 's2', accountId: PRIMARY_EMAIL, folder: 'sent',
            from: ME, to: ['jordan@lifeinvader.com'],
            subject: 'Meeting tomorrow',
            body: 'Works for me. Let us say 11am at the usual place.\n\nSee you then.',
            sentAt: ago(5 * HR), read: true, flagged: false,
        },
        {
            id: 's3', accountId: PRIMARY_EMAIL, folder: 'sent',
            from: ME, to: ['lettings@vinewoodrealty.com'],
            subject: 'Rent payment sent',
            body: 'Hi,\n\nJust confirming the rent for this month has been transferred. Let me know once it clears.\n\nBest.',
            sentAt: ago(3 * DAY), read: true, flagged: false,
        },

        {
            id: 'sp1', accountId: PRIMARY_EMAIL, folder: 'spam',
            from: { name: 'Prize Center', email: 'winner@claim-now.biz' }, to: [PRIMARY_EMAIL],
            subject: 'CONGRATULATIONS!!! You have been selected',
            body: 'You have been chosen to receive a BRAND NEW supercar!!! Click here to claim within 24 hours or lose your prize forever!!!',
            sentAt: ago(4 * HR), read: true, flagged: false,
        },
        {
            id: 'sp2', accountId: PRIMARY_EMAIL, folder: 'spam',
            from: { name: 'Crypto Deals', email: 'offers@fastcoin-invest.biz' }, to: [PRIMARY_EMAIL],
            subject: 'Double your money in 7 days',
            body: 'Our exclusive trading bot guarantees 200% returns. Limited spots available. Reply to get started now.',
            sentAt: ago(1 * DAY), read: true, flagged: false,
        },

        {
            id: 'b1', accountId: PRIMARY_EMAIL, folder: 'bin',
            from: { name: 'Weazel News', email: 'digest@weazelnews.com' }, to: [PRIMARY_EMAIL],
            subject: 'Your weekly digest',
            body: 'The biggest stories in Los Santos this week, plus weather and traffic.\n\nUnsubscribe at any time.',
            sentAt: ago(5 * DAY), read: true, flagged: false,
        },
        {
            id: 'b2', accountId: PRIMARY_EMAIL, folder: 'bin',
            from: { name: 'Ammu-Nation', email: 'receipts@ammu-nation.com' }, to: [PRIMARY_EMAIL],
            subject: 'Receipt #4471',
            body: 'Thank you for your purchase. Your receipt is attached for your records.',
            sentAt: ago(6 * DAY), read: true, flagged: false,
        },
    ],
};


export async function listMail(): Promise<{ accounts: MailAccount[]; messages: MailMessage[] }> {
    if (!isFiveM) return { accounts: [...MOCK.accounts], messages: [...MOCK.messages] };
    return (await apiData<{ accounts: MailAccount[]; messages: MailMessage[] }>('sd-phone:mail:list')) ?? { accounts: [], messages: [] };
}

export async function signUp(input: { email: string; password: string; displayName: string; phone?: string }): Promise<MailAccount | string> {
    if (!isFiveM) {
        const acc = { id: input.email, name: input.displayName, email: input.email };
        MOCK.accounts.push(acc);
        return acc;
    }
    const res = await apiCall<{ account: MailAccount }>('sd-phone:mail:signUp', input);
    if (res.success && res.data) return res.data.account;
    return res.message ?? t('mail.errCreateAccount', 'Could not create account');
}

export async function signIn(input: { email: string; password: string }): Promise<MailAccount | string> {
    if (!isFiveM) {
        if (input.password.length < 6) return t('mail.errBadCredentials', 'Email or password is incorrect');
        const acc = { id: input.email, name: input.email.split('@')[0], email: input.email };
        if (!MOCK.accounts.find(a => a.email === input.email)) MOCK.accounts.push(acc);
        return acc;
    }
    const res = await apiCall<{ account: MailAccount }>('sd-phone:mail:signIn', input);
    if (res.success && res.data) return res.data.account;
    return res.message ?? t('mail.errSignIn', 'Could not sign in');
}

export async function signOut(email: string): Promise<void> {
    if (!isFiveM) {
        MOCK.accounts = MOCK.accounts.filter(a => a.email !== email);
        MOCK.messages = MOCK.messages.filter(m => m.accountId !== email);
        return;
    }
    await fetchNui<Envelope<unknown>>('sd-phone:mail:signOut', { email });
}

export async function deleteAccount(email: string): Promise<void> {
    if (!isFiveM) {
        MOCK.accounts = MOCK.accounts.filter(a => a.email !== email);
        MOCK.messages = MOCK.messages.filter(m => m.accountId !== email);
        return;
    }
    await fetchNui<Envelope<unknown>>('sd-phone:mail:deleteAccount', { email });
}

export async function sendMail(input: {
    fromEmail: string;
    to:        string[];
    subject:   string;
    body:      string;
    attachments?: MailAttachment[];
}): Promise<MailMessage | string> {
    if (!isFiveM) {
        const msg: MailMessage = {
            id: newId(),
            accountId: input.fromEmail,
            folder: 'sent',
            from: { name: input.fromEmail.split('@')[0], email: input.fromEmail },
            to: input.to,
            subject: input.subject,
            body: input.body,
            sentAt: new Date().toISOString(),
            read: true, flagged: false,
            attachments: input.attachments?.length ? input.attachments : undefined,
        };
        MOCK.messages.push(msg);
        return msg;
    }
    const res = await apiCall<{ sent: MailMessage }>('sd-phone:mail:send', input);
    if (res.success && res.data) return res.data.sent;
    return res.message ?? 'Could not send mail';
}

export async function saveDraft(input: {
    fromEmail: string;
    to:        string[];
    subject:   string;
    body:      string;
    attachments?: MailAttachment[];
}): Promise<MailMessage | string> {
    if (!isFiveM) {
        const msg: MailMessage = {
            id: newId(),
            accountId: input.fromEmail,
            folder: 'drafts',
            from: { name: input.fromEmail.split('@')[0], email: input.fromEmail },
            to: input.to,
            subject: input.subject,
            body: input.body,
            sentAt: new Date().toISOString(),
            read: true, flagged: false,
            attachments: input.attachments?.length ? input.attachments : undefined,
        };
        MOCK.messages.push(msg);
        return msg;
    }
    const res = await apiCall<{ draft: MailMessage }>('sd-phone:mail:saveDraft', input);
    if (res.success && res.data) return res.data.draft;
    return res.message ?? 'Could not save draft';
}

export async function markRead(accountEmail: string, messageId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui<Envelope<unknown>>('sd-phone:mail:markRead', { accountEmail, messageId });
}

export async function markManyRead(accountEmail: string, messageIds: string[]): Promise<void> {
    if (!isFiveM || messageIds.length === 0) return;
    await fetchNui<Envelope<unknown>>('sd-phone:mail:markManyRead', { accountEmail, messageIds });
}

export async function toggleFlag(accountEmail: string, messageId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui<Envelope<unknown>>('sd-phone:mail:toggleFlag', { accountEmail, messageId });
}

export async function moveToBin(accountEmail: string, messageId: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui<Envelope<unknown>>('sd-phone:mail:moveToBin', { accountEmail, messageId });
}

export async function attachmentSaveStates(accountEmail: string, messageId: string): Promise<boolean[]> {
    if (!isFiveM) return [];
    const res = await apiCall<{ saved?: boolean[] }>('sd-phone:mail:attachmentSaveStates', { accountEmail, messageId });
    return res.success && Array.isArray(res.data?.saved) ? res.data.saved : [];
}

export async function saveAttachment(accountEmail: string, messageId: string, index: number): Promise<{ ok: boolean; message?: string }> {
    if (!isFiveM) return { ok: true };
    const r = await apiCall<unknown>('sd-phone:mail:saveAttachment', { accountEmail, messageId, index });
    return r.success ? { ok: true } : { ok: false, message: r.message };
}

export async function discardDraft(accountEmail: string, messageId: string): Promise<void> {
    if (!isFiveM) {
        const i = MOCK.messages.findIndex(m => m.id === messageId && m.folder === 'drafts');
        if (i >= 0) MOCK.messages.splice(i, 1);
        return;
    }
    await fetchNui<Envelope<unknown>>('sd-phone:mail:discardDraft', { accountEmail, messageId });
}

export async function moveTo(accountEmail: string, messageId: string, folder: Folder): Promise<void> {
    if (!isFiveM) {
        const m = MOCK.messages.find(x => x.id === messageId);
        if (m) { m.folder = folder; if (folder === 'bin') m.flagged = false; }
        return;
    }
    await fetchNui<Envelope<unknown>>('sd-phone:mail:move', { accountEmail, messageId, folder });
}


export function inFolder(messages: MailMessage[], folder: Folder, accountId?: string): MailMessage[] {
    const scoped = accountId ? messages.filter(m => m.accountId === accountId) : messages;
    if (folder === 'flagged') return scoped.filter(m => m.flagged && m.folder !== 'bin');
    return scoped.filter(m => m.folder === folder);
}

export function unreadCount(messages: MailMessage[], folder: Folder, accountId?: string): number {
    return inFolder(messages, folder, accountId).filter(m => !m.read).length;
}


export function formatMailTime(iso: string): string {
    return formatListDate(iso);
}

export function formatFullDate(iso: string): string {
    const d = new Date(iso);
    const months = [t('mail.january', 'January'), t('mail.february', 'February'), t('mail.march', 'March'), t('mail.april', 'April'), t('mail.may', 'May'), t('mail.june', 'June'),
        t('mail.july', 'July'), t('mail.august', 'August'), t('mail.september', 'September'), t('mail.october', 'October'), t('mail.november', 'November'), t('mail.december', 'December')];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} at ${format12h(d.getHours(), d.getMinutes())}`;
}

export function previewBody(body: string): string {
    return body.replace(/\s+/g, ' ').trim();
}

export function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function avatarColor(name: string): string {
    const palette = ['#ff453a', '#ff9f0a', '#34c759', '#0a84ff', '#5e5ce6', '#bf5af2', '#64d2ff'];
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return palette[h % palette.length];
}
