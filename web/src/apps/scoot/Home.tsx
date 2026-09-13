import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigation, Zap } from 'lucide-react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { LiveDot, useSelfLocation } from '@/apps/maps/LiveDot';
import { MapView, usePinStyle } from '@/apps/maps/MapView';
import type { ReactNode } from 'react';
import { SCOOT_COLOURS, scoot, useScootFeed } from './scootApi';
import type { ScootReceipt, ScootScooter, ScootStation } from './scootApi';

const ACCENT = '#14b8a6';

function Pin({ x, y, z = 10, children }: { x: number; y: number; z?: number; children: ReactNode }) {
    const style = usePinStyle(x, y);
    return <div style={{ ...style, zIndex: z }} className="flex flex-col items-center">{children}</div>;
}

function fmtElapsed(startedAt: number): string {
    const s = Math.max(0, Math.floor(Date.now() / 1000) - startedAt);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function Home() {
    const { snapshot, setSnapshot, refresh } = useScootFeed();
    const me = useSelfLocation({ x: 201, y: -940, h: 0 });
    const [centerOn, setCenterOn] = useState<{ x: number; y: number } | null>(null);
    useEffect(() => { if (me && !centerOn) setCenterOn({ x: me.x, y: me.y }); }, [me, centerOn]);

    const [selected, setSelected] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [dispensing, setDispensing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [receipt, setReceipt] = useState<ScootReceipt | null>(null);
    const [confirmEnd, setConfirmEnd] = useState(false);
    const [, tick] = useState(0);

    const cardRef = useRef<HTMLDivElement>(null);
    const [cardH, setCardH] = useState(0);
    useLayoutEffect(() => {
        const measure = () => { if (cardRef.current) setCardH(cardRef.current.offsetHeight); };
        measure();
        const ro = new ResizeObserver(measure);
        if (cardRef.current) ro.observe(cardRef.current);
        return () => ro.disconnect();
    }, [snapshot?.ride, selected]);

    const ride = snapshot?.ride ?? null;
    const pricing = snapshot?.pricing;
    const nearest = useMemo(() => (snapshot?.scooters ?? []).slice(0, 6), [snapshot]);
    const current: ScootScooter | null = selected != null
        ? (snapshot?.scooters.find(s => s.id === selected) ?? nearest[0] ?? null)
        : (nearest[0] ?? null);
    const station: ScootStation | null = useMemo(() => (snapshot?.bunkers ?? [])[0] ?? null, [snapshot]);
    const atStation = !!(station && pricing && station.distance <= pricing.stationDistance);

    useEffect(() => {
        if (!ride) return;
        const id = window.setInterval(() => tick(n => n + 1), 1000);
        return () => window.clearInterval(id);
    }, [ride]);

    async function unlock() {
        if (!current || busy) return;
        setBusy(true);
        const res = await scoot.rent(current.id);
        setBusy(false);
        if (res.success && res.data) setSnapshot(res.data.nearby);
        else if (!res.success) setError(res.message ?? t('scoot.failed', 'That did not work'));
    }

    async function rentHere() {
        if (!station || busy) return;
        setBusy(true);
        const res = await scoot.rentHere(station.id);
        setBusy(false);
        if (res.success && res.data) {
            setSnapshot(res.data.nearby);
            setDispensing(true);
            window.setTimeout(() => setDispensing(false), (res.data.dispense.spawnAt ?? 8200) + 500);
        } else if (!res.success) {
            setError(res.message ?? t('scoot.failed', 'That did not work'));
        }
    }

    async function endRide() {
        setConfirmEnd(false);
        if (busy) return;
        setBusy(true);
        const res = await scoot.finish();
        setBusy(false);
        if (res.success && res.data) {
            setSnapshot(res.data.nearby);
            setReceipt(res.data.receipt);
        } else {
            setError(res.message ?? t('scoot.failed', 'That did not work'));
            void refresh();
        }
    }

    const tooFar = !!(current && pricing && current.distance > pricing.rentDistance);
    const runningCost = ride && pricing ? Math.max(1, Math.ceil((Date.now() / 1000 - ride.startedAt) / 60)) * pricing.perMinute : 0;
    const currency = pricing?.currency ?? '$';
    const unlockPrice = `${currency}${pricing?.unlock ?? 0}`;
    const stationName = (id: number | null) => (id == null ? null : (snapshot?.bunkers.find(b => b.id === id)?.name ?? null));

    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <div className="flex shrink-0 items-end justify-between px-5 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <div>
                    <h1 className="text-[28px] font-extrabold tracking-tight text-black dark:text-white">Scoot</h1>
                    <p className="text-[14px] font-medium text-ios-gray">
                        {pricing
                            ? t('scoot.pricingLine', '{currency}{unlock} unlock · {currency}{perMinute}/min', { currency: pricing.currency, unlock: pricing.unlock, perMinute: pricing.perMinute })
                            : t('scoot.tagline', 'Ride the city')}
                    </p>
                </div>
                <span className="mb-1 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: `${ACCENT}26`, color: ACCENT }}>
                    <Zap className="h-5 w-5" strokeWidth={2.4} />
                </span>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div dir="ltr" className="h-full w-full">
                    <MapView chromeTop="12px" chromeBottom={`${cardH + 8}px`} insetBottom={cardH} centerTo={centerOn ?? undefined}>
                        {snapshot?.bunkers.map(b => (
                            <Pin key={`b${b.id}`} x={b.x} y={b.y} z={8}>
                                <span className="flex h-7 w-7 items-center justify-center rounded-[8px] border-2 border-white shadow" style={{ background: '#0ea5b7' }} title={b.name}>
                                    <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.6} />
                                </span>
                            </Pin>
                        ))}
                        {snapshot?.scooters.map(s => {
                            const active = current?.id === s.id;
                            return (
                                <Pin key={`s${s.id}`} x={s.x} y={s.y} z={active ? 12 : 9}>
                                    <button
                                        type="button"
                                        onClick={() => setSelected(s.id)}
                                        aria-label={s.plate}
                                        className="rounded-full border-[2.5px] border-white"
                                        style={{
                                            width: active ? 22 : 16, height: active ? 22 : 16, background: SCOOT_COLOURS[s.colour] ?? '#fff',
                                            opacity: s.available ? 1 : 0.45, pointerEvents: 'auto',
                                            boxShadow: active ? `0 0 0 4px ${ACCENT}59, 0 2px 6px rgba(0,0,0,0.45)` : '0 2px 6px rgba(0,0,0,0.45)',
                                        }}
                                    />
                                </Pin>
                            );
                        })}
                        {me && <LiveDot x={me.x} y={me.y} heading={me.h} />}
                    </MapView>
                </div>
            </div>

            <div ref={cardRef} className="absolute inset-x-0 bottom-0 z-30 rounded-t-[18px] bg-surface px-5 pb-4 pt-3 shadow-[0_-6px_24px_rgba(0,0,0,0.12)]">
                <div className="mx-auto mb-3 h-[5px] w-9 rounded-full bg-black/20 dark:bg-white/25" />

                {ride ? (
                    <>
                        <div className="flex items-center gap-3">
                            <span className="inline-block h-4 w-4 rounded-full ring-2 ring-black/15 dark:ring-white/20" style={{ background: SCOOT_COLOURS[ride.colour] ?? '#fff' }} />
                            <p className="text-[22px] font-extrabold tracking-tight text-black dark:text-white">{t('scoot.yourRide', 'Your ride')} · {ride.plate}</p>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <div className="rounded-[12px] bg-black/[0.05] p-3 dark:bg-white/[0.07]">
                                <p className="text-[12px] font-semibold uppercase tracking-wider text-ios-gray">{t('scoot.elapsed', 'Elapsed')}</p>
                                <p className="mt-0.5 text-[24px] font-bold tabular-nums text-black dark:text-white">{fmtElapsed(ride.startedAt)}</p>
                            </div>
                            <div className="rounded-[12px] bg-black/[0.05] p-3 dark:bg-white/[0.07]">
                                <p className="text-[12px] font-semibold uppercase tracking-wider text-ios-gray">{t('scoot.runningCost', 'Running cost')}</p>
                                <p className="mt-0.5 text-[24px] font-bold tabular-nums text-black dark:text-white">{currency}{runningCost}</p>
                            </div>
                        </div>
                        <button type="button" disabled={busy} onClick={() => setConfirmEnd(true)} className="mt-3 w-full rounded-[14px] bg-black/[0.06] py-3.5 text-[16px] font-bold text-ios-red disabled:opacity-40 dark:bg-white/10">
                            {t('scoot.endRide', 'End ride')}
                        </button>
                    </>
                ) : atStation && station ? (
                    <>
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `${ACCENT}26`, color: ACCENT }}>
                                <Zap className="h-5 w-5" strokeWidth={2.4} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[21px] font-semibold text-black dark:text-white">{station.name}</p>
                                <p className="text-[15px] font-medium text-ios-gray">
                                    {dispensing
                                        ? t('scoot.dispensing', 'Your scooter is rolling out…')
                                        : station.busy
                                            ? t('scoot.stationBusy', 'Station is busy')
                                            : t('scoot.stock', '{n} scooters ready', { n: station.stock })}
                                </p>
                            </div>
                        </div>
                        <button type="button" disabled={busy || dispensing || station.busy || station.stock < 1} onClick={() => void rentHere()} className="mt-3 w-full rounded-[14px] py-3.5 text-[16px] font-bold text-white disabled:opacity-40" style={{ background: ACCENT }}>
                            {station.stock < 1 ? t('scoot.stationEmpty', 'No scooters left here') : t('scoot.rentHere', 'Rent here · {price}', { price: unlockPrice })}
                        </button>
                        {current && current.available && !tooFar && (
                            <button type="button" disabled={busy} onClick={() => void unlock()} className="mt-2 w-full rounded-[14px] bg-black/[0.06] py-3 text-[15px] font-semibold text-black dark:bg-white/10 dark:text-white">
                                {t('scoot.unlockParked', 'Unlock parked {plate} instead', { plate: current.plate })}
                            </button>
                        )}
                    </>
                ) : current ? (
                    <>
                        <div className="flex items-center gap-3">
                            <span className="inline-block h-4 w-4 shrink-0 rounded-full ring-2 ring-black/15 dark:ring-white/20" style={{ background: SCOOT_COLOURS[current.colour] ?? '#fff' }} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[21px] font-semibold text-black dark:text-white">{current.plate}</p>
                                <p className="text-[15px] font-medium text-ios-gray">
                                    {current.available ? t('scoot.away', '{m} m away', { m: current.distance.toFixed(0) }) : t('scoot.inUse', 'In use')}
                                    {stationName(current.bunkerId) ? ` · ${stationName(current.bunkerId)}` : ''}
                                </p>
                            </div>
                            <button type="button" onClick={() => void scoot.waypoint(current.x, current.y)} aria-label={t('scoot.locate', 'Locate')} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/[0.06] text-ios-blue active:opacity-70 dark:bg-white/10">
                                <Navigation className="h-[18px] w-[18px]" />
                            </button>
                        </div>
                        <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                            {nearest.map(s => {
                                const on = current.id === s.id;
                                return (
                                    <button key={s.id} type="button" onClick={() => setSelected(s.id)} className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-semibold ${on ? 'text-white' : 'bg-black/[0.06] text-black dark:bg-white/10 dark:text-white'}`} style={{ background: on ? ACCENT : undefined, opacity: s.available ? 1 : 0.5 }}>
                                        <span className="inline-block h-2.5 w-2.5 rounded-full border border-white/60" style={{ background: SCOOT_COLOURS[s.colour] ?? '#fff' }} />
                                        {s.distance.toFixed(0)} m
                                    </button>
                                );
                            })}
                        </div>
                        <button type="button" disabled={busy || !current.available || tooFar} onClick={() => void unlock()} className="mt-3 w-full rounded-[14px] py-3.5 text-[16px] font-bold text-white disabled:opacity-40" style={{ background: ACCENT }}>
                            {!current.available ? t('scoot.inUse', 'In use') : tooFar ? t('scoot.walkCloser', 'Walk closer to unlock') : t('scoot.unlock', 'Unlock · {price}', { price: unlockPrice })}
                        </button>
                        {station && (
                            <p className="mt-2 text-center text-[13px] text-ios-gray">
                                {t('scoot.stationHint', '{name} is {m} m away and can dispense one', { name: station.name, m: station.distance.toFixed(0) })}
                            </p>
                        )}
                    </>
                ) : (
                    <p className="py-3 text-center text-[15px] text-ios-gray">
                        {snapshot ? t('scoot.noneNearby', 'No scooters near you. Check a station on the map.') : t('scoot.finding', 'Finding scooters…')}
                    </p>
                )}
            </div>

            {confirmEnd && (
                <AlertDialog
                    title={t('scoot.endRideTitle', 'End your ride?')}
                    message={t('scoot.endRideBody', 'You will be charged {currency}{cost} for this ride.', { currency, cost: runningCost })}
                    confirmLabel={t('scoot.endRide', 'End ride')}
                    destructive
                    onCancel={() => setConfirmEnd(false)}
                    onConfirm={() => void endRide()}
                />
            )}
            {error && (
                <AlertDialog title={t('scoot.oops', 'Scoot')} message={error} hideCancel onCancel={() => setError(null)} onConfirm={() => setError(null)} />
            )}
            {receipt && (
                <AlertDialog
                    title={t('scoot.rideEnded', 'Ride ended')}
                    message={t('scoot.receipt', '{plate} · {minutes} min · {currency}{cost}{unpaid}', { plate: receipt.plate, minutes: receipt.minutes, currency, cost: receipt.cost, unpaid: receipt.paid ? '' : ` (${t('scoot.unpaid', 'unpaid')})` }) + (receipt.docked ? ` · ${t('scoot.dockedAt', 'docked at {name}', { name: receipt.docked })}` : '')}
                    hideCancel
                    onCancel={() => setReceipt(null)}
                    onConfirm={() => setReceipt(null)}
                />
            )}
        </div>
    );
}
