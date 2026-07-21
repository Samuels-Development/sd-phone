import { useState } from 'react';
import { Clock, Info } from 'lucide-react';

import { ContactAvatar, PlaceholderAvatar } from '@/shared/ContactAvatar';
import { EmptyState } from '@/ui/EmptyState';
import { useSessionState } from '@/hooks/useSessionState';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { AddContact } from '../contacts/AddContact';
import { CallDetail } from './CallDetail';
import { ContactDetail } from '../contacts/ContactDetail';
import { formatPhone, type CallEntry, type Contact } from '../data';
import { t } from '@/i18n';

type Filter = 'all' | 'missed';

export function RecentsTab({ recents, onAddContact, onRequestCall, onUpdateContact, onDeleteContact, onToggleFavorite }: {
    recents:          CallEntry[];
    onAddContact:     (c: Contact) => Promise<string | null>;
    onRequestCall:    (target: { number: string; name?: string }) => void;
    onUpdateContact:  (c: Contact) => void;
    onDeleteContact:  (id: string) => void;
    onToggleFavorite: (id: string, favorite: boolean) => void;
}) {
    const [filter, setFilter] = useSessionState<Filter>('phone:recentsFilter', 'all');
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
    const [selectedCall, setSelectedCall] = useState<CallEntry | null>(null);
    const [addNumber, setAddNumber] = useState<string | null>(null);

    const list = filter === 'missed' ? recents.filter(c => c.missed) : recents;

    function openProfile(entry: CallEntry) {
        if (entry.contact) setSelectedContact(entry.contact);
        else setSelectedCall(entry);
    }

    function requestCall(entry: CallEntry) {
        if (entry.contact)     onRequestCall({ number: entry.number, name: entry.contact.name });
        else if (entry.number) onRequestCall({ number: entry.number });
        else                   openProfile(entry);
    }

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="px-4 pb-3 pt-5">
                <SegmentedControl
                    value={filter}
                    onChange={setFilter}
                    options={[{ value: 'all', label: t('phone.all','All') }, { value: 'missed', label: t('phone.missed','Missed') }]}
                    className="mx-auto w-[232px]"
                />
            </div>

            <h1 className="px-5 pb-2 pt-1 text-[34px] font-bold tracking-tight text-black dark:text-white">{t('phone.recents','Recents')}</h1>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div className="absolute inset-0 overflow-y-auto no-scrollbar px-4 pb-6">
                    <div key={filter} className="animate-swipe-in-left">
                        {list.length === 0 ? (
                            <EmptyState icon={Clock}
                                title={filter === 'missed' ? t('phone.noMissedCalls','No Missed Calls') : t('phone.noRecentCalls','No Recent Calls')}
                                subtitle={t('phone.recentsSub','Calls you make and receive will show up here.')} />
                        ) : (
                            <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                                {list.map((entry, i) => (
                                    <div key={entry.id}>
                                        <CallRow entry={entry} onBody={requestCall} onInfo={openProfile} />
                                        {i < list.length - 1 && (
                                            <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selectedContact && (
                <ContactDetail
                    contact={selectedContact}
                    backLabel={t('phone.recents','Recents')}
                    onBack={() => setSelectedContact(null)}
                    onCall={onRequestCall}
                    onUpdate={onUpdateContact}
                    onDelete={id => { onDeleteContact(id); setSelectedContact(null); }}
                    onToggleFavorite={onToggleFavorite}
                />
            )}
            {selectedCall && (
                <CallDetail
                    entry={selectedCall}
                    onBack={() => setSelectedCall(null)}
                    onAddToContacts={() => setAddNumber(selectedCall.number)}
                />
            )}
            {addNumber !== null && (
                <AddContact
                    initialPhone={addNumber}
                    onCancel={() => setAddNumber(null)}
                    onSave={onAddContact}
                />
            )}
        </div>
    );
}

function CallRow({ entry, onBody, onInfo }: {
    entry:  CallEntry;
    onBody: (e: CallEntry) => void;
    onInfo: (e: CallEntry) => void;
}) {
    const primary   = entry.contact ? entry.contact.name : entry.noCallerId ? t('phone.noCallerId','No Caller ID') : formatPhone(entry.number);
    const secondary = entry.contact ? formatPhone(entry.contact.phone) : t('phone.unknown','Unknown');

    return (
        <div className="flex w-full items-center px-3.5 py-3.5">
            <button
                type="button"
                onClick={() => onBody(entry)}
                className="flex min-w-0 flex-1 items-center gap-3.5 text-left active:opacity-60"
            >
                <RecentAvatar entry={entry} />
                <div className="min-w-0 flex-1">
                    <div className={`truncate text-[20px] ${entry.missed ? 'text-ios-red' : 'text-black dark:text-white'}`}>{primary}</div>
                    <div className="truncate text-[17px] text-black/50 dark:text-white/50">{secondary}</div>
                </div>
                <span className="shrink-0 text-[15px] text-black/50 dark:text-white/50">{entry.time}</span>
            </button>

            <button
                type="button"
                aria-label={t('phone.callDetails','Call details')}
                onClick={() => onInfo(entry)}
                className="ml-2 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-ios-blue transition-colors hover:bg-ios-blue/15 active:bg-ios-blue/25"
            >
                <Info className="h-[25px] w-[25px]" strokeWidth={2} />
            </button>
        </div>
    );
}

function RecentAvatar({ entry }: { entry: CallEntry }) {
    const size = 56;
    if (entry.contact) {
        return <ContactAvatar contact={entry.contact} size={size} />;
    }
    if (entry.noCallerId) {
        return <PlaceholderAvatar size={size} />;
    }
    return (
        <ContactAvatar
            contact={{ id: entry.number, name: formatPhone(entry.number), initials: '', color: '#8e8e93' }}
            size={size}
        />
    );
}
