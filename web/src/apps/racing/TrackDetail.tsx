import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Flag, Map as MapIcon, MapPin, Timer, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { getLocaleTag, t } from '@/i18n';
import { relTimeCompact } from '@/lib/time';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { EmptyState } from '@/ui/EmptyState';
import { Pill, type PillTone } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { cardSurface, panePad, rowMeta, ruleX, sectionHeader } from '@/ui/surfaces';

import { RaceSetup } from './RaceSetup';
import { TrackMap } from './TrackMap';
import { racingTrack, racingWaypoint } from './racingApi';
import { useRacingSession } from './useRacingSession';
import {
    CLASS_TONE, RACING_ACCENT, racingAccentBar, racingAccentText, racingDetailEnter,
    racingStat, racingStatLabel,
} from './racingTheme';
import { formatLapTime, type RaceMode, type TrackDetail as TrackDetailData, type TrackRecord } from './data';

type TrackView = 'detail' | 'map' | 'setup';

const NARROW_DETAIL = 600;
const STAT_MIN      = 132;

const MODE_TONE: Record<RaceMode, PillTone> = {
    circuit: 'blue',
    sprint:  'orange',
};

export function modeLabel(mode: RaceMode): string {
    return mode === 'sprint' ? t('racing.sprint', 'Sprint') : t('racing.circuit', 'Circuit');
}

function totalTimeLabel(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const mins  = Math.floor((total % 3600) / 60);
    if (hours > 0) return t('racing.hoursMinutes', '{h}h {m}m', { h: hours, m: mins });
    return t('racing.minutesShort', '{m}m', { m: mins });
}

function weekdayLabels(): string[] {
    const fmt = new Intl.DateTimeFormat(getLocaleTag(), { weekday: 'short' });
    const today = new Date();
    const out: string[] = [];
    for (let back = 6; back >= 0; back--) {
        const day = new Date(today);
        day.setDate(today.getDate() - back);
        out.push(fmt.format(day));
    }
    return out;
}

function DetailAction({ icon: Icon, label, onPress, disabled }: {
    icon:      LucideIcon;
    label:     string;
    onPress:   () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onPress}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-black/[0.06] px-3.5 py-[7px] text-[14px] font-semibold text-black transition-opacity duration-150 hover:opacity-85 active:opacity-60 disabled:cursor-default disabled:opacity-40 dark:bg-white/[0.10] dark:text-white"
        >
            <Icon className="h-[15px] w-[15px]" strokeWidth={2.3} />
            {label}
        </button>
    );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="min-w-0">
            <div className={`truncate ${racingStat} ${accent ? racingAccentText : ''}`}>{value}</div>
            <div className={`mt-0.5 truncate ${racingStatLabel}`}>{label}</div>
        </div>
    );
}

function Section({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 px-1">
                <Icon className="h-[15px] w-[15px] shrink-0 text-ios-gray" strokeWidth={2.2} />
                <span className={`flex-1 ${sectionHeader}`}>{title}</span>
            </div>
            <div className={`${cardSurface} overflow-hidden`}>{children}</div>
        </div>
    );
}

function PlaysChart({ chart }: { chart: number[] }) {
    const values = Array.from({ length: 7 }, (_, i) => Math.max(0, Math.round(chart[i] ?? 0)));
    const peak   = Math.max(1, ...values);
    const labels = weekdayLabels();
    const slot   = 100 / 7;
    const inset  = 1.7;

    return (
        <div className="px-4 py-3.5">
            <div className="grid grid-cols-7 gap-0">
                {values.map((value, index) => (
                    <span key={labels[index]} className="text-center text-[12px] font-semibold tabular-nums text-ios-gray">
                        {value}
                    </span>
                ))}
            </div>
            <svg className="mt-1.5 h-[88px] w-full" role="img" aria-label={t('racing.playsChartLabel', 'Finishes in the last seven days')}>
                {values.map((value, index) => {
                    const height = Math.max(3, (value / peak) * 84);
                    return (
                        <g key={labels[index]}>
                            <rect
                                x={`${index * slot + inset}%`}
                                y={0}
                                width={`${slot - inset * 2}%`}
                                height={84}
                                rx={4}
                                fill="currentColor"
                                className="text-black/[0.06] dark:text-white/[0.07]"
                            />
                            <rect
                                x={`${index * slot + inset}%`}
                                y={84 - height}
                                width={`${slot - inset * 2}%`}
                                height={height}
                                rx={4}
                                fill={RACING_ACCENT}
                            />
                        </g>
                    );
                })}
            </svg>
            <div className={`h-[2px] w-full rounded-full opacity-40 ${racingAccentBar}`} />
            <div className="mt-1.5 grid grid-cols-7 gap-0">
                {labels.map(label => (
                    <span key={label} className={`text-center ${racingStatLabel}`}>{label}</span>
                ))}
            </div>
        </div>
    );
}

function RecordRow({ record, narrow, onRacer }: { record: TrackRecord; narrow: boolean; onRacer: () => void }) {
    const rank = (
        <span className="w-[22px] shrink-0 text-[13px] font-bold tabular-nums text-ios-gray">{record.rank}</span>
    );
    const racer = (
        <button
            type="button"
            onClick={onRacer}
            className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold text-ios-blue transition-opacity duration-150 hover:opacity-85 active:opacity-60"
        >
            {record.racer}
        </button>
    );
    const badge = <Pill tone={CLASS_TONE[record.class] ?? 'blue'}>{record.class}</Pill>;

    if (narrow) {
        return (
            <div className="flex flex-col gap-1 px-4 py-2.5">
                <div className="flex items-center gap-3">
                    {rank}
                    {racer}
                    <span className="shrink-0 text-right text-[15px] font-bold tabular-nums text-black dark:text-white">
                        {formatLapTime(record.timeSec)}
                    </span>
                </div>
                <div className="flex items-center gap-2 pl-[34px]">
                    {badge}
                    <span className={`min-w-0 flex-1 truncate ${rowMeta}`}>{record.vehicle}</span>
                    <span className={`shrink-0 ${rowMeta}`}>{relTimeCompact(record.at * 1000)}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-3 px-4 py-2.5">
            {rank}
            {racer}
            {badge}
            <span className={`w-[132px] shrink-0 truncate text-right ${rowMeta}`}>{record.vehicle}</span>
            <span className={`w-[70px] shrink-0 text-right ${rowMeta}`}>{relTimeCompact(record.at * 1000)}</span>
            <span className="w-[92px] shrink-0 text-right text-[15px] font-bold tabular-nums text-black dark:text-white">
                {formatLapTime(record.timeSec)}
            </span>
        </div>
    );
}

function DetailBody({ detail, onRacer }: { detail: TrackDetailData; onRacer: (citizenid: string) => void }) {
    const fastest = detail.fastestSec > 0 ? formatLapTime(detail.fastestSec) : '--';

    const hostRef = useRef<HTMLDivElement>(null);
    const [narrow, setNarrow] = useState(false);

    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const measure = () => setNarrow(host.clientWidth < NARROW_DETAIL);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(host);
        return () => ro.disconnect();
    }, []);

    return (
        <Scroller className="min-h-0 flex-1 pb-8">
            <div ref={hostRef} className="flex flex-col gap-5 px-6 pt-4">
                <div
                    className={`${cardSurface} grid items-start gap-4 px-5 py-4`}
                    style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${STAT_MIN}px, 1fr))` }}
                >
                    <Stat label={t('racing.timesPlayed', 'Times played')} value={String(detail.timesPlayed)} />
                    <Stat label={t('racing.totalTime', 'Total time')} value={totalTimeLabel(detail.totalTimeSec)} />
                    <Stat label={t('racing.fastestTime', 'Fastest')} value={fastest} accent />
                    <Stat
                        label={t('racing.recordHolder', 'Holder')}
                        value={detail.holder ?? t('racing.noHolder', 'Nobody yet')}
                    />
                </div>

                <Section title={t('racing.playsLastWeek', 'Finishes, last 7 days')} icon={Timer}>
                    <PlaysChart chart={detail.chart} />
                </Section>

                <Section title={t('racing.fastestTimes', 'Fastest times')} icon={Trophy}>
                    {detail.records.length === 0 ? (
                        <div className={`px-4 py-6 text-center ${rowMeta}`}>
                            {t('racing.noTimesYet', 'Nobody has set a time on this track yet.')}
                        </div>
                    ) : (
                        detail.records.map((record, index) => (
                            <div key={`${record.citizenid}:${record.rank}`}>
                                {index > 0 && <div className={ruleX} />}
                                <RecordRow
                                    record={record}
                                    narrow={narrow}
                                    onRacer={() => onRacer(record.citizenid)}
                                />
                            </div>
                        ))
                    )}
                </Section>
            </div>
        </Scroller>
    );
}

export function TrackDetail({ trackId }: { trackId: number }) {
    const session = useRacingSession();

    const [view, setView]  = useSessionState<TrackView>('racing:tracks:view', 'detail');
    const [, setOpenRacer] = useSessionState<string | null>('racing:rankings:open', null);

    const { data, loading } = useAsyncData(() => racingTrack(trackId), [trackId]);

    if (!data) {
        if (loading) {
            return (
                <div className="flex flex-col gap-3 p-6">
                    <div className="h-20 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                    <div className="h-36 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                    <div className="h-52 animate-shimmer rounded-[16px] bg-black/[0.06] dark:bg-white/[0.06]" />
                </div>
            );
        }
        return (
            <EmptyState
                center
                icon={Flag}
                title={t('racing.trackUnavailable', 'Track unavailable')}
                subtitle={t('racing.trackUnavailableSub', 'This track is no longer published, or it was removed by an administrator.')}
            />
        );
    }

    const track = data.track;

    function openRacer(citizenid: string) {
        setOpenRacer(citizenid);
        session.setSection('rankings');
    }

    return (
        <div key={view} className={`flex min-h-0 flex-1 flex-col ${racingDetailEnter}`}>
            {view === 'map' ? (
                <TrackMap track={track} onBack={() => setView('detail')} />
            ) : view === 'setup' ? (
                <RaceSetup track={track} onBack={() => setView('detail')} />
            ) : (
                <>
                    <div className={`shrink-0 ${panePad}`}>
                        <h1 className="min-w-0 truncate text-[26px] font-bold tracking-tight text-black dark:text-white">
                            {track.name}
                        </h1>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <Pill tone={MODE_TONE[track.mode]}>{modeLabel(track.mode)}</Pill>
                            {track.verified
                                ? <Pill tone="green">{t('racing.verified', 'Verified')}</Pill>
                                : <Pill tone="orange">{t('racing.unverified', 'Unverified')}</Pill>}
                            <span className={rowMeta}>
                                {t('racing.checkpointCount', '{n} CP', { n: track.gates })}
                            </span>
                            <span className={rowMeta}>
                                {t('racing.byAuthor', 'by {name}', { name: track.author || t('racing.unknownAuthor', 'Unknown') })}
                            </span>
                        </div>
                        <div className="mt-3.5 flex flex-wrap items-center gap-2">
                            <DetailAction icon={MapIcon} label={t('racing.viewMap', 'Map')} onPress={() => setView('map')} />
                            <DetailAction icon={Flag} label={t('racing.hostRace', 'Host')} onPress={() => setView('setup')} />
                            <DetailAction
                                icon={MapPin}
                                label={t('racing.waypoint', 'Waypoint')}
                                disabled={!track.coords}
                                onPress={() => { if (track.coords) void racingWaypoint(track.coords.x, track.coords.y); }}
                            />
                        </div>
                    </div>

                    <DetailBody detail={data} onRacer={openRacer} />
                </>
            )}
        </div>
    );
}
