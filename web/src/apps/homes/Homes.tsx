import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, House, KeyRound, Lock, MapPin, Navigation, Unlock, X } from 'lucide-react';

import { fetchNui, isFiveM } from '@/core/nui';
import { apiCall, type Envelope } from '@/core/api';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useIosPush } from '@/hooks/useIosPush';
import { useSessionState } from '@/hooks/useSessionState';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { AlertDialog } from '@/ui/AlertDialog';
import { PromptDialog } from '@/ui/PromptDialog';
import { EmptyState } from '@/ui/EmptyState';
import { NavBar } from '@/ui/NavBar';
import { HOMES, DEV_CAPS, type Home, type HomesCaps, type KeyHolder } from './data';
import { t } from '@/i18n';
import { Pill } from '@/ui/Pill';

const ACCENTS = ['#5E5CE6', '#0A84FF', '#30B0C7', '#FF9500', '#34C759', '#FF3B30', '#AF52DE', '#FF2D55'];

export function Homes({ onClose: _onClose }: { onClose: () => void }) {
    const [caps, setCaps] = useState<HomesCaps>(DEV_CAPS);
    const [openId, setOpenId] = useSessionState<string | null>('homes:openHome', null);

    const { data: list, loading, refetch } = useAsyncData<{ homes: Home[]; caps?: HomesCaps }>(
        async () => {
            const r = await fetchNui<Envelope<Home[]> & { caps?: HomesCaps }>('sd-phone:homes:list');
            if (!r?.success || !Array.isArray(r.data)) return null;
            return {
                homes: r.data.map((h, i) => ({ ...h, accent: h.accent || ACCENTS[i % ACCENTS.length] })),
                caps:  r.caps,
            };
        },
        [],
        {
            enabled: isFiveM,
            onData: d => { if (d.caps) setCaps(d.caps); },
        },
    );

    useNuiEvent('sd-phone:homes:refresh', useCallback(() => {
        refetch();
    }, [refetch]));
    const homes = list?.homes ?? (isFiveM ? [] : HOMES);

    const open = homes.find(h => h.id === openId) ?? null;

    const didEnter = useRef(false);
    useEffect(() => { if (homes.length) didEnter.current = true; }, [homes.length]);

    return (
        <div className="absolute inset-0 flex flex-col bg-[#d4d4d4] font-sf dark:bg-base">
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="px-5 pb-2 pt-1">
                <h1 className="text-[32px] font-bold tracking-tight text-black dark:text-white">{t('homes.title','Homes')}</h1>
                <p className="mt-1 text-[18px] font-medium text-ios-gray">{homes.length} {homes.length === 1 ? t('homes.property','property') : t('homes.properties','properties')}</p>
            </div>

            {loading && homes.length === 0 ? null : homes.length === 0 ? (
                <EmptyState icon={House} title={t('homes.emptyTitle','No Properties')} subtitle={t('homes.emptySubtitle','Homes you own will appear here.')} />
            ) : (
                <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto no-scrollbar px-4 pb-6">
                    {homes.map(h => <HomeCard key={h.id} h={h} onOpen={() => setOpenId(h.id)} />)}
                </div>
            )}

            {open && <HomeDetail h={open} caps={caps} animateIn={didEnter.current} onBack={() => setOpenId(null)} />}
        </div>
    );
}

function HomeCard({ h, onOpen }: { h: Home; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            className="block w-full rounded-[18px] bg-[#e5e5e5] px-[18px] py-[17px] text-left shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] active:bg-black/[0.03] dark:bg-surface dark:shadow-none dark:ring-white/[0.06] dark:active:bg-white/[0.04]"
        >
            <div className="flex items-center gap-3.5">
                <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[14px]" style={{ background: h.accent }}>
                    <House className="h-[28px] w-[28px] text-white" strokeWidth={2} />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="truncate text-[18px] font-semibold leading-tight text-black dark:text-white">{h.address}</h3>
                        <Pill>{t('homes.owned','Owned')}</Pill>
                    </div>
                    <p className="mt-0.5 truncate text-[16px] font-medium text-black/85 dark:text-white/80">{h.type}</p>
                </div>

                <ChevronRight className="h-[18px] w-[18px] shrink-0 text-black/25 dark:text-white/30" strokeWidth={2.4} />
            </div>

            {h.area ? (
                <div className="mt-3 flex items-center gap-1.5 text-black/70 dark:text-white/70">
                    <MapPin className="h-[16px] w-[16px] shrink-0" strokeWidth={2.2} />
                    <span className="truncate text-[16px] font-medium">{h.area}</span>
                </div>
            ) : null}
        </button>
    );
}

function HomeDetail({ h, caps, onBack, animateIn = true }: { h: Home; caps: HomesCaps; onBack: () => void; animateIn?: boolean }) {
    const { goBack, pageStyle } = useIosPush(onBack, animateIn);

    const [locked, setLocked] = useState<boolean>(h.locked ?? true);
    const [holders, setHolders] = useState<KeyHolder[]>([]);
    const [giving, setGiving] = useState(false);
    const [removing, setRemoving] = useState<KeyHolder | null>(null);

    const canWaypoint = !!h.coords;
    const hasActions = canWaypoint || caps.lock || caps.keyManage;

    useAsyncData<KeyHolder[]>(
        async () => {
            if (!caps.keyList) return [];
            if (!isFiveM) return [{ id: 'cid_marcus', name: 'Marcus Reed' }, { id: 'cid_elena', name: 'Elena Cruz' }];
            const r = await fetchNui<Envelope<void> & { holders?: KeyHolder[] }>('sd-phone:homes:keyHolders', { id: h.id });
            if (r?.success && Array.isArray(r.holders)) return r.holders;
            return null;
        },
        [h.id, caps.keyList],
        { onData: setHolders },
    );

    const refreshHolders = () => {
        if (!caps.keyList || !isFiveM) return;
        fetchNui<Envelope<void> & { holders?: KeyHolder[] }>('sd-phone:homes:keyHolders', { id: h.id })
            .then(r => { if (r?.success && Array.isArray(r.holders)) setHolders(r.holders); })
            .catch(() => { /* keep current */ });
    };

    const setWaypoint = () => { if (h.coords) void fetchNui('sd-phone:homes:waypoint', h.coords); };

    const toggleLock = () => {
        const want = !locked;
        setLocked(want);
        if (!isFiveM) return;
        fetchNui<Envelope<void> & { locked?: boolean }>('sd-phone:homes:lock', { id: h.id, lock: want })
            .then(r => { if (r && typeof r.locked === 'boolean') setLocked(r.locked); else if (!r?.success) setLocked(!want); })
            .catch(() => setLocked(!want));
    };

    const giveKey = (target: string) => {
        if (!isFiveM) { setHolders(prev => [...prev, { id: target, name: `Player ${target}` }]); return; }
        apiCall<void>('sd-phone:homes:giveKey', { id: h.id, target })
            .then(r => { if (r.success) refreshHolders(); })
            .catch(() => { /* no-op */ });
    };

    const removeHolder = (holder: KeyHolder) => {
        if (!isFiveM) { setHolders(prev => prev.filter(k => k.id !== holder.id)); return; }
        apiCall<void>('sd-phone:homes:removeKey', { id: h.id, holder: holder.id })
            .then(r => {
                if (!r.success) return;
                if (caps.keyList) refreshHolders();
                else setHolders(prev => prev.filter(k => k.id !== holder.id));
            })
            .catch(() => { /* no-op */ });
    };

    return (
        <div className="absolute inset-0 z-20 flex flex-col bg-[#d4d4d4] font-sf dark:bg-base" style={pageStyle}>
            <div className="h-[58px] shrink-0" aria-hidden />

            <NavBar backLabel={t('homes.backHomes','Homes')} onBack={goBack} />

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-8 pt-4">
                <div className="flex flex-col items-center">
                    <div className="flex h-[132px] w-[132px] items-center justify-center rounded-[26px]" style={{ background: h.accent }}>
                        <House className="h-[62px] w-[62px] text-white" strokeWidth={1.6} />
                    </div>
                    <h2 className="mt-3 text-[24px] font-bold tracking-tight text-black dark:text-white">{h.address}</h2>
                    <p className="text-[15px] text-ios-gray">{h.type}</p>

                    <div className="mt-3 flex items-center gap-2">
                        <Pill>{t('homes.owned','Owned')}</Pill>
                        {caps.lock && (
                            <Pill tone={locked ? 'blue' : 'red'}>
                                {locked ? <Lock className="h-[12px] w-[12px]" strokeWidth={2.8} /> : <Unlock className="h-[12px] w-[12px]" strokeWidth={2.8} />}
                                {locked ? t('homes.locked','Locked') : t('homes.unlocked','Unlocked')}
                            </Pill>
                        )}
                    </div>
                </div>

                {hasActions && (
                    <div className="mt-5 flex gap-2.5">
                        {canWaypoint && (
                            <ActionButton icon={<Navigation className="h-[23px] w-[23px]" strokeWidth={2.1} fill="currentColor" />} label={t('homes.waypoint','Waypoint')} onClick={setWaypoint} />
                        )}
                        {caps.lock && (
                            <ActionButton
                                icon={locked ? <Unlock className="h-[23px] w-[23px]" strokeWidth={2.1} /> : <Lock className="h-[23px] w-[23px]" strokeWidth={2.1} />}
                                label={locked ? t('homes.unlock','Unlock') : t('homes.lockAction','Lock')}
                                onClick={toggleLock}
                            />
                        )}
                        {caps.keyManage && (
                            <ActionButton icon={<KeyRound className="h-[23px] w-[23px]" strokeWidth={2.1} />} label={t('homes.giveKey','Give Key')} onClick={() => setGiving(true)} />
                        )}
                    </div>
                )}

                <SectionLabel>{t('homes.details','Details')}</SectionLabel>
                <div className="overflow-hidden rounded-[14px] bg-[#e5e5e5] ring-1 ring-black/[0.04] dark:bg-surface dark:ring-white/[0.06]">
                    <Row label={t('homes.location','Location')} value={h.area || '—'} icon={<MapPin className="h-[18px] w-[18px]" strokeWidth={2.2} />} onAction={canWaypoint ? setWaypoint : undefined} />
                    <Row label={t('homes.type','Type')} value={h.type} divider />
                </div>

                {caps.keyList && (
                    <>
                        <SectionLabel>{t('homes.keyHolders','Key Holders · {count}', { count: holders.length })}</SectionLabel>
                        <div className="overflow-hidden rounded-[14px] bg-[#e5e5e5] ring-1 ring-black/[0.04] dark:bg-surface dark:ring-white/[0.06]">
                            {holders.length === 0 ? (
                                <div className="px-4 py-5 text-center text-[15px] text-ios-gray">{t('homes.noKeyHolders','No one else has a key.')}</div>
                            ) : (
                                holders.map((holder, i) => (
                                    <KeyHolderRow
                                        key={`${holder.id}-${i}`}
                                        name={holder.name}
                                        divider={i > 0}
                                        onRemove={caps.keyManage ? () => setRemoving(holder) : undefined}
                                    />
                                ))
                            )}
                        </div>
                    </>
                )}
            </div>

            {giving && (
                <PromptDialog
                    title={t('homes.giveKey','Give Key')}
                    message={t('homes.giveKeyMessage','Enter the server ID of the player to give a key to {address}.', { address: h.address })}
                    placeholder={t('homes.sourceId','Source ID')}
                    confirmLabel={t('homes.giveKey','Give Key')}
                    inputMode="numeric"
                    sanitize={(v) => v.replace(/\D/g, '')}
                    maxLength={5}
                    onCancel={() => setGiving(false)}
                    onConfirm={(id) => { const t = id.trim(); if (t) giveKey(t); setGiving(false); }}
                />
            )}

            {removing && (
                <AlertDialog
                    title={t('homes.removeKeyHolder','Remove Key Holder?')}
                    message={t('homes.removeKeyMessage','{name} will no longer have a key to {address}.', { name: removing.name, address: h.address })}
                    confirmLabel={t('homes.remove','Remove')}
                    destructive
                    onCancel={() => setRemoving(null)}
                    onConfirm={() => { removeHolder(removing); setRemoving(null); }}
                />
            )}
        </div>
    );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-[14px] bg-[#e5e5e5] py-[17px] text-ios-blue ring-1 ring-black/[0.04] active:bg-black/[0.06] dark:bg-surface dark:ring-white/[0.06] dark:active:bg-white/[0.08]"
        >
            {icon}
            <span className="text-[13.5px] font-semibold">{label}</span>
        </button>
    );
}

function Row({ label, value, icon, divider, onAction }: { label: string; value: string; icon?: React.ReactNode; divider?: boolean; onAction?: () => void }) {
    return (
        <div className={`flex items-center gap-2.5 px-4 py-3.5 ${divider ? 'border-t border-black/[0.06] dark:border-white/[0.08]' : ''}`}>
            {icon && <span className="text-black/40 dark:text-white/40">{icon}</span>}
            <span className="text-[17px] text-black dark:text-white">{label}</span>
            <span className="ml-auto min-w-0 truncate pl-3 text-right text-[17px] text-ios-gray">{value}</span>
            {onAction && (
                <button
                    type="button"
                    onClick={onAction}
                    aria-label={t('homes.setWaypointTo','Set waypoint to {value}', { value })}
                    className="ml-2 flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-ios-blue/15 text-ios-blue active:opacity-60"
                >
                    <Navigation className="h-[16px] w-[16px]" strokeWidth={2.2} fill="currentColor" />
                </button>
            )}
        </div>
    );
}

function KeyHolderRow({ name, divider, onRemove }: { name: string; divider?: boolean; onRemove?: () => void }) {
    const initials = name.split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() || '?';
    return (
        <div className={`flex items-center gap-3 px-4 py-3 ${divider ? 'border-t border-black/[0.06] dark:border-white/[0.08]' : ''}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ios-blue/15 text-[14px] font-semibold text-ios-blue">
                {initials}
            </div>
            <span className="min-w-0 flex-1 truncate text-[17px] text-black dark:text-white">{name}</span>
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={t('homes.removeName','Remove {name}', { name })}
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-black/[0.06] text-ios-gray active:opacity-60 dark:bg-white/[0.08]"
                >
                    <X className="h-[16px] w-[16px]" strokeWidth={2.4} />
                </button>
            )}
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return <div className="px-3 pb-1.5 pt-5 text-[15px] font-semibold uppercase tracking-wide text-ios-gray">{children}</div>;
}
