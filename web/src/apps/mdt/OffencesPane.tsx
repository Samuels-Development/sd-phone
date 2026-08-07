import { useMemo } from 'react';
import { Scale } from 'lucide-react';

import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';

import { classLabel, sentenceLabel } from './ChargePicker';
import { CHARGE_CLASSES, type Offence } from './data';
import { mdtOffences } from './mdtApi';
import { useViewEnter } from './useMdtSession';
import { mdtPanePad, mdtRowHover, mdtRowMeta, mdtSectionHeader, STATUS_TONE } from './mdtTheme';
import { MdtCard } from './ui/MdtCard';

export function OffencesPane() {
    const [query, setQuery] = useSessionState('mdt:offences:query', '');
    const [code, setCode] = useSessionState<string | null>('mdt:offences:code', null);

    const { data, loading, settled } = useAsyncData(mdtOffences, []);
    const offences = useMemo(() => data ?? [], [data]);

    const groups = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const hits = needle.length === 0
            ? offences
            : offences.filter(o =>
                o.code.toLowerCase().includes(needle)
                || o.label.toLowerCase().includes(needle)
                || o.description.toLowerCase().includes(needle));
        return CHARGE_CLASSES
            .map(cls => ({ cls, rows: hits.filter(o => o.class === cls) }))
            .filter(group => group.rows.length > 0);
    }, [offences, query]);

    const selected = useMemo(() => offences.find(o => o.code === code) ?? null, [offences, code]);

    const empty = (
        <EmptyState
            center
            icon={Scale}
            title={loading ? t('mdt.loadingCode', 'Loading the penal code') : t('mdt.noOffences', 'No offences')}
            subtitle={loading
                ? undefined
                : query.trim()
                    ? t('mdt.noOffencesSub', 'Nothing in the penal code matches that search.')
                    : t('mdt.emptyCode', 'No charges are configured. The penal code lives in configs/penalcode.lua.')}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.offences', 'Offences')}
            count={offences.length}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.searchOffencesShort', 'Code, label or wording')}
            isEmpty={settled && groups.length === 0}
            empty={empty}
        >
            {groups.map(group => (
                <div key={group.cls}>
                    <div className="sticky top-0 z-10 bg-base/95 px-4 py-1 backdrop-blur-sm">
                        <span className={mdtSectionHeader}>{classLabel(group.cls)}</span>
                    </div>
                    <div className="flex flex-col gap-0.5 px-1">
                        {group.rows.map(offence => (
                            <button
                                key={offence.code}
                                type="button"
                                onClick={() => setCode(offence.code)}
                                className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left ${
                                    offence.code === code ? 'bg-ios-blue/10' : mdtRowHover
                                }`}
                            >
                                <span className="w-[64px] shrink-0 text-[12.5px] font-bold uppercase tabular-nums tracking-wide text-ios-gray">
                                    {offence.code}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[14.5px] text-black dark:text-white">
                                    {offence.label}
                                </span>
                                <span className={`shrink-0 tabular-nums ${mdtRowMeta}`}>
                                    {offence.months > 0 ? `${offence.months}m` : '-'}
                                    {' · '}
                                    {formatMoney(offence.fine, { whole: true })}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </ListColumn>
    );

    return (
        <MasterDetail
            master={master}
            hasDetail={selected !== null}
            detail={selected ? <OffenceDetail key={selected.code} offence={selected} /> : undefined}
            placeholder={
                <EmptyState
                    center
                    icon={Scale}
                    title={t('mdt.pickOffence', 'No offence selected')}
                    subtitle={t('mdt.pickOffenceSub', 'Open a code to read what it carries in jail time and fines.')}
                />
            }
            onCloseDetail={() => setCode(null)}
        />
    );
}

function OffenceDetail({ offence }: { offence: Offence }) {
    const enter = useViewEnter(offence.code);

    return (
        <Scroller className={`h-full ${mdtPanePad} ${enter}`}>
            <div className="flex flex-wrap items-center gap-3">
                <span className="shrink-0 text-[13px] font-bold uppercase tabular-nums tracking-wide text-ios-gray">
                    {offence.code}
                </span>
                <h1 className="min-w-0 flex-1 text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                    {offence.label}
                </h1>
                <Pill tone={STATUS_TONE[offence.class] ?? 'blue'}>{classLabel(offence.class)}</Pill>
            </div>

            <MdtCard className="mt-5 overflow-hidden">
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div className="p-4">
                        <div className={mdtSectionHeader}>{t('mdt.jailTime', 'Jail time')}</div>
                        <div className="mt-1 text-[20px] font-semibold tabular-nums text-black dark:text-white">
                            {sentenceLabel(offence.months)}
                        </div>
                    </div>
                    <div className="p-4">
                        <div className={mdtSectionHeader}>{t('mdt.fine', 'Fine')}</div>
                        <div className="mt-1 text-[20px] font-semibold tabular-nums text-black dark:text-white">
                            {formatMoney(offence.fine, { whole: true })}
                        </div>
                    </div>
                </div>
            </MdtCard>

            <MdtCard className="mt-4 p-4">
                <div className={mdtSectionHeader}>{t('mdt.description', 'Description')}</div>
                <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-black dark:text-white">
                    {offence.description || t('mdt.noDescription', 'No description on file for this code.')}
                </p>
            </MdtCard>

            <div className="h-6" />
        </Scroller>
    );
}
