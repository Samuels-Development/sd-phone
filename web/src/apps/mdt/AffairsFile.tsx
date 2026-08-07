import { useState } from 'react';
import { Gavel, Send, ShieldQuestion, UserPlus } from 'lucide-react';

import { t } from '@/i18n';
import { formatListDate, formatMediumDate } from '@/lib/time';
import { useAsyncData } from '@/hooks/useAsyncData';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { Select } from '@/ui/Select';

import {
    IA_CATEGORIES, IA_DISCIPLINE, IA_DISPOSITIONS, IA_SEVERITIES, IA_STATUSES,
    type EvidenceItem, type IaCategory, type IaDetail, type IaDiscipline, type IaDisposition,
    type IaSeverity, type IaStatus,
} from './data';
import { mdtAffairsClose, mdtAffairsFile, mdtAffairsGet, mdtAffairsNote, mdtAffairsUpdate } from './mdtApi';
import { PersonPicker } from './PersonPicker';
import { useMdtSession } from './useMdtSession';
import { mdtFieldArea, mdtPanePad, mdtRef, mdtRowMeta, mdtSectionHeader, STATUS_TONE } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';
import { MdtCard } from './ui/MdtCard';
import { MdtEvidence } from './ui/MdtEvidence';
import { MdtField } from './ui/MdtField';
import { MdtRichField } from './ui/MdtRichField';
import { MdtRichText } from './ui/MdtRichText';

export function iaStatusLabel(status: string): string {
    if (status === 'investigating') return t('mdt.iaStatusInvestigating', 'Investigating');
    if (status === 'review') return t('mdt.iaStatusReview', 'Review');
    if (status === 'closed') return t('mdt.iaStatusClosed', 'Closed');
    return t('mdt.iaStatusOpen', 'Open');
}

export function iaSeverityLabel(severity: string): string {
    if (severity === 'high') return t('mdt.priorityHigh', 'High');
    if (severity === 'low') return t('mdt.priorityLow', 'Low');
    return t('mdt.priorityMedium', 'Medium');
}

export function iaCategoryLabel(category: string): string {
    switch (category) {
        case 'force':       return t('mdt.iaCatForce', 'Use of force');
        case 'corruption':  return t('mdt.iaCatCorruption', 'Corruption');
        case 'negligence':  return t('mdt.iaCatNegligence', 'Negligence');
        case 'discourtesy': return t('mdt.iaCatDiscourtesy', 'Discourtesy');
        case 'pursuit':     return t('mdt.iaCatPursuit', 'Pursuit policy');
        case 'other':       return t('mdt.iaCatOther', 'Other');
        default:            return t('mdt.iaCatMisconduct', 'Misconduct');
    }
}

export function iaDispositionLabel(disposition: string): string {
    switch (disposition) {
        case 'sustained':     return t('mdt.iaDispSustained', 'Sustained');
        case 'unfounded':     return t('mdt.iaDispUnfounded', 'Unfounded');
        case 'exonerated':    return t('mdt.iaDispExonerated', 'Exonerated');
        default:              return t('mdt.iaDispNotSustained', 'Not sustained');
    }
}

export function iaDisciplineLabel(discipline: string): string {
    switch (discipline) {
        case 'counselling': return t('mdt.iaDiscCounselling', 'Counselling');
        case 'reprimand':   return t('mdt.iaDiscReprimand', 'Written reprimand');
        case 'suspension':  return t('mdt.iaDiscSuspension', 'Suspension');
        case 'demotion':    return t('mdt.iaDiscDemotion', 'Demotion');
        case 'termination': return t('mdt.iaDiscTermination', 'Termination');
        default:            return t('mdt.iaDiscNone', 'No action');
    }
}

const DISPOSITION_TONE: Record<string, 'red' | 'orange' | 'green' | 'blue'> = {
    sustained:     'red',
    unfounded:     'green',
    exonerated:    'green',
    not_sustained: 'orange',
};

interface Draft {
    citizenid: string;
    subject:   string;
    rank:      string;
    title:     string;
    category:  IaCategory;
    severity:  IaSeverity;
    summary:   string;
    evidence:  EvidenceItem[];
}

const EMPTY_DRAFT: Draft = {
    citizenid: '', subject: '', rank: '', title: '',
    category: 'misconduct', severity: 'medium', summary: '', evidence: [],
};

export function AffairsFile({ fileRef, onSaved, onClose, onChanged }: {
    fileRef:    string | null;
    onSaved:    (file: IaDetail) => void;
    onClose:    () => void;
    onChanged?: () => void;
}) {
    const { can } = useMdtSession();

    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [picking, setPicking] = useState(false);
    const [saving, setSaving] = useState(false);
    const [note, setNote] = useState('');
    const [ruling, setRuling] = useState(false);
    const [disposition, setDisposition] = useState<IaDisposition>('sustained');
    const [discipline, setDiscipline] = useState<IaDiscipline>('reprimand');
    const [finding, setFinding] = useState('');

    const [file, setFile] = useState<IaDetail | null>(null);
    const { loading } = useAsyncData(
        () => (fileRef ? mdtAffairsGet(fileRef) : Promise.resolve(null)),
        [fileRef],
        { onData: setFile },
    );

    async function create() {
        if (!draft.citizenid || !draft.title.trim() || saving) return;
        setSaving(true);
        const made = await mdtAffairsFile({
            citizenid: draft.citizenid,
            title:     draft.title.trim(),
            category:  draft.category,
            severity:  draft.severity,
            summary:   draft.summary,
            rank:      draft.rank,
            evidence:  draft.evidence,
        });
        setSaving(false);
        if (made) onSaved(made);
    }

    async function patch(input: Parameters<typeof mdtAffairsUpdate>[0]) {
        if (saving) return;
        setSaving(true);
        const next = await mdtAffairsUpdate(input);
        setSaving(false);
        if (next) { setFile(next); onChanged?.(); }
    }

    async function addNote() {
        const body = note.trim();
        if (!body || !file || saving) return;
        setSaving(true);
        const notes = await mdtAffairsNote(file.ref, body);
        setSaving(false);
        if (notes) { setNote(''); setFile({ ...file, notes }); }
    }

    async function close() {
        if (!file || saving) return;
        setSaving(true);
        const next = await mdtAffairsClose({ ref: file.ref, disposition, discipline, finding });
        setSaving(false);
        if (next) { setFile(next); setRuling(false); onChanged?.(); }
    }

    if (!fileRef) {
        return (
            <>
                <Scroller className={`h-full ${mdtPanePad}`}>
                    <h1 className="text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                        {t('mdt.iaNewTitle', 'New complaint')}
                    </h1>
                    <p className="mt-1 text-[13px] text-ios-gray">
                        {t('mdt.iaNewSub', 'A complaint names one officer of this department. It cannot be edited away once filed.')}
                    </p>

                    <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.iaSubject', 'Subject officer')}</div>
                    <MdtCard className="flex items-center gap-3 p-4">
                        <span className="min-w-0 flex-1 truncate text-[15px] text-black dark:text-white">
                            {draft.subject || t('mdt.iaPickOfficer', 'Nobody selected yet.')}
                        </span>
                        <MdtButton
                            variant="text"
                            size="sm"
                            icon={<UserPlus className="h-[14px] w-[14px]" strokeWidth={2.4} />}
                            onClick={() => setPicking(true)}
                        >
                            {draft.citizenid ? t('mdt.change', 'Change') : t('mdt.iaSelect', 'Select')}
                        </MdtButton>
                    </MdtCard>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <MdtField
                            label={t('mdt.title', 'Title')}
                            value={draft.title}
                            onChange={title => setDraft(d => ({ ...d, title }))}
                            maxLength={160}
                            placeholder={t('mdt.iaTitleHint', 'Excessive force during arrest')}
                        />
                        <MdtField
                            label={t('mdt.iaCategory', 'Category')}
                            value={draft.category}
                            onChange={v => setDraft(d => ({ ...d, category: v as IaCategory }))}
                            options={IA_CATEGORIES.map((c: IaCategory) => ({ value: c, label: iaCategoryLabel(c) }))}
                        />
                    </div>

                    <div className="mt-4 max-w-[220px]">
                        <MdtField
                            label={t('mdt.iaSeverity', 'Severity')}
                            value={draft.severity}
                            onChange={v => setDraft(d => ({ ...d, severity: v as IaSeverity }))}
                            options={IA_SEVERITIES.map((s: IaSeverity) => ({ value: s, label: iaSeverityLabel(s) }))}
                        />
                    </div>

                    <div className="mt-5">
                        <MdtRichField
                            label={t('mdt.iaAllegation', 'Allegation')}
                            rows={7}
                            value={draft.summary}
                            onChange={summary => setDraft(d => ({ ...d, summary }))}
                            maxLength={6000}
                            placeholder={t('mdt.iaAllegationHint', 'What happened, who saw it, and what the complainant is alleging.')}
                        />
                    </div>

                    <div className="mt-5">
                        <MdtEvidence
                            label={t('mdt.evidence', 'Evidence')}
                            items={draft.evidence}
                            onChange={evidence => setDraft(d => ({ ...d, evidence }))}
                        />
                    </div>

                    <div className="mt-6 flex items-center gap-3 pb-4">
                        <MdtButton disabled={!draft.citizenid || !draft.title.trim() || saving} onClick={() => void create()}>
                            {saving ? t('mdt.saving', 'Saving') : t('mdt.iaFileComplaint', 'File complaint')}
                        </MdtButton>
                        <MdtButton variant="text" onClick={onClose}>{t('common.cancel', 'Cancel')}</MdtButton>
                    </div>
                </Scroller>

                {picking && (
                    <PersonPicker
                        title={t('mdt.iaPickTitle', 'Select an officer')}
                        onPick={person => {
                            setDraft(d => ({ ...d, citizenid: person.citizenid, subject: person.name }));
                            setPicking(false);
                        }}
                        onClose={() => setPicking(false)}
                    />
                )}
            </>
        );
    }

    if (!file) {
        if (loading) {
            return (
                <div className="flex flex-col gap-3 p-6">
                    <div className="h-20 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                    <div className="h-32 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                </div>
            );
        }
        return (
            <EmptyState
                center
                icon={ShieldQuestion}
                title={t('mdt.iaGone', 'File unavailable')}
                subtitle={t('mdt.iaGoneSub', 'It belongs to another department, or your rank does not reach it.')}
            />
        );
    }

    const open = file.status !== 'closed';
    const canWork = can('affairs.investigate') && open;

    return (
        <Scroller className={`h-full ${mdtPanePad}`}>
            <span className={mdtRef}>{file.ref}</span>
            <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                {file.title}
            </h1>
            <div className="mt-1 text-[13px] text-ios-gray">
                {t('mdt.iaFiledBy', 'Filed by {name} on {date}', {
                    name: file.filedBy,
                    date: formatMediumDate(file.createdAt),
                })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                {canWork ? (
                    <>
                        <Select<IaStatus>
                            value={file.status}
                            onChange={status => void patch({ ref: file.ref, status })}
                            options={IA_STATUSES.filter(s => s !== 'closed').map((s: IaStatus) => ({ value: s, label: iaStatusLabel(s) }))}
                            size="sm"
                            ariaLabel={t('mdt.status', 'Status')}
                        />
                        <Select<IaSeverity>
                            value={file.severity}
                            onChange={severity => void patch({ ref: file.ref, severity })}
                            options={IA_SEVERITIES.map((s: IaSeverity) => ({ value: s, label: iaSeverityLabel(s) }))}
                            size="sm"
                            ariaLabel={t('mdt.iaSeverity', 'Severity')}
                        />
                    </>
                ) : (
                    <>
                        <Pill tone={file.status === 'closed' ? 'green' : 'blue'}>{iaStatusLabel(file.status)}</Pill>
                        <Pill tone={STATUS_TONE[file.severity] ?? 'orange'}>{iaSeverityLabel(file.severity)}</Pill>
                    </>
                )}
                <Pill tone="blue">{iaCategoryLabel(file.category)}</Pill>
                <span className={`tabular-nums ${mdtRowMeta}`}>
                    {t('mdt.updatedAt', 'Updated {date}', { date: formatListDate(file.updatedAt * 1000) })}
                </span>
            </div>

            <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.iaSubject', 'Subject officer')}</div>
            <MdtCard className="flex flex-wrap items-center gap-3 p-4">
                <span className="text-[15px] font-semibold text-black dark:text-white">{file.subject}</span>
                {file.rank && <span className={mdtRowMeta}>{file.rank}</span>}
                <span className="flex-1" />
                <span className={mdtRowMeta}>
                    {file.assigned
                        ? t('mdt.iaAssignedTo', 'Investigator: {name}', { name: file.assigned })
                        : t('mdt.iaUnassigned', 'No investigator assigned')}
                </span>
            </MdtCard>

            <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.iaAllegation', 'Allegation')}</div>
            <MdtCard className="p-4">
                {file.summary
                    ? <MdtRichText text={file.summary} className="text-[15px] text-black dark:text-white" />
                    : <span className="text-[15px] text-ios-gray">{t('mdt.iaNoAllegation', 'No detail was recorded.')}</span>}
            </MdtCard>

            {(file.evidence.length > 0 || canWork) && (
                <div className="mt-5">
                    <MdtEvidence
                        label={t('mdt.evidence', 'Evidence')}
                        items={file.evidence}
                        onChange={canWork ? evidence => void patch({ ref: file.ref, evidence }) : undefined}
                    />
                </div>
            )}

            <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.iaInvestigation', 'Investigation')}</div>
            <MdtCard className="p-4">
                {file.notes.length === 0 ? (
                    <span className="text-[15px] text-ios-gray">{t('mdt.iaNoNotes', 'Nothing has been recorded yet.')}</span>
                ) : (
                    <div className="mdt-stagger flex flex-col gap-3">
                        {file.notes.map((n, i) => (
                            <div key={`${n.createdAt}:${i}`} className="border-l-2 border-black/[0.10] pl-3 dark:border-white/[0.14]">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-[13.5px] font-semibold text-black dark:text-white">{n.author}</span>
                                    <span className={`tabular-nums ${mdtRowMeta}`}>{formatListDate(n.createdAt * 1000)}</span>
                                </div>
                                <p className="mt-0.5 whitespace-pre-wrap break-words text-[14.5px] leading-snug text-black/80 dark:text-white/80">
                                    {n.body}
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                {canWork && (
                    <div className="mt-4 flex items-start gap-2">
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            rows={2}
                            maxLength={2000}
                            placeholder={t('mdt.iaNoteHint', 'What you checked and what it showed.')}
                            className={`w-full ${mdtFieldArea}`}
                        />
                        <MdtButton
                            size="sm"
                            disabled={!note.trim() || saving}
                            icon={<Send className="h-[14px] w-[14px]" strokeWidth={2.4} />}
                            onClick={() => void addNote()}
                        >
                            {t('mdt.add', 'Add')}
                        </MdtButton>
                    </div>
                )}
            </MdtCard>

            <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.iaFinding', 'Finding')}</div>
            <MdtCard className="p-4">
                {file.disposition ? (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            <Pill tone={DISPOSITION_TONE[file.disposition] ?? 'orange'}>
                                {iaDispositionLabel(file.disposition)}
                            </Pill>
                            {file.discipline && file.discipline !== 'none' && (
                                <Pill tone="red">{iaDisciplineLabel(file.discipline)}</Pill>
                            )}
                            {file.closedAt && (
                                <span className={`tabular-nums ${mdtRowMeta}`}>
                                    {t('mdt.iaClosedOn', 'Closed {date}', { date: formatMediumDate(file.closedAt) })}
                                </span>
                            )}
                        </div>
                        {file.finding && (
                            <MdtRichText text={file.finding} className="mt-3 text-[15px] text-black dark:text-white" />
                        )}
                    </>
                ) : !can('affairs.close') ? (
                    <span className="text-[15px] text-ios-gray">{t('mdt.iaOpenStill', 'This file has not been ruled on.')}</span>
                ) : ruling ? (
                    <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <MdtField
                                label={t('mdt.iaDisposition', 'Disposition')}
                                value={disposition}
                                onChange={v => setDisposition(v as IaDisposition)}
                                options={IA_DISPOSITIONS.map((d: IaDisposition) => ({ value: d, label: iaDispositionLabel(d) }))}
                            />
                            <MdtField
                                label={t('mdt.iaDiscipline', 'Discipline')}
                                value={discipline}
                                onChange={v => setDiscipline(v as IaDiscipline)}
                                options={IA_DISCIPLINE.map((d: IaDiscipline) => ({ value: d, label: iaDisciplineLabel(d) }))}
                                disabled={disposition !== 'sustained'}
                                hint={disposition !== 'sustained'
                                    ? t('mdt.iaDisciplineLocked', 'Only a sustained finding carries discipline.')
                                    : undefined}
                            />
                        </div>
                        <div className="mt-4">
                            <MdtRichField
                                label={t('mdt.iaReasons', 'Written reasons')}
                                rows={5}
                                value={finding}
                                onChange={setFinding}
                                maxLength={6000}
                                placeholder={t('mdt.iaReasonsHint', 'What the investigation established and why the finding follows from it.')}
                            />
                        </div>
                        <div className="mt-4 flex items-center gap-3">
                            <MdtButton disabled={saving} onClick={() => void close()}>
                                {saving ? t('mdt.saving', 'Saving') : t('mdt.iaCloseFile', 'Close file')}
                            </MdtButton>
                            <MdtButton variant="text" onClick={() => setRuling(false)}>
                                {t('common.cancel', 'Cancel')}
                            </MdtButton>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="min-w-0 flex-1 text-[15px] text-ios-gray">
                            {t('mdt.iaOpenStill', 'This file has not been ruled on.')}
                        </span>
                        <MdtButton
                            size="sm"
                            icon={<Gavel className="h-[14px] w-[14px]" strokeWidth={2.4} />}
                            onClick={() => setRuling(true)}
                        >
                            {t('mdt.iaEnterFinding', 'Enter finding')}
                        </MdtButton>
                    </div>
                )}
            </MdtCard>

            <div className="h-6" />
        </Scroller>
    );
}
