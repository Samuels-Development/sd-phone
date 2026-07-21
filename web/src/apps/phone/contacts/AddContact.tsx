import { useEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';

import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { t } from '@/i18n';
import type { Contact } from '../data';
import { SheetHeader } from '@/ui/SheetHeader';

const PALETTE = ['#0a84ff', '#30d158', '#ff375f', '#ff9f0a', '#bf5af2', '#ff453a', '#5e5ce6', '#64d2ff', '#ffd60a'];

export function AddContact({ onCancel, onSave, initialPhone = '', embedded = false }: { onCancel: () => void; onSave: (c: Contact) => Promise<string | null>; initialPhone?: string; embedded?: boolean }) {
    // Embedded mode (inside a Sheet): the host animates the presentation, so the form's own
    // slide-up/down is skipped and cancel/save hand back to the host immediately.
    const [shown, setShown] = useState(embedded);
    const [first, setFirst] = useState('');
    const [last,  setLast]  = useState('');
    const [phone, setPhone] = useState(initialPhone);
    const [avatar, setAvatar] = useState('');
    const [picking, setPicking] = useState(false);
    const [error,   setError]   = useState<string | null>(null);
    const [saving,  setSaving]  = useState(false);
    const exit = useRef<() => void>(() => {});

    useEffect(() => {
        if (embedded) return;
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, [embedded]);

    const canSave = !!(first.trim() || last.trim() || phone.trim());

    function build(): Contact {
        const name = `${first.trim()} ${last.trim()}`.trim() || phone.trim() || 'New Contact';
        const initials = ((first.trim()[0] ?? '') + (last.trim()[0] ?? '')).toUpperCase()
            || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()
            || '#';
        const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
        return { id: `c-${Date.now()}`, name, initials, color, avatar: avatar || undefined, phone: phone.trim() || 'No Number' };
    }

    function cancel() {
        if (embedded) { onCancel(); return; }
        exit.current = onCancel; setShown(false);
    }
    async function save() {
        if (saving) return;
        setError(null);
        setSaving(true);
        const err = await onSave(build());
        if (err) { setSaving(false); setError(err); return; }
        if (embedded) { onCancel(); return; }
        exit.current = onCancel;
        setShown(false);
    }

    return (
        <div
            className="absolute inset-0 flex flex-col bg-[#d4d4d4] dark:bg-base"
            style={embedded ? undefined : {
                transform:  shown ? 'translateY(0)' : 'translateY(100%)',
                transition: 'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
            }}
            onTransitionEnd={() => { if (!shown) exit.current(); }}
        >
            <SheetHeader cancelLabel={t('phone.cancel','Cancel')} onCancel={cancel} doneLabel={t('phone.done','Done')} onDone={save} doneDisabled={!canSave || saving} />

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6">
                <div className="flex flex-col items-center pb-7 pt-2">
                    <button type="button" onClick={() => setPicking(true)} className="overflow-hidden rounded-full active:opacity-80" style={{ width: 118, height: 118 }}>
                        {avatar ? (
                            <img src={avatar} alt="" draggable={false} className="h-full w-full object-cover" />
                        ) : (
                            <span className="flex h-full w-full items-center justify-center bg-[#b6b6bb] dark:bg-control">
                                <UserRound className="h-[64px] w-[64px] text-white/90" strokeWidth={1.6} fill="currentColor" />
                            </span>
                        )}
                    </button>
                    <button type="button" onClick={() => setPicking(true)} className="mt-2.5 text-[16px] text-ios-blue active:opacity-60">
                        {avatar ? t('phone.editPhoto','Edit Photo') : t('phone.addPhoto','Add Photo')}
                    </button>
                </div>

                <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                    <Field placeholder={t('phone.firstName','First Name')} value={first} onChange={setFirst} />
                    <Divider />
                    <Field placeholder={t('phone.lastName','Last Name')} value={last} onChange={setLast} />
                </div>

                <div className="mt-5 overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                    <Field placeholder={t('phone.phoneNumber','Phone Number')} value={phone} onChange={v => { setPhone(v); setError(null); }} inputMode="tel" />
                </div>

                {error ? (
                    <p className="mt-2 px-1 text-[14px] font-medium text-ios-red">{error}</p>
                ) : (
                    <p className="mt-2 px-1 text-[13px] text-ios-gray">
                        {t('phone.numberHint','Type the number any way you like — e.g. (123) 456-7890 or 1234567890.')}
                    </p>
                )}
            </div>

            {picking && (
                <MediaPickerSheet onSelect={p => { setAvatar(p.url); setPicking(false); }} onClose={() => setPicking(false)} />
            )}
        </div>
    );
}

function Field({ placeholder, value, onChange, inputMode }: {
    placeholder: string;
    value:       string;
    onChange:    (v: string) => void;
    inputMode?:  'text' | 'tel';
}) {
    return (
        <input
            type="text"
            inputMode={inputMode}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent px-4 py-3 text-[18px] text-black placeholder-black/40 outline-none dark:text-white dark:placeholder-white/40"
        />
    );
}

function Divider() {
    return <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ marginLeft: 16, height: '0.5px' }} />;
}
