import { useRef, useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';

import { ContactAvatar } from '@/shared/ContactAvatar';
import { useSessionState } from '@/hooks/useSessionState';
import { useDidEnter } from '@/hooks/useDidEnter';
import { SearchBar } from '@/ui/SearchBar';
import { AddContact } from './AddContact';
import { ContactDetail } from './ContactDetail';
import type { CardOverrides } from '../contactsApi';
import {
    ALPHABET, formatPhone, groupContacts, matchesQuery,
    type Contact,
} from '../data';
import { initialsFor } from '@/lib/format';
import { t } from '@/i18n';

export function ContactsTab({ contacts, myNumber, myName, card, onRequestCall, onAddContact, onUpdateContact, onSaveCard, onDeleteContact, onToggleFavorite }: {
    contacts:         Contact[];
    myNumber:         string;
    myName:           string;
    card:             CardOverrides;
    onRequestCall:    (target: { number: string; name?: string }) => void;
    onAddContact:     (c: Contact) => Promise<string | null>;
    onUpdateContact:  (c: Contact) => void;
    onSaveCard:       (c: Contact) => void;
    onDeleteContact:  (id: string) => void;
    onToggleFavorite: (id: string, favorite: boolean) => void;
}) {
    const [query, setQuery] = useSessionState('phone:contactsQuery', '');
    const [selected, setSelected] = useSessionState<Contact | null>('phone:openContact', null);
    const animateNav = useDidEnter();
    const [adding, setAdding] = useState(false);
    const [showMyCard, setShowMyCard] = useState(false);
    const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const cardName = card.name || myName || t('phone.myCard','My Card');
    const myCard: Contact = {
        id:       'me',
        name:     cardName,
        initials: initialsFor(cardName),
        color:    '#8e8e93',
        phone:    formatPhone(myNumber),
        email:    card.email,
        address:  card.address,
        avatar:   card.avatar,
    };

    const sections = groupContacts(contacts);
    const present  = new Set(sections.map(s => s.letter));
    const results  = query.trim() ? contacts.filter(c => matchesQuery(c, query)) : [];
    const searching = query.trim().length > 0;

    function jumpTo(letter: string) {
        sectionRefs.current[letter]?.scrollIntoView({ block: 'start' });
    }

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-5 pb-1 pt-1">
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">{t('phone.contacts','Contacts')}</h1>
                <button type="button" aria-label={t('phone.addContact','Add contact')} onClick={() => setAdding(true)} className="text-ios-blue active:opacity-60">
                    <Plus className="h-[28px] w-[28px]" strokeWidth={2} />
                </button>
            </div>

            <SearchBar value={query} onChange={setQuery} className="mx-4 mb-3" />

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div className="absolute inset-0 overflow-y-auto no-scrollbar pl-4 pr-5 pb-6">
                    {searching ? (
                        results.length > 0 ? (
                            <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                                {results.map((c, i) => (
                                    <ContactRow key={c.id} contact={c} divider={i < results.length - 1} onOpen={setSelected} />
                                ))}
                            </div>
                        ) : (
                            <p className="mt-10 text-center text-[15px] text-ios-gray">
                                {t('phone.noResultsFor','No results for “{query}”',{ query })}
                            </p>
                        )
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => setShowMyCard(true)}
                                className="mb-5 flex w-full items-center gap-3.5 rounded-[10px] bg-[#e5e5e5] px-3.5 py-3 text-left active:opacity-80 dark:bg-surface"
                            >
                                <ContactAvatar contact={myCard} size={60} />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[20px] font-semibold text-black dark:text-white">{myCard.name}</div>
                                    <div className="text-[15px] font-medium text-black/60 dark:text-white/60">{t('phone.myCard','My Card')}</div>
                                </div>
                                <ChevronRight className="h-[20px] w-[20px] shrink-0 text-black/30 dark:text-white/30" strokeWidth={2.5} />
                            </button>

                            <div className="flex flex-col gap-4">
                                {sections.map(section => (
                                    <div key={section.letter} ref={el => { sectionRefs.current[section.letter] = el; }}>
                                        <div className="px-2 pb-1.5 pt-0.5 text-[15px] font-semibold uppercase text-black/45 dark:text-white/45">
                                            {section.letter}
                                        </div>
                                        <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                                            {section.contacts.map((c, i) => (
                                                <ContactRow key={c.id} contact={c} divider={i < section.contacts.length - 1} onOpen={setSelected} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {!searching && (
                    <div className="absolute inset-y-1 right-0 flex w-5 flex-col items-center justify-center gap-1.5">
                        {ALPHABET.map(letter => (
                            <button
                                key={letter}
                                type="button"
                                onClick={() => jumpTo(letter)}
                                disabled={!present.has(letter)}
                                className={`text-[11px] font-bold leading-none ${
                                    present.has(letter) ? 'text-ios-blue active:opacity-50' : 'text-ios-blue/30'
                                }`}
                            >
                                {letter}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selected && (
                <ContactDetail
                    contact={selected}
                    animateIn={animateNav}
                    onBack={() => setSelected(null)}
                    onCall={onRequestCall}
                    onUpdate={onUpdateContact}
                    onDelete={id => { onDeleteContact(id); setSelected(null); }}
                    onToggleFavorite={onToggleFavorite}
                />
            )}

            {showMyCard && (
                <ContactDetail contact={myCard} minimal onSaveCard={onSaveCard} onBack={() => setShowMyCard(false)} />
            )}

            {adding && (
                <AddContact
                    onCancel={() => setAdding(false)}
                    onSave={onAddContact}
                />
            )}
        </div>
    );
}

function ContactRow({ contact, divider, onOpen }: { contact: Contact; divider: boolean; onOpen: (c: Contact) => void }) {
    return (
        <>
            <button
                type="button"
                onClick={() => onOpen(contact)}
                className="flex w-full items-center gap-3.5 px-3.5 py-3.5 text-left active:bg-black/5 dark:active:bg-white/5"
            >
                <ContactAvatar contact={contact} size={56} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[20px] font-semibold text-black dark:text-white">{contact.name}</div>
                    <div className="truncate text-[17px] font-medium text-black/60 dark:text-white/60">{formatPhone(contact.phone)}</div>
                </div>
            </button>
            {divider && (
                <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />
            )}
        </>
    );
}
