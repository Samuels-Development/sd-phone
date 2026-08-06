import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Briefcase, Clock, Crosshair, Home as HomeIcon, MapPin, Search } from 'lucide-react';

import { useSessionState } from '@/hooks/useSessionState';
import { AlertDialog } from '@/ui/AlertDialog';
import { Sheet } from '@/ui/Sheet';
import { t } from '@/i18n';
import { useRyde } from '../store';
import { getDefaultPickup, newId } from '../data';
import type { Place } from '../data';
import { rydeZoneName, useRydeLocations } from '../rydeApi';
import { LiveDot, useSelfLocation } from '@/apps/maps/LiveDot';
import { DropoffPin, MapView, Pin } from '../ui';

export function Home() {
    const g = useRyde();
    const locations = useRydeLocations();
    const defaultPickup = getDefaultPickup();
    const me = useSelfLocation({ x: defaultPickup.x, y: defaultPickup.y, h: 0 });
    const pickup: Place = me ? { ...defaultPickup, x: me.x, y: me.y } : defaultPickup;
    const [centerOn, setCenterOn] = useState<{ x: number; y: number } | null>(null);
    useEffect(() => { if (me && !centerOn) setCenterOn({ x: me.x, y: me.y }); }, [me, centerOn]);
    const [dropoff, setDropoff] = useSessionState<Place | null>('ryde:dropoff', null);
    const [picking, setPicking] = useState(false);
    const [placingDrop, setPlacingDrop] = useState(false);
    const [sheetOpen, setSheetOpen] = useSessionState('ryde:sheetOpen', true);

    const grabberRef = useRef<HTMLButtonElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const [grabberH, setGrabberH] = useState(0);
    const [bodyH, setBodyH] = useState(0);

    const recents = useMemo(() => {
        const seen = new Set<string>(); const out: Place[] = [];
        for (const r of g.rides) { if (r.role === 'rider' && !seen.has(r.dropoff.id)) { seen.add(r.dropoff.id); out.push(r.dropoff); } if (out.length >= 3) break; }
        return out;
    }, [g.rides]);

    function confirm() {
        if (!dropoff) return;
        g.requestRide(pickup, dropoff);
        setDropoff(null);
    }

    function pickOnMap() {
        setPicking(false);
        setPlacingDrop(true);
    }
    async function onPlaceDrop(x: number, y: number) {
        setPlacingDrop(false);
        const place: Place = { id: newId('drop'), name: t('ryde.pinnedLocation', 'Pinned location'), sub: t('ryde.customLocation', 'Custom location'), x, y };
        setDropoff(place);
        const name = await rydeZoneName(x, y);
        setDropoff({ ...place, name });
    }

    const idle = !dropoff && !placingDrop;

    useLayoutEffect(() => {
        const measure = () => {
            if (grabberRef.current) setGrabberH(grabberRef.current.offsetHeight);
            if (bodyRef.current) setBodyH(bodyRef.current.offsetHeight);
        };
        measure();
        const ro = new ResizeObserver(measure);
        if (grabberRef.current) ro.observe(grabberRef.current);
        if (bodyRef.current) ro.observe(bodyRef.current);
        return () => ro.disconnect();
    }, [idle]);

    const sheetH = (sheetOpen ? grabberH + bodyH : grabberH) + 2;

    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <div className="flex shrink-0 items-center px-5 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <h1 className="text-[28px] font-extrabold tracking-tight text-black dark:text-white">Ryde</h1>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <MapView
                    chromeTop="12px"
                    chromeBottom={idle ? `${sheetH + 8}px` : '24px'}
                    insetBottom={idle ? sheetH : 24}
                    centerTo={centerOn ?? undefined}
                    placing={placingDrop}
                    onPlace={(x, y) => onPlaceDrop(x, y)}
                >
                    {me && <LiveDot x={me.x} y={me.y} heading={me.h} />}
                    {dropoff && <Pin x={dropoff.x} y={dropoff.y}><DropoffPin /></Pin>}
                </MapView>

                {placingDrop && (
                    <>
                        <div className="pointer-events-none absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/80 px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-lg">
                            <MapPin className="h-[14px] w-[14px] shrink-0" strokeWidth={2.6} /> {t('ryde.tapToSetDestination', 'Tap to set your destination')}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 z-40 flex justify-center" style={{ paddingBottom: 'calc(var(--safe-bottom) + 12px)' }}>
                            <button
                                onClick={() => setPlacingDrop(false)}
                                className="rounded-full bg-elevated px-8 py-3 text-[15px] font-bold text-black shadow-lg active:opacity-80 dark:bg-surface dark:text-white"
                            >
                                {t('ryde.cancel', 'Cancel')}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {idle && (
                <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-[16px] border-t border-black/[0.06] bg-surface shadow-[0_-6px_24px_rgba(0,0,0,0.12)] dark:border-white/10">
                    <button
                        ref={grabberRef}
                        type="button"
                        onClick={() => setSheetOpen(!sheetOpen)}
                        aria-label={sheetOpen ? t('ryde.collapse', 'Collapse') : t('ryde.expand', 'Expand')}
                        className="flex w-full justify-center pb-1 pt-2.5"
                    >
                        <div className="h-[5px] w-9 rounded-full bg-black/20 dark:bg-white/25" />
                    </button>

                    <div
                        className="overflow-hidden transition-[max-height] duration-300"
                        style={{ maxHeight: sheetOpen ? 360 : 0, transitionTimingFunction: 'cubic-bezier(0.22,0.61,0.36,1)' }}
                    >
                        <div ref={bodyRef} className="px-4 pb-4 pt-1">
                            <button onClick={() => setPicking(true)} className="mb-3 flex w-full items-center gap-3 rounded-full bg-black/[0.07] px-5 py-[15px] active:bg-black/10 dark:bg-white/10 dark:active:bg-white/15">
                                <Search className="h-[24px] w-[24px] shrink-0 text-black dark:text-white" strokeWidth={2.6} />
                                <span className="flex-1 text-left text-[21px] font-bold tracking-tight text-black/85 dark:text-white/90">{t('ryde.whereTo', 'Where to?')}</span>
                            </button>

                            <div className="no-scrollbar overflow-y-auto" style={{ maxHeight: 252 }}>
                                <button onClick={pickOnMap} className="flex w-full items-center gap-3.5 rounded-xl px-1 py-3 text-left active:bg-black/5 dark:active:bg-white/5">
                                    <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-black/[0.07] text-black dark:bg-white/10 dark:text-white"><Crosshair className="h-[24px] w-[24px]" /></span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-[18px] font-semibold text-black dark:text-white">{t('ryde.setLocationOnMap', 'Set location on map')}</span>
                                        <span className="block truncate text-[15px] text-ios-gray">{t('ryde.tapAnywhereDropPin', 'Tap anywhere to drop a pin')}</span>
                                    </span>
                                </button>
                                {g.state.home && <Saved icon={<HomeIcon className="h-[24px] w-[24px]" />} place={g.state.home} onPick={p => { setDropoff(p); }} />}
                                {g.state.work && <Saved icon={<Briefcase className="h-[24px] w-[24px]" />} place={g.state.work} onPick={p => { setDropoff(p); }} />}
                                {recents.map(p => <Saved key={p.id} icon={<Clock className="h-[24px] w-[24px]" />} place={p} onPick={x => setDropoff(x)} />)}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {picking && (
                <Sheet title={t('ryde.whereTo', 'Where to?')} onClose={() => setPicking(false)} fit="content" className="bg-surface px-5 pt-3">
                    {() => (
                        <>
                            <div className="mb-3 flex items-center gap-2.5 rounded-[12px] bg-black/[0.07] px-3.5 dark:bg-white/10">
                                <span className="h-3 w-3 shrink-0 rounded-full bg-[#22c55e]" />
                                <span className="truncate py-3 text-[16px] font-medium text-black dark:text-white">{pickup.name}</span>
                            </div>
                            <div>
                                <PickRow
                                    onClick={pickOnMap}
                                    icon={<Crosshair className="h-[24px] w-[24px]" />}
                                    iconClass="text-black dark:text-white"
                                    name={t('ryde.setLocationOnMap', 'Set location on map')}
                                    sub={t('ryde.tapAnywhereDropPin', 'Tap anywhere to drop a pin')}
                                    divider
                                />
                                {locations.map((p, i) => (
                                    <PickRow
                                        key={p.id}
                                        onClick={() => { setDropoff(p); setPicking(false); }}
                                        icon={<MapPin className="h-[24px] w-[24px]" />}
                                        iconClass="text-black/70 dark:text-white/80"
                                        name={p.name}
                                        sub={p.sub}
                                        divider={i < locations.length - 1}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </Sheet>
            )}

            {dropoff && (
                <AlertDialog
                    title={t('ryde.requestARide', 'Request a ride?')}
                    message={t('ryde.requestRideMessage', 'A nearby driver will be asked to take you to {name}, then offer a fare you can accept.', { name: dropoff.name })}
                    confirmLabel={t('ryde.requestRide', 'Request ride')}
                    onCancel={() => setDropoff(null)}
                    onConfirm={confirm}
                />
            )}
        </div>
    );
}

function PickRow({ onClick, icon, iconClass, name, sub, divider }: {
    onClick: () => void; icon: React.ReactNode; iconClass: string; name: string; sub: string; divider?: boolean;
}) {
    return (
        <div className="relative">
            <button onClick={onClick} className="flex w-full items-center gap-3.5 rounded-xl px-1 py-3 text-left active:bg-black/5 dark:active:bg-white/5">
                <span className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-black/[0.07] dark:bg-white/10 ${iconClass}`}>{icon}</span>
                <span className="min-w-0">
                    <span className="block truncate text-[18px] font-semibold text-black dark:text-white">{name}</span>
                    <span className="block truncate text-[15px] text-ios-gray">{sub}</span>
                </span>
            </button>
            {divider && <div className="absolute bottom-0 left-1 right-0 h-px bg-black/[0.07] dark:bg-white/[0.08]" />}
        </div>
    );
}

function Saved({ icon, place, onPick }: { icon: React.ReactNode; place: Place; onPick: (p: Place) => void }) {
    return (
        <button onClick={() => onPick(place)} className="flex w-full items-center gap-3.5 rounded-xl px-1 py-3 text-left active:bg-black/5 dark:active:bg-white/5">
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-black/[0.07] text-black/70 dark:bg-white/10 dark:text-white/80">{icon}</span>
            <span className="min-w-0">
                <span className="block truncate text-[18px] font-semibold text-black dark:text-white">{place.name}</span>
                <span className="block truncate text-[15px] text-ios-gray">{place.sub}</span>
            </span>
        </button>
    );
}
