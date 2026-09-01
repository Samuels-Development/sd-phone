import { useEffect, useRef, useState } from 'react';

import { ContactAvatar } from '@/shared/ContactAvatar';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { t } from '@/i18n';
import type { Contact } from '../data';
import { SheetHeader } from '@/ui/SheetHeader';

export function EditContact({ contact, onCancel, onSave, onDelete, lockPhone = false, allowDelete = true }: {
    contact:   Contact;
    onCancel:  () => void;
    onSave:    (c: Contact) => void;
    onDelete:  () => void;
    lockPhone?:   boolean;
    allowDelete?: boolean;
}) {
    const [shown, setShown] = useState(false);
    const parts = contact.name.split(' ');
    const [first,   setFirst]   = useState(parts[0] ?? '');
    const [last,    setLast]    = useState(parts.slice(1).join(' '));
    const [phone,   setPhone]   = useState(contact.phone);
    const [email,   setEmail]   = useState(contact.email ?? '');
    const [address, setAddress] = useState(contact.address ?? '');
    const [avatar,  setAvatar]  = useState(contact.avatar ?? '');
    const [picking, setPicking] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const exit = useRef<() => void>(() => {});

    useEffect(() => {
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, []);

    function build(): Contact {
        const name = `${first.trim()} ${last.trim()}`.trim() || phone.trim() || contact.name;
        const initials = ((first.trim()[0] ?? '') + (last.trim()[0] ?? '')).toUpperCase()
            || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()
            || contact.initials;
        return {
            ...contact,
            name,
            initials,
            avatar:  avatar || undefined,
            phone:   phone.trim() || contact.phone,
            email:   email.trim()   || undefined,
            address: address.trim() || undefined,
        };
    }

    function cancel() { exit.current = onCancel; setShown(false); }
    function save()   { const c = build(); exit.current = () => onSave(c); setShown(false); }
    function del()    { exit.current = onDelete; setShown(false); }

    return (
        <div
            className="absolute inset-0 flex flex-col bg-base"
            style={{
                transform:  shown ? 'translateY(0)' : 'translateY(100%)',
                transition: 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
            }}
            onTransitionEnd={() => { if (!shown) exit.current(); }}
        >
            <SheetHeader cancelLabel={t('phone.cancel','Cancel')} onCancel={cancel} doneLabel={t('phone.done','Done')} onDone={save} />

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
                <div className="flex flex-col items-center pb-6 pt-1">
                    <button type="button" onClick={() => setPicking(true)} className="rounded-full active:opacity-80">
                        <ContactAvatar contact={{ ...contact, avatar: avatar || undefined }} size={118} />
                    </button>
                    <button type="button" onClick={() => setPicking(true)} className="mt-2.5 text-[16px] text-ios-blue active:opacity-60">{t('phone.edit','Edit')}</button>
                </div>

                <div className="overflow-hidden rounded-[10px] bg-surface">
                    <Field placeholder={t('phone.firstName','First Name')} value={first} onChange={setFirst} />
                    <Divider />
                    <Field placeholder={t('phone.lastName','Last Name')} value={last} onChange={setLast} />
                </div>

                <div className="mt-5 overflow-hidden rounded-[10px] bg-surface">
                    <Field placeholder={t('phone.phone','Phone')} value={phone} onChange={setPhone} inputMode="tel" tint readOnly={lockPhone} />
                </div>

                <div className="mt-5 overflow-hidden rounded-[10px] bg-surface">
                    <Field placeholder={t('phone.emailCap','Email')} value={email} onChange={setEmail} tint />
                    <Divider />
                    <Field placeholder={t('phone.addressCap','Address')} value={address} onChange={setAddress} />
                </div>

                {allowDelete && (
                    <div className="mt-5 overflow-hidden rounded-[10px] bg-surface">
                        <button type="button" onClick={() => setConfirmDelete(true)} className="w-full px-4 py-3 text-left text-[18px] text-ios-red active:bg-black/5 dark:active:bg-white/5">
                            {t('phone.deleteContact','Delete Contact')}
                        </button>
                    </div>
                )}
            </div>

            {picking && (
                <MediaPickerSheet onSelect={p => { setAvatar(p.url); setPicking(false); }} onClose={() => setPicking(false)} />
            )}

            {confirmDelete && (
                <AlertDialog
                    title={t('phone.deleteContact','Delete Contact')}
                    message={t('phone.deleteConfirm','Are you sure you want to delete {name}?',{ name: contact.name })}
                    confirmLabel={t('phone.delete','Delete')}
                    destructive
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={() => { setConfirmDelete(false); del(); }}
                />
            )}
        </div>
    );
}

function Field({ placeholder, value, onChange, inputMode, tint, readOnly }: {
    placeholder: string;
    value:       string;
    onChange:    (v: string) => void;
    inputMode?:  'text' | 'tel';
    tint?:       boolean;
    readOnly?:   boolean;
}) {
    const color = readOnly
        ? 'text-black/45 dark:text-white/45'
        : tint ? 'text-ios-blue' : 'text-black dark:text-white';
    return (
        <input
            type="text"
            inputMode={inputMode}
            value={value}
            readOnly={readOnly}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full bg-transparent px-4 py-3 text-[18px] placeholder-black/40 outline-none dark:placeholder-white/40 ${color}`}
        />
    );
}

function Divider() {
    return <div className="pointer-events-none bg-hairline/10" style={{ height: '0.5px' }} />;
}
