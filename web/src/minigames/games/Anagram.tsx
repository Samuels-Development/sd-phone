import { useEffect, useMemo, useState } from 'react';

import { Delete } from 'lucide-react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, glow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type AnagramOptions, type AnagramRow, type GameProps, type MinigameOutcome, type MinigameResult } from '../data';

const SETTLE_MS = 1900;

const DEFAULTS: AnagramOptions = { attempts: 3, time: 45 };

export function Anagram({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const letters = useMemo(() => start.puzzle?.letters ?? [], [start.puzzle]);

    const [order, setOrder]     = useState<number[]>([]);
    const [attempts, setAttempts] = useState(0);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [busy, setBusy]       = useState(false);

    useEffect(() => {
        if (letters.length) sfx('reveal');
    }, [letters.length]);

    function finish(result: MinigameResult<AnagramRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function submit(final: number[]) {
        if (busy || outcome) return;
        setBusy(true);
        const result = await answerMinigame<AnagramRow>(final);
        setBusy(false);
        if (!result) return;
        setAttempts(n => n + 1);
        if (result.done) finish(result);
        else {
            sfx('deny');
            setOrder([]);
        }
    }

    function place(slot: number) {
        if (outcome || order.includes(slot)) return;
        const next = [...order, slot];
        setOrder(next);
        if (next.length === letters.length) void submit(next);
    }

    return (
        <MinigamePanel
            title={t('minigames.anagram', 'Anagram')}
            headline={t('minigames.unscramble', 'Unscramble it')}
            sub={t('minigames.triesLeft', '{n} tries left', { n: options.attempts - attempts })}
            score={{ label: t('minigames.statAttempts', 'Attempts'), value: String(attempts) }}
            seconds={options.time}
            total={options.attempts}
            left={options.attempts - attempts}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => {
                if (outcome) return;
                void forfeitMinigame<AnagramRow>().then(r => finish(r ?? { done: true, win: false }));
            }}
            meta={
                <button
                    type="button"
                    disabled={order.length === 0 || outcome !== null}
                    onClick={() => setOrder(prev => prev.slice(0, -1))}
                    className="flex items-center gap-2 rounded-full px-6 py-2.5 text-[14px] font-semibold transition-opacity active:opacity-70 disabled:opacity-30"
                    style={{ ...tileFace, color: 'rgba(255,255,255,0.8)' }}
                >
                    <Delete className="h-[16px] w-[16px]" strokeWidth={2.2} />
                    {t('minigames.takeBack', 'Undo')}
                </button>
            }
        >
            <div className="flex flex-col gap-5" style={boardIn(200)}>
                <div className="flex flex-wrap justify-center gap-1.5">
                    {letters.map((_, i) => {
                        const slot = order[i];
                        const filled = slot !== undefined;
                        return (
                            <span
                                key={i}
                                className="flex h-[46px] w-[38px] items-center justify-center rounded-[11px] text-[21px] font-bold uppercase text-white transition-all duration-150"
                                style={filled
                                    ? { backgroundColor: PANEL.accent, boxShadow: glow(PANEL.accent) }
                                    : { backgroundColor: SURFACE.sunken, boxShadow: `inset 0 0 0 1px ${SURFACE.hair}` }}
                            >
                                {filled ? letters[slot] : ''}
                            </span>
                        );
                    })}
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                    {letters.map((letter, slot) => {
                        const used = order.includes(slot);
                        return (
                            <button
                                key={slot}
                                type="button"
                                disabled={used || outcome !== null}
                                onClick={() => place(slot)}
                                aria-label={t('minigames.letterN', 'Letter {letter}', { letter })}
                                className="flex h-[46px] w-[42px] items-center justify-center rounded-[12px] text-[21px] font-bold uppercase transition-all duration-150 active:scale-[0.92]"
                                style={used
                                    ? { backgroundColor: 'transparent', color: 'rgba(255,255,255,0.14)' }
                                    : { ...tileFace, color: '#fff' }}
                            >
                                {letter}
                            </button>
                        );
                    })}
                </div>
            </div>
        </MinigamePanel>
    );
}
