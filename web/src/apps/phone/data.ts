import { getLocaleTag, t } from '@/i18n';
import { formatMediumDate } from '@/lib/time';

export interface Contact {
    id:        string;
    name:      string;
    initials:  string;
    color:     string;
    avatar?:   string;
    phone:     string;
    email?:    string;
    address?:  string;
    favorite?: boolean;
}

export const CONTACTS: Contact[] = [
    { id: 'amir',  name: 'Amir Vance',   initials: 'AV', color: '#0a84ff', phone: '(213) 555-0148', email: 'amir.vance@ls.mail',     address: '12 Vinewood Blvd' },
    { id: 'bree',  name: 'Bree Larsen',  initials: 'BL', color: '#ff375f', phone: '(213) 555-0192', email: 'bree.l@ls.mail',          address: '88 Vespucci Beach' },
    { id: 'carl',  name: 'Carl Jensen',  initials: 'CJ', color: '#30d158', phone: '(310) 555-0123', email: 'carl.j@ls.mail',          address: '4 Grove St', favorite: true },
    { id: 'carmen',name: 'Carmen Diaz',  initials: 'CD', color: '#ff9f0a', phone: '(310) 555-0166', email: 'carmen.d@ls.mail',        address: '210 Alta St' },
    { id: 'dave',  name: 'Dave Pirelli', initials: 'DP', color: '#bf5af2', phone: '(310) 555-0177', email: 'dave.p@ls.mail',          address: '9 Mirror Park' },
    { id: 'ghost', name: 'Ghost',        initials: 'GH', color: '#636366', phone: '(000) 000-0000' },
    { id: 'jenny', name: 'Jenny Voss',   initials: 'JV', color: '#ff453a', phone: '(415) 555-0136', email: 'jenny.voss@ls.mail',      address: '30 Del Perro Pier' },
    { id: 'liam',  name: 'Liam Walsh',   initials: 'LW', color: '#5e5ce6', phone: '(480) 555-0231', email: 'liam.w@ls.mail',          address: '17 Paleto Bay' },
    { id: 'lsm',   name: 'LS Mechanics', initials: 'LS', color: '#0a84ff', phone: '(480) 555-0294', email: 'shop@lsmechanics.biz',    address: '1 Greenwich Pkwy', favorite: true },
    { id: 'maya',  name: 'Maya Lopez',   initials: 'ML', color: '#ff9f0a', phone: '(415) 555-0188', email: 'maya.lopez@ls.mail',      address: '55 Rockford Hills' },
    { id: 'niko',  name: 'Niko Mares',   initials: 'NM', color: '#64d2ff', phone: '(602) 555-0145', email: 'niko.m@ls.mail',          address: '7 Sandy Shores' },
    { id: 'ryan',  name: 'Ryan Carter',  initials: 'RC', color: '#34c759', phone: '(602) 555-0119', email: 'ryan.carter@ls.mail',     address: '64 Mirror Park Blvd' },
    { id: 'sam',   name: 'Sam Nicol',    initials: 'SN', color: '#0a84ff', phone: '(702) 555-0167', email: 'sam.nicol@ls.mail',       address: '23 Richman Glen' },
    { id: 'tony',  name: 'Tony Prince',  initials: 'TP', color: '#ffd60a', phone: '(702) 555-0150', email: 'tony@vanillaunicorn.biz', address: 'Strawberry Ave' },
];

export interface ContactSection {
    letter:   string;
    contacts: Contact[];
}

export function groupContacts(contacts: Contact[]): ContactSection[] {
    const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));
    const map = new Map<string, Contact[]>();
    for (const c of sorted) {
        const letter = c.name[0].toUpperCase();
        const bucket = map.get(letter) ?? [];
        bucket.push(c);
        map.set(letter, bucket);
    }
    return [...map.entries()].map(([letter, list]) => ({ letter, contacts: list }));
}

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function matchesQuery(c: Contact, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    if (c.name.toLowerCase().includes(q)) return true;
    const digits = q.replace(/\D/g, '');
    return digits.length > 0 && c.phone.replace(/\D/g, '').includes(digits);
}

export { formatPhone } from '@/lib/phone';


export interface RawCall {
    id:        string;
    number:    string;
    name?:     string;
    direction: 'incoming' | 'outgoing' | 'missed';
    duration:  number;
    calledAt:  number;
}

export interface CallEntry {
    id:          string;
    contact?:    Contact;
    number:      string;
    noCallerId?: boolean;
    missed:      boolean;
    time:        string;
    date:        string;
    timeOfDay:   string;
    direction:   string;
    duration?:   string;
}

function digitsOf(s: string): string { return s.replace(/\D/g, ''); }

function fmtTimeOfDay(epoch: number): string {
    return new Date(epoch * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDate(epoch: number): string {
    return formatMediumDate(epoch);
}

function fmtListTime(epoch: number): string {
    const d = new Date(epoch * 1000);
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
    if (days <= 0)  return fmtTimeOfDay(epoch);
    if (days === 1) return t('phone.yesterday','Yesterday');
    if (days < 7)   return d.toLocaleDateString(getLocaleTag(), { weekday: 'long' });
    return d.toLocaleDateString(getLocaleTag(), { day: 'numeric', month: 'numeric', year: '2-digit' });
}

function fmtDuration(seconds: number): string {
    if (seconds <= 0)  return '';
    if (seconds < 60)  return seconds === 1 ? t('phone.secondOne','{count} second',{ count: seconds }) : t('phone.secondOther','{count} seconds',{ count: seconds });
    const mins = Math.round(seconds / 60);
    return mins === 1 ? t('phone.minuteOne','{count} minute',{ count: mins }) : t('phone.minuteOther','{count} minutes',{ count: mins });
}

export function toCallEntry(raw: RawCall, contacts: Contact[]): CallEntry {
    const directionLabel: Record<RawCall['direction'], string> = {
        incoming: t('phone.incomingCall','Incoming Call'),
        outgoing: t('phone.outgoingCall','Outgoing Call'),
        missed:   t('phone.missedCall','Missed Call'),
    };
    const contact = raw.number
        ? contacts.find(c => digitsOf(c.phone) === digitsOf(raw.number))
        : undefined;
    return {
        id:         raw.id,
        contact,
        number:     raw.number,
        noCallerId: !raw.number,
        missed:     raw.direction === 'missed',
        time:       fmtListTime(raw.calledAt),
        date:       fmtDate(raw.calledAt),
        timeOfDay:  fmtTimeOfDay(raw.calledAt),
        direction:  directionLabel[raw.direction] ?? t('phone.call','Call'),
        duration:   raw.direction === 'missed' ? undefined : (fmtDuration(raw.duration) || undefined),
    };
}

const NOW = Math.floor(Date.now() / 1000);
const HR  = 3600;
const DAY = 86_400;

export const RAW_CALLS: RawCall[] = [
    { id: 'r1', number: '(213) 555-0190', direction: 'outgoing', duration: 124, calledAt: NOW - 1 * HR },
    { id: 'r2', number: '(213) 555-0144', direction: 'missed',   duration: 0,   calledAt: NOW - 4 * HR },
    { id: 'r3', number: '(213) 555-0144', direction: 'missed',   duration: 0,   calledAt: NOW - 4 * HR - 60 },
    { id: 'r4', number: '(213) 555-0144', direction: 'missed',   duration: 0,   calledAt: NOW - 4 * HR - 120 },
    { id: 'r5', number: '(310) 555-0123', direction: 'incoming', duration: 312, calledAt: NOW - 7 * HR },
    { id: 'r6', number: '',               direction: 'incoming', duration: 63,  calledAt: NOW - 1 * DAY },
    { id: 'r7', number: '(480) 555-0294', direction: 'outgoing', duration: 740, calledAt: NOW - 3 * DAY },
];
