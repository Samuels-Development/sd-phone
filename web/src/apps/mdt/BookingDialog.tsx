import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { useAsyncData } from '@/hooks/useAsyncData';
import { DialogShell } from '@/ui/DialogShell';
import { useMenuRoot } from '@/ui/menuRoot';
import { Select } from '@/ui/Select';
import { Slider } from '@/ui/Slider';

import { sentenceLabel } from './ChargePicker';
import type { ArrestRow } from './data';
import { mdtBook, mdtJailQuote, mdtReport } from './mdtApi';
import { ReportLinker } from './ReportEditor';
import { mdtSectionHeader } from './mdtTheme';

export function BookingDialog({ onClose, onBooked, fromReport, fromCitizen, mode }: {
    onClose:      () => void;
    onBooked:     (arrest: ArrestRow) => void;
    fromReport?:  string;
    fromCitizen?: string;
    mode?:        'jail' | 'fine';
}) {
    const host = useMenuRoot();
    const [reportRef, setReportRef] = useState<string | null>(fromReport ?? null);
    const [citizenid, setCitizenid] = useState(fromCitizen ?? '');
    const [jail, setJail] = useState(mode !== 'fine');
    const [fine, setFine] = useState(mode !== 'jail');
    const [reduction, setReduction] = useState(0);
    const [fineCut, setFineCut] = useState(0);
    const [exiting, setExiting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const { data: report, loading: loadingReport } = useAsyncData(
        () => (reportRef ? mdtReport(reportRef) : Promise.resolve(null)),
        [reportRef],
    );

    const suspects = useMemo(
        () => (report?.involved ?? []).filter(person => person.role === 'suspect'),
        [report],
    );

    useEffect(() => {
        if (suspects.length > 0 && !suspects.some(s => s.citizenid === citizenid)) {
            setCitizenid(suspects[0].citizenid);
        }
    }, [suspects, citizenid]);

    const { data: quote } = useAsyncData(
        () => (reportRef && citizenid ? mdtJailQuote(reportRef, citizenid) : Promise.resolve(null)),
        [reportRef, citizenid],
    );

    useEffect(() => { setReduction(0); setFineCut(0); setError(''); }, [reportRef, citizenid]);

    function dismiss(after: () => void) {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(after, 180);
    }

    function atRoot(node: ReactNode) {
        return host ? createPortal(node, host) : node;
    }

    if (!reportRef) {
        return atRoot(
            <ReportLinker
                title={t('mdt.bookFromReport', 'Book from a report')}
                onClose={onClose}
                onPick={setReportRef}
            />
        );
    }

    if (!quote) {
        const noSuspects = report !== null && suspects.length === 0;
        return atRoot(
            <DialogShell
                exiting={exiting}
                title={noSuspects
                    ? t('mdt.noSuspects', 'No suspects on that report')
                    : t('mdt.preparingBooking', 'Reading the charges')}
                message={noSuspects
                    ? t('mdt.noSuspectsSub', 'Add the person to that report as a suspect, then book them.')
                    : loadingReport
                        ? t('mdt.preparingBookingSub', 'Pulling what {ref} carries for this suspect.', { ref: reportRef })
                        : t('mdt.quoteUnavailable', 'That report and suspect could not be read.')}
                cancel={{ label: t('common.cancel', 'Cancel'), onClick: () => dismiss(onClose) }}
                confirm={{
                    label:   t('mdt.pickAnotherReport', 'Pick another'),
                    onClick: () => setReportRef(null),
                }}
            />
        );
    }

    const jailBlocked = quote.jailedAlready
        ? t('mdt.alreadyJailed', 'Already jailed for {ref}', { ref: reportRef })
        : !quote.jailAvailable
            ? t('mdt.noJailSystem', 'No jail system on this server')
            : quote.months === 0
                ? t('mdt.noJailOnCharges', 'These charges carry no jail time')
                : '';

    const fineBlocked = quote.finedAlready
        ? t('mdt.alreadyFined', 'Already fined for {ref}', { ref: reportRef })
        : quote.fine === 0
            ? t('mdt.noFineOnCharges', 'These charges carry no fine')
            : '';

    const canJail = jailBlocked === '';
    const canFine = fineBlocked === '';
    const maxReduction = Math.min(quote.maxReduction, quote.months);
    const sentence = Math.max(0, quote.months - reduction);
    const maxFineCut = Math.min(quote.maxFineReduction ?? 0, quote.fine);
    const charged = Math.max(0, quote.fine - fineCut);

    async function book() {
        if (saving || !reportRef) return;
        setSaving(true);
        const arrest = await mdtBook({
            reportRef,
            citizenid,
            jail:            mode ? mode === 'jail' && canJail : jail && canJail,
            fine:            mode ? mode === 'fine' && canFine : fine && canFine,
            reductionMonths: reduction,
            reductionFine:   fineCut,
        });
        setSaving(false);
        if (!arrest) {
            setError(t('mdt.bookingFailed', 'That booking was refused. The suspect has to be online and not already booked for this report.'));
            return;
        }
        dismiss(() => onBooked(arrest));
    }

    const title = mode === 'jail'
        ? t('mdt.jailSuspect', 'Jail suspect')
        : mode === 'fine'
            ? t('mdt.fineSuspect', 'Issue fine')
            : t('mdt.bookSuspect', 'Book suspect');

    const confirmLabel = saving
        ? t('mdt.booking', 'Booking')
        : mode === 'jail'
            ? t('mdt.sendToJail', 'Send to jail')
            : mode === 'fine'
                ? t('mdt.issueFine', 'Issue fine')
                : t('mdt.confirmBooking', 'Book');

    const blocked = mode === 'jail' ? jailBlocked : mode === 'fine' ? fineBlocked : '';
    const ready = mode === 'jail' ? canJail : mode === 'fine' ? canFine : ((jail && canJail) || (fine && canFine));

    return atRoot(
        <DialogShell
            exiting={exiting}
            title={title}
            message={t('mdt.bookSuspectSub', 'Every figure comes from the charges filed on {ref}.', { ref: reportRef })}
            cancel={{ label: t('common.cancel', 'Cancel'), onClick: () => dismiss(onClose) }}
            confirm={{
                label:    confirmLabel,
                onClick:  () => void book(),
                disabled: saving || !ready,
                busy:     saving,
            }}
        >
            <div className="mt-4 text-left">
                {suspects.length > 1 && (
                    <Select
                        value={citizenid}
                        onChange={setCitizenid}
                        options={suspects.map(suspect => ({ value: suspect.citizenid, label: suspect.name }))}
                        ariaLabel={t('mdt.suspect', 'Suspect')}
                        className="mb-3"
                    />
                )}

                <div className="flex gap-2">
                    {mode !== 'fine' && (
                        <Figure label={t('mdt.sentence', 'Sentence')} value={sentenceLabel(sentence)} />
                    )}
                    {mode !== 'jail' && (
                        <Figure label={t('mdt.fine', 'Fine')} value={formatMoney(charged, { whole: true })} />
                    )}
                </div>

                {mode !== 'fine' && maxReduction > 0 && (
                    <div className="mt-3">
                        <div className="flex items-baseline justify-between">
                            <span className={mdtSectionHeader}>{t('mdt.reduction', 'Reduction')}</span>
                            <span className="text-[12.5px] font-medium tabular-nums text-ios-gray">
                                {t('mdt.minusMonths', '-{n} months', { n: reduction })}
                            </span>
                        </div>
                        <Slider
                            value={reduction}
                            min={0}
                            max={maxReduction}
                            step={1}
                            onChange={setReduction}
                            ariaLabel={t('mdt.reduction', 'Reduction')}
                        />
                    </div>
                )}

                {mode !== 'jail' && maxFineCut > 0 && (
                    <div className="mt-3">
                        <div className="flex items-baseline justify-between">
                            <span className={mdtSectionHeader}>{t('mdt.fineReduction', 'Fine reduction')}</span>
                            <span className="text-[12.5px] font-medium tabular-nums text-ios-gray">
                                {t('mdt.minusMoney', '-{amount}', { amount: formatMoney(fineCut, { whole: true }) })}
                            </span>
                        </div>
                        <Slider
                            value={fineCut}
                            min={0}
                            max={maxFineCut}
                            step={25}
                            onChange={setFineCut}
                            ariaLabel={t('mdt.fineReduction', 'Fine reduction')}
                        />
                    </div>
                )}

                {!mode && (
                    <div className="mt-3 overflow-hidden rounded-[10px] bg-black/[0.05] dark:bg-white/[0.08]">
                        <CheckRow
                            label={t('mdt.sendToJail', 'Send to jail')}
                            detail={canJail ? sentenceLabel(sentence) : jailBlocked}
                            checked={jail && canJail}
                            disabled={!canJail}
                            onToggle={() => setJail(v => !v)}
                        />
                        <CheckRow
                            label={t('mdt.issueFine', 'Issue fine')}
                            detail={canFine ? formatMoney(charged, { whole: true }) : fineBlocked}
                            checked={fine && canFine}
                            disabled={!canFine}
                            onToggle={() => setFine(v => !v)}
                        />
                    </div>
                )}

                {blocked && <div className="mt-3 text-[13.5px] leading-snug text-ios-orange">{blocked}</div>}
                {error && <div className="mt-3 text-[13.5px] leading-snug text-ios-red">{error}</div>}
            </div>
        </DialogShell>
    );
}

function Figure({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex-1 rounded-[10px] bg-black/[0.05] px-3 py-2 dark:bg-white/[0.08]">
            <div className="text-[11.5px] uppercase tracking-wider text-ios-gray">{label}</div>
            <div className="mt-0.5 text-[17px] font-semibold tabular-nums text-black dark:text-white">{value}</div>
        </div>
    );
}

function CheckRow({ label, detail, checked, disabled, onToggle }: {
    label:    string;
    detail:   string;
    checked:  boolean;
    disabled: boolean;
    onToggle: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onToggle}
            disabled={disabled}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left disabled:opacity-45"
        >
            <span
                className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-[6px] ${
                    checked ? 'bg-ios-blue' : 'border border-black/25 dark:border-white/30'
                }`}
            >
                {checked && <Check className="h-[13px] w-[13px] text-white" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-black dark:text-white">{label}</span>
                <span className="block truncate text-[12.5px] text-ios-gray">{detail}</span>
            </span>
        </button>
    );
}
