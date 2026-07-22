import { useState } from 'react';
import { Delete, Phone, Plus } from 'lucide-react';

import { useKeypadInput } from '@/hooks/useKeypadInput';
import { useSessionState } from '@/hooks/useSessionState';
import { AddContact } from '../contacts/AddContact';
import { playDtmf } from './dtmf';
import { formatPhone, type Contact } from '../data';
import { t } from '@/i18n';

const KEYS: { d: string; sub: string }[] = [
    { d: '1', sub: '' },     { d: '2', sub: 'ABC' },  { d: '3', sub: 'DEF' },
    { d: '4', sub: 'GHI' },  { d: '5', sub: 'JKL' },  { d: '6', sub: 'MNO' },
    { d: '7', sub: 'PQRS' }, { d: '8', sub: 'TUV' },  { d: '9', sub: 'WXYZ' },
    { d: '*', sub: '' },     { d: '0', sub: '+' },    { d: '#', sub: '' },
];

export function KeypadTab({ onAddContact, onCall }: {
    onAddContact: (c: Contact) => Promise<string | null>;
    onCall:       (target: { number: string; name?: string }) => void;
}) {
    const [digits, setDigits] = useSessionState('phone:keypadDigits', '');
    const [adding, setAdding] = useState(false);

    function press(d: string) {
        setDigits(prev => (prev.length >= 24 ? prev : prev + d));
        playDtmf(d);
    }

    function del() {
        setDigits(prev => prev.slice(0, -1));
    }

    useKeypadInput({
        onPress: press,
        onDelete: del,
        canDelete: digits.length > 0,
        enabled: !adding,
        extraKeys: ['*', '#'],
    });

    const size = digits.length > 15 ? 'text-[29px]' : digits.length > 11 ? 'text-[36px]' : 'text-[44px]';
    const shown = /^\d{10}$/.test(digits) ? formatPhone(digits) : digits;

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-5 pb-1 pt-1">
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">{t('phone.keypad','Keypad')}</h1>
                <button type="button" aria-label={t('phone.addNumber','Add number')} onClick={() => setAdding(true)} className="text-ios-blue active:opacity-60">
                    <Plus className="h-[28px] w-[28px]" strokeWidth={2} />
                </button>
            </div>

            <div className="flex min-h-0 flex-1 items-end justify-center px-6 pb-6">
                <span className={`${size} tracking-[0.02em] text-black dark:text-white`}>{shown}</span>
            </div>

            <div className="shrink-0 px-6 pb-[44px]">
                <div className="grid grid-cols-3 justify-items-center gap-y-4">
                    {KEYS.map(k => (
                        <button
                            key={k.d}
                            type="button"
                            onClick={() => press(k.d)}
                            className="flex h-[95px] w-[95px] flex-col items-center justify-center rounded-full bg-[#e8e8ea] active:bg-[#c4c4c6] dark:bg-surface dark:active:bg-control"
                        >
                            <span className="text-[38px] font-normal leading-none text-black dark:text-white">{k.d}</span>
                            {k.sub && (
                                <span className="mt-[4px] text-[11px] font-semibold leading-none tracking-[0.16em] text-black/55 dark:text-white/55">{k.sub}</span>
                            )}
                        </button>
                    ))}
                </div>

                <div className="mt-4 grid grid-cols-3 items-center justify-items-center">
                    <div />
                    <button
                        type="button"
                        aria-label={t('phone.call','Call')}
                        onClick={() => { if (digits) { onCall({ number: digits }); setDigits(''); } }}
                        className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-[#34c759] active:opacity-80"
                    >
                        <Phone className="h-[40px] w-[40px] text-white" fill="currentColor" />
                    </button>
                    <button
                        type="button"
                        aria-label={t('phone.delete','Delete')}
                        onClick={del}
                        className="flex h-[88px] w-[88px] items-center justify-center text-black/70 active:opacity-50 dark:text-white/70"
                    >
                        <Delete className="h-[37px] w-[37px]" strokeWidth={1.8} />
                    </button>
                </div>
            </div>

            {adding && (
                <AddContact
                    initialPhone={digits}
                    onCancel={() => setAdding(false)}
                    onSave={onAddContact}
                />
            )}
        </div>
    );
}
