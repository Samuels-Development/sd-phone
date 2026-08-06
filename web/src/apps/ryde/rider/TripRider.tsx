import { useEffect, useRef, useState } from 'react';
import { ArrowLeftRight, Phone, MessageSquare, X } from 'lucide-react';

import { device } from '@device';
import { AlertDialog } from '@/ui/AlertDialog';
import { dialCall } from '@/apps/phone/callsApi';
import { requestOpenMessages } from '@/shell/deeplink';
import { t } from '@/i18n';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { useRyde } from '../store';
import { getRideStatusLabel, money , type Ride } from '../data';
import { useTripPeer } from '../rydeApi';
import { LiveDot, useSelfLocation } from '@/apps/maps/LiveDot';
import { useDeckActive } from '@/shell/deckActive';
import { CarMarker, DropoffPin, MapView, PickupDot, Pin, RatingPill } from '../ui';

function formatDist(units: number): string {
    if (units >= 1000) return `${(units / 1000).toFixed(1)} km`;
    return `${Math.max(0, Math.round(units / 10) * 10)} m`;
}

export function TripRider() {
    const r = useRyde().activeRider;
    // Hooks below run unconditionally, so the null guard lives in this thin
    // wrapper and the real component only mounts with a ride present.
    return r ? <TripRiderView r={r} /> : null;
}

function TripRiderView({ r }: { r: Ride }) {
    const g = useRyde();

    const rideStatusLabel = getRideStatusLabel();
    const me = useSelfLocation({ x: r.pickup.x, y: r.pickup.y, h: 0 });
    const peer = useTripPeer(r.tripId);
    const driverApprox = r.status === 'in_progress'
        ? { x: (r.pickup.x + r.dropoff.x) / 2, y: (r.pickup.y + r.dropoff.y) / 2 }
        : r.status === 'arriving'
        ? { x: r.pickup.x, y: r.pickup.y }
        : { x: r.pickup.x + 220, y: r.pickup.y + 180 };
    const driverPos = peer ?? driverApprox;

    const inTrip = r.status === 'in_progress';
    const offered = r.status === 'offered';
    const finding = r.status === 'finding';
    const enroute = r.status === 'enroute_pickup';
    const arrived = r.status === 'arriving';

    const meRef = useRef(me); meRef.current = me;
    const driverPosRef = useRef(driverPos); driverPosRef.current = driverPos;
    const dropRef = useRef(r.dropoff); dropRef.current = r.dropoff;
    const active = useDeckActive();
    const [awayM, setAwayM] = useState<number | null>(null);
    useEffect(() => {
        if (!enroute && !inTrip) { setAwayM(null); return; }
        if (!active) return;  // backgrounded: keep the last distance frozen, stop sampling
        const sample = () => {
            const m = meRef.current;
            if (!m) return;
            const target = enroute ? driverPosRef.current : dropRef.current;
            setAwayM(Math.hypot(m.x - target.x, m.y - target.y));
        };
        sample();
        const pollId = window.setInterval(sample, 10000);
        return () => window.clearInterval(pollId);
    }, [enroute, inTrip, active]);

    const offerCount = r.offers?.length ?? 0;
    const offerIdx = r.offers ? r.offers.findIndex(o => o.tripId === r.tripId) : -1;

    const [confirmCall, setConfirmCall] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);
    const driver = r.driver;
    function messageDriver() {
        if (driver?.number) requestOpenMessages({ number: driver.number, name: driver.name });
    }

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-base font-sf">
            <div className="flex shrink-0 items-center px-5 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <h1 className="text-[28px] font-extrabold tracking-tight text-black dark:text-white">Ryde</h1>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <MapView>
                    <Pin x={r.pickup.x} y={r.pickup.y}><PickupDot /></Pin>
                    <Pin x={r.dropoff.x} y={r.dropoff.y}><DropoffPin /></Pin>
                    {r.driver && <Pin x={driverPos.x} y={driverPos.y} z={20}><CarMarker color={r.driver.color} /></Pin>}
                    {me && <LiveDot x={me.x} y={me.y} heading={me.h} />}
                </MapView>
            </div>

            <div className="shrink-0 rounded-t-[18px] bg-surface px-5 pb-[calc(var(--safe-bottom)+16px)] pt-4 shadow-[0_-6px_24px_rgba(0,0,0,0.12)]">
                <p className="text-[22px] font-extrabold tracking-tight text-black dark:text-white">
                    {finding ? rideStatusLabel.finding
                        : offered ? rideStatusLabel.offered
                        : enroute ? t('ryde.statusEnroutePickup', 'Driver on the way')
                        : arrived ? t('ryde.driverHasArrived', 'Your driver has arrived')
                        : inTrip ? t('ryde.headingToDestination', 'Heading to {name}', { name: r.dropoff.name })
                        : rideStatusLabel[r.status]}
                </p>
                <p className="mb-3.5 text-[15px] text-ios-gray">
                    {finding ? t('ryde.matchingNearbyDriver', 'Matching you with a nearby driver')
                        : offered ? t('ryde.driverCanTakeYouFor', '{name} can take you for {fare}', { name: r.driver?.name ?? t('ryde.aDriver', 'A driver'), fare: money(r.fare) })
                        : enroute ? (awayM != null ? t('ryde.driverAwayDistance', 'Your driver is {dist} away', { dist: formatDist(awayM) }) : t('ryde.driverOnTheWay', 'Your driver is on the way'))
                        : arrived ? t('ryde.hopInReady', 'Hop in when you’re ready, they’re waiting for you')
                        : inTrip ? (awayM != null ? t('ryde.distanceToDestination', '{dist} to your destination', { dist: formatDist(awayM) }) : t('ryde.onTheWayToDestination', 'On the way to your destination'))
                        : ''}
                </p>

                {r.driver && (
                    <div className="mb-3.5 flex items-center gap-3.5 rounded-2xl bg-black/[0.05] p-4 dark:bg-white/[0.07]">
                        <InitialsAvatar name={r.driver.name} color={r.driver.color} size={54} />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <p className="truncate text-[18px] font-bold text-black dark:text-white">{r.driver.name}</p>
                                <RatingPill rating={r.driver.rating} />
                            </div>
                            <p className="truncate text-[16px] text-ios-gray">{r.driver.car}</p>
                        </div>
                        <span className="rounded-md bg-black px-2.5 py-1.5 text-[15px] font-bold tracking-wide text-white dark:bg-white dark:text-black">{r.driver.plate}</span>
                    </div>
                )}

                {r.driver && !inTrip && !offered && (
                    <div className={`mb-3.5 grid ${device.calls ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                        {device.calls && <Action icon={<Phone className="h-[24px] w-[24px]" />} label={t('ryde.call', 'Call')} onClick={() => setConfirmCall(true)} />}
                        <Action icon={<MessageSquare className="h-[24px] w-[24px]" />} label={t('ryde.message', 'Message')} onClick={messageDriver} />
                    </div>
                )}

                {offered ? (
                    <>
                        {offerCount > 1 && (
                            <button onClick={g.switchOffer} className="mb-3 flex w-full items-center justify-center gap-2 rounded-[14px] bg-black/[0.06] py-3 text-[15px] font-semibold text-ios-blue active:opacity-70 dark:bg-white/10">
                                <ArrowLeftRight className="h-[17px] w-[17px]" strokeWidth={2.4} />
                                {offerCount === 2 ? t('ryde.viewOtherOffer', 'View other offer') : t('ryde.viewOtherOffers', 'View other offers ({n})', { n: offerCount - 1 })}
                            </button>
                        )}
                        <div className="mb-3.5 flex items-center justify-between rounded-2xl bg-black/[0.05] px-4 py-3.5 dark:bg-white/[0.08]">
                            <p className="text-[15px] font-semibold text-ios-gray">{offerCount > 1 ? t('ryde.offerXOfY', 'Offer {idx} of {count}', { idx: offerIdx + 1, count: offerCount }) : t('ryde.offeredFare', 'Offered fare')}</p>
                            <p className="text-[26px] font-extrabold tracking-tight text-black dark:text-white">{money(r.fare)}</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={g.declineOffer} className="flex-1 rounded-[14px] bg-black/[0.06] py-4 text-[17px] font-bold text-[#ff453a] dark:bg-white/10">{t('common.decline', 'Decline')}</button>
                            <button onClick={g.acceptOffer} className="flex-[2] rounded-[14px] bg-black py-4 text-[17px] font-bold text-white dark:bg-white dark:text-black">{t('ryde.acceptFare', 'Accept fare')}</button>
                        </div>
                    </>
                ) : finding ? (
                    <button onClick={() => setConfirmCancel(true)} className="w-full rounded-[14px] bg-black/[0.06] py-4 text-[17px] font-bold text-[#ff453a] dark:bg-white/10">{t('ryde.cancelRequestAction', 'Cancel request')}</button>
                ) : (
                    <div className="flex items-center justify-between rounded-2xl bg-black/[0.05] px-4 py-4 dark:bg-white/[0.07]">
                        <div>
                            <p className="text-[14px] text-ios-gray">{r.payment === 'card' ? t('ryde.paymentCard', 'Card') : t('ryde.paymentCash', 'Cash')}</p>
                            <p className="text-[20px] font-bold text-black dark:text-white">{money(r.fare)}</p>
                        </div>
                        {!inTrip && (
                            <button onClick={() => setConfirmCancel(true)} className="flex items-center gap-1.5 rounded-full bg-black/[0.06] px-4 py-3 text-[15px] font-semibold text-[#ff453a] dark:bg-white/10">
                                <X className="h-[18px] w-[18px]" /> {t('ryde.cancel', 'Cancel')}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {confirmCall && r.driver && (
                <AlertDialog
                    title={t('common.callSubject', 'Call {subject}', { subject: r.driver.name })}
                    message={t('ryde.callConfirm', 'Call {name}?', { name: r.driver.name })}
                    cancelLabel={t('ryde.cancel', 'Cancel')}
                    confirmLabel={t('ryde.call', 'Call')}
                    onCancel={() => setConfirmCall(false)}
                    onConfirm={() => { if (driver?.number) void dialCall(driver.number, driver.name); setConfirmCall(false); }}
                />
            )}

            {confirmCancel && (
                <AlertDialog
                    title={finding ? t('ryde.cancelRequestTitle', 'Cancel request?') : t('ryde.cancelRideTitle', 'Cancel ride?')}
                    message={finding
                        ? t('ryde.stopLookingForDriver', 'Stop looking for a nearby driver?')
                        : driver
                        ? t('ryde.cancelRideWithDriverMessage', 'Cancel your ride with {name}? Your driver is on the way.', { name: driver.name })
                        : t('ryde.cancelRideMessage', 'Cancel your ride? Your driver is on the way.')}
                    cancelLabel={t('ryde.keep', 'Keep')}
                    confirmLabel={t('ryde.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirmCancel(false)}
                    onConfirm={() => { setConfirmCancel(false); g.cancelRider(); }}
                />
            )}
        </div>
    );
}

function Action({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
    return (
        <button onClick={onClick} className="flex flex-col items-center gap-1.5 rounded-2xl bg-black/[0.05] py-3.5 text-black active:opacity-70 dark:bg-white/[0.07] dark:text-white">
            {icon}<span className="text-[14px] font-semibold">{label}</span>
        </button>
    );
}
