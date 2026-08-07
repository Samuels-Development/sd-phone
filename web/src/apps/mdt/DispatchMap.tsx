import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Crosshair, Map as MapIcon } from 'lucide-react';

import { device } from '@device';
import { t } from '@/i18n';
import { relTimeCompact } from '@/lib/time';
import { EmptyState } from '@/ui/EmptyState';
import { Sheet } from '@/ui/Sheet';
import { MapView, usePinStyle, type MapViewHandle } from '@/apps/maps/MapView';

import { MdtButton } from './ui/MdtButton';
import { unitCodeLabel } from './UnitsColumn';

import type { Call, MapPoint, Unit } from './data';

const isPhone = device.id === 'phone';

const CALL_TINT: Record<number, string> = {
    1: '#FF3B30',
    2: '#FF9500',
    3: 'rgb(var(--ios-blue))',
    4: '#8E8E93',
};

const CODE_TINT: Record<string, string> = {
    '10-8':  '#34C759',
    '10-6':  '#FF9500',
    '10-7':  '#FF3B30',
    '10-90': 'rgb(var(--ios-blue))',
};

const LEGEND_CLEARANCE = '47px';
const LEGEND_CLEARANCE_PHONE = '58px';

const legendPill = 'flex items-center rounded-[10px] bg-black/75 px-3 py-[7px]';

function MarkerTip({ title, meta }: { title: string; meta: string }) {
    return (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 w-max max-w-[200px] -translate-x-1/2 rounded-[8px] bg-black/80 px-2 py-[5px] text-center shadow-[0_2px_10px_rgba(0,0,0,0.32)]">
            <div className="truncate text-[11.5px] font-bold leading-tight text-white">{title}</div>
            <div className="truncate text-[10.5px] font-medium leading-tight text-white/70">{meta}</div>
        </div>
    );
}

function MarkerCard({ children }: { children: ReactNode }) {
    return (
        <div
            style={{ pointerEvents: 'auto' }}
            onPointerDown={e => e.stopPropagation()}
            onPointerMove={e => e.stopPropagation()}
            onPointerUp={e => e.stopPropagation()}
            className="absolute bottom-full left-1/2 mb-2 w-[236px] -translate-x-1/2 cursor-default rounded-[13px] bg-elevated p-3 text-left shadow-[0_10px_34px_rgba(0,0,0,0.26)] ring-1 ring-black/[0.08] dark:ring-white/[0.10]"
        >
            {children}
        </div>
    );
}

function CallCardBody({ call, phone, canAttach, attached, busy, onAttach, onWaypoint, onOpen }: {
    call:       Call;
    phone:      boolean;
    canAttach:  boolean;
    attached:   boolean;
    busy:       boolean;
    onAttach:   (on: boolean) => void;
    onWaypoint: () => void;
    onOpen:     () => void;
}) {
    const tint = CALL_TINT[call.priority] ?? CALL_TINT[4];

    return (
        <>
            <div className="flex items-center gap-1.5">
                <span
                    className={`shrink-0 rounded-full px-1.5 py-[1px] font-bold uppercase tracking-wide text-white ${phone ? 'text-[11px]' : 'text-[10px]'}`}
                    style={{ backgroundColor: tint }}
                >
                    {t('mdt.priorityShort', 'P{n}', { n: call.priority })}
                </span>
                <span className={`font-bold uppercase tracking-wide tabular-nums text-ios-gray ${phone ? 'text-[13px]' : 'text-[12px]'}`}>
                    {call.code}
                </span>
                <span className="flex-1" />
                <span className={`shrink-0 font-medium text-ios-gray ${phone ? 'text-[12px]' : 'text-[11px]'}`}>
                    {relTimeCompact(call.createdAt * 1000)}
                </span>
            </div>
            <div className={`mt-1 font-semibold leading-tight text-black dark:text-white ${phone ? 'text-[19px]' : 'text-[15px]'}`}>
                {call.type}
            </div>
            <div className={`mt-0.5 leading-snug text-ios-gray ${phone ? 'text-[14px]' : 'text-[12px]'}`}>{call.location}</div>
            <div className={`mt-0.5 font-medium text-ios-gray ${phone ? 'text-[13px]' : 'text-[12px]'}`}>
                {t('mdt.unitsAttached', '{n} units', { n: call.unitCount })}
            </div>
            <div className={`flex items-center ${phone ? 'mt-4 gap-3' : 'mt-2.5 gap-x-2'}`}>
                {canAttach && (
                    <MdtButton
                        size={phone ? 'md' : 'sm'}
                        variant="filled"
                        className={phone ? 'min-w-[96px]' : 'min-w-[68px]'}
                        disabled={busy}
                        onClick={() => onAttach(!attached)}
                    >
                        {attached ? t('mdt.detach', 'Detach') : t('mdt.attach', 'Attach')}
                    </MdtButton>
                )}
                <MdtButton size={phone ? 'md' : 'sm'} variant="text" disabled={!call.hasCoords} onClick={onWaypoint}>
                    {t('mdt.waypointShort', 'Waypoint')}
                </MdtButton>
                <MdtButton size={phone ? 'md' : 'sm'} variant="text" onClick={onOpen}>
                    {t('mdt.openCall', 'Open')}
                </MdtButton>
            </div>
        </>
    );
}

function UnitCardBody({ unit, phone, onWaypoint }: {
    unit:       Unit;
    phone:      boolean;
    onWaypoint: () => void;
}) {
    const tint = CODE_TINT[unit.code] ?? CODE_TINT['10-8'];

    return (
        <>
            <div className="flex items-center gap-1.5">
                <span
                    className={`shrink-0 rounded-full px-1.5 py-[1px] font-bold uppercase tracking-wide tabular-nums text-white ${phone ? 'text-[11px]' : 'text-[10px]'}`}
                    style={{ backgroundColor: tint }}
                >
                    {unit.callsign || '--'}
                </span>
                <span className={`truncate font-medium text-ios-gray ${phone ? 'text-[12px]' : 'text-[11px]'}`}>
                    {unitCodeLabel(unit.code)}
                </span>
            </div>
            <div className={`mt-1 truncate font-semibold leading-tight text-black dark:text-white ${phone ? 'text-[19px]' : 'text-[15px]'}`}>
                {unit.name}
            </div>
            <div className={`mt-0.5 truncate text-ios-gray ${phone ? 'text-[14px]' : 'text-[12px]'}`}>{unit.rank}</div>
            <div className={`flex flex-wrap items-center gap-y-1 ${phone ? 'mt-4 gap-x-3' : 'mt-2.5 gap-x-2'}`}>
                <MdtButton size={phone ? 'md' : 'sm'} variant="filled" onClick={onWaypoint}>
                    {t('mdt.setWaypoint', 'Set waypoint')}
                </MdtButton>
            </div>
        </>
    );
}

const pinHit = {
    style:         { pointerEvents: 'auto' as const, cursor: 'pointer' as const },
    onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
    onPointerMove: (e: ReactPointerEvent) => e.stopPropagation(),
    onPointerUp:   (e: ReactPointerEvent) => e.stopPropagation(),
};

function CallPin({ call, selected, open, hovered, onHover, onToggle, canAttach, attached, busy, onAttach, onWaypoint, onOpen }: {
    call:       Call;
    selected:   boolean;
    open:       boolean;
    hovered:    boolean;
    onHover:    (on: boolean) => void;
    onToggle:   () => void;
    canAttach:  boolean;
    attached:   boolean;
    busy:       boolean;
    onAttach:   (on: boolean) => void;
    onWaypoint: () => void;
    onOpen:     () => void;
}) {
    const style = usePinStyle(call.coords!.x, call.coords!.y);
    const tint = CALL_TINT[call.priority] ?? CALL_TINT[4];

    return (
        <div
            style={{ ...style, zIndex: open ? 60 : selected ? 30 : 20, pointerEvents: 'none' }}
            className="flex flex-col items-center"
        >
            {open ? (!isPhone && (
                <MarkerCard>
                    <CallCardBody
                        call={call}
                        phone={false}
                        canAttach={canAttach}
                        attached={attached}
                        busy={busy}
                        onAttach={onAttach}
                        onWaypoint={onWaypoint}
                        onOpen={onOpen}
                    />
                </MarkerCard>
            )) : hovered && (
                <MarkerTip title={call.type} meta={call.location} />
            )}

            <button
                type="button"
                onClick={onToggle}
                onMouseEnter={() => onHover(true)}
                onMouseLeave={() => onHover(false)}
                {...pinHit}
                className="flex flex-col items-center"
                aria-label={`${call.code} ${call.location}`}
            >
                <span
                    className={`flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-bold uppercase tracking-wide text-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] ring-1 ring-black/10 transition-transform duration-150 ${
                        open || selected ? 'scale-110' : ''
                    }`}
                    style={{ backgroundColor: tint }}
                >
                    {call.code}
                </span>
                <span
                    className="mt-[-1px] h-[9px] w-[2px] rounded-full"
                    style={{ backgroundColor: tint }}
                />
                {(open || selected) && (
                    <span
                        className="absolute -z-10 h-[42px] w-[42px] rounded-full opacity-30"
                        style={{ backgroundColor: tint }}
                    />
                )}
            </button>
        </div>
    );
}

function UnitPin({ unit, selected, open, hovered, onHover, onToggle, onWaypoint }: {
    unit:       Unit;
    selected:   boolean;
    open:       boolean;
    hovered:    boolean;
    onHover:    (on: boolean) => void;
    onToggle:   () => void;
    onWaypoint: () => void;
}) {
    const style = usePinStyle(unit.coords!.x, unit.coords!.y);
    const tint = CODE_TINT[unit.code] ?? CODE_TINT['10-8'];

    return (
        <div
            style={{ ...style, zIndex: open ? 59 : selected ? 29 : 15, pointerEvents: 'none' }}
            className="flex flex-col items-center"
        >
            {open ? (!isPhone && (
                <MarkerCard>
                    <UnitCardBody unit={unit} phone={false} onWaypoint={onWaypoint} />
                </MarkerCard>
            )) : hovered && (
                <MarkerTip title={unit.name} meta={`${unit.callsign || '--'} · ${unitCodeLabel(unit.code)}`} />
            )}

            <button
                type="button"
                onClick={onToggle}
                onMouseEnter={() => onHover(true)}
                onMouseLeave={() => onHover(false)}
                {...pinHit}
                className="flex flex-col items-center"
                aria-label={`${unit.callsign} ${unitCodeLabel(unit.code)}`}
            >
                <span
                    className={`h-[13px] w-[13px] rounded-full border-[2.5px] border-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform duration-150 ${
                        open || selected ? 'scale-125' : ''
                    }`}
                    style={{ backgroundColor: tint }}
                />
                <span className="mt-0.5 rounded-[5px] bg-black/65 px-1.5 py-[1px] text-[10px] font-bold tabular-nums tracking-wide text-white">
                    {unit.callsign || '--'}
                </span>
            </button>
        </div>
    );
}

export function DispatchMap({
    calls, units, accent, selectedCall, selectedUnit, onSelectCall, onSelectUnit,
    myCallsign, canAttach, busy, onAttach, onWaypointCall, onWaypointUnit,
}: {
    calls:          Call[];
    units:          Unit[];
    accent:         string;
    selectedCall?:  string | null;
    selectedUnit?:  string | null;
    onSelectCall:   (id: string) => void;
    onSelectUnit:   (citizenid: string) => void;
    myCallsign:     string;
    canAttach:      boolean;
    busy:           boolean;
    onAttach:       (callId: string, on: boolean) => void;
    onWaypointCall: (callId: string) => void;
    onWaypointUnit: (citizenid: string) => void;
}) {
    const mapRef = useRef<MapViewHandle>(null);

    const [open, setOpen] = useState<string | null>(null);
    const [hover, setHover] = useState<string | null>(null);

    const plottedCalls = useMemo(() => calls.filter(c => c.coords), [calls]);
    const plottedUnits = useMemo(() => units.filter(u => u.coords), [units]);

    const points = useMemo<MapPoint[]>(
        () => [...plottedCalls, ...plottedUnits].map(p => p.coords!),
        [plottedCalls, plottedUnits],
    );

    const focus = useMemo(() => {
        const call = selectedCall ? plottedCalls.find(c => c.id === selectedCall) : undefined;
        if (call) return call.coords;
        const unit = selectedUnit ? plottedUnits.find(u => u.citizenid === selectedUnit) : undefined;
        return unit?.coords;
    }, [selectedCall, selectedUnit, plottedCalls, plottedUnits]);

    const framed = useRef<MapPoint[] | null>(null);
    if (!framed.current && points.length > 0) framed.current = points;
    const initialFrame = framed.current;

    if (points.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 items-center justify-center px-10">
                <EmptyState
                    center
                    icon={MapIcon}
                    title={t('mdt.mapEmpty', 'Nothing to plot')}
                    subtitle={t('mdt.mapEmptySub', 'Calls and units appear here as soon as one is on the board with a location.')}
                />
            </div>
        );
    }

    const sheetCall = isPhone && open ? plottedCalls.find(c => `c:${c.id}` === open) : undefined;
    const sheetUnit = isPhone && open ? plottedUnits.find(u => `u:${u.citizenid}` === open) : undefined;
    const sheetStyle = { '--mdt-accent': accent } as CSSProperties;

    return (
        <div className="relative min-h-0 flex-1 overflow-hidden">
            <MapView
                ref={mapRef}
                fitTo={initialFrame ?? undefined}
                centerTo={focus ?? undefined}
                chromeBottom={isPhone ? LEGEND_CLEARANCE_PHONE : LEGEND_CLEARANCE}
                onTapEmpty={() => setOpen(null)}
            >
                {plottedUnits.map(u => (
                    <UnitPin
                        key={u.citizenid}
                        unit={u}
                        selected={u.citizenid === selectedUnit}
                        open={open === `u:${u.citizenid}`}
                        hovered={hover === `u:${u.citizenid}`}
                        onHover={on => setHover(on ? `u:${u.citizenid}` : null)}
                        onToggle={() => {
                            const key = `u:${u.citizenid}`;
                            setOpen(cur => (cur === key ? null : key));
                            onSelectUnit(u.citizenid);
                        }}
                        onWaypoint={() => onWaypointUnit(u.citizenid)}
                    />
                ))}
                {plottedCalls.map(c => (
                    <CallPin
                        key={c.id}
                        call={c}
                        selected={c.id === selectedCall}
                        open={open === `c:${c.id}`}
                        hovered={hover === `c:${c.id}`}
                        onHover={on => setHover(on ? `c:${c.id}` : null)}
                        onToggle={() => {
                            const key = `c:${c.id}`;
                            setOpen(cur => (cur === key ? null : key));
                        }}
                        canAttach={canAttach}
                        attached={!!myCallsign && c.units.includes(myCallsign)}
                        busy={busy}
                        onAttach={on => onAttach(c.id, on)}
                        onWaypoint={() => onWaypointCall(c.id)}
                        onOpen={() => { setOpen(null); onSelectCall(c.id); }}
                    />
                ))}
            </MapView>

            <button
                type="button"
                onClick={() => mapRef.current?.fitWorld(points, 0.22)}
                aria-label={t('mdt.mapFit', 'Frame everything')}
                className="absolute left-3 top-3 z-40 flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[#efefef] text-ios-gray shadow-[0_1px_4px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.06] transition-colors duration-150 hover:bg-[#f6f6f6] hover:text-black active:bg-elevated dark:ring-white/[0.08] dark:hover:text-white"
            >
                <Crosshair className="h-[17px] w-[17px]" strokeWidth={2.2} />
            </button>

            <div className={`pointer-events-none absolute bottom-3 left-3 right-3 z-40 flex items-center justify-between ${
                isPhone ? 'flex-wrap gap-x-2 gap-y-1.5' : 'gap-3'
            }`}
            >
                <div className={`${legendPill} ${isPhone ? 'gap-2.5' : 'gap-3'}`}>
                    {(['10-8', '10-90', '10-6', '10-7'] as const).map(code => (
                        <span key={code} className="flex items-center gap-[5px]">
                            <span
                                className="h-[8px] w-[8px] shrink-0 rounded-full ring-1 ring-white/70"
                                style={{ backgroundColor: CODE_TINT[code] }}
                            />
                            <span className="text-[10.5px] font-semibold tabular-nums tracking-wide text-white/85">
                                {code}
                            </span>
                        </span>
                    ))}
                </div>
                <div className={`${legendPill} text-[10.5px] font-semibold tabular-nums tracking-wide text-white/75`}>
                    {t('mdt.mapCounts', '{c} calls · {u} units', { c: plottedCalls.length, u: plottedUnits.length })}
                </div>
            </div>

            {sheetCall && (
                <Sheet
                    onClose={() => setOpen(null)}
                    fit="content"
                    dim={false}
                    durationMs={240}
                    className="bg-surface shadow-[0_-8px_30px_rgba(0,0,0,0.22)]"
                >
                    {({ close }) => (
                        <div className="px-5 pb-2 pt-1" style={sheetStyle}>
                            <CallCardBody
                                call={sheetCall}
                                phone
                                canAttach={canAttach}
                                attached={!!myCallsign && sheetCall.units.includes(myCallsign)}
                                busy={busy}
                                onAttach={on => onAttach(sheetCall.id, on)}
                                onWaypoint={() => onWaypointCall(sheetCall.id)}
                                onOpen={() => { onSelectCall(sheetCall.id); close(); }}
                            />
                        </div>
                    )}
                </Sheet>
            )}

            {sheetUnit && (
                <Sheet
                    onClose={() => setOpen(null)}
                    fit="content"
                    dim={false}
                    durationMs={240}
                    className="bg-surface shadow-[0_-8px_30px_rgba(0,0,0,0.22)]"
                >
                    {() => (
                        <div className="px-5 pb-2 pt-1" style={sheetStyle}>
                            <UnitCardBody
                                unit={sheetUnit}
                                phone
                                onWaypoint={() => onWaypointUnit(sheetUnit.citizenid)}
                            />
                        </div>
                    )}
                </Sheet>
            )}
        </div>
    );
}
