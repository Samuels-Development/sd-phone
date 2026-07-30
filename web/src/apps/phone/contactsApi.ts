import { fetchNui, isFiveM } from '@/core/nui';
import { CONTACTS, RAW_CALLS, type Contact, type RawCall } from './data';
import { t } from '@/i18n';
import { apiCall, apiData } from '@/core/api';
import { colorFor, initialsFor } from '@/lib/format';

export interface ContactInput {
    name:     string;
    phone:    string;
    email?:   string;
    address?: string;
    avatar?:  string;
}

export interface CardOverrides {
    name?:    string;
    avatar?:  string;
    email?:   string;
    address?: string;
}

export async function loadPhoneState(): Promise<{ contacts: Contact[]; recents: RawCall[]; myNumber: string; myName: string; card: CardOverrides }> {
    if (!isFiveM) return { contacts: CONTACTS.map(c => ({ ...c })), recents: RAW_CALLS, myNumber: '2135550100', myName: 'Samuel Black', card: { email: 'samuel.black@lsmail.com' } };
    const res = await apiData<{ contacts: Contact[]; recents: RawCall[]; myNumber: string; myName: string; card: CardOverrides }>('sd-phone:contacts:list');
    if (res) {
        return {
            contacts: res.contacts,
            recents:  res.recents,
            myNumber: res.myNumber ?? '',
            myName:   res.myName ?? '',
            card:     res.card ?? {},
        };
    }
    return { contacts: [], recents: [], myNumber: '', myName: '', card: {} };
}

export function saveCardApi(fields: CardOverrides): void {
    if (!isFiveM) return;
    void fetchNui('sd-phone:contacts:saveCard', fields);
}

export async function addContactApi(input: ContactInput): Promise<Contact> {
    if (!isFiveM) {
        const name = input.name.trim() || input.phone.trim() || 'New Contact';
        return {
            id:       `c-${Date.now()}`,
            name,
            phone:    input.phone.trim(),
            email:    input.email?.trim()   || undefined,
            address:  input.address?.trim() || undefined,
            avatar:   input.avatar || undefined,
            color:    colorFor(name),
            initials: initialsFor(name),
            favorite: false,
        };
    }
    const res = await apiCall<Contact>('sd-phone:contacts:add', input);
    if (!res.success || !res.data) throw new Error(res.message ?? t('phone.failedToAddContactErr','Failed to add contact'));
    return res.data;
}

export function updateContactApi(c: Contact): void {
    if (!isFiveM) return;
    void fetchNui('sd-phone:contacts:update', { id: c.id, name: c.name, phone: c.phone, email: c.email, address: c.address, avatar: c.avatar });
}

export async function shareContactApi(target: number, contact: Contact): Promise<boolean> {
    if (!isFiveM) return true;
    const r = await apiCall<unknown>('sd-phone:contacts:share', {
        target,
        name:    contact.name,
        phone:   contact.phone,
        email:   contact.email,
        address: contact.address,
        avatar:  contact.avatar,
    });
    return r.success;
}

export function deleteContactApi(id: string): void {
    if (!isFiveM) return;
    void fetchNui('sd-phone:contacts:delete', { id });
}

export function setFavoriteApi(id: string, favorite: boolean): void {
    if (!isFiveM) return;
    void fetchNui('sd-phone:contacts:favorite', { id, favorite });
}

export async function isNumberBlockedApi(number: string): Promise<boolean> {
    if (!isFiveM) return false;
    const r = await apiData<{ blocked: boolean }>('sd-phone:contacts:isBlocked', { number });
    return !!r?.blocked;
}

export async function setBlockedApi(number: string, blocked: boolean): Promise<boolean> {
    if (!isFiveM) return blocked;
    const r = await apiCall<{ blocked: boolean }>(
        blocked ? 'sd-phone:contacts:block' : 'sd-phone:contacts:unblock',
        { number },
    );
    return r.success ? blocked : !blocked;
}
