import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, MapPin, Route, Search, Star } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pager } from '@/ui/Pager';
import { Select, type SelectOption } from '@/ui/Select';
import { Toggle } from '@/ui/Toggle';
import { rowHover, rowMeta, rowTitle } from '@/ui/surfaces';

import { TrackDetail, modeLabel } from './TrackDetail';
import { racingTracks, racingWaypoint } from './racingApi';
import { RACING_ACCENT, racingAccentText } from './racingTheme';
import { TRACKS_PER_PAGE, type TrackRow, type TrackSort } from './data';

const MASTER_WIDTH = 408;

function sortOptions(): SelectOption<TrackSort>[] {
    return [
        { value: 'newest', label: t('racing.sortNewest', 'Newest first') },
        { value: 'name',   label: t('racing.sortName', 'Name A to Z') },
        { value: 'plays',  label: t('racing.sortPlays', 'Most played') },
        { value: 'gates',  label: t('racing.sortGates', 'Most checkpoints') },
    ];
}

function TrackListRow({ track, selected, onPress, onWaypoint }: {
    track:      TrackRow;
    selected:   boolean;
    onPress:    () => void;
    onWaypoint: () => void;
}) {
    const meta = [
        modeLabel(track.mode),
        t('racing.checkpointCount', '{n} CP', { n: track.gates }),
        t('racing.playCount', '{n} plays', { n: track.plays }),
        track.author,
    ].filter(Boolean).join('  ·  ');

    return (
        <div className={`flex w-full items-center rounded-[10px] ${selected ? 'bg-ios-blue/10' : rowHover}`}>
            <button
                type="button"
                onClick={onPress}
                className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left"
            >
                <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                        <span className={`min-w-0 truncate ${rowTitle}`}>{track.name}</span>
                        {track.verified && (
                            <BadgeCheck
                                className={`h-[15px] w-[15px] shrink-0 ${racingAccentText}`}
                                strokeWidth={2.4}
                                aria-label={t('racing.verified', 'Verified')}
                            />
                        )}
                        {track.featured && (
                            <Star
                                className="h-[13px] w-[13px] shrink-0 fill-ios-orange text-ios-orange"
                                strokeWidth={2.2}
                                aria-label={t('racing.featured', 'Featured')}
                            />
                        )}
                    </span>
                    <span className={`mt-0.5 block truncate ${rowMeta}`}>{meta}</span>
                </span>
            </button>
            <button
                type="button"
                disabled={!track.coords}
                onClick={onWaypoint}
                aria-label={t('racing.setWaypoint', 'Set waypoint')}
                className="mr-1.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-ios-gray transition-colors duration-150 hover:bg-black/[0.06] hover:text-black active:opacity-60 disabled:cursor-default disabled:opacity-30 dark:hover:bg-white/[0.10] dark:hover:text-white"
            >
                <MapPin className="h-[15px] w-[15px]" strokeWidth={2.2} />
            </button>
        </div>
    );
}

export function TracksPane() {
    const [query, setQuery]       = useSessionState('racing:tracks:query', '');
    const [sort, setSort]         = useSessionState<TrackSort>('racing:tracks:sort', 'newest');
    const [verified, setVerified] = useSessionState('racing:tracks:verified', false);
    const [page, setPage]         = useSessionState('racing:tracks:page', 1);
    const [selected, setSelected] = useSessionState<number | null>('racing:tracks:selected', null);
    const [term, setTerm]         = useState(query.trim());

    useEffect(() => {
        const id = window.setTimeout(() => setTerm(query.trim()), 250);
        return () => window.clearTimeout(id);
    }, [query]);

    useEffect(() => { setPage(1); }, [term, sort, verified, setPage]);

    const { data, loading, settled } = useAsyncData(
        () => racingTracks({ query: term, sort, verifiedOnly: verified, page }),
        [term, sort, verified, page],
    );

    const rows  = data?.rows ?? [];
    const total = data?.total ?? 0;

    const options = useMemo(sortOptions, []);

    const empty = (
        <EmptyState
            center
            icon={loading ? Route : Search}
            title={loading
                ? t('racing.loading', 'Loading')
                : term
                    ? t('racing.noTrackMatches', 'No matches')
                    : verified
                        ? t('racing.noVerifiedTracks', 'No verified tracks yet')
                        : t('racing.noTracks', 'No tracks recorded yet')}
            subtitle={loading
                ? undefined
                : term
                    ? t('racing.noTrackMatchesSub', 'No track on the board matches that search.')
                    : verified
                        ? t('racing.noVerifiedTracksSub', 'Turn the verified filter off to see tracks that are still waiting on review.')
                        : t('racing.noTracksSub', 'Tracks are recorded in the world with the gate creator, then published here.')}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('racing.tracks', 'Tracks')}
            count={total}
            query={query}
            onQuery={setQuery}
            placeholder={t('racing.searchTracks', 'Track or author')}
            isEmpty={settled && rows.length === 0}
            empty={empty}
            action={
                <div className="flex shrink-0 items-center gap-2">
                    <Select
                        size="xs"
                        value={sort}
                        onChange={setSort}
                        options={options}
                        className="w-[136px]"
                        ariaLabel={t('racing.sortTracks', 'Sort tracks')}
                    />
                    <div className="flex shrink-0 items-center gap-1.5">
                        <span className={rowMeta}>{t('racing.verifiedOnly', 'Verified')}</span>
                        <Toggle
                            on={verified}
                            onChange={setVerified}
                            scale={0.6}
                            activeColor={RACING_ACCENT}
                            ariaLabel={t('racing.verifiedOnlyFilter', 'Show verified tracks only')}
                        />
                    </div>
                </div>
            }
            footer={<Pager page={page} pageSize={TRACKS_PER_PAGE} total={total} onPage={setPage} />}
        >
            <div className="flex flex-col gap-0.5">
                {rows.map(row => (
                    <TrackListRow
                        key={row.id}
                        track={row}
                        selected={row.id === selected}
                        onPress={() => setSelected(row.id)}
                        onWaypoint={() => { if (row.coords) void racingWaypoint(row.coords.x, row.coords.y); }}
                    />
                ))}
            </div>
        </ListColumn>
    );

    return (
        <MasterDetail
            master={master}
            masterWidth={MASTER_WIDTH}
            hasDetail={selected !== null}
            detail={selected !== null ? <TrackDetail key={selected} trackId={selected} /> : undefined}
            placeholder={
                <EmptyState
                    center
                    icon={Route}
                    title={t('racing.pickTrack', 'No track selected')}
                    subtitle={t('racing.pickTrackSub', 'Pick a track to see its record board, its route on the map, and to open a race on it.')}
                />
            }
            onCloseDetail={() => setSelected(null)}
        />
    );
}
