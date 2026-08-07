import { useEffect, useState } from 'react';
import { Car, Search } from 'lucide-react';

import { device } from '@device';
import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Pill } from '@/ui/Pill';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';

import { PlateChip, VEHICLE_TONE, VehicleRecord, vehicleStatusLabel } from './VehicleRecord';
import { mdtVehiclesSearch } from './mdtApi';
import { useMdtSession } from './useMdtSession';
import { mdtRowHover, mdtRowMeta, mdtRowTitle } from './mdtTheme';
import type { VehicleRow } from './data';

const STACK_ROWS = device.id === 'phone';

function VehicleListRow({ vehicle, selected, onPress }: {
    vehicle:  VehicleRow;
    selected: boolean;
    onPress:  () => void;
}) {
    const model = vehicle.model || t('mdt.unknownModel', 'Unknown model');
    const owner = vehicle.ownerName || t('mdt.noOwner', 'No registered owner');

    const marks = (
        <>
            {vehicle.stolen && <Pill tone="red">{t('mdt.stolen', 'Stolen')}</Pill>}
            {vehicle.bolo && <Pill tone="orange">{t('mdt.bolo', 'BOLO')}</Pill>}
            <Pill tone={VEHICLE_TONE[vehicle.status] ?? 'green'}>{vehicleStatusLabel(vehicle.status)}</Pill>
        </>
    );

    const surface = `w-full rounded-[10px] px-3 py-2.5 text-left ${
        selected ? 'bg-ios-blue/10' : mdtRowHover
    }`;

    if (STACK_ROWS) {
        return (
            <button type="button" onClick={onPress} className={surface}>
                <span className="flex min-w-0 items-center gap-2">
                    <PlateChip plate={vehicle.plate} />
                    <span className="flex-1" />
                    <span className="flex shrink-0 items-center gap-1.5">{marks}</span>
                </span>
                <span className={`mt-1.5 block truncate ${mdtRowTitle}`}>{model}</span>
                <span className={`mt-0.5 block truncate ${mdtRowMeta}`}>{owner}</span>
            </button>
        );
    }

    return (
        <button type="button" onClick={onPress} className={`flex items-center gap-3 ${surface}`}>
            <PlateChip plate={vehicle.plate} />
            <span className="min-w-0 flex-1">
                <span className={`block truncate ${mdtRowTitle}`}>{model}</span>
                <span className={`block truncate ${mdtRowMeta}`}>{owner}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">{marks}</span>
        </button>
    );
}

export function VehiclesPane() {
    const { selected, select } = useMdtSession();

    const [query, setQuery] = useSessionState('mdt:vehicles:query', '');
    const [page, setPage]   = useSessionState('mdt:vehicles:page', 1);
    const [term, setTerm]   = useState(query.trim());

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, setPage]);

    const { data, loading, settled } = useAsyncData(() => mdtVehiclesSearch(term, page), [term, page]);
    const rows     = data?.rows ?? [];
    const total    = data?.total ?? 0;
    const pageSize = data?.pageSize ?? 25;
    const empty = (
        <EmptyState
            center
            icon={Search}
            title={loading
                ? t('mdt.loading', 'Loading')
                : term ? t('mdt.noMatches', 'No matches') : t('mdt.noVehicles', 'No vehicles on the registry')}
            subtitle={loading
                ? undefined
                : term ? t('mdt.noVehicleMatch', 'No vehicle on the registry matches that search.') : undefined}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.vehicles', 'Vehicles')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.searchVehicles', 'Plate or model')}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            footer={<Pager page={data?.page ?? page} pageSize={pageSize} total={total} onPage={setPage} />}
        >
            <div className="mdt-stagger flex flex-col gap-0.5">
                {rows.map(row => (
                    <VehicleListRow
                        key={row.plate}
                        vehicle={row}
                        selected={row.plate === selected}
                        onPress={() => select(row.plate)}
                    />
                ))}
            </div>
        </ListColumn>
    );

    return (
        <MasterDetail
            master={master}
            detail={selected ? <VehicleRecord key={selected} plate={selected} /> : undefined}
            placeholder={
                <EmptyState
                    center
                    icon={Car}
                    title={t('mdt.pickVehicleRecord', 'No vehicle selected')}
                    subtitle={t('mdt.pickVehicleRecordSub', 'Pick a vehicle from the list, or run a plate or model, to see its DMV record.')}
                />
            }
            onCloseDetail={() => select(null)}
            backLabel={t('mdt.vehicles', 'Vehicles')}
        />
    );
}
