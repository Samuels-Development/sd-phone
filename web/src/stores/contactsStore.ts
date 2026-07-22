import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { loadPhoneState, addContactApi } from '@/apps/phone/contactsApi';
import type { CardOverrides } from '@/apps/phone/contactsApi';
import type { Contact, RawCall } from '@/apps/phone/data';
import type { SimStatePush } from '@/core/types';
import { t } from '@/i18n';

interface ContactsState {
    contacts:    Contact[];
    recents:     RawCall[];
    myNumber:    string;
    myName:      string;
    card:        CardOverrides;
    loaded:      boolean;
    setContacts: (next: Contact[] | ((prev: Contact[]) => Contact[])) => void;
    setCard:     (next: CardOverrides) => void;
    load:        () => Promise<void>;
    refresh:     () => Promise<void>;
}

let inFlight: Promise<void> | null = null;

function fetchAndCommit(): Promise<void> {
    if (!inFlight) {
        inFlight = loadPhoneState()
            .then(state => {
                useContactsStore.setState({
                    contacts: state.contacts,
                    recents:  state.recents,
                    myNumber: state.myNumber,
                    myName:   state.myName,
                    card:     state.card,
                    loaded:   true,
                });
            })
            .catch(() => {})
            .finally(() => { inFlight = null; });
    }
    return inFlight;
}

export const useContactsStore = create<ContactsState>((set, get) => ({
    contacts: [],
    recents:  [],
    myNumber: '',
    myName:   '',
    card:     {},
    loaded:   false,

    setContacts: (next) => set(s => ({ contacts: typeof next === 'function' ? next(s.contacts) : next })),
    setCard:     (next) => set({ card: next }),

    load:    () => (get().loaded ? Promise.resolve() : fetchAndCommit()),
    refresh: () => fetchAndCommit(),
}));

export function useContacts(): ContactsState;
export function useContacts<K extends keyof ContactsState>(...keys: K[]): Pick<ContactsState, K>;
export function useContacts(...keys: (keyof ContactsState)[]): unknown {
    return useContactsStore(
        useShallow((s: ContactsState) => {
            if (keys.length === 0) return s;
            const out: Record<string, unknown> = {};
            for (const k of keys) out[k] = s[k];
            return out;
        }),
    );
}

/** Unique phones: the acting profile changed (different phone, or a restore replaced its data)
 *  - drop the cache so the next load() fetches the new profile's contacts, and refetch NOW when
 *  something already consumed it (kept-alive Phone/Messages read this store live). */
export function resetContacts(): void {
    const wasLoaded = useContactsStore.getState().loaded;
    useContactsStore.setState({ contacts: [], recents: [], myNumber: '', myName: '', card: {}, loaded: false });
    if (wasLoaded) void useContactsStore.getState().refresh();
}

/** Unique phones: a SIM swap/eject changes the phone's number (and in legacy mode the whole
 *  identity) under this load-once cache, so a loaded store refetches whenever a live SIM push
 *  carries a number that differs from the cached My Card one. Unloaded stores load lazily. */
export function syncSimNumber(push: SimStatePush | undefined): void {
    if (push?.enabled !== true) return;
    const s = useContactsStore.getState();
    if (!s.loaded) return;
    if ((push.number ?? '') === s.myNumber) return;
    void s.refresh();
}

/** Canonical add-contact path: guards duplicates/own-number, persists via the
 *  Contacts server action, and commits the created row to the store. */
export async function saveNewContact(c: Contact): Promise<{ error?: string; contact?: Contact }> {
    await useContactsStore.getState().load();
    const { contacts, myNumber } = useContactsStore.getState();
    const newDigits = c.phone.replace(/\D/g, '');
    if (!newDigits) return { error: t('phone.enterPhoneNumber', 'Enter a phone number.') };
    if (myNumber.replace(/\D/g, '') === newDigits) {
        return { error: t('phone.cantAddOwnNumber', "You can't add your own number.") };
    }
    if (contacts.some(x => (x.phone ?? '').replace(/\D/g, '') === newDigits)) {
        return { error: t('phone.duplicateContact', 'You already have a contact with this number.') };
    }
    try {
        const created = await addContactApi({
            name: c.name, phone: c.phone, email: c.email, address: c.address, avatar: c.avatar,
        });
        useContactsStore.getState().setContacts(prev => [...prev, created]);
        return { contact: created };
    } catch (e) {
        return { error: e instanceof Error ? e.message : t('phone.failedToAddContact', 'Failed to add contact.') };
    }
}
