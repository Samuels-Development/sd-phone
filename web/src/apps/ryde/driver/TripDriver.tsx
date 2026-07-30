import { useEffect, useState } from 'react';
import { MapPin, MessageSquare, Navigation, Phone, X } from 'lucide-react';

import { device } from '@device';
import { fetchNui, isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { dialCall } from '@/apps/phone/callsApi';
import { requestOpenMessages } from '@/shell/deeplink';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { useRyde } from '../store';
import { money } from '../data';
import type { Place } from '../data';
import { rydeNearPoint, rydeSameVehicle, useRydeDriverCut, useTripPeer } from '../rydeApi';
import { LiveDot, useSelfLocation } from '@/apps/maps/LiveDot';
import { useDeckActive } from '@/shell/deckActive';
import { DropoffPin, MapView, PickupDot, Pin } from '../ui';

export function TripDriver() {
    const g = useRyde();
    const r = g.activeDriver;
    const active = useDeckActive();

    const [confirmCancel, setConfirmCancel] = useState(false);
    const [confirmCall, setConfirmCall] = useState(false);
    const [near, setNear] = useState(!isFiveM);
    const [dist, setDist] = useState(-1);
    const enroute = r?.status === 'enroute_pickup';
    const inTrip = r?.status === 'in_progress';
    const gate = enroute ? r?.pickup : inTrip ? r?.dropoff : null;
    const gateRadius = enroute ? 100 : 250;
    const gx = gate?.x, gy = gate?.y;
    useEffect(() => {
        if (!isFiveM || gx == null || gy == null) { setNear(!isFiveM); setDist(-1); return; }
        if (!active) return;  // backgrounded: freeze the last near/dist, stop polling
        let alive = true;
        const check = () => { void rydeNearPoint(gx, gy, gateRadius).then(res => { if (alive) { setNear(res.near); setDist(res.distance); } }); };
        check();
        const nearPollId = window.setInterval(check, 1500);
        return () => { alive = false; window.clearInterval(nearPollId); };
    }, [gx, gy, gateRadius, active]);

    const [sameVeh, setSameVeh] = useState(!isFiveM);
    const arriving = r?.status === 'arriving';
    const tripId = r?.tripId;
    useEffect(() => {
        if (!isFiveM || !arriving || !tripId) { setSameVeh(!isFiveM); return; }
        if (!active) return;  // backgrounded: stop polling; resumes on foreground
        let alive = true;
        const check = () => { void rydeSameVehicle(tripId).then(s => { if (alive) setSameVeh(s); }); };
        check();
        const vehiclePollId = window.setInterval(check, 1500);
        return () => { alive = false; window.clearInterval(vehiclePollId); };
    }, [arriving, tripId, active]);

    const self = useSelfLocation({ x: (r?.pickup.x ?? 0) + 260, y: (r?.pickup.y ?? 0) + 200, h: 0 });
    const peer = useTripPeer(tripId);
    const driverCut = useRydeDriverCut();

    if (!r) return null;

    const awaiting = r.status === 'offered';
    const arriveLocked = enroute && !near;
    const startLocked = arriving && !sameVeh;
    const completeLocked = inTrip && !near;

    const label: Record<string, string> = {
        enroute_pickup: t('ryde.iveArrivedAtPickup', "I've arrived at pickup"),
        arriving: t('ryde.startTrip', 'Start trip'),
        in_progress: t('ryde.completeTrip', 'Complete trip'),
    };
    const sub: Record<string, string> = {
        enroute_pickup: t('ryde.pickUpAtLocation', 'Pick up {name} at {place}', { name: r.riderName ?? t('ryde.rider', 'Rider'), place: r.pickup.name }),
        arriving: t('ryde.waitingForRider', 'Waiting for {name}', { name: r.riderName ?? t('ryde.rider', 'Rider') }),
        in_progress: t('ryde.dropOffAtLocation', 'Drop off at {place}', { place: r.dropoff.name }),
    };
    const riderPos = peer ?? { x: r.pickup.x, y: r.pickup.y };
    const net = Math.round(r.fare * driverCut * 100) / 100;
    const taxed = driverCut < 1;

    function setWaypoint(p: Place) {
        void fetchNui('sd-phone:maps:waypoint', { x: p.x, y: p.y });
    }
    function messageRider() {
        if (r?.riderNumber) requestOpenMessages({ number: r.riderNumber, name: r.riderName ?? t('ryde.rider', 'Rider') });
    }

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#d4d4d4] font-sf dark:bg-base">
            <div className="flex shrink-0 items-center px-5 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <h1 className="text-[28px] font-extrabold tracking-tight text-black dark:text-white">{t('ryde.drive', 'Drive')}</h1>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <MapView>
                    <Pin x={r.pickup.x} y={r.pickup.y}><PickupDot /></Pin>
                    <Pin x={r.dropoff.x} y={r.dropoff.y}><DropoffPin /></Pin>
                    <Pin x={riderPos.x} y={riderPos.y} z={19}><InitialsAvatar name={r.riderName ?? t('ryde.rider', 'Rider')} size={30} /></Pin>
                    {self && <LiveDot x={self.x} y={self.y} heading={self.h} />}
                </MapView>
            </div>

            <div className="shrink-0 rounded-t-[18px] bg-[#e5e5e5] px-5 pb-[calc(var(--safe-bottom)+16px)] pt-4 shadow-[0_-6px_24px_rgba(0,0,0,0.12)] dark:bg-surface">
                {awaiting ? (
                    <>
                        <div className="mb-4 flex items-center gap-3.5">
                            <InitialsAvatar name={r.riderName ?? t('ryde.rider', 'Rider')} size={52} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[18px] font-bold text-black dark:text-white">{r.riderName}</p>
                                <p className="text-[15px] text-ios-gray">{t('ryde.kmAboutMin', '{km} km · about {min} min', { km: r.distanceKm.toFixed(1), min: r.durationMin })}</p>
                            </div>
                        </div>

                        <div className="mb-4 space-y-2.5 rounded-2xl bg-black/[0.05] p-4 dark:bg-white/[0.07]">
                            <div className="flex items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full bg-[#22c55e]" /><span className="truncate text-[16px] font-medium text-black dark:text-white">{r.pickup.name}</span></div>
                            <div className="flex items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full bg-black dark:bg-white" /><span className="truncate text-[16px] font-medium text-black dark:text-white">{r.dropoff.name}</span></div>
                        </div>

                        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-black/[0.05] px-4 py-4 dark:bg-white/[0.07]">
                            <span className="flex h-3 w-3 shrink-0 animate-pulse rounded-full bg-[#FF9600]" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[16px] font-semibold text-black dark:text-white">{t('ryde.awaitingResponse', 'Awaiting response')}</p>
                                <p className="truncate text-[14px] text-ios-gray">{t('ryde.waitingForRiderToAcceptFare', 'Waiting for {name} to accept your fare…', { name: r.riderName ?? t('ryde.rider', 'Rider') })}</p>
                            </div>
                            <div className="shrink-0 text-right">
                                <p className="text-[22px] font-extrabold tracking-tight text-[#22c55e]">{money(taxed ? net : r.fare)}</p>
                                {taxed && <p className="text-[12px] text-ios-gray">{t('ryde.fromFareAmount', 'from {amount} fare', { amount: money(r.fare) })}</p>}
                            </div>
                        </div>

                        <button onClick={() => setConfirmCancel(true)} className="w-full rounded-[14px] bg-black/[0.06] py-4 text-[17px] font-bold text-[#ff453a] dark:bg-white/10">{t('ryde.cancelOffer', 'Cancel offer')}</button>
                    </>
                ) : (
                    <>
                        <div className="mb-3.5 flex items-center gap-3.5">
                            <InitialsAvatar name={r.riderName ?? t('ryde.rider', 'Rider')} size={50} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[18px] font-bold text-black dark:text-white">{r.riderName}</p>
                                <p className="truncate text-[15px] text-ios-gray">{sub[r.status]}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[13px] text-ios-gray">{t('ryde.youEarn', 'You earn')}</p>
                                <p className="text-[18px] font-bold text-[#22c55e]">{money(Math.round(r.fare * driverCut * 100) / 100)}</p>
                            </div>
                        </div>

                        <div className="mb-3 space-y-2 rounded-2xl bg-black/[0.05] p-4 dark:bg-white/[0.07]">
                            <Leg dot="#22c55e" text={r.pickup.name} />
                            <Leg dot="#000" text={r.dropoff.name} />
                        </div>

                        {r.riderNumber && (
                            <div className={`mb-3.5 grid ${device.calls ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
                                {device.calls && (
                                    <button onClick={() => setConfirmCall(true)} className="flex items-center justify-center gap-2 rounded-[14px] bg-black/[0.06] py-3 text-[15px] font-semibold text-black active:opacity-70 dark:bg-white/10 dark:text-white">
                                        <Phone className="h-[20px] w-[20px]" strokeWidth={2.2} /> {t('ryde.call', 'Call')}
                                    </button>
                                )}
                                <button onClick={messageRider} className="flex items-center justify-center gap-2 rounded-[14px] bg-black/[0.06] py-3 text-[15px] font-semibold text-black active:opacity-70 dark:bg-white/10 dark:text-white">
                                    <MessageSquare className="h-[20px] w-[20px]" strokeWidth={2.2} /> {t('ryde.message', 'Message')}
                                </button>
                            </div>
                        )}

                        <div className="mb-3.5 grid grid-cols-2 gap-3">
                            <button onClick={() => setWaypoint(r.pickup)} className="flex items-center justify-center gap-2 rounded-[14px] bg-black/[0.06] py-3 text-[15px] font-semibold text-black active:opacity-70 dark:bg-white/10 dark:text-white">
                                <MapPin className="h-[18px] w-[18px] text-[#22c55e]" strokeWidth={2.4} /> {t('ryde.pickup', 'Pickup')}
                            </button>
                            <button onClick={() => setWaypoint(r.dropoff)} className="flex items-center justify-center gap-2 rounded-[14px] bg-black/[0.06] py-3 text-[15px] font-semibold text-black active:opacity-70 dark:bg-white/10 dark:text-white">
                                <MapPin className="h-[18px] w-[18px] text-black dark:text-white" strokeWidth={2.4} /> {t('ryde.destination', 'Destination')}
                            </button>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={g.driverAdvance}
                                disabled={arriveLocked || startLocked || completeLocked}
                                className="flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-black py-4 text-[17px] font-bold text-white disabled:opacity-40 dark:bg-white dark:text-black"
                            >
                                <Navigation className="h-[22px] w-[22px]" /> {arriveLocked ? (dist >= 0 ? t('ryde.metersFromPickup', '{dist}m from pickup', { dist }) : t('ryde.driveToPickup', 'Drive to pickup'))
                                    : startLocked ? t('ryde.riderNotInVehicle', 'Rider not in vehicle')
                                    : completeLocked ? (dist >= 0 ? t('ryde.metersFromDropoff', '{dist}m from drop-off', { dist }) : t('ryde.driveToDropoff', 'Drive to drop-off'))
                                    : label[r.status]}
                            </button>
                            <button onClick={() => setConfirmCancel(true)} className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-[14px] bg-black/[0.06] text-[#ff453a] dark:bg-white/10">
                                <X className="h-[22px] w-[22px]" />
                            </button>
                        </div>
                    </>
                )}
            </div>

            {confirmCancel && (
                <AlertDialog
                    title={awaiting ? t('ryde.withdrawOfferQ', 'Withdraw offer?') : t('ryde.cancelTripQ', 'Cancel trip?')}
                    message={awaiting
                        ? t('ryde.withdrawOfferMessage', "Withdraw your fare offer to {name}? They'll go back to finding a driver.", { name: r.riderName ?? t('ryde.rider', 'Rider') })
                        : t('ryde.cancelTripMessage', "Cancel this trip with {name}? They'll be left without a ride.", { name: r.riderName ?? t('ryde.rider', 'Rider') })}
                    cancelLabel={t('ryde.keep', 'Keep')}
                    confirmLabel={awaiting ? t('ryde.withdraw', 'Withdraw') : t('ryde.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setConfirmCancel(false)}
                    onConfirm={() => { setConfirmCancel(false); g.driverCancel(); }}
                />
            )}

            {confirmCall && r.riderNumber && (
                <AlertDialog
                    title={t('common.callSubject', 'Call {subject}', { subject: r.riderName ?? t('ryde.yourRider', 'your rider') })}
                    message={t('ryde.callRiderConfirm', 'Call {name}?', { name: r.riderName ?? t('ryde.yourRider', 'your rider') })}
                    cancelLabel={t('ryde.cancel', 'Cancel')}
                    confirmLabel={t('ryde.call', 'Call')}
                    onCancel={() => setConfirmCall(false)}
                    onConfirm={() => { if (r.riderNumber) void dialCall(r.riderNumber, r.riderName ?? t('ryde.rider', 'Rider')); setConfirmCall(false); }}
                />
            )}
        </div>
    );
}

function Leg({ dot, text }: { dot: string; text: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: dot }} />
            <span className="truncate text-[16px] font-semibold text-black dark:text-white">{text}</span>
        </div>
    );
}
