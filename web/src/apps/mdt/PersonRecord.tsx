import { useState, type ReactNode } from 'react';
import { Car, FileText, Fingerprint, Gavel, Landmark, Scale, ShieldAlert, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { device } from '@device';
import { getLocaleTag, t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { FadeImage } from '@/ui/FadeImage';
import { ImageLightbox } from '@/ui/ImageLightbox';
import { Pill, type PillTone } from '@/ui/Pill';
import { PromptDialog } from '@/ui/PromptDialog';
import { Scroller } from '@/ui/Scroller';
import { useAsyncData } from '@/hooks/useAsyncData';

import { courtStatusLabel, courtStatusTone, courtVerdictLabel } from './CourtCase';
import { vehicleStatusLabel } from './VehicleRecord';
import { mdtCourtForCitizen, mdtPerson, mdtSetPersonFlags, mdtSetPersonMugshot, mdtSetPersonNotes } from './mdtApi';
import { useMdtSession } from './useMdtSession';
import { mdtPanePad, mdtRowHover, mdtSectionHeader } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';
import { MdtCard } from './ui/MdtCard';
import { MdtField } from './ui/MdtField';
import { PERSON_FLAGS, type ChargeClass, type PersonDetail, type PersonFlag, type VehicleStatus } from './data';

const MAX_NOTES = 2000;

const STACK_HEADER = device.id === 'phone';

const FLAG_TONE: Record<PersonFlag, PillTone> = {
    wanted:        'red',
    armed:         'red',
    gang:          'orange',
    mental_health: 'blue',
    flight_risk:   'orange',
    informant:     'green',
};

const CLASS_TONE: Record<ChargeClass, PillTone> = {
    felony:      'red',
    misdemeanor: 'orange',
    infraction:  'blue',
};

const VEHICLE_TONE: Record<VehicleStatus, PillTone> = {
    valid:     'green',
    suspended: 'orange',
    expired:   'orange',
    impounded: 'red',
};

function flagLabel(key: PersonFlag): string {
    switch (key) {
        case 'wanted':        return t('mdt.flagWanted', 'Wanted');
        case 'armed':         return t('mdt.flagArmed', 'Armed');
        case 'gang':          return t('mdt.flagGang', 'Gang affiliated');
        case 'mental_health': return t('mdt.flagMental', 'Mental health');
        case 'flight_risk':   return t('mdt.flagFlightRisk', 'Flight risk');
        case 'informant':     return t('mdt.flagInformant', 'Informant');
        default:              return key;
    }
}

function classLabel(cls: ChargeClass): string {
    switch (cls) {
        case 'felony':      return t('mdt.classFelony', 'Felony');
        case 'misdemeanor': return t('mdt.classMisdemeanor', 'Misdemeanor');
        case 'infraction':  return t('mdt.classInfraction', 'Infraction');
        default:            return cls;
    }
}

function licenceLabel(id: string): string {
    switch (id) {
        case 'driver':   return t('mdt.licenceDriver', 'Driver');
        case 'weapon':   return t('mdt.licenceWeapon', 'Firearms');
        case 'business': return t('mdt.licenceBusiness', 'Business');
        case 'pilot':    return t('mdt.licencePilot', 'Pilot');
        case 'boating':  return t('mdt.licenceBoating', 'Boating');
        case 'hunting':  return t('mdt.licenceHunting', 'Hunting');
        default:         return id.charAt(0).toUpperCase() + id.slice(1);
    }
}

function dateOf(ts: number): string {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString(getLocaleTag(), { day: 'numeric', month: 'short', year: 'numeric' });
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
            <MdtCard className="p-4">{children}</MdtCard>
        </div>
    );
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
    const shown = value === 0 ? '0' : value;
    return (
        <div className="min-w-0">
            <div className="text-[12px] uppercase tracking-wide text-ios-gray">{label}</div>
            <div className="truncate text-[15px] font-medium text-black dark:text-white">
                {shown && shown !== '' ? shown : t('mdt.notOnFile', 'Not on file')}
            </div>
        </div>
    );
}

function Blank({ label }: { label: string }) {
    return <div className="py-1 text-[14px] text-ios-gray">{label}</div>;
}

function LinkRow({ title, sub, right, onPress }: {
    title:   string;
    sub?:    string;
    right?:  ReactNode;
    onPress: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            className={`-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-[8px] px-2 py-2 text-left ${mdtRowHover}`}
        >
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-black dark:text-white">{title}</span>
                {sub && <span className="block truncate text-[13px] text-ios-gray">{sub}</span>}
            </span>
            {right}
        </button>
    );
}

export function PersonRecord({ citizenid }: { citizenid: string }) {
    const { can, open } = useMdtSession();

    const [person, setPerson]    = useState<PersonDetail | null>(null);
    const [notes, setNotes]      = useState<string | null>(null);
    const [saving, setSaving]    = useState(false);
    const [zoom, setZoom]        = useState(false);
    const [photoEdit, setPhoto]  = useState(false);
    const [clearPhoto, setClear] = useState(false);

    const { loading } = useAsyncData(() => mdtPerson(citizenid), [citizenid], { onData: setPerson });

    const { data: courtData } = useAsyncData(
        () => mdtCourtForCitizen(citizenid),
        [citizenid],
        { enabled: can('court.view') },
    );
    const courtCases = courtData ?? [];

    const editable = can('persons.edit');

    if (!person) {
        if (loading) {
            return (
                <div className="flex flex-col gap-3 p-6">
                    <div className="h-24 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                    <div className="h-40 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                    <div className="h-40 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                </div>
            );
        }
        return (
            <EmptyState
                center
                icon={User}
                title={t('mdt.recordUnavailable', 'Record unavailable')}
                subtitle={t('mdt.recordUnavailableSub', 'That citizen is no longer on file, or you do not have access to it.')}
            />
        );
    }

    const draft = notes ?? person.notes;
    const dirty = draft !== person.notes;

    async function saveNotes() {
        if (!person || saving) return;
        setSaving(true);
        const next = await mdtSetPersonNotes(person.citizenid, draft);
        setSaving(false);
        if (next) { setPerson(next); setNotes(null); }
    }

    async function toggleFlag(key: PersonFlag) {
        if (!person || !editable) return;
        const held = person.flags.includes(key);
        const flags = held ? person.flags.filter(f => f !== key) : [...person.flags, key];
        const next = await mdtSetPersonFlags(person.citizenid, flags);
        if (next) setPerson(next);
    }

    const facts = (
        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <Fact label={t('mdt.dob', 'Date of birth')} value={person.dob} />
            <Fact label={t('mdt.sex', 'Sex')} value={person.sex} />
            <Fact label={t('mdt.phone', 'Phone')} value={person.phone} />
            <Fact label={t('mdt.occupation', 'Occupation')} value={person.job} />
        </div>
    );

    return (
        <Scroller className={`h-full ${mdtPanePad}`}>
            <div className={`flex items-start ${STACK_HEADER ? 'gap-4' : 'gap-5'}`}>
                <div className="shrink-0">
                    {person.mugshot ? (
                        <button
                            type="button"
                            onClick={() => setZoom(true)}
                            className="block overflow-hidden rounded-[14px] ring-1 ring-black/[0.06] active:opacity-80 dark:ring-white/[0.08]"
                        >
                            <FadeImage
                                src={person.mugshot}
                                alt={person.name}
                                loading="eager"
                                className="h-[124px] w-[124px] object-cover"
                            />
                        </button>
                    ) : (
                        <div className="flex h-[124px] w-[124px] items-center justify-center rounded-[14px] bg-black/[0.06] text-ios-gray dark:bg-white/[0.08]">
                            <User className="h-12 w-12" strokeWidth={1.6} />
                        </div>
                    )}
                    {editable && (
                        <div className="mt-2 flex items-center justify-center gap-3">
                            <MdtButton size="sm" onClick={() => setPhoto(true)}>
                                {person.mugshot ? t('mdt.replacePhoto', 'Replace') : t('mdt.addPhoto', 'Add photo')}
                            </MdtButton>
                            {person.mugshot && (
                                <MdtButton size="sm" variant="destructive" onClick={() => setClear(true)}>
                                    {t('mdt.removePhoto', 'Remove')}
                                </MdtButton>
                            )}
                        </div>
                    )}
                </div>

                <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className={`text-[28px] font-bold tracking-ios-display text-black dark:text-white ${
                            STACK_HEADER ? 'min-w-0 break-words leading-tight' : 'truncate'
                        }`}>
                            {person.name}
                        </h1>
                        {person.wanted && <Pill tone="red">{t('mdt.wanted', 'Wanted')}</Pill>}
                    </div>
                    <div className="mt-1 text-[14px] tabular-nums text-ios-gray">{person.citizenid}</div>
                    {!STACK_HEADER && facts}
                </div>
            </div>

            {STACK_HEADER && facts}

            <div className="mt-6 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <Section title={t('mdt.identity', 'Identity')} icon={Fingerprint}>
                    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                        <Fact label={t('mdt.nationality', 'Nationality')} value={person.nationality} />
                        <Fact label={t('mdt.bloodtype', 'Blood type')} value={person.bloodtype} />
                        <Fact label={t('mdt.fingerprint', 'Fingerprint')} value={person.fingerprint} />
                        <Fact label={t('mdt.arrestCount', 'Arrests')} value={person.arrests} />
                    </div>
                </Section>

                <Section title={t('mdt.flags', 'Flags')} icon={ShieldAlert}>
                    {editable ? (
                        <div className="flex flex-wrap gap-2">
                            {PERSON_FLAGS.map(key => {
                                const held = person.flags.includes(key);
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => void toggleFlag(key)}
                                        className="transition-opacity duration-150 active:opacity-60"
                                    >
                                        <Pill tone={FLAG_TONE[key]} className={held ? '' : 'opacity-30 grayscale'}>
                                            {flagLabel(key)}
                                        </Pill>
                                    </button>
                                );
                            })}
                        </div>
                    ) : person.flags.length === 0 ? (
                        <Blank label={t('mdt.noFlags', 'No flags on this record.')} />
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {person.flags.map(key => (
                                <Pill key={key} tone={FLAG_TONE[key] ?? 'orange'}>{flagLabel(key)}</Pill>
                            ))}
                        </div>
                    )}
                </Section>

                <Section title={t('mdt.licences', 'Licences')} icon={Scale}>
                    {person.licences.length === 0 ? (
                        <Blank label={t('mdt.noLicences', 'No licences issued.')} />
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {person.licences.map(id => (
                                <Pill key={id} tone="blue">{licenceLabel(id)}</Pill>
                            ))}
                        </div>
                    )}
                </Section>

                <Section
                    title={t('mdt.officerNotes', 'Officer notes')}
                    icon={FileText}
                    action={dirty ? (
                        <span className="flex items-center gap-3">
                            <MdtButton size="sm" onClick={() => setNotes(null)}>
                                {t('common.cancel', 'Cancel')}
                            </MdtButton>
                            <MdtButton size="sm" variant="filled" disabled={saving} onClick={() => void saveNotes()}>
                                {t('common.save', 'Save')}
                            </MdtButton>
                        </span>
                    ) : undefined}
                >
                    {editable ? (
                        <MdtField
                            multiline
                            rows={5}
                            value={draft}
                            onChange={setNotes}
                            maxLength={MAX_NOTES}
                            placeholder={t('mdt.notesPlaceholder', 'Observations, known associates, cautions.')}
                        />
                    ) : person.notes ? (
                        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-black dark:text-white">
                            {person.notes}
                        </p>
                    ) : (
                        <Blank label={t('mdt.noNotes', 'No notes on this record.')} />
                    )}
                </Section>

                <Section title={t('mdt.registeredVehicles', 'Registered vehicles')} icon={Car}>
                    {person.vehicles.length === 0 ? (
                        <Blank label={t('mdt.noOwnedVehicles', 'No vehicles registered to this citizen.')} />
                    ) : (
                        <div className="flex flex-col">
                            {person.vehicles.map(v => (
                                <LinkRow
                                    key={v.plate}
                                    title={v.model || v.plate}
                                    sub={v.plate}
                                    right={
                                        <span className="flex shrink-0 items-center gap-1.5">
                                            {v.stolen && <Pill tone="red">{t('mdt.stolen', 'Stolen')}</Pill>}
                                            {v.bolo && <Pill tone="orange">{t('mdt.bolo', 'BOLO')}</Pill>}
                                            <Pill tone={VEHICLE_TONE[v.status] ?? 'green'}>
                                                {vehicleStatusLabel(v.status)}
                                            </Pill>
                                        </span>
                                    }
                                    onPress={() => open('vehicles', v.plate)}
                                />
                            ))}
                        </div>
                    )}
                </Section>

                <Section title={t('mdt.warrants', 'Warrants')} icon={Gavel}>
                    {person.warrants.length === 0 ? (
                        <Blank label={t('mdt.noPersonWarrants', 'No warrants have been issued against this citizen.')} />
                    ) : (
                        <div className="flex flex-col">
                            {person.warrants.map(w => (
                                <LinkRow
                                    key={w.ref}
                                    title={w.ref}
                                    sub={t('mdt.warrantCounts', '{f} felony, {m} misdemeanor, {i} infraction', {
                                        f: w.felonies, m: w.misdemeanors, i: w.infractions,
                                    })}
                                    right={
                                        <Pill tone={w.active ? 'red' : 'green'}>
                                            {w.active
                                                ? t('mdt.activeUntil', 'Until {date}', { date: dateOf(w.expiresAt) })
                                                : t('mdt.warrantClosed', 'Closed')}
                                        </Pill>
                                    }
                                    onPress={() => open('warrants', w.ref)}
                                />
                            ))}
                        </div>
                    )}
                </Section>

                <Section title={t('mdt.priors', 'Priors')} icon={Scale}>
                    {person.priors.length === 0 ? (
                        <Blank label={t('mdt.noPriors', 'No charges have been filed against this citizen.')} />
                    ) : (
                        <div className="flex flex-col">
                            {person.priors.map((p, i) => (
                                <LinkRow
                                    key={`${p.reportRef}-${p.code}-${i}`}
                                    title={p.count > 1 ? `${p.count} × ${p.label}` : p.label}
                                    sub={[p.reportRef, p.reportTitle, dateOf(p.date)].filter(Boolean).join('  ·  ')}
                                    right={<Pill tone={CLASS_TONE[p.class] ?? 'blue'}>{classLabel(p.class)}</Pill>}
                                    onPress={() => open('reports', p.reportRef)}
                                />
                            ))}
                        </div>
                    )}
                </Section>

                {can('court.view') && (
                    <Section title={t('mdt.courtHistory', 'Court history')} icon={Landmark}>
                        {courtCases.length === 0 ? (
                            <Blank label={t('mdt.noCourtHistory', 'This citizen has never been before the court.')} />
                        ) : (
                            <div className="flex flex-col">
                                {courtCases.map(c => (
                                    <LinkRow
                                        key={c.ref}
                                        title={c.title}
                                        sub={[c.ref, courtStatusLabel(c.status), c.hearingAt ? dateOf(c.hearingAt) : '']
                                            .filter(Boolean).join('  ·  ')}
                                        right={c.verdict
                                            ? <Pill tone={c.verdict === 'guilty' ? 'red' : 'green'}>{courtVerdictLabel(c.verdict)}</Pill>
                                            : <Pill tone={courtStatusTone(c.status)}>{courtStatusLabel(c.status)}</Pill>}
                                        onPress={() => open('court', c.ref)}
                                    />
                                ))}
                            </div>
                        )}
                    </Section>
                )}
            </div>

            {zoom && person.mugshot && (
                <ImageLightbox src={person.mugshot} onClose={() => setZoom(false)} />
            )}

            {photoEdit && (
                <PromptDialog
                    title={t('mdt.setMugshot', 'Set mugshot')}
                    message={t('mdt.setMugshotSub', 'Paste the web address of the booking photo.')}
                    label={t('mdt.imageUrl', 'Image URL')}
                    placeholder="https://"
                    initialValue={person.mugshot ?? ''}
                    maxLength={512}
                    confirmLabel={t('common.save', 'Save')}
                    validate={v => (/^https?:\/\/\S+$/.test(v) ? null : t('mdt.badUrl', 'That is not a valid web address.'))}
                    onCancel={() => setPhoto(false)}
                    onConfirm={async url => {
                        const next = await mdtSetPersonMugshot(citizenid, url);
                        if (!next) return t('mdt.saveFailed', 'That could not be saved.');
                        setPerson(next);
                        return null;
                    }}
                />
            )}

            {clearPhoto && (
                <AlertDialog
                    destructive
                    title={t('mdt.removePhotoTitle', 'Remove mugshot?')}
                    message={t('mdt.removePhotoSub', 'The photo comes off this record. Nothing else in the file changes.')}
                    confirmLabel={t('mdt.removePhoto', 'Remove')}
                    onCancel={() => setClear(false)}
                    onConfirm={() => {
                        setClear(false);
                        void mdtSetPersonMugshot(citizenid, null).then(next => { if (next) setPerson(next); });
                    }}
                />
            )}
        </Scroller>
    );
}
