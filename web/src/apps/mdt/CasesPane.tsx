import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';

import { t } from '@/i18n';
import { formatListDate } from '@/lib/time';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Pill } from '@/ui/Pill';
import { SegmentedControl } from '@/ui/SegmentedControl';

import {
    CASE_PRIORITIES, CASE_STATUSES, CaseFile, casePriorityLabel, caseStatusLabel,
} from './CaseFile';
import type { CasePriority, CaseStatus, CaseSummary } from './data';
import { mdtCases } from './mdtApi';
import { useMdtSession } from './useMdtSession';
import { mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtSegmented, STATUS_TONE } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';

type StatusFilter = CaseStatus | 'all';
type PriorityFilter = CasePriority | 'all';

const NEW_CASE = 'new';

function CaseListRow({ file, selected, onPress }: {
    file:     CaseSummary;
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
                <Pill tone={STATUS_TONE[file.status] ?? 'blue'}>{caseStatusLabel(file.status)}</Pill>
            </span>
            <span className={`flex w-full items-center gap-2 ${mdtRowMeta}`}>
                <Pill tone={STATUS_TONE[file.priority] ?? 'orange'}>{casePriorityLabel(file.priority)}</Pill>
                <span className="truncate tabular-nums">
                    {file.officers === 1
                        ? t('mdt.oneOfficer', '1 officer')
                        : t('mdt.nOfficers', '{n} officers', { n: file.officers })}
                </span>
                <span className="ml-auto shrink-0 tabular-nums">{formatListDate(file.updatedAt * 1000)}</span>
            </span>
        </button>
    );
}

export function CasesPane() {
    const { can, selected, select } = useMdtSession();

    const [status, setStatus] = useSessionState<StatusFilter>('mdt:cases:status', 'all');
    const [priority, setPriority] = useSessionState<PriorityFilter>('mdt:cases:priority', 'all');
    const [query, setQuery] = useSessionState('mdt:cases:query', '');
    const [page, setPage] = useSessionState('mdt:cases:page', 1);
    const [term, setTerm] = useState(query.trim());

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, status, priority, setPage]);

    const { data, loading, settled, refetch } = useAsyncData(
        () => mdtCases({
            query:    term,
            status:   status === 'all' ? undefined : status,
            priority: priority === 'all' ? undefined : priority,
            page,
        }),
        [term, status, priority, page],
    );

    const rows = data?.rows ?? [];
    const total = data?.total ?? 0;
    const pageSize = data?.pageSize ?? 25;

    const empty = (
        <EmptyState
            center
            icon={FolderOpen}
            title={term ? t('mdt.noMatchingCases', 'No matching cases') : t('mdt.noCases', 'No case files')}
            subtitle={loading
                ? undefined
                : term
                    ? t('mdt.noMatchingCasesSub', 'Nothing matches that title or reference.')
                    : t('mdt.noCasesSub', 'A case groups the reports and the people of one investigation.')}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.cases', 'Cases')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.searchCases', 'Title or reference')}
            action={can('cases.create') ? (
                <MdtButton size="sm" onClick={() => select(NEW_CASE)}>
                    {t('mdt.newCase', 'Create')}
                </MdtButton>
            ) : undefined}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            footer={<Pager page={data?.page ?? page} pageSize={pageSize} total={total} onPage={setPage} />}
        >
            <div className="flex flex-col gap-2 px-3 pb-2">
                <SegmentedControl<StatusFilter>
                    className={mdtSegmented}
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: 'all', label: t('common.all', 'All') },
                        ...CASE_STATUSES.map((s: CaseStatus) => ({ value: s as StatusFilter, label: caseStatusLabel(s) })),
                    ]}
                />
                <SegmentedControl<PriorityFilter>
                    className={mdtSegmented}
                    value={priority}
                    onChange={setPriority}
                    options={[
                        { value: 'all', label: t('mdt.anyPriority', 'Any priority') },
                        ...CASE_PRIORITIES.map((p: CasePriority) => ({ value: p as PriorityFilter, label: casePriorityLabel(p) })),
                    ]}
                />
            </div>

            <div className="mdt-stagger flex flex-col gap-0.5 px-1">
                {rows.map(row => (
                    <CaseListRow
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
                <CaseFile
                    key={selected}
                    caseRef={selected === NEW_CASE ? null : selected}
                    onSaved={file => { select(file.ref); refetch(); }}
                    onDeleted={() => { select(null); refetch(); }}
                    onClose={() => select(null)}
                    onChanged={refetch}
                />
            ) : undefined}
            placeholder={
                <EmptyState
                    center
                    icon={FolderOpen}
                    title={t('mdt.pickCase', 'No case selected')}
                    subtitle={t('mdt.pickCaseSub', 'Open a case to see its reports, the officers on it and the running notes.')}
                />
            }
            onCloseDetail={() => select(null)}
        />
    );
}
