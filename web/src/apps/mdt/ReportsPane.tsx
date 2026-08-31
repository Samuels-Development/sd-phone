import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';

import { device } from '@device';
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
import { Select } from '@/ui/Select';

import type { ReportSummary, ReportType } from './data';
import { mdtReports } from './mdtApi';
import { REPORT_TYPES, ReportEditor, reportTypeLabel, reportTypeTone } from './ReportEditor';
import { useMdtSession } from './useMdtSession';
import { mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtSegmentedDense } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';

type TypeFilter = ReportType | 'All';

const NEW_REPORT = 'new';

const isPhone = device.id === 'phone';

function ReportListRow({ report, selected, onPress }: {
    report:   ReportSummary;
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
                <span className={`shrink-0 ${mdtRef}`}>{report.ref}</span>
                <span className={`min-w-0 flex-1 truncate ${mdtRowTitle}`}>{report.title}</span>
                <Pill tone={reportTypeTone(report.type)}>{reportTypeLabel(report.type)}</Pill>
            </span>
            <span className={`flex w-full items-center gap-2 ${mdtRowMeta}`}>
                <span className="min-w-0 truncate">
                    {report.callsign ? `${report.callsign} · ${report.author}` : report.author}
                </span>
                {report.chargeCount > 0 && (
                    <span className="shrink-0 tabular-nums">
                        {report.chargeCount === 1
                            ? t('mdt.oneCharge', '1 charge')
                            : t('mdt.nCharges', '{n} charges', { n: report.chargeCount })}
                    </span>
                )}
                <span className="ml-auto shrink-0 tabular-nums">{formatListDate(report.createdAt * 1000)}</span>
            </span>
        </button>
    );
}

export function ReportsPane() {
    const { can, selected, select } = useMdtSession();

    const [filter, setFilter] = useSessionState<TypeFilter>('mdt:reports:type', 'All');
    const [query, setQuery] = useSessionState('mdt:reports:query', '');
    const [page, setPage] = useSessionState('mdt:reports:page', 1);
    const [term, setTerm] = useState(query.trim());

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, filter, setPage]);

    const { data, loading, settled, refetch } = useAsyncData(
        () => mdtReports({ query: term, type: filter, page }),
        [term, filter, page],
    );

    const rows = data?.rows ?? [];
    const total = data?.total ?? 0;
    const pageSize = data?.pageSize ?? 25;

    const typeOptions = [
        { value: 'All' as TypeFilter, label: isPhone ? t('mdt.anyType', 'Any type') : t('common.all', 'All') },
        ...REPORT_TYPES.map((type: ReportType) => ({ value: type as TypeFilter, label: reportTypeLabel(type) })),
    ];

    const empty = (
        <EmptyState
            center
            icon={FileText}
            title={term ? t('mdt.noMatchingReports', 'No matching reports') : t('mdt.noReports', 'No reports filed')}
            subtitle={loading
                ? undefined
                : term
                    ? t('mdt.noMatchingReportsSub', 'Nothing matches that title or reference.')
                    : t('mdt.noReportsSub', 'Paperwork your department files shows up here.')}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.reports', 'Reports')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.searchTitleOrRef', 'Title or reference')}
            action={can('reports.create') ? (
                <MdtButton size="sm" onClick={() => select(NEW_REPORT)}>
                    {t('mdt.newReport', 'Create')}
                </MdtButton>
            ) : undefined}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            minWidth={isPhone ? 0 : undefined}
            footer={<Pager page={data?.page ?? page} pageSize={pageSize} total={total} onPage={setPage} />}
        >
            {isPhone ? (
                <div className="px-3 pb-2">
                    <Select<TypeFilter>
                        value={filter}
                        onChange={setFilter}
                        size="sm"
                        ariaLabel={t('mdt.type', 'Type')}
                        options={typeOptions}
                    />
                </div>
            ) : (
                <div className="px-3 pb-2">
                    <SegmentedControl<TypeFilter>
                        className={mdtSegmentedDense}
                        value={filter}
                        onChange={setFilter}
                        options={typeOptions}
                    />
                </div>
            )}

            <div className="mdt-stagger flex flex-col gap-0.5 px-1">
                {rows.map(row => (
                    <ReportListRow
                        key={row.ref}
                        report={row}
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
                <ReportEditor
                    key={selected}
                    reportRef={selected === NEW_REPORT ? null : selected}
                    onSaved={report => { select(report.ref); refetch(); }}
                    onDeleted={() => { select(null); refetch(); }}
                    onClose={() => select(null)}
                />
            ) : undefined}
            placeholder={
                <EmptyState
                    center
                    icon={FileText}
                    title={t('mdt.pickReport', 'No report selected')}
                    subtitle={t('mdt.pickReportSub', 'Open a report to read its narrative, the people on it and the charges filed.')}
                />
            }
            onCloseDetail={() => select(null)}
            backLabel={t('mdt.reports', 'Reports')}
        />
    );
}
