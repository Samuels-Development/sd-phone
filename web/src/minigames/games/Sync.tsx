import { useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, glow, panelSub } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type SyncOptions, type SyncRow } from '../data';

const SETTLE_MS = 1900;
const MIN_WINDOW = 0.05;

const DEFAULTS: SyncOptions = { hits: 3, period: 1600, window: 18, shrink: 74, time: 20 };

export function Sync({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const centers = useMemo(() => start.puzzle?.centers ?? [], [start.puzzle]);

    const [hits, setHits]       = useState(0);
    const [tries, setTries]     = useState(0);
    const [flash, setFlash]     = useState<'hit' | 'miss' | null>(null);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [busy, setBusy]       = useState(false);
    const openedAt = useRef(Date.now());

    function finish(result: MinigameResult<SyncRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function strike() {
        if (busy || outcome) return;
        setBusy(true);
        const result = await answerMinigame<SyncRow>({ at: Date.now() - openedAt.current });
        setBusy(false);
        if (!result) return;

        const row = result.feedback;
        if (row) {
            setHits(row.hits);
            setTries(n => n + 1);
            setFlash(row.caught ? 'hit' : 'miss');
            sfx(row.caught ? 'lock' : 'deny');
            window.setTimeout(() => setFlash(null), 320);
        }
        if (result.done) finish(result);
    }

    async function expire() {
        if (outcome) return;
        const result = await forfeitMinigame<SyncRow>();
        finish(result ?? { done: true, win: false });
    }

    const index = Math.min(hits, Math.max(0, centers.length - 1));
    const center = centers[index] ?? 0.5;
    const width = Math.max(MIN_WINDOW, (options.window / 100) * Math.pow(options.shrink / 100, index));
    const tone = flash === 'hit' ? PANEL.win : flash === 'miss' ? PANEL.fail : PANEL.accent;

    return (
        <MinigamePanel
            title={t('minigames.sync', 'Sync')}
            headline={t('minigames.stopTheMarker', 'Stop it in the gate')}
            sub={t('minigames.gatesCleared', '{hits} of {total} cleared', { hits, total: options.hits })}
            seconds={options.time}
            total={options.hits}
            left={hits}
            outcome={outcome}
            outcomeLabel={outcome === 'lose'
                ? t('minigames.gatesCleared', '{hits} of {total} cleared', { hits, total: options.hits })
                : undefined}
            leaving={leaving}
            score={{ label: t('minigames.statAttempts', 'Attempts'), value: String(tries) }}
            onExpire={() => { void expire(); }}
            meta={
                <button
                    type="button"
                    disabled={busy || outcome !== null}
                    onClick={() => { void strike(); }}
                    className="rounded-full px-10 py-3 text-[16px] font-semibold text-white transition-opacity active:opacity-70 disabled:opacity-40"
                    style={{ backgroundColor: tone }}
                >
                    {t('minigames.strike', 'Stop')}
                </button>
            }
        >
            <div className="flex flex-col gap-4" style={boardIn(200)}>
                <div
                    className="relative h-[64px] overflow-hidden rounded-[14px]"
                    style={{ backgroundColor: SURFACE.sunken, boxShadow: `inset 0 0 0 1px ${SURFACE.hair}` }}
                >
                    <span
                        className="absolute inset-y-0 rounded-[8px] transition-all duration-200"
                        style={{
                            left:            `${Math.max(0, (center - width / 2) * 100)}%`,
                            width:           `${width * 100}%`,
                            backgroundColor: `${tone}30`,
                            boxShadow:       `inset 0 0 0 1.5px ${tone}`,
                        }}
                    />
                    {!outcome && (
                        <div
                            className="absolute inset-0"
                            style={{ animation: `mg-sweep ${options.period / 2}ms linear infinite alternate` }}
                        >
                            <span
                                className="absolute inset-y-[8px] left-0 w-[4px] -translate-x-1/2 rounded-full"
                                style={{ backgroundColor: '#FFFFFF', boxShadow: glow('#FFFFFF') }}
                            />
                        </div>
                    )}
                </div>

                <div className="flex justify-center gap-2">
                    {Array.from({ length: options.hits }, (_, i) => (
                        <span
                            key={i}
                            className="h-[8px] w-[26px] rounded-full transition-colors duration-200"
                            style={{ backgroundColor: i < hits ? PANEL.win : 'rgba(255,255,255,0.14)' }}
                        />
                    ))}
                </div>

                <p className={`${panelSub} text-center`}>
                    {t('minigames.gateNarrows', 'The gate narrows each time')}
                </p>
            </div>
        </MinigamePanel>
    );
}
