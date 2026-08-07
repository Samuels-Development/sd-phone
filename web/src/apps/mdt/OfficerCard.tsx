import { useCallback, useEffect, useState } from 'react';
import { Radio } from 'lucide-react';

import { device } from '@device';
import { t } from '@/i18n';
import { colorFor } from '@/lib/format';
import { AlertDialog } from '@/ui/AlertDialog';
import { FadeImage } from '@/ui/FadeImage';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { useAsyncData } from '@/hooks/useAsyncData';
import { iaStatusLabel } from './AffairsFile';
import type { GradeOption, OfficerRow } from './data';
import { mdtRowHover, mdtRowMeta, mdtRuleX, mdtSectionHeader } from './mdtTheme';
import { mdtAffairsForOfficer, mdtDismiss, mdtPageUnit, mdtSetCallsign, mdtSetGrade, mdtSetRadio } from './mdtApi';
import { MdtButton } from './ui/MdtButton';
import { MdtField } from './ui/MdtField';
import { useMdtSession } from './useMdtSession';

const STAT_MIN = device.id === 'phone' ? 150 : 210;

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <div className={mdtSectionHeader}>{label}</div>
            <div className="mt-0.5 truncate text-[17px] font-semibold tabular-nums text-black dark:text-white">
                {value}
            </div>
        </div>
    );
}

export function OfficerCard({ officer, grades = [], onChanged, onDismissed }: {
    officer:      OfficerRow;
    grades?:      GradeOption[];
    onChanged?:   (officer: OfficerRow) => void;
    onDismissed?: () => void;
}) {
    const { me, can, open } = useMdtSession();

    const [callsign, setCallsign] = useState(officer.callsign ?? '');
    const [radio, setRadio] = useState(officer.radio ?? '');
    const [grade, setGrade] = useState(String(officer.gradeLevel));
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [paged, setPaged] = useState('');
    const [confirmDismiss, setConfirmDismiss] = useState(false);

    const { data: iaData } = useAsyncData(
        () => mdtAffairsForOfficer(officer.citizenid),
        [officer.citizenid],
        { enabled: can('affairs.view') },
    );
    const ia = iaData ?? [];

    useEffect(() => {
        setCallsign(officer.callsign ?? '');
        setRadio(officer.radio ?? '');
        setGrade(String(officer.gradeLevel));
        setNotice('');
        setPaged('');
    }, [officer.citizenid, officer.callsign, officer.radio, officer.gradeLevel]);

    const isSelf = me?.citizenid === officer.citizenid;
    const myGrade = me?.gradeLevel ?? 0;
    const junior = !isSelf && officer.gradeLevel < myGrade;

    const gradeOptions = grades
        .filter(g => g.level < myGrade)
        .map(g => ({ value: String(g.level), label: g.label }));

    const showCallsign = can('roster.callsign');
    const showRadio = can('roster.radio');
    const showGrade = can('roster.grade') && junior && gradeOptions.length > 0;
    const showDismiss = can('roster.dismiss') && junior;
    const showManagement = showCallsign || showRadio || showGrade || showDismiss;

    const apply = useCallback(async (fn: () => Promise<OfficerRow | null>, done: string) => {
        setBusy(true);
        setNotice('');
        const next = await fn();
        setBusy(false);
        if (!next) {
            setNotice(t('mdt.changeRefused', 'That change was refused.'));
            return;
        }
        setNotice(done);
        onChanged?.(next);
    }, [onChanged]);

    const page = useCallback(async () => {
        setPaged('');
        const res = await mdtPageUnit(officer.citizenid);
        if (!res) {
            setPaged(t('mdt.pageFailed', 'Could not reach that unit.'));
            return;
        }
        setPaged(res.source === null
            ? t('mdt.unitOffAir', '{name} is not on the air right now.', { name: res.name })
            : t('mdt.unitOnAir', '{name} is on the air, server ID {id}.', { name: res.name, id: res.source }));
    }, [officer.citizenid]);

    const dismiss = useCallback(async () => {
        setConfirmDismiss(false);
        setBusy(true);
        const ok = await mdtDismiss(officer.citizenid);
        setBusy(false);
        if (!ok) {
            setNotice(t('mdt.dismissFailed', 'That officer has to be online to be dismissed.'));
            return;
        }
        onDismissed?.();
    }, [officer.citizenid, onDismissed]);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 px-6 pb-4 pt-5">
                {officer.avatar
                    ? (
                        <FadeImage
                            src={officer.avatar}
                            alt={officer.name}
                            className="h-[60px] w-[60px] shrink-0 rounded-full object-cover"
                        />
                    )
                    : <InitialsAvatar name={officer.name} color={colorFor(officer.citizenid)} size={60} />}
                <div className="min-w-[200px] flex-1">
                    <h2 className="truncate text-[21px] font-bold leading-tight tracking-tight text-black dark:text-white">
                        {officer.name}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Pill tone="green">{officer.callsign || '--'}</Pill>
                        <Pill tone="blue">{officer.rank}</Pill>
                        {officer.duty && <Pill tone="orange">{t('mdt.onDuty', 'On Duty')}</Pill>}
                    </div>
                </div>
                <MdtButton
                    icon={<Radio className="h-[15px] w-[15px]" strokeWidth={2.4} />}
                    onClick={() => { void page(); }}
                >
                    {t('mdt.pageUnit', 'Page unit')}
                </MdtButton>
            </div>

            {paged && <div className={`shrink-0 px-6 pb-3 ${mdtRowMeta}`}>{paged}</div>}

            <div className={mdtRuleX} />

            <Scroller className="min-h-0 flex-1 px-6 py-4">
                <div
                    className="grid gap-x-6 gap-y-4"
                    style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${STAT_MIN}px, 1fr))` }}
                >
                    <Stat label={t('mdt.badge', 'Badge')} value={officer.badge || '--'} />
                    <Stat label={t('mdt.radio', 'Radio')} value={officer.radio || '--'} />
                    <Stat label={t('mdt.hoursOnShift', 'Hours')} value={officer.hours.toFixed(1)} />
                    <Stat label={t('mdt.reportsFiled', 'Reports')} value={String(officer.reports)} />
                    <Stat label={t('mdt.arrestsMade', 'Arrests')} value={String(officer.arrests)} />
                    <Stat label={t('mdt.citizenId', 'Citizen ID')} value={officer.citizenid} />
                </div>

                {showManagement && (
                    <>
                        <div className={`mt-6 ${mdtSectionHeader}`}>
                            {t('mdt.management', 'Management')}
                        </div>

                        {showCallsign && (
                            <div className="mt-3 flex items-end gap-3">
                                <MdtField
                                    className="min-w-0 flex-1"
                                    label={t('mdt.callsign', 'Callsign')}
                                    value={callsign}
                                    onChange={setCallsign}
                                    placeholder={t('mdt.callsignPlaceholder', 'LS-104')}
                                    maxLength={12}
                                />
                                <MdtButton
                                    variant="filled"
                                    disabled={busy || !callsign.trim() || callsign === (officer.callsign ?? '')}
                                    onClick={() => { void apply(
                                        () => mdtSetCallsign(officer.citizenid, callsign),
                                        t('mdt.callsignSaved', 'Callsign updated.'),
                                    ); }}
                                >
                                    {t('mdt.save', 'Save')}
                                </MdtButton>
                            </div>
                        )}

                        {showRadio && (
                            <div className="mt-3 flex items-end gap-3">
                                <MdtField
                                    className="min-w-0 flex-1"
                                    label={t('mdt.radioChannel', 'Radio channel')}
                                    value={radio}
                                    onChange={setRadio}
                                    placeholder={t('mdt.radioPlaceholder', '1')}
                                    maxLength={12}
                                />
                                <MdtButton
                                    variant="filled"
                                    disabled={busy || !radio.trim() || radio === (officer.radio ?? '')}
                                    onClick={() => { void apply(
                                        () => mdtSetRadio(officer.citizenid, radio),
                                        t('mdt.radioSaved', 'Radio channel updated.'),
                                    ); }}
                                >
                                    {t('mdt.save', 'Save')}
                                </MdtButton>
                            </div>
                        )}

                        {showGrade && (
                            <div className="mt-3 flex items-end gap-3">
                                <MdtField
                                    className="min-w-0 flex-1"
                                    label={t('mdt.rank', 'Rank')}
                                    value={grade}
                                    onChange={setGrade}
                                    options={gradeOptions}
                                />
                                <MdtButton
                                    variant="filled"
                                    disabled={busy || grade === String(officer.gradeLevel)}
                                    onClick={() => { void apply(
                                        () => mdtSetGrade(officer.citizenid, Number(grade)),
                                        t('mdt.rankSaved', 'Rank updated.'),
                                    ); }}
                                >
                                    {t('mdt.save', 'Save')}
                                </MdtButton>
                            </div>
                        )}

                        {showDismiss && (
                            <div className="mt-5">
                                <MdtButton
                                    variant="destructive"
                                    disabled={busy}
                                    onClick={() => setConfirmDismiss(true)}
                                >
                                    {t('mdt.dismiss', 'Dismiss from department')}
                                </MdtButton>
                            </div>
                        )}

                        {notice && <div className={`mt-3 ${mdtRowMeta}`}>{notice}</div>}
                    </>
                )}

                {can('affairs.view') && (
                    <>
                        <div className={`my-5 ${mdtRuleX}`} />
                        <div className={`mb-2 ${mdtSectionHeader}`}>{t('mdt.iaHistory', 'Internal Affairs')}</div>
                        {ia.length === 0 ? (
                            <div className={mdtRowMeta}>{t('mdt.iaClean', 'No complaints on file.')}</div>
                        ) : (
                            <div className="flex flex-col gap-1.5">
                                {ia.map(file => (
                                    <button
                                        key={file.ref}
                                        type="button"
                                        onClick={() => open('affairs', file.ref)}
                                        className={`-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-[8px] px-2 py-1.5 text-left ${mdtRowHover}`}
                                    >
                                        <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-black dark:text-white">
                                            {file.title}
                                        </span>
                                        <Pill tone={file.status === 'closed' ? 'green' : 'orange'}>
                                            {iaStatusLabel(file.status)}
                                        </Pill>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </Scroller>

            {confirmDismiss && (
                <AlertDialog
                    title={t('mdt.dismissTitle', 'Dismiss officer')}
                    message={t('mdt.dismissMessage', '{name} loses the department job immediately. Their records stay on file.', { name: officer.name })}
                    confirmLabel={t('mdt.dismissConfirm', 'Dismiss')}
                    destructive
                    onCancel={() => setConfirmDismiss(false)}
                    onConfirm={() => { void dismiss(); }}
                />
            )}
        </div>
    );
}
