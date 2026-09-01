import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { t } from '@/i18n';
import { Sheet } from '@/ui/Sheet';
import { SearchBar } from '@/ui/SearchBar';
import { ContactAvatar } from '@/shared/ContactAvatar';
import { useContacts, useContactsStore } from '@/stores/contactsStore';
import { groupContacts, matchesQuery, type Contact } from '@/apps/phone/data';
import { useMaskedPhone } from '@/stores/themeStore';

export function ContactPickerSheet({ onPick, onClose, forceDark, zIndex, extra }: {
    onPick:    (c: Contact) => void;
    onClose:   () => void;
    forceDark?: boolean;
    zIndex?:    number;
    extra?:     ReactNode;
}) {
    const { contacts } = useContacts('contacts');
    const [query, setQuery] = useState('');
    const picked = useRef<Contact | null>(null);

    useEffect(() => {
        void useContactsStore.getState().load();
    }, []);

    const searching = query.trim().length > 0;
    const visible   = useMemo(
        () => (searching ? contacts.filter(c => matchesQuery(c, query)) : contacts),
        [contacts, query, searching],
    );
    const sections  = useMemo(() => groupContacts(visible), [visible]);

    function settle() {
        if (picked.current) onPick(picked.current);
        else onClose();
    }

    return (
        <Sheet onClose={settle} top={50} className="font-sf bg-base" forceDark={forceDark} zIndex={zIndex}>
            {({ close }) => {
                const choose = (c: Contact) => { picked.current = c; close(); };
                return (
                    <>
                        <div className="shrink-0 px-4 pb-2.5 pt-7">
                            <h2 className="px-1 pb-2.5 text-[28px] font-bold tracking-tight text-black dark:text-white">{t('common.selectContact', 'Select Contact')}</h2>
                            <SearchBar value={query} onChange={setQuery} placeholder={t('common.search', 'Search')} />
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-2">
                            {extra}
                            {sections.length === 0 ? (
                                <p className="mt-12 text-center text-[15px] text-ios-gray">
                                    {searching ? t('common.noResultsForQuery', 'No results for “{q}”', { q: query.trim() }) : t('common.noContacts', 'No contacts.')}
                                </p>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {sections.map(section => (
                                        <div key={section.letter}>
                                            <div className="px-1 pb-2 text-[16px] font-semibold uppercase tracking-wide text-black/45 dark:text-white/45">
                                                {section.letter}
                                            </div>
                                            <Card>
                                                {section.contacts.map((c, i) => (
                                                    <Row key={c.id} contact={c} divider={i < section.contacts.length - 1} onChoose={choose} />
                                                ))}
                                            </Card>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="shrink-0 border-t border-black/[0.08] py-4 text-center text-[22px] font-bold text-black/70 dark:border-white/10 dark:text-white/70">
                            {contacts.length} {contacts.length === 1 ? t('common.contact', 'Contact') : t('common.contacts', 'Contacts')}
                        </div>
                    </>
                );
            }}
        </Sheet>
    );
}

function Card({ children }: { children: ReactNode }) {
    return <div className="overflow-hidden rounded-[12px] bg-surface shadow-sm">{children}</div>;
}

function Row({ contact, divider, onChoose }: { contact: Contact; divider: boolean; onChoose: (c: Contact) => void }) {
    const phone = useMaskedPhone();
    return (
        <>
            <button
                type="button"
                onClick={() => onChoose(contact)}
                className="flex w-full items-center gap-4 px-4 py-3.5 text-left active:bg-black/[0.06] dark:active:bg-white/[0.06]"
            >
                <ContactAvatar contact={contact} size={56} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[21px] font-semibold text-black dark:text-white">{contact.name}</div>
                    <div className="mt-0.5 truncate text-[18px] font-medium text-black/55 dark:text-white/55">{phone(contact.phone)}</div>
                </div>
            </button>
            {divider && <div className="pointer-events-none bg-hairline/10" style={{ height: '0.5px' }} />}
        </>
    );
}
