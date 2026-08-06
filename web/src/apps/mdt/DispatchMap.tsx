import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Crosshair, Map as MapIcon } from 'lucide-react';

import { t } from '@/i18n';
import { relTimeCompact } from '@/lib/time';
import { EmptyState } from '@/ui/EmptyState';
import { MapView, usePinStyle, type MapViewHandle } from '@/apps/maps/MapView';

import { MdtButton } from './ui/MdtButton';
import { unitCodeLabel } from './UnitsColumn';

import type { Call, MapPoint, Unit } from './data';

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
            {open ? (
                <MarkerCard>
                    <div className="flex items-center gap-1.5">
                        <span
                            className="shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wide text-white"
                            style={{ backgroundColor: tint }}
                        >
                            {t('mdt.priorityShort', 'P{n}', { n: call.priority })}
                        </span>
                        <span className="text-[12px] font-bold uppercase tracking-wide tabular-nums text-ios-gray">
                            {call.code}
                        </span>
                        <span className="flex-1" />
                        <span className="shrink-0 text-[11px] font-medium text-ios-gray">
                            {relTimeCompact(call.createdAt * 1000)}
                        </span>
                    </div>
                    <div className="mt-1 text-[15px] font-semibold leading-tight text-black dark:text-white">
                        {call.type}
                    </div>
                    <div className="mt-0.5 text-[12px] leading-snug text-ios-gray">{call.location}</div>
                    <div className="mt-0.5 text-[12px] font-medium text-ios-gray">
                        {t('mdt.unitsAttached', '{n} units', { n: call.unitCount })}
                    </div>
                    <div className="mt-2.5 flex items-center gap-x-2">
                        {canAttach && (
                            <MdtButton size="sm" variant="filled" className="min-w-[68px]" disabled={busy} onClick={() => onAttach(!attached)}>
                                {attached ? t('mdt.detach', 'Detach') : t('mdt.attach', 'Attach')}
                            </MdtButton>
                        )}
                        <MdtButton size="sm" variant="text" disabled={!call.hasCoords} onClick={onWaypoint}>
                            {t('mdt.waypointShort', 'Waypoint')}
                        </MdtButton>
                        <MdtButton size="sm" variant="text" onClick={onOpen}>
                            {t('mdt.openCall', 'Open')}
                        </MdtButton>
                    </div>
                </MarkerCard>
            ) : hovered && (
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
            {open ? (
                <MarkerCard>
                    <div className="flex items-center gap-1.5">
                        <span
                            className="shrink-0 rounded-full px-1.5 py-[1px] text-[10px] font-bold uppercase tracking-wide tabular-nums text-white"
                            style={{ backgroundColor: tint }}
                        >
                            {unit.callsign || '--'}
                        </span>
                        <span className="truncate text-[11px] font-medium text-ios-gray">
                            {unitCodeLabel(unit.code)}
                        </span>
                    </div>
                    <div className="mt-1 truncate text-[15px] font-semibold leading-tight text-black dark:text-white">
                        {unit.name}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-ios-gray">{unit.rank}</div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <MdtButton size="sm" variant="filled" onClick={onWaypoint}>
                            {t('mdt.setWaypoint', 'Set waypoint')}
                        </MdtButton>
                    </div>
                </MarkerCard>
            ) : hovered && (
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
    calls, units, selectedCall, selectedUnit, onSelectCall, onSelectUnit,
    myCallsign, canAttach, busy, onAttach, onWaypointCall, onWaypointUnit,
}: {
    calls:          Call[];
    units:          Unit[];
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

    return (
        <div className="relative min-h-0 flex-1 overflow-hidden">
            <MapView
                ref={mapRef}
                fitTo={initialFrame ?? undefined}
                centerTo={focus ?? undefined}
                chromeBottom={LEGEND_CLEARANCE}
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

            <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 rounded-[10px] bg-black/60 px-3 py-[7px] backdrop-blur-[2px]">
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
                <div className="rounded-[10px] bg-black/60 px-3 py-[7px] text-[10.5px] font-semibold tabular-nums tracking-wide text-white/75 backdrop-blur-[2px]">
                    {t('mdt.mapCounts', '{c} calls · {u} units', { c: plottedCalls.length, u: plottedUnits.length })}
                </div>
            </div>
        </div>
    );
}
