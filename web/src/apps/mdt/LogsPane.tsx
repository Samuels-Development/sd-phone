import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Scroller } from '@/ui/Scroller';
import { format12h, formatListDate } from '@/lib/time';
import type { AuditRow, MdtSection } from './data';
import { mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtRuleX } from './mdtTheme';
import { mdtLogs } from './mdtApi';
import { MdtField } from './ui/MdtField';
import { useDeckRefresh, useMdtSession } from './useMdtSession';

const REF_RE = /^[A-Z]-\d{3,}$/;

const REF_SECTION: Record<string, MdtSection> = {
    R: 'reports',
    C: 'cases',
    W: 'warrants',
    A: 'jail',
};

const ENTITY_SECTION: Record<string, MdtSection> = {
    report:  'reports',
    case:    'cases',
    warrant: 'warrants',
    arrest:  'jail',
    person:  'profiles',
    vehicle: 'vehicles',
    offence: 'offences',
    officer: 'employees',
};

const VERBS: Record<string, string> = {
    save:     'Filed',
    create:   'Created',
    edit:     'Edited',
    update:   'Updated',
    delete:   'Deleted',
    issue:    'Issued',
    close:    'Closed',
    book:     'Booked',
    assign:   'Assigned',
    note:     'Added a note to',
    notes:    'Updated notes on',
    flags:    'Changed flags on',
    mugshot:  'Changed the mugshot on',
    dismiss:  'Dismissed',
    manage:   'Updated',
    grade:    'Re-graded',
    callsign: 'Set the callsign on',
    radio:    'Set the radio channel on',
    link:     'Linked',
    send:     'Transmitted on',
};

const NOUNS: Record<string, string> = {
    reports:   'report',
    cases:     'case',
    warrants:  'warrant',
    offences:  'offence',
    persons:   'person record',
    vehicles:  'vehicle record',
    bulletins: 'bulletin',
    roster:    'officer',
    jail:      'a suspect',
    chat:      'the channel',
    me:        'own profile',
};

function titleCase(raw: string): string {
    return raw
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/^./, c => c.toUpperCase());
}

function actionLine(action: string): string {
    const parts = action.split('.').filter(Boolean);
    if (parts.length < 2) return titleCase(action);
    const noun = NOUNS[parts[0]];
    const verb = VERBS[parts[parts.length - 1]];
    if (noun && verb) return `${verb} ${noun}`;
    return titleCase(parts.join(' '));
}

function detailEntries(details: AuditRow['details']): { key: string; value: string }[] {
    if (!details || typeof details !== 'object') return [];
    return Object.entries(details).map(([key, value]) => ({
        key,
        value: value === null || value === undefined
            ? ''
            : typeof value === 'object'
                ? JSON.stringify(value)
                : String(value),
    }));
}

const PAGE_SIZE = 25;

export function LogsPane() {
    const { selected, select, open } = useMdtSession();

    const [entityType, setEntityType] = useState('');
    const [actor, setActor] = useState('');
    const [settled, setSettled] = useState('');
    const [page, setPage] = useState(1);

    const [rows, setRows] = useState<AuditRow[]>([]);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(PAGE_SIZE);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const id = window.setTimeout(() => setSettled(actor.trim()), 250);
        return () => window.clearTimeout(id);
    }, [actor]);

    useEffect(() => { setPage(1); }, [entityType, settled]);

    const refresh = useCallback(async () => {
        const data = await mdtLogs({
            entityType: entityType || undefined,
            actor:      settled || undefined,
            page,
        });
        setRows(data.rows);
        setTotal(data.total);
        setPageSize(data.pageSize || PAGE_SIZE);
        setLoaded(true);
    }, [entityType, settled, page]);

    useEffect(() => { void refresh(); }, [refresh]);
    useDeckRefresh(() => { void refresh(); });

    const current = useMemo(
        () => rows.find(r => String(r.id) === selected) ?? null,
        [rows, selected],
    );

    const typeOptions = [
        { value: '',         label: t('mdt.allEntities', 'All records') },
        { value: 'report',   label: t('mdt.entityReport', 'Reports') },
        { value: 'case',     label: t('mdt.entityCase', 'Cases') },
        { value: 'warrant',  label: t('mdt.entityWarrant', 'Warrants') },
        { value: 'person',   label: t('mdt.entityPerson', 'Persons') },
        { value: 'vehicle',  label: t('mdt.entityVehicle', 'Vehicles') },
        { value: 'arrest',   label: t('mdt.entityArrest', 'Bookings') },
        { value: 'officer',  label: t('mdt.entityOfficer', 'Officers') },
        { value: 'bulletin', label: t('mdt.entityBulletin', 'Bulletins') },
        { value: 'offence',  label: t('mdt.entityOffence', 'Offences') },
    ];

    const master = (
        <ListColumn
            title={t('mdt.activityLog', 'Activity')}
            count={total || undefined}
            search={{
                value:       actor,
                onChange:    setActor,
                placeholder: t('mdt.searchByOfficer', 'Search by officer'),
            }}
            action={(
                <MdtField
                    value={entityType}
                    onChange={setEntityType}
                    options={typeOptions}
                    className="w-[136px] min-w-[104px]"
                    fieldClassName="py-[3px] text-[13px]"
                />
            )}
            isEmpty={loaded && rows.length === 0}
            empty={(
                <EmptyState
                    center
                    icon={ScrollText}
                    title={t('mdt.noActivity', 'Nothing Logged')}
                    subtitle={t('mdt.noActivitySub', 'Every write in the terminal lands here. Nothing matches these filters yet.')}
                />
            )}
            footer={<Pager page={page} pageSize={pageSize} total={total} onPage={setPage} />}
        >
            {rows.map((row, i) => {
                const isSelected = String(row.id) === selected;
                const when = new Date(row.createdAt * 1000);
                return (
                    <button
                        key={row.id}
                        type="button"
                        onClick={() => select(String(row.id))}
                        className={`relative w-full px-4 py-3 text-left ${
                            isSelected ? 'bg-ios-blue/10' : mdtRowHover
                        }`}
                    >
                        <div className="flex items-baseline gap-2">
                            <span className={mdtRef}>{row.actorCallsign || row.actor}</span>
                            <span className="flex-1" />
                            <span className={`shrink-0 ${mdtRowMeta}`}>{formatListDate(row.createdAt * 1000)}</span>
                        </div>
                        <div className={`mt-1 truncate ${mdtRowTitle}`}>{actionLine(row.action)}</div>
                        <div className={`mt-0.5 flex items-center gap-1.5 ${mdtRowMeta}`}>
                            <span className="min-w-0 truncate">{titleCase(row.entityType ?? '')}</span>
                            {row.entityId && (
                                <>
                                    <span className="shrink-0 opacity-40">&bull;</span>
                                    <span className="shrink-0 tabular-nums">{row.entityId}</span>
                                </>
                            )}
                            <span className="shrink-0 opacity-40">&bull;</span>
                            <span className="shrink-0 tabular-nums">{format12h(when.getHours(), when.getMinutes())}</span>
                        </div>
                        {i < rows.length - 1 && (
                            <span
                                className="pointer-events-none absolute inset-x-4 bottom-0 bg-ios-gray4 dark:bg-control"
                                style={{ height: '0.5px' }}
                            />
                        )}
                    </button>
                );
            })}
        </ListColumn>
    );

    const entitySection = current?.entityType ? ENTITY_SECTION[current.entityType] : undefined;
    const entityRef = current?.entityId ?? '';

    const detail = current ? (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 px-6 pb-4 pt-5">
                <div className={mdtRef}>{titleCase(current.entityType ?? '')}</div>
                <h2 className="mt-1 text-[21px] font-bold leading-tight tracking-tight text-black dark:text-white">
                    {actionLine(current.action)}
                </h2>
                <div className={`mt-1.5 flex flex-wrap items-center gap-1.5 ${mdtRowMeta}`}>
                    <span>{current.actorCallsign ? `${current.actorCallsign} ${current.actor}` : current.actor}</span>
                    <span className="opacity-40">&bull;</span>
                    <span>{formatListDate(current.createdAt * 1000)}</span>
                </div>
            </div>

            <div className={mdtRuleX} />

            <Scroller className="min-h-0 flex-1 px-6 py-3">
                <dl className="flex flex-col">
                    <Entry
                        label={t('mdt.logEntity', 'Record')}
                        value={entityRef}
                        onOpen={entitySection && entityRef
                            ? () => open(entitySection, entityRef)
                            : undefined}
                    />
                    <Entry label={t('mdt.logAction', 'Action key')} value={current.action} />
                    {detailEntries(current.details).map(entry => (
                        <Entry
                            key={entry.key}
                            label={titleCase(entry.key)}
                            value={entry.value}
                            onOpen={REF_RE.test(entry.value) && REF_SECTION[entry.value[0]]
                                ? () => open(REF_SECTION[entry.value[0]], entry.value)
                                : undefined}
                        />
                    ))}
                </dl>
            </Scroller>
        </div>
    ) : undefined;

    return (
        <MasterDetail
            master={master}
            detail={detail}
            hasDetail={!!current}
            onCloseDetail={() => select(null)}
            backLabel={t('mdt.activityLog', 'Activity')}
            placeholder={(
                <div className="flex min-h-0 flex-1 items-center justify-center px-6">
                    <EmptyState
                        center
                        icon={ScrollText}
                        title={t('mdt.selectEntry', 'Select an Entry')}
                        subtitle={t('mdt.selectEntrySub', 'Open a line to read exactly what changed and jump straight to the record it touched.')}
                    />
                </div>
            )}
        />
    );
}

function Entry({ label, value, onOpen }: { label: string; value: string; onOpen?: () => void }) {
    if (!value) return null;
    return (
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-black/[0.06] py-2.5 last:border-b-0 dark:border-white/[0.08]">
            <dt className="w-[160px] shrink-0 text-[13px] font-medium text-ios-gray">{label}</dt>
            <dd className="min-w-[240px] flex-1 text-[14px] leading-snug text-black dark:text-white">
                {onOpen ? (
                    <button
                        type="button"
                        onClick={onOpen}
                        className="max-w-full truncate text-left font-semibold tabular-nums text-ios-blue active:opacity-60"
                    >
                        {value}
                    </button>
                ) : (
                    <span className="select-text break-words">{value}</span>
                )}
            </dd>
        </div>
    );
}
