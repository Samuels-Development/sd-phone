import { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, MoveRight, Repeat, Trophy, Users } from 'lucide-react';

import { useAsyncData } from '@/hooks/useAsyncData';
import { useClock } from '@/hooks/useClock';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { t } from '@/i18n';
import { useDeckActive } from '@/shell/deckActive';
import { EmptyState } from '@/ui/EmptyState';
import { ListColumn } from '@/ui/ListColumn';
import { MasterDetail } from '@/ui/MasterDetail';
import { Pill } from '@/ui/Pill';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { rowBody, rowHover, rowMeta, rowTitle } from '@/ui/surfaces';

import type { Race, RaceMode, Standing } from './data';
import { formatMoney, startsInLabel } from './data';
import { RaceDetail, racePool } from './RaceDetail';
import { racingRaces } from './racingApi';
import { CLASS_TONE, racingAccentSoft, racingDetailEnter, racingSegmented, STATUS_TONE } from './racingTheme';

type RaceFilter = 'all' | 'joined';

const NO_STANDINGS: Standing[] = [];

function byStartOrder(a: Race, b: Race): number {
    if (a.status !== b.status) return a.status === 'live' ? -1 : 1;
    if (a.startsAt !== b.startsAt) return a.startsAt - b.startsAt;
    return a.name.localeCompare(b.name);
}

function useDeckRefresh(fn: () => void): void {
    const active = useDeckActive();
    const wasActive = useRef(active);
    const fnRef = useRef(fn);
    fnRef.current = fn;

    useEffect(() => {
        if (active && !wasActive.current) fnRef.current();
        wasActive.current = active;
    }, [active]);
}

function ModeIcon({ mode }: { mode: RaceMode }) {
    const Glyph = mode === 'circuit' ? Repeat : MoveRight;
    return <Glyph className="h-[15px] w-[15px] shrink-0 text-ios-gray" strokeWidth={2.4} />;
}

function RaceListRow({ race, now, selected, onPress }: {
    race:     Race;
    now:      number;
    selected: boolean;
    onPress:  () => void;
}) {
    const meta = [
        race.trackName,
        t('racing.gatesShort', '{n} CP', { n: race.gates }),
        race.laps > 1 ? t('racing.lapsShort', '{n} laps', { n: race.laps }) : t('racing.lapShort', '1 lap'),
        race.entryFee > 0
            ? t('racing.buyInAmount', 'Buy-in {amount}', { amount: formatMoney(race.entryFee) })
            : t('racing.freeEntry', 'Free entry'),
    ].join(' · ');

    return (
        <button
            type="button"
            onClick={onPress}
            className={`flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left ${
                selected ? 'bg-ios-blue/10' : race.joined ? racingAccentSoft : rowHover
            }`}
        >
            <span className="flex w-full items-center gap-2">
                <ModeIcon mode={race.mode} />
                <span className={`min-w-0 flex-1 truncate ${rowTitle}`}>{race.name}</span>
                <Pill tone={CLASS_TONE[race.class]}>{race.class}</Pill>
                <Pill tone={STATUS_TONE[race.status]}>
                    {race.status === 'live'
                        ? t('racing.live', 'Live')
                        : startsInLabel(race.startsAt, now)}
                </Pill>
            </span>
            <span className="flex w-full items-center gap-2">
                <span className={`min-w-0 flex-1 truncate ${rowBody}`}>{meta}</span>
                <span className={`flex shrink-0 items-center gap-1 tabular-nums ${rowMeta}`}>
                    <Users className="h-[13px] w-[13px]" strokeWidth={2.4} />
                    {`${race.registered}/${race.maxRacers}`}
                </span>
                <span className={`flex shrink-0 items-center gap-1 tabular-nums ${rowMeta}`}>
                    <Trophy className="h-[13px] w-[13px]" strokeWidth={2.4} />
                    {formatMoney(racePool(race))}
                </span>
            </span>
        </button>
    );
}

export function RacesPane() {
    const [filter, setFilter] = useSessionState<RaceFilter>('racing:races:filter', 'all');
    const [selected, setSelected] = useSessionState<string | null>('racing:races:selected', null);

    const [races, setRaces] = useState<Race[]>([]);
    const [standings, setStandings] = useState<Record<string, Standing[]>>({});

    const { settled, refetch } = useAsyncData(racingRaces, [], { onData: setRaces });

    useNuiEvent('sd-phone:racing:racesChanged', refetch);
    useNuiEvent('sd-phone:racing:standings', patch => {
        setStandings(prev => ({ ...prev, [patch.raceId]: patch.entries }));
    });

    useDeckRefresh(refetch);

    const now = Math.floor(useClock('second').getTime() / 1000);

    const ordered = useMemo(() => [...races].sort(byStartOrder), [races]);
    const rows = useMemo(
        () => (filter === 'joined' ? ordered.filter(race => race.joined) : ordered),
        [ordered, filter],
    );
    const joinedCount = useMemo(() => races.filter(race => race.joined).length, [races]);

    const race = ordered.find(entry => entry.id === selected) ?? null;

    const empty = filter === 'joined' ? (
        <EmptyState
            icon={Flag}
            title={t('racing.noJoinedRaces', 'You are not on any grid')}
            subtitle={t('racing.noJoinedRacesSub', 'Enter a race from the board and it shows up here.')}
        />
    ) : (
        <EmptyState
            icon={Flag}
            title={t('racing.noRaces', 'Nothing on the board')}
            subtitle={t('racing.noRacesSub', 'New events are posted through the day. Check back shortly.')}
        />
    );

    const master = (
        <ListColumn
            className="flex-1"
            title={t('racing.races', 'Races')}
            count={rows.length}
        >
            <div className="px-3 pb-2">
                <SegmentedControl<RaceFilter>
                    className={racingSegmented}
                    value={filter}
                    onChange={setFilter}
                    options={[
                        { value: 'all', label: t('racing.allRaces', 'All') },
                        { value: 'joined', label: t('racing.joinedRaces', 'Joined'), badge: joinedCount },
                    ]}
                />
            </div>

            {settled && rows.length === 0 ? (
                <div className="px-4 pb-6">{empty}</div>
            ) : (
                <div className="mdt-stagger flex flex-col gap-0.5 px-1">
                    {rows.map(row => (
                        <RaceListRow
                            key={row.id}
                            race={row}
                            now={now}
                            selected={row.id === selected}
                            onPress={() => setSelected(row.id)}
                        />
                    ))}
                </div>
            )}
        </ListColumn>
    );

    return (
        <div className={`relative flex min-h-0 min-w-0 flex-1 ${racingDetailEnter}`}>
            <MasterDetail
                master={master}
                hasDetail={race !== null}
                detail={race ? (
                    <RaceDetail
                        key={race.id}
                        race={race}
                        now={now}
                        standings={standings[race.id] ?? NO_STANDINGS}
                        onRaces={setRaces}
                        onStandings={entries => setStandings(prev => ({ ...prev, [race.id]: entries }))}
                        onRefresh={refetch}
                    />
                ) : undefined}
                placeholder={
                    <EmptyState
                        center
                        icon={Flag}
                        title={t('racing.pickRace', 'No race selected')}
                        subtitle={t('racing.pickRaceSub', 'Open a race to see its track, its prize split and who is on the grid.')}
                    />
                }
                onCloseDetail={() => setSelected(null)}
            />
        </div>
    );
}
