import { useState, type ReactNode } from 'react';
import { Car, ClipboardList, ShieldAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { getLocaleTag, t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { FadeImage } from '@/ui/FadeImage';
import { ImageLightbox } from '@/ui/ImageLightbox';
import { ToggleRow } from '@/ui/ListGroup';
import { Pill, type PillTone } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { useAsyncData } from '@/hooks/useAsyncData';

import { mdtUpdateVehicle, mdtVehicle } from './mdtApi';
import { useMdtSession } from './useMdtSession';
import { mdtPanePad, mdtRuleX, mdtSectionHeader } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';
import { MdtCard } from './ui/MdtCard';
import { MdtField } from './ui/MdtField';
import { VEHICLE_STATUSES, type VehicleDetail, type VehicleStatus } from './data';

const MAX_POINTS = 24;

export const VEHICLE_TONE: Record<VehicleStatus, PillTone> = {
    valid:     'green',
    suspended: 'orange',
    expired:   'orange',
    impounded: 'red',
};

export function vehicleStatusLabel(status: string): string {
    switch (status) {
        case 'valid':     return t('mdt.regValid', 'Valid');
        case 'suspended': return t('mdt.regSuspended', 'Suspended');
        case 'expired':   return t('mdt.regExpired', 'Expired');
        case 'impounded': return t('mdt.regImpounded', 'Impounded');
        default:          return status;
    }
}

export function PlateChip({ plate, large }: { plate: string; large?: boolean }) {
    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-[6px] border border-black/15 bg-elevated font-bold uppercase tabular-nums tracking-[0.08em] text-black dark:border-white/20 dark:bg-base/50 dark:text-white ${
                large ? 'px-3 py-1.5 text-[19px]' : 'px-2 py-1 text-[13px]'
            }`}
        >
            {plate}
        </span>
    );
}

function Section({ title, icon: Icon, action, children }: {
    title:    string;
    icon:     LucideIcon;
    action?:  ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 px-1">
                <Icon className="h-[15px] w-[15px] shrink-0 text-ios-gray" strokeWidth={2.2} />
                <span className={`flex-1 ${mdtSectionHeader}`}>{title}</span>
                {action}
            </div>
            <MdtCard className="overflow-hidden">{children}</MdtCard>
        </div>
    );
}

function Fact({ label, value, onPress }: { label: string; value?: string | number | null; onPress?: () => void }) {
    const shown = value === 0 ? '0' : value;
    const text = shown && shown !== '' ? String(shown) : t('mdt.notOnFile', 'Not on file');
    return (
        <div className="min-w-0">
            <div className="text-[12px] uppercase tracking-wide text-ios-gray">{label}</div>
            {onPress ? (
                <button
                    type="button"
                    onClick={onPress}
                    className="block max-w-full truncate text-left text-[15px] font-medium text-ios-blue active:opacity-60"
                >
                    {text}
                </button>
            ) : (
                <div className="truncate text-[15px] font-medium text-black dark:text-white">{text}</div>
            )}
        </div>
    );
}

interface Draft {
    status: VehicleStatus;
    points: string;
    stolen: boolean;
    bolo:   boolean;
    notes:  string;
}

function draftOf(vehicle: VehicleDetail): Draft {
    return {
        status: VEHICLE_STATUSES.find(s => s === vehicle.status) ?? 'valid',
        points: String(vehicle.points),
        stolen: vehicle.stolen,
        bolo:   vehicle.bolo,
        notes:  vehicle.notes,
    };
}

export function VehicleRecord({ plate }: { plate: string }) {
    const { can, open } = useMdtSession();

    const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
    const [draft, setDraft]     = useState<Draft | null>(null);
    const [saving, setSaving]   = useState(false);
    const [zoom, setZoom]       = useState(false);

    const { loading } = useAsyncData(() => mdtVehicle(plate), [plate], {
        onData: next => { setVehicle(next); setDraft(draftOf(next)); },
    });

    const editable = can('vehicles.edit');

    if (!vehicle || !draft) {
        if (loading) {
            return (
                <div className="flex flex-col gap-3 p-6">
                    <div className="h-20 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                    <div className="h-36 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                    <div className="h-52 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                </div>
            );
        }
        return (
            <EmptyState
                center
                icon={Car}
                title={t('mdt.plateUnavailable', 'Plate not on the registry')}
                subtitle={t('mdt.plateUnavailableSub', 'No vehicle is registered on that plate, or you do not have access to it.')}
            />
        );
    }

    const dirty = draft.status !== vehicle.status
        || draft.points !== String(vehicle.points)
        || draft.stolen !== vehicle.stolen
        || draft.bolo !== vehicle.bolo
        || draft.notes !== vehicle.notes;

    function patch(part: Partial<Draft>) {
        setDraft(prev => (prev ? { ...prev, ...part } : prev));
    }

    async function save() {
        if (!vehicle || !draft || saving) return;
        setSaving(true);
        const next = await mdtUpdateVehicle(vehicle.plate, {
            status: draft.status,
            points: Math.min(MAX_POINTS, Number(draft.points) || 0),
            stolen: draft.stolen,
            bolo:   draft.bolo,
            notes:  draft.notes,
        });
        setSaving(false);
        if (next) { setVehicle(next); setDraft(draftOf(next)); }
    }

    const saveBar = editable && dirty ? (
        <span className="flex items-center gap-3">
            <MdtButton size="sm" onClick={() => setDraft(draftOf(vehicle))}>
                {t('common.cancel', 'Cancel')}
            </MdtButton>
            <MdtButton size="sm" variant="filled" disabled={saving} onClick={() => void save()}>
                {t('common.save', 'Save')}
            </MdtButton>
        </span>
    ) : undefined;

    return (
        <Scroller className={`h-full ${mdtPanePad}`}>
            <div className="flex flex-wrap items-center gap-3">
                <PlateChip large plate={vehicle.plate} />
                <h1 className="min-w-0 flex-1 truncate text-[26px] font-bold tracking-ios-display text-black dark:text-white">
                    {vehicle.model || t('mdt.unknownModel', 'Unknown model')}
                </h1>
                <span className="flex shrink-0 items-center gap-1.5">
                    {vehicle.stolen && <Pill tone="red">{t('mdt.stolen', 'Stolen')}</Pill>}
                    {vehicle.bolo && <Pill tone="orange">{t('mdt.bolo', 'BOLO')}</Pill>}
                    <Pill tone={VEHICLE_TONE[vehicle.status] ?? 'green'}>{vehicleStatusLabel(vehicle.status)}</Pill>
                </span>
            </div>

            {vehicle.image && (
                <button
                    type="button"
                    onClick={() => setZoom(true)}
                    className="mt-5 block w-full overflow-hidden rounded-[16px] ring-1 ring-black/[0.06] active:opacity-80 dark:ring-white/[0.08]"
                >
                    <FadeImage
                        src={vehicle.image}
                        alt={vehicle.model || vehicle.plate}
                        loading="eager"
                        className="h-[200px] w-full object-cover"
                    />
                </button>
            )}

            <div className="mt-6 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <Section title={t('mdt.registration', 'Registration')} icon={ClipboardList}>
                    <div className="grid gap-4 p-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                        <Fact label={t('mdt.plate', 'Plate')} value={vehicle.plate} />
                        <Fact label={t('mdt.model', 'Model')} value={vehicle.model} />
                        <Fact
                            label={t('mdt.registeredOwner', 'Registered owner')}
                            value={vehicle.ownerName || vehicle.owner}
                            onPress={vehicle.owner ? () => open('profiles', vehicle.owner) : undefined}
                        />
                        <Fact
                            label={t('mdt.location', 'Location')}
                            value={vehicle.stored ? t('mdt.garageStored', 'In a garage') : t('mdt.garageOut', 'Not in a garage')}
                        />
                        <Fact label={t('mdt.garage', 'Garage')} value={vehicle.garage} />
                        <Fact label={t('mdt.licencePoints', 'Licence points')} value={`${vehicle.points} / ${MAX_POINTS}`} />
                    </div>
                </Section>

                <Section title={t('mdt.dmvRecord', 'DMV record')} icon={ShieldAlert} action={saveBar}>
                    {editable ? (
                        <>
                            <div className="grid gap-4 p-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                                <MdtField
                                    label={t('mdt.registrationStatus', 'Registration status')}
                                    value={draft.status}
                                    onChange={v => patch({ status: v as VehicleStatus })}
                                    options={VEHICLE_STATUSES.map(s => ({ value: s, label: vehicleStatusLabel(s) }))}
                                />
                                <MdtField
                                    label={t('mdt.licencePoints', 'Licence points')}
                                    value={draft.points}
                                    onChange={v => patch({ points: v.replace(/\D/g, '').slice(0, 2) })}
                                    inputMode="numeric"
                                    placeholder="0"
                                    hint={t('mdt.pointsHint', 'Up to {n} before the licence is pulled.', { n: MAX_POINTS })}
                                />
                            </div>
                            <div className={mdtRuleX} />
                            <ToggleRow
                                divider
                                label={t('mdt.flaggedStolen', 'Flagged stolen')}
                                on={draft.stolen}
                                onToggle={() => patch({ stolen: !draft.stolen })}
                            />
                            <ToggleRow
                                divider
                                label={t('mdt.boloActive', 'BOLO active')}
                                on={draft.bolo}
                                onToggle={() => patch({ bolo: !draft.bolo })}
                            />
                            <div className="p-4">
                                <MdtField
                                    multiline
                                    rows={4}
                                    label={t('mdt.dmvNotes', 'Notes')}
                                    value={draft.notes}
                                    onChange={v => patch({ notes: v })}
                                    maxLength={2000}
                                    placeholder={t('mdt.dmvNotesPlaceholder', 'Modifications, prior stops, anything a unit should know before approaching.')}
                                />
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="grid gap-4 p-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                                <Fact label={t('mdt.registrationStatus', 'Registration status')} value={vehicleStatusLabel(vehicle.status)} />
                                <Fact label={t('mdt.flaggedStolen', 'Flagged stolen')} value={vehicle.stolen ? t('common.yes', 'Yes') : t('common.no', 'No')} />
                                <Fact label={t('mdt.boloActive', 'BOLO active')} value={vehicle.bolo ? t('common.yes', 'Yes') : t('common.no', 'No')} />
                            </div>
                            <div className={mdtRuleX} />
                            <div className="p-4">
                                <div className="mb-1 text-[12px] uppercase tracking-wide text-ios-gray">
                                    {t('mdt.dmvNotes', 'Notes')}
                                </div>
                                {vehicle.notes ? (
                                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-black dark:text-white">
                                        {vehicle.notes}
                                    </p>
                                ) : (
                                    <div className="text-[14px] text-ios-gray">
                                        {t('mdt.noDmvNotes', 'No notes on this vehicle.')}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </Section>
            </div>

            {vehicle.updatedAt ? (
                <div className="mt-5 px-1 text-[13px] text-ios-gray">
                    {t('mdt.lastUpdated', 'Last updated {date}', {
                        date: new Date(vehicle.updatedAt * 1000).toLocaleDateString(getLocaleTag(), {
                            day: 'numeric', month: 'short', year: 'numeric',
                        }),
                    })}
                </div>
            ) : null}

            {zoom && vehicle.image && (
                <ImageLightbox src={vehicle.image} onClose={() => setZoom(false)} />
            )}
        </Scroller>
    );
}
