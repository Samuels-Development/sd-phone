import { useEffect, useState } from 'react';
import { FileText, Lock } from 'lucide-react';

import { t } from '@/i18n';
import { colorFor } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { formatListDate, formatMediumDate } from '@/lib/time';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';

import { BookingDialog } from './BookingDialog';
import { sentenceLabel } from './ChargePicker';
import type { ArrestRow } from './data';
import { mdtArrests } from './mdtApi';
import { useMdtSession } from './useMdtSession';
import { mdtPanePad, mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtSectionHeader, STATUS_TONE } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';
import { MdtCard } from './ui/MdtCard';

function chargeSummary(arrest: ArrestRow): string {
    if (arrest.charges.length === 0) return t('mdt.noChargesShort', 'No charges');
    const rest = arrest.charges.length - 1;
    if (rest <= 0) return arrest.charges[0].label;
    return t('mdt.chargePlusMore', '{label} and {n} more', { label: arrest.charges[0].label, n: rest });
}

function ArrestListRow({ arrest, selected, onPress }: {
    arrest:   ArrestRow;
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
                <span className={`shrink-0 ${mdtRef}`}>{arrest.ref}</span>
                <span className={`min-w-0 flex-1 truncate ${mdtRowTitle}`}>{arrest.subject}</span>
                <span className={`shrink-0 tabular-nums ${mdtRowMeta}`}>
                    {arrest.months > 0 ? sentenceLabel(arrest.months) : t('mdt.fineOnly', 'Fine only')}
                    {arrest.fine > 0 && ` · ${formatMoney(arrest.fine, { whole: true })}`}
                </span>
            </span>
            <span className={`flex w-full items-center gap-2 ${mdtRowMeta}`}>
                <span className="min-w-0 flex-1 truncate">{chargeSummary(arrest)}</span>
                <span className="shrink-0 tabular-nums">
                    {arrest.callsign ? `${arrest.callsign} · ` : ''}
                    {formatListDate(arrest.createdAt * 1000)}
                </span>
            </span>
        </button>
    );
}

export function JailPane() {
    const { can, selected, select } = useMdtSession();

    const [query, setQuery] = useSessionState('mdt:jail:query', '');
    const [page, setPage] = useSessionState('mdt:jail:page', 1);
    const [term, setTerm] = useState(query.trim());
    const [booking, setBooking] = useState(false);

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, setPage]);

    const { data, loading, settled, refetch } = useAsyncData(() => mdtArrests({ query: term, page }), [term, page]);

    const rows = data?.rows ?? [];
    const total = data?.total ?? 0;
    const pageSize = data?.pageSize ?? 25;
    const record = rows.find(row => row.ref === selected) ?? null;

    const empty = (
        <EmptyState
            center
            icon={Lock}
            title={term ? t('mdt.noMatchingArrests', 'No matching bookings') : t('mdt.noArrests', 'No bookings yet')}
            subtitle={loading
                ? undefined
                : term
                    ? t('mdt.noMatchingArrestsSub', 'Nothing matches that name or reference.')
                    : t('mdt.noArrestsSub', 'Every sentence and citation served through the terminal is logged here.')}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.jail', 'Jail')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.searchArrests', 'Name or reference')}
            action={can('jail.book') ? (
                <MdtButton size="sm" onClick={() => setBooking(true)}>
                    {t('mdt.book', 'Book')}
                </MdtButton>
            ) : undefined}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            footer={<Pager page={data?.page ?? page} pageSize={pageSize} total={total} onPage={setPage} />}
        >
            <div className="mdt-stagger flex flex-col gap-0.5 px-1">
                {rows.map(row => (
                    <ArrestListRow
                        key={row.ref}
                        arrest={row}
                        selected={row.ref === selected}
                        onPress={() => select(row.ref)}
                    />
                ))}
            </div>
        </ListColumn>
    );

    return (
        <div className="relative flex min-h-0 min-w-0 flex-1">
            <MasterDetail
                master={master}
                hasDetail={record !== null}
                detail={record ? <ArrestDetail key={record.ref} arrest={record} /> : undefined}
                placeholder={
                    <EmptyState
                        center
                        icon={Lock}
                        title={t('mdt.pickArrest', 'No booking selected')}
                        subtitle={t('mdt.pickArrestSub', 'Open a booking to see the charges it was served on.')}
                    />
                }
                onCloseDetail={() => select(null)}
            />

            {booking && (
                <BookingDialog
                    onClose={() => setBooking(false)}
                    onBooked={arrest => { setBooking(false); select(arrest.ref); refetch(); }}
                />
            )}
        </div>
    );
}

function ArrestDetail({ arrest }: { arrest: ArrestRow }) {
    const { open } = useMdtSession();

    return (
        <Scroller className={`h-full ${mdtPanePad}`}>
            <span className={mdtRef}>{arrest.ref}</span>
            <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                {arrest.subject}
            </h1>
            <div className="mt-1 text-[13px] text-ios-gray">
                {t('mdt.bookedBy', 'Booked by {name} on {date}', {
                    name: arrest.callsign ? `${arrest.callsign} · ${arrest.officer}` : arrest.officer,
                    date: formatMediumDate(arrest.createdAt),
                })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                <Pill tone={arrest.jailed ? 'red' : 'green'}>
                    {arrest.jailed ? t('mdt.sentenceServed', 'Sentenced') : t('mdt.noSentence', 'No sentence')}
                </Pill>
                <Pill tone={arrest.fined ? 'orange' : 'green'}>
                    {arrest.fined ? t('mdt.fineIssued', 'Fine issued') : t('mdt.noFine', 'No fine')}
                </Pill>
            </div>

            <button
                type="button"
                onClick={() => open('profiles', arrest.citizenid)}
                className="mt-4 flex w-full items-center gap-3 rounded-[16px] bg-ios-blue/10 px-4 py-3 text-left active:opacity-70"
            >
                <InitialsAvatar name={arrest.subject} color={colorFor(arrest.citizenid)} size={40} />
                <span className="min-w-0 flex-1">
                    <span className={`block truncate ${mdtRowTitle}`}>{arrest.subject}</span>
                    <span className={`block truncate tabular-nums ${mdtRowMeta}`}>{arrest.citizenid}</span>
                </span>
                <span className="shrink-0 text-[14.5px] font-medium text-ios-blue">
                    {t('mdt.openRecord', 'Open record')}
                </span>
            </button>

            <MdtCard className="mt-4 overflow-hidden">
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div className="p-4">
                        <div className={mdtSectionHeader}>{t('mdt.sentence', 'Sentence')}</div>
                        <div className="mt-1 text-[20px] font-semibold tabular-nums text-black dark:text-white">
                            {arrest.months > 0 ? sentenceLabel(arrest.months) : t('mdt.none', 'None')}
                        </div>
                    </div>
                    <div className="p-4">
                        <div className={mdtSectionHeader}>{t('mdt.fine', 'Fine')}</div>
                        <div className="mt-1 text-[20px] font-semibold tabular-nums text-black dark:text-white">
                            {arrest.fine > 0 ? formatMoney(arrest.fine, { whole: true }) : t('mdt.none', 'None')}
                        </div>
                    </div>
                </div>
            </MdtCard>

            {arrest.reportRef && (
                <button
                    type="button"
                    onClick={() => open('reports', arrest.reportRef ?? null)}
                    className="mt-4 flex w-full items-center gap-2 rounded-[12px] bg-ios-blue/10 px-3 py-2 text-left active:opacity-70"
                >
                    <FileText className="h-[15px] w-[15px] shrink-0 text-ios-blue" strokeWidth={2.25} />
                    <span className="text-[14.5px] font-medium text-ios-blue">
                        {t('mdt.fromReport', 'From report {ref}', { ref: arrest.reportRef })}
                    </span>
                </button>
            )}

            <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.charges', 'Charges')}</div>
            <MdtCard className="overflow-hidden">
                {arrest.charges.length === 0 ? (
                    <div className="px-4 py-5 text-center text-[14px] text-ios-gray">
                        {t('mdt.noCharges', 'No charges were filed on this report.')}
                    </div>
                ) : arrest.charges.map((charge, index) => (
                    <div key={`${charge.code}:${index}`} className="flex items-center gap-3 px-4 py-2.5">
                        <Pill tone={STATUS_TONE[charge.class] ?? 'blue'}>{charge.code}</Pill>
                        <span className={`min-w-0 flex-1 truncate ${mdtRowTitle}`}>
                            {charge.label}
                            {charge.count > 1 && <span className="font-normal text-ios-gray">{` ×${charge.count}`}</span>}
                        </span>
                    </div>
                ))}
            </MdtCard>
            <div className="h-6" />
        </Scroller>
    );
}
