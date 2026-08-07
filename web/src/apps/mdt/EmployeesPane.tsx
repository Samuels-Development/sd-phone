import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Pill } from '@/ui/Pill';
import type { GradeOption, OfficerRow } from './data';
import { mdtRowHover, mdtRowMeta } from './mdtTheme';
import { mdtRoster } from './mdtApi';
import { OfficerCard } from './OfficerCard';
import { useDeckRefresh, useMdtSession } from './useMdtSession';

const PAGE_SIZE = 25;

function DutyMark({ officer }: { officer: OfficerRow }) {
    const label = officer.duty
        ? t('mdt.onDuty', 'On Duty')
        : officer.online
            ? t('mdt.online', 'Online')
            : t('mdt.offDuty', 'Off Duty');
    return (
        <span className={`flex shrink-0 items-center gap-1.5 ${mdtRowMeta}`}>
            <span
                className="h-[7px] w-[7px] rounded-full"
                style={officer.duty
                    ? { background: '#34c759' }
                    : officer.online
                        ? { background: '#ff9f0a' }
                        : { boxShadow: 'inset 0 0 0 1.5px rgba(142,142,147,0.65)' }}
            />
            {label}
        </span>
    );
}

export function EmployeesPane() {
    const { selected, select } = useMdtSession();

    const [query, setQuery] = useState('');
    const [settled, setSettled] = useState('');
    const [page, setPage] = useState(1);

    const [rows, setRows] = useState<OfficerRow[]>([]);
    const [grades, setGrades] = useState<GradeOption[]>([]);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(PAGE_SIZE);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const id = window.setTimeout(() => setSettled(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [settled]);

    const refresh = useCallback(async () => {
        const data = await mdtRoster({ query: settled || undefined, page });
        setRows(data.rows);
        setGrades(data.grades ?? []);
        setTotal(data.total);
        setPageSize(data.pageSize || PAGE_SIZE);
        setLoaded(true);
    }, [settled, page]);

    useEffect(() => { void refresh(); }, [refresh]);
    useDeckRefresh(() => { void refresh(); });

    const current = useMemo(
        () => rows.find(r => r.citizenid === selected) ?? null,
        [rows, selected],
    );

    const onChanged = useCallback((officer: OfficerRow) => {
        setRows(prev => prev.map(r => (r.citizenid === officer.citizenid ? officer : r)));
    }, []);

    const onDismissed = useCallback(() => {
        select(null);
        void refresh();
    }, [refresh, select]);

    const master = (
        <ListColumn
            className="min-h-0 flex-1"
            title={t('mdt.employees', 'Employees')}
            count={total || undefined}
            search={{
                value:       query,
                onChange:    setQuery,
                placeholder: t('mdt.searchRoster', 'Search name or callsign'),
            }}
            isEmpty={loaded && rows.length === 0}
            empty={(
                <EmptyState
                    center
                    icon={Users}
                    title={settled
                        ? t('mdt.noOfficerMatches', 'No Matches')
                        : t('mdt.noOfficers', 'No Personnel')}
                    subtitle={settled
                        ? t('mdt.noOfficerMatchesSub', 'Nobody in this department matches that name or callsign.')
                        : t('mdt.noOfficersSub', 'Members appear here as soon as they are hired into the department.')}
                />
            )}
            footer={<Pager page={page} pageSize={pageSize} total={total} onPage={setPage} />}
        >
            {rows.map((o, i) => (
                <button
                    key={o.citizenid}
                    type="button"
                    onClick={() => select(o.citizenid)}
                    className={`relative w-full px-4 py-3 text-left transition-colors ${
                        o.citizenid === selected
                            ? 'bg-ios-blue/10'
                            : mdtRowHover
                    }`}
                >
                    <div className="flex min-w-0 items-center gap-2">
                        <Pill tone="green">{o.callsign || '--'}</Pill>
                        <Pill tone="blue">{o.rank}</Pill>
                        <span className="flex-1" />
                        <DutyMark officer={o} />
                    </div>
                    <div className="mt-1 truncate text-[15px] font-semibold leading-tight text-black dark:text-white">
                        {o.name}
                    </div>
                    <div className={`mt-0.5 flex items-center gap-1.5 ${mdtRowMeta}`}>
                        <span className="tabular-nums">
                            {t('mdt.badgeNo', 'Badge {n}', { n: o.badge ?? '--' })}
                        </span>
                        <span className="shrink-0 opacity-40">&bull;</span>
                        <span className="tabular-nums">
                            {t('mdt.hoursShort', '{n}h on shift', { n: o.hours.toFixed(1) })}
                        </span>
                    </div>
                    {i < rows.length - 1 && (
                        <span
                            className="pointer-events-none absolute inset-x-4 bottom-0 bg-ios-gray4 dark:bg-control"
                            style={{ height: '0.5px' }}
                        />
                    )}
                </button>
            ))}
        </ListColumn>
    );

    return (
        <MasterDetail
            master={master}
            detail={current
                ? (
                    <OfficerCard
                        officer={current}
                        grades={grades}
                        onChanged={onChanged}
                        onDismissed={onDismissed}
                    />
                )
                : undefined}
            hasDetail={!!current}
            onCloseDetail={() => select(null)}
            placeholder={(
                <div className="flex min-h-0 flex-1 items-center justify-center px-6">
                    <EmptyState
                        center
                        icon={Users}
                        title={t('mdt.selectOfficer', 'Select an Officer')}
                        subtitle={t('mdt.selectOfficerSub', 'Open a member of the roster to read their record, shift hours and management controls.')}
                    />
                </div>
            )}
        />
    );
}
