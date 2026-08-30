import { useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, boardIn, glow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type SimonOptions, type SimonRow } from '../data';

const SETTLE_MS = 1900;

const PADS = ['#FF453A', '#FFD60A', '#32D74B', '#64D2FF', '#BF5AF2', '#FF9F0A'];

const DEFAULTS: SimonOptions = { pads: 4, length: 5, pace: 520, time: 45 };

export function Simon({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const order = useMemo(() => start.puzzle?.order ?? [], [start.puzzle]);

    const [showing, setShowing] = useState(true);
    const [lit, setLit]         = useState<number | null>(null);
    const [played, setPlayed]   = useState<number[]>([]);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [misses, setMisses]   = useState(0);
    const timers = useRef<number[]>([]);

    function finish(result: MinigameResult<SimonRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    useEffect(() => {
        const pace = options.pace;
        sfx('reveal');
        order.forEach((pad, i) => {
            timers.current.push(window.setTimeout(() => setLit(pad), pace * i + 400));
            timers.current.push(window.setTimeout(() => setLit(null), pace * i + 400 + pace * 0.55));
        });
        timers.current.push(window.setTimeout(() => setShowing(false), pace * order.length + 500));

        const ids = timers.current;
        return () => { for (const id of ids) window.clearTimeout(id); };
    }, [order, options.pace]);

    async function submit(final: number[]) {
        const result = await answerMinigame<SimonRow>(final);
        if (result) finish(result);
    }

    function tap(pad: number) {
        if (showing || outcome) return;
        const next = [...played, pad];
        const expected = order[played.length];
        const wrong = expected !== undefined && expected !== pad;
        sfx(wrong ? 'deny' : 'lock');
        if (wrong) setMisses(m => m + 1);
        setPlayed(next);
        setLit(pad);
        window.setTimeout(() => setLit(null), 160);
        if (next.length === options.length) void submit(next);
    }

    return (
        <MinigamePanel
            title={t('minigames.simon', 'Sequence')}
            headline={showing
                ? t('minigames.watchTheOrder', 'Watch the order')
                : t('minigames.playItBack', 'Play it back')}
            sub={showing
                ? t('minigames.stepsLong', '{n} steps long', { n: options.length })
                : t('minigames.stepsPlayed', '{played} of {total}', { played: played.length, total: options.length })}
            score={{ label: t('minigames.statMistakes', 'Mistakes'), value: String(misses) }}
            seconds={options.time}
            total={options.length}
            left={played.length}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => {
                if (outcome) return;
                void forfeitMinigame<SimonRow>().then(r => finish(r ?? { done: true, win: false }));
            }}
        >
            <div className="grid grid-cols-2 gap-3" style={boardIn(200)}>
                {Array.from({ length: options.pads }, (_, i) => {
                    const pad = i + 1;
                    const color = PADS[i % PADS.length]!;
                    const on = lit === pad;
                    return (
                        <button
                            key={pad}
                            type="button"
                            disabled={showing || outcome !== null}
                            onClick={() => tap(pad)}
                            aria-label={t('minigames.padN', 'Pad {n}', { n: pad })}
                            className="aspect-square rounded-[18px] transition-all duration-100 active:scale-[0.95]"
                            style={on
                                ? { backgroundColor: color, boxShadow: glow(color) }
                                : { ...tileFace, backgroundColor: `${color}24` }}
                        />
                    );
                })}
            </div>

            <div className="flex justify-center gap-1.5">
                {Array.from({ length: options.length }, (_, i) => (
                    <span
                        key={i}
                        className="h-[7px] w-[18px] rounded-full transition-colors duration-200"
                        style={{ backgroundColor: i < played.length ? PANEL.accent : 'rgba(255,255,255,0.14)' }}
                    />
                ))}
            </div>
        </MinigamePanel>
    );
}
