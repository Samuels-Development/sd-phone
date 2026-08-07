import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, Flag } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useSessionState } from '@/hooks/useSessionState';
import { Scroller } from '@/ui/Scroller';
import { Select, type SelectOption } from '@/ui/Select';
import { Slider } from '@/ui/Slider';
import { cardSurface, fieldSm, rowMeta, ruleX, sectionHeader } from '@/ui/surfaces';

import { racingHost, racingVehicle, racingWaypoint } from './racingApi';
import { useRacingSession } from './useRacingSession';
import { racingAccentFill, racingAccentRing, racingStatLabel } from './racingTheme';
import {
    CLASS_ORDER, DEFAULT_SETUP, classAtOrBelow, formatMoney,
    type CameraMode, type PhasingMode, type RaceClass, type RaceSetupDraft, type TrackRow,
} from './data';

const STACK_WIDTH = 560;

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function secondsLabel(seconds: number): string {
    if (seconds < 60) return t('racing.secondsShort', '{n}s', { n: seconds });
    const mins = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if (rest === 0) return t('racing.minutesShort', '{m}m', { m: mins });
    return t('racing.minutesSeconds', '{m}m {s}s', { m: mins, s: rest });
}

function phasingOptions(): SelectOption<PhasingMode>[] {
    return [
        { value: 'off',   label: t('racing.phasingOff', 'Off, cars collide') },
        { value: 'full',  label: t('racing.phasingFull', 'On for the whole race') },
        { value: 'timed', label: t('racing.phasingTimed', 'On for the first stretch') },
    ];
}

function cameraOptions(): SelectOption<CameraMode>[] {
    return [
        { value: 'none',  label: t('racing.cameraFree', 'Driver picks') },
        { value: 'first', label: t('racing.cameraFirst', 'First person only') },
        { value: 'third', label: t('racing.cameraThird', 'Third person only') },
    ];
}

function Row({ label, hint, stacked, disabled, children }: {
    label:     string;
    hint?:     string;
    stacked?:  boolean;
    disabled?: boolean;
    children:  ReactNode;
}) {
    return (
        <div className={`px-4 py-3 ${disabled ? 'opacity-40' : ''}`}>
            <div className={stacked ? 'flex flex-col gap-2.5' : 'flex items-center gap-5'}>
                <div className={stacked ? 'min-w-0' : 'min-w-0 flex-1'}>
                    <div className="text-[15px] font-semibold leading-tight text-black dark:text-white">{label}</div>
                    {hint && <div className={`mt-0.5 ${rowMeta}`}>{hint}</div>}
                </div>
                <div className={`flex items-center gap-3 ${stacked ? 'w-full' : 'w-[260px] shrink-0 justify-end'} ${disabled ? 'pointer-events-none' : ''}`}>
                    {children}
                </div>
            </div>
        </div>
    );
}

function Readout({ children }: { children: ReactNode }) {
    return <span className="w-[64px] shrink-0 text-right text-[15px] font-semibold tabular-nums text-black dark:text-white">{children}</span>;
}

export function RaceSetup({ track, onBack }: { track: TrackRow; onBack: () => void }) {
    const session = useRacingSession();
    const limits  = session.limits;

    const [draft, setDraft] = useSessionState<RaceSetupDraft>('racing:setup:draft', DEFAULT_SETUP);
    const [buyInText, setBuyInText] = useState(() => String(draft.buyIn));
    const [busy, setBusy]   = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hostRef = useRef<HTMLDivElement | null>(null);
    const [stacked, setStacked] = useState(false);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const measure = () => setStacked(host.clientWidth < STACK_WIDTH);
        measure();
        if (typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(measure);
        ro.observe(host);
        return () => ro.disconnect();
    }, []);

    const { data: vehicle } = useAsyncData(() => racingVehicle(), []);

    const sprint = track.mode === 'sprint';
    const laps   = sprint ? 1 : clamp(draft.laps, limits.lapsMin, limits.lapsMax);
    const timed  = draft.phasing === 'timed';

    function patch(part: Partial<RaceSetupDraft>) {
        setError(null);
        setDraft(current => ({ ...current, ...part }));
    }

    function onBuyIn(raw: string) {
        const clean = raw.replace(/\D/g, '').slice(0, 7);
        setBuyInText(clean);
        patch({ buyIn: clamp(Number(clean || 0), limits.buyInMin, limits.buyInMax) });
    }

    function commitBuyIn() {
        const value = clamp(Number(buyInText || 0), limits.buyInMin, limits.buyInMax);
        setBuyInText(String(value));
        patch({ buyIn: value });
    }

    const classLabels: Partial<Record<RaceClass, { label: string }>> = session.classes;
    const classOptions: SelectOption<RaceClass | 'all'>[] = [
        { value: 'all', label: t('racing.classAny', 'Any class') },
        ...CLASS_ORDER.map(cls => {
            const named = classLabels[cls]?.label;
            return { value: cls as RaceClass | 'all', label: named ? `${cls} · ${named}` : cls };
        }),
    ];

    const overClass = !!vehicle && !vehicle.onFoot && draft.vehicleClass !== 'all'
        && !classAtOrBelow(vehicle.class, draft.vehicleClass);

    async function submit() {
        if (busy) return;
        setBusy(true);
        setError(null);
        const result = await racingHost(track.id, {
            delay:          clamp(draft.delay, limits.delayMin, limits.delayMax),
            laps,
            phasing:        draft.phasing,
            phasingSeconds: clamp(draft.phasingSeconds, limits.phaseSecMin, limits.phaseSecMax),
            buyIn:          clamp(draft.buyIn, limits.buyInMin, limits.buyInMax),
            vehicleClass:   draft.vehicleClass,
            camera:         draft.camera,
        });
        setBusy(false);
        if (!result.success) {
            setError(result.message ?? t('racing.hostFailed', 'That race could not be opened.'));
            return;
        }
        const start = result.data?.start;
        if (start) void racingWaypoint(start.x, start.y);
        onBack();
        session.setSection('races');
    }

    return (
        <div ref={hostRef} className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-4">
                <button
                    type="button"
                    onClick={onBack}
                    className="-ml-1.5 flex shrink-0 items-center gap-0.5 py-1 pr-2 text-[15px] font-semibold text-ios-blue transition-opacity duration-150 hover:opacity-85 active:opacity-60"
                >
                    <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.4} />
                    {t('racing.backToTrack', 'Track')}
                </button>
                <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-tight text-black dark:text-white">
                    {t('racing.hostOn', 'Host on {track}', { track: track.name })}
                </h2>
            </div>

            <Scroller className="min-h-0 flex-1 px-6 pb-6 pt-2">
                <div className={`rounded-[16px] bg-black/[0.03] px-5 py-4 dark:bg-white/[0.05] ${racingAccentRing}`}>
                    <div className={stacked
                        ? 'grid grid-cols-2 gap-x-6 gap-y-3.5'
                        : 'flex flex-wrap items-center gap-x-8 gap-y-3'}
                    >
                        <div className="min-w-0">
                            <div className={racingStatLabel}>{t('racing.gridOpensIn', 'Grid opens in')}</div>
                            <div className="text-[17px] font-bold tabular-nums text-black dark:text-white">
                                {secondsLabel(clamp(draft.delay, limits.delayMin, limits.delayMax))}
                            </div>
                        </div>
                        <div className="min-w-0">
                            <div className={racingStatLabel}>{t('racing.checkpointsTotal', 'Checkpoints')}</div>
                            <div className="text-[17px] font-bold tabular-nums text-black dark:text-white">
                                {track.gates * laps}
                            </div>
                        </div>
                        <div className="min-w-0">
                            <div className={racingStatLabel}>{t('racing.buyIn', 'Buy-in')}</div>
                            <div className="text-[17px] font-bold tabular-nums text-black dark:text-white">
                                {draft.buyIn > 0 ? formatMoney(draft.buyIn) : t('racing.free', 'Free')}
                            </div>
                        </div>
                        <div className="min-w-0">
                            <div className={racingStatLabel}>{t('racing.classCeiling', 'Class ceiling')}</div>
                            <div className="text-[17px] font-bold text-black dark:text-white">
                                {draft.vehicleClass === 'all' ? t('racing.classAny', 'Any class') : draft.vehicleClass}
                            </div>
                        </div>
                    </div>
                    {vehicle && (
                        <div className={`mt-3 ${rowMeta}`}>
                            {vehicle.onFoot
                                ? t('racing.onFootNotice', 'You are on foot. Get into a vehicle before the grid opens.')
                                : t('racing.yourVehicleNotice', 'You are driving {model}, class {cls}.', { model: vehicle.model, cls: vehicle.class })}
                        </div>
                    )}
                    {overClass && (
                        <div className="mt-1.5 text-[12.5px] font-semibold text-ios-orange">
                            {t('racing.overClassNotice', 'Your vehicle sits above this ceiling, so you would not be able to join your own race.')}
                        </div>
                    )}
                </div>

                <div className="mb-2 mt-5 px-1">
                    <span className={sectionHeader}>{t('racing.raceSettings', 'Race settings')}</span>
                </div>
                <div className={`${cardSurface} overflow-hidden`}>
                    <Row
                        label={t('racing.delay', 'Start delay')}
                        hint={t('racing.delayHint', 'How long racers have to reach the grid.')}
                        stacked={stacked}
                    >
                        <Slider
                            className={stacked ? 'flex-1' : 'w-[168px]'}
                            value={clamp(draft.delay, limits.delayMin, limits.delayMax)}
                            min={limits.delayMin}
                            max={limits.delayMax}
                            step={5}
                            onChange={value => patch({ delay: value })}
                            ariaLabel={t('racing.delay', 'Start delay')}
                        />
                        <Readout>{secondsLabel(clamp(draft.delay, limits.delayMin, limits.delayMax))}</Readout>
                    </Row>

                    <div className={ruleX} />

                    <Row
                        label={t('racing.laps', 'Laps')}
                        hint={sprint
                            ? t('racing.lapsSprintHint', 'Sprints run point to point, so they are always a single lap.')
                            : t('racing.lapsHint', 'Each lap repeats the full checkpoint list.')}
                        stacked={stacked}
                        disabled={sprint}
                    >
                        <Slider
                            className={stacked ? 'flex-1' : 'w-[168px]'}
                            value={laps}
                            min={limits.lapsMin}
                            max={limits.lapsMax}
                            step={1}
                            onChange={value => patch({ laps: value })}
                            ariaLabel={t('racing.laps', 'Laps')}
                        />
                        <Readout>{laps}</Readout>
                    </Row>

                    <div className={ruleX} />

                    <Row
                        label={t('racing.phasing', 'Phasing')}
                        hint={t('racing.phasingHint', 'Whether racers can drive through each other.')}
                        stacked={stacked}
                    >
                        <Select
                            size="sm"
                            className={stacked ? 'w-full' : 'w-[240px]'}
                            value={draft.phasing}
                            onChange={value => patch({ phasing: value })}
                            options={phasingOptions()}
                            ariaLabel={t('racing.phasing', 'Phasing')}
                        />
                    </Row>

                    <div className={ruleX} />

                    <Row
                        label={t('racing.phasingSeconds', 'Phasing window')}
                        hint={t('racing.phasingSecondsHint', 'How long phasing lasts once the lights go green.')}
                        stacked={stacked}
                        disabled={!timed}
                    >
                        <Slider
                            className={stacked ? 'flex-1' : 'w-[168px]'}
                            value={clamp(draft.phasingSeconds, limits.phaseSecMin, limits.phaseSecMax)}
                            min={limits.phaseSecMin}
                            max={limits.phaseSecMax}
                            step={5}
                            onChange={value => patch({ phasingSeconds: value })}
                            ariaLabel={t('racing.phasingSeconds', 'Phasing window')}
                        />
                        <Readout>{secondsLabel(clamp(draft.phasingSeconds, limits.phaseSecMin, limits.phaseSecMax))}</Readout>
                    </Row>

                    <div className={ruleX} />

                    <Row
                        label={t('racing.buyIn', 'Buy-in')}
                        hint={t('racing.buyInHint', 'Every entry is charged this, and the winner takes the pot.')}
                        stacked={stacked}
                    >
                        <span className="text-[15px] font-semibold text-ios-gray">$</span>
                        <input
                            value={buyInText}
                            inputMode="numeric"
                            aria-label={t('racing.buyIn', 'Buy-in')}
                            onChange={event => onBuyIn(event.target.value)}
                            onBlur={commitBuyIn}
                            className={`${stacked ? 'min-w-0 flex-1' : 'w-[132px]'} text-right tabular-nums ${fieldSm}`}
                        />
                    </Row>

                    <div className={ruleX} />

                    <Row
                        label={t('racing.classCeiling', 'Class ceiling')}
                        hint={t('racing.classCeilingHint', 'The highest class allowed on the grid.')}
                        stacked={stacked}
                    >
                        <Select
                            size="sm"
                            className={stacked ? 'w-full' : 'w-[240px]'}
                            value={draft.vehicleClass}
                            onChange={value => patch({ vehicleClass: value })}
                            options={classOptions}
                            ariaLabel={t('racing.classCeiling', 'Class ceiling')}
                        />
                    </Row>

                    <div className={ruleX} />

                    <Row
                        label={t('racing.camera', 'Camera')}
                        hint={t('racing.cameraHint', 'Force a view for every racer, or leave it to them.')}
                        stacked={stacked}
                    >
                        <Select
                            size="sm"
                            className={stacked ? 'w-full' : 'w-[240px]'}
                            value={draft.camera}
                            onChange={value => patch({ camera: value })}
                            options={cameraOptions()}
                            ariaLabel={t('racing.camera', 'Camera')}
                        />
                    </Row>
                </div>

                {error && (
                    <div className="mt-3 px-1 text-[13.5px] font-semibold text-ios-red">{error}</div>
                )}

                <div className="mt-5 flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex shrink-0 items-center px-2 py-[8px] text-[15px] font-semibold text-ios-blue transition-opacity duration-150 hover:opacity-85 active:opacity-60"
                    >
                        {t('racing.cancel', 'Cancel')}
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => void submit()}
                        className={`inline-flex shrink-0 items-center gap-2 rounded-full px-6 py-[10px] text-[15px] font-bold transition-opacity duration-150 hover:opacity-85 active:opacity-60 disabled:cursor-default disabled:opacity-40 ${racingAccentFill}`}
                    >
                        <Flag className="h-[16px] w-[16px]" strokeWidth={2.4} />
                        {busy ? t('racing.opening', 'Opening') : t('racing.openRace', 'Open the race')}
                    </button>
                </div>
            </Scroller>
        </div>
    );
}
