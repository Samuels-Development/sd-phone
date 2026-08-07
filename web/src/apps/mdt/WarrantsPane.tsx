import { useEffect, useMemo, useState } from 'react';
import { FileText, Gavel, UserPlus, X } from 'lucide-react';

import { t } from '@/i18n';
import { colorFor } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { formatMediumDate } from '@/lib/time';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { SegmentedControl } from '@/ui/SegmentedControl';

import { catalogIndex, ChargePicker, inputTotals, sentenceLabel } from './ChargePicker';
import type { ChargeInput, Warrant } from './data';
import { mdtCloseWarrant, mdtIssueWarrant, mdtWarrant, mdtWarrantVoid, mdtWarrants } from './mdtApi';
import { PersonPicker } from './PersonPicker';
import { ReportLinker } from './ReportEditor';
import { useMdtSession } from './useMdtSession';
import { mdtPanePad, mdtRef, mdtRowHover, mdtRowMeta, mdtRowTitle, mdtSectionHeader, STATUS_TONE } from './mdtTheme';
import { MdtButton } from './ui/MdtButton';
import { MdtCard } from './ui/MdtCard';
import { MdtField } from './ui/MdtField';

type StatusFilter = 'active' | 'expired';

const DAY = 86400;

function expiryLabel(warrant: Warrant): string {
    if (!warrant.active) return t('mdt.closedOn', 'Closed {date}', { date: formatMediumDate(warrant.expiresAt) });
    const days = Math.ceil((warrant.expiresAt - Math.floor(Date.now() / 1000)) / DAY);
    if (days <= 1) return t('mdt.expiresToday', 'Expires today');
    return t('mdt.expiresInDays', 'Expires in {n} days', { n: days });
}

function Counter({ tone, value, label }: { tone: 'red' | 'orange' | 'blue'; value: number; label: string }) {
    if (value <= 0) return null;
    return <Pill tone={tone}>{`${value} ${label}`}</Pill>;
}

function WarrantListRow({ warrant, selected, onPress }: {
    warrant:  Warrant;
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
                <span className={`shrink-0 ${mdtRef}`}>{warrant.ref}</span>
                <span className={`min-w-0 flex-1 truncate ${mdtRowTitle}`}>{warrant.subject}</span>
                <span className={`shrink-0 tabular-nums ${mdtRowMeta}`}>{expiryLabel(warrant)}</span>
            </span>
            <span className="flex w-full items-center gap-1.5">
                <Counter tone="red" value={warrant.felonies} label={t('mdt.abbrFelony', 'F')} />
                <Counter tone="orange" value={warrant.misdemeanors} label={t('mdt.abbrMisdemeanor', 'M')} />
                <Counter tone="blue" value={warrant.infractions} label={t('mdt.abbrInfraction', 'I')} />
                <span className={`ml-auto shrink-0 truncate tabular-nums ${mdtRowMeta}`}>
                    {warrant.reportRef ?? warrant.citizenid}
                </span>
            </span>
        </button>
    );
}

export function WarrantsPane() {
    const { can, selected, select } = useMdtSession();

    const [status, setStatus] = useSessionState<StatusFilter>('mdt:warrants:status', 'active');
    const [query, setQuery] = useSessionState('mdt:warrants:query', '');
    const [page, setPage] = useSessionState('mdt:warrants:page', 1);
    const [term, setTerm] = useState(query.trim());
    const [issuing, setIssuing] = useState(false);

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, status, setPage]);

    const { data, loading, settled, refetch } = useAsyncData(
        () => mdtWarrants({ status, query: term, page }),
        [status, term, page],
    );

    const rows = data?.rows ?? [];
    const total = data?.total ?? 0;
    const pageSize = data?.pageSize ?? 25;

    const empty = (
        <EmptyState
            center
            icon={Gavel}
            title={status === 'active'
                ? t('mdt.noActiveWarrants', 'No active warrants')
                : t('mdt.noExpiredWarrants', 'No closed warrants')}
            subtitle={loading
                ? undefined
                : status === 'active'
                    ? t('mdt.noActiveWarrantsSub', 'Nobody in the city is wanted right now.')
                    : t('mdt.noExpiredWarrantsSub', 'Warrants stay on file here once they are closed or run out.')}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.warrants', 'Warrants')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.searchWarrants', 'Name or reference')}
            action={can('warrants.issue') ? (
                <MdtButton size="sm" onClick={() => setIssuing(true)}>
                    {t('mdt.issueWarrant', 'Issue')}
                </MdtButton>
            ) : undefined}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            footer={<Pager page={data?.page ?? page} pageSize={pageSize} total={total} onPage={setPage} />}
        >
            <div className="px-3 pb-2">
                <SegmentedControl<StatusFilter>
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: 'active', label: t('mdt.active', 'Active') },
                        { value: 'expired', label: t('mdt.expired', 'Expired') },
                    ]}
                />
            </div>

            <div className="mdt-stagger flex flex-col gap-0.5 px-1">
                {rows.map(row => (
                    <WarrantListRow
                        key={row.ref}
                        warrant={row}
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
                hasDetail={selected !== null}
                detail={selected ? (
                    <WarrantDetail
                        key={selected}
                        warrantRef={selected}
                        canClose={can('warrants.close')}
                        canVoid={can('warrants.void')}
                        onClosed={refetch}
                    />
                ) : undefined}
                placeholder={
                    <EmptyState
                        center
                        icon={Gavel}
                        title={t('mdt.pickWarrant', 'No warrant selected')}
                        subtitle={t('mdt.pickWarrantSub', 'Open a warrant to see its charges, its bond and who issued it.')}
                    />
                }
                onCloseDetail={() => select(null)}
            />

            {issuing && (
                <IssueWarrant
                    onClose={() => setIssuing(false)}
                    onIssued={warrant => {
                        setIssuing(false);
                        setStatus('active');
                        select(warrant.ref);
                        refetch();
                    }}
                />
            )}
        </div>
    );
}

function Figure({ label, value }: { label: string; value: string }) {
    return (
        <div className="p-4">
            <div className={mdtSectionHeader}>{label}</div>
            <div className="mt-1 text-[20px] font-semibold tabular-nums text-black dark:text-white">{value}</div>
        </div>
    );
}

function WarrantDetail({ warrantRef, canClose, canVoid, onClosed }: {
    warrantRef: string;
    canClose:   boolean;
    canVoid:    boolean;
    onClosed:   () => void;
}) {
    const { open } = useMdtSession();

    const [warrant, setWarrant] = useState<Warrant | null>(null);
    const { loading } = useAsyncData(() => mdtWarrant(warrantRef), [warrantRef], { onData: setWarrant });

    const [confirm, setConfirm] = useState(false);
    const [voiding, setVoiding] = useState(false);
    const [error, setError] = useState('');

    async function close() {
        setConfirm(false);
        const next = await mdtCloseWarrant(warrantRef);
        if (!next) {
            setError(t('mdt.actionFailed', 'That could not be done.'));
            return;
        }
        setWarrant(next);
        setError('');
        onClosed();
    }

    async function quash() {
        setVoiding(false);
        const ok = await mdtWarrantVoid(warrantRef);
        if (!ok) {
            setError(t('mdt.actionFailed', 'That could not be done.'));
            return;
        }
        const next = await mdtWarrant(warrantRef);
        if (next) setWarrant(next);
        setError('');
        onClosed();
    }

    if (!warrant) {
        if (loading) {
            return (
                <div className="flex flex-col gap-3 p-6">
                    <div className="h-20 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                    <div className="h-24 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                    <div className="h-40 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                </div>
            );
        }
        return (
            <EmptyState
                center
                icon={Gavel}
                title={t('mdt.warrantGone', 'Warrant unavailable')}
                subtitle={t('mdt.warrantGoneSub', 'It is no longer on file.')}
            />
        );
    }

    return (
        <Scroller className={`h-full ${mdtPanePad}`}>
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className={mdtRef}>{warrant.ref}</span>
                        <Pill tone={warrant.active ? 'red' : 'green'}>
                            {warrant.active ? t('mdt.active', 'Active') : t('mdt.closed', 'Closed')}
                        </Pill>
                    </div>
                    <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                        {warrant.subject}
                    </h1>
                    <div className="mt-1 text-[13px] text-ios-gray">
                        {t('mdt.issuedBy', 'Issued by {name} on {date}', {
                            name: warrant.callsign
                                ? `${warrant.callsign} · ${warrant.officer}`
                                : warrant.officer,
                            date: formatMediumDate(warrant.issuedAt),
                        })}
                    </div>
                </div>
                {canVoid && warrant.active ? (
                    <MdtButton variant="destructive" size="sm" onClick={() => setVoiding(true)}>
                        {t('mdt.voidWarrant', 'Quash warrant')}
                    </MdtButton>
                ) : canClose && warrant.active ? (
                    <MdtButton variant="destructive" size="sm" onClick={() => setConfirm(true)}>
                        {t('mdt.closeWarrant', 'Close warrant')}
                    </MdtButton>
                ) : null}
            </div>

            <button
                type="button"
                onClick={() => open('profiles', warrant.citizenid)}
                className="mt-4 flex w-full items-center gap-3 rounded-[16px] bg-ios-blue/10 px-4 py-3 text-left active:opacity-70"
            >
                <InitialsAvatar name={warrant.subject} color={colorFor(warrant.citizenid)} size={40} />
                <span className="min-w-0 flex-1">
                    <span className={`block truncate ${mdtRowTitle}`}>{warrant.subject}</span>
                    <span className={`block truncate tabular-nums ${mdtRowMeta}`}>{warrant.citizenid}</span>
                </span>
                <span className="shrink-0 text-[14.5px] font-medium text-ios-blue">
                    {t('mdt.openRecord', 'Open record')}
                </span>
            </button>

            <MdtCard className="mt-4 overflow-hidden">
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    <Figure label={t('mdt.felonies', 'Felonies')} value={String(warrant.felonies)} />
                    <Figure label={t('mdt.misdemeanors', 'Misdemeanors')} value={String(warrant.misdemeanors)} />
                    <Figure label={t('mdt.infractions', 'Infractions')} value={String(warrant.infractions)} />
                    <Figure label={t('mdt.bond', 'Bond')} value={formatMoney(warrant.bond, { whole: true })} />
                </div>
            </MdtCard>

            <div className={`mt-4 tabular-nums ${mdtRowMeta}`}>{expiryLabel(warrant)}</div>

            {warrant.reportRef && (
                <button
                    type="button"
                    onClick={() => open('reports', warrant.reportRef ?? null)}
                    className="mt-4 flex w-full items-center gap-2 rounded-[12px] bg-ios-blue/10 px-3 py-2 text-left active:opacity-70"
                >
                    <FileText className="h-[15px] w-[15px] shrink-0 text-ios-blue" strokeWidth={2.25} />
                    <span className="text-[14.5px] font-medium text-ios-blue">
                        {t('mdt.fromReport', 'From report {ref}', { ref: warrant.reportRef })}
                    </span>
                </button>
            )}

            <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.charges', 'Charges')}</div>
            <MdtCard className="overflow-hidden">
                {warrant.charges.length === 0 ? (
                    <div className="px-4 py-5 text-center text-[14px] text-ios-gray">
                        {t('mdt.noCharges', 'No charges were filed on this report.')}
                    </div>
                ) : warrant.charges.map((charge, index) => (
                    <div key={`${charge.code}:${index}`} className="flex items-center gap-3 px-4 py-2.5">
                        <Pill tone={STATUS_TONE[charge.class] ?? 'blue'}>{charge.code}</Pill>
                        <span className={`min-w-0 flex-1 truncate ${mdtRowTitle}`}>
                            {charge.label}
                            {charge.count > 1 && <span className="font-normal text-ios-gray">{` ×${charge.count}`}</span>}
                        </span>
                    </div>
                ))}
            </MdtCard>

            {error && <div className="mt-4 text-[14px] text-ios-red">{error}</div>}
            <div className="h-6" />

            {confirm && (
                <AlertDialog
                    destructive
                    title={t('mdt.closeWarrantTitle', 'Close this warrant?')}
                    message={t('mdt.closeWarrantSub', 'The record stays on file. The subject stops being wanted for it.')}
                    confirmLabel={t('mdt.closeWarrant', 'Close warrant')}
                    onCancel={() => setConfirm(false)}
                    onConfirm={() => void close()}
                />
            )}

            {voiding && (
                <AlertDialog
                    destructive
                    title={t('mdt.voidWarrantTitle', 'Quash this warrant?')}
                    message={t('mdt.voidWarrantSub', 'The court sets the warrant aside. The subject stops being wanted for it whichever department issued it.')}
                    confirmLabel={t('mdt.voidWarrant', 'Quash warrant')}
                    onCancel={() => setVoiding(false)}
                    onConfirm={() => void quash()}
                />
            )}
        </Scroller>
    );
}

function IssueWarrant({ onIssued, onClose }: {
    onIssued: (warrant: Warrant) => void;
    onClose:  () => void;
}) {
    const { offences } = useMdtSession();

    const [subject, setSubject] = useState<{ citizenid: string; name: string } | null>(null);
    const [reportRef, setReportRef] = useState<string | null>(null);
    const [charges, setCharges] = useState<ChargeInput[]>([]);
    const [days, setDays] = useState('7');
    const [bond, setBond] = useState('0');
    const [picking, setPicking] = useState(false);
    const [linking, setLinking] = useState(false);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const byCode = useMemo(() => catalogIndex(offences), [offences]);
    const totals = useMemo(() => inputTotals(charges, byCode), [charges, byCode]);

    async function issue() {
        if (saving) return;
        if (!subject) {
            setError(t('mdt.warrantNeedsSubject', 'Pick the citizen this warrant is against.'));
            return;
        }
        if (!reportRef && charges.length === 0) {
            setError(t('mdt.warrantNeedsCharges', 'Attach a report, or pick at least one charge.'));
            return;
        }
        setSaving(true);
        const warrant = await mdtIssueWarrant({
            citizenid:  subject.citizenid,
            reportRef,
            charges:    reportRef ? [] : charges,
            expiryDays: Number(days) || 7,
            bond:       Number(bond) || 0,
        });
        setSaving(false);
        if (!warrant) {
            setError(t('mdt.issueFailed', 'That warrant could not be issued. The subject may not be a suspect on that report.'));
            return;
        }
        onIssued(warrant);
    }

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-base">
            <div className="flex shrink-0 items-center gap-3 px-6 pb-1 pt-5">
                <h1 className="min-w-0 flex-1 truncate text-[26px] font-bold tracking-ios-display text-black dark:text-white">
                    {t('mdt.issueWarrantTitle', 'Issue a warrant')}
                </h1>
                <MdtButton variant="text" onClick={onClose}>{t('common.cancel', 'Cancel')}</MdtButton>
            </div>

            <Scroller className="min-h-0 flex-1 px-6 pb-6">
                <div className={`mb-2 mt-4 px-1 ${mdtSectionHeader}`}>{t('mdt.subject', 'Subject')}</div>
                <MdtCard className="overflow-hidden">
                    {subject ? (
                        <div className="flex items-center gap-3 px-4 py-3">
                            <InitialsAvatar name={subject.name} color={colorFor(subject.citizenid)} size={36} />
                            <span className="min-w-0 flex-1">
                                <span className={`block truncate ${mdtRowTitle}`}>{subject.name}</span>
                                <span className={`block truncate tabular-nums ${mdtRowMeta}`}>{subject.citizenid}</span>
                            </span>
                            <button
                                type="button"
                                onClick={() => { setSubject(null); setReportRef(null); }}
                                aria-label={t('mdt.clearSubject', 'Clear subject')}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ios-gray active:opacity-50"
                            >
                                <X className="h-[16px] w-[16px]" strokeWidth={2.5} />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setPicking(true)}
                            className={`flex w-full items-center gap-2 px-4 py-3.5 text-left text-[15px] font-medium text-ios-blue ${mdtRowHover}`}
                        >
                            <UserPlus className="h-[16px] w-[16px]" strokeWidth={2.4} />
                            {t('mdt.pickCitizen', 'Pick a citizen')}
                        </button>
                    )}
                </MdtCard>

                <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.sourceReport', 'Source report')}</div>
                <MdtCard className="overflow-hidden">
                    {reportRef ? (
                        <div className="flex items-center gap-3 px-4 py-3">
                            <FileText className="h-[17px] w-[17px] shrink-0 text-ios-gray" strokeWidth={2.2} />
                            <span className="min-w-0 flex-1">
                                <span className={`block truncate tabular-nums ${mdtRowTitle}`}>{reportRef}</span>
                                <span className={`block truncate ${mdtRowMeta}`}>
                                    {t('mdt.chargesFromReport', 'Charges are taken from this report')}
                                </span>
                            </span>
                            <button
                                type="button"
                                onClick={() => setReportRef(null)}
                                aria-label={t('mdt.clearReport', 'Clear report')}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ios-gray active:opacity-50"
                            >
                                <X className="h-[16px] w-[16px]" strokeWidth={2.5} />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setLinking(true)}
                            className={`flex w-full items-center gap-2 px-4 py-3.5 text-left text-[15px] font-medium text-ios-blue ${mdtRowHover}`}
                        >
                            <FileText className="h-[16px] w-[16px]" strokeWidth={2.4} />
                            {t('mdt.attachReport', 'Attach a filed report (optional)')}
                        </button>
                    )}
                </MdtCard>

                {!reportRef && (
                    <>
                        <div className={`mb-2 mt-5 px-1 ${mdtSectionHeader}`}>{t('mdt.charges', 'Charges')}</div>
                        <ChargePicker className="min-h-[320px]" lines={charges} onChange={setCharges} />
                    </>
                )}

                <div className="mt-5 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <MdtField
                        label={t('mdt.expiryDays', 'Expires in days')}
                        value={days}
                        onChange={v => setDays(v.replace(/\D/g, '').slice(0, 3))}
                        inputMode="numeric"
                        placeholder="7"
                    />
                    <MdtField
                        label={t('mdt.bond', 'Bond')}
                        value={bond}
                        onChange={v => setBond(v.replace(/\D/g, '').slice(0, 7))}
                        inputMode="numeric"
                        placeholder="0"
                    />
                </div>

                {error && <div className="mt-4 text-[14px] text-ios-red">{error}</div>}

                <div className="mt-5 flex items-center gap-3 pb-2">
                    <MdtButton variant="filled" disabled={saving} onClick={() => void issue()}>
                        {saving ? t('mdt.issuing', 'Issuing') : t('mdt.issue', 'Issue warrant')}
                    </MdtButton>
                    {!reportRef && charges.length > 0 && (
                        <span className={`ml-auto tabular-nums ${mdtRowMeta}`}>
                            {sentenceLabel(totals.months)}
                            {' · '}
                            {formatMoney(totals.fine, { whole: true })}
                        </span>
                    )}
                </div>
            </Scroller>

            {picking && (
                <PersonPicker
                    title={t('mdt.pickCitizen', 'Pick a citizen')}
                    onClose={() => setPicking(false)}
                    onPick={person => { setPicking(false); setSubject(person); }}
                />
            )}

            {linking && (
                <ReportLinker
                    title={t('mdt.attachReportTitle', 'Attach a report')}
                    onClose={() => setLinking(false)}
                    onPick={ref => { setLinking(false); setReportRef(ref); }}
                />
            )}
        </div>
    );
}
