import { useState } from 'react';
import { Info, Minus, Star } from 'lucide-react';

import { ContactAvatar } from '@/shared/ContactAvatar';
import { ContactDetail } from './ContactDetail';
import { EmptyState } from '@/ui/EmptyState';
import { type Contact } from '../data';
import { useMaskedPhone } from '@/stores/themeStore';
import { t } from '@/i18n';

export function FavoritesTab({ favorites, onRemoveFavorite, onRequestCall, onUpdateContact, onDeleteContact, onToggleFavorite }: {
    favorites:        Contact[];
    onRemoveFavorite: (id: string) => void;
    onRequestCall:    (target: { number: string; name?: string }) => void;
    onUpdateContact:  (c: Contact) => void;
    onDeleteContact:  (id: string) => void;
    onToggleFavorite: (id: string, favorite: boolean) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [selected, setSelected] = useState<Contact | null>(null);

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-5 pb-1 pt-1">
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">{t('phone.favorites','Favorites')}</h1>
                {favorites.length > 0 && (
                    <button type="button" onClick={() => setEditing(e => !e)} className="text-[18px] text-ios-blue active:opacity-60">
                        {editing ? t('phone.done','Done') : t('phone.edit','Edit')}
                    </button>
                )}
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div className="absolute inset-0 overflow-y-auto no-scrollbar px-4 pb-6 pt-1">
                    {favorites.length === 0 ? (
                        <EmptyState icon={Star} title={t('phone.noFavorites','No Favorites')}
                            subtitle={t('phone.noFavoritesSub','Add a contact to Favorites for quick, one-tap calling.')} />
                    ) : (
                        <div className="overflow-hidden rounded-[10px] bg-surface">
                            {favorites.map((c, i) => (
                                <div key={c.id}>
                                    <FavoriteRow
                                        contact={c}
                                        editing={editing}
                                        onRemove={onRemoveFavorite}
                                        onInfo={() => setSelected(c)}
                                        onCall={() => onRequestCall({ number: c.phone, name: c.name })}
                                    />
                                    {i < favorites.length - 1 && (
                                        <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {selected && (
                <ContactDetail
                    contact={selected}
                    backLabel={t('phone.favorites','Favorites')}
                    onBack={() => setSelected(null)}
                    onCall={onRequestCall}
                    onUpdate={onUpdateContact}
                    onDelete={id => { onDeleteContact(id); setSelected(null); }}
                    onToggleFavorite={onToggleFavorite}
                />
            )}
        </div>
    );
}

function FavoriteRow({ contact, editing, onRemove, onInfo, onCall }: {
    contact:  Contact;
    editing:  boolean;
    onRemove: (id: string) => void;
    onInfo:   () => void;
    onCall:   () => void;
}) {
    const phone = useMaskedPhone();
    return (
        <div className="flex items-center py-3.5 pl-3.5 pr-3.5">
            <div className={`flex items-center overflow-hidden transition-all duration-300 ${editing ? 'mr-3 w-[28px] opacity-100' : 'w-0 opacity-0'}`}>
                <button
                    type="button"
                    aria-label={t('phone.removeFromFavoritesAria','Remove {name} from favorites',{ name: contact.name })}
                    onClick={() => onRemove(contact.id)}
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-ios-red active:opacity-70"
                >
                    <Minus className="h-[18px] w-[18px] text-white" strokeWidth={3} />
                </button>
            </div>

            <button
                type="button"
                onClick={() => { if (!editing) onCall(); }}
                className="flex min-w-0 flex-1 items-center gap-3.5 text-left active:opacity-60"
            >
                <ContactAvatar contact={contact} size={56} />
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[20px] text-black dark:text-white">{contact.name}</div>
                    <div className="truncate text-[17px] text-black/50 dark:text-white/50">{phone(contact.phone)}</div>
                </div>
            </button>

            <button type="button" aria-label={t('phone.contactInfo','Contact info')} onClick={onInfo} className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-ios-blue transition-colors hover:bg-ios-blue/15 active:bg-ios-blue/25">
                <Info className="h-[25px] w-[25px]" strokeWidth={2} />
            </button>
        </div>
    );
}
