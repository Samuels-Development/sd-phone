import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, Map as MapIcon, Navigation, Zap } from 'lucide-react';
import type { ReactNode } from 'react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { AlertDialog } from '@/ui/AlertDialog';
import { GroupCard, ListRow } from '@/ui/ListGroup';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Sheet } from '@/ui/Sheet';
import { Spinner } from '@/ui/Spinner';
import { LiveDot } from '@/apps/maps/LiveDot';
import { MapView, usePinStyle } from '@/apps/maps/MapView';
import { SCOOT_PALETTE, SCOOT_COLOURS, scoot, useScootFeed } from './scootApi';
import type { ScootReceipt } from './scootApi';
import { ScooterPreview } from './ScooterPreview';
import { Customizer } from './Customizer';
import { EXTRAS, extraFee } from './customization';
import type { Customization } from './customization';

const ACCENT = '#14b8a6';
const ENTER = 'swipe-in-soft 0.3s cubic-bezier(0.32,0.72,0,1)';
const LIGHT_PAINT = new Set(['White', 'Cream', 'Ice Blue', 'Yellow', 'Silver']);
const CARD = 'ring-1 ring-black/[0.04] dark:ring-white/[0.06]';

function Pin({ x, y, children }: { x: number; y: number; children: ReactNode }) {
    return <div style={{ ...usePinStyle(x, y), zIndex: 10, pointerEvents: 'auto' }}>{children}</div>;
}

function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
    return (
        <div className="flex items-baseline justify-between px-3 pb-1.5 pt-4">
            <span className="text-[15px] font-semibold uppercase tracking-wide text-ios-gray">{children}</span>
            {right && <span className="text-[14px] font-medium text-ios-gray">{right}</span>}
        </div>
    );
}

function Plate({ children }: { children: string }) {
    return (
        <span dir="ltr" className="shrink-0 rounded-[7px] border border-black/15 bg-black/[0.03] px-2.5 py-1 font-mono text-[14px] font-semibold tracking-[0.12em] text-black/80 dark:border-white/20 dark:bg-white/[0.06] dark:text-white/80">
            {children}
        </span>
    );
}

function ColourDot({ hex, size = 14 }: { hex: string; size?: number }) {
    return <span className="inline-block shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20" style={{ width: size, height: size, background: hex }} />;
}

function elapsed(start: number): string {
    const s = Math.max(0, Math.floor(Date.now() / 1000) - start);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function Home() {
    const { snapshot, setSnapshot, refresh, connected } = useScootFeed();
    const [mode, setMode] = useSessionState<'station' | 'parked'>('scoot:mode', 'station');
    const [customization, setCustomization] = useSessionState<Customization>('scoot:extras', EXTRAS.defaults);
    const [colourId, setColourId] = useSessionState('scoot:colour', 10);
    const [stationId, setStationId] = useState<number | null>(null);
    const [scooterId, setScooterId] = useState<number | null>(null);
    const [map, setMap] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [busy, setBusy] = useState(false);
    const submitting = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [receipt, setReceipt] = useState<ScootReceipt | null>(null);
    const [confirmEnd, setConfirmEnd] = useState(false);
    const [, tick] = useState(0);

    const ride = snapshot?.ride;
    const pending = snapshot?.dispense;
    const palette = useMemo(() => (snapshot?.colours ?? SCOOT_PALETTE).map(c => ({ ...c, previewHex: c.previewHex ?? SCOOT_PALETTE.find(p => p.id === c.id)?.previewHex ?? c.hex })), [snapshot?.colours]);
    const stations = snapshot?.bunkers ?? [];
    const scooters = snapshot?.scooters ?? [];
    const station = stations.find(b => b.id === stationId) ?? stations[0];
    const current = scooters.find(s => s.id === scooterId) ?? scooters.find(s => s.available) ?? scooters[0];
    const chosen = palette.find(c => c.id === colourId) ?? palette[0];
    const displayed = palette.find(c => c.id === (ride?.colour ?? pending?.colour ?? (mode === 'parked' ? current?.colour : chosen?.id))) ?? chosen;
    const pricing = snapshot?.pricing;
    const currency = pricing?.currency ?? '$';
    const selectedExtras = ride?.customization ?? pending?.customization ?? (mode === 'parked' ? current?.customization ?? EXTRAS.defaults : customization);
    const catalog = snapshot?.extrasCatalog ?? EXTRAS;
    const fee = extraFee(selectedExtras, catalog);
    const extrasValid = selectedExtras.number.length === 2 && (selectedExtras.decal !== 'name' || selectedExtras.name.trim().length > 0);
    const price = pricing ? `${currency}${pricing.unlock + fee}` : '—';
    const cost = ride && pricing ? Math.max(1, Math.ceil((Date.now() / 1000 - ride.startedAt) / 60)) * pricing.perMinute : 0;
    const nearStation = !!(station && pricing && station.distance <= pricing.stationDistance);
    const nearScooter = !!(current && pricing && current.distance <= pricing.rentDistance);
    const phase = ride ? 'ride' : pending ? 'pending' : mode;

    const navigate = (x: number, y: number) => {
        void scoot.waypoint(x, y)
            .then(() => setError(t('scoot.routeSet', 'Route set. Follow your GPS to the pickup point.')))
            .catch(() => setError(t('scoot.noResponse', 'No response from Scoot')));
    };

    useEffect(() => {
        if (!ride && !pending) return;
        const timer = window.setInterval(() => tick(n => n + 1), 1000);
        return () => clearInterval(timer);
    }, [ride, pending]);

    async function order() {
        if (submitting.current || pending || !snapshot || !connected) return;
        if (mode === 'station' && (!station || !chosen || !snapshot.canChooseColour)) return;
        if (mode === 'parked' && !current) return;
        if (mode === 'station' && !nearStation) { navigate(station.x, station.y); return; }
        if (mode === 'parked' && !nearScooter) { navigate(current.x, current.y); return; }
        submitting.current = true; setBusy(true);
        try {
            const reply = mode === 'station' ? await scoot.rentHere(station.id, chosen.id, customization) : await scoot.rent(current.id);
            if (reply.success && reply.data) setSnapshot(reply.data.nearby);
            else setError(reply.message ?? t('scoot.failed', 'That did not work'));
        } catch { setError(t('scoot.noResponse', 'No response from Scoot')); }
        finally { submitting.current = false; setBusy(false); }
    }

    async function finish() {
        setConfirmEnd(false);
        if (submitting.current) return;
        submitting.current = true; setBusy(true);
        try {
            const reply = await scoot.finish();
            if (reply.success && reply.data) { setSnapshot(reply.data.nearby); setReceipt(reply.data.receipt); }
            else setError(reply.message ?? t('scoot.failed', 'That did not work'));
        } catch { setError(t('scoot.noResponse', 'No response from Scoot')); }
        finally { submitting.current = false; setBusy(false); void refresh(); }
    }

    const unavailable = !extrasValid || !snapshot || !connected || busy || !!pending || (mode === 'station'
        ? !station || !chosen || !snapshot.canChooseColour || station.busy || station.stock < 1
        : !current || !current.available);
    const action = busy ? t('scoot.working', 'One moment…')
        : pending ? t('scoot.dispensing', 'Your scooter is rolling out…')
        : mode === 'station'
            ? !station ? t('scoot.noStations', 'No stations nearby')
            : station.busy ? t('scoot.stationBusy', 'Station is busy')
            : station.stock < 1 ? t('scoot.stationEmpty', 'No scooters left here')
            : !nearStation ? t('scoot.getDirections', 'Directions to pickup')
            : t('scoot.orderColour', 'Rent {colour} · {price}', { colour: chosen?.name ?? '', price })
            : !current ? t('scoot.noParked', 'No parked scooters nearby')
            : !current.available ? t('scoot.inUse', 'In use')
            : !nearScooter ? t('scoot.getDirections', 'Directions to pickup')
            : t('scoot.unlock', 'Unlock · {price}', { price });

    const previewColour = displayed?.previewHex ?? '#0b4145';
    const previewName = displayed?.name ?? 'Teal';

    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <div className="flex shrink-0 items-end justify-between px-5 pb-3" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <div>
                    <h1 className="text-[28px] font-extrabold tracking-tight text-black dark:text-white">Scoot</h1>
                    <p className="text-[15px] font-medium text-ios-gray">{t('scoot.tagline', 'Ride the city')}</p>
                </div>
                <button
                    type="button"
                    aria-label={t('scoot.openMap', 'Open pickup map')}
                    onClick={() => setMap(true)}
                    className={`flex h-[42px] w-[42px] items-center justify-center rounded-full bg-surface text-black shadow-sm transition-transform active:scale-95 dark:text-white ${CARD}`}
                >
                    <MapIcon className="h-[22px] w-[22px]" strokeWidth={2.1} />
                </button>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                {!ride && !pending && (
                    <SegmentedControl
                        slide
                        value={mode}
                        onChange={setMode}
                        className="mb-3"
                        options={[
                            { value: 'station', label: t('scoot.chooseRide', 'Choose your ride') },
                            { value: 'parked',  label: t('scoot.parkedNearby', 'Parked nearby') },
                        ]}
                    />
                )}

                <ScooterPreview customization={selectedExtras} colour={previewColour} name={previewName} onExpand={() => setExpanded(true)} />

                <SectionLabel right={fee ? `+${currency}${fee}` : undefined}>{t('scoot.extras', 'EXTRAS')}</SectionLabel>
                <Customizer value={selectedExtras} onChange={setCustomization} currency={currency} catalog={catalog} readonly={phase !== 'station'} />

                <div key={phase} style={{ animation: ENTER }}>
                    {phase === 'ride' && ride && (
                        <>
                            <SectionLabel>{t('scoot.rideActive', 'YOU’RE ON YOUR WAY')}</SectionLabel>
                            <GroupCard radius={16} className={`p-4 ${CARD}`}>
                                <div className="flex items-center justify-between gap-3">
                                    <span className="flex min-w-0 items-center gap-2.5 text-[22px] font-bold tracking-tight text-black dark:text-white">
                                        <span className="truncate">{displayed?.name}</span>
                                        <ColourDot hex={displayed?.hex ?? previewColour} />
                                    </span>
                                    <Plate>{ride.plate}</Plate>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className="rounded-[14px] bg-black/[0.04] p-4 dark:bg-white/[0.06]">
                                        <p className="text-[13px] font-semibold uppercase tracking-wider text-ios-gray">{t('scoot.elapsed', 'Elapsed')}</p>
                                        <p className="mt-1 text-[30px] font-bold tabular-nums leading-none text-black dark:text-white">{elapsed(ride.startedAt)}</p>
                                    </div>
                                    <div className="rounded-[14px] bg-black/[0.04] p-4 dark:bg-white/[0.06]">
                                        <p className="text-[13px] font-semibold uppercase tracking-wider text-ios-gray">{t('scoot.runningCost', 'Running cost')}</p>
                                        <p className="mt-1 text-[30px] font-bold tabular-nums leading-none text-black dark:text-white">{currency}{cost}</p>
                                    </div>
                                </div>
                                <p className="mt-4 text-[15px] leading-snug text-ios-gray">{t('scoot.returnHint', 'Park safely. End your ride near a station to return your scooter.')}</p>
                            </GroupCard>
                        </>
                    )}

                    {phase === 'pending' && (
                        <GroupCard radius={16} className={`mt-4 flex flex-col items-center px-6 py-8 text-center ${CARD}`}>
                            <span className="flex h-[64px] w-[64px] items-center justify-center rounded-full" style={{ background: `${ACCENT}22`, color: ACCENT }}>
                                <Zap className="h-[30px] w-[30px]" strokeWidth={2.2} />
                            </span>
                            <h2 className="mt-4 text-[22px] font-bold tracking-tight text-black dark:text-white">{t('scoot.preparingColour', 'Preparing your {colour} scooter', { colour: displayed?.name ?? '' })}</h2>
                            <p className="mt-2 max-w-[290px] text-[16px] leading-snug text-ios-gray">{t('scoot.pickupSoon', 'Stay by the station. Your ride starts when the scooter is ready.')}</p>
                            <Spinner size={30} className="mt-6" />
                        </GroupCard>
                    )}

                    {phase === 'station' && (
                        <>
                            <SectionLabel right={t('scoot.finishCount', '{count} finishes', { count: palette.length })}>{t('scoot.makeItYours', 'MAKE IT YOURS')}</SectionLabel>
                            <GroupCard radius={16} className={`p-4 ${CARD}`}>
                                <h2 className="text-[22px] font-bold tracking-tight text-black dark:text-white">{chosen?.name}</h2>
                                <div role="group" aria-label={t('scoot.chooseColour', 'Choose a color')} className="mt-3 grid grid-cols-5 gap-y-3">
                                    {palette.map(c => {
                                        const active = chosen?.id === c.id;
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                title={c.name}
                                                aria-label={c.name}
                                                aria-pressed={active}
                                                disabled={busy}
                                                onClick={() => setColourId(c.id)}
                                                className="flex h-[44px] w-full items-center justify-center transition-transform active:scale-90 disabled:opacity-40"
                                            >
                                                <span
                                                    className={`flex h-[36px] w-[36px] items-center justify-center rounded-full ring-1 ring-black/10 transition-[transform,box-shadow] duration-200 dark:ring-white/15 ${active ? 'scale-105 ring-2 ring-offset-2 ring-offset-surface' : ''}`}
                                                    style={{ background: c.hex, ...(active ? { '--tw-ring-color': ACCENT } as React.CSSProperties : {}) }}
                                                >
                                                    {active && <Check className="h-[18px] w-[18px]" strokeWidth={3} style={{ color: LIGHT_PAINT.has(c.name) ? '#102a2a' : '#fff' }} />}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </GroupCard>

                            <SectionLabel>{t('scoot.pickup', 'PICKUP STATION')}</SectionLabel>
                            <GroupCard radius={16} className={CARD}>
                                {station ? (
                                    <div className="flex items-center gap-3 p-4">
                                        <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[12px]" style={{ background: `${ACCENT}22`, color: ACCENT }}>
                                            <Zap className="h-[24px] w-[24px]" strokeWidth={2.2} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span dir="auto" className="block truncate text-[18px] font-semibold leading-tight text-black dark:text-white">{station.name}</span>
                                            <span className="mt-0.5 block truncate text-[15px] text-ios-gray">
                                                {Math.round(station.distance)} m · {station.busy ? t('scoot.stationBusy', 'Station is busy') : t('scoot.stock', '{n} scooters ready', { n: station.stock })}
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            aria-label={t('scoot.locate', 'Locate')}
                                            onClick={() => navigate(station.x, station.y)}
                                            className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-black/[0.05] transition-opacity active:opacity-60 dark:bg-white/10"
                                            style={{ color: ACCENT }}
                                        >
                                            <Navigation className="h-[22px] w-[22px]" strokeWidth={2.2} />
                                        </button>
                                    </div>
                                ) : (
                                    <p className="p-4 text-[16px] leading-snug text-ios-gray">
                                        {snapshot ? t('scoot.noneNearby', 'No scooters near you. Check a station on the map.') : t('scoot.finding', 'Finding scooters…')}
                                    </p>
                                )}
                                {stations.length > 1 && (
                                    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-4">
                                        {stations.map(b => {
                                            const active = b.id === station?.id;
                                            return (
                                                <button
                                                    key={b.id}
                                                    type="button"
                                                    aria-pressed={active}
                                                    onClick={() => setStationId(b.id)}
                                                    className={`shrink-0 rounded-full px-4 py-2 text-[15px] font-semibold transition-colors ${active ? 'text-white' : 'bg-black/[0.05] text-black/80 dark:bg-white/10 dark:text-white/80'}`}
                                                    style={active ? { background: ACCENT } : undefined}
                                                >
                                                    {b.name}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </GroupCard>
                        </>
                    )}

                    {phase === 'parked' && (
                        <>
                            <SectionLabel>{t('scoot.readyToRide', 'READY TO RIDE')}</SectionLabel>
                            <GroupCard radius={16} className={CARD} footer={t('scoot.parkedColourHint', 'Pick a parked scooter below, or choose your own color at a station.')}>
                                {scooters.length === 0 ? (
                                    <p className="p-4 text-[16px] leading-snug text-ios-gray">{t('scoot.noParked', 'No parked scooters nearby')}</p>
                                ) : scooters.map((s, i) => (
                                    <ListRow
                                        key={s.id}
                                        large
                                        label={palette.find(c => c.id === s.colour)?.name ?? s.plate}
                                        sub={s.plate}
                                        value={s.available ? `${Math.round(s.distance)} m` : t('scoot.inUse', 'In use')}
                                        left={<ColourDot hex={SCOOT_COLOURS[s.colour]} size={24} />}
                                        right={s.id === current?.id ? <Check className="h-[20px] w-[20px]" strokeWidth={2.5} style={{ color: ACCENT }} /> : undefined}
                                        divider={i < scooters.length - 1}
                                        onPress={() => setScooterId(s.id)}
                                    />
                                ))}
                            </GroupCard>
                        </>
                    )}
                </div>
            </div>

            <div className="shrink-0 border-t border-hairline/10 bg-surface px-4 pt-3" style={{ paddingBottom: 'calc(var(--safe-bottom) + 12px)' }}>
                {!ride && (
                    <div className="mb-3 flex items-baseline justify-between text-[15px] text-ios-gray">
                        <span><span className="text-[22px] font-bold text-black dark:text-white">{price}</span> {fee ? t('scoot.unlockWithExtras', 'unlock incl. extras') : t('scoot.unlockFee', 'unlock')}</span>
                        <span>{pricing ? `${currency}${pricing.perMinute}` : '—'}{t('scoot.perMinShort', ' / min')} · {t('scoot.payAsYouGo', 'Pay as you go')}</span>
                    </div>
                )}
                <button
                    type="button"
                    disabled={ride ? busy : unavailable}
                    onClick={() => ride ? setConfirmEnd(true) : void order()}
                    className={`flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] text-[17px] font-bold transition-[transform,opacity] active:scale-[0.98] active:opacity-90 disabled:opacity-50 ${ride ? 'bg-ios-red/15 text-ios-red' : 'text-white'}`}
                    style={ride ? undefined : { background: ACCENT }}
                >
                    {ride ? t('scoot.endRide', 'End ride') : action}
                    {!ride && !pending && <ArrowUpRight className="h-[20px] w-[20px]" strokeWidth={2.4} />}
                </button>
                {!connected && (
                    <button type="button" onClick={() => void refresh()} className="mt-2 w-full py-2 text-center text-[15px] font-semibold active:opacity-60" style={{ color: ACCENT }}>
                        {t('scoot.retryFeed', 'Refresh availability')}
                    </button>
                )}
            </div>

            {map && (
                <Sheet fit="full" top={40} title={t('scoot.pickupMap', 'Pickup map')} onClose={() => setMap(false)} className="bg-base">
                    {({ close }) => (
                        <div dir="ltr" className="relative min-h-0 flex-1">
                            <MapView centerTo={station ?? snapshot?.player}>
                                {stations.map(b => (
                                    <Pin key={`b${b.id}`} x={b.x} y={b.y}>
                                        <button
                                            type="button"
                                            aria-label={b.name}
                                            onClick={() => { setStationId(b.id); setMode('station'); close(); }}
                                            className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] border-2 border-white text-white shadow-md transition-transform active:scale-90"
                                            style={{ background: ACCENT }}
                                        >
                                            <Zap className="h-[19px] w-[19px]" strokeWidth={2.4} />
                                        </button>
                                    </Pin>
                                ))}
                                {scooters.map(s => (
                                    <Pin key={`s${s.id}`} x={s.x} y={s.y}>
                                        <button
                                            type="button"
                                            aria-label={s.plate}
                                            onClick={() => { setScooterId(s.id); setMode('parked'); close(); }}
                                            className="h-[24px] w-[24px] rounded-full border-2 border-white shadow-md transition-transform active:scale-90"
                                            style={{ background: SCOOT_COLOURS[s.colour] }}
                                        />
                                    </Pin>
                                ))}
                                {snapshot && <LiveDot x={snapshot.player.x} y={snapshot.player.y} heading={snapshot.player.heading} />}
                            </MapView>
                        </div>
                    )}
                </Sheet>
            )}

            {expanded && (
                <Sheet fit="full" top={40} onClose={() => setExpanded(false)} className="bg-base">
                    {({ close }) => <ScooterPreview full customization={selectedExtras} colour={previewColour} name={previewName} onCollapse={close} />}
                </Sheet>
            )}

            {confirmEnd && <AlertDialog title={t('scoot.endRideTitle', 'End your ride?')} message={t('scoot.endRideBody', 'You will be charged {currency}{cost} for this ride.', { currency, cost })} confirmLabel={t('scoot.endRide', 'End ride')} destructive onCancel={() => setConfirmEnd(false)} onConfirm={() => void finish()} />}
            {error && <AlertDialog title={t('scoot.oops', 'Scoot')} message={error} hideCancel onCancel={() => setError(null)} onConfirm={() => setError(null)} />}
            {receipt && <AlertDialog title={t('scoot.rideEnded', 'Ride ended')} message={t('scoot.receipt', '{plate} · {minutes} min · {currency}{cost}{unpaid}', { plate: receipt.plate, minutes: receipt.minutes, currency, cost: receipt.cost, unpaid: receipt.paid ? '' : ` (${t('scoot.unpaid', 'unpaid')})` }) + (receipt.docked ? ` · ${t('scoot.dockedAt', 'docked at {name}', { name: receipt.docked })}` : '')} hideCancel onCancel={() => setReceipt(null)} onConfirm={() => setReceipt(null)} />}
        </div>
    );
}
