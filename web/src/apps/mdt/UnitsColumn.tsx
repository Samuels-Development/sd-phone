import { useMemo, useState } from 'react';
import { RadioTower } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { Pill } from '@/ui/Pill';
import type { Unit, UnitCode } from './data';
import { mdtRowMeta } from './mdtTheme';
import { mdtLocate, mdtSetWaypoint } from './mdtApi';

const CODE_DOT: Record<UnitCode, string> = {
    '10-8':  '#34c759',
    '10-6':  '#ff9f0a',
    '10-90': 'rgb(var(--ios-blue))',
    '10-7':  '#ff453a',
};

export function unitCodeLabel(code: string): string {
    if (code === '10-8')  return t('mdt.code108', '10-8 Available');
    if (code === '10-6')  return t('mdt.code106', '10-6 Busy');
    if (code === '10-7')  return t('mdt.code107', '10-7 Out of service');
    if (code === '10-90') return t('mdt.code1090', '10-90 En route');
    return code;
}

export async function waypointToUnit(citizenid: string): Promise<boolean> {
    const coords = await mdtLocate({ citizenid });
    if (!coords) return false;
    return mdtSetWaypoint(coords);
}

export function UnitRow({ unit, onPress, selected = false, divider = true }: {
    unit:      Unit;
    onPress?:  () => void;
    selected?: boolean;
    divider?:  boolean;
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            className={`relative w-full px-4 py-3 text-left transition-colors ${
                selected ? 'bg-ios-blue/10' : 'active:bg-black/[0.05] dark:active:bg-white/[0.06]'
            }`}
        >
            <div className="flex min-w-0 items-center gap-2">
                <Pill tone="green">{unit.callsign || '--'}</Pill>
                <Pill tone="blue">{unit.rank}</Pill>
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-black dark:text-white">
                    {unit.name}
                </span>
            </div>
            <div className={`mt-1 flex items-center gap-1.5 ${mdtRowMeta}`}>
                <span
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: CODE_DOT[unit.code] ?? '#8e8e93' }}
                />
                <span className="min-w-0 truncate">{unitCodeLabel(unit.code)}</span>
            </div>
            {divider && (
                <span
                    className="pointer-events-none absolute inset-x-4 bottom-0 bg-ios-gray4 dark:bg-control"
                    style={{ height: '0.5px' }}
                />
            )}
        </button>
    );
}

export function UnitsColumn({ units, className = '' }: { units: Unit[]; className?: string }) {
    const [query, setQuery] = useState('');

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return units;
        return units.filter(u =>
            u.name.toLowerCase().includes(q)
            || u.callsign.toLowerCase().includes(q)
            || u.rank.toLowerCase().includes(q));
    }, [units, query]);

    return (
        <ListColumn
            className={className}
            title={t('mdt.activeUnits', 'Active Units')}
            count={units.length || undefined}
            search={{
                value:       query,
                onChange:    setQuery,
                placeholder: t('mdt.searchUnits', 'Search units'),
            }}
            isEmpty={rows.length === 0}
            empty={(
                <EmptyState
                    center
                    icon={RadioTower}
                    title={query.trim()
                        ? t('mdt.noUnitMatches', 'No Matches')
                        : t('mdt.noUnits', 'No Units On Duty')}
                    subtitle={query.trim()
                        ? t('mdt.noUnitMatchesSub', 'No unit on the air matches that callsign or name.')
                        : t('mdt.noUnitsSub', 'Units appear here the moment an officer brings a terminal up.')}
                />
            )}
        >
            {rows.map((u, i) => (
                <UnitRow
                    key={u.citizenid}
                    unit={u}
                    divider={i < rows.length - 1}
                    onPress={() => { void waypointToUnit(u.citizenid); }}
                />
            ))}
        </ListColumn>
    );
}
