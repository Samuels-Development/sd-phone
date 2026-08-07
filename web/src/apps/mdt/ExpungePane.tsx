import { useEffect, useState } from 'react';
import { Eraser, Gavel, UserPlus } from 'lucide-react';

import { device } from '@device';
import { t } from '@/i18n';
import { formatListDate, formatMediumDate } from '@/lib/time';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { SegmentedControl } from '@/ui/SegmentedControl';
import type { PillTone } from '@/ui/Pill';

import { PETITION_STATUSES, type Petition, type PetitionStatus } from './data';
import { mdtPetitionFile, mdtPetitionRule, mdtPetitions } from './mdtApi';
import { PersonPicker } from './PersonPicker';
import { ReportLinker } from './ReportEditor';
import { useMdtSession } from './useMdtSession';
import { mdtPanePad, mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtSectionHeader, mdtSegmented } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';
import { MdtCard } from './ui/MdtCard';
import { MdtRichField } from './ui/MdtRichField';
import { MdtRichText } from './ui/MdtRichText';

type StatusFilter = PetitionStatus | 'all';

const NEW_PETITION = 'new';

const isPhone = device.id === 'phone';

export function petitionStatusLabel(status: string): string {
    if (status === 'granted') return t('mdt.exGranted', 'Granted');
    if (status === 'denied') return t('mdt.exDenied', 'Denied');
    return t('mdt.exPending', 'Pending');
}

function petitionTone(status: string): PillTone {
    if (status === 'granted') return 'green';
    if (status === 'denied') return 'red';
    return 'orange';
}

function PetitionRow({ petition, selected, onPress }: {
    petition: Petition;
    selected: boolean;
    onPress:  () => void;
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            className={`flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left ${
                selected ? 'bg-ios-blue/10' : mdtRowHover
            }`}
        >
            <span className="flex w-full items-center gap-2">
                <span className={`shrink-0 ${mdtRef}`}>{petition.ref}</span>
                <span className={`min-w-0 flex-1 truncate ${mdtRowTitle}`}>{petition.subject}</span>
                <Pill tone={petitionTone(petition.status)}>{petitionStatusLabel(petition.status)}</Pill>
            </span>
            <span className={`flex w-full items-center gap-2 ${mdtRowMeta}`}>
                <span className="truncate">
                    {petition.scope.length === 0
                        ? t('mdt.exWholeRecord', 'Whole record')
                        : t('mdt.exNReports', '{n} reports', { n: petition.scope.length })}
                </span>
                <span className="truncate">{t('mdt.exFiledBy', 'by {name}', { name: petition.filedBy })}</span>
                <span className="ml-auto shrink-0 tabular-nums">{formatListDate(petition.updatedAt * 1000)}</span>
            </span>
        </button>
    );
}

function PetitionDetail({ petition, onRuled }: { petition: Petition; onRuled: (p: Petition) => void }) {
    const { can, department } = useMdtSession();
    const bench = department?.bench === true;

    const [ruling, setRuling] = useState('');
    const [saving, setSaving] = useState(false);

    async function rule(grant: boolean) {
        if (saving) return;
        setSaving(true);
        const next = await mdtPetitionRule({ ref: petition.ref, grant, ruling });
        setSaving(false);
        if (next) onRuled(next);
    }

    const open = petition.status === 'pending';

    return (
        <Scroller className={`h-full ${mdtPanePad}`}>
            <span className={mdtRef}>{petition.ref}</span>
            <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                {petition.subject}
            </h1>
            <div className="mt-1 text-[13px] text-ios-gray">
                {t('mdt.exFiledOn', 'Petitioned by {name} on {date}', {
                    name: petition.filedBy,
                    date: formatMediumDate(petition.createdAt),
                })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
                <Pill tone={petitionTone(petition.status)}>{petitionStatusLabel(petition.status)}</Pill>
                {petition.status === 'granted' && (
                    <span className={`tabular-nums ${mdtRowMeta}`}>
                        {t('mdt.exCleared', '{n} charge lines sealed', { n: petition.cleared })}
                    </span>
                )}
                {petition.ruledBy && (
                    <span className={mdtRowMeta}>{t('mdt.exRuledBy', 'Ruled by {name}', { name: petition.ruledBy })}</span>
                )}
            </div>

            <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.exScope', 'Scope')}</div>
            <MdtCard className="p-4">
                {petition.scope.length === 0 ? (
                    <span className="text-[15px] text-black dark:text-white">
                        {t('mdt.exWholeRecordLong', 'Every charge on this citizen record.')}
                    </span>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {petition.scope.map(ref => <Pill key={ref} tone="blue">{ref}</Pill>)}
                    </div>
                )}
            </MdtCard>

            <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.exReason', 'Grounds')}</div>
            <MdtCard className="p-4">
                <MdtRichText text={petition.reason} className="text-[15px] text-black dark:text-white" />
            </MdtCard>

            <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.exRuling', 'Ruling')}</div>
            <MdtCard className="p-4">
                {!open ? (
                    petition.ruling
                        ? <MdtRichText text={petition.ruling} className="text-[15px] text-black dark:text-white" />
                        : <span className="text-[15px] text-ios-gray">{t('mdt.exNoReasons', 'No reasons were given.')}</span>
                ) : !(bench && can('expunge.rule')) ? (
                    <span className="text-[15px] text-ios-gray">{t('mdt.exAwaiting', 'Awaiting a ruling from the bench.')}</span>
                ) : (
                    <>
                        <MdtRichField
                            rows={4}
                            value={ruling}
                            onChange={setRuling}
                            maxLength={6000}
                            placeholder={t('mdt.exRulingHint', 'Why the petition succeeds or fails.')}
                        />
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <MdtButton
                                disabled={saving}
                                icon={<Gavel className="h-[14px] w-[14px]" strokeWidth={2.4} />}
                                onClick={() => void rule(true)}
                            >
                                {t('mdt.exGrant', 'Grant petition')}
                            </MdtButton>
                            <MdtButton variant="destructive" disabled={saving} onClick={() => void rule(false)}>
                                {t('mdt.exDeny', 'Deny')}
                            </MdtButton>
                            <span className={`min-w-[220px] flex-1 ${mdtRowMeta}`}>
                                {t('mdt.exGrantWarn', 'Granting seals the charge lines from every priors sheet at once.')}
                            </span>
                        </div>
                    </>
                )}
            </MdtCard>

            <div className="h-6" />
        </Scroller>
    );
}

function NewPetition({ onFiled, onClose }: { onFiled: (p: Petition) => void; onClose: () => void }) {
    const [citizenid, setCitizenid] = useState('');
    const [subject, setSubject] = useState('');
    const [reason, setReason] = useState('');
    const [scope, setScope] = useState<string[]>([]);
    const [picking, setPicking] = useState(false);
    const [linking, setLinking] = useState(false);
    const [saving, setSaving] = useState(false);

    async function file() {
        if (!citizenid || !reason.trim() || saving) return;
        setSaving(true);
        const made = await mdtPetitionFile({ citizenid, reason, scope });
        setSaving(false);
        if (made) onFiled(made);
    }

    return (
        <>
            <Scroller className={`h-full ${mdtPanePad}`}>
                <h1 className="text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                    {t('mdt.exNewTitle', 'Petition to expunge')}
                </h1>
                <p className="mt-1 text-[13px] text-ios-gray">
                    {t('mdt.exNewSub', 'Name the reports to seal, or leave the scope empty to petition against the whole record.')}
                </p>

                <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.exSubject', 'Petitioner')}</div>
                <MdtCard className="flex items-center gap-3 p-4">
                    <span className="min-w-0 flex-1 truncate text-[15px] text-black dark:text-white">
                        {subject || t('mdt.courtNoDefendant', 'Nobody selected yet.')}
                    </span>
                    <MdtButton
                        variant="text"
                        size="sm"
                        icon={<UserPlus className="h-[14px] w-[14px]" strokeWidth={2.4} />}
                        onClick={() => setPicking(true)}
                    >
                        {citizenid ? t('mdt.change', 'Change') : t('mdt.iaSelect', 'Select')}
                    </MdtButton>
                </MdtCard>

                <div className={`mb-2 mt-5 flex items-center gap-2 px-1`}>
                    <span className={mdtSectionHeader}>{t('mdt.exScope', 'Scope')}</span>
                    <span className="flex-1" />
                    <MdtButton variant="text" size="sm" onClick={() => setLinking(true)}>
                        {t('mdt.exAddReport', 'Add report')}
                    </MdtButton>
                </div>
                <MdtCard className="p-4">
                    {scope.length === 0 ? (
                        <span className="text-[15px] text-ios-gray">
                            {t('mdt.exWholeRecordLong', 'Every charge on this citizen record.')}
                        </span>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {scope.map(ref => (
                                <button key={ref} type="button" onClick={() => setScope(s => s.filter(r => r !== ref))}>
                                    <Pill tone="blue">{ref}</Pill>
                                </button>
                            ))}
                        </div>
                    )}
                </MdtCard>

                <div className="mt-5">
                    <MdtRichField
                        label={t('mdt.exReason', 'Grounds')}
                        rows={6}
                        value={reason}
                        onChange={setReason}
                        maxLength={6000}
                        placeholder={t('mdt.exReasonHint', 'Why this record should be sealed.')}
                    />
                </div>

                <div className="mt-6 flex items-center gap-3 pb-4">
                    <MdtButton disabled={!citizenid || !reason.trim() || saving} onClick={() => void file()}>
                        {saving ? t('mdt.saving', 'Saving') : t('mdt.exFile', 'File petition')}
                    </MdtButton>
                    <MdtButton variant="text" onClick={onClose}>{t('common.cancel', 'Cancel')}</MdtButton>
                </div>
            </Scroller>

            {picking && (
                <PersonPicker
                    title={t('mdt.exPickSubject', 'Select a petitioner')}
                    onPick={person => { setCitizenid(person.citizenid); setSubject(person.name); setPicking(false); }}
                    onClose={() => setPicking(false)}
                />
            )}
            {linking && (
                <ReportLinker
                    linked={scope}
                    title={t('mdt.exPickReport', 'Name a report')}
                    onPick={ref => { setScope(s => (s.includes(ref) ? s : [...s, ref])); setLinking(false); }}
                    onClose={() => setLinking(false)}
                />
            )}
        </>
    );
}

export function ExpungePane() {
    const { can, selected, select } = useMdtSession();

    const [status, setStatus] = useSessionState<StatusFilter>('mdt:expunge:status', 'all');
    const [query, setQuery] = useSessionState('mdt:expunge:query', '');
    const [page, setPage] = useSessionState('mdt:expunge:page', 1);
    const [term, setTerm] = useState(query.trim());

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, status, setPage]);

    const { data, loading, settled, refetch } = useAsyncData(
        () => mdtPetitions({ query: term, status: status === 'all' ? undefined : status, page }),
        [term, status, page],
    );

    const rows = data?.rows ?? [];
    const total = data?.total ?? 0;
    const current = rows.find(r => r.ref === selected) ?? null;

    const empty = (
        <EmptyState
            center
            icon={Eraser}
            title={term ? t('mdt.exNoMatch', 'No matching petitions') : t('mdt.exNone', 'No petitions')}
            subtitle={loading
                ? undefined
                : t('mdt.exNoneSub', 'A petition asks the court to seal charges from a citizen record.')}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.expunge', 'Petitions')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.exSearch', 'Petitioner or reference')}
            action={can('expunge.file') ? (
                <MdtButton size="sm" onClick={() => select(NEW_PETITION)}>
                    {t('mdt.exFileShort', 'File')}
                </MdtButton>
            ) : undefined}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            minWidth={isPhone ? 0 : undefined}
            footer={<Pager page={data?.page ?? page} pageSize={data?.pageSize ?? 25} total={total} onPage={setPage} />}
        >
            <div className="flex flex-col gap-2 px-3 pb-2">
                <SegmentedControl<StatusFilter>
                    className={mdtSegmented}
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: 'all', label: t('common.all', 'All') },
                        ...PETITION_STATUSES.map((s: PetitionStatus) => ({ value: s as StatusFilter, label: petitionStatusLabel(s) })),
                    ]}
                />
            </div>

            <div className="mdt-stagger flex flex-col gap-0.5 px-1">
                {rows.map(row => (
                    <PetitionRow
                        key={row.ref}
                        petition={row}
                        selected={row.ref === selected}
                        onPress={() => select(row.ref)}
                    />
                ))}
            </div>
        </ListColumn>
    );

    return (
        <MasterDetail
            master={master}
            hasDetail={selected !== null}
            detail={selected === NEW_PETITION ? (
                <NewPetition onFiled={p => { select(p.ref); refetch(); }} onClose={() => select(null)} />
            ) : current ? (
                <PetitionDetail key={current.ref} petition={current} onRuled={() => refetch()} />
            ) : undefined}
            placeholder={
                <EmptyState
                    center
                    icon={Eraser}
                    title={t('mdt.exPick', 'No petition selected')}
                    subtitle={t('mdt.exPickSub', 'Open a petition to read the grounds and rule on it.')}
                />
            }
            onCloseDetail={() => select(null)}
            backLabel={t('mdt.expunge', 'Petitions')}
        />
    );
}
