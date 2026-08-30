import { useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, glow, panelSub } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type VentOptions, type VentRow } from '../data';

const SETTLE_MS = 1900;
const STEP_MS = 50;
const START = 50;
const SWING = 26;

const DEFAULTS: VentOptions = { need: 4, rise: 15, vent: 27, band: 18, drift: 5200, time: 20 };

function bandAt(elapsed: number, drift: number, seed: number): number {
    return 50 + SWING * Math.sin((elapsed / drift) * Math.PI * 2 + seed);
}

export function Vent({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const seed = start.puzzle?.seed ?? 0;

    const [needle, setNeedle]   = useState(START);
    const [held, setHeld]       = useState(0);
    const [slips, setSlips]     = useState(0);
    const [holding, setHolding] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);

    const holdingRef = useRef(false);
    const bandRef = useRef(Math.abs(START - bandAt(0, options.drift, seed)) <= options.band / 2);
    const holds = useRef<{ from: number; to: number }[]>([]);
    const openRef = useRef<number | null>(null);
    const stateRef = useRef({ needle: START, held: 0, at: 0 });
    const settled = useRef(false);

    function finish(result: MinigameResult<VentRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    function closeHold(at: number) {
        if (openRef.current === null) return;
        holds.current.push({ from: openRef.current, to: Math.max(at, openRef.current + 1) });
        openRef.current = null;
    }

    async function submit() {
        if (settled.current) return;
        settled.current = true;
        closeHold(stateRef.current.at);
        const result = await answerMinigame<VentRow>(holds.current);
        if (result) finish(result);
    }

    async function expire() {
        if (settled.current) return;
        settled.current = true;
        closeHold(stateRef.current.at);
        const result = await forfeitMinigame<VentRow>();
        finish(result ?? { done: true, win: false });
    }

    const submitRef = useRef(submit);
    submitRef.current = submit;

    useEffect(() => {
        const id = window.setInterval(() => {
            const s = stateRef.current;
            s.at += STEP_MS;
            const delta = (STEP_MS / 1000) * (holdingRef.current ? -options.vent : options.rise);
            s.needle = Math.min(100, Math.max(0, s.needle + delta));
            const on = Math.abs(s.needle - bandAt(s.at, options.drift, seed)) <= options.band / 2;
            if (on) s.held += STEP_MS;

            if (on !== bandRef.current) {
                bandRef.current = on;
                if (!settled.current) {
                    sfx(on ? 'lock' : 'deny');
                    if (!on) setSlips(n => n + 1);
                }
            }

            setNeedle(s.needle);
            setHeld(s.held);
            setElapsed(s.at);

            if (s.held >= options.need * 1000) {
                window.clearInterval(id);
                void submitRef.current();
            }
        }, STEP_MS);
        return () => window.clearInterval(id);
    }, [options.vent, options.rise, options.drift, options.band, options.need, seed]);

    const center = bandAt(elapsed, options.drift, seed);
    const inBand = Math.abs(needle - center) <= options.band / 2;
    const progress = Math.min(1, held / (options.need * 1000));
    const tone = outcome === 'lose' ? PANEL.fail : inBand ? PANEL.win : PANEL.accent;

    return (
        <MinigamePanel
            title={t('minigames.vent', 'Vent')}
            headline={t('minigames.holdInBand', 'Hold it in the band')}
            sub={t('minigames.secondsHeld', '{held} of {need}s', {
                held: (held / 1000).toFixed(1),
                need: options.need,
            })}
            score={{ label: t('minigames.statSlips', 'Slips'), value: String(slips) }}
            seconds={options.time}
            total={0}
            left={0}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            meta={
                <button
                    type="button"
                    disabled={outcome !== null}
                    onPointerDown={() => {
                        if (outcome) return;
                        holdingRef.current = true;
                        setHolding(true);
                        if (openRef.current === null) openRef.current = stateRef.current.at;
                    }}
                    onPointerUp={() => { holdingRef.current = false; setHolding(false); closeHold(stateRef.current.at); }}
                    onPointerLeave={() => { holdingRef.current = false; setHolding(false); closeHold(stateRef.current.at); }}
                    className="select-none rounded-full px-12 py-3.5 text-[16px] font-semibold text-white transition-transform duration-100 active:scale-[0.96] disabled:opacity-40"
                    style={{ backgroundColor: holding ? PANEL.win : PANEL.accent }}
                >
                    {t('minigames.holdToVent', 'Hold to vent')}
                </button>
            }
        >
            <div className="flex items-stretch justify-center gap-4" style={boardIn(200)}>
                <div
                    className="relative h-[200px] w-[86px] overflow-hidden rounded-[16px]"
                    style={{ backgroundColor: SURFACE.sunken, boxShadow: `inset 0 0 0 1px ${SURFACE.hair}` }}
                >
                    <span
                        className="absolute inset-x-0 rounded-[8px]"
                        style={{
                            bottom:          `${Math.max(0, center - options.band / 2)}%`,
                            height:          `${options.band}%`,
                            backgroundColor: `${PANEL.win}26`,
                            boxShadow:       `inset 0 0 0 1.5px ${PANEL.win}80`,
                        }}
                    />
                    <span
                        className="absolute inset-x-[10px] h-[5px] -translate-y-1/2 rounded-full"
                        style={{
                            bottom:          `${needle}%`,
                            backgroundColor: tone,
                            boxShadow:       glow(tone),
                        }}
                    />
                </div>

                <div className="flex flex-col justify-between py-1">
                    <span className={panelSub}>{t('minigames.pressure', 'Pressure')}</span>
                    <div
                        className="relative h-[120px] w-[10px] overflow-hidden rounded-full"
                        style={{ backgroundColor: SURFACE.sunken }}
                    >
                        <span
                            className="absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-100"
                            style={{ height: `${progress * 100}%`, backgroundColor: PANEL.win }}
                        />
                    </div>
                    <span className={panelSub}>{Math.round(progress * 100)}%</span>
                </div>
            </div>
        </MinigamePanel>
    );
}
