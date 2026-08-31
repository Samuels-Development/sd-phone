import { useState } from 'react';
import { Car, Clock, MapPin, Trophy, User } from 'lucide-react';

import { t } from '@/i18n';
import { initials as libInitials } from '@/lib/format';
import { TabBar, type TabBarItem } from '@/ui/TabBar';
import { RydeProvider, useRyde } from './store';
import { Home } from './rider/Home';
import { Activity } from './history/Activity';
import { Account } from './account/Account';
import { Driver } from './driver/Driver';
import { Leaderboard } from './account/Leaderboard';
import { TripRider } from './rider/TripRider';
import { TripDriver } from './driver/TripDriver';
import { Rating } from './history/Rating';

export function Ryde({ onClose: _onClose }: { onClose: () => void }) {
    return (
        <RydeProvider>
            <Shell />
        </RydeProvider>
    );
}

function Shell() {
    const g = useRyde();
    const PUSH = 'ios-push 0.34s cubic-bezier(0.32,0.72,0,1)';
    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <div className="relative min-h-0 flex-1">
                <div key={g.tab} className="absolute inset-0" style={{ animation: PUSH }}>
                    {g.tab === 'home' && <Home />}
                    {g.tab === 'activity' && <Activity />}
                    {g.tab === 'driver' && <Driver />}
                    {g.tab === 'leaderboard' && <Leaderboard />}
                </div>

                {!g.accountOpen && (
                    <button
                        type="button"
                        onClick={() => g.setAccountOpen(true)}
                        aria-label={t('ryde.account', 'Account')}
                        className="absolute right-4 z-30 flex h-[42px] w-[42px] items-center justify-center rounded-full bg-elevated text-black shadow-md ring-1 ring-black/5 active:scale-95 dark:bg-surface dark:text-white dark:ring-white/10"
                        style={{ top: 'calc(var(--safe-top) + 8px)' }}
                    >
                        {g.authed && g.me
                            ? <span className="text-[15px] font-bold">{initials(g.me.name || g.me.username)}</span>
                            : <User className="h-[23px] w-[23px]" strokeWidth={2.1} />}
                    </button>
                )}
            </div>

            <TabBar tabs={rydeTabs()} active={g.tab} onChange={g.setTab} />

            {g.accountOpen && <AccountOverlay onClosed={() => g.setAccountOpen(false)} />}

            {g.activeRider && <TripRider />}
            {g.activeDriver && <TripDriver />}
            {g.pendingRating && <Rating />}
        </div>
    );
}

function initials(n?: string | null): string {
    return libInitials(n ?? '');
}

function AccountOverlay({ onClosed }: { onClosed: () => void }) {
    const [closing, setClosing] = useState(false);
    function close() {
        if (closing) return;
        setClosing(true);
        window.setTimeout(onClosed, 270);
    }
    return (
        <div
            className="absolute inset-0 z-50"
            style={{
                animation: closing
                    ? 'ios-sheet-down 0.28s cubic-bezier(0.32,0,0.68,1) forwards'
                    : 'ios-sheet-up 0.34s cubic-bezier(0.32,0.72,0,1)',
                willChange: 'transform',
            }}
        >
            <Account onClose={close} />
        </div>
    );
}

const rydeTabs = (): TabBarItem<'home' | 'activity' | 'driver' | 'leaderboard'>[] => [
    { id: 'home',        label: t('ryde.tabRide', 'Ride'),        icon: a => <MapPin className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
    { id: 'activity',    label: t('ryde.activity', 'Activity'),   icon: a => <Clock  className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
    { id: 'driver',      label: t('ryde.drive', 'Drive'),         icon: a => <Car    className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
    { id: 'leaderboard', label: t('ryde.tabLeaders', 'Leaders'),  icon: a => <Trophy className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
];
