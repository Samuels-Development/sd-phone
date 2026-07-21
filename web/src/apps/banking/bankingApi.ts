import { fetchNui, isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { ACCOUNTS, TRANSACTIONS } from './data';
import { apiData, type Envelope } from '@/core/api';
import { formatClockTime } from '@/lib/time';
import type { SentInvoice, SentInvoicesResult } from '@/apps/services/servicesApi';

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
    balance:      number;
    cash:         number;
    name:         string;
    number:       string;
    transactions: BankTx[];
}

const DEV_OVERVIEW: BankOverview = {
    balance: ACCOUNTS[0].balance,
    cash:    1_240,
    name:    'Sam Nicol',
    number:  '2051189847',
    transactions: TRANSACTIONS
        .filter(t => t.accountId === ACCOUNTS[0].id)
        .map(t => ({ id: t.id, merchant: t.merchant, amount: t.amount, category: t.category, date: t.date, pending: t.pending, peerNumber: t.peerNumber, peerInitials: t.peerInitials, peerColor: t.peerColor })),
};

export async function fetchOverview(): Promise<BankOverview> {
    if (!isFiveM) return DEV_OVERVIEW;
    return (await apiData<BankOverview>('sd-phone:banking:overview'))
        ?? { balance: 0, cash: 0, name: '', number: '', transactions: [] };
}

export async function sendMoney(number: string, amount: number, note?: string): Promise<Envelope<{ balance: number; transaction: BankTx }>> {
    if (!isFiveM) {
        return {
            success: true,
            data: {
                balance: DEV_OVERVIEW.balance - amount,
                transaction: { id: 'dev-' + Date.now(), merchant: 'Sent to ' + number, amount: -amount, category: 'transfer', date: new Date().toISOString() },
            },
        };
    }
    return (await fetchNui<Envelope<{ balance: number; transaction: BankTx }>>('sd-phone:banking:send', { number, amount, note }))
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

export async function createPersonalInvoice(number: string, amount: number, note: string): Promise<SentInvoicesResult> {
    if (!isFiveM) {
        DEV_PERSONAL_SENT.unshift({
            id: 'p-' + Date.now(), amount, note, status: 'pending',
            toName: number, toNumber: number, from: DEV_OVERVIEW.name, ts: Date.now(),
        });
        return { success: true, data: { invoices: [...DEV_PERSONAL_SENT] } };
    }
    return (await fetchNui<SentInvoicesResult>('sd-phone:banking:invoices:create', { number, amount, note }))
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
            else                     label = new Date(key + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            return { key, label, items: items.sort((a, b) => b.date.localeCompare(a.date)) };
        });
}

export function txTimeLabel(dateStr: string): string {
    const d       = new Date(dateStr);
    const todayK  = new Date().toISOString().slice(0, 10);
    if (dateStr.slice(0, 10) === todayK) {
        return formatClockTime(d, true);
    }
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}
