import { useEffect, useMemo, useRef, useState } from 'react';
import { Gavel, Landmark, Link2, Send, UserPlus } from 'lucide-react';

import { getLocaleTag, t } from '@/i18n';
import { format12h, formatListDate, formatMediumDate } from '@/lib/time';
import { useAsyncData } from '@/hooks/useAsyncData';
import { DrumWheel } from '@/ui/DrumWheel';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import type { PillTone } from '@/ui/Pill';
import { Select } from '@/ui/Select';
import { Sheet } from '@/ui/Sheet';
import { TimeWheel } from '@/ui/TimeWheel';

import { ChargePicker } from './ChargePicker';
import {
    COURT_NOTE_KINDS, COURT_PLEAS, COURT_STATUSES, COURT_VERDICTS,
    type ChargeInput, type CourtDetail, type CourtNoteKind, type CourtPlea, type CourtStatus,
    type CourtVerdict, type EvidenceItem,
} from './data';
import { mdtCourtFile, mdtCourtGet, mdtCourtManage, mdtCourtNote, mdtCourtRule } from './mdtApi';
import { PersonPicker } from './PersonPicker';
import { ReportLinker } from './ReportEditor';
import { useMdtSession } from './useMdtSession';
import { mdtFieldArea, mdtFieldBase, mdtPanePad, mdtRef, mdtRowMeta, mdtRuleX, mdtSectionHeader,
         STATUS_TONE } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';
import { MdtCard } from './ui/MdtCard';
import { MdtEvidence } from './ui/MdtEvidence';
import { MdtField } from './ui/MdtField';
import { MdtRichField } from './ui/MdtRichField';
import { MdtRichText } from './ui/MdtRichText';

export function courtStatusLabel(status: string): string {
    switch (status) {
        case 'arraigned': return t('mdt.courtArraigned', 'Arraigned');
        case 'scheduled': return t('mdt.courtScheduled', 'Scheduled');
        case 'trial':     return t('mdt.courtTrial', 'In trial');
        case 'closed':    return t('mdt.courtClosed', 'Decided');
        case 'dismissed': return t('mdt.courtDismissed', 'Dismissed');
        default:          return t('mdt.courtFiled', 'Filed');
    }
}

export function courtStatusTone(status: string): PillTone {
    if (status === 'closed') return 'green';
    if (status === 'dismissed') return 'orange';
    if (status === 'trial') return 'red';
    return 'blue';
}

export function courtPleaLabel(plea: string): string {
    if (plea === 'guilty') return t('mdt.pleaGuilty', 'Guilty');
    if (plea === 'no_contest') return t('mdt.pleaNoContest', 'No contest');
    return t('mdt.pleaNotGuilty', 'Not guilty');
}

export function courtVerdictLabel(verdict: string): string {
    switch (verdict) {
        case 'guilty':     return t('mdt.verdictGuilty', 'Guilty');
        case 'not_guilty': return t('mdt.verdictNotGuilty', 'Not guilty');
        case 'dismissed':  return t('mdt.verdictDismissed', 'Dismissed');
        case 'mistrial':   return t('mdt.verdictMistrial', 'Mistrial');
        default:           return t('mdt.verdictPlea', 'Plea agreement');
    }
}

function noteKindLabel(kind: string): string {
    if (kind === 'motion') return t('mdt.courtMotion', 'Motion');
    if (kind === 'filing') return t('mdt.courtFiling', 'Filing');
    if (kind === 'ruling') return t('mdt.courtRuling', 'Ruling');
    return t('mdt.courtNote', 'Note');
}

function noteKindTone(kind: string): PillTone {
    if (kind === 'ruling') return 'red';
    if (kind === 'motion') return 'orange';
    if (kind === 'filing') return 'blue';
    return 'green';
}

interface Draft {
    citizenid: string;
    defendant: string;
    title:     string;
    reportRef: string;
    charges:   ChargeInput[];
    summary:   string;
    evidence:  EvidenceItem[];
}

const EMPTY_DRAFT: Draft = {
    citizenid: '', defendant: '', title: '', reportRef: '', charges: [], summary: '', evidence: [],
};

type SeatKey = 'judge' | 'prosecutor' | 'defence';

const SEAT_COLUMNS = 'repeat(auto-fit, minmax(200px, 1fr))';
const JUDGMENT_COLUMNS = 'repeat(auto-fit, minmax(200px, 1fr))';

const SEATS_ROW_LIST_BELOW = 640;

const WHEEL_BAND = 34;
const HEARING_DAYS_BEFORE = 7;
const HEARING_DAYS_AFTER = 90;
const DEFAULT_HEARING_TIME = '09:00';

function pad2(n: number): string {
    return String(n).padStart(2, '0');
}

function startOfDay(ms: number): Date {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function hearingDays(at: number | null): Date[] {
    const today = startOfDay(Date.now()).getTime();
    const current = at ? startOfDay(at * 1000).getTime() : today;

    const first = new Date(Math.min(today, current));
    first.setDate(first.getDate() - HEARING_DAYS_BEFORE);
    const last = new Date(Math.max(today, current));
    last.setDate(last.getDate() + HEARING_DAYS_AFTER);

    const days: Date[] = [];
    for (const cur = new Date(first); cur.getTime() <= last.getTime(); cur.setDate(cur.getDate() + 1)) {
        days.push(new Date(cur));
    }
    return days;
}

function dayLabel(day: Date, today: number): string {
    if (day.getTime() === today) return t('mdt.courtToday', 'Today');
    return day.toLocaleDateString(getLocaleTag(), { weekday: 'short', month: 'short', day: 'numeric' });
}

function hearingLabel(at: number | null): string {
    if (!at) return t('mdt.courtNoDate', 'Not listed');
    const d = new Date(at * 1000);
    return `${formatMediumDate(at)}, ${format12h(d.getHours(), d.getMinutes())}`;
}

function HearingSheet({ at, accent, onPick, onClose }: {
    at:      number | null;
    accent?: string;
    onPick:  (at: number | null) => void;
    onClose: () => void;
}) {
    const days = useMemo(() => hearingDays(at), [at]);
    const today = startOfDay(Date.now()).getTime();
    const labels = useMemo(() => days.map(day => dayLabel(day, today)), [days, today]);

    const [dayIndex, setDayIndex] = useState(() => {
        const target = startOfDay(at ? at * 1000 : Date.now()).getTime();
        const found = days.findIndex(day => day.getTime() === target);
        return found < 0 ? 0 : found;
    });
    const [time, setTime] = useState(() => {
        if (!at) return DEFAULT_HEARING_TIME;
        const d = new Date(at * 1000);
        return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    });

    function commit(close: () => void) {
        const day = days[Math.min(Math.max(dayIndex, 0), days.length - 1)];
        const [hh, mm] = time.split(':');
        const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(hh) || 0, Number(mm) || 0);
        onPick(Math.floor(when.getTime() / 1000));
        close();
    }

    return (
        <Sheet
            onClose={onClose}
            fit="content"
            title={t('mdt.courtListed', 'Listed for')}
            className="bg-base font-sf"
        >
            {({ close }) => (
                <>
                    <div className="relative px-4 pt-1">
                        <div
                            className="pointer-events-none absolute inset-x-4 rounded-[8px] bg-[rgba(120,120,128,0.16)] dark:bg-[rgba(120,120,128,0.24)]"
                            style={{ top: 4 + WHEEL_BAND, height: WHEEL_BAND }}
                        />
                        <div className="relative flex justify-center">
                            <DrumWheel
                                values={labels}
                                index={dayIndex}
                                onChange={setDayIndex}
                                width={264}
                                bandHeight={WHEEL_BAND}
                                fontSize={20}
                                fontWeight={400}
                                showBand={false}
                            />
                        </div>
                    </div>

                    <TimeWheel value={time} onChange={setTime} open />

                    <div className="flex items-center gap-3 px-5 pb-1 pt-3">
                        {at !== null && (
                            <MdtButton variant="destructive" size="sm" onClick={() => { onPick(null); close(); }}>
                                {t('mdt.courtClearDate', 'Clear date')}
                            </MdtButton>
                        )}
                        <span className="flex-1" />
                        <MdtButton variant="text" size="sm" onClick={close}>
                            {t('common.cancel', 'Cancel')}
                        </MdtButton>
                        <MdtButton size="sm" accent={accent} onClick={() => commit(close)}>
                            {t('common.save', 'Save')}
                        </MdtButton>
                    </div>
                </>
            )}
        </Sheet>
    );
}

function BarSeats({ seats, canManage, onSeat }: {
    seats:     { key: SeatKey; label: string; name: string | null }[];
    canManage: boolean;
    onSeat:    (key: SeatKey) => void;
}) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [rows, setRows] = useState(false);

    useEffect(() => {
        const el = hostRef.current;
        if (!el) return;
        const measure = () => setRows(el.clientWidth < SEATS_ROW_LIST_BELOW);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    if (rows) {
        return (
            <div ref={hostRef}>
                <MdtCard className="overflow-hidden">
                    {seats.map((seat, i) => (
                        <div key={seat.key}>
                            {i > 0 && <div className={mdtRuleX} />}
                            <div className="flex items-center gap-3 px-4 py-3">
                                <span className={`w-[86px] shrink-0 truncate ${mdtSectionHeader}`}>{seat.label}</span>
                                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-black dark:text-white">
                                    {seat.name || t('mdt.courtVacant', 'Vacant')}
                                </span>
                                {canManage && (
                                    <MdtButton variant="text" size="sm" onClick={() => onSeat(seat.key)}>
                                        {seat.name ? t('mdt.change', 'Change') : t('mdt.courtSeat', 'Seat')}
                                    </MdtButton>
                                )}
                            </div>
                        </div>
                    ))}
                </MdtCard>
            </div>
        );
    }

    return (
        <div ref={hostRef} className="grid gap-3" style={{ gridTemplateColumns: SEAT_COLUMNS }}>
            {seats.map(seat => (
                <MdtCard key={seat.key} className="flex flex-col gap-1 p-4">
                    <span className={mdtSectionHeader}>{seat.label}</span>
                    <span className="truncate text-[15px] font-semibold text-black dark:text-white">
                        {seat.name || t('mdt.courtVacant', 'Vacant')}
                    </span>
                    {canManage && (
                        <MdtButton variant="text" size="sm" className="self-start" onClick={() => onSeat(seat.key)}>
                            {seat.name ? t('mdt.change', 'Change') : t('mdt.courtSeat', 'Seat')}
                        </MdtButton>
                    )}
                </MdtCard>
            ))}
        </div>
    );
}

export function CourtCase({ caseRef, onSaved, onClose, onChanged }: {
    caseRef:    string | null;
    onSaved:    (file: CourtDetail) => void;
    onClose:    () => void;
    onChanged?: () => void;
}) {
    const { can, department } = useMdtSession();
    const bench = department?.bench === true;

    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [picking, setPicking] = useState(false);
    const [linking, setLinking] = useState(false);
    const [seating, setSeating] = useState<SeatKey | null>(null);
    const [listing, setListing] = useState(false);
    const [saving, setSaving] = useState(false);

    const [note, setNote] = useState('');
    const [kind, setKind] = useState<CourtNoteKind>('note');

    const [ruling, setRuling] = useState(false);
    const [verdict, setVerdict] = useState<CourtVerdict>('guilty');
    const [months, setMonths] = useState('0');
    const [fine, setFine] = useState('0');
    const [reasons, setReasons] = useState('');

    const [file, setFile] = useState<CourtDetail | null>(null);
    const { loading } = useAsyncData(
        () => (caseRef ? mdtCourtGet(caseRef) : Promise.resolve(null)),
        [caseRef],
        { onData: setFile },
    );

    async function create() {
        if (!draft.citizenid || !draft.title.trim() || saving) return;
        setSaving(true);
        const made = await mdtCourtFile({
            citizenid: draft.citizenid,
            title:     draft.title.trim(),
            reportRef: draft.reportRef || undefined,
            charges:   draft.reportRef ? undefined : draft.charges,
            summary:   draft.summary,
            evidence:  draft.evidence,
        });
        setSaving(false);
        if (made) onSaved(made);
    }

    async function manage(input: Parameters<typeof mdtCourtManage>[0]) {
        if (saving) return;
        setSaving(true);
        const next = await mdtCourtManage(input);
        setSaving(false);
        if (next) { setFile(next); onChanged?.(); }
    }

    async function addNote() {
        const body = note.trim();
        if (!body || !file || saving) return;
        setSaving(true);
        const notes = await mdtCourtNote(file.ref, body, kind);
        setSaving(false);
        if (notes) { setNote(''); setFile({ ...file, notes }); }
    }

    async function decide() {
        if (!file || saving) return;
        setSaving(true);
        const next = await mdtCourtRule({
            ref:            file.ref,
            verdict,
            sentenceMonths: Math.max(0, Math.floor(Number(months) || 0)),
            sentenceFine:   Math.max(0, Math.floor(Number(fine) || 0)),
            ruling:         reasons,
        });
        setSaving(false);
        if (next) { setFile(next); setRuling(false); onChanged?.(); }
    }

    if (!caseRef) {
        return (
            <>
                <Scroller className={`h-full ${mdtPanePad}`}>
                    <h1 className="text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                        {t('mdt.courtNewTitle', 'File a case')}
                    </h1>
                    <p className="mt-1 text-[13px] text-ios-gray">
                        {t('mdt.courtNewSub', 'Attach the police report and the charges come from it. Name charges by hand only when there is no report.')}
                    </p>

                    <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.courtDefendant', 'Defendant')}</div>
                    <MdtCard className="flex items-center gap-3 p-4">
                        <span className="min-w-0 flex-1 truncate text-[15px] text-black dark:text-white">
                            {draft.defendant || t('mdt.courtNoDefendant', 'Nobody selected yet.')}
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

                    <div className="mt-4">
                        <MdtField
                            label={t('mdt.title', 'Title')}
                            value={draft.title}
                            onChange={title => setDraft(d => ({ ...d, title }))}
                            maxLength={160}
                            placeholder={t('mdt.courtTitleHint', 'The People v. Surname')}
                        />
                    </div>

                    <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.courtSource', 'Police report')}</div>
                    <MdtCard className="flex items-center gap-3 p-4">
                        <span className="min-w-0 flex-1 truncate text-[15px] text-black dark:text-white">
                            {draft.reportRef || t('mdt.courtNoReport', 'None attached. Charges will be entered by hand.')}
                        </span>
                        <MdtButton
                            variant="text"
                            size="sm"
                            icon={<Link2 className="h-[14px] w-[14px]" strokeWidth={2.4} />}
                            onClick={() => setLinking(true)}
                        >
                            {draft.reportRef ? t('mdt.change', 'Change') : t('mdt.courtAttach', 'Attach')}
                        </MdtButton>
                    </MdtCard>

                    {!draft.reportRef && (
                        <div className="mt-5">
                            <div className={`mb-2 px-1 ${mdtSectionHeader}`}>{t('mdt.charges', 'Charges')}</div>
                            <ChargePicker
                                lines={draft.charges}
                                onChange={charges => setDraft(d => ({ ...d, charges }))}
                            />
                        </div>
                    )}

                    <div className="mt-5">
                        <MdtRichField
                            label={t('mdt.courtCaseSummary', 'Statement of the case')}
                            rows={6}
                            value={draft.summary}
                            onChange={summary => setDraft(d => ({ ...d, summary }))}
                            maxLength={6000}
                            placeholder={t('mdt.courtSummaryHint', 'What the state alleges and what it intends to prove.')}
                        />
                    </div>

                    <div className="mt-5">
                        <MdtEvidence
                            label={t('mdt.evidence', 'Exhibits')}
                            items={draft.evidence}
                            onChange={evidence => setDraft(d => ({ ...d, evidence }))}
                        />
                    </div>

                    <div className="mt-6 flex items-center gap-3 pb-4">
                        <MdtButton
                            disabled={!draft.citizenid || !draft.title.trim() || (!draft.reportRef && draft.charges.length === 0) || saving}
                            onClick={() => void create()}
                        >
                            {saving ? t('mdt.saving', 'Saving') : t('mdt.courtOpenCase', 'File case')}
                        </MdtButton>
                        <MdtButton variant="text" onClick={onClose}>{t('common.cancel', 'Cancel')}</MdtButton>
                    </div>
                </Scroller>

                {picking && (
                    <PersonPicker
                        title={t('mdt.courtPickDefendant', 'Select a defendant')}
                        onPick={person => {
                            setDraft(d => ({ ...d, citizenid: person.citizenid, defendant: person.name }));
                            setPicking(false);
                        }}
                        onClose={() => setPicking(false)}
                    />
                )}
                {linking && (
                    <ReportLinker
                        title={t('mdt.courtPickReport', 'Attach a report')}
                        onPick={ref => { setDraft(d => ({ ...d, reportRef: ref })); setLinking(false); }}
                        onClose={() => setLinking(false)}
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
                icon={Landmark}
                title={t('mdt.courtGone', 'Case unavailable')}
                subtitle={t('mdt.courtGoneSub', 'It is no longer on the docket.')}
            />
        );
    }

    const live = file.status !== 'closed' && file.status !== 'dismissed';
    const canManage = bench && can('court.manage') && live;
    const months2 = file.charges.reduce((sum, c) => sum + c.months * c.count, 0);
    const fine2 = file.charges.reduce((sum, c) => sum + c.fine * c.count, 0);

    const seats: { key: SeatKey; label: string; name: string | null }[] = [
        { key: 'judge',      label: t('mdt.courtJudge', 'Bench'),       name: file.judge },
        { key: 'prosecutor', label: t('mdt.courtProsecutor', 'State'),  name: file.prosecutor },
        { key: 'defence',    label: t('mdt.courtDefence', 'Defence'),   name: file.defence },
    ];

    return (
        <>
            <Scroller className={`h-full ${mdtPanePad}`}>
                <span className={mdtRef}>{file.ref}</span>
                <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                    {file.title}
                </h1>
                <div className="mt-1 text-[13px] text-ios-gray">
                    {t('mdt.courtFiledBy', 'Filed by {name} on {date}', {
                        name: file.filedBy,
                        date: formatMediumDate(file.createdAt),
                    })}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                    {canManage ? (
                        <Select<CourtStatus>
                            value={file.status}
                            onChange={status => void manage({ ref: file.ref, status })}
                            options={COURT_STATUSES.filter(s => s !== 'closed' && s !== 'dismissed')
                                .map((s: CourtStatus) => ({ value: s, label: courtStatusLabel(s) }))}
                            size="sm"
                            ariaLabel={t('mdt.status', 'Status')}
                        />
                    ) : (
                        <Pill tone={courtStatusTone(file.status)}>{courtStatusLabel(file.status)}</Pill>
                    )}

                    {canManage ? (
                        <Select<CourtPlea>
                            value={file.plea ?? 'not_guilty'}
                            onChange={plea => void manage({ ref: file.ref, plea })}
                            options={COURT_PLEAS.map((p: CourtPlea) => ({ value: p, label: courtPleaLabel(p) }))}
                            size="sm"
                            ariaLabel={t('mdt.courtPlea', 'Plea')}
                        />
                    ) : file.plea ? (
                        <Pill tone={file.plea === 'guilty' ? 'red' : 'blue'}>{courtPleaLabel(file.plea)}</Pill>
                    ) : null}

                    {file.verdict && (
                        <Pill tone={file.verdict === 'guilty' ? 'red' : 'green'}>{courtVerdictLabel(file.verdict)}</Pill>
                    )}
                    <span className={`tabular-nums ${mdtRowMeta}`}>
                        {t('mdt.updatedAt', 'Updated {date}', { date: formatListDate(file.updatedAt * 1000) })}
                    </span>
                </div>

                <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.courtHearing', 'Hearing')}</div>
                <MdtCard className="flex flex-wrap items-center gap-4 p-4">
                    {canManage ? (
                        <button
                            type="button"
                            onClick={() => setListing(true)}
                            className="flex min-w-0 items-center gap-3 text-left transition-opacity duration-150 active:opacity-60"
                        >
                            <span className={`shrink-0 ${mdtSectionHeader}`}>{t('mdt.courtListed', 'Listed for')}</span>
                            <span className={`min-w-0 px-3 py-1.5 text-[14px] ${mdtFieldBase}`}>
                                {hearingLabel(file.hearingAt)}
                            </span>
                        </button>
                    ) : (
                        <span className="text-[15px] text-black dark:text-white">{hearingLabel(file.hearingAt)}</span>
                    )}
                    <span className="flex-1" />
                    {file.reportRef && <Pill tone="blue">{file.reportRef}</Pill>}
                </MdtCard>

                <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.courtBar', 'At the bar')}</div>
                <BarSeats seats={seats} canManage={canManage} onSeat={setSeating} />

                <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.charges', 'Charges')}</div>
                <MdtCard className="p-4">
                    {file.charges.length === 0 ? (
                        <span className="text-[15px] text-ios-gray">{t('mdt.courtNoCharges', 'No charges are recorded.')}</span>
                    ) : (
                        <>
                            <div className="flex flex-col gap-2">
                                {file.charges.map((c, i) => (
                                    <div key={`${c.code}:${i}`} className="flex items-center gap-3">
                                        <span className={`shrink-0 ${mdtRef}`}>{c.code}</span>
                                        <span className="min-w-0 flex-1 truncate text-[14.5px] text-black dark:text-white">{c.label}</span>
                                        {c.count > 1 && <span className={mdtRowMeta}>{`x${c.count}`}</span>}
                                        <Pill tone={STATUS_TONE[c.class] ?? 'blue'}>{c.class}</Pill>
                                    </div>
                                ))}
                            </div>
                            <div className={`mt-3 border-t border-black/[0.08] pt-3 tabular-nums dark:border-white/[0.10] ${mdtRowMeta}`}>
                                {t('mdt.courtExposure', 'Maximum exposure: {months} months and ${fine}', {
                                    months: months2,
                                    fine:   fine2.toLocaleString(),
                                })}
                            </div>
                        </>
                    )}
                </MdtCard>

                {(file.summary || canManage) && (
                    <>
                        <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.courtCaseSummary', 'Statement of the case')}</div>
                        <MdtCard className="p-4">
                            {file.summary
                                ? <MdtRichText text={file.summary} className="text-[15px] text-black dark:text-white" />
                                : <span className="text-[15px] text-ios-gray">{t('mdt.courtNoSummary', 'Nothing filed.')}</span>}
                        </MdtCard>
                    </>
                )}

                {(file.evidence.length > 0 || canManage) && (
                    <div className="mt-5">
                        <MdtEvidence
                            label={t('mdt.evidence', 'Exhibits')}
                            items={file.evidence}
                            onChange={canManage ? evidence => void manage({ ref: file.ref, evidence }) : undefined}
                        />
                    </div>
                )}

                <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.courtDocket', 'Docket')}</div>
                <MdtCard className="p-4">
                    {file.notes.length === 0 ? (
                        <span className="text-[15px] text-ios-gray">{t('mdt.courtNoDocket', 'Nothing has been entered on the record.')}</span>
                    ) : (
                        <div className="mdt-stagger flex flex-col gap-3">
                            {file.notes.map((n, i) => (
                                <div key={`${n.createdAt}:${i}`} className="border-l-2 border-black/[0.10] pl-3 dark:border-white/[0.14]">
                                    <div className="flex flex-wrap items-baseline gap-2">
                                        <Pill tone={noteKindTone(n.kind)}>{noteKindLabel(n.kind)}</Pill>
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

                    {can('court.file') && live && (
                        <div className="mt-4 flex flex-col gap-2">
                            <div className="max-w-[200px]">
                                <Select<CourtNoteKind>
                                    value={kind}
                                    onChange={setKind}
                                    options={COURT_NOTE_KINDS
                                        .filter(k => k !== 'ruling' || bench)
                                        .map((k: CourtNoteKind) => ({ value: k, label: noteKindLabel(k) }))}
                                    size="sm"
                                    ariaLabel={t('mdt.courtEntryKind', 'Entry type')}
                                />
                            </div>
                            <div className="flex items-start gap-2">
                                <textarea
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    rows={2}
                                    maxLength={2000}
                                    placeholder={t('mdt.courtEntryHint', 'What is being entered on the record.')}
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
                        </div>
                    )}
                </MdtCard>

                <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.courtJudgment', 'Judgment')}</div>
                <MdtCard className="p-4">
                    {file.verdict ? (
                        <>
                            <div className="flex flex-wrap items-center gap-3">
                                <Pill tone={file.verdict === 'guilty' ? 'red' : 'green'}>{courtVerdictLabel(file.verdict)}</Pill>
                                {file.sentenceMonths > 0 && (
                                    <span className="text-[15px] tabular-nums text-black dark:text-white">
                                        {t('mdt.courtMonths', '{n} months', { n: file.sentenceMonths })}
                                    </span>
                                )}
                                {file.sentenceFine > 0 && (
                                    <span className="text-[15px] tabular-nums text-black dark:text-white">
                                        {`$${file.sentenceFine.toLocaleString()}`}
                                    </span>
                                )}
                            </div>
                            {file.ruling && <MdtRichText text={file.ruling} className="mt-3 text-[15px] text-black dark:text-white" />}
                        </>
                    ) : !(bench && can('court.rule')) ? (
                        <span className="text-[15px] text-ios-gray">{t('mdt.courtUndecided', 'This case has not been decided.')}</span>
                    ) : ruling ? (
                        <>
                            <div className="grid gap-4" style={{ gridTemplateColumns: JUDGMENT_COLUMNS }}>
                                <MdtField
                                    label={t('mdt.courtVerdict', 'Verdict')}
                                    value={verdict}
                                    onChange={v => setVerdict(v as CourtVerdict)}
                                    options={COURT_VERDICTS.map((v: CourtVerdict) => ({ value: v, label: courtVerdictLabel(v) }))}
                                />
                                <MdtField
                                    label={t('mdt.courtSentenceMonths', 'Custody, months')}
                                    value={months}
                                    onChange={setMonths}
                                    inputMode="numeric"
                                    disabled={verdict !== 'guilty' && verdict !== 'plea'}
                                />
                                <MdtField
                                    label={t('mdt.courtSentenceFine', 'Fine')}
                                    value={fine}
                                    onChange={setFine}
                                    inputMode="numeric"
                                    disabled={verdict !== 'guilty' && verdict !== 'plea'}
                                />
                            </div>
                            <div className="mt-4">
                                <MdtRichField
                                    label={t('mdt.courtReasons', 'Reasons')}
                                    rows={5}
                                    value={reasons}
                                    onChange={setReasons}
                                    maxLength={6000}
                                    placeholder={t('mdt.courtReasonsHint', 'The findings of fact and the law applied to them.')}
                                />
                            </div>
                            <div className="mt-4 flex items-center gap-3">
                                <MdtButton disabled={saving} onClick={() => void decide()}>
                                    {saving ? t('mdt.saving', 'Saving') : t('mdt.courtEnterJudgment', 'Enter judgment')}
                                </MdtButton>
                                <MdtButton variant="text" onClick={() => setRuling(false)}>{t('common.cancel', 'Cancel')}</MdtButton>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="min-w-0 flex-1 text-[15px] text-ios-gray">
                                {t('mdt.courtUndecided', 'This case has not been decided.')}
                            </span>
                            <MdtButton
                                size="sm"
                                icon={<Gavel className="h-[14px] w-[14px]" strokeWidth={2.4} />}
                                onClick={() => setRuling(true)}
                            >
                                {t('mdt.courtRuleNow', 'Rule')}
                            </MdtButton>
                        </div>
                    )}
                </MdtCard>

                <div className="h-6" />
            </Scroller>

            {seating && (
                <PersonPicker
                    title={t('mdt.courtSeatTitle', 'Seat a party')}
                    onPick={person => {
                        void manage({ ref: file.ref, [seating]: person.citizenid });
                        setSeating(null);
                    }}
                    onClose={() => setSeating(null)}
                />
            )}

            {listing && (
                <HearingSheet
                    at={file.hearingAt}
                    accent={department?.accent}
                    onPick={hearingAt => void manage({ ref: file.ref, hearingAt })}
                    onClose={() => setListing(false)}
                />
            )}
        </>
    );
}
