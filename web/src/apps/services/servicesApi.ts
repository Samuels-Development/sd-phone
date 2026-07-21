import { fetchNui, isFiveM } from '@/core/nui';
import { COMPANIES, EMPLOYEES, COMPANY_BALANCE, type Company, type Employee } from './data';
import { t } from '@/i18n';
import { apiData, type Envelope } from '@/core/api';


export interface Grade { level: number; label: string }

export interface MyCompany {
    job:        string;
    label:      string;
    isCompany?: boolean;
    isBoss:     boolean;
    available:  boolean;
    duty:       boolean;
    jobCalls:   boolean;
    jobMessages: boolean;
    myGrade?:   number;
    balance?:   number;
    grades?:    Grade[];
    employees?: Employee[];
}

export interface Directory {
    companies:  Company[];
    myCompany?: MyCompany | null;
    multijob?:  boolean;
    invoicesEnabled?: boolean;
    pendingOffers?: number;
}

interface MutResult { myCompany?: MyCompany | null }

export type ServiceResult = Envelope<MutResult>;

const DEV_MY_COMPANY: MyCompany = {
    job:       'police',
    label:     'Police',
    isCompany: true,
    isBoss:    true,
    available: true,
    duty:      true,
    jobCalls:  true,
    jobMessages: true,
    myGrade:   3,
    balance:   COMPANY_BALANCE,
    grades: [
        { level: 0, label: 'Recruit' }, { level: 1, label: 'Officer' },
        { level: 2, label: 'Sergeant' }, { level: 3, label: 'Lieutenant' },
    ],
    employees: EMPLOYEES,
};

const DEV_DIRECTORY: Directory = { companies: COMPANIES, myCompany: DEV_MY_COMPANY, multijob: true, invoicesEnabled: true, pendingOffers: 1 };

export async function fetchDirectory(): Promise<Directory> {
    if (!isFiveM) return DEV_DIRECTORY;
    return (await apiData<Directory>('sd-phone:services:directory')) ?? { companies: [] };
}

async function mutate(event: string, payload?: unknown): Promise<ServiceResult> {
    if (!isFiveM) return { success: true, data: { myCompany: DEV_MY_COMPANY } };
    return (await fetchNui<ServiceResult>(event, payload))
        ?? { success: false, message: t('services.noResponse', 'No response from server') };
}

export const setDuty        = (on: boolean)             => mutate('sd-phone:services:setDuty', { on });
export const setJobCalls    = (on: boolean)             => mutate('sd-phone:services:setJobCalls', { on });
export const setJobMessages = (on: boolean)             => mutate('sd-phone:services:setJobMessages', { on });
export const deposit     = (amount: number)             => mutate('sd-phone:services:deposit', { amount });
export const withdraw    = (amount: number)             => mutate('sd-phone:services:withdraw', { amount });
export const hire        = (serverId: number, grade: number) => mutate('sd-phone:services:hire', { serverId, grade });
export const fire        = (citizenid: string)          => mutate('sd-phone:services:fire', { citizenid });
export const promote     = (citizenid: string)          => mutate('sd-phone:services:promote', { citizenid });
export const demote      = (citizenid: string)          => mutate('sd-phone:services:demote', { citizenid });
export const quitCompany = ()                           => mutate('sd-phone:services:quit');

export async function callCompany(job: string): Promise<ServiceResult> {
    if (!isFiveM) return { success: true };
    return (await fetchNui<ServiceResult>('sd-phone:services:callCompany', { job }))
        ?? { success: false, message: t('services.noResponse', 'No response from server') };
}

type ServiceMsgKind = 'text' | 'image' | 'location';

export interface InboxMessage {
    id:        string;
    from:      'me' | 'them';
    name?:     string;
    body:      string;
    ts:        number;
    kind?:     ServiceMsgKind;
    mediaUrl?: string;
    wpCode?:   string;
    wpSub?:    string;
}

export interface ServiceDraft {
    kind:      ServiceMsgKind;
    body:      string;
    mediaUrl?: string;
    wpCode?:   string;
    wpSub?:    string;
}
export interface InboxThread {
    key:      string;
    name:     string;
    color:    string;
    emoji:    string;
    preview:  string;
    ts:       number;
    unread:   number;
    messages: InboxMessage[];
}
export interface Inbox { personal: InboxThread[]; job: InboxThread[]; hasJob: boolean }

const DEV_INBOX: Inbox = {
    personal: [
        {
            key: 'police', name: 'Police', color: '#F2C94C', emoji: '🚓',
            preview: 'On our way.', ts: Date.now() - 60_000, unread: 1,
            messages: [
                { id: 'd1', from: 'me',   body: 'Is anyone available to help me?', ts: Date.now() - 120_000 },
                { id: 'd2', from: 'them', name: 'Officer Marcus', body: 'On our way.', ts: Date.now() - 60_000 },
            ],
        },
    ],
    job: [
        {
            key: '5551234', name: 'John Doe', color: '#F2C94C', emoji: '🚓',
            preview: 'Is anyone available to help me?', ts: Date.now() - 120_000, unread: 2,
            messages: [{ id: 'd1', from: 'them', name: 'John Doe', body: 'Is anyone available to help me?', ts: Date.now() - 120_000 }],
        },
    ],
    hasJob: true,
};

export async function fetchInbox(): Promise<Inbox> {
    if (!isFiveM) return DEV_INBOX;
    return (await apiData<Inbox>('sd-phone:services:inbox')) ?? { personal: [], job: [], hasJob: false };
}

export async function messageCompany(job: string, draft: ServiceDraft): Promise<Inbox | null> {
    if (!isFiveM) return DEV_INBOX;
    return (await apiData<{ inbox: Inbox }>('sd-phone:services:messageCompany', { job, ...draft }))?.inbox ?? null;
}

export async function markThreadRead(scope: 'personal' | 'job', key: string): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:services:markRead', { scope, key });
}

export async function replyCompany(citizen: string, draft: ServiceDraft): Promise<Inbox | null> {
    if (!isFiveM) return DEV_INBOX;
    return (await apiData<{ inbox: Inbox }>('sd-phone:services:replyCompany', { citizen, ...draft }))?.inbox ?? null;
}

export interface SavedJob {
    job:        string;
    label:      string;
    grade:      number;
    gradeLabel: string;
    active?:    boolean;
}
export interface JobInvite {
    id:         string;
    job:        string;
    label:      string;
    grade:      number;
    gradeLabel: string;
    from:       string;
}
export interface JobsView { multijob: boolean; jobs: SavedJob[]; invites: JobInvite[]; max: number }

const DEV_JOBS: JobsView = {
    multijob: true,
    max: 5,
    jobs: [
        { job: 'police',    label: 'Police',    grade: 3, gradeLabel: 'Lieutenant', active: true },
        { job: 'mechanic',  label: 'Mechanic',  grade: 1, gradeLabel: 'Apprentice' },
        { job: 'ambulance', label: 'Ambulance', grade: 0, gradeLabel: 'Trainee' },
    ],
    invites: [
        { id: 'd1', job: 'taxi', label: 'Taxi', grade: 0, gradeLabel: 'Driver', from: 'Tom Benson' },
    ],
};

export async function fetchJobs(): Promise<JobsView> {
    if (!isFiveM) return DEV_JOBS;
    return (await apiData<JobsView>('sd-phone:services:listJobs')) ?? { multijob: false, jobs: [], invites: [], max: 0 };
}

export type JobsResult = Envelope<JobsView>;
async function jobsMutate(event: string, payload?: unknown): Promise<JobsResult> {
    if (!isFiveM) return { success: true, data: DEV_JOBS };
    return (await fetchNui<JobsResult>(event, payload))
        ?? { success: false, message: t('services.noResponse', 'No response from server') };
}

export const switchJob     = (job: string) => jobsMutate('sd-phone:services:switchJob', { job });
export const removeJob     = (job: string) => jobsMutate('sd-phone:services:removeJob', { job });
export const acceptInvite  = (id: string)  => jobsMutate('sd-phone:services:acceptInvite', { id });
export const declineInvite = (id: string)  => jobsMutate('sd-phone:services:declineInvite', { id });

type InvoiceStatus = 'pending' | 'paid' | 'cancelled';

export interface SentInvoice {
    id:       string;
    code?:    string;
    amount:   number;
    note:     string;
    status:   InvoiceStatus;
    toName:   string;
    toNumber: string;
    from:     string;
    ts:       number;
    paidAt?:  number;
}

export interface ReceivedInvoice {
    id:         string;
    code?:      string;
    job?:       string;
    personal?:  boolean;
    fromNumber?: string;
    label:      string;
    color:     string;
    emoji:     string;
    amount:    number;
    note:      string;
    status:    InvoiceStatus;
    from:      string;
    ts:        number;
}

const DEV_SENT_INVOICES: SentInvoice[] = [
    { id: 's1', amount: 1200, note: 'Repair · engine rebuild', status: 'pending', toName: 'Maya Lopez',   toNumber: '3105550199', from: 'Sam Nicol', ts: Date.now() - 300_000 },
    { id: 's2', amount: 450,  note: 'Tow fee',                 status: 'paid',    toName: 'Ryan Carter',  toNumber: '3105550148', from: 'Sam Nicol', ts: Date.now() - 3_600_000, paidAt: Date.now() - 3_000_000 },
    { id: 's3', amount: 800,  note: '',                        status: 'cancelled', toName: 'John Doe',   toNumber: '5551234',    from: 'Sam Nicol', ts: Date.now() - 7_200_000 },
];

const DEV_RECEIVED_INVOICES: ReceivedInvoice[] = [
    { id: 'r1', job: 'mechanic', label: 'Mechanic', color: '#3A3A3C', emoji: '⚙️', amount: 1200, note: 'Repair · engine rebuild', status: 'pending', from: 'Tommy V', ts: Date.now() - 240_000 },
    { id: 'r2', personal: true, label: '(310) 555-0199', fromNumber: '3105550199', color: '#0A84FF', emoji: '🧾', amount: 250, note: 'Dinner split', status: 'pending', from: '', ts: Date.now() - 900_000 },
    { id: 'r3', personal: true, label: '(310) 555-0148', fromNumber: '3105550148', color: '#0A84FF', emoji: '🧾', amount: 90, note: 'Fuel', status: 'paid', from: '', ts: Date.now() - 7_200_000 },
    { id: 'r4', job: 'police', label: 'Police', color: '#0A5BD3', emoji: '🚓', amount: 500, note: 'Speeding fine', status: 'cancelled', from: 'Officer Reed', ts: Date.now() - 10_800_000 },
];

export async function fetchSentInvoices(): Promise<SentInvoice[]> {
    if (!isFiveM) return DEV_SENT_INVOICES;
    return (await apiData<{ invoices: SentInvoice[] }>('sd-phone:services:invoices:list'))?.invoices ?? [];
}

export async function fetchReceivedInvoices(): Promise<ReceivedInvoice[]> {
    if (!isFiveM) return DEV_RECEIVED_INVOICES;
    return (await apiData<{ invoices: ReceivedInvoice[] }>('sd-phone:services:invoices:received'))?.invoices ?? [];
}

export type SentInvoicesResult = Envelope<{ invoices: SentInvoice[] }>;

export async function createInvoice(target: { number?: string; serverId?: number }, amount: number, note: string): Promise<SentInvoicesResult> {
    if (!isFiveM) {
        DEV_SENT_INVOICES.unshift({
            id: 's-' + Date.now(), amount, note, status: 'pending',
            toName: target.number ?? `ID ${target.serverId ?? 0}`, toNumber: target.number ?? '', from: 'Sam Nicol', ts: Date.now(),
        });
        return { success: true, data: { invoices: [...DEV_SENT_INVOICES] } };
    }
    return (await fetchNui<SentInvoicesResult>('sd-phone:services:invoices:create', { number: target.number, serverId: target.serverId, amount, note }))
        ?? { success: false, message: t('services.noResponse', 'No response from server') };
}

export async function cancelInvoice(id: string): Promise<SentInvoicesResult> {
    if (!isFiveM) return { success: true, data: { invoices: DEV_SENT_INVOICES.filter(i => i.id !== id) } };
    return (await fetchNui<SentInvoicesResult>('sd-phone:services:invoices:cancel', { id }))
        ?? { success: false, message: t('services.noResponse', 'No response from server') };
}

export type PayInvoiceResult = Envelope<{ balance: number; invoices: ReceivedInvoice[] }>;

export async function payInvoice(id: string): Promise<PayInvoiceResult> {
    if (!isFiveM) {
        const inv = DEV_RECEIVED_INVOICES.find(i => i.id === id);
        if (inv) inv.status = 'paid';
        return { success: true, data: { balance: 0, invoices: [...DEV_RECEIVED_INVOICES] } };
    }
    return (await fetchNui<PayInvoiceResult>('sd-phone:services:invoices:pay', { id }))
        ?? { success: false, message: t('services.noResponse', 'No response from server') };
}
