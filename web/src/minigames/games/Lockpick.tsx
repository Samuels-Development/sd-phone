import { useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, glow, panelEyebrow } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type LockpickOptions, type LockpickRow, type MinigameOutcome, type MinigameResult } from '../data';

const SETTLE_MS = 1900;
const FEELS = 4;

const DEFAULTS: LockpickOptions = { pins: 3, tolerance: 5, breaks: 3, time: 40 };

export function Lockpick({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);

    const [value, setValue]     = useState(50);
    const [set, setSet]         = useState(0);
    const [broken, setBroken]   = useState(0);
    const [last, setLast]       = useState<LockpickRow | null>(null);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [busy, setBusy]       = useState(false);
    const barrel = useRef<HTMLDivElement>(null);

    function finish(result: MinigameResult<LockpickRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function turn() {
        if (busy || outcome) return;
        setBusy(true);
        const result = await answerMinigame<LockpickRow>(value);
        setBusy(false);
        if (!result) return;

        const row = result.feedback;
        if (row) {
            if (row.set > set) sfx('lock');
            else if (row.broken > broken) sfx('deny');
            setLast(row);
            setSet(row.set);
            setBroken(row.broken);
        }
        if (result.done) finish(result);
    }

    async function expire() {
        if (outcome) return;
        const result = await forfeitMinigame<LockpickRow>();
        finish(result ?? { done: true, win: false });
    }

    function seek(clientX: number) {
        const box = barrel.current?.getBoundingClientRect();
        if (!box || box.width === 0 || outcome) return;
        setValue(Math.round(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * 100));
    }

    const feel = last?.feel ?? 0;

    return (
        <MinigamePanel
            title={t('minigames.lockpick', 'Lockpick')}
            headline={t('minigames.feelForTheGive', 'Feel for the give')}
            sub={t('minigames.pinsSet', '{set} of {total} pins set', { set, total: options.pins })}
            score={{ label: t('minigames.statBroken', 'Picks broken'), value: String(broken) }}
            seconds={options.time}
            total={options.breaks}
            left={Math.max(0, options.breaks - broken)}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            meta={
                <button
                    type="button"
                    disabled={busy || outcome !== null}
                    onClick={() => { void turn(); }}
                    className="rounded-full px-9 py-2.5 text-[15px] font-semibold text-white transition-opacity active:opacity-70 disabled:opacity-40"
                    style={{ backgroundColor: PANEL.accent }}
                >
                    {t('minigames.turnPick', 'Turn')}
                </button>
            }
        >
            <div className="flex flex-col gap-5" style={boardIn(200)}>
                <div className="flex items-end justify-center gap-[5px]">
                    {Array.from({ length: FEELS }, (_, i) => (
                        <span
                            key={i}
                            className="w-[15px] rounded-[3px] transition-all duration-200"
                            style={{
                                height:          `${18 + i * 10}px`,
                                backgroundColor: i < feel ? PANEL.accent : 'rgba(255,255,255,0.10)',
                                boxShadow:       i < feel ? glow(PANEL.accent) : undefined,
                            }}
                        />
                    ))}
                </div>

                <div className="flex flex-col gap-2.5">
                    <div className="text-center text-[30px] font-bold tabular-nums leading-none text-white">{value}</div>

                    <div
                        ref={barrel}
                        onPointerDown={e => {
                            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer gone */ }
                            seek(e.clientX);
                        }}
                        onPointerMove={e => { if (e.buttons === 1) seek(e.clientX); }}
                        className="relative h-[44px] cursor-pointer touch-none rounded-[12px]"
                        style={{ backgroundColor: SURFACE.sunken, boxShadow: `inset 0 0 0 1px ${SURFACE.hair}` }}
                    >
                        <span
                            className="absolute bottom-[7px] top-[7px] w-[5px] -translate-x-1/2 rounded-full"
                            style={{ left: `${value}%`, backgroundColor: PANEL.accent, boxShadow: glow(PANEL.accent) }}
                        />
                    </div>

                    {last && !last.set && (
                        <p className={`${panelEyebrow} text-center text-white/45`}>
                            {last.above
                                ? t('minigames.easeBack', 'Ease back')
                                : t('minigames.pushOn', 'Push on')}
                        </p>
                    )}
                </div>

                <div className="flex justify-center gap-2">
                    {Array.from({ length: options.pins }, (_, i) => (
                        <span
                            key={i}
                            className="h-[9px] w-[28px] rounded-full transition-colors duration-300"
                            style={{ backgroundColor: i < set ? PANEL.win : 'rgba(255,255,255,0.14)' }}
                        />
                    ))}
                </div>
            </div>
        </MinigamePanel>
    );
}
