import { useEffect, useRef, useState } from 'react';
import { Car, ChevronRight, Fuel, Gauge, Image, ImageOff, Lock, MapPin, Navigation, SearchX, Shield, Unlock } from 'lucide-react';

import { SearchBar } from '@/ui/SearchBar';
import { EmptyState } from '@/ui/EmptyState';
import { NavBar } from '@/ui/NavBar';
import { fetchNui, isFiveM } from '@/core/nui';
import type { Envelope } from '@/core/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useIosPush } from '@/hooks/useIosPush';
import { useSessionState } from '@/hooks/useSessionState';
import { VEHICLES, type Vehicle, type VehicleStatus } from './data';
import { t } from '@/i18n';
import { Pill, type PillTone } from '@/ui/Pill';

const ACCENTS = ['#FF3B30', '#0A84FF', '#30B0C7', '#FF9500', '#5E5CE6', '#34C759', '#AF52DE', '#FF2D55'];

const IMG_PREF_KEY = 'garages:showImages';
function readImagePref(): boolean | null {
    try {
        const v = localStorage.getItem(IMG_PREF_KEY);
        return v === '1' ? true : v === '0' ? false : null;
    } catch { return null; }
}

export function Garages({ onClose: _onClose }: { onClose: () => void }) {
    const [openId, setOpenId] = useSessionState<string | null>('garages:openVehicle', null);

    const [imgCfg, setImgCfg] = useState<{ allowToggle: boolean; default: boolean }>(() => ({ allowToggle: !isFiveM, default: true }));
    const [imgPref, setImgPref] = useState<boolean | null>(readImagePref);

    const { data: list, loading } = useAsyncData<{ vehicles: Vehicle[]; images?: { allowToggle: boolean; default: boolean } }>(
        async () => {
            const res = await fetchNui<Envelope<Vehicle[]> & { images?: { allowToggle: boolean; default: boolean } }>('sd-phone:garages:list');
            if (!res?.success || !Array.isArray(res.data)) return null;
            return {
                vehicles: res.data.map((v, i) => ({ ...v, accent: v.accent || ACCENTS[i % ACCENTS.length] })),
                images:   res.images,
            };
        },
        [],
        {
            enabled: isFiveM,
            onData: d => { if (d.images) setImgCfg({ allowToggle: !!d.images.allowToggle, default: d.images.default !== false }); },
        },
    );
    const vehicles = list?.vehicles ?? (isFiveM ? [] : VEHICLES);

    const showImages = imgCfg.allowToggle ? (imgPref ?? imgCfg.default) : imgCfg.default;
    const toggleImages = () => {
        const next = !showImages;
        setImgPref(next);
        try { localStorage.setItem(IMG_PREF_KEY, next ? '1' : '0'); } catch { /* private mode */ }
    };

    const [query, setQuery] = useSessionState('garages:search', '');

    const stored = vehicles.filter(v => v.status === 'stored').length;
    const impound = vehicles.filter(v => v.status === 'impound').length;
    const open = vehicles.find(v => v.id === openId) ?? null;

    const didEnter = useRef(false);
    useEffect(() => { if (vehicles.length) didEnter.current = true; }, [vehicles.length]);

    const q = query.trim().toLowerCase();
    const filtered = q
        ? vehicles.filter(v => v.model.toLowerCase().includes(q) || v.plate.toLowerCase().includes(q))
        : vehicles;

    return (
        <div className="absolute inset-0 flex flex-col bg-[#d4d4d4] font-sf dark:bg-base">
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="px-5 pb-2 pt-1">
                <div className="flex items-center justify-between">
                    <h1 className="text-[32px] font-bold tracking-tight text-black dark:text-white">{t('garages.title', 'Garages')}</h1>
                    {imgCfg.allowToggle && vehicles.length > 0 && (
                        <button
                            type="button"
                            onClick={toggleImages}
                            aria-label={showImages ? t('garages.showPlaceholders', 'Show placeholder icons') : t('garages.showPhotos', 'Show vehicle photos')}
                            className="-mr-1 flex h-[34px] w-[34px] items-center justify-center rounded-full text-ios-blue active:opacity-50"
                        >
                            {showImages
                                ? <Image className="h-[23px] w-[23px]" strokeWidth={2} />
                                : <ImageOff className="h-[23px] w-[23px]" strokeWidth={2} />}
                        </button>
                    )}
                </div>
                <p className="mt-1 text-[18px] font-medium text-ios-gray">{t('garages.summary', '{count} vehicles · {stored} stored · {impound} impounded', { count: vehicles.length, stored, impound })}</p>
            </div>

            {vehicles.length > 0 && (
                <SearchBar value={query} onChange={setQuery} placeholder={t('garages.searchPlaceholder', 'Search plate or model')} className="mx-4 mb-2 shrink-0" />
            )}

            {loading && vehicles.length === 0 ? null : vehicles.length === 0 ? (
                <EmptyState icon={Car} title={t('garages.noVehiclesTitle', 'No Vehicles')} subtitle={t('garages.noVehiclesSubtitle', 'Vehicles you own will appear here.')} />
            ) : filtered.length === 0 ? (
                <EmptyState icon={SearchX} title={t('garages.noResultsTitle', 'No Results')} subtitle={t('garages.noResultsSubtitle', 'No vehicles match “{query}”.', { query: query.trim() })} />
            ) : (
                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto no-scrollbar px-4 pb-6">
                    {filtered.map(v => <VehicleCard key={v.id} v={v} showImages={showImages} onOpen={() => setOpenId(v.id)} />)}
                </div>
            )}

            {open && <VehicleDetail v={open} showImages={showImages} animateIn={didEnter.current} onBack={() => setOpenId(null)} />}
        </div>
    );
}

function VehicleThumb({ v, show, size, radius, iconSize, iconStroke = 2 }: {
    v: Vehicle; show: boolean; size: number; radius: number; iconSize: number; iconStroke?: number;
}) {
    const [failed, setFailed] = useState(false);
    const showImg = show && !!v.image && !failed;
    return (
        <div
            className={`flex shrink-0 items-center justify-center overflow-hidden ${showImg ? 'bg-[#dcdcdc] dark:bg-elevated' : ''}`}
            style={{ width: size, height: size, borderRadius: radius, background: showImg ? undefined : v.accent }}
        >
            {showImg ? (
                <img
                    src={v.image}
                    alt=""
                    draggable={false}
                    onError={() => setFailed(true)}
                    className="h-full w-full object-contain"
                    style={{ padding: Math.round(size * 0.06) }}
                />
            ) : (
                <Car size={iconSize} strokeWidth={iconStroke} className="text-white" />
            )}
        </div>
    );
}

const STATUS_TONE: Record<VehicleStatus, PillTone> = {
    stored:  'green',
    out:     'orange',
    impound: 'red',
};

// Resolved at render, not module load, so the label follows the active locale after a
// language switch or a late catalog load instead of freezing to the import-time language.
function statusLabel(status: VehicleStatus): string {
    if (status === 'stored')  return t('garages.statusStored', 'Stored');
    if (status === 'impound') return t('garages.statusImpound', 'Impound');
    return t('garages.statusOut', 'Out');
}

function StatusPill({ status, className = '' }: { status: VehicleStatus; className?: string }) {
    const tone = STATUS_TONE[status] ?? STATUS_TONE.out;
    return <Pill tone={tone} className={className}>{statusLabel(status)}</Pill>;
}

function VehicleCard({ v, showImages, onOpen }: { v: Vehicle; showImages: boolean; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="block w-full rounded-[18px] bg-[#e5e5e5] px-[18px] py-[17px] text-left shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] active:bg-black/[0.03] dark:bg-surface dark:shadow-none dark:ring-white/[0.06] dark:active:bg-white/[0.04]"
        >
            <div className="flex items-center gap-3.5">
                <VehicleThumb v={v} show={showImages} size={50} radius={14} iconSize={28} />

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate text-[18px] font-semibold leading-tight text-black dark:text-white">{v.model}</h3>
                        <StatusPill status={v.status} className="shrink-0" />
                    </div>
                    <p className="mt-0.5 truncate text-[16px] font-medium text-black/85 dark:text-white/80">{v.class}</p>
                </div>

                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-black/25 dark:text-white/30" strokeWidth={2.4} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
                <div className="shrink-0 rounded-[7px] border border-black/15 bg-black/[0.03] px-2.5 py-1 font-mono text-[14px] font-semibold tracking-[0.12em] text-black/80 dark:border-white/20 dark:bg-white/[0.06] dark:text-white/80">
                    {v.plate}
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-black/70 dark:text-white/70">
                    <MapPin className="h-[16px] w-[16px] shrink-0" strokeWidth={2.2} />
                    <span className="truncate text-[16px] font-medium">{v.location}</span>
                </div>
            </div>
        </button>
    );
}

function VehicleDetail({ v, showImages, onBack, animateIn = true }: { v: Vehicle; showImages: boolean; onBack: () => void; animateIn?: boolean }) {
    const { goBack, pageStyle } = useIosPush(onBack, animateIn);
    const setWaypoint = () => { if (v.waypoint) void fetchNui('sd-phone:garages:waypoint', v.waypoint); };

    const [locked, setLocked] = useState<boolean>(v.locked);

    const { data: mileageData } = useAsyncData<{ value: number; unit: string }>(
        async () => {
            const r = await fetchNui<Envelope<void> & { mileage?: number; unit?: string }>('sd-phone:garages:mileage', { plate: v.plate });
            if (r?.success && typeof r.mileage === 'number') return { value: r.mileage, unit: r.unit ?? 'km' };
            return null;
        },
        [v.plate],
        { enabled: isFiveM },
    );
    const mileage = mileageData ?? (typeof v.mileage === 'number' ? { value: v.mileage, unit: v.mileageUnit ?? 'km' } : null);

    useAsyncData<boolean>(
        async () => {
            const r = await fetchNui<Envelope<void> & { locked?: boolean }>('sd-phone:garages:lockstate', { plate: v.plate });
            if (r?.success && typeof r.locked === 'boolean') return r.locked;
            return null;
        },
        [v.plate],
        { enabled: isFiveM && v.status === 'out', onData: setLocked },
    );

    const [busy, setBusy] = useState(false);
    const [lockHint, setLockHint] = useState(false);
    const hintTimer = useRef<number | null>(null);
    useEffect(() => () => { if (hintTimer.current) window.clearTimeout(hintTimer.current); }, []);

    async function toggleLock() {
        if (busy) return;
        const next = !locked;
        setLocked(next);
        if (!isFiveM) return;
        setBusy(true);
        const r = await fetchNui<Envelope<void> & { locked?: boolean }>('sd-phone:garages:setlock', { plate: v.plate, locked: next });
        setBusy(false);
        if (!r?.success) {
            setLocked(!next);
            setLockHint(true);
            if (hintTimer.current) window.clearTimeout(hintTimer.current);
            hintTimer.current = window.setTimeout(() => setLockHint(false), 2600);
        } else if (typeof r.locked === 'boolean') {
            setLocked(r.locked);
        }
    }

    const lockPillCls = `flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[13px] font-bold uppercase tracking-wide ${locked ? 'bg-ios-blue/20 text-[#1d4ed8] dark:text-ios-blue' : 'bg-ios-red/20 text-[#c1121f] dark:text-ios-red'}`;
    const lockPillInner = (
        <>
            {locked ? <Lock className="h-[12px] w-[12px]" strokeWidth={2.8} /> : <Unlock className="h-[12px] w-[12px]" strokeWidth={2.8} />}
            {locked ? t('garages.locked', 'Locked') : t('garages.unlocked', 'Unlocked')}
        </>
    );

    return (
        <div className="absolute inset-0 z-20 flex flex-col bg-[#d4d4d4] font-sf dark:bg-base" style={pageStyle}>
            <div className="h-[58px] shrink-0" aria-hidden />

            <NavBar backLabel={t('garages.title', 'Garages')} onBack={goBack} />

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-8 pt-4">
                <div className="flex flex-col items-center">
                    <VehicleThumb v={v} show={showImages} size={132} radius={26} iconSize={62} iconStroke={1.6} />
                    <h2 className="mt-3 text-[24px] font-bold tracking-tight text-black dark:text-white">{v.model}</h2>
                    <p className="text-[15px] text-ios-gray">{v.class}</p>

                    <div className="mt-3 flex items-center gap-2">
                        <StatusPill status={v.status} />
                        {v.status === 'out' ? (
                            <button
                                type="button"
                                onClick={() => void toggleLock()}
                                disabled={busy}
                                className={`${lockPillCls} ring-1 ring-inset ring-black/10 transition-opacity active:opacity-60 disabled:opacity-50 dark:ring-white/15`}
                            >
                                {lockPillInner}
                                <ChevronRight className="-mr-0.5 h-[12px] w-[12px] opacity-60" strokeWidth={2.8} />
                            </button>
                        ) : (
                            <span className={lockPillCls}>{lockPillInner}</span>
                        )}
                    </div>

                    {v.status === 'out' && (
                        <span className={`mt-2 text-[13px] font-medium ${lockHint ? 'text-ios-red' : 'text-ios-gray'}`}>
                            {lockHint ? t('garages.vehicleNearby', 'Vehicle must be nearby') : (locked ? t('garages.tapToUnlock', 'Tap to unlock') : t('garages.tapToLock', 'Tap to lock'))}
                        </span>
                    )}
                </div>

                <SectionLabel>{t('garages.condition', 'Condition')}</SectionLabel>
                <div className="overflow-hidden rounded-[14px] bg-[#e5e5e5] px-4 py-1 ring-1 ring-black/[0.04] dark:bg-surface dark:ring-white/[0.06]">
                    <StatBar icon={<Fuel className="h-[20px] w-[20px]" strokeWidth={2.2} />}  label={t('garages.fuel', 'Fuel')}   value={v.fuel} />
                    <StatBar icon={<Gauge className="h-[20px] w-[20px]" strokeWidth={2.2} />} label={t('garages.engine', 'Engine')} value={v.engine} divider />
                    <StatBar icon={<Shield className="h-[20px] w-[20px]" strokeWidth={2.2} />} label={t('garages.body', 'Body')}  value={v.body} divider />
                </div>

                <SectionLabel>{t('garages.details', 'Details')}</SectionLabel>
                <div className="overflow-hidden rounded-[14px] bg-[#e5e5e5] ring-1 ring-black/[0.04] dark:bg-surface dark:ring-white/[0.06]">
                    <Row label={t('garages.location', 'Location')} value={v.location} icon={<MapPin className="h-[18px] w-[18px]" strokeWidth={2.2} />} onAction={v.waypoint ? setWaypoint : undefined} />
                    <Row label={t('garages.homeGarage', 'Home garage')} value={v.garage} divider />
                    <Row label={t('garages.plate', 'Plate')} value={v.plate} mono divider />
                    {mileage && (
                        <Row label={t('garages.mileage', 'Mileage')} value={`${mileage.value.toLocaleString()} ${mileage.unit}`} divider />
                    )}
                </div>
            </div>
        </div>
    );
}

function barColor(v: number): string {
    if (v >= 70) return '#34C759';
    if (v >= 35) return '#FF9500';
    return '#FF3B30';
}

function StatBar({ icon, label, value, divider }: { icon: React.ReactNode; label: string; value: number; divider?: boolean }) {
    return (
        <div className={`flex items-center gap-3 py-3.5 ${divider ? 'border-t border-black/[0.06] dark:border-white/[0.08]' : ''}`}>
            <span className="text-black/45 dark:text-white/45">{icon}</span>
            <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center justify-between">
                    <span className="text-[17px] font-medium text-black dark:text-white">{label}</span>
                    <span className="text-[15px] font-semibold tabular-nums" style={{ color: barColor(value) }}>{Math.round(value)}%</span>
                </div>
                <div className="h-[7px] overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.12]">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: barColor(value) }} />
                </div>
            </div>
        </div>
    );
}

function Row({ label, value, icon, mono, divider, onAction }: { label: string; value: string; icon?: React.ReactNode; mono?: boolean; divider?: boolean; onAction?: () => void }) {
    return (
        <div className={`flex items-center gap-2.5 px-4 py-3.5 ${divider ? 'border-t border-black/[0.06] dark:border-white/[0.08]' : ''}`}>
            {icon && <span className="text-black/40 dark:text-white/40">{icon}</span>}
            <span className="text-[17px] text-black dark:text-white">{label}</span>
            <span className={`ml-auto min-w-0 truncate pl-3 text-right text-[17px] text-ios-gray ${mono ? 'font-mono tracking-[0.08em]' : ''}`}>{value}</span>
            {onAction && (
                <button
                    type="button"
                    onClick={onAction}
                    aria-label={t('garages.setWaypointTo', 'Set waypoint to {value}', { value })}
                    className="ml-2 flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-ios-blue/15 text-ios-blue active:opacity-60"
                >
                    <Navigation className="h-[16px] w-[16px]" strokeWidth={2.2} fill="currentColor" />
                </button>
            )}
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <div className="px-3 pb-1.5 pt-5 text-[15px] font-semibold uppercase tracking-wide text-ios-gray">{children}</div>;
}
