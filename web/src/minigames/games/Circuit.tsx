import { useMemo, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, glow, panelEyebrow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type CircuitLine, type CircuitOptions, type CircuitRow, type GameProps, type MinigameOutcome, type MinigameResult } from '../data';

const SETTLE_MS = 1900;
const OUT = ['A', 'B', 'C', 'D', 'E'];

const DEFAULTS: CircuitOptions = { inputs: 4, outputs: 3, attempts: 3, time: 45 };

function gateLabel(gate: string): string {
    if (gate === 'and') return t('minigames.gateAnd', 'AND');
    if (gate === 'or') return t('minigames.gateOr', 'OR');
    return t('minigames.gateXor', 'XOR');
}

export function Circuit({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const lines = useMemo(() => start.puzzle?.lines ?? [], [start.puzzle]);

    const [switches, setSwitches] = useState<boolean[]>(() => Array.from({ length: options.inputs }, () => false));
    const [tried, setTried]       = useState<CircuitRow | null>(null);
    const [attempts, setAttempts] = useState(0);
    const [outcome, setOutcome]   = useState<MinigameOutcome>(null);
    const [busy, setBusy]         = useState(false);

    function finish(result: MinigameResult<CircuitRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function test() {
        if (busy || outcome) return;
        setBusy(true);
        const result = await answerMinigame<CircuitRow>(switches.map(on => (on ? 1 : 0)));
        setBusy(false);
        if (!result) return;
        const gained = (result.feedback?.lit ?? 0) > (tried?.lit ?? 0);
        const first  = !tried;
        if (result.feedback) setTried(result.feedback);
        setAttempts(prev => prev + 1);
        if (result.done) {
            finish(result);
            return;
        }
        if (first && result.feedback) sfx('reveal');
        else sfx(gained ? 'lock' : 'deny');
    }

    async function expire() {
        if (outcome) return;
        const result = await forfeitMinigame<CircuitRow>();
        finish(result ?? { done: true, win: false });
    }

    function term(line: CircuitLine, which: 'a' | 'b') {
        const index = which === 'a' ? line.a : line.b;
        const negated = which === 'a' ? line.na : line.nb;
        return (
            <span className="flex items-center gap-1">
                {negated && <span className="text-[12px] font-bold" style={{ color: PANEL.fail }}>{t('minigames.gateNot', 'NOT')}</span>}
                <span
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-[7px] text-[12px] font-bold tabular-nums"
                    style={switches[index - 1]
                        ? { backgroundColor: PANEL.accent, color: '#fff' }
                        : { backgroundColor: SURFACE.sunken, color: 'rgba(255,255,255,0.5)' }}
                >
                    {index}
                </span>
            </span>
        );
    }

    return (
        <MinigamePanel
            title={t('minigames.circuit', 'Circuit')}
            headline={t('minigames.lightEveryLine', 'Light every line')}
            sub={t('minigames.testsLeft', '{n} tests left', { n: options.attempts - attempts })}
            score={{ label: t('minigames.statLinesLit', 'Lines lit'), value: String(tried?.lit ?? 0) }}
            seconds={options.time}
            total={options.attempts}
            left={options.attempts - attempts}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            meta={
                <button
                    type="button"
                    disabled={busy || outcome !== null}
                    onClick={() => { void test(); }}
                    className="rounded-full px-8 py-2.5 text-[15px] font-semibold text-white transition-opacity active:opacity-70 disabled:opacity-40"
                    style={{ backgroundColor: PANEL.accent }}
                >
                    {t('minigames.runTest', 'Run')}
                </button>
            }
        >
            <div className="flex flex-col gap-4" style={boardIn(200)}>
                <div className="flex justify-center gap-2.5">
                    {switches.map((on, i) => (
                        <button
                            key={i}
                            type="button"
                            disabled={outcome !== null}
                            onClick={() => setSwitches(prev => prev.map((v, at) => (at === i ? !v : v)))}
                            aria-label={t('minigames.switchN', 'Switch {n}', { n: i + 1 })}
                            className="flex h-[46px] w-[46px] flex-col items-center justify-center gap-0.5 rounded-[13px] transition-all duration-150 active:scale-[0.93]"
                            style={on
                                ? { backgroundColor: PANEL.accent, boxShadow: glow(PANEL.accent) }
                                : tileFace}
                        >
                            <span className="text-[15px] font-bold tabular-nums text-white">{i + 1}</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-white/60">
                                {on ? t('minigames.on', 'on') : t('minigames.off', 'off')}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="flex flex-col gap-2">
                    {lines.map((line, i) => {
                        const live = tried?.live?.[i];
                        return (
                            <div
                                key={i}
                                className="flex items-center gap-2.5 rounded-[12px] px-3 py-2"
                                style={live === true
                                    ? { backgroundColor: `${PANEL.win}1F`, boxShadow: `inset 0 0 0 1px ${PANEL.win}66` }
                                    : live === false
                                        ? { backgroundColor: `${PANEL.fail}1A`, boxShadow: `inset 0 0 0 1px ${PANEL.fail}59` }
                                        : tileFace}
                            >
                                <span className={`${panelEyebrow} w-[14px] text-white/60`}>{OUT[i]}</span>
                                {term(line, 'a')}
                                <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">{gateLabel(line.gate)}</span>
                                {term(line, 'b')}
                            </div>
                        );
                    })}
                </div>
            </div>
        </MinigamePanel>
    );
}
