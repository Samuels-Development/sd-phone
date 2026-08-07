import { useEffect, useState } from 'react';
import { ShieldQuestion } from 'lucide-react';

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

import { AffairsFile, iaCategoryLabel, iaSeverityLabel, iaStatusLabel } from './AffairsFile';
import { IA_STATUSES, type IaStatus, type IaSummary } from './data';
import { mdtAffairs } from './mdtApi';
import { useMdtSession } from './useMdtSession';
import { mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtSegmented, STATUS_TONE } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';

type StatusFilter = IaStatus | 'all';

const NEW_FILE = 'new';

const IA_TONE: Record<string, 'red' | 'orange' | 'blue' | 'green'> = {
    open:          'blue',
    investigating: 'orange',
    review:        'orange',
    closed:        'green',
};

function AffairsListRow({ file, selected, onPress }: {
    file:     IaSummary;
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
                <Pill tone={IA_TONE[file.status] ?? 'blue'}>{iaStatusLabel(file.status)}</Pill>
            </span>
            <span className={`flex w-full items-center gap-2 ${mdtRowMeta}`}>
                <Pill tone={STATUS_TONE[file.severity] ?? 'orange'}>{iaSeverityLabel(file.severity)}</Pill>
                <span className="truncate">{file.subject}</span>
                <span className="truncate text-ios-gray">{iaCategoryLabel(file.category)}</span>
                <span className="ml-auto shrink-0 tabular-nums">{formatListDate(file.updatedAt * 1000)}</span>
            </span>
        </button>
    );
}

export function AffairsPane() {
    const { can, selected, select } = useMdtSession();

    const [status, setStatus] = useSessionState<StatusFilter>('mdt:affairs:status', 'all');
    const [query, setQuery] = useSessionState('mdt:affairs:query', '');
    const [page, setPage] = useSessionState('mdt:affairs:page', 1);
    const [term, setTerm] = useState(query.trim());

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, status, setPage]);

    const { data, loading, settled, refetch } = useAsyncData(
        () => mdtAffairs({ query: term, status: status === 'all' ? undefined : status, page }),
        [term, status, page],
    );

    const rows = data?.rows ?? [];
    const total = data?.total ?? 0;

    const empty = (
        <EmptyState
            center
            icon={ShieldQuestion}
            title={term ? t('mdt.iaNoMatch', 'No matching files') : t('mdt.iaNone', 'No open complaints')}
            subtitle={loading
                ? undefined
                : term
                    ? t('mdt.iaNoMatchSub', 'Nothing matches that officer or reference.')
                    : t('mdt.iaNoneSub', 'Complaints filed against officers of this department appear here.')}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.affairs', 'Internal Affairs')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.iaSearch', 'Officer or reference')}
            action={can('affairs.file') ? (
                <MdtButton size="sm" onClick={() => select(NEW_FILE)}>
                    {t('mdt.iaFile', 'File')}
                </MdtButton>
            ) : undefined}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            footer={<Pager page={data?.page ?? page} pageSize={data?.pageSize ?? 25} total={total} onPage={setPage} />}
        >
            <div className="flex flex-col gap-2 px-3 pb-2">
                <SegmentedControl<StatusFilter>
                    className={mdtSegmented}
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: 'all', label: t('common.all', 'All') },
                        ...IA_STATUSES.map((s: IaStatus) => ({ value: s as StatusFilter, label: iaStatusLabel(s) })),
                    ]}
                />
            </div>

            <div className="mdt-stagger flex flex-col gap-0.5 px-1">
                {rows.map(row => (
                    <AffairsListRow
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
                <AffairsFile
                    key={selected}
                    fileRef={selected === NEW_FILE ? null : selected}
                    onSaved={file => { select(file.ref); refetch(); }}
                    onClose={() => select(null)}
                    onChanged={refetch}
                />
            ) : undefined}
            placeholder={
                <EmptyState
                    center
                    icon={ShieldQuestion}
                    title={t('mdt.iaPick', 'No file selected')}
                    subtitle={t('mdt.iaPickSub', 'Open a complaint to read the allegation, the investigation notes and the finding.')}
                />
            }
            onCloseDetail={() => select(null)}
        />
    );
}
