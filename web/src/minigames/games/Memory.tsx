import { useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, boardCard, boardIn, glow, panelSub, tileFace } from '../panel';
import { sfx } from '../sfx';
import { memoryOptions, type GameProps, type MemoryRow, type MinigameOutcome, type MinigameResult } from '../data';

const SETTLE_MS = 1900;

type Phase = 'preview' | 'input' | 'over';

export function Memory({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => memoryOptions(start.options), [start.options]);
    const pattern = useMemo(() => start.puzzle?.pattern ?? [], [start.puzzle]);
    const wanted = useMemo(() => new Set(pattern), [pattern]);

    const [phase, setPhase]     = useState<Phase>('preview');
    const [taps, setTaps]       = useState<number[]>([]);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [reveal, setReveal]   = useState<number[] | null>(null);
    const submitted = useRef(false);

    const hits   = taps.filter(tile => wanted.has(tile)).length;
    const misses = taps.length - hits;

    useEffect(() => {
        sfx('reveal');
        const id = window.setTimeout(() => setPhase('input'), options.preview * 1000);
        return () => window.clearTimeout(id);
    }, [options.preview]);

    function finish(result: MinigameResult<MemoryRow>) {
        setPhase('over');
        setOutcome(result.win ? 'win' : 'lose');
        setReveal(result.reveal ?? null);
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function submit(final: number[]) {
        if (submitted.current) return;
        submitted.current = true;
        const result = await answerMinigame<MemoryRow>(final);
        if (result) finish(result);
    }

    async function expire() {
        if (submitted.current) return;
        submitted.current = true;
        const result = await forfeitMinigame<MemoryRow>();
        finish(result ?? { done: true, win: false });
    }

    function tap(tile: number) {
        if (phase !== 'input' || taps.includes(tile)) return;

        const next = [...taps, tile];
        setTaps(next);
        sfx(wanted.has(tile) ? 'lock' : 'deny');

        const nextHits = next.filter(one => wanted.has(one)).length;
        if (nextHits === options.targets || next.length - nextHits > options.mistakes) {
            setPhase('over');
            void submit(next);
        }
    }

    const previewing = phase === 'preview';

    return (
        <MinigamePanel
            title={t('minigames.memory', 'Memory')}
            headline={previewing
                ? t('minigames.memorise', 'Memorise the pattern')
                : t('minigames.repeatPattern', 'Tap what lit up')}
            sub={previewing
                ? t('minigames.tilesToFind', '{n} tiles', { n: options.targets })
                : t('minigames.tilesFound', '{hits} of {total} found', { hits, total: options.targets })}
            seconds={options.time}
            total={options.mistakes}
            left={Math.max(0, options.mistakes - misses)}
            score={{ label: t('minigames.statMistakes', 'Mistakes'), value: String(misses) }}
            outcome={outcome}
            outcomeLabel={outcome === 'win'
                ? undefined
                : t('minigames.tilesFound', '{hits} of {total} found', { hits, total: options.targets })}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            meta={options.mistakes > 0 && (
                <span className={panelSub}>
                    {t('minigames.mistakesLeft', '{n} mistakes left', { n: Math.max(0, options.mistakes - misses) })}
                </span>
            )}
        >
            <div
                className="grid gap-[9px] rounded-[22px] p-3.5"
                style={{ ...boardCard, ...boardIn(200), gridTemplateColumns: `repeat(${options.grid}, minmax(0, 1fr))` }}
            >
                {Array.from({ length: options.grid * options.grid }, (_, i) => {
                    const tile = i + 1;
                    const missed = reveal?.includes(tile) && !taps.includes(tile);
                    const lit = (previewing && wanted.has(tile)) || missed;
                    const tapped = !previewing && taps.includes(tile);
                    const good = tapped && wanted.has(tile);

                    const fill = lit ? PANEL.accent : good ? PANEL.win : tapped ? PANEL.fail : null;

                    return (
                        <button
                            key={tile}
                            type="button"
                            disabled={phase !== 'input'}
                            onClick={() => tap(tile)}
                            aria-label={t('minigames.tile', 'Tile {n}', { n: tile })}
                            className="aspect-square rounded-[14px] transition-[background-color,box-shadow,transform] duration-200 active:scale-[0.93]"
                            style={fill
                                ? { backgroundColor: fill, boxShadow: glow(fill) }
                                : tileFace}
                        />
                    );
                })}
            </div>
        </MinigamePanel>
    );
}
