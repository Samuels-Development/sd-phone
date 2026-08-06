import type { ReactNode } from 'react';
import { AtSign, UserRound } from 'lucide-react';

import { formatPhone } from '@/apps/phone/data';
import { useAsyncData } from '@/hooks/useAsyncData';
import { loadSelfContact } from './selfApi';
import { t } from '@/i18n';

export function ContactFields({ number, email, onNumber, onEmail }: {
    number:   string;
    email:    string;
    onNumber: (v: string) => void;
    onEmail:  (v: string) => void;
}) {
    const { data } = useAsyncData(loadSelfContact, []);
    const self = data ?? { number: '', email: '' };

    return (
        <>
            <Label>{t('classifieds.contactNumber', 'Contact number')}</Label>
            <FieldRow useMine={self.number ? () => onNumber(formatPhone(self.number)) : undefined} mineLabel={t('classifieds.useMyNumber', 'Use my number')} mineIcon={<UserRound className="h-[19px] w-[19px]" strokeWidth={2.3} />}>
                <input
                    value={number}
                    onChange={e => onNumber(e.target.value)}
                    inputMode="tel"
                    placeholder={t('classifieds.contactNumber', 'Contact number')}
                    className="min-w-0 flex-1 bg-transparent text-[18px] text-black placeholder-black/80 outline-none dark:text-white dark:placeholder-white/65"
                />
            </FieldRow>

            <Label className="mt-6">{t('classifieds.email', 'Email')}</Label>
            <FieldRow useMine={self.email ? () => onEmail(self.email) : undefined} mineLabel={t('classifieds.useMyEmail', 'Use my email')} mineIcon={<AtSign className="h-[19px] w-[19px]" strokeWidth={2.3} />}>
                <input
                    value={email}
                    onChange={e => onEmail(e.target.value)}
                    inputMode="email"
                    autoCapitalize="none"
                    placeholder={t('classifieds.emailAddress', 'Email address')}
                    className="min-w-0 flex-1 bg-transparent text-[18px] text-black placeholder-black/80 outline-none dark:text-white dark:placeholder-white/65"
                />
            </FieldRow>
        </>
    );
}

function Label({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={`mb-2.5 text-[20px] font-bold tracking-tight text-black dark:text-white ${className ?? ''}`}>{children}</div>;
}

function FieldRow({ children, useMine, mineLabel, mineIcon }: { children: ReactNode; useMine?: () => void; mineLabel: string; mineIcon: ReactNode }) {
    return (
        <div className="flex items-center gap-2 rounded-[14px] bg-surface px-4 py-4">
            {children}
            {useMine && (
                <button
                    type="button"
                    onClick={useMine}
                    aria-label={mineLabel}
                    title={mineLabel}
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-ios-blue/[0.12] text-ios-blue active:bg-ios-blue/25 dark:bg-ios-blue/[0.18] dark:active:bg-ios-blue/30"
                >
                    {mineIcon}
                </button>
            )}
        </div>
    );
}
