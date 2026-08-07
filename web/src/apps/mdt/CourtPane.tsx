import { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';

import { t } from '@/i18n';
import { formatMediumDate } from '@/lib/time';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Pill } from '@/ui/Pill';
import { Select } from '@/ui/Select';

import { CourtCase, courtStatusLabel, courtStatusTone, courtVerdictLabel } from './CourtCase';
import { COURT_STATUSES, type CourtStatus, type CourtSummary } from './data';
import { mdtCourt } from './mdtApi';
import { useMdtSession } from './useMdtSession';
import { mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';

type StatusFilter = CourtStatus | 'all';

const NEW_CASE = 'new';

function hearingLabel(at: number | null): string {
    if (!at) return t('mdt.courtNoDate', 'Not listed');
    return at * 1000 > Date.now()
        ? t('mdt.courtHearingOn', 'Hearing {date}', { date: formatMediumDate(at) })
        : formatMediumDate(at);
}

function CourtListRow({ file, selected, onPress }: {
    file:     CourtSummary;
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
                <span className={`shrink-0 ${mdtRef}`}>{file.ref}</span>
                <span className={`min-w-0 flex-1 truncate ${mdtRowTitle}`}>{file.title}</span>
                <Pill tone={courtStatusTone(file.status)}>{courtStatusLabel(file.status)}</Pill>
            </span>
            <span className={`flex w-full items-center gap-2 ${mdtRowMeta}`}>
                <span className="truncate">{file.defendant}</span>
                <span className="truncate tabular-nums">
                    {file.charges === 1
                        ? t('mdt.oneCharge', '1 charge')
                        : t('mdt.nCharges', '{n} charges', { n: file.charges })}
                </span>
                {file.verdict && <Pill tone={file.verdict === 'guilty' ? 'red' : 'green'}>{courtVerdictLabel(file.verdict)}</Pill>}
                <span className="ml-auto shrink-0 tabular-nums">{hearingLabel(file.hearingAt)}</span>
            </span>
        </button>
    );
}

export function CourtPane() {
    const { can, selected, select } = useMdtSession();

    const [status, setStatus] = useSessionState<StatusFilter>('mdt:court:status', 'all');
    const [query, setQuery] = useSessionState('mdt:court:query', '');
    const [page, setPage] = useSessionState('mdt:court:page', 1);
    const [term, setTerm] = useState(query.trim());

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, status, setPage]);

    const { data, loading, settled, refetch } = useAsyncData(
        () => mdtCourt({ query: term, status: status === 'all' ? undefined : status, page }),
        [term, status, page],
    );

    const rows = data?.rows ?? [];
    const total = data?.total ?? 0;

    const empty = (
        <EmptyState
            center
            icon={Landmark}
            title={term ? t('mdt.courtNoMatch', 'No matching cases') : t('mdt.courtNone', 'Nothing on the docket')}
            subtitle={loading
                ? undefined
                : term
                    ? t('mdt.courtNoMatchSub', 'Nothing matches that defendant or reference.')
                    : t('mdt.courtNoneSub', 'Cases filed against a defendant appear here in hearing order.')}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.court', 'Docket')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.courtSearch', 'Defendant or reference')}
            action={can('court.file') ? (
                <MdtButton size="sm" onClick={() => select(NEW_CASE)}>
                    {t('mdt.courtFileCase', 'File')}
                </MdtButton>
            ) : undefined}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            footer={<Pager page={data?.page ?? page} pageSize={data?.pageSize ?? 25} total={total} onPage={setPage} />}
        >
            <div className="flex flex-col gap-2 px-3 pb-2">
                <Select<StatusFilter>
                    value={status}
                    onChange={setStatus}
                    size="sm"
                    ariaLabel={t('mdt.status', 'Status')}
                    options={[
                        { value: 'all', label: t('mdt.courtAnyStage', 'Any stage') },
                        ...COURT_STATUSES.map((s: CourtStatus) => ({ value: s as StatusFilter, label: courtStatusLabel(s) })),
                    ]}
                />
            </div>

            <div className="mdt-stagger flex flex-col gap-0.5 px-1">
                {rows.map(row => (
                    <CourtListRow
                        key={row.ref}
                        file={row}
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
            detail={selected ? (
                <CourtCase
                    key={selected}
                    caseRef={selected === NEW_CASE ? null : selected}
                    onSaved={file => { select(file.ref); refetch(); }}
                    onClose={() => select(null)}
                    onChanged={refetch}
                />
            ) : undefined}
            placeholder={
                <EmptyState
                    center
                    icon={Landmark}
                    title={t('mdt.courtPick', 'No case selected')}
                    subtitle={t('mdt.courtPickSub', 'Open a case to read the charges, the docket timeline and the ruling.')}
                />
            }
            onCloseDetail={() => select(null)}
        />
    );
}
