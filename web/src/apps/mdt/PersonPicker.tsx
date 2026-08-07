import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';

import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { useMenuRoot } from '@/ui/menuRoot';
import { Pager } from '@/ui/Pager';
import { Scroller } from '@/ui/Scroller';
import { SearchBar } from '@/ui/SearchBar';
import { useAsyncData } from '@/hooks/useAsyncData';

import { CitizenRow } from './ProfilesPane';
import { mdtPersonsSearch } from './mdtApi';
import { MdtButton } from './ui/MdtButton';
import { MdtCard } from './ui/MdtCard';

export interface PickedPerson {
    citizenid: string;
    name:      string;
}

export function PersonPicker({ title, onPick, onClose }: {
    title?:  string;
    onPick:  (person: PickedPerson) => void;
    onClose: () => void;
}) {
    const [query, setQuery] = useState('');
    const [page, setPage]   = useState(1);
    const [term, setTerm]   = useState('');

    useEffect(() => {
        const id = window.setTimeout(() => { setTerm(query.trim()); setPage(1); }, 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        }
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    const { data, loading, settled } = useAsyncData(() => mdtPersonsSearch(term, page), [term, page]);
    const rows     = data?.rows ?? [];
    const total    = data?.total ?? 0;
    const pageSize = data?.pageSize ?? 25;
    const root = useMenuRoot();

    const overlay = (
        <div
            className="absolute inset-0 z-30 flex items-center justify-center px-6"
            style={{ background: 'rgba(0,0,0,0.32)', animation: 'ios-sheet-backdrop-in 0.2s ease-out' }}
            onClick={onClose}
        >
            <div className="w-full max-w-[440px]" onClick={e => e.stopPropagation()}>
                <MdtCard className="flex flex-col overflow-hidden">
                    <div className="flex items-center gap-3 px-4 pb-3 pt-4">
                        <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-black dark:text-white">
                            {title ?? t('mdt.pickCitizen', 'Pick a citizen')}
                        </span>
                        <MdtButton size="sm" onClick={onClose}>{t('common.cancel', 'Cancel')}</MdtButton>
                    </div>

                    <div className="px-4 pb-3">
                        <SearchBar
                            autoFocus
                            value={query}
                            onChange={setQuery}
                            placeholder={t('mdt.searchCitizens', 'Name, citizen ID or phone')}
                        />
                    </div>

                    <Scroller className="h-[320px] px-2 pb-2">
                        {settled && rows.length === 0 ? (
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
                        ) : (
                            <div className="mdt-stagger flex flex-col gap-0.5">
                                {rows.map(row => (
                                    <CitizenRow
                                        key={row.citizenid}
                                        person={row}
                                        selected={false}
                                        onPress={() => onPick({ citizenid: row.citizenid, name: row.name })}
                                    />
                                ))}
                            </div>
                        )}
                    </Scroller>

                    <Pager page={data?.page ?? page} pageSize={pageSize} total={total} onPage={setPage} />
                </MdtCard>
            </div>
        </div>
    );

    return root ? createPortal(overlay, root) : overlay;
}
