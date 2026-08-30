import { useEffect, useMemo, useState } from 'react';

import { Scissors } from 'lucide-react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, boardIn, glow, panelEyebrow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type WiresOptions, type WiresRow, type WiresClue } from '../data';

const SETTLE_MS = 1900;

const WIRE = ['#FF453A', '#FF9F0A', '#FFD60A', '#32D74B', '#64D2FF', '#BF5AF2', '#FFFFFF'];
const NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'violet', 'white'];

const DEFAULTS: WiresOptions = { wires: 5, clues: 3, cuts: 1, time: 35 };

function wireName(index: number): string {
    return NAMES[(index - 1) % NAMES.length] ?? `${index}`;
}

function clueText(clue: WiresClue): string {
    if (clue.kind === 'notWire') {
        return t('minigames.clueNotWire', 'The {colour} wire is safe to leave', { colour: wireName(clue.a ?? 1) });
    }
    if (clue.kind === 'notEnd') {
        return t('minigames.clueNotEnd', 'It is not the top or bottom wire');
    }
    if (clue.kind === 'even') {
        return t('minigames.clueEven', 'It sits at an even position');
    }
    return t('minigames.clueOdd', 'It sits at an odd position');
}

export function Wires({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const clues = useMemo(() => start.puzzle?.clues ?? [], [start.puzzle]);

    const [cut, setCut]         = useState<Record<number, boolean>>({});
    const [wrong, setWrong]     = useState(0);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [busy, setBusy]       = useState(false);

    useEffect(() => {
        if (clues.length > 0) sfx('reveal');
    }, [clues]);

    function finish(result: MinigameResult<WiresRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function snip(wire: number) {
        if (busy || outcome || cut[wire]) return;
        setBusy(true);
        const result = await answerMinigame<WiresRow>({ wire });
        setBusy(false);
        if (!result) return;

        const row = result.feedback;
        if (row) {
            sfx(row.right ? 'lock' : 'deny');
            setCut(prev => ({ ...prev, [wire]: row.right }));
            setWrong(row.wrong);
        }
        if (result.done) finish(result);
    }

    return (
        <MinigamePanel
            title={t('minigames.wires', 'Wires')}
            headline={t('minigames.cutTheLive', 'Cut the live wire')}
            sub={t('minigames.oneShot', 'The clues narrow it down')}
            score={{ label: t('minigames.statMistakes', 'Mistakes'), value: String(wrong) }}
            seconds={options.time}
            total={options.cuts}
            left={Math.max(0, options.cuts - wrong)}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => {
                if (outcome) return;
                void forfeitMinigame<WiresRow>().then(r => finish(r ?? { done: true, win: false }));
            }}
        >
            <div className="flex flex-col gap-4" style={boardIn(200)}>
                <div className="flex flex-col gap-1.5">
                    {clues.map((clue, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-[10px] px-3 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.045)' }}>
                            <span className={`${panelEyebrow} text-white/35`}>{i + 1}</span>
                            <span className="text-[13.5px] font-medium text-white/80">{clueText(clue)}</span>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col gap-2.5">
                    {Array.from({ length: options.wires }, (_, i) => {
                        const wire = i + 1;
                        const color = WIRE[i % WIRE.length]!;
                        const snipped = cut[wire] !== undefined;
                        const live = cut[wire] === true;

                        return (
                            <button
                                key={wire}
                                type="button"
                                disabled={snipped || busy || outcome !== null}
                                onClick={() => { void snip(wire); }}
                                aria-label={t('minigames.cutWire', 'Cut the {colour} wire', { colour: wireName(wire) })}
                                className="flex h-[38px] items-center gap-3 rounded-[11px] px-3 transition-all duration-150 active:scale-[0.98]"
                                style={snipped
                                    ? { backgroundColor: live ? `${PANEL.win}26` : 'rgba(255,255,255,0.03)', opacity: live ? 1 : 0.45 }
                                    : tileFace}
                            >
                                <span className="h-[13px] w-[13px] shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: live ? glow(color) : undefined }} />
                                <span
                                    className="h-[4px] flex-1 rounded-full"
                                    style={{
                                        background: snipped
                                            ? `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 12px)`
                                            : color,
                                    }}
                                />
                                {!snipped && <Scissors className="h-[15px] w-[15px] shrink-0 text-white/35" strokeWidth={2.2} />}
                            </button>
                        );
                    })}
                </div>
            </div>
        </MinigamePanel>
    );
}
