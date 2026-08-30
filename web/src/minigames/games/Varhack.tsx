import { useMemo, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, glow, panelEyebrow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type VarhackOptions, type VarhackRow } from '../data';

const SETTLE_MS = 1900;

const DEFAULTS: VarhackOptions = { columns: 4, rows: 7, mistakes: 2, time: 30 };

export function Varhack({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const columns = useMemo(() => start.puzzle?.columns ?? [], [start.puzzle]);
    const wanted = useMemo(() => start.puzzle?.wanted ?? [], [start.puzzle]);

    const [done, setDone]         = useState(0);
    const [mistakes, setMistakes] = useState(0);
    const [miss, setMiss]         = useState<string | null>(null);
    const [outcome, setOutcome]   = useState<MinigameOutcome>(null);
    const [busy, setBusy]         = useState(false);

    function finish(result: MinigameResult<VarhackRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function pull(column: number, row: number) {
        if (busy || outcome || column !== done + 1) return;
        setBusy(true);
        const result = await answerMinigame<VarhackRow>({ column, row });
        setBusy(false);
        if (!result) return;

        const feedback = result.feedback;
        if (feedback) {
            setDone(feedback.done);
            setMistakes(feedback.mistakes);
            if (feedback.right) {
                sfx('lock');
            } else {
                sfx('deny');
                setMiss(`${column}:${row}`);
                window.setTimeout(() => setMiss(null), 380);
            }
        }
        if (result.done) finish(result);
    }

    const active = done + 1;

    return (
        <MinigamePanel
            title={t('minigames.varhack', 'Var hack')}
            headline={t('minigames.pullTheRegister', 'Pull {value}', { value: wanted[done] ?? '--' })}
            sub={t('minigames.registersPulled', 'Register {n} of {total}', { n: Math.min(active, options.columns), total: options.columns })}
            score={{ label: t('minigames.statMistakes', 'Mistakes'), value: String(mistakes) }}
            seconds={options.time}
            total={options.mistakes}
            left={Math.max(0, options.mistakes - mistakes)}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => {
                if (outcome) return;
                void forfeitMinigame<VarhackRow>().then(r => finish(r ?? { done: true, win: false }));
            }}
        >
            <div className="flex justify-center gap-2" style={boardIn(200)}>
                {columns.map((cells, c) => {
                    const column = c + 1;
                    const isActive = column === active && !outcome;
                    const isDone = column <= done;

                    return (
                        <div
                            key={column}
                            className="flex flex-1 flex-col gap-1.5 rounded-[12px] p-1.5 transition-all duration-200"
                            style={isActive
                                ? { backgroundColor: `${PANEL.accent}14`, boxShadow: `inset 0 0 0 1px ${PANEL.accent}59` }
                                : { backgroundColor: SURFACE.sunken, opacity: isDone ? 0.4 : 0.6 }}
                        >
                            <span className={`${panelEyebrow} text-center text-white/30`}>{column}</span>
                            {cells.map((cell, r) => {
                                const row = r + 1;
                                const missed = miss === `${column}:${row}`;
                                return (
                                    <button
                                        key={row}
                                        type="button"
                                        disabled={!isActive || busy}
                                        onClick={() => { void pull(column, row); }}
                                        className="rounded-[7px] py-[5px] text-[13px] font-semibold tabular-nums transition-all duration-150 active:scale-[0.92]"
                                        style={missed
                                            ? { backgroundColor: PANEL.fail, color: '#fff', boxShadow: glow(PANEL.fail) }
                                            : isActive
                                                ? { ...tileFace, color: 'rgba(255,255,255,0.85)' }
                                                : { backgroundColor: 'transparent', color: 'rgba(255,255,255,0.25)' }}
                                    >
                                        {cell}
                                    </button>
                                );
                            })}
                        </div>
                    );
                })}
            </div>

            <div className="flex justify-center gap-2">
                {Array.from({ length: options.columns }, (_, i) => (
                    <span
                        key={i}
                        className="h-[8px] w-[24px] rounded-full transition-colors duration-300"
                        style={{ backgroundColor: i < done ? PANEL.win : 'rgba(255,255,255,0.14)' }}
                    />
                ))}
            </div>
        </MinigamePanel>
    );
}
