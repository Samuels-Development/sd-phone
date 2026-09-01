import { useCallback, useEffect, useState } from 'react';
import { Check, Trash2, UserPlus, Users } from 'lucide-react';

import { AlertDialog } from '@/ui/AlertDialog';
import { SearchBar } from '@/ui/SearchBar';
import { fetchNui, isFiveM } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { usePinStyle } from './MapView';
import { initials, timeAgo, WORLD } from './data';
import { newId as libNewId } from '@/lib/format';
import { FRIEND_COLORS, loadFriends, saveFriends } from '@/apps/findfriends/data';
import type { Friend } from '@/apps/findfriends/data';
import type { Contact } from '@/apps/phone/data';
import { useContacts, useContactsStore } from '@/stores/contactsStore';
import { useDeckActive } from '@/shell/deckActive';
import { Toggle } from '@/ui/Toggle';
import { t } from '@/i18n';


export function useFriendsRoster(enabled = true) {
    // Stop streaming the friends roster to a backgrounded card; the last roster stays
    // rendered and the push listener below re-syncs the moment we foreground again.
    const active = useDeckActive();
    const [friends, setFriends] = useState<Friend[]>(() => (isFiveM ? [] : loadFriends()));
    const [addError, setAddError] = useState<string | null>(null);

    const commit = useCallback((next: Friend[]) => {
        setFriends(next);
        if (!isFiveM) saveFriends(next);
    }, []);

    const applyRoster = useCallback((incoming: Friend[]) => {
        setFriends(prev => incoming.map(inF => {
            const local = prev.find(l => l.id === inF.id);
            return local ? { ...inF, youShare: local.youShare } : inF;
        }));
    }, []);

    useEffect(() => {
        if (!isFiveM || !enabled || !active) return;
        let alive = true;
        fetchNui<{ data?: Friend[] }>('sd-phone:friends:list')
            .then(r => { if (alive && Array.isArray(r?.data)) applyRoster(r.data); })
            .catch(() => {});
        void fetchNui('sd-phone:friends:watch', { on: true });
        return () => { alive = false; void fetchNui('sd-phone:friends:watch', { on: false }); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, active]);

    useNuiEvent('sd-phone:maps:friends:update', data => {
        if (Array.isArray(data?.friends)) applyRoster(data.friends as Friend[]);
    });

    useEffect(() => {
        if (isFiveM) return;
        const id = window.setInterval(() => {
            setFriends(prev => prev.map(f => {
                if (!f.theyShare || f.x == null || f.y == null) return f;
                return {
                    ...f,
                    x: Math.max(WORLD.xMin, Math.min(WORLD.xMax, f.x + (Math.random() - 0.5) * 220)),
                    y: Math.max(WORLD.yMin, Math.min(WORLD.yMax, f.y + (Math.random() - 0.5) * 220)),
                    updatedAt: Date.now(),
                };
            }));
        }, 2200);
        return () => window.clearInterval(id);
    }, []);

    function toggleShare(id: string) {
        const next = friends.map(f => (f.id === id ? { ...f, youShare: !f.youShare } : f));
        commit(next);
        if (isFiveM) void fetchNui<{ data?: Friend[] }>('sd-phone:friends:share', { id, enabled: next.find(x => x.id === id)?.youShare ?? false })
            .then(r => { if (Array.isArray(r?.data)) applyRoster(r.data); });
    }

    function removeFriend(id: string) {
        commit(friends.filter(f => f.id !== id));
        if (isFiveM) void fetchNui<{ data?: Friend[] }>('sd-phone:friends:remove', { id })
            .then(r => { if (Array.isArray(r?.data)) applyRoster(r.data); });
    }

    function addFriend(phone: string) {
        const clean = phone.trim();
        if (!clean) return;
        if (isFiveM) {
            void fetchNui<{ data?: Friend[]; message?: string }>('sd-phone:friends:add', { phone: clean })
                .then(r => {
                    if (Array.isArray(r?.data)) { applyRoster(r.data); setAddError(null); }
                    else if (r?.message) { setAddError(r.message); window.setTimeout(() => setAddError(null), 2800); }
                });
            return;
        }
        if (friends.some(f => f.phone === clean)) return;
        commit([...friends, {
            id: libNewId('fr'),
            name: clean, phone: clean,
            color: FRIEND_COLORS[friends.length % FRIEND_COLORS.length],
            youShare: true, theyShare: false, pending: true,
        }]);
    }

    function respond(id: string, accept: boolean) {
        if (isFiveM) {
            const phone = friends.find(f => f.id === id)?.phone ?? '';
            void fetchNui<{ data?: Friend[] }>('sd-phone:friends:respond', { phone, accept })
                .then(r => { if (Array.isArray(r?.data)) applyRoster(r.data); });
            return;
        }
        commit(accept
            ? friends.map(f => (f.id === id
                ? { ...f, incoming: false, youShare: true, theyShare: true, x: -425, y: 1130, updatedAt: Date.now() }
                : f))
            : friends.filter(f => f.id !== id));
    }

    const visible = friends.filter(f => f.theyShare && f.x != null && f.y != null);

    return { friends, visible, toggleShare, removeFriend, addFriend, respond, addError };
}

export function FriendDot({ f, selected, interactive, showAvatar = true, onSelect }: {
    f: Friend;
    selected: boolean;
    interactive: boolean;
    showAvatar?: boolean;
    onSelect: () => void;
}) {
    const style = usePinStyle(f.x as number, f.y as number);
    return (
        <div className="flex flex-col items-center" style={{ ...style, pointerEvents: 'none', zIndex: selected ? 40 : 20 }}>
            <button
                type="button"
                aria-label={f.name}
                onPointerDown={e => e.stopPropagation()}
                onPointerUp={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); onSelect(); }}
                className="flex cursor-pointer flex-col items-center"
                style={{ pointerEvents: interactive ? 'auto' : 'none' }}
            >
                <div
                    className="flex items-center justify-center overflow-hidden rounded-full text-[12px] font-bold text-white transition-transform duration-150"
                    style={{
                        width: 34, height: 34, background: f.color,
                        border: '2px solid #fff',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.45)',
                        transform: selected ? 'scale(1.15)' : undefined,
                    }}
                >
                    {showAvatar && f.avatar
                        ? <img src={f.avatar} alt="" draggable={false} className="h-full w-full object-cover" />
                        : initials(f.name)}
                </div>
            </button>
            {selected && (
                <div className="mt-1 whitespace-nowrap rounded-md bg-black/80 px-2 py-0.5 text-[11px] font-bold text-white">
                    {f.name}
                </div>
            )}
        </div>
    );
}

export function PeoplePanel({ friends, selectedId, showAvatars, onFocus, onToggleShare, onRemove, onRespond, onAdd, onOpenPicker }: {
    friends:       Friend[];
    selectedId:    string | null;
    showAvatars:   boolean;
    onFocus:       (f: Friend) => void;
    onToggleShare: (id: string) => void;
    onRemove:      (id: string) => void;
    onRespond:     (id: string, accept: boolean) => void;
    onAdd:         (phone: string) => void;
    onOpenPicker:  () => void;
}) {
    const [phone, setPhone] = useSessionState('maps:friendDraft', '');
    const [confirmRemove, setConfirmRemove] = useState<Friend | null>(null);
    function submit() { if (phone.trim()) { onAdd(phone); setPhone(''); } }

    return (
        <>
            <div className="mx-4 mb-2 flex items-center gap-2">
                <div className="flex h-[44px] min-w-0 flex-1 items-center gap-2 rounded-[10px] bg-[#e5e5e5] px-3 dark:bg-white/10">
                    <UserPlus className="h-[18px] w-[18px] shrink-0 text-black/60 dark:text-white/60" strokeWidth={2.4} />
                    <input
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                        inputMode="tel"
                        placeholder={t('maps.addByNumber', 'Add by number')}
                        className="min-w-0 flex-1 bg-transparent text-[17px] font-medium text-black outline-none placeholder-black/55 dark:text-white dark:placeholder-white/55"
                    />
                    <button
                        type="button"
                        onClick={onOpenPicker}
                        aria-label={t('maps.addFromContacts', 'Add from Contacts')}
                        className="shrink-0 text-ios-blue active:opacity-60"
                    >
                        <Users className="h-[21px] w-[21px]" strokeWidth={2.2} />
                    </button>
                </div>
                <button
                    type="button"
                    onClick={submit}
                    disabled={!phone.trim()}
                    className="flex h-[44px] shrink-0 items-center rounded-[10px] bg-[#e5e5e5] px-3.5 text-[16px] font-semibold text-ios-blue disabled:opacity-40 dark:bg-white/10"
                >
                    {t('maps.add', 'Add')}
                </button>
            </div>

            <div className="no-scrollbar overflow-y-auto px-4 pb-4" style={{ height: 240 }}>
                {friends.length === 0 ? (
                    <p className="py-6 text-center text-[15px] text-ios-gray">
                        {t('maps.noFriends', 'No friends yet — add one from Contacts or by number above.')}
                    </p>
                ) : (
                    <div className="overflow-hidden rounded-[12px] bg-surface">
                        {friends.map((f, i) => {
                            const live = f.theyShare && f.x != null;
                            return (
                                <div
                                    key={f.id}
                                    className={'relative flex h-[78px] items-center gap-3.5 pl-3.5 pr-2 ' +
                                        (selectedId === f.id ? 'bg-ios-blue/10' : 'active:bg-black/5 dark:active:bg-white/5')}
                                >
                                    <button onClick={() => onFocus(f)} disabled={!live} className="flex min-w-0 flex-1 items-center gap-3.5 text-left disabled:cursor-default">
                                        <span
                                            className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-[17px] font-bold text-white shadow-sm"
                                            style={{ background: f.color }}
                                        >
                                            {showAvatars && f.avatar
                                                ? <img src={f.avatar} alt="" className="h-full w-full rounded-full object-cover" />
                                                : initials(f.name)}
                                            {live && <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-ios-green" />}
                                        </span>
                                        <span className="flex min-w-0 flex-col leading-tight">
                                            <span className="truncate text-[20px] font-semibold text-black dark:text-white">{f.name}</span>
                                            <span className={'mt-[2px] truncate text-[16px] font-medium ' + (f.incoming ? 'text-ios-blue' : !f.pending && f.youShare ? 'text-ios-green' : 'text-ios-gray')}>
                                                {f.incoming
                                                    ? t('maps.wantsToShare', 'Wants to share locations')
                                                    : f.pending
                                                        ? t('maps.requested', 'Requested')
                                                        : f.youShare
                                                            ? (live ? t('maps.sharingAgo', 'Sharing · {ago}', { ago: timeAgo(f.updatedAt) }) : t('maps.sharingYourLocation', 'Sharing your location'))
                                                            : t('maps.notSharing', 'Not sharing')}
                                            </span>
                                        </span>
                                    </button>
                                    {f.incoming ? (
                                        <button
                                            onClick={() => onRespond(f.id, true)}
                                            className="flex h-10 shrink-0 items-center rounded-full bg-ios-green px-4 text-[16px] font-semibold text-white active:opacity-80"
                                        >
                                            {t('maps.accept', 'Accept')}
                                        </button>
                                    ) : !f.pending && (
                                        <Toggle scale={0.9} on={f.youShare} onChange={() => onToggleShare(f.id)} ariaLabel={t('maps.shareMyLocationWith', 'Share my location with {name}', { name: f.name })} />
                                    )}
                                    <button
                                        onClick={() => setConfirmRemove(f)}
                                        aria-label={t('maps.removeName', 'Remove {name}', { name: f.name })}
                                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-red/[0.12] text-ios-red active:bg-ios-red/25 dark:bg-ios-red/[0.18] dark:active:bg-ios-red/30"
                                    >
                                        <Trash2 className="h-[18px] w-[18px]" strokeWidth={2.2} />
                                    </button>
                                    {i < friends.length - 1 && (
                                        <div className="absolute bottom-0 left-0 right-0 h-px bg-hairline/[0.08]" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {confirmRemove && (
                <AlertDialog
                    title={confirmRemove.incoming
                        ? t('maps.declineRequestTitle', 'Decline Request?')
                        : confirmRemove.pending ? t('maps.cancelRequestTitle', 'Cancel Request?') : t('maps.removeNameTitle', 'Remove {name}?', { name: confirmRemove.name })}
                    message={confirmRemove.incoming
                        ? t('maps.declineRequestMessage', "{name} won't see your location, and you won't see theirs.", { name: confirmRemove.name })
                        : confirmRemove.pending
                            ? t('maps.cancelRequestMessage', '{name} will no longer be able to accept your location request.', { name: confirmRemove.name })
                            : t('maps.stopSharingMessage', 'Location sharing between you will stop.')}
                    cancelLabel={confirmRemove.pending || confirmRemove.incoming ? t('maps.keep', 'Keep') : t('maps.cancel', 'Cancel')}
                    confirmLabel={confirmRemove.incoming ? t('maps.decline', 'Decline') : confirmRemove.pending ? t('maps.cancelRequest', 'Cancel Request') : t('maps.remove', 'Remove')}
                    destructive
                    onCancel={() => setConfirmRemove(null)}
                    onConfirm={() => {
                        if (confirmRemove.incoming) onRespond(confirmRemove.id, false);
                        else onRemove(confirmRemove.id);
                        setConfirmRemove(null);
                    }}
                />
            )}
        </>
    );
}


const digits = (s: string) => (s || '').replace(/\D/g, '');

export function ContactsPanel({ existing, onPick, onCancel }: {
    existing: Set<string>;
    onPick:   (contact: Contact) => void;
    onCancel: () => void;
}) {
    const { contacts, loaded } = useContacts('contacts', 'loaded');
    const loading = !loaded;
    const [query, setQuery] = useState('');

    useEffect(() => {
        void useContactsStore.getState().load();
    }, []);

    const withNumbers = contacts.filter(c => digits(c.phone).length > 0);
    const shown = query.trim()
        ? withNumbers.filter(c => (c.name + ' ' + c.phone).toLowerCase().includes(query.trim().toLowerCase()))
        : withNumbers;

    return (
        <>
            <div className="flex h-[42px] shrink-0 items-center justify-between px-4">
                <h2 className="text-[20px] font-bold tracking-tight text-black dark:text-white">{t('maps.addFromContacts', 'Add from Contacts')}</h2>
                <button onClick={onCancel} className="text-[16px] font-semibold text-ios-blue active:opacity-60">
                    {t('maps.cancel', 'Cancel')}
                </button>
            </div>

            <SearchBar value={query} onChange={setQuery} placeholder={t('maps.searchContacts', 'Search Contacts')} className="mx-4 mb-2" autoFocus />

            <div className="no-scrollbar overflow-y-auto px-4 pb-4" style={{ height: 240 }}>
                {loading ? (
                    <p className="py-6 text-center text-[15px] text-ios-gray">{t('maps.loadingContacts', 'Loading contacts…')}</p>
                ) : shown.length === 0 ? (
                    <p className="py-6 text-center text-[15px] text-ios-gray">
                        {query ? t('maps.noContactsMatch', 'No contacts match.') : t('maps.noContactsWithNumber', 'No contacts with a number.')}
                    </p>
                ) : (
                    <div className="overflow-hidden rounded-[12px] bg-surface">
                        {shown.map((c, i) => {
                            const added = existing.has(digits(c.phone));
                            return (
                                <button
                                    key={c.id}
                                    disabled={added}
                                    onClick={() => onPick(c)}
                                    className={'relative flex h-[78px] w-full items-center gap-3.5 pl-3.5 pr-4 text-left ' +
                                        (added ? 'opacity-55' : 'active:bg-black/5 dark:active:bg-white/5')}
                                >
                                    <span
                                        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full text-[17px] font-bold text-white shadow-sm"
                                        style={{ background: c.color }}
                                    >
                                        {c.avatar ? <img src={c.avatar} alt="" className="h-full w-full object-cover" /> : c.initials}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                                        <span className="truncate text-[20px] font-semibold text-black dark:text-white">{c.name}</span>
                                        <span className="mt-[2px] truncate text-[16px] font-medium tabular-nums text-ios-gray">{c.phone}</span>
                                    </span>
                                    {added
                                        ? <Check className="h-[20px] w-[20px] shrink-0 text-ios-green" strokeWidth={2.6} />
                                        : <UserPlus className="h-[20px] w-[20px] shrink-0 text-ios-blue" strokeWidth={2.3} />}
                                    {i < shown.length - 1 && (
                                        <div className="absolute bottom-0 left-0 right-0 h-px bg-hairline/[0.08]" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
}
