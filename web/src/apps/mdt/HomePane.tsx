import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Plus } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { Pill, type PillTone } from '@/ui/Pill';
import { relTimeCompact } from '@/lib/time';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import type { Bulletin, ReportSummary, Unit } from './data';
import { BulletinsColumn } from './BulletinsColumn';
import { UnitsColumn } from './UnitsColumn';
import { mdtPanePad, mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtRuleY } from './mdtTheme';
import { mdtHome } from './mdtApi';
import { MdtButton } from './ui/MdtButton';
import { MdtCard } from './ui/MdtCard';
import { useDeckRefresh, useMdtSession } from './useMdtSession';

const REPORT_TONE: Record<string, PillTone> = {
    warrant:       'red',
    arrest:        'orange',
    traffic:       'blue',
    incident:      'blue',
    investigation: 'green',
    evidence:      'green',
};

export function HomePane() {
    const { can, open } = useMdtSession();

    const [reports, setReports] = useState<ReportSummary[]>([]);
    const [bulletins, setBulletins] = useState<Bulletin[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [query, setQuery] = useState('');

    const refresh = useCallback(async () => {
        const data = await mdtHome();
        setReports(data.recentReports);
        setBulletins(data.bulletins);
        setUnits(data.units);
        setLoaded(true);
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);
    useDeckRefresh(() => { void refresh(); });

    useNuiEvent('sd-phone:mdt:dispatch', data => setUnits(data.units));
    useNuiEvent('sd-phone:mdt:bulletin', data => setBulletins(data.bulletins));

    const shownReports = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return reports;
        return reports.filter(r =>
            r.title.toLowerCase().includes(q)
            || r.ref.toLowerCase().includes(q)
            || r.type.toLowerCase().includes(q));
    }, [reports, query]);

    return (
        <div className={`flex min-h-0 flex-1 flex-col ${mdtPanePad}`}>
            <MdtCard className="flex min-h-0 flex-1 overflow-hidden">
                <div className="ios-scrollbar flex min-h-0 min-w-0 flex-1 overflow-x-auto">
                    <ListColumn
                        title={t('mdt.recentReports', 'Recent Reports')}
                        count={reports.length || undefined}
                        search={{
                            value:       query,
                            onChange:    setQuery,
                            placeholder: t('mdt.searchReports', 'Search reports'),
                        }}
                        action={can('reports.create') ? (
                            <MdtButton
                                size="sm"
                                icon={<Plus className="h-[13px] w-[13px]" strokeWidth={3} />}
                                onClick={() => open('reports', 'new')}
                            >
                                {t('mdt.create', 'Create')}
                            </MdtButton>
                        ) : undefined}
                        isEmpty={loaded && shownReports.length === 0}
                        empty={(
                            <EmptyState
                                center
                                icon={FileText}
                                title={query.trim()
                                    ? t('mdt.noReportMatches', 'No Matches')
                                    : t('mdt.noReports', 'No Reports Filed')}
                                subtitle={query.trim()
                                    ? t('mdt.noReportMatchesSub', 'No recent report matches that search.')
                                    : t('mdt.noReportsSub', 'Paperwork filed by the department shows up here first.')}
                            />
                        )}
                    >
                        {shownReports.map((r, i) => (
                            <button
                                key={r.ref}
                                type="button"
                                onClick={() => open('reports', r.ref)}
                                className={`relative w-full px-4 py-3 text-left ${mdtRowHover}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className={mdtRef}>{r.ref}</span>
                                    <Pill tone={REPORT_TONE[r.type.toLowerCase()] ?? 'blue'}>{r.type}</Pill>
                                    <span className="flex-1" />
                                    <span className={`shrink-0 ${mdtRowMeta}`}>{relTimeCompact(r.createdAt * 1000)}</span>
                                </div>
                                <div className={`mt-1 truncate ${mdtRowTitle}`}>{r.title}</div>
                                <div className={`mt-0.5 truncate ${mdtRowMeta}`}>
                                    {r.callsign ? `${r.callsign} ${r.author}` : r.author}
                                </div>
                                {i < shownReports.length - 1 && (
                                    <span
                                        className="pointer-events-none absolute inset-x-4 bottom-0 bg-ios-gray4 dark:bg-control"
                                        style={{ height: '0.5px' }}
                                    />
                                )}
                            </button>
                        ))}
                    </ListColumn>

                    <div className={mdtRuleY} />

                    <BulletinsColumn bulletins={bulletins} onChanged={setBulletins} />

                    <div className={mdtRuleY} />

                    <UnitsColumn units={units} />
                </div>
            </MdtCard>
        </div>
    );
}
