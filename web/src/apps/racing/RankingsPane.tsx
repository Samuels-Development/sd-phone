import { useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';

import { t } from '@/i18n';
import { colorFor } from '@/lib/format';
import { InitialsAvatar } from '@/shared/ContactAvatar';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { Pager } from '@/ui/Pager';
import { Pill } from '@/ui/Pill';
import { Select } from '@/ui/Select';
import { cardSurface, panePad, rowHover, rowMeta, rowTitle, ruleX, sectionHeader } from '@/ui/surfaces';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';

import { RANKS_PER_PAGE } from './data';
import type { RankRow } from './data';
import { RacerProfile } from './RacerProfile';
import { racingRankings } from './racingApi';
import { CLASS_COLOR, RACING_ACCENT_INK, racingAccentFill, racingAccentSoft } from './racingTheme';

type RankSort = 'rank' | 'name' | 'races' | 'wins';

const MEDAL_COLORS: readonly string[] = [CLASS_COLOR.S, CLASS_COLOR.D, '#cd7f32'];
const PLINTH_HEIGHTS: readonly number[] = [88, 64, 50];
const PODIUM_ORDER: readonly number[] = [2, 1, 3];

function sortRows(rows: RankRow[], sort: RankSort): RankRow[] {
    const sorted = [...rows];
    if (sort === 'name')  sorted.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'races') sorted.sort((a, b) => b.races - a.races || a.rank - b.rank);
    if (sort === 'wins')  sorted.sort((a, b) => b.wins - a.wins || a.rank - b.rank);
    if (sort === 'rank')  sorted.sort((a, b) => a.rank - b.rank);
    return sorted;
}

function PodiumStand({ row, onPress }: { row: RankRow; onPress: () => void }) {
    const place  = Math.min(3, Math.max(1, row.rank));
    const medal  = MEDAL_COLORS[place - 1];
    const height = PLINTH_HEIGHTS[place - 1];
    const first  = place === 1;

    return (
        <button
            type="button"
            onClick={onPress}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 transition-opacity duration-150 hover:opacity-90 active:opacity-70"
        >
            <span className="inline-flex rounded-full p-[3px]" style={{ background: medal }}>
                <InitialsAvatar name={row.name} color={colorFor(row.citizenid)} size={first ? 60 : 48} />
            </span>

            <span className="min-w-0 max-w-full truncate px-1 text-center text-[14.5px] font-semibold leading-tight text-black dark:text-white">
                {row.name}
            </span>
            <span className={`min-w-0 max-w-full truncate ${rowMeta}`}>
                {t('racing.mmrValue', '{mmr} MMR', { mmr: row.mmr })}
            </span>

            <span
                className={`mt-1 flex w-full items-start justify-center rounded-t-[12px] pt-2 ${
                    first ? racingAccentFill : 'bg-black/[0.07] dark:bg-white/[0.10]'
                }`}
                style={{ height }}
            >
                <span
                    className="text-[24px] font-bold tabular-nums text-black dark:text-white"
                    style={first ? { color: RACING_ACCENT_INK } : undefined}
                >
                    {place}
                </span>
            </span>
        </button>
    );
}

function RankListRow({ row, onPress }: { row: RankRow; onPress: () => void }) {
    const medal = row.rank <= 3 ? MEDAL_COLORS[row.rank - 1] : undefined;

    return (
        <button
            type="button"
            onClick={onPress}
            className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left ${
                row.you ? racingAccentSoft : rowHover
            }`}
        >
            <span
                className={`w-10 shrink-0 text-right text-[15px] font-bold tabular-nums ${medal ? '' : 'text-ios-gray'}`}
                style={medal ? { color: medal } : undefined}
            >
                {row.rank}
            </span>

            <InitialsAvatar name={row.name} color={colorFor(row.citizenid)} size={34} />

            <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`min-w-0 truncate ${rowTitle}`}>{row.name}</span>
                    {row.you && <Pill tone="blue">{t('racing.you', 'You')}</Pill>}
                </span>
                <span className={`block truncate ${rowMeta}`}>{row.citizenid}</span>
            </span>

            <span className="w-16 shrink-0 text-right text-[14px] font-medium tabular-nums text-ios-gray">
                {row.races}
            </span>
            <span className="w-16 shrink-0 text-right text-[14px] font-medium tabular-nums text-ios-gray">
                {row.wins}
            </span>
            <span className="w-20 shrink-0 text-right text-[15px] font-bold tabular-nums text-black dark:text-white">
                {row.mmr}
            </span>
        </button>
    );
}

export function RankingsPane() {
    const [page, setPage]   = useSessionState('racing:rankings:page', 1);
    const [open, setOpen]   = useSessionState<string | null>('racing:rankings:open', null);
    const [query, setQuery] = useSessionState('racing:rankings:query', '');
    const [sort, setSort]   = useSessionState<RankSort>('racing:rankings:sort', 'rank');
    const [term, setTerm]   = useState(query.trim().toLowerCase());

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim().toLowerCase()), 200);
        return () => window.clearTimeout(id);
    }, [query]);

    const { data, loading, settled } = useAsyncData(() => racingRankings(page), [page]);
    const rows  = useMemo(() => data?.rows ?? [], [data]);
    const total = data?.total ?? 0;
    const me    = data?.me ?? null;

    const shown = useMemo(() => {
        const matched = term ? rows.filter(row => row.name.toLowerCase().includes(term)) : rows;
        return sortRows(matched, sort);
    }, [rows, term, sort]);

    const podium = !term && page === 1
        ? rows.filter(row => row.rank <= 3).sort((a, b) => a.rank - b.rank)
        : [];
    const stands = PODIUM_ORDER
        .map(place => podium.find(row => row.rank === place))
        .filter((row): row is RankRow => row !== undefined);

    const pinned = me && !shown.some(row => row.citizenid === me.citizenid) ? me : null;

    const sortOptions: { value: RankSort; label: string }[] = [
        { value: 'rank',  label: t('racing.sortByRank', 'Rank') },
        { value: 'name',  label: t('racing.sortByName', 'Name') },
        { value: 'races', label: t('racing.sortByRaces', 'Races') },
        { value: 'wins',  label: t('racing.sortByWins', 'Wins') },
    ];

    const empty = (
        <EmptyState
            center
            icon={Trophy}
            title={loading
                ? t('racing.loading', 'Loading')
                : term ? t('racing.noRacerMatches', 'No matches') : t('racing.noRankedRacers', 'No ranked racers yet')}
            subtitle={loading
                ? undefined
                : term
                    ? t('racing.noRacerMatchesSub', 'Nobody on this page matches that search.')
                    : t('racing.noRankedRacersSub', 'Finish a ranked race and the leaderboard starts filling up.')}
        />
    );

    return (
        <div className={`flex min-h-0 flex-1 flex-col ${panePad}`}>
            <div className={`${cardSurface} flex min-h-0 flex-1 flex-col overflow-hidden`}>
                <ListColumn
                    className="flex-1"
                    title={t('racing.rankings', 'Rankings')}
                    count={total}
                    query={query}
                    onQuery={setQuery}
                    placeholder={t('racing.searchRacers', 'Racer name')}
                    action={(
                        <Select
                            size="sm"
                            className="w-[124px]"
                            value={sort}
                            onChange={setSort}
                            options={sortOptions}
                            ariaLabel={t('racing.sortRankings', 'Sort rankings')}
                        />
                    )}
                    isEmpty={settled && shown.length === 0}
                    empty={empty}
                    footer={(
                        <div className="shrink-0">
                            {pinned && (
                                <>
                                    <div className={ruleX} />
                                    <div className="px-2 py-1.5">
                                        <RankListRow row={pinned} onPress={() => setOpen(pinned.citizenid)} />
                                    </div>
                                </>
                            )}
                            <Pager page={page} pageSize={RANKS_PER_PAGE} total={total} onPage={setPage} />
                        </div>
                    )}
                >
                    {stands.length > 0 && (
                        <>
                            <div className="flex items-end gap-3 px-5 pb-3 pt-2">
                                {stands.map(row => (
                                    <PodiumStand key={row.citizenid} row={row} onPress={() => setOpen(row.citizenid)} />
                                ))}
                            </div>
                            <div className={`${ruleX} mb-1`} />
                        </>
                    )}

                    <div className="px-2">
                        <div className={`flex items-center gap-3 px-3 pb-1 pt-1 ${sectionHeader}`}>
                            <span className="w-10 shrink-0 text-right">{t('racing.rank', 'Rank')}</span>
                            <span className="w-[34px] shrink-0" />
                            <span className="min-w-0 flex-1">{t('racing.racer', 'Racer')}</span>
                            <span className="w-16 shrink-0 text-right">{t('racing.races', 'Races')}</span>
                            <span className="w-16 shrink-0 text-right">{t('racing.wins', 'Wins')}</span>
                            <span className="w-20 shrink-0 text-right">{t('racing.mmr', 'MMR')}</span>
                        </div>

                        <div className="flex flex-col gap-0.5">
                            {shown.map(row => (
                                <RankListRow key={row.citizenid} row={row} onPress={() => setOpen(row.citizenid)} />
                            ))}
                        </div>
                    </div>
                </ListColumn>
            </div>

            {open && <RacerProfile key={open} citizenid={open} onClose={() => setOpen(null)} />}
        </div>
    );
}
