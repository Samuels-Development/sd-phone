import { useEffect } from 'react';

import { useContacts } from '@/stores/contactsStore';
import { initialsFor } from '@/lib/format';
import { t } from '@/i18n';

export function ProfileCard() {
    const { myName, card, load } = useContacts('myName', 'card', 'load');
    useEffect(() => { void load(); }, [load]);

    const name = card.name || myName || t('settings.myPhone', 'My Phone');
    const avatar = '#8e8e93';

    return (
        <div className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface px-3 py-3 text-left">
            <div
                className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full text-[24px] font-semibold text-white shadow-sm"
                style={{ background: `linear-gradient(135deg, ${avatar} 0%, ${shade(avatar, -20)} 100%)` }}
            >
                {initialsFor(name)}
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate text-[20px] font-semibold text-black dark:text-white">{name}</div>
                <div className="truncate text-[14px] font-normal text-ios-gray">{t('settings.thisIsYourPhone', 'This is your phone')}</div>
            </div>
        </div>
    );
}

function shade(hex: string, amt: number): string {
    const v = hex.replace('#', '');
    if (v.length !== 6) return hex;
    const c = (i: number) => Math.max(0, Math.min(255, parseInt(v.slice(i, i + 2), 16) + amt));
    return `#${c(0).toString(16).padStart(2, '0')}${c(2).toString(16).padStart(2, '0')}${c(4).toString(16).padStart(2, '0')}`;
}
