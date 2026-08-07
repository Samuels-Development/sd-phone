import { useEffect, useState } from 'react';
import { IdCard, Search } from 'lucide-react';

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

import { PersonRecord } from './PersonRecord';
import { mdtPersonsSearch } from './mdtApi';
import { useMdtSession } from './useMdtSession';
import { mdtRowHover, mdtRowMeta, mdtRowTitle } from './mdtTheme';
import type { PersonRow } from './data';

export function CitizenRow({ person, selected, onPress }: {
    person:   PersonRow;
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
            <InitialsAvatar name={person.name} color={colorFor(person.citizenid)} size={38} />
            <span className="min-w-0 flex-1">
                <span className={`block truncate ${mdtRowTitle}`}>{person.name}</span>
                <span className={`block truncate ${mdtRowMeta}`}>
                    {[person.dob, person.citizenid].filter(Boolean).join('  ·  ')}
                </span>
            </span>
            {person.wanted && <Pill tone="red">{t('mdt.wanted', 'Wanted')}</Pill>}
        </button>
    );
}

export function ProfilesPane() {
    const { selected, select } = useMdtSession();

    const [query, setQuery] = useSessionState('mdt:profiles:query', '');
    const [page, setPage]   = useSessionState('mdt:profiles:page', 1);
    const [term, setTerm]   = useState(query.trim());

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, setPage]);

    const { data, loading, settled } = useAsyncData(() => mdtPersonsSearch(term, page), [term, page]);
    const rows     = data?.rows ?? [];
    const total    = data?.total ?? 0;
    const pageSize = data?.pageSize ?? 25;

    const empty = (
        <EmptyState
            center
            icon={Search}
            title={loading
                ? t('mdt.loading', 'Loading')
                : term ? t('mdt.noMatches', 'No matches') : t('mdt.noCitizens', 'No citizens on record')}
            subtitle={loading
                ? undefined
                : term ? t('mdt.noCitizenMatch', 'Nobody on record matches that search.') : undefined}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('mdt.citizens', 'Citizens')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('mdt.searchCitizens', 'Name, citizen ID or phone')}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            footer={<Pager page={data?.page ?? page} pageSize={pageSize} total={total} onPage={setPage} />}
        >
            <div className="mdt-stagger flex flex-col gap-0.5">
                {rows.map(row => (
                    <CitizenRow
                        key={row.citizenid}
                        person={row}
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
            detail={selected ? <PersonRecord key={selected} citizenid={selected} /> : undefined}
            placeholder={
                <EmptyState
                    center
                    icon={IdCard}
                    title={t('mdt.pickCitizenRecord', 'No record selected')}
                    subtitle={t('mdt.pickCitizenRecordSub', 'Pick a citizen from the list, or search by name, citizen ID or phone, to see identity, flags, vehicles and priors.')}
                />
            }
            onCloseDetail={() => select(null)}
        />
    );
}
