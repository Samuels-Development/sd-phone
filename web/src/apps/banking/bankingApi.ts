import { fetchNui, isFiveM } from '@/core/nui';
import { getLocaleTag, t } from '@/i18n';
import { ACCOUNTS, TRANSACTIONS } from './data';
import { apiData, type Envelope } from '@/core/api';
import { formatClockTime } from '@/lib/time';
import type { SentInvoice, SentInvoicesResult } from '@/apps/services/servicesApi';
import { presetFor, type CardStyle } from './bankBrands';

export interface BankTx {
    id:        string;
    merchant:  string;
    amount:    number;
    category:  string;
    date:      string;
    pending?:  boolean;
    avatar?:       string;
    peerColor?:    string;
    peerInitials?: string;
    peerNumber?:   string;
}

export interface BankOverview {
    balance:        number;
    cash:           number;
    name:           string;
    number:         string;
    allowAnonymous: boolean;
    cardStyle:      CardStyle;
    cardLocked:     boolean;
    standingOrders: boolean;
    transactions:   BankTx[];
}

const DEV_OVERVIEW: BankOverview = {
    balance: ACCOUNTS[0].balance,
    cash:    1_240,
    name:    'Sam Nicol',
    number:  '2135550100',
    allowAnonymous: true,
    cardStyle: presetFor('fleeca'),
    cardLocked: false,
    standingOrders: true,
    transactions: TRANSACTIONS
        .filter(t => t.accountId === ACCOUNTS[0].id)
        .map(t => ({ id: t.id, merchant: t.merchant, amount: t.amount, category: t.category, date: t.date, pending: t.pending, peerNumber: t.peerNumber, peerInitials: t.peerInitials, peerColor: t.peerColor })),
};

export async function fetchOverview(): Promise<BankOverview> {
    if (!isFiveM) return DEV_OVERVIEW;
    return (await apiData<BankOverview>('sd-phone:banking:overview'))
        ?? { balance: 0, cash: 0, name: '', number: '', allowAnonymous: false, cardStyle: presetFor('fleeca'), cardLocked: true, standingOrders: false, transactions: [] };
}

export async function setCardStyle(style: CardStyle): Promise<Envelope<{ cardStyle: CardStyle }>> {
    if (!isFiveM) {
        DEV_OVERVIEW.cardStyle = style;
        return { success: true, data: { cardStyle: style } };
    }
    return (await fetchNui<Envelope<{ cardStyle: CardStyle }>>('sd-phone:banking:setCardStyle', style))
        ?? { success: false, message: t('banking.noServerResponse', 'No response from server') };
}

export type SendMode = 'number' | 'playerId';

export interface SendTarget { number?: string; serverId?: number }

export function sendTarget(mode: SendMode, value: string): SendTarget {
    return mode === 'playerId' ? { serverId: parseInt(value, 10) } : { number: value };
}

export async function sendMoney(target: SendTarget, amount: number, anonymous = false, note?: string): Promise<Envelope<{ balance: number; transaction: BankTx }>> {
    if (!isFiveM) {
        const to = target.number ?? `ID ${target.serverId ?? 0}`;
        return {
            success: true,
            data: {
                balance: DEV_OVERVIEW.balance - amount,
                transaction: { id: 'dev-' + Date.now(), merchant: 'Sent to ' + to, amount: -amount, category: 'transfer', date: new Date().toISOString() },
            },
        };
    }
    return (await fetchNui<Envelope<{ balance: number; transaction: BankTx }>>('sd-phone:banking:send', { number: target.number, serverId: target.serverId, amount, anonymous, note }))
        ?? { success: false, message: t('banking.noServerResponse', 'No response from server') };
}

// Person-to-person invoices: same row shape the services sent list uses (the server shapes both
// with shapeSent), fetched through the banking proxies.
export type PersonalInvoice = SentInvoice;

const DEV_PERSONAL_SENT: PersonalInvoice[] = [
    { id: 'p1', amount: 250, note: 'Dinner split', status: 'pending', toName: 'Maya Lopez', toNumber: '3105550199', from: 'Sam Nicol', ts: Date.now() - 600_000 },
    { id: 'p2', amount: 75,  note: 'Taxi ride',    status: 'paid',    toName: 'Ryan Carter', toNumber: '3105550148', from: 'Sam Nicol', ts: Date.now() - 5_400_000, paidAt: Date.now() - 4_800_000 },
];

export async function fetchPersonalSent(): Promise<PersonalInvoice[]> {
    if (!isFiveM) return [...DEV_PERSONAL_SENT];
    return (await apiData<{ invoices: PersonalInvoice[] }>('sd-phone:banking:invoices:sent'))?.invoices ?? [];
}

export async function createPersonalInvoice(target: { number?: string; serverId?: number }, amount: number, note: string): Promise<SentInvoicesResult> {
    if (!isFiveM) {
        DEV_PERSONAL_SENT.unshift({
            id: 'p-' + Date.now(), amount, note, status: 'pending',
            toName: target.number ?? `ID ${target.serverId ?? 0}`, toNumber: target.number ?? '', from: DEV_OVERVIEW.name, ts: Date.now(),
        });
        return { success: true, data: { invoices: [...DEV_PERSONAL_SENT] } };
    }
    return (await fetchNui<SentInvoicesResult>('sd-phone:banking:invoices:create', { number: target.number, serverId: target.serverId, amount, note }))
        ?? { success: false, message: t('banking.noServerResponse', 'No response from server') };
}

export async function cancelPersonalInvoice(id: string): Promise<SentInvoicesResult> {
    if (!isFiveM) {
        const inv = DEV_PERSONAL_SENT.find(i => i.id === id);
        if (inv) inv.status = 'cancelled';
        return { success: true, data: { invoices: [...DEV_PERSONAL_SENT] } };
    }
    return (await fetchNui<SentInvoicesResult>('sd-phone:banking:invoices:cancel', { id }))
        ?? { success: false, message: t('banking.noServerResponse', 'No response from server') };
}

export type StandingInterval = 'daily' | 'weekly' | 'monthly';
export type StandingStatus   = 'ok' | 'insufficient' | 'failed';

export interface StandingOrder {
    id:             string;
    recipient:      string;
    recipientName:  string | null;
    label:          string;
    amount:         number;
    interval:       StandingInterval;
    nextRun:        number;
    active:         boolean;
    lastRun:        number | null;
    lastStatus:     StandingStatus | null;
}

export interface StandingDraft {
    number:    string;
    name?:     string;
    label:     string;
    amount:    number;
    interval:  StandingInterval;
    firstRun?: number;
}

type RawStandingOrder = Omit<StandingOrder, 'recipientName' | 'lastRun' | 'lastStatus'> & {
    recipientName?: string;
    lastRun?:       number;
    lastStatus?:    StandingStatus;
};

function normaliseOrders(rows: RawStandingOrder[] | undefined): StandingOrder[] {
    if (!Array.isArray(rows)) return [];
    return rows.map(row => ({
        ...row,
        recipientName: row.recipientName ?? null,
        lastRun:       row.lastRun ?? null,
        lastStatus:    row.lastStatus ?? null,
    }));
}

const DEV_ORDERS: StandingOrder[] = [
    {
        id: 's1', recipient: '3105550199', recipientName: 'Maya Lopez', label: 'Apartment rent',
        amount: 2_400, interval: 'monthly', nextRun: Math.floor(Date.now() / 1000) + 4 * 86_400,
        active: true, lastRun: Math.floor(Date.now() / 1000) - 26 * 86_400, lastStatus: 'ok',
    },
    {
        id: 's2', recipient: '3105550148', recipientName: 'Ryan Carter', label: 'Garage share',
        amount: 150, interval: 'weekly', nextRun: Math.floor(Date.now() / 1000) + 2 * 86_400,
        active: false, lastRun: Math.floor(Date.now() / 1000) - 5 * 86_400, lastStatus: 'insufficient',
    },
];

export async function fetchStandingOrders(): Promise<StandingOrder[]> {
    if (!isFiveM) return DEV_ORDERS.map(o => ({ ...o }));
    return normaliseOrders((await apiData<{ orders: RawStandingOrder[] }>('sd-phone:banking:standing:list'))?.orders);
}

type StandingResult = Envelope<{ orders: StandingOrder[] }>;

function devResult(): StandingResult {
    return { success: true, data: { orders: DEV_ORDERS.map(o => ({ ...o })) } };
}

async function standingCall(event: string, payload: unknown): Promise<StandingResult> {
    const res = await fetchNui<Envelope<{ orders: RawStandingOrder[] }>>(event, payload);
    if (!res) return { success: false, message: t('banking.noServerResponse', 'No response from server') };
    if (!res.success) return { success: false, message: res.message, messageKey: res.messageKey, messageVars: res.messageVars };
    return { success: true, data: { orders: normaliseOrders(res.data?.orders) } };
}

export async function createStandingOrder(draft: StandingDraft): Promise<StandingResult> {
    if (!isFiveM) {
        DEV_ORDERS.push({
            id: 's-' + Date.now(), recipient: draft.number, recipientName: draft.name ?? null,
            label: draft.label, amount: draft.amount, interval: draft.interval,
            nextRun: draft.firstRun ?? Math.floor(Date.now() / 1000) + 3_600,
            active: true, lastRun: null, lastStatus: null,
        });
        return devResult();
    }
    return standingCall('sd-phone:banking:standing:create', draft);
}

export async function updateStandingOrder(id: string, patch: {
    label: string; amount: number; interval: StandingInterval; active: boolean;
}): Promise<StandingResult> {
    if (!isFiveM) {
        const order = DEV_ORDERS.find(o => o.id === id);
        if (order) Object.assign(order, patch);
        return devResult();
    }
    return standingCall('sd-phone:banking:standing:update', { id, ...patch });
}

export async function deleteStandingOrder(id: string): Promise<StandingResult> {
    if (!isFiveM) {
        const at = DEV_ORDERS.findIndex(o => o.id === id);
        if (at >= 0) DEV_ORDERS.splice(at, 1);
        return devResult();
    }
    return standingCall('sd-phone:banking:standing:delete', { id });
}

export interface BankDay { key: string; label: string; items: BankTx[] }

export function groupTx(txs: BankTx[]): BankDay[] {
    const map = new Map<string, BankTx[]>();
    for (const t of txs) {
        const k = t.date.slice(0, 10);
        const arr = map.get(k);
        if (arr) arr.push(t); else map.set(k, [t]);
    }
    const now    = new Date();
    const todayK = now.toISOString().slice(0, 10);
    const yestK  = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

    return Array.from(map.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([key, items]) => {
            let label: string;
            if (key === todayK)      label = t('banking.today', 'Today');
            else if (key === yestK)  label = t('banking.yesterday', 'Yesterday');
            else                     label = new Date(key + 'T00:00:00').toLocaleDateString(getLocaleTag(), { weekday: 'short', month: 'short', day: 'numeric' });
            return { key, label, items: items.sort((a, b) => b.date.localeCompare(a.date)) };
        });
}

export function txTimeLabel(dateStr: string): string {
    const d       = new Date(dateStr);
    const todayK  = new Date().toISOString().slice(0, 10);
    if (dateStr.slice(0, 10) === todayK) {
        return formatClockTime(d, true);
    }
    return d.toLocaleDateString(getLocaleTag(), { day: 'numeric', month: 'short' });
}
