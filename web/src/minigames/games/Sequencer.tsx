import { useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, boardIn, glow, panelEyebrow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type SequencerOptions, type SequencerRow, type SequencerRule } from '../data';

const SETTLE_MS = 1900;

const STEPS = ['auth', 'probe', 'mask', 'dump', 'exec', 'purge', 'spoof'];

const DEFAULTS: SequencerOptions = { steps: 5, rules: 3, time: 45 };

function stepName(index: number): string {
    return STEPS[(index - 1) % STEPS.length] ?? `op${index}`;
}

function ruleText(rule: SequencerRule): string {
    if (rule.kind === 'before') {
        return t('minigames.ruleBefore', '{a} before {b}', { a: stepName(rule.a), b: stepName(rule.b ?? 1) });
    }
    if (rule.kind === 'last') {
        return t('minigames.ruleLast', '{a} runs last', { a: stepName(rule.a) });
    }
    return t('minigames.ruleNotFirst', '{a} is not first', { a: stepName(rule.a) });
}

export function Sequencer({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const rules = useMemo(() => start.puzzle?.rules ?? [], [start.puzzle]);

    const [order, setOrder]     = useState<number[]>([]);
    const [broken, setBroken]   = useState<number[] | null>(null);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [busy, setBusy]       = useState(false);
    const [tries, setTries]     = useState(0);

    useEffect(() => {
        if (rules.length > 0) sfx('reveal');
    }, [rules]);

    const pool = Array.from({ length: options.steps }, (_, i) => i + 1).filter(step => !order.includes(step));

    function finish(result: MinigameResult<SequencerRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function run() {
        if (busy || outcome || order.length !== options.steps) return;
        setBusy(true);
        setTries(count => count + 1);
        const result = await answerMinigame<SequencerRow>(order);
        setBusy(false);
        if (!result) return;
        if (result.feedback) setBroken(result.feedback.broken ?? []);
        if (!result.done && result.feedback?.broken?.length) sfx('deny');
        if (result.done) finish(result);
    }

    async function expire() {
        if (outcome) return;
        const result = await forfeitMinigame<SequencerRow>();
        finish(result ?? { done: true, win: false });
    }

    return (
        <MinigamePanel
            title={t('minigames.sequencer', 'Sequencer')}
            headline={t('minigames.orderTheExploit', 'Order the exploit')}
            sub={t('minigames.stepsPlaced', '{placed} of {total} placed', { placed: order.length, total: options.steps })}
            score={{ label: t('minigames.statAttempts', 'Attempts'), value: String(tries) }}
            seconds={options.time}
            total={options.steps}
            left={order.length}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            meta={
                <button
                    type="button"
                    disabled={busy || outcome !== null || order.length !== options.steps}
                    onClick={() => { void run(); }}
                    className="rounded-full px-8 py-2.5 text-[15px] font-semibold text-white transition-opacity active:opacity-70 disabled:opacity-30"
                    style={{ backgroundColor: PANEL.accent }}
                >
                    {t('minigames.execute', 'Execute')}
                </button>
            }
        >
            <div className="flex flex-col gap-4" style={boardIn(200)}>
                <div className="flex flex-col gap-1.5">
                    {rules.map((rule, i) => (
                        <div
                            key={i}
                            className="flex items-center gap-2 rounded-[10px] px-3 py-1.5"
                            style={broken?.includes(i + 1)
                                ? { backgroundColor: `${PANEL.fail}1A`, boxShadow: `inset 0 0 0 1px ${PANEL.fail}59` }
                                : { backgroundColor: 'rgba(255,255,255,0.045)' }}
                        >
                            <span className={`${panelEyebrow} text-white/35`}>{i + 1}</span>
                            <span className="text-[13.5px] font-medium text-white/80">{ruleText(rule)}</span>
                        </div>
                    ))}
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                    {order.map((step, slot) => (
                        <button
                            key={step}
                            type="button"
                            disabled={outcome !== null}
                            onClick={() => setOrder(prev => prev.filter(s => s !== step))}
                            className="flex h-[38px] items-center gap-1.5 rounded-[11px] px-3 transition-all duration-150 active:scale-[0.94]"
                            style={{ backgroundColor: PANEL.accent, boxShadow: glow(PANEL.accent) }}
                        >
                            <span className="text-[10px] font-bold tabular-nums text-white/60">{slot + 1}</span>
                            <span className="text-[14px] font-semibold text-white">{stepName(step)}</span>
                        </button>
                    ))}
                </div>

                {pool.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2">
                        {pool.map(step => (
                            <button
                                key={step}
                                type="button"
                                disabled={outcome !== null}
                                onClick={() => {
                                    if (order.length + 1 === options.steps) sfx('lock');
                                    setOrder(prev => [...prev, step]);
                                }}
                                className="flex h-[38px] items-center rounded-[11px] px-3.5 text-[14px] font-semibold text-white/85 transition-all duration-150 active:scale-[0.94]"
                                style={tileFace}
                            >
                                {stepName(step)}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </MinigamePanel>
    );
}
