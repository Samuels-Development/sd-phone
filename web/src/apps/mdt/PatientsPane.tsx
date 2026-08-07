import { useEffect, useState } from 'react';
import { HeartPulse, Search } from 'lucide-react';

import { t } from '@/i18n';
import { colorFor } from '@/lib/format';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Pill } from '@/ui/Pill';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';

import { PatientRecord } from './PatientRecord';
import { mdtPatientsSearch } from './mdtApi';
import { useMdtSession } from './useMdtSession';
import { mdtRowHover, mdtRowMeta, mdtRowTitle } from './mdtTheme';
import type { PatientRow } from './data';

function PatientListRow({ patient, selected, onPress }: {
    patient:  PatientRow;
    selected: boolean;
    onPress:  () => void;
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left ${
                selected ? 'bg-ios-blue/10' : mdtRowHover
            }`}
        >
            <InitialsAvatar name={patient.name} color={colorFor(patient.citizenid)} size={38} />
            <span className="min-w-0 flex-1">
                <span className={`block truncate ${mdtRowTitle}`}>{patient.name}</span>
                <span className={`block truncate ${mdtRowMeta}`}>
                    {[patient.dob, patient.citizenid].filter(Boolean).join('  ·  ')}
                </span>
            </span>
            {patient.dnr && <Pill tone="red">{t('mdt.dnr', 'DNR')}</Pill>}
            {patient.hasAllergy && <Pill tone="orange">{t('mdt.allergy', 'Allergy')}</Pill>}
            {patient.bloodType !== '' && <Pill tone="blue">{patient.bloodType}</Pill>}
        </button>
    );
}

export function PatientsPane() {
    const { selected, select } = useMdtSession();

    const [query, setQuery] = useSessionState('mdt:patients:query', '');
    const [page, setPage]   = useSessionState('mdt:patients:page', 1);
    const [term, setTerm]   = useState(query.trim());

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, setPage]);

    const { data, loading, settled } = useAsyncData(() => mdtPatientsSearch(term, page), [term, page]);
    const rows     = data?.rows ?? [];
    const total    = data?.total ?? 0;
    const pageSize = data?.pageSize ?? 25;
    const empty = (
        <EmptyState
            center
            icon={Search}
            title={loading
                ? t('mdt.loading', 'Loading')
                : term ? t('mdt.noMatches', 'No matches') : t('mdt.noPatients', 'No patients on record')}
            subtitle={loading
                ? undefined
                : term ? t('mdt.noPatientMatch', 'Nobody on record matches that search.') : undefined}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.patients', 'Patients')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.searchPatients', 'Name, citizen ID or phone')}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            footer={<Pager page={data?.page ?? page} pageSize={pageSize} total={total} onPage={setPage} />}
        >
            <div className="mdt-stagger flex flex-col gap-0.5">
                {rows.map(row => (
                    <PatientListRow
                        key={row.citizenid}
                        patient={row}
                        selected={row.citizenid === selected}
                        onPress={() => select(row.citizenid)}
                    />
                ))}
            </div>
        </ListColumn>
    );

    return (
        <MasterDetail
            master={master}
            detail={selected ? <PatientRecord key={selected} citizenid={selected} /> : undefined}
            placeholder={
                <EmptyState
                    center
                    icon={HeartPulse}
                    title={t('mdt.pickPatientRecord', 'No patient selected')}
                    subtitle={t('mdt.pickPatientRecordSub', 'Pick a patient from the list, or search by name, citizen ID or phone, to see their medical file and the incidents they appear on.')}
                />
            }
            onCloseDetail={() => select(null)}
        />
    );
}
