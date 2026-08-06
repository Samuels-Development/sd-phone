import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus, Scale, X } from 'lucide-react';

import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { SearchBar } from '@/ui/SearchBar';

import { CHARGE_CLASSES, type ChargeClass, type ChargeInput, type Offence } from './data';
import { useMdtSession } from './useMdtSession';
import { mdtRowHover, mdtRowMeta, mdtRowTitle, mdtSectionHeader, STATUS_TONE } from './mdtTheme';
import { MdtCard } from './ui/MdtCard';
import { MdtPager } from './ui/MdtPager';
import { MdtSelect } from './ui/MdtSelect';

const OFFENCE_PAGE = 8;

const MAX_COUNT = 99;

const ALL_SUSPECTS = '__all__';

export interface ChargeSubject {
    citizenid: string;
    name:      string;
}

export function classLabel(cls: string): string {
    switch (cls) {
        case 'felony':      return t('mdt.classFelony', 'Felony');
        case 'misdemeanor': return t('mdt.classMisdemeanor', 'Misdemeanor');
        default:            return t('mdt.classInfraction', 'Infraction');
    }
}

export function sentenceLabel(months: number): string {
    if (months <= 0) return t('mdt.noJailTime', 'No jail time');
    if (months === 1) return t('mdt.oneMonth', '1 month');
    return t('mdt.nMonths', '{n} months', { n: months });
}

export function catalogIndex(offences: readonly Offence[]): Record<string, Offence> {
    const map: Record<string, Offence> = {};
    for (const offence of offences) map[offence.code] = offence;
    return map;
}

export function inputTotals(lines: readonly ChargeInput[], byCode: Record<string, Offence>): {
    months: number;
    fine:   number;
} {
    let months = 0;
    let fine = 0;
    for (const line of lines) {
        const offence = byCode[line.code];
        if (!offence) continue;
        months += offence.months * line.count;
        fine += offence.fine * line.count;
    }
    return { months, fine };
}

export function ChargePicker({ lines, onChange, subjects = [], className = '' }: {
    lines:      ChargeInput[];
    onChange:   (lines: ChargeInput[]) => void;
    subjects?:  ChargeSubject[];
    className?: string;
}) {
    const { offences } = useMdtSession();
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);

    useEffect(() => { setPage(1); }, [query]);

    const byCode = useMemo(() => catalogIndex(offences), [offences]);
    const totals = useMemo(() => inputTotals(lines, byCode), [lines, byCode]);

    const catalogue = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const hits = needle.length === 0
            ? offences
            : offences.filter(o =>
                o.code.toLowerCase().includes(needle)
                || o.label.toLowerCase().includes(needle)
                || o.description.toLowerCase().includes(needle));
        const out: Offence[] = [];
        for (const cls of CHARGE_CLASSES) {
            for (const offence of hits) if (offence.class === cls) out.push(offence);
        }
        return out;
    }, [offences, query]);

    const lastPage = Math.max(1, Math.ceil(catalogue.length / OFFENCE_PAGE));
    const current = Math.min(page, lastPage);
    const shown = catalogue.slice((current - 1) * OFFENCE_PAGE, current * OFFENCE_PAGE);

    function add(offence: Offence) {
        const citizenid = subjects.length > 0 ? subjects[0].citizenid : undefined;
        const at = lines.findIndex(l => l.code === offence.code && l.citizenid === citizenid);
        if (at >= 0) {
            const next = lines.slice();
            next[at] = { ...next[at], count: Math.min(MAX_COUNT, next[at].count + 1) };
            onChange(next);
            return;
        }
        onChange([...lines, { code: offence.code, citizenid, count: 1 }]);
    }

    function setCount(index: number, count: number) {
        if (count < 1) {
            onChange(lines.filter((_, i) => i !== index));
            return;
        }
        const next = lines.slice();
        next[index] = { ...next[index], count: Math.min(MAX_COUNT, count) };
        onChange(next);
    }

    function setSubject(index: number, citizenid: string) {
        const line = lines[index];
        if (citizenid !== ALL_SUSPECTS) {
            const next = lines.slice();
            next[index] = { ...line, citizenid };
            onChange(next);
            return;
        }
        const spread = [
            ...lines.slice(0, index),
            ...subjects.map(subject => ({ ...line, citizenid: subject.citizenid })),
            ...lines.slice(index + 1),
        ];
        const seen = new Set<string>();
        onChange(spread.filter(l => {
            const key = `${l.code}:${l.citizenid ?? ''}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }));
    }

    return (
        <div className={`flex min-h-0 flex-col gap-3 ${className}`}>
            <MdtCard className="overflow-hidden">
                {lines.length === 0 ? (
                    <div className="px-4 py-5 text-center text-[14px] text-ios-gray">
                        {t('mdt.noChargesYet', 'No charges added yet. Pick one from the code below.')}
                    </div>
                ) : (
                    <>
                        {lines.map((line, index) => {
                            const offence = byCode[line.code];
                            const cls: ChargeClass = offence?.class ?? 'infraction';
                            return (
                                <div
                                    key={`${line.code}:${line.citizenid ?? ''}:${index}`}
                                    className="flex items-center gap-2 px-3 py-2.5"
                                >
                                    <Pill tone={STATUS_TONE[cls] ?? 'blue'}>{line.code}</Pill>
                                    <span className="min-w-0 flex-1">
                                        <span className={`block truncate ${mdtRowTitle}`}>
                                            {offence?.label ?? line.code}
                                        </span>
                                        <span className={`block truncate tabular-nums ${mdtRowMeta}`}>
                                            {sentenceLabel((offence?.months ?? 0) * line.count)}
                                            {' · '}
                                            {formatMoney((offence?.fine ?? 0) * line.count, { whole: true })}
                                        </span>
                                    </span>

                                    {subjects.length > 1 && (
                                        <MdtSelect
                                            value={line.citizenid ?? ''}
                                            onChange={next => setSubject(index, next)}
                                            options={[
                                                ...subjects.map(subject => ({ value: subject.citizenid, label: subject.name })),
                                                { value: ALL_SUSPECTS, label: t('mdt.allSuspects', 'All suspects') },
                                            ]}
                                            size="xs"
                                            ariaLabel={t('mdt.attributeCharge', 'Attribute charge')}
                                            className="max-w-[150px] shrink-0"
                                        />
                                    )}

                                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-black/[0.06] px-1 py-0.5 dark:bg-white/[0.12]">
                                        <button
                                            type="button"
                                            onClick={() => setCount(index, line.count - 1)}
                                            aria-label={t('mdt.decreaseCount', 'Decrease count')}
                                            className="flex h-6 w-6 items-center justify-center rounded-full text-black active:opacity-50 dark:text-white"
                                        >
                                            <Minus className="h-[14px] w-[14px]" strokeWidth={2.75} />
                                        </button>
                                        <span className="min-w-[18px] text-center text-[15px] font-semibold tabular-nums text-black dark:text-white">
                                            {line.count}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setCount(index, line.count + 1)}
                                            aria-label={t('mdt.increaseCount', 'Increase count')}
                                            className="flex h-6 w-6 items-center justify-center rounded-full text-black active:opacity-50 dark:text-white"
                                        >
                                            <Plus className="h-[14px] w-[14px]" strokeWidth={2.75} />
                                        </button>
                                    </span>

                                    <button
                                        type="button"
                                        onClick={() => setCount(index, 0)}
                                        aria-label={t('mdt.removeCharge', 'Remove charge')}
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ios-gray active:opacity-50"
                                    >
                                        <X className="h-[16px] w-[16px]" strokeWidth={2.5} />
                                    </button>
                                </div>
                            );
                        })}
                        <div className="flex items-center justify-between border-t border-black/[0.06] px-4 py-2.5 dark:border-white/[0.08]">
                            <span className={mdtSectionHeader}>{t('mdt.total', 'Total')}</span>
                            <span className="text-[15px] font-semibold tabular-nums text-black dark:text-white">
                                {sentenceLabel(totals.months)}
                                {' · '}
                                {formatMoney(totals.fine, { whole: true })}
                            </span>
                        </div>
                    </>
                )}
            </MdtCard>

            <SearchBar
                value={query}
                onChange={setQuery}
                placeholder={t('mdt.searchOffences', 'Search the penal code')}
                pillClassName="gap-2 rounded-[9px] bg-black/[0.05] px-2.5 py-[6px] dark:bg-white/[0.08]"
                iconClassName="h-[15px] w-[15px] text-black/45 dark:text-white/45"
                textClassName="text-[14px] font-medium text-black placeholder-black/40 dark:text-white dark:placeholder-white/40"
            />

            <MdtCard className="flex flex-col overflow-hidden">
                {shown.length === 0 ? (
                    <div className="flex items-center justify-center px-4 py-6">
                        <EmptyState
                            center
                            icon={Scale}
                            title={t('mdt.noOffences', 'No offences')}
                            subtitle={t('mdt.noOffencesSub', 'Nothing in the penal code matches that search.')}
                        />
                    </div>
                ) : (
                    <div>
                        {shown.map((offence, index) => (
                            <div key={offence.code}>
                                {(index === 0 || shown[index - 1].class !== offence.class) && (
                                    <div className="bg-surface px-4 py-1.5">
                                        <span className={mdtSectionHeader}>{classLabel(offence.class)}</span>
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => add(offence)}
                                    className={`flex w-full items-center gap-3 px-4 py-2 text-left ${mdtRowHover}`}
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
                                    <Plus className="h-[15px] w-[15px] shrink-0 text-ios-blue" strokeWidth={2.75} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <MdtPager page={current} pageSize={OFFENCE_PAGE} total={catalogue.length} onPage={setPage} />
            </MdtCard>
        </div>
    );
}
