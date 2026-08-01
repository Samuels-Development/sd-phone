import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';

import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { useAsyncData } from '@/hooks/useAsyncData';
import { DialogShell } from '@/ui/DialogShell';
import { Slider } from '@/ui/Slider';

import { sentenceLabel } from './ChargePicker';
import type { ArrestRow } from './data';
import { mdtBook, mdtJailQuote, mdtReport } from './mdtApi';
import { ReportLinker } from './ReportEditor';
import { mdtSectionHeader } from './mdtTheme';
import { MdtSelect } from './ui/MdtSelect';

export function BookingDialog({ onClose, onBooked }: {
    onClose:  () => void;
    onBooked: (arrest: ArrestRow) => void;
}) {
    const [reportRef, setReportRef] = useState<string | null>(null);
    const [citizenid, setCitizenid] = useState('');
    const [jail, setJail] = useState(true);
    const [fine, setFine] = useState(true);
    const [reduction, setReduction] = useState(0);
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

    useEffect(() => { setReduction(0); setError(''); }, [reportRef, citizenid]);

    function dismiss(after: () => void) {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(after, 180);
    }

    if (!reportRef) {
        return (
            <ReportLinker
                title={t('mdt.bookFromReport', 'Book from a report')}
                onClose={onClose}
                onPick={setReportRef}
            />
        );
    }

    if (!quote) {
        const noSuspects = report !== null && suspects.length === 0;
        return (
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

    async function book() {
        if (saving || !reportRef) return;
        setSaving(true);
        const arrest = await mdtBook({
            reportRef,
            citizenid,
            jail:            jail && canJail,
            fine:            fine && canFine,
            reductionMonths: reduction,
        });
        setSaving(false);
        if (!arrest) {
            setError(t('mdt.bookingFailed', 'That booking was refused. The suspect has to be online and not already booked for this report.'));
            return;
        }
        dismiss(() => onBooked(arrest));
    }

    return (
        <DialogShell
            exiting={exiting}
            title={t('mdt.bookSuspect', 'Book suspect')}
            message={t('mdt.bookSuspectSub', 'Every figure comes from the charges filed on {ref}.', { ref: reportRef })}
            cancel={{ label: t('common.cancel', 'Cancel'), onClick: () => dismiss(onClose) }}
            confirm={{
                label:    saving ? t('mdt.booking', 'Booking') : t('mdt.confirmBooking', 'Book'),
                onClick:  () => void book(),
                disabled: saving || !((jail && canJail) || (fine && canFine)),
                busy:     saving,
            }}
        >
            <div className="mt-4 text-left">
                {suspects.length > 1 && (
                    <MdtSelect
                        value={citizenid}
                        onChange={setCitizenid}
                        options={suspects.map(suspect => ({ value: suspect.citizenid, label: suspect.name }))}
                        ariaLabel={t('mdt.suspect', 'Suspect')}
                        className="mb-3"
                    />
                )}

                <div className="flex gap-2">
                    <Figure label={t('mdt.sentence', 'Sentence')} value={sentenceLabel(sentence)} />
                    <Figure label={t('mdt.fine', 'Fine')} value={formatMoney(quote.fine, { whole: true })} />
                </div>

                {maxReduction > 0 && (
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
                        detail={canFine ? formatMoney(quote.fine, { whole: true }) : fineBlocked}
                        checked={fine && canFine}
                        disabled={!canFine}
                        onToggle={() => setFine(v => !v)}
                    />
                </div>

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
