import { useMemo, useState, type ReactNode } from 'react';
import { Eye, LogOut, MapPin, Play } from 'lucide-react';

import { isFiveM } from '@/core/nui';
import { useAsyncData } from '@/hooks/useAsyncData';
import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { Pill } from '@/ui/Pill';
import { Scroller } from '@/ui/Scroller';
import { cardSurface, panePad, rowMeta, rowTitle, sectionHeader } from '@/ui/surfaces';

import type { CameraMode, PhasingMode, Race, Standing } from './data';
import { formatDelta, formatMoney, prizeShare, startsInLabel } from './data';
import { racingJoin, racingLeave, racingSpectate, racingTrackRoute, racingWaypoint } from './racingApi';
import { RouteMapView } from './RouteMapView';
import { TrackMap } from './TrackMap';
import {
    CLASS_TONE, RACING_ACCENT, racingAccentFill, racingAccentSoft, racingAccentText, racingStat,
    racingStatLabel, STATUS_TONE,
} from './racingTheme';
import { failText } from '@/core/api';

const RANKED_PRIZE_SPLIT = [0.75, 0.15, 0.10];
const PRIZE_PLACES = [1, 2, 3];

const PREVIEW_H = 176;

export function racePool(race: Race): number {
    return race.custom ? race.entryFee * Math.max(race.registered, 1) : race.prizePool;
}

function placeLabel(place: number): string {
    if (place === 1) return t('racing.place1', '1st');
    if (place === 2) return t('racing.place2', '2nd');
    if (place === 3) return t('racing.place3', '3rd');
    return t('racing.placeN', '{n}th', { n: place });
}

function phasingLabel(mode: PhasingMode): string {
    if (mode === 'full') return t('racing.phasingFull', 'On for the whole race');
    if (mode === 'timed') return t('racing.phasingTimed', 'On for the first stretch');
    return t('racing.phasingOff', 'Off');
}

function cameraLabel(mode: CameraMode): string {
    if (mode === 'first') return t('racing.cameraFirst', 'Locked to first person');
    if (mode === 'third') return t('racing.cameraThird', 'Locked to third person');
    return t('racing.cameraNone', 'Driver choice');
}

function distanceLabel(metres: number): string {
    if (metres >= 1000) return t('racing.distanceKm', '{n} km', { n: (metres / 1000).toFixed(1) });
    return t('racing.distanceM', '{n} m', { n: Math.round(metres) });
}

function TrackPreview({ trackId, onOpenMap }: { trackId: number; onOpenMap?: () => void }) {
    const { data, settled } = useAsyncData(() => racingTrackRoute(trackId), [trackId]);
    const route = useMemo(() => data ?? [], [data]);

    if (route.length < 2) {
        if (!settled) return null;
        return null;
    }

    const body = (
        <div className={`relative mt-4 overflow-hidden ${cardSurface}`} style={{ height: PREVIEW_H }}>
            <RouteMapView points={route} interactive={false} compact />
            <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/[0.06] dark:ring-white/[0.08]" />
        </div>
    );

    if (!onOpenMap) return body;

    return (
        <button
            type="button"
            onClick={onOpenMap}
            aria-label={t('racing.openTrackMap', 'Open the full map')}
            className="block w-full text-left transition-opacity duration-150 hover:opacity-95 active:opacity-85"
        >
            {body}
        </button>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="p-4">
            <div className={racingStatLabel}>{label}</div>
            <div className={`mt-1 ${racingStat}`}>{value}</div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-center gap-3 px-4 py-2.5">
            <span className={`min-w-0 flex-1 truncate ${rowMeta}`}>{label}</span>
            <span className={`shrink-0 text-right ${rowTitle}`}>{value}</span>
        </div>
    );
}

function Action({ variant = 'plain', icon, disabled = false, onClick, children }: {
    variant?:  'accent' | 'plain' | 'destructive';
    icon?:     ReactNode;
    disabled?: boolean;
    onClick:   () => void;
    children:  ReactNode;
}) {
    const tone = variant === 'accent'
        ? racingAccentFill
        : variant === 'destructive'
            ? 'bg-ios-red/10 text-ios-red'
            : 'bg-black/[0.06] text-black dark:bg-white/[0.10] dark:text-white';

    const state = disabled
        ? 'cursor-default opacity-40'
        : 'transition-opacity duration-150 hover:opacity-85 active:opacity-60';

    return (
        <button
            type="button"
            disabled={disabled}
            onClick={disabled ? undefined : onClick}
            onKeyDown={event => { if (event.key === ' ' && isFiveM) event.preventDefault(); }}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 py-[7px] text-[15px] font-semibold ${tone} ${state}`}
        >
            {icon}
            {children}
        </button>
    );
}

export function RaceDetail({ race, now, standings, onRaces, onStandings, onRefresh }: {
    race:        Race;
    now:         number;
    standings:   Standing[];
    onRaces:     (races: Race[]) => void;
    onStandings: (entries: Standing[]) => void;
    onRefresh:   () => void;
}) {
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [mapOpen, setMapOpen] = useState(false);

    const live = race.status === 'live';
    const full = race.registered >= race.maxRacers;
    const pool = racePool(race);

    const splits = useMemo(
        () => PRIZE_PLACES
            .map(place => ({ place, share: prizeShare(race.custom, place, RANKED_PRIZE_SPLIT) }))
            .filter(entry => entry.share > 0),
        [race.custom],
    );

    async function join() {
        setConfirming(false);
        if (busy) return;
        setBusy(true);
        const res = await racingJoin(race.id);
        setBusy(false);
        if (!res.success || !res.data) {
            setError(failText(res, t('racing.joinFailed', 'You could not be put on that grid.')));
            onRefresh();
            return;
        }
        setError('');
        onRaces(res.data.races);
    }

    async function leave() {
        if (busy) return;
        setBusy(true);
        const res = await racingLeave(race.id);
        setBusy(false);
        if (!res.success || !res.data) {
            setError(failText(res, t('racing.leaveFailed', 'You could not be taken off that grid.')));
            onRefresh();
            return;
        }
        setError('');
        onRaces(res.data.races);
    }

    async function spectate() {
        if (busy) return;
        setBusy(true);
        const res = await racingSpectate(race.id);
        setBusy(false);
        if (!res.success || !res.data) {
            setError(failText(res, t('racing.spectateFailed', 'That race could not be followed.')));
            return;
        }
        setError('');
        onStandings(res.data.standings);
    }

    async function waypoint() {
        if (!race.start) return;
        await racingWaypoint(race.start.x, race.start.y);
    }

    if (mapOpen) {
        return (
            <TrackMap
                track={{ id: race.trackId, name: race.trackName }}
                onBack={() => setMapOpen(false)}
            />
        );
    }

    return (
        <Scroller className={`h-full ${panePad}`}>
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <Pill tone={STATUS_TONE[race.status]}>
                            {live ? t('racing.live', 'Live') : t('racing.registering', 'Registering')}
                        </Pill>
                        <Pill tone={CLASS_TONE[race.class]}>
                            {t('racing.classLetter', 'Class {letter}', { letter: race.class })}
                        </Pill>
                        {race.custom && <Pill tone="orange">{t('racing.customRace', 'Custom')}</Pill>}
                    </div>
                    <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-ios-display text-black dark:text-white">
                        {race.name}
                    </h1>
                    <div className="mt-1 text-[13px] text-ios-gray">
                        {t('racing.onTrackBy', '{track} by {author}', { track: race.trackName, author: race.author })}
                    </div>
                </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
                {!live && !race.joined && (
                    <Action
                        variant="accent"
                        icon={<Play className="h-[15px] w-[15px]" strokeWidth={2.6} />}
                        disabled={busy || full}
                        onClick={() => (race.entryFee > 0 ? setConfirming(true) : void join())}
                    >
                        {full ? t('racing.gridFull', 'Grid full') : t('racing.join', 'Join race')}
                    </Action>
                )}
                {!live && race.joined && (
                    <Action
                        variant="destructive"
                        icon={<LogOut className="h-[15px] w-[15px]" strokeWidth={2.6} />}
                        disabled={busy}
                        onClick={() => void leave()}
                    >
                        {t('racing.leave', 'Leave race')}
                    </Action>
                )}
                {live && (
                    <Action
                        icon={<Eye className="h-[15px] w-[15px]" strokeWidth={2.4} />}
                        disabled={busy}
                        onClick={() => void spectate()}
                    >
                        {t('racing.spectate', 'Follow race')}
                    </Action>
                )}
                {race.start && (
                    <Action
                        icon={<MapPin className="h-[15px] w-[15px]" strokeWidth={2.4} />}
                        onClick={() => void waypoint()}
                    >
                        {t('racing.routeToStart', 'Route to start')}
                    </Action>
                )}
            </div>

            {error && <div className="mt-3 text-[14px] text-ios-red">{error}</div>}

            {race.joined && !live && (
                <div className={`mt-3 text-[14px] font-medium ${racingAccentText}`}>
                    {t('racing.joinedNotice', 'You are on the grid. Be at the start line before the countdown.')}
                </div>
            )}

            <TrackPreview trackId={race.trackId} onOpenMap={() => setMapOpen(true)} />

            <div className={`mt-4 overflow-hidden ${cardSurface}`}>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))' }}>
                    <Stat label={t('racing.prizePool', 'Prize pool')} value={formatMoney(pool)} />
                    <Stat
                        label={t('racing.buyIn', 'Buy-in')}
                        value={race.entryFee > 0 ? formatMoney(race.entryFee) : t('racing.free', 'Free')}
                    />
                    <Stat label={t('racing.grid', 'Grid')} value={`${race.registered}/${race.maxRacers}`} />
                    <Stat
                        label={live ? t('racing.status', 'Status') : t('racing.startsIn', 'Starts in')}
                        value={live ? t('racing.underway', 'Underway') : startsInLabel(race.startsAt, now)}
                    />
                </div>
            </div>

            <div className={`mb-2 mt-5 px-1 ${sectionHeader}`}>{t('racing.raceDetails', 'Race details')}</div>
            <div className={`overflow-hidden ${cardSurface}`}>
                <InfoRow
                    label={t('racing.classCeiling', 'Class ceiling')}
                    value={t('racing.classAtOrBelow', '{letter} and below', { letter: race.class })}
                />
                <InfoRow
                    label={t('racing.mode', 'Mode')}
                    value={race.mode === 'circuit' ? t('racing.circuit', 'Circuit') : t('racing.sprint', 'Sprint')}
                />
                <InfoRow label={t('racing.laps', 'Laps')} value={String(race.laps)} />
                <InfoRow label={t('racing.checkpoints', 'Checkpoints')} value={String(race.gates)} />
                <InfoRow label={t('racing.distance', 'Distance')} value={distanceLabel(race.distance)} />
                <InfoRow label={t('racing.phasing', 'Phasing')} value={phasingLabel(race.phasing)} />
                <InfoRow label={t('racing.camera', 'Camera')} value={cameraLabel(race.camera)} />
                {race.requiredLevel > 1 && (
                    <InfoRow
                        label={t('racing.requiredLevel', 'Required level')}
                        value={String(race.requiredLevel)}
                    />
                )}
            </div>

            {splits.length > 0 && pool > 0 && (
                <>
                    <div className={`mb-2 mt-5 px-1 ${sectionHeader}`}>{t('racing.prizeSplit', 'Prize split')}</div>
                    <div className={`overflow-hidden ${cardSurface}`}>
                        {splits.map(entry => (
                            <div key={entry.place} className="flex items-center gap-3 px-4 py-3">
                                <span className={`w-8 shrink-0 tabular-nums ${rowMeta}`}>{placeLabel(entry.place)}</span>
                                <span className="block h-[6px] min-w-0 flex-1 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/[0.12]">
                                    <span
                                        className="block h-full rounded-full"
                                        style={{ width: `${entry.share * 100}%`, background: RACING_ACCENT }}
                                    />
                                </span>
                                <span className={`shrink-0 tabular-nums ${rowTitle}`}>
                                    {formatMoney(pool * entry.share)}
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {live && (
                <>
                    <div className={`mb-2 mt-5 px-1 ${sectionHeader}`}>{t('racing.standings', 'Standings')}</div>
                    <div className={`overflow-hidden ${cardSurface}`}>
                        {standings.length === 0 ? (
                            <div className="px-4 py-5 text-center text-[14px] text-ios-gray">
                                {t('racing.noStandings', 'Follow the race to pull in live positions.')}
                            </div>
                        ) : standings.map(entry => (
                            <div
                                key={`${entry.pos}:${entry.name}`}
                                className={`flex items-center gap-3 px-4 py-2.5 ${entry.you ? racingAccentSoft : ''}`}
                            >
                                <span className={`w-6 shrink-0 tabular-nums ${rowMeta}`}>{entry.pos}</span>
                                <span className={`min-w-0 flex-1 truncate ${rowTitle}`}>{entry.name}</span>
                                <span className={`shrink-0 tabular-nums ${rowMeta}`}>{formatDelta(entry.deltaMs)}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <div className="h-6" />

            {confirming && (
                <AlertDialog
                    title={t('racing.confirmBuyInTitle', 'Pay the buy-in?')}
                    message={t('racing.confirmBuyInSub', '{amount} comes off your account to put you on the grid for {race}. Leaving before the green light refunds it.', {
                        amount: formatMoney(race.entryFee),
                        race:   race.name,
                    })}
                    confirmLabel={t('racing.payAndJoin', 'Pay {amount}', { amount: formatMoney(race.entryFee) })}
                    onCancel={() => setConfirming(false)}
                    onConfirm={() => void join()}
                />
            )}
        </Scroller>
    );
}
