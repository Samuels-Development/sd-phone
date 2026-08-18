import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MapPin, RadioTower, Siren, X } from 'lucide-react';

import { device } from '@device';
import { t } from '@/i18n';
import { relTimeCompact } from '@/lib/time';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { NavBar } from '@/ui/NavBar';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { useIosPush } from '@/hooks/useIosPush';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { UNIT_CODES, type Call, type Unit, type UnitCode } from './data';
import { DispatchMap } from './DispatchMap';
import { LocationMapPreview } from '@/shared/map/LocationMapPreview';
import {
    MDT_ACCENT, mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtRuleX, mdtSectionHeader, mdtSegmented,
} from './mdtTheme';
import {
    mdtAttach, mdtDetach, mdtDispatchState, mdtLocate, mdtSetStatus, mdtSetWaypoint,
} from './mdtApi';
import { MdtButton } from './ui/MdtButton';
import { UnitRow, unitCodeLabel, waypointToUnit } from './UnitsColumn';
import { useDeckRefresh, useMdtSession } from './useMdtSession';

const FLASH_MS = 6000;

const PREVIEW_H = 150;
const PREVIEW_W_FALLBACK = 320;

const isPhone = device.id === 'phone';

type PhoneBoard = 'calls' | 'map' | 'units';

function PriorityChip({ priority }: { priority: number }) {
    const label = t('mdt.priorityShort', 'P{n}', { n: priority });
    if (priority <= 1) return <Pill tone="red">{label}</Pill>;
    if (priority === 2) return <Pill tone="orange">{label}</Pill>;
    if (priority === 3) return <Pill tone="blue">{label}</Pill>;
    return (
        <span className="inline-flex shrink-0 items-center rounded-full bg-black/[0.08] px-2.5 py-[3px] text-[13px] font-bold uppercase tracking-wide text-ios-gray dark:bg-white/10">
            {label}
        </span>
    );
}

function Field({ label, value }: { label: string; value?: string }) {
    return (
        <div className="min-w-0">
            <div className={mdtSectionHeader}>{label}</div>
            <div className="mt-0.5 text-[15px] leading-snug text-black dark:text-white">
                {value && value.trim() ? value : t('mdt.notReported', 'Not reported')}
            </div>
        </div>
    );
}

function CallPage({ backLabel, onBack, children }: {
    backLabel: string;
    onBack:    () => void;
    children:  ReactNode;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    return (
        <div className="absolute inset-0 z-20 flex flex-col bg-base" style={pageStyle}>
            <NavBar backLabel={backLabel} onBack={goBack} />
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
    );
}

export function DispatchPane() {
    const { me, can, department, selected, select } = useMdtSession();

    const [units, setUnits] = useState<Unit[]>([]);
    const [calls, setCalls] = useState<Call[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [flashId, setFlashId] = useState<string | null>(null);
    const [notice, setNotice] = useState('');
    const [board, setBoard] = useSessionState<'map' | 'units'>('mdt:dispatch:board', 'map');
    const [phoneBoard, setPhoneBoard] = useSessionState<PhoneBoard>('mdt:dispatch:phoneBoard', 'calls');
    const [focusUnit, setFocusUnit] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        const state = await mdtDispatchState();
        setUnits(state.units);
        setCalls(state.calls);
        setLoaded(true);
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);
    useDeckRefresh(() => { void refresh(); });

    useNuiEvent('sd-phone:mdt:dispatch', useCallback(data => {
        setUnits(data.units);
        setCalls(data.calls);
        setLoaded(true);
    }, []));

    useNuiEvent('sd-phone:mdt:call', useCallback(data => {
        const id = data.call.id;
        setFlashId(id);
        window.setTimeout(() => setFlashId(current => (current === id ? null : current)), FLASH_MS);
    }, []));

    const myUnit = useMemo(
        () => units.find(u => u.citizenid === me?.citizenid) ?? null,
        [units, me?.citizenid],
    );
    const myCode: UnitCode = myUnit?.code ?? '10-8';
    const myCallsign = myUnit?.callsign ?? me?.callsign ?? '';

    const current = useMemo(
        () => calls.find(c => c.id === selected) ?? null,
        [calls, selected],
    );

    const attached = !!current && !!myCallsign && current.units.includes(myCallsign);

    const attachedUnits = useMemo(
        () => (current ? units.filter(u => current.units.includes(u.callsign)) : []),
        [current, units],
    );

    const setCode = useCallback(async (code: UnitCode) => {
        if (!can('dispatch.status')) return;
        setBusy(true);
        setNotice('');
        const unit = await mdtSetStatus(code);
        setBusy(false);
        if (!unit) {
            setNotice(t('mdt.statusRefused', 'Dispatch did not accept that status.'));
            return;
        }
        void refresh();
    }, [can, refresh]);

    const toggleAttach = useCallback(async (callId: string, on: boolean) => {
        setBusy(true);
        setNotice('');
        const call = on ? await mdtAttach(callId) : await mdtDetach(callId);
        setBusy(false);
        if (!call) {
            setNotice(t('mdt.attachRefused', 'That call is no longer active.'));
            return;
        }
        void refresh();
    }, [refresh]);

    const [previewCoords, setPreviewCoords] = useState<{ x: number; y: number } | null>(null);
    const coordCache = useRef<Record<string, { x: number; y: number } | null>>({});
    const previewRef = useRef<HTMLButtonElement | null>(null);
    const [previewW, setPreviewW] = useState(PREVIEW_W_FALLBACK);

    useEffect(() => {
        const el = previewRef.current;
        if (!el) return;
        const apply = () => setPreviewW(el.offsetWidth || PREVIEW_W_FALLBACK);
        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(el);
        return () => ro.disconnect();
    }, [previewCoords]);

    useEffect(() => {
        const call = current;
        if (!call || !call.hasCoords) { setPreviewCoords(null); return; }

        const cached = coordCache.current[call.id];
        if (cached !== undefined) { setPreviewCoords(cached); return; }

        let live = true;
        setPreviewCoords(null);
        void mdtLocate({ callId: call.id }).then(coords => {
            const point = coords ? { x: coords.x, y: coords.y } : null;
            coordCache.current[call.id] = point;
            if (live) setPreviewCoords(point);
        }).catch(() => { coordCache.current[call.id] = null; });
        return () => { live = false; };
    }, [current]);

    const waypointToCall = useCallback(async (callId: string) => {
        const coords = await mdtLocate({ callId });
        if (!coords) {
            setNotice(t('mdt.noCoords', 'That call has no coordinates attached.'));
            return;
        }
        await mdtSetWaypoint(coords);
        setNotice(t('mdt.waypointSet', 'Waypoint set.'));
    }, []);

    const listMinWidth = isPhone ? 0 : undefined;

    const master = (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className={`shrink-0 px-4 pb-3 ${isPhone ? 'pt-2' : 'pt-4'}`}>
                <div className={mdtSectionHeader}>{t('mdt.myStatus', 'My status')}</div>
                <SegmentedControl
                    className="mt-2"
                    value={myCode}
                    onChange={code => { void setCode(code); }}
                    disabled={!can('dispatch.status')}
                    options={UNIT_CODES.map(c => ({ value: c, label: c }))}
                />
                <div className={`mt-2 ${mdtRowMeta}`}>{unitCodeLabel(myCode)}</div>
                {isPhone && notice && <div className={`mt-2 ${mdtRowMeta}`}>{notice}</div>}
            </div>

            <div className={mdtRuleX} />

            <ListColumn
                className="min-h-0 flex-1"
                minWidth={listMinWidth}
                title={t('mdt.activeCalls', 'Active Calls')}
                count={calls.length || undefined}
                isEmpty={loaded && calls.length === 0}
                empty={(
                    <EmptyState
                        center
                        icon={Siren}
                        title={t('mdt.noCalls', 'No Active Calls')}
                        subtitle={t('mdt.noCallsSub', 'The queue is clear. New calls land here the moment they are dispatched.')}
                    />
                )}
            >
                {calls.map((c, i) => (
                    <button
                        key={c.id}
                        type="button"
                        onClick={() => select(c.id)}
                        className={`relative w-full px-4 py-3 text-left transition-colors ${
                            c.id === selected
                                ? 'bg-ios-blue/10'
                                : c.id === flashId
                                    ? 'bg-ios-red/10'
                                    : mdtRowHover
                        }`}
                    >
                        <div className="flex min-w-0 items-center gap-2">
                            <PriorityChip priority={c.priority} />
                            <span className={mdtRef}>{c.code}</span>
                            <span className="flex-1" />
                            <span className={`shrink-0 ${mdtRowMeta}`}>{relTimeCompact(c.createdAt * 1000)}</span>
                        </div>
                        <div className={`mt-1 truncate ${mdtRowTitle}`}>{c.type}</div>
                        <div className={`mt-0.5 flex min-w-0 items-center gap-1.5 ${mdtRowMeta}`}>
                            <span className="min-w-0 flex-1 truncate">{c.location}</span>
                            <span className="shrink-0 opacity-40">&bull;</span>
                            <span className="shrink-0 tabular-nums">
                                {t('mdt.unitsAttached', '{n} units', { n: c.unitCount })}
                            </span>
                        </div>
                        {i < calls.length - 1 && (
                            <span
                                className="pointer-events-none absolute inset-x-4 bottom-0 bg-ios-gray4 dark:bg-control"
                                style={{ height: '0.5px' }}
                            />
                        )}
                    </button>
                ))}
            </ListColumn>
        </div>
    );

    const unitsBoard = (
        <ListColumn
            className="min-h-0 flex-1"
            minWidth={listMinWidth}
            title={t('mdt.unitsOnAir', 'Units On Air')}
            count={units.length || undefined}
            isEmpty={loaded && units.length === 0}
            empty={(
                <EmptyState
                    center
                    icon={RadioTower}
                    title={t('mdt.noUnits', 'No Units On Duty')}
                    subtitle={t('mdt.noUnitsSub', 'Units appear here the moment an officer brings a terminal up.')}
                />
            )}
        >
            {units.map((u, i) => (
                <UnitRow
                    key={u.citizenid}
                    unit={u}
                    divider={i < units.length - 1}
                    onPress={() => { void waypointToUnit(u.citizenid); }}
                />
            ))}
        </ListColumn>
    );

    const mapBoard = (
        <DispatchMap
            calls={calls}
            units={units}
            accent={department?.accent ?? MDT_ACCENT}
            selectedCall={selected}
            selectedUnit={focusUnit}
            onSelectCall={id => select(id)}
            onSelectUnit={cid => setFocusUnit(cid === focusUnit ? null : cid)}
            myCallsign={myCallsign}
            canAttach={can('dispatch.attach')}
            busy={busy}
            onAttach={(callId, on) => { void toggleAttach(callId, on); }}
            onWaypointCall={callId => { void waypointToCall(callId); }}
            onWaypointUnit={cid => { void waypointToUnit(cid); }}
        />
    );

    const detail = current ? (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className={`shrink-0 pb-4 ${isPhone ? 'px-4 pt-1' : 'px-6 pt-5'}`}>
                <div className="flex flex-wrap items-center gap-2">
                    <PriorityChip priority={current.priority} />
                    <span className="text-[21px] font-bold tabular-nums tracking-tight text-black dark:text-white">
                        {current.code}
                    </span>
                    <span className="flex-1" />
                    <span className={mdtRowMeta}>{relTimeCompact(current.createdAt * 1000)}</span>
                    {!isPhone && (
                        <button
                            type="button"
                            onClick={() => select(null)}
                            aria-label={t('mdt.closeCall', 'Back to dispatch board')}
                            className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ios-gray transition-colors hover:text-black active:opacity-50 dark:hover:text-white"
                        >
                            <X className="h-[17px] w-[17px]" strokeWidth={2.5} />
                        </button>
                    )}
                </div>
                <h2 className="mt-1 text-[21px] font-bold leading-tight tracking-tight text-black dark:text-white">
                    {current.type}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2.5">
                    {can('dispatch.attach') && (
                        <MdtButton
                            variant="filled"
                            className="min-w-[88px]"
                            disabled={busy}
                            onClick={() => { void toggleAttach(current.id, !attached); }}
                        >
                            {attached ? t('mdt.detach', 'Detach') : t('mdt.attach', 'Attach')}
                        </MdtButton>
                    )}
                    <MdtButton
                        icon={<MapPin className="h-[15px] w-[15px]" strokeWidth={2.4} />}
                        disabled={!current.hasCoords}
                        onClick={() => { void waypointToCall(current.id); }}
                    >
                        {t('mdt.setWaypoint', 'Set waypoint')}
                    </MdtButton>
                    {notice && <span className={mdtRowMeta}>{notice}</span>}
                </div>
            </div>

            <div className={mdtRuleX} />

            <Scroller className={`min-h-0 flex-1 ${isPhone ? 'px-4 pb-10 pt-4' : 'px-6 py-4'}`}>
                {previewCoords && (
                    <button
                        ref={previewRef}
                        type="button"
                        onClick={() => { void waypointToCall(current.id); }}
                        aria-label={t('mdt.setWaypoint', 'Set waypoint')}
                        className="relative mb-4 block w-full overflow-hidden rounded-[14px] transition-opacity active:opacity-80"
                        style={{ height: PREVIEW_H, background: 'linear-gradient(145deg,#3a4a52,#2c3a42)' }}
                    >
                        <LocationMapPreview x={previewCoords.x} y={previewCoords.y} width={previewW} height={PREVIEW_H} />
                        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[100%]">
                            <MapPin className="h-7 w-7 drop-shadow-[0_1px_2px_rgba(0,0,0,.55)]" strokeWidth={2.4} fill={MDT_ACCENT} color="#fff" />
                        </span>
                    </button>
                )}

                <div className={`grid grid-cols-2 gap-y-4 ${isPhone ? 'gap-x-4' : 'gap-x-6'}`}>
                    <Field label={t('mdt.location', 'Location')} value={current.location} />
                    <Field label={t('mdt.direction', 'Direction')} value={current.direction} />
                    <Field label={t('mdt.suspect', 'Suspect')} value={current.suspect} />
                    <Field label={t('mdt.weapon', 'Weapon')} value={current.weapon} />
                </div>

                <div className={`mt-5 ${mdtSectionHeader}`}>
                    {t('mdt.attachedUnits', 'Attached units')}
                </div>
                {attachedUnits.length === 0 ? (
                    <p className={`mt-1.5 ${mdtRowMeta}`}>
                        {t('mdt.noAttachedUnits', 'No units attached yet.')}
                    </p>
                ) : (
                    <div className="-mx-4 mt-1">
                        {attachedUnits.map((u, i) => (
                            <UnitRow
                                key={u.citizenid}
                                unit={u}
                                divider={i < attachedUnits.length - 1}
                                onPress={() => { void waypointToUnit(u.citizenid); }}
                            />
                        ))}
                    </div>
                )}
            </Scroller>
        </div>
    ) : undefined;

    if (isPhone) {
        return (
            <div className="relative flex min-h-0 flex-1 flex-col">
                <div className="shrink-0 px-4 pb-1 pt-3">
                    <SegmentedControl<PhoneBoard>
                        className={mdtSegmented}
                        value={phoneBoard}
                        onChange={setPhoneBoard}
                        options={[
                            { value: 'calls', label: t('mdt.boardCalls', 'Calls'), badge: calls.length || undefined },
                            { value: 'map',   label: t('mdt.boardMap', 'Map') },
                            { value: 'units', label: t('mdt.boardUnits', 'Units On Air') },
                        ]}
                    />
                </div>

                {phoneBoard === 'calls' ? master : phoneBoard === 'map' ? mapBoard : unitsBoard}

                {current && detail && (
                    <CallPage
                        key={current.id}
                        backLabel={t('mdt.navDispatch', 'Dispatch')}
                        onBack={() => select(null)}
                    >
                        {detail}
                    </CallPage>
                )}
            </div>
        );
    }

    return (
        <MasterDetail
            master={master}
            detail={detail}
            hasDetail={!!current}
            onCloseDetail={() => select(null)}
            placeholder={(
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="shrink-0 px-4 pt-4">
                        <SegmentedControl<'map' | 'units'>
                            className={mdtSegmented}
                            value={board}
                            onChange={setBoard}
                            options={[
                                { value: 'map', label: t('mdt.boardMap', 'Map') },
                                { value: 'units', label: t('mdt.boardUnits', 'Units On Air') },
                            ]}
                        />
                    </div>

                    {board === 'map' ? mapBoard : unitsBoard}
                </div>
            )}
        />
    );
}
