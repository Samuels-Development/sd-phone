import { useMemo, useState } from 'react';

import { Flag } from 'lucide-react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, boardCard, boardIn, glow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type SweepOptions, type SweepRow } from '../data';

const SETTLE_MS = 1900;

const DEFAULTS: SweepOptions = { grid: 5, live: 4, mistakes: 1, time: 50 };

export function Sweep({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);

    const [near, setNear]         = useState<Record<number, number>>({});
    const [hot, setHot]           = useState<number[]>([]);
    const [flags, setFlags]       = useState<number[]>([]);
    const [mistakes, setMistakes] = useState(0);
    const [flagging, setFlagging] = useState(false);
    const [outcome, setOutcome]   = useState<MinigameOutcome>(null);
    const [busy, setBusy]         = useState(false);

    function finish(result: MinigameResult<SweepRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function probe(cell: number) {
        if (busy || outcome) return;
        setBusy(true);
        const result = await answerMinigame<SweepRow>({ action: 'probe', cell });
        setBusy(false);
        if (!result) return;

        const row = result.feedback;
        if (row?.hot) {
            sfx('deny');
            setHot(prev => [...prev, cell]);
            setMistakes(row.mistakes ?? 0);
        } else if (row) {
            sfx('reveal');
            setNear(prev => ({ ...prev, [cell]: row.near ?? 0 }));
        }
        if (result.done) finish(result);
    }

    async function submit() {
        if (busy || outcome || flags.length !== options.live) return;
        setBusy(true);
        const result = await answerMinigame<SweepRow>({ action: 'flag', flags });
        setBusy(false);
        if (result) finish(result);
    }

    async function expire() {
        if (outcome) return;
        const result = await forfeitMinigame<SweepRow>();
        finish(result ?? { done: true, win: false });
    }

    function tap(cell: number) {
        if (near[cell] !== undefined || hot.includes(cell) || outcome) return;
        if (flagging) {
            if (!flags.includes(cell) && flags.length < options.live) sfx('lock');
            setFlags(prev => prev.includes(cell)
                ? prev.filter(c => c !== cell)
                : prev.length < options.live ? [...prev, cell] : prev);
            return;
        }
        void probe(cell);
    }

    const cells = options.grid * options.grid;

    return (
        <MinigamePanel
            title={t('minigames.sweep', 'Sweep')}
            headline={flagging
                ? t('minigames.flagTheNodes', 'Flag the live nodes')
                : t('minigames.probeTheGrid', 'Probe the grid')}
            sub={t('minigames.flagsPlaced', '{placed} of {total} flagged', { placed: flags.length, total: options.live })}
            score={{ label: t('minigames.statProbed', 'Probed'), value: String(Object.keys(near).length) }}
            seconds={options.time}
            total={options.mistakes}
            left={Math.max(0, options.mistakes - mistakes)}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            meta={
                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        disabled={outcome !== null}
                        onClick={() => setFlagging(v => !v)}
                        className="flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-semibold transition-opacity active:opacity-70"
                        style={flagging
                            ? { backgroundColor: PANEL.accent, color: '#fff' }
                            : { ...tileFace, color: 'rgba(255,255,255,0.75)' }}
                    >
                        <Flag className="h-[15px] w-[15px]" strokeWidth={2.4} />
                        {t('minigames.flagMode', 'Flag')}
                    </button>
                    <button
                        type="button"
                        disabled={busy || outcome !== null || flags.length !== options.live}
                        onClick={() => { void submit(); }}
                        className="rounded-full px-6 py-2.5 text-[14px] font-semibold text-white transition-opacity active:opacity-70 disabled:opacity-30"
                        style={{ backgroundColor: PANEL.win }}
                    >
                        {t('minigames.confirmFlags', 'Confirm')}
                    </button>
                </div>
            }
        >
            <div
                className="grid gap-[6px] rounded-[22px] p-3"
                style={{ ...boardCard, ...boardIn(200), gridTemplateColumns: `repeat(${options.grid}, minmax(0, 1fr))` }}
            >
                {Array.from({ length: cells }, (_, i) => {
                    const cell = i + 1;
                    const count = near[cell];
                    const isHot = hot.includes(cell);
                    const flagged = flags.includes(cell);

                    return (
                        <button
                            key={cell}
                            type="button"
                            disabled={outcome !== null}
                            onClick={() => tap(cell)}
                            aria-label={t('minigames.cell', 'Cell {n}', { n: cell })}
                            className="flex aspect-square items-center justify-center rounded-[9px] text-[15px] font-bold tabular-nums transition-all duration-150 active:scale-[0.92]"
                            style={isHot
                                ? { backgroundColor: PANEL.fail, boxShadow: glow(PANEL.fail), color: '#fff' }
                                : flagged
                                    ? { backgroundColor: PANEL.accent, boxShadow: glow(PANEL.accent), color: '#fff' }
                                    : count !== undefined
                                        ? { backgroundColor: 'rgba(0,0,0,0.34)', color: count === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.82)' }
                                        : tileFace}
                        >
                            {isHot ? '!' : flagged ? <Flag className="h-[14px] w-[14px]" strokeWidth={2.6} /> : count ?? ''}
                        </button>
                    );
                })}
            </div>
        </MinigamePanel>
    );
}
