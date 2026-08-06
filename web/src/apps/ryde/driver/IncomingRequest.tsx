import { useState } from 'react';
import { DollarSign, Map as MapIcon } from 'lucide-react';

import { t } from '@/i18n';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { Sheet } from '@/ui/Sheet';
import { useRyde } from '../store';
import { money } from '../data';
import type { Ride } from '../data';
import { useRydeDriverCut } from '../rydeApi';
import { RouteMap } from './RouteMap';

export function OfferSheet({ request, onClose }: { request: Ride; onClose: () => void }) {
    const g = useRyde();
    const r = request;
    const [fare, setFare] = useState('');
    const [showRoute, setShowRoute] = useState(false);
    const cut = useRydeDriverCut();

    const value = Math.max(0, Math.round(Number(fare) || 0));
    const net = Math.round(value * cut * 100) / 100;
    const feePct = Math.round((1 - cut) * 100);

    return (
        <Sheet title={t('ryde.offerAFare', 'Offer a fare')} onClose={onClose} fit="content" className="bg-surface px-5 pt-3">
            {() => (
                <>
                    <div className="mb-4 flex items-center gap-3.5">
                        <InitialsAvatar name={r.riderName ?? t('ryde.rider', 'Rider')} size={52} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[18px] font-bold text-black dark:text-white">{r.riderName}</p>
                            <p className="text-[15px] text-ios-gray">{t('ryde.kmAboutMin', '{km} km · about {min} min', { km: r.distanceKm.toFixed(1), min: r.durationMin })}</p>
                        </div>
                    </div>

                    <div className="mb-3 space-y-2.5 rounded-2xl bg-black/[0.05] p-4 dark:bg-white/[0.07]">
                        <div className="flex items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full bg-[#22c55e]" /><span className="truncate text-[16px] font-medium text-black dark:text-white">{r.pickup.name}</span></div>
                        <div className="flex items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full bg-black dark:bg-white" /><span className="truncate text-[16px] font-medium text-black dark:text-white">{r.dropoff.name}</span></div>
                    </div>

                    <button
                        onClick={() => setShowRoute(true)}
                        className="mb-5 flex w-full items-center justify-center gap-2.5 rounded-[14px] bg-black/[0.05] py-4 text-[16px] font-semibold text-ios-blue active:opacity-70 dark:bg-white/10"
                    >
                        <MapIcon className="h-[21px] w-[21px]" strokeWidth={2.3} /> {t('ryde.viewRouteOnMap', 'View route on map')}
                    </button>

                    <p className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ios-gray">{t('ryde.yourFareOffer', 'Your fare offer')}</p>
                    <div className="mb-2.5 flex items-center gap-2.5 rounded-[14px] bg-black/[0.05] px-4 dark:bg-white/10">
                        <DollarSign className="h-6 w-6 shrink-0 text-ios-gray" strokeWidth={2.4} />
                        <input
                            inputMode="numeric"
                            value={fare}
                            onChange={e => setFare(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="0"
                            className="min-w-0 flex-1 bg-transparent py-3.5 text-[24px] font-bold text-black outline-none placeholder:text-ios-gray dark:text-white"
                        />
                    </div>

                    <p className="mb-5 text-center text-[14px] text-ios-gray">
                        {value < 1
                            ? t('ryde.enterFare', 'Enter the fare the rider pays')
                            : feePct > 0
                            ? <>{t('ryde.afterFeeYouGet', 'After {pct}% fee, you get ', { pct: feePct })}<span className="font-bold text-[#22c55e]">{money(net)}</span></>
                            : <>{t('ryde.youGetFull', 'You get the full ')}<span className="font-bold text-[#22c55e]">{money(net)}</span></>}
                    </p>

                    <div className="flex gap-3">
                        <button onClick={onClose} className="flex-1 rounded-[14px] bg-black/[0.06] py-4 text-[17px] font-bold text-black dark:bg-white/10 dark:text-white">{t('ryde.cancel', 'Cancel')}</button>
                        <button
                            onClick={() => { g.suggestPrice(r.id, value); onClose(); }}
                            disabled={value < 1}
                            className="flex-[2] rounded-[14px] bg-black py-4 text-[17px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-black"
                        >
                            {t('ryde.offerAmount', 'Offer ${amount}', { amount: value })}
                        </button>
                    </div>

                    {showRoute && <RouteMap request={r} onClose={() => setShowRoute(false)} />}
                </>
            )}
        </Sheet>
    );
}
