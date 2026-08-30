import { useMemo, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, boardIn, glow, panelSub, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type RewireOptions, type RewireRow } from '../data';

const SETTLE_MS = 1900;

const WIRE = ['#FF453A', '#FF9F0A', '#FFD60A', '#32D74B', '#64D2FF', '#BF5AF2', '#FF6482'];

const DEFAULTS: RewireOptions = { ports: 5, mistakes: 2, time: 30 };

export function Rewire({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);

    const [picked, setPicked]     = useState<number | null>(null);
    const [solved, setSolved]     = useState<Record<number, number>>({});
    const [wrong, setWrong]       = useState<{ left: number; right: number } | null>(null);
    const [mistakes, setMistakes] = useState(0);
    const [outcome, setOutcome]   = useState<MinigameOutcome>(null);
    const [busy, setBusy]         = useState(false);

    const takenRight = new Set(Object.values(solved));

    function finish(result: MinigameResult<RewireRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function connect(left: number, right: number) {
        if (busy || outcome) return;
        setBusy(true);
        setPicked(null);
        const result = await answerMinigame<RewireRow>({ left, right });
        setBusy(false);
        if (!result) return;

        const row = result.feedback;
        if (row?.correct) {
            sfx('lock');
            setSolved(prev => ({ ...prev, [left]: right }));
            setWrong(null);
        } else if (row) {
            sfx('deny');
            setMistakes(row.mistakes);
            setWrong({ left, right });
            window.setTimeout(() => setWrong(null), 450);
        }
        if (result.done) finish(result);
    }

    async function expire() {
        if (outcome) return;
        const result = await forfeitMinigame<RewireRow>();
        finish(result ?? { done: true, win: false });
    }

    function tapRight(right: number) {
        if (picked === null || takenRight.has(right)) return;
        void connect(picked, right);
    }

    const ports = Array.from({ length: options.ports }, (_, i) => i + 1);
    const found = Object.keys(solved).length;

    return (
        <MinigamePanel
            title={t('minigames.rewire', 'Rewire')}
            headline={picked === null
                ? t('minigames.pickWire', 'Pick a wire')
                : t('minigames.pickTerminal', 'Choose its terminal')}
            sub={t('minigames.wiresJoined', '{found} of {total} joined', { found, total: options.ports })}
            score={{ label: t('minigames.statMistakes', 'Mistakes'), value: String(mistakes) }}
            seconds={options.time}
            total={options.mistakes}
            left={Math.max(0, options.mistakes - mistakes)}
            outcome={outcome}
            outcomeLabel={outcome === 'lose'
                ? t('minigames.wiresJoined', '{found} of {total} joined', { found, total: options.ports })
                : undefined}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            meta={options.mistakes > 0 && (
                <span className={panelSub}>
                    {t('minigames.mistakesLeft', '{n} mistakes left', { n: Math.max(0, options.mistakes - mistakes) })}
                </span>
            )}
        >
            <div className="flex items-stretch justify-between gap-4" style={boardIn(200)}>
                <div className="flex flex-1 flex-col gap-2.5">
                    {ports.map(left => {
                        const done = solved[left] !== undefined;
                        const active = picked === left;
                        const color = WIRE[(left - 1) % WIRE.length]!;
                        return (
                            <button
                                key={left}
                                type="button"
                                disabled={done || busy || outcome !== null}
                                onClick={() => setPicked(active ? null : left)}
                                aria-label={t('minigames.wire', 'Wire {n}', { n: left })}
                                className="flex h-[44px] items-center gap-2.5 rounded-[12px] px-3 transition-all duration-150 active:scale-[0.97]"
                                style={active || done
                                    ? { backgroundColor: `${color}26`, boxShadow: `inset 0 0 0 1.5px ${color}` }
                                    : tileFace}
                            >
                                <span
                                    className="h-[14px] w-[14px] shrink-0 rounded-full"
                                    style={{ backgroundColor: color, boxShadow: active ? glow(color) : undefined }}
                                />
                                <span className="h-[2px] flex-1 rounded-full" style={{ backgroundColor: done ? color : 'rgba(255,255,255,0.14)' }} />
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-1 flex-col gap-2.5">
                    {ports.map(right => {
                        const owner = ports.find(left => solved[left] === right);
                        const color = owner ? WIRE[(owner - 1) % WIRE.length]! : null;
                        const bad = wrong?.right === right;
                        return (
                            <button
                                key={right}
                                type="button"
                                disabled={owner !== undefined || busy || outcome !== null || picked === null}
                                onClick={() => tapRight(right)}
                                aria-label={t('minigames.terminal', 'Terminal {n}', { n: right })}
                                className="flex h-[44px] items-center justify-end gap-2.5 rounded-[12px] px-3 transition-all duration-150 active:scale-[0.97]"
                                style={color
                                    ? { backgroundColor: `${color}26`, boxShadow: `inset 0 0 0 1.5px ${color}` }
                                    : bad
                                        ? { backgroundColor: `${PANEL.fail}26`, boxShadow: `inset 0 0 0 1.5px ${PANEL.fail}` }
                                        : { ...tileFace, opacity: picked === null ? 0.55 : 1 }}
                            >
                                <span className="h-[2px] flex-1 rounded-full" style={{ backgroundColor: color ?? 'rgba(255,255,255,0.14)' }} />
                                <span className="text-[15px] font-semibold tabular-nums text-white/80">{right}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </MinigamePanel>
    );
}
