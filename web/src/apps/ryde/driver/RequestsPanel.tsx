import { useEffect, useState } from 'react';
import { ChevronLeft, Inbox, MapPin } from 'lucide-react';

import { t } from '@/i18n';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { useRyde } from '../store';
import type { Ride } from '../data';
import { OfferSheet } from './IncomingRequest';

export function RequestsPanel({ onClose }: { onClose: () => void }) {
    const g = useRyde();
    const [shown, setShown] = useState(false);
    const [selected, setSelected] = useState<Ride | null>(null);

    useEffect(() => {
        const id = window.setTimeout(() => setShown(true), 20);
        return () => window.clearTimeout(id);
    }, []);
    useEffect(() => {
        if (g.activeDriver) { setShown(false); window.setTimeout(onClose, 320); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [g.activeDriver]);
    function close() {
        setShown(false);
        window.setTimeout(onClose, 320);
    }

    return (
        <div
            className="absolute inset-0 z-40 flex flex-col bg-base font-sf"
            style={{ transform: shown ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)' }}
        >
            <div className="flex shrink-0 items-center px-3 pb-1" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <button onClick={close} className="flex items-center gap-0.5 py-1 pr-3 text-[17px] font-semibold text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-[26px] w-[26px]" strokeWidth={2.4} /> {t('ryde.drive', 'Drive')}
                </button>
            </div>
            <div className="shrink-0 px-5 pb-2">
                <h1 className="text-[32px] font-bold tracking-tight text-black dark:text-white">{t('ryde.rideRequestsTitle', 'Ride Requests')}</h1>
                <p className="text-[16px] text-ios-gray">{t('ryde.ridersWaitingNearby', '{n} {riders} waiting nearby', { n: g.requests.length, riders: g.requests.length === 1 ? t('ryde.riderLc', 'rider') : t('ryde.ridersLc', 'riders') })}</p>
            </div>

            <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-4 pt-1">
                {g.requests.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-10 pb-20 text-center">
                        <Inbox className="h-[72px] w-[72px] text-black/25 dark:text-white/25" strokeWidth={1.5} />
                        <p className="mt-4 text-[21px] font-semibold text-black/85 dark:text-white/90">{t('ryde.noRequestsRightNow', 'No requests right now')}</p>
                        <p className="mt-1.5 text-[16px] font-medium leading-snug text-black/55 dark:text-white/55">{t('ryde.noRequestsBody', "When riders nearby request a trip, they'll show up here for you to offer a fare.")}</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {g.requests.map(r => (
                            <button
                                key={r.id}
                                onClick={() => setSelected(r)}
                                className="flex w-full items-center gap-3.5 rounded-[18px] bg-surface p-3.5 text-left shadow-sm active:opacity-80"
                            >
                                <InitialsAvatar name={r.riderName ?? t('ryde.rider', 'Rider')} size={48} />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="truncate text-[18px] font-bold text-black dark:text-white">{r.riderName}</p>
                                        <span className="shrink-0 rounded-full bg-black/[0.06] px-2.5 py-1 text-[13px] font-bold text-black dark:bg-white/10 dark:text-white">{r.distanceKm.toFixed(1)} km</span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-1.5 text-[15px] text-ios-gray">
                                        <MapPin className="h-[15px] w-[15px] shrink-0" />
                                        <span className="truncate">{r.pickup.name}</span>
                                        <span className="shrink-0 opacity-50">→</span>
                                        <span className="truncate">{r.dropoff.name}</span>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {selected && <OfferSheet request={selected} onClose={() => setSelected(null)} />}
        </div>
    );
}
