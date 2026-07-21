import { useCallback, useEffect, useState } from 'react';

import { ContactsTab } from './contacts/ContactsTab';
import { RecentsTab } from './recents/RecentsTab';
import { KeypadTab } from './keypad/KeypadTab';
import { FavoritesTab } from './contacts/FavoritesTab';
import { PhoneTabBar, type PhoneTab } from './PhoneTabBar';
import { AlertDialog } from '@/ui/AlertDialog';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { formatPhone, toCallEntry, type Contact } from './data';
import {
    updateContactApi, deleteContactApi,
    setFavoriteApi, saveCardApi, type CardOverrides,
} from './contactsApi';
import { dialCall } from './callsApi';
import { useContacts, useContactsStore, saveNewContact } from '@/stores/contactsStore';
import { t } from '@/i18n';

interface CallTarget { number: string; name?: string }

export function Phone({ onClose: _onClose }: { onClose: () => void }) {
    const [tab,        setTab]        = useSessionState<PhoneTab>('phone:tab', 'contacts');
    const { contacts, recents: recentsRaw, myNumber, myName, card } =
        useContacts('contacts', 'recents', 'myNumber', 'myName', 'card');
    const [callTarget, setCallTarget] = useState<CallTarget | null>(null);
    const [dialError,  setDialError]  = useState<string | null>(null);

    useEffect(() => {
        void useContactsStore.getState().load();
    }, []);

    const favorites = contacts.filter(c => c.favorite);
    const recents   = recentsRaw.map(r => toCallEntry(r, contacts));

    async function addContact(c: Contact): Promise<string | null> {
        const res = await saveNewContact(c);
        return res.error ?? null;
    }
    function updateContact(c: Contact) {
        useContactsStore.getState().setContacts(prev => prev.map(x => (x.id === c.id ? c : x)));
        updateContactApi(c);
    }
    function updateCard(c: Contact) {
        const fields: CardOverrides = { name: c.name, avatar: c.avatar, email: c.email, address: c.address };
        useContactsStore.getState().setCard(fields);
        saveCardApi(fields);
    }
    function deleteContact(id: string) {
        useContactsStore.getState().setContacts(prev => prev.filter(x => x.id !== id));
        deleteContactApi(id);
    }
    function toggleFavorite(id: string, favorite: boolean) {
        useContactsStore.getState().setContacts(prev => prev.map(x => (x.id === id ? { ...x, favorite } : x)));
        setFavoriteApi(id, favorite);
    }

    useNuiEvent('sd-phone:contacts:shared', useCallback((c: Contact) => {
        useContactsStore.getState().setContacts(prev => (prev.some(x => x.id === c.id) ? prev : [...prev, c]));
    }, []));
    useNuiEvent('sd-phone:contacts:removed', useCallback((data) => {
        const digits = (data?.phone ?? '').replace(/\D/g, '');
        if (!digits) return;
        useContactsStore.getState().setContacts(prev => prev.filter(x => (x.phone ?? '').replace(/\D/g, '') !== digits));
    }, []));
    async function placeCall(target: CallTarget) {
        if (!target.number) return;
        const res = await dialCall(target.number, target.name);
        if (!res.success) setDialError(res.message ?? t('phone.unableToPlaceCall','Unable to place call'));
    }

    useNuiEvent('sd-phone:call:ended', useCallback(() => {
        void useContactsStore.getState().refresh();
    }, []));

    return (
        <div className="absolute inset-0 flex flex-col bg-[#d4d4d4] font-sf dark:bg-base">
            <div className="h-[61px] shrink-0" aria-hidden />

            <div className="flex flex-1 flex-col overflow-hidden">
                <div key={tab} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                    {tab === 'contacts' ? (
                        <ContactsTab
                            contacts={contacts}
                            myNumber={myNumber}
                            myName={myName}
                            card={card}
                            onRequestCall={setCallTarget}
                            onAddContact={addContact}
                            onUpdateContact={updateContact}
                            onSaveCard={updateCard}
                            onDeleteContact={deleteContact}
                            onToggleFavorite={toggleFavorite}
                        />
                    ) : tab === 'recents' ? (
                        <RecentsTab
                            recents={recents}
                            onAddContact={addContact}
                            onRequestCall={setCallTarget}
                            onUpdateContact={updateContact}
                            onDeleteContact={deleteContact}
                            onToggleFavorite={toggleFavorite}
                        />
                    ) : tab === 'keypad' ? (
                        <KeypadTab onAddContact={addContact} onCall={placeCall} />
                    ) : (
                        <FavoritesTab
                            favorites={favorites}
                            onRemoveFavorite={id => toggleFavorite(id, false)}
                            onRequestCall={setCallTarget}
                            onUpdateContact={updateContact}
                            onDeleteContact={deleteContact}
                            onToggleFavorite={toggleFavorite}
                        />
                    )}
                </div>
            </div>

            <PhoneTabBar tab={tab} onChange={setTab} />

            {callTarget !== null && (
                <AlertDialog
                    title={t('phone.callName','Call {name}',{ name: callTarget.name || formatPhone(callTarget.number) })}
                    message={t('phone.callConfirm','Are you sure you want to call {name}?',{ name: callTarget.name || formatPhone(callTarget.number) })}
                    cancelLabel={t('phone.cancel','Cancel')}
                    confirmLabel={t('phone.call','Call')}
                    onCancel={() => setCallTarget(null)}
                    onConfirm={() => { void placeCall(callTarget); setCallTarget(null); }}
                />
            )}

            {dialError !== null && (
                <AlertDialog
                    title={t('phone.callFailed','Call Failed')}
                    message={dialError}
                    confirmLabel={t('phone.ok','OK')}
                    hideCancel
                    onCancel={() => setDialError(null)}
                    onConfirm={() => setDialError(null)}
                />
            )}
        </div>
    );
}
