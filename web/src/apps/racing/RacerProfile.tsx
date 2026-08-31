import { ArrowRight, Repeat, UserRound } from 'lucide-react';

import { t } from '@/i18n';
import { colorFor, initialsFor } from '@/lib/format';
import { formatDuration, relTimeCompact } from '@/lib/time';
import { ContactAvatar } from '@/shared/ContactAvatar';
import { EmptyState } from '@/ui/EmptyState';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { Sheet } from '@/ui/Sheet';
import { cardSurface, rowMeta, rowTitle, ruleX, sectionHeader } from '@/ui/surfaces';
import { useAsyncData } from '@/hooks/useAsyncData';

import { formatMmrDelta } from './data';
import type { PastRace, RacerProfile as RacerProfileData } from './data';
import { racingRacer } from './racingApi';
import { RACING_ACCENT, racingAccentBar, racingStat, racingStatLabel } from './racingTheme';

const CHART_W = 320;
const CHART_H = 132;
const CHART_PAD_LEFT = 42;
const CHART_PAD_RIGHT = 10;
const CHART_PAD_TOP = 10;
const CHART_PAD_BOTTOM = 16;
const CHART_TICKS = 4;

const GAIN_TEXT = 'text-[#15803d] dark:text-ios-green';
const LOSS_TEXT = 'text-[#c1121f] dark:text-ios-red';

function niceStep(span: number, ticks: number): number {
    const raw = Math.max(1, span) / Math.max(1, ticks);
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const normalized = raw / magnitude;
    const stepped = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return Math.max(1, stepped * magnitude);
}

function axisTicks(series: number[]): { lo: number; hi: number; values: number[] } {
    const min  = Math.min(...series);
    const max  = Math.max(...series);
    const step = niceStep(max - min, CHART_TICKS);
    const lo   = Math.floor(min / step) * step;
    const hi   = Math.max(lo + step, Math.ceil(max / step) * step);
    const values: number[] = [];
    for (let value = lo; value <= hi + step / 2; value += step) values.push(Math.round(value));
    return { lo, hi, values };
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex min-w-0 flex-col gap-0.5">
            <span className={`truncate ${racingStat}`}>{value}</span>
            <span className={`truncate ${racingStatLabel}`}>{label}</span>
        </div>
    );
}

function MmrChart({ series }: { series: number[] }) {
    if (series.length < 2) {
        return (
            <div className={`${rowMeta} px-1 py-6 text-center`}>
                {t('racing.noMmrHistory', 'Two ranked races or more and the MMR line shows up here.')}
            </div>
        );
    }

    const { lo, hi, values } = axisTicks(series);
    const plotW = CHART_W - CHART_PAD_LEFT - CHART_PAD_RIGHT;
    const plotH = CHART_H - CHART_PAD_TOP - CHART_PAD_BOTTOM;

    const x = (index: number) => CHART_PAD_LEFT + (index / (series.length - 1)) * plotW;
    const y = (value: number) => CHART_PAD_TOP + (1 - (value - lo) / (hi - lo)) * plotH;

    const line = series.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    const area = `${CHART_PAD_LEFT},${CHART_PAD_TOP + plotH} ${line} ${(CHART_PAD_LEFT + plotW).toFixed(1)},${CHART_PAD_TOP + plotH}`;
    const last = series[series.length - 1];

    return (
        <div>
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full text-black dark:text-white">
                <defs>
                    <linearGradient id="racing-mmr-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={RACING_ACCENT} stopOpacity="0.26" />
                        <stop offset="100%" stopColor={RACING_ACCENT} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {values.map(value => (
                    <g key={value}>
                        <line
                            x1={CHART_PAD_LEFT}
                            y1={y(value)}
                            x2={CHART_PAD_LEFT + plotW}
                            y2={y(value)}
                            stroke="currentColor"
                            strokeOpacity="0.12"
                            strokeWidth="1"
                        />
                        <text
                            x={CHART_PAD_LEFT - 7}
                            y={y(value) + 3}
                            textAnchor="end"
                            fontSize="9"
                            fontWeight="600"
                            fill="currentColor"
                            fillOpacity="0.45"
                        >
                            {value}
                        </text>
                    </g>
                ))}

                <polygon points={area} fill="url(#racing-mmr-fill)" />
                <polyline
                    points={line}
                    fill="none"
                    stroke={RACING_ACCENT}
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <circle cx={x(series.length - 1)} cy={y(last)} r="3.4" fill={RACING_ACCENT} />
            </svg>

            <div className="mt-1 flex items-center gap-2 px-1">
                <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${racingAccentBar}`} />
                <span className={rowMeta}>{t('racing.mmrProgressLegend', 'MMR after each ranked race')}</span>
                <span className="flex-1" />
                <span className={rowMeta}>{t('racing.chartLatest', 'Latest')}</span>
            </div>
        </div>
    );
}

function PastRaceRow({ race }: { race: PastRace }) {
    const ModeIcon = race.mode === 'circuit' ? Repeat : ArrowRight;
    const meta = [race.vehicle, relTimeCompact(race.at * 1000)].filter(Boolean).join('  ·  ');

    return (
        <div className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-black/[0.06] dark:bg-white/[0.09]">
                <ModeIcon className="h-[15px] w-[15px] text-ios-gray" strokeWidth={2.4} />
            </span>

            <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span className={`min-w-0 truncate ${rowTitle}`}>{race.trackName}</span>
                    {race.ranked && <Pill tone="blue">{t('racing.ranked', 'Ranked')}</Pill>}
                </span>
                <span className={`block truncate ${rowMeta}`}>{meta}</span>
            </span>

            <span className="flex w-[72px] shrink-0 justify-end">
                {race.dnf
                    ? <Pill tone="red">{t('racing.dnf', 'DNF')}</Pill>
                    : race.position !== null && (
                        <Pill tone={race.position <= 3 ? 'green' : 'orange'}>
                            {t('racing.positionShort', 'P{pos}', { pos: race.position })}
                        </Pill>
                    )}
            </span>

            <span
                className={`w-14 shrink-0 text-right text-[14.5px] font-bold tabular-nums ${
                    race.delta === null ? 'text-ios-gray' : race.delta >= 0 ? GAIN_TEXT : LOSS_TEXT
                }`}
            >
                {race.delta === null ? '' : formatMmrDelta(race.delta)}
            </span>
        </div>
    );
}

function ProfileBody({ profile }: { profile: RacerProfileData }) {
    const displayName = profile.alias?.trim() || profile.name;
    const rankLabel = profile.rank === null
        ? t('racing.unranked', 'Unranked')
        : t('racing.rankValue', 'Rank #{rank}', { rank: profile.rank });

    return (
        <div className="flex flex-col gap-4 px-5 pb-8 pt-2">
            <div className="flex items-center gap-4">
                <ContactAvatar
                    size={72}
                    contact={{
                        name:     displayName,
                        initials: initialsFor(displayName),
                        color:    colorFor(profile.citizenid),
                        avatar:   profile.avatar ?? undefined,
                    }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="min-w-0 truncate text-[22px] font-bold leading-tight tracking-tight text-black dark:text-white">
                        {displayName}
                    </span>
                    <span className={`min-w-0 truncate ${rowMeta}`}>{profile.name}</span>
                    <span className="flex items-center gap-1.5">
                        <Pill tone="blue">{t('racing.mmrValue', '{mmr} MMR', { mmr: profile.mmr })}</Pill>
                        <Pill tone={profile.rank === null ? 'orange' : 'green'}>{rankLabel}</Pill>
                    </span>
                </div>
            </div>

            <div className={`${cardSurface} grid grid-cols-3 gap-x-4 gap-y-5 px-5 py-4`}>
                <Stat label={t('racing.racesCompleted', 'Races')} value={String(profile.racesCompleted)} />
                <Stat label={t('racing.wins', 'Wins')} value={String(profile.racesWon)} />
                <Stat label={t('racing.dnfs', 'DNFs')} value={String(profile.racesDnf)} />
                <Stat
                    label={t('racing.avgPosition', 'Avg finish')}
                    value={profile.avgPosition > 0 ? profile.avgPosition.toFixed(1) : t('racing.none', 'None')}
                />
                <Stat
                    label={t('racing.timeRaced', 'Time raced')}
                    value={formatDuration(profile.totalTimeSec, { withHours: true })}
                />
                <Stat
                    label={t('racing.topVehicle', 'Top vehicle')}
                    value={profile.mostUsedVehicle || t('racing.none', 'None')}
                />
            </div>

            <div className={`${cardSurface} px-4 pb-3 pt-3.5`}>
                <div className={`px-1 pb-2 ${sectionHeader}`}>{t('racing.mmrProgress', 'MMR progress')}</div>
                <MmrChart series={profile.chart} />
            </div>

            <div className={`${cardSurface} overflow-hidden pb-1 pt-3.5`}>
                <div className={`px-5 pb-2 ${sectionHeader}`}>{t('racing.pastRaces', 'Past races')}</div>
                <div className={ruleX} />
                {profile.pastRaces.length === 0 ? (
                    <div className={`${rowMeta} px-5 py-6 text-center`}>
                        {t('racing.noPastRaces', 'No finished races yet.')}
                    </div>
                ) : (
                    <div className="divide-y divide-black/[0.08] px-2 dark:divide-white/[0.08]">
                        {profile.pastRaces.map((race, index) => (
                            <PastRaceRow key={`${race.at}-${index}`} race={race} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function RacerProfile({ citizenid, onClose }: { citizenid: string; onClose: () => void }) {
    const { data, loading } = useAsyncData(() => racingRacer(citizenid), [citizenid]);

    const title = data
        ? (data.alias?.trim() || data.name)
        : t('racing.driverProfile', 'Driver profile');

    return (
        <Sheet
            onClose={onClose}
            fit="full"
            top={44}
            title={title}
            className="bg-base font-sf text-black dark:text-white"
        >
            {() => (
                <Scroller className="min-h-0 flex-1">
                    {data ? (
                        <ProfileBody profile={data} />
                    ) : loading ? (
                        <div className="flex h-full items-center justify-center">
                            <span
                                className="h-[64px] w-[64px] animate-pulse rounded-[18px] opacity-25"
                                style={{ background: RACING_ACCENT }}
                            />
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center px-6 py-12">
                            <EmptyState
                                center
                                icon={UserRound}
                                title={t('racing.profileUnavailable', 'Driver not found')}
                                subtitle={t('racing.profileUnavailableSub', 'That racer has no racing profile yet.')}
                            />
                        </div>
                    )}
                </Scroller>
            )}
        </Sheet>
    );
}
