import type { ReactNode } from 'react';
import { Home, Inbox as InboxIcon, Plus, Search, User } from 'lucide-react';

import { AppBadge } from '@/shell/AppBadge';
import { t } from '@/i18n';
import { GRAD_FROM, GRAD_TO } from './data';

export type CTab = 'home' | 'discover' | 'inbox' | 'profile';

export const TAB_H = 93;

export function TabBar({ tab, onTab, onCreate, unread, avatar }: {
    tab:       CTab;
    onTab:     (tab: CTab) => void;
    onCreate:  () => void;
    unread?:   number;
    avatar?:   string;
}) {
    return (
        <nav
            className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-around border-t border-white/10 bg-black px-2 pb-12 pt-3"
            style={{ height: TAB_H }}
        >

            <Btn label={t('vibez.home', 'Home')} onClick={() => onTab('home')}>
                <Home className="h-[33px] w-[33px]" strokeWidth={tab === 'home' ? 2.7 : 1.9} fill="none" />
            </Btn>
            <Btn label={t('vibez.discover', 'Discover')} onClick={() => onTab('discover')}>
                <Search className="h-[32px] w-[32px]" strokeWidth={tab === 'discover' ? 2.8 : 2} />
            </Btn>

            <button
                type="button"
                aria-label={t('vibez.create', 'Create')}
                onClick={onCreate}
                className="relative z-10 flex h-[34px] w-[50px] items-center justify-center rounded-[12px] transition-transform active:scale-95"
                style={{ background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})`, boxShadow: `0 0 14px ${GRAD_FROM}66` }}
            >
                <Plus className="h-6 w-6 text-white" strokeWidth={2.8} />
            </button>

            <Btn label={t('vibez.inbox', 'Inbox')} onClick={() => onTab('inbox')}>
                <span className="relative">
                    <InboxIcon className="h-[33px] w-[33px]" strokeWidth={tab === 'inbox' ? 2.5 : 1.9} />
                    <AppBadge count={unread} small />
                </span>
            </Btn>

            <button
                type="button"
                aria-label={t('vibez.profile', 'Profile')}
                onClick={() => onTab('profile')}
                className="relative z-10 flex items-center justify-center text-white active:opacity-50"
            >
                {avatar
                    ? <img
                        src={avatar}
                        alt=""
                        draggable={false}
                        className={`h-[35px] w-[35px] rounded-full object-cover ${tab === 'profile' ? 'ring-[1.5px] ring-white ring-offset-1 ring-offset-black' : ''}`}
                    />
                    : <User className="h-[33px] w-[33px]" strokeWidth={tab === 'profile' ? 2.7 : 1.9} fill="none" />}
            </button>
        </nav>
    );
}

function Btn({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className="relative z-10 flex items-center justify-center text-white active:opacity-50"
        >
            {children}
        </button>
    );
}
