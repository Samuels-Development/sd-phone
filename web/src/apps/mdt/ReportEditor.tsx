import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, FileText, FolderOpen, Gavel, Trash2, UserPlus, X } from 'lucide-react';
import type { PillTone } from '@/ui/Pill';

import { t } from '@/i18n';
import { colorFor } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { formatMediumDate } from '@/lib/time';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { useMenuRoot } from '@/ui/menuRoot';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { SearchBar } from '@/ui/SearchBar';
import { Select } from '@/ui/Select';

import { BookingDialog } from './BookingDialog';
import { catalogIndex, ChargePicker, inputTotals, sentenceLabel } from './ChargePicker';
import { EMS_INVOLVED_ROLES, EMS_REPORT_TYPES } from './data';
import type {
    AnyInvolvedRole, AnyReportType, Charge, ChargeInput, EvidenceItem, Involved, InvolvedRole, ReportDetail, ReportSummary, ReportType,
} from './data';
import { mdtDeleteReport, mdtReport, mdtReports, mdtSaveReport } from './mdtApi';
import { PersonPicker } from './PersonPicker';
import { useMdtSession, useViewEnter } from './useMdtSession';
import { mdtPanePad, mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtSectionHeader, STATUS_TONE } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';
import { MdtCard } from './ui/MdtCard';
import { MdtField } from './ui/MdtField';
import { MdtEvidence } from './ui/MdtEvidence';
import { MdtRichField } from './ui/MdtRichField';
import { MdtRichText } from './ui/MdtRichText';

export const REPORT_TYPES: readonly ReportType[] = ['Incident', 'Traffic', 'Arrest', 'Investigation', 'Warrant'] as const;
export const INVOLVED_ROLES: readonly InvolvedRole[] = ['suspect', 'victim', 'witness'] as const;

const FIELD_ROW_MIN = 476;

function chargeTotals(charges: readonly Charge[]): { months: number; fine: number } {
    let months = 0;
    let fine = 0;
    for (const charge of charges) {
        months += charge.months * charge.count;
        fine += charge.fine * charge.count;
    }
    return { months, fine };
}

interface EditDraft {
    ref:      string | null;
    title:    string;
    type:     AnyReportType;
    body:     string;
    evidence: EvidenceItem[];
    involved: Involved[];
    charges:  ChargeInput[];
}

export function reportTypeLabel(type: string): string {
    switch (type) {
        case 'Traffic':       return t('mdt.typeTraffic', 'Traffic');
        case 'Arrest':        return t('mdt.typeArrest', 'Arrest');
        case 'Investigation': return t('mdt.typeInvestigation', 'Investigation');
        case 'Warrant':       return t('mdt.typeWarrant', 'Warrant');
        case 'Patient Care':  return t('mdt.typePatientCare', 'Patient Care');
        case 'Trauma':        return t('mdt.typeTrauma', 'Trauma');
        case 'Cardiac':       return t('mdt.typeCardiac', 'Cardiac');
        case 'Overdose':      return t('mdt.typeOverdose', 'Overdose');
        case 'Transport':     return t('mdt.typeTransport', 'Transport');
        case 'Death':         return t('mdt.typeDeath', 'Death');
        default:              return t('mdt.typeIncident', 'Incident');
    }
}

export function reportTypeTone(type: string): PillTone {
    if (type === 'Arrest' || type === 'Warrant' || type === 'Cardiac' || type === 'Death') return 'red';
    if (type === 'Traffic' || type === 'Trauma' || type === 'Overdose') return 'orange';
    if (type === 'Investigation' || type === 'Transport') return 'green';
    return 'blue';
}

export function roleLabel(role: string): string {
    if (role === 'victim') return t('mdt.roleVictim', 'Victim');
    if (role === 'witness') return t('mdt.roleWitness', 'Witness');
    if (role === 'patient') return t('mdt.rolePatient', 'Patient');
    if (role === 'responder') return t('mdt.roleResponder', 'Responder');
    if (role === 'other') return t('mdt.roleOther', 'Other');
    return t('mdt.roleSuspect', 'Suspect');
}

function blankDraft(medical: boolean): EditDraft {
    const type = medical ? EMS_REPORT_TYPES[0] : REPORT_TYPES[0];
    return { ref: null, title: '', type, body: '', evidence: [], involved: [], charges: [] };
}

function draftFrom(report: ReportDetail): EditDraft {
    return {
        ref:      report.ref,
        title:    report.title,
        type:     report.type,
        body:     report.body,
        evidence: report.evidence ?? [],
        involved: report.involved.map(person => ({ ...person })),
        charges:  report.charges.map(c => ({ code: c.code, citizenid: c.citizenid, count: c.count })),
    };
}

export function ReportEditor({ reportRef, onSaved, onDeleted, onClose }: {
    reportRef: string | null;
    onSaved:   (report: ReportDetail) => void;
    onDeleted: () => void;
    onClose:   () => void;
}) {
    const { open, department, can } = useMdtSession();
    const isMedical = department?.type === 'ems';

    const { data: report, loading, refetch } = useAsyncData(
        () => (reportRef ? mdtReport(reportRef) : Promise.resolve(null)),
        [reportRef],
    );

    const [stored, setStored] = useSessionState<EditDraft | null>('mdt:reportDraft', null);
    const [draft, setDraft] = useState<EditDraft | null>(() => (
        stored && stored.ref === reportRef ? stored : (reportRef === null ? blankDraft(isMedical) : null)
    ));
    const [picking, setPicking] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [booking, setBooking] = useState<'jail' | 'fine' | null>(null);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const enter = useViewEnter(draft ? 'edit' : report ? 'read' : null);

    function edit(next: EditDraft) {
        setDraft(next);
        setStored(next);
    }

    function cancel() {
        setDraft(null);
        setStored(null);
        setError('');
        if (reportRef === null) onClose();
    }

    async function save() {
        if (!draft || saving) return;
        if (!draft.title.trim()) {
            setError(t('mdt.reportNeedsTitle', 'A title is required before this can be filed.'));
            return;
        }
        setSaving(true);
        const next = await mdtSaveReport({
            ref:      draft.ref,
            title:    draft.title.trim(),
            type:     draft.type,
            body:     draft.body,
            evidence: draft.evidence,
            involved: draft.involved.map(person => ({
                citizenid: person.citizenid,
                role:      person.role,
                notes:     person.notes,
            })),
            charges:  draft.charges,
        });
        setSaving(false);
        if (!next) {
            setError(t('mdt.saveFailed', 'That could not be saved. Check every charge is on a listed suspect.'));
            return;
        }
        setDraft(null);
        setStored(null);
        setError('');
        onSaved(next);
        refetch();
    }

    async function remove() {
        setConfirm(false);
        if (!reportRef) return;
        const ok = await mdtDeleteReport(reportRef);
        if (ok) { setStored(null); onDeleted(); }
        else setError(t('mdt.deleteFailed', 'That could not be deleted.'));
    }

    if (draft) {
        return (
            <>
                <DraftView
                    draft={draft}
                    saving={saving}
                    error={error}
                    enter={enter}
                    onChange={edit}
                    onAddPerson={() => setPicking(true)}
                    onSave={() => void save()}
                    onCancel={cancel}
                />
                {picking && (
                    <PersonPicker
                        title={t('mdt.addPerson', 'Add a person')}
                        onClose={() => setPicking(false)}
                        onPick={person => {
                            setPicking(false);
                            if (draft.involved.some(p => p.citizenid === person.citizenid)) return;
                            edit({
                                ...draft,
                                involved: [...draft.involved, {
                                    citizenid: person.citizenid,
                                    name:      person.name,
                                    role:      'suspect',
                                }],
                            });
                        }}
                    />
                )}
            </>
        );
    }

    if (!report) {
        if (loading) {
            return (
                <div className="flex flex-col gap-3 p-6">
                    <div className="h-20 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                    <div className="h-40 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                    <div className="h-32 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                </div>
            );
        }
        return (
            <EmptyState
                center
                icon={FileText}
                title={t('mdt.reportGone', 'Report unavailable')}
                subtitle={t('mdt.reportGoneSub', 'It was deleted, or your department is not on its access list.')}
            />
        );
    }

    const totals = chargeTotals(report.charges);

    const bookable = can('jail.book')
        && report.charges.length > 0
        && report.involved.some(person => person.role === 'suspect');

    return (
        <Scroller key="read" className={`h-full ${mdtPanePad} ${enter}`}>
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 grow basis-[280px]">
                    <div className="flex items-center gap-2">
                        <span className={mdtRef}>{report.ref}</span>
                        <Pill tone={reportTypeTone(report.type)}>{reportTypeLabel(report.type)}</Pill>
                    </div>
                    <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                        {report.title}
                    </h1>
                    <div className="mt-1 text-[13px] text-ios-gray">
                        {report.callsign ? `${report.callsign} · ${report.author}` : report.author}
                        {' · '}
                        {formatMediumDate(report.createdAt)}
                    </div>
                </div>
                <span className="flex flex-wrap items-center gap-3">
                    {bookable && (
                        <>
                            <MdtButton
                                variant="filled"
                                size="sm"
                                className="min-w-[62px]"
                                icon={<Gavel className="h-[14px] w-[14px]" strokeWidth={2.4} />}
                                onClick={() => setBooking('jail')}
                            >
                                {t('mdt.jail', 'Jail')}
                            </MdtButton>
                            <MdtButton
                                size="sm"
                                className="min-w-[62px]"
                                icon={<Banknote className="h-[14px] w-[14px]" strokeWidth={2.4} />}
                                onClick={() => setBooking('fine')}
                            >
                                {t('mdt.fine', 'Fine')}
                            </MdtButton>
                        </>
                    )}
                    {report.canEdit && (
                        <MdtButton variant="filled" size="sm" onClick={() => edit(draftFrom(report))}>
                            {t('common.edit', 'Edit')}
                        </MdtButton>
                    )}
                    {report.canDelete && (
                        <MdtButton
                            variant="destructive"
                            size="sm"
                            icon={<Trash2 className="h-[14px] w-[14px]" strokeWidth={2.4} />}
                            onClick={() => setConfirm(true)}
                        >
                            {t('common.delete', 'Delete')}
                        </MdtButton>
                    )}
                </span>
            </div>

            {report.caseRef && (
                <button
                    type="button"
                    onClick={() => open('cases', report.caseRef ?? null)}
                    className="mt-4 flex w-full items-center gap-2 rounded-[12px] bg-ios-blue/10 px-3 py-2 text-left active:opacity-70"
                >
                    <FolderOpen className="h-[15px] w-[15px] shrink-0 text-ios-blue" strokeWidth={2.25} />
                    <span className="text-[14.5px] font-medium text-ios-blue">
                        {t('mdt.partOfCase', 'Part of case {ref}', { ref: report.caseRef })}
                    </span>
                </button>
            )}

            <div className="mt-5 grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
                <div className="min-w-0">
                    <div className={`mb-2 px-1 ${mdtSectionHeader}`}>{t('mdt.narrative', 'Narrative')}</div>
                    <MdtCard className="p-4">
                        {report.body ? (
                            <MdtRichText
                                text={report.body}
                                className="text-[15px] leading-relaxed text-black dark:text-white"
                            />
                        ) : (
                            <div className="text-[14px] text-ios-gray">
                                {t('mdt.noNarrative', 'No narrative was written for this report.')}
                            </div>
                        )}
                    </MdtCard>

                    {report.evidence?.length > 0 && (
                        <MdtCard className="mt-4 p-4">
                            <MdtEvidence items={report.evidence} />
                        </MdtCard>
                    )}
                </div>

                <div className="min-w-0">
                    <div className={`mb-2 px-1 ${mdtSectionHeader}`}>{t('mdt.involved', 'Involved')}</div>
                    <MdtCard className="overflow-hidden">
                        {report.involved.length === 0 ? (
                            <div className="px-4 py-5 text-center text-[14px] text-ios-gray">
                                {t('mdt.noInvolved', 'Nobody is attached to this report.')}
                            </div>
                        ) : report.involved.map(person => (
                            <button
                                key={person.citizenid}
                                type="button"
                                onClick={() => open('profiles', person.citizenid)}
                                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${mdtRowHover}`}
                            >
                                <InitialsAvatar name={person.name} color={colorFor(person.citizenid)} size={32} />
                                <span className="min-w-0 flex-1">
                                    <span className={`block truncate ${mdtRowTitle}`}>{person.name}</span>
                                    {person.notes && (
                                        <span className={`block truncate ${mdtRowMeta}`}>{person.notes}</span>
                                    )}
                                </span>
                                <Pill tone={STATUS_TONE[person.role] ?? 'blue'}>{roleLabel(person.role)}</Pill>
                            </button>
                        ))}
                    </MdtCard>
                </div>
            </div>

            <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.charges', 'Charges')}</div>
            <MdtCard className="overflow-hidden">
                {report.charges.length === 0 ? (
                    <div className="px-4 py-5 text-center text-[14px] text-ios-gray">
                        {t('mdt.noCharges', 'No charges were filed on this report.')}
                    </div>
                ) : (
                    <>
                        {report.charges.map((charge, index) => (
                            <div
                                key={`${charge.code}:${charge.citizenid}:${index}`}
                                className="flex items-center gap-3 px-4 py-2.5"
                            >
                                <Pill tone={STATUS_TONE[charge.class] ?? 'blue'}>{charge.code}</Pill>
                                <span className="min-w-0 flex-1">
                                    <span className={`block truncate ${mdtRowTitle}`}>
                                        {charge.label}
                                        {charge.count > 1 && (
                                            <span className="font-normal text-ios-gray">{` ×${charge.count}`}</span>
                                        )}
                                    </span>
                                    <span className={`block truncate ${mdtRowMeta}`}>{charge.name}</span>
                                </span>
                                <span className={`shrink-0 text-right tabular-nums ${mdtRowMeta}`}>
                                    <span className="block">{sentenceLabel(charge.months * charge.count)}</span>
                                    <span className="block">{formatMoney(charge.fine * charge.count, { whole: true })}</span>
                                </span>
                            </div>
                        ))}
                        <div className="flex items-center justify-between border-t border-black/[0.06] px-4 py-2.5 dark:border-white/[0.08]">
                            <span className={mdtSectionHeader}>{t('mdt.total', 'Total')}</span>
                            <span className="text-[15px] font-semibold tabular-nums text-black dark:text-white">
                                {sentenceLabel(totals.months)}
                                {' · '}
                                {formatMoney(totals.fine, { whole: true })}
                            </span>
                        </div>
                    </>
                )}
            </MdtCard>

            {error && <div className="mt-4 text-[14px] text-ios-red">{error}</div>}
            <div className="h-6" />

            {confirm && (
                <AlertDialog
                    destructive
                    title={t('mdt.deleteReport', 'Delete this report?')}
                    message={t('mdt.deleteReportSub', 'Its charges, its people and any case link go with it.')}
                    confirmLabel={t('common.delete', 'Delete')}
                    onCancel={() => setConfirm(false)}
                    onConfirm={() => void remove()}
                />
            )}

            {booking && (
                <BookingDialog
                    fromReport={report.ref}
                    mode={booking}
                    onClose={() => setBooking(null)}
                    onBooked={() => setBooking(null)}
                />
            )}
        </Scroller>
    );
}

function DraftView({ draft, saving, error, enter, onChange, onAddPerson, onSave, onCancel }: {
    draft:       EditDraft;
    saving:      boolean;
    error:       string;
    enter:       string;
    onChange:    (draft: EditDraft) => void;
    onAddPerson: () => void;
    onSave:      () => void;
    onCancel:    () => void;
}) {
    const { offences, department } = useMdtSession();
    const medical = department?.type === 'ems';
    const byCode = useMemo(() => catalogIndex(offences), [offences]);
    const totals = useMemo(() => inputTotals(draft.charges, byCode), [draft.charges, byCode]);

    const fieldsRef = useRef<HTMLDivElement>(null);
    const [stackFields, setStackFields] = useState(false);

    useLayoutEffect(() => {
        const host = fieldsRef.current;
        if (!host) return;
        const measure = () => setStackFields(host.clientWidth < FIELD_ROW_MIN);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(host);
        return () => ro.disconnect();
    }, []);

    const suspects = useMemo(
        () => draft.involved
            .filter(person => person.role === 'suspect')
            .map(person => ({ citizenid: person.citizenid, name: person.name })),
        [draft.involved],
    );

    function setPerson(index: number, patch: Partial<Involved>) {
        const involved = draft.involved.slice();
        involved[index] = { ...involved[index], ...patch };
        const stillSuspects = new Set(involved.filter(p => p.role === 'suspect').map(p => p.citizenid));
        onChange({
            ...draft,
            involved,
            charges: draft.charges.filter(c => !c.citizenid || stillSuspects.has(c.citizenid)),
        });
    }

    function removePerson(index: number) {
        const gone = draft.involved[index];
        onChange({
            ...draft,
            involved: draft.involved.filter((_, i) => i !== index),
            charges:  draft.charges.filter(c => c.citizenid !== gone.citizenid),
        });
    }

    return (
        <Scroller key="edit" className={`h-full ${mdtPanePad} ${enter}`}>
            <h1 className="text-[26px] font-bold tracking-ios-display text-black dark:text-white">
                {draft.ref
                    ? t('mdt.editingReport', 'Editing {ref}', { ref: draft.ref })
                    : t('mdt.newReportTitle', 'New report')}
            </h1>

            <div
                ref={fieldsRef}
                className="mt-5 grid gap-4"
                style={{ gridTemplateColumns: stackFields ? '1fr' : 'minmax(240px, 1fr) 220px' }}
            >
                <MdtField
                    label={t('mdt.title', 'Title')}
                    value={draft.title}
                    onChange={v => onChange({ ...draft, title: v })}
                    maxLength={160}
                    placeholder={t('mdt.reportTitleHint', 'Armed robbery on Vespucci Boulevard')}
                />
                <MdtField
                    label={t('mdt.type', 'Type')}
                    value={draft.type}
                    onChange={v => onChange({ ...draft, type: v as ReportType })}
                    options={(medical ? EMS_REPORT_TYPES : REPORT_TYPES)
                        .map((type: string) => ({ value: type, label: reportTypeLabel(type) }))}
                />
            </div>

            <div className="mt-4">
                <MdtRichField
                    rows={8}
                    label={t('mdt.narrative', 'Narrative')}
                    value={draft.body}
                    onChange={v => onChange({ ...draft, body: v })}
                    maxLength={12000}
                    placeholder={t('mdt.narrativeHint', 'What happened, in the order it happened.')}
                />
            </div>

            <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 px-1">
                    <span className={`flex-1 ${mdtSectionHeader}`}>{t('mdt.involved', 'Involved')}</span>
                    <MdtButton
                        size="sm"
                        variant="text"
                        icon={<UserPlus className="h-[14px] w-[14px]" strokeWidth={2.4} />}
                        onClick={onAddPerson}
                    >
                        {t('mdt.addPerson', 'Add a person')}
                    </MdtButton>
                </div>
                <MdtCard className="overflow-hidden">
                    {draft.involved.length === 0 ? (
                        <div className="px-4 py-5 text-center text-[14px] text-ios-gray">
                            {t('mdt.noInvolvedYet', 'Nobody attached yet. Charges need a suspect on the report.')}
                        </div>
                    ) : draft.involved.map((person, index) => (
                        <div key={person.citizenid} className="flex items-center gap-2 px-4 py-2.5">
                            <InitialsAvatar name={person.name} color={colorFor(person.citizenid)} size={32} />
                            <div className="min-w-0 flex-1">
                                <div className={`truncate ${mdtRowTitle}`}>{person.name}</div>
                                <input
                                    type="text"
                                    value={person.notes ?? ''}
                                    onChange={e => setPerson(index, { notes: e.target.value })}
                                    maxLength={255}
                                    placeholder={t('mdt.personNotesHint', 'Notes on their involvement')}
                                    className="w-full bg-transparent text-[12.5px] font-medium text-ios-gray outline-none placeholder:text-ios-gray/70"
                                />
                            </div>
                            <Select<AnyInvolvedRole>
                                value={person.role}
                                onChange={role => setPerson(index, { role })}
                                options={(medical ? EMS_INVOLVED_ROLES : INVOLVED_ROLES).map(role => ({
                                    value: role,
                                    label: roleLabel(role),
                                }))}
                                size="xs"
                                ariaLabel={t('mdt.role', 'Role')}
                                className="shrink-0"
                            />
                            <button
                                type="button"
                                onClick={() => removePerson(index)}
                                aria-label={t('mdt.removePerson', 'Remove person')}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ios-gray active:opacity-50"
                            >
                                <X className="h-[16px] w-[16px]" strokeWidth={2.5} />
                            </button>
                        </div>
                    ))}
                </MdtCard>
            </div>

            {!medical && (
                <div className="mt-5">
                    <div className={`mb-2 px-1 ${mdtSectionHeader}`}>{t('mdt.charges', 'Charges')}</div>
                    {suspects.length === 0 ? (
                        <MdtCard className="px-4 py-5 text-center text-[14px] text-ios-gray">
                            {t('mdt.needSuspect', 'Attach someone as a suspect before adding charges.')}
                        </MdtCard>
                    ) : (
                        <ChargePicker
                            className="min-h-[320px]"
                            lines={draft.charges}
                            subjects={suspects}
                            onChange={charges => onChange({ ...draft, charges })}
                        />
                    )}
                </div>
            )}

            <div className="mt-5">
                <MdtEvidence
                    items={draft.evidence}
                    onChange={evidence => onChange({ ...draft, evidence })}
                />
            </div>

            {error && <div className="mt-4 text-[14px] text-ios-red">{error}</div>}

            <div className="mt-5 flex flex-wrap items-center gap-3 pb-6">
                <MdtButton variant="filled" disabled={saving} onClick={onSave}>
                    {saving ? t('mdt.saving', 'Saving') : t('mdt.fileReport', 'File report')}
                </MdtButton>
                <MdtButton variant="text" onClick={onCancel}>{t('common.cancel', 'Cancel')}</MdtButton>
                <span className={`ml-auto tabular-nums ${mdtRowMeta}`}>
                    {sentenceLabel(totals.months)}
                    {' · '}
                    {formatMoney(totals.fine, { whole: true })}
                </span>
            </div>
        </Scroller>
    );
}

export function ReportLinker({ linked = [], title, onPick, onClose }: {
    linked?: string[];
    title?:  string;
    onPick:  (ref: string) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState('');
    const [term, setTerm] = useState('');

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        }
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    const { data, loading } = useAsyncData(() => mdtReports({ query: term, page: 1 }), [term]);
    const rows: ReportSummary[] = (data?.rows ?? []).filter(row => !linked.includes(row.ref));
    const root = useMenuRoot();

    const overlay = (
        <div
            className="absolute inset-0 z-30 flex items-center justify-center px-6"
            style={{ background: 'rgba(0,0,0,0.32)', animation: 'ios-sheet-backdrop-in 0.2s ease-out' }}
            onClick={onClose}
        >
            <div className="w-full max-w-[480px]" onClick={e => e.stopPropagation()}>
                <MdtCard className="flex max-h-[70vh] flex-col overflow-hidden">
                    <div className="flex items-center gap-3 px-4 pb-3 pt-4">
                        <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-black dark:text-white">
                            {title ?? t('mdt.linkReport', 'Link a report')}
                        </span>
                        <MdtButton size="sm" variant="text" onClick={onClose}>
                            {t('common.cancel', 'Cancel')}
                        </MdtButton>
                    </div>
                    <div className="px-4 pb-3">
                        <SearchBar
                            autoFocus
                            value={query}
                            onChange={setQuery}
                            placeholder={t('mdt.searchReports', 'Title or reference')}
                            pillClassName="gap-2 rounded-[9px] bg-black/[0.05] px-2.5 py-[6px] dark:bg-white/[0.08]"
                            iconClassName="h-[15px] w-[15px] text-black/45 dark:text-white/45"
                            textClassName="text-[14px] font-medium text-black placeholder-black/40 dark:text-white dark:placeholder-white/40"
                        />
                    </div>
                    {rows.length === 0 ? (
                        <div className="px-4 py-8">
                            <EmptyState
                                center
                                icon={FileText}
                                title={loading ? t('mdt.searching', 'Searching') : t('mdt.noReportsToLink', 'Nothing to pick')}
                                subtitle={loading
                                    ? undefined
                                    : t('mdt.noReportsToLinkSub', 'Nothing matches that search, or every match is already attached.')}
                            />
                        </div>
                    ) : (
                        <Scroller className="min-h-0 flex-1 px-1 pb-2">
                            {rows.map(row => (
                                <button
                                    key={row.ref}
                                    type="button"
                                    onClick={() => onPick(row.ref)}
                                    className={`flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-left ${mdtRowHover}`}
                                >
                                    <span className={`shrink-0 ${mdtRef}`}>{row.ref}</span>
                                    <span className={`min-w-0 flex-1 truncate ${mdtRowTitle}`}>{row.title}</span>
                                    <Pill tone={reportTypeTone(row.type)}>{reportTypeLabel(row.type)}</Pill>
                                </button>
                            ))}
                        </Scroller>
                    )}
                </MdtCard>
            </div>
        </div>
    );

    return root ? createPortal(overlay, root) : overlay;
}
