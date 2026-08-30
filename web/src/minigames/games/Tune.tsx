import { useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, glow, panelEyebrow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type TuneOptions, type TuneRow } from '../data';

const SETTLE_MS = 1900;
const BANDS = 5;

const DEFAULTS: TuneOptions = { span: 100, tolerance: 3, attempts: 5, time: 30 };

export function Tune({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);

    const [value, setValue]     = useState(Math.round(options.span / 2));
    const [rows, setRows]       = useState<TuneRow[]>([]);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [reveal, setReveal]   = useState<number[] | null>(null);
    const [busy, setBusy]       = useState(false);
    const track = useRef<HTMLDivElement>(null);

    const last = rows[rows.length - 1];
    const band = last?.band ?? 0;

    function finish(result: MinigameResult<TuneRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        setReveal(result.reveal ?? null);
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function lock() {
        if (busy || outcome) return;
        setBusy(true);
        const result = await answerMinigame<TuneRow>(value);
        setBusy(false);
        if (!result) return;
        if (result.feedback) {
            const row = result.feedback as TuneRow;
            setRows(prev => [...prev, row]);
            if (!result.done) sfx(row.band > band ? 'lock' : 'deny');
        }
        if (result.done) finish(result);
    }

    async function expire() {
        if (outcome) return;
        const result = await forfeitMinigame<TuneRow>();
        finish(result ?? { done: true, win: false });
    }

    function seek(clientX: number) {
        const box = track.current?.getBoundingClientRect();
        if (!box || box.width === 0 || outcome) return;
        const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
        setValue(Math.round(ratio * options.span));
    }

    const pct = (value / options.span) * 100;

    return (
        <MinigamePanel
            title={t('minigames.tune', 'Tune')}
            headline={t('minigames.findSignal', 'Find the signal')}
            sub={band > 0
                ? t('minigames.signalStrength', 'Signal {n} of {max}', { n: band, max: BANDS })
                : t('minigames.noSignal', 'Nothing on this frequency yet')}
            score={{ label: t('minigames.statAttempts', 'Attempts'), value: String(rows.length) }}
            seconds={options.time}
            total={options.attempts}
            left={options.attempts - rows.length}
            outcome={outcome}
            outcomeLabel={outcome === 'lose' && reveal
                ? t('minigames.signalWas', 'It was on {n}', { n: reveal[0] })
                : undefined}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            meta={
                <button
                    type="button"
                    disabled={busy || outcome !== null}
                    onClick={() => { void lock(); }}
                    className="rounded-full px-7 py-2.5 text-[15px] font-semibold text-white transition-opacity active:opacity-70 disabled:opacity-40"
                    style={{ backgroundColor: PANEL.accent }}
                >
                    {t('minigames.lockOn', 'Lock on')}
                </button>
            }
        >
            <div className="flex flex-col gap-5" style={boardIn(200)}>
                <div className="flex items-end justify-center gap-[5px]">
                    {Array.from({ length: BANDS }, (_, i) => (
                        <span
                            key={i}
                            className="w-[13px] rounded-[3px] transition-all duration-200"
                            style={{
                                height:          `${16 + i * 9}px`,
                                backgroundColor: i < band ? PANEL.accent : 'rgba(255,255,255,0.10)',
                                boxShadow:       i < band ? glow(PANEL.accent) : undefined,
                            }}
                        />
                    ))}
                </div>

                <div className="flex flex-col gap-3">
                    <div className="text-center text-[34px] font-bold tabular-nums leading-none text-white">{value}</div>

                    <div
                        ref={track}
                        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); seek(e.clientX); }}
                        onPointerMove={e => { if (e.buttons === 1) seek(e.clientX); }}
                        className="relative h-[42px] cursor-pointer touch-none rounded-[12px]"
                        style={{ backgroundColor: SURFACE.sunken, boxShadow: `inset 0 0 0 1px ${SURFACE.hair}` }}
                    >
                        {rows.map((row, i) => (
                            <span
                                key={i}
                                className="absolute top-[7px] h-[10px] w-[2px] rounded-full"
                                style={{
                                    left:            `${(row.value / options.span) * 100}%`,
                                    backgroundColor: `rgba(255,255,255,${0.18 + row.band * 0.14})`,
                                }}
                            />
                        ))}
                        <span
                            className="absolute bottom-[6px] top-[6px] w-[4px] -translate-x-1/2 rounded-full"
                            style={{ left: `${pct}%`, backgroundColor: PANEL.accent, boxShadow: glow(PANEL.accent) }}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <span className={`${panelEyebrow} text-white/30`}>0</span>
                        {last && (
                            <span className={`${panelEyebrow} text-white/45`}>
                                {last.above
                                    ? t('minigames.tooHigh', 'Try lower')
                                    : t('minigames.tooLow', 'Try higher')}
                            </span>
                        )}
                        <span className={`${panelEyebrow} text-white/30`}>{options.span}</span>
                    </div>
                </div>

                <div className="flex flex-wrap justify-center gap-1.5">
                    {rows.map((row, i) => (
                        <span
                            key={i}
                            className="flex h-[28px] min-w-[38px] items-center justify-center rounded-[8px] px-2 text-[13px] font-semibold tabular-nums text-white/70"
                            style={tileFace}
                        >
                            {row.value}
                        </span>
                    ))}
                </div>
            </div>
        </MinigamePanel>
    );
}
