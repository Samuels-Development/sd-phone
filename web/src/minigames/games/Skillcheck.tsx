import { useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, panelSub, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type SkillcheckOptions, type SkillcheckRow } from '../data';

const SETTLE_MS = 1900;
const KEYS = ['A', 'S', 'D', 'F'];
const R = 78;
const CIRC = 2 * Math.PI * R;

const DEFAULTS: SkillcheckOptions = { rounds: 3, period: 1500, window: 15, shrink: 82, time: 25 };

export function Skillcheck({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const gates = useMemo(() => start.puzzle?.gates ?? [], [start.puzzle]);

    const [cleared, setCleared] = useState(0);
    const [flash, setFlash]     = useState<'hit' | 'miss' | null>(null);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [busy, setBusy]       = useState(false);
    const openedAt = useRef(Date.now());

    function finish(result: MinigameResult<SkillcheckRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function press(key: number) {
        if (busy || outcome) return;
        setBusy(true);
        const result = await answerMinigame<SkillcheckRow>({ at: Date.now() - openedAt.current, key });
        setBusy(false);
        if (!result) return;

        const row = result.feedback;
        if (row) {
            setCleared(row.cleared);
            setFlash(row.caught ? 'hit' : 'miss');
            sfx(row.caught ? 'lock' : 'deny');
            window.setTimeout(() => setFlash(null), 300);
        }
        if (result.done) finish(result);
    }

    async function expire() {
        if (outcome) return;
        const result = await forfeitMinigame<SkillcheckRow>();
        finish(result ?? { done: true, win: false });
    }

    const index = Math.min(cleared, Math.max(0, gates.length - 1));
    const gate = gates[index] ?? { at: 0.5, key: 1 };
    const width = Math.max(0.04, (options.window / 100) * Math.pow(options.shrink / 100, index));
    const tone = flash === 'hit' ? PANEL.win : flash === 'miss' ? PANEL.fail : PANEL.accent;

    return (
        <MinigamePanel
            title={t('minigames.skillcheck', 'Skill check')}
            headline={t('minigames.hitTheGate', 'Hit {key} in the gate', { key: KEYS[gate.key - 1] ?? 'A' })}
            sub={t('minigames.gatesCleared', '{hits} of {total} cleared', { hits: cleared, total: options.rounds })}
            seconds={options.time}
            total={options.rounds}
            left={cleared}
            score={{ label: t('minigames.statGates', 'Gates cleared'), value: String(cleared) }}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            meta={
                <div className="flex gap-2.5">
                    {KEYS.map((label, i) => (
                        <button
                            key={label}
                            type="button"
                            disabled={busy || outcome !== null}
                            onClick={() => { void press(i + 1); }}
                            className="flex h-[52px] w-[52px] items-center justify-center rounded-[15px] text-[19px] font-bold transition-all duration-150 active:scale-[0.92]"
                            style={i + 1 === gate.key
                                ? { backgroundColor: `${tone}2E`, boxShadow: `inset 0 0 0 1.5px ${tone}`, color: '#fff' }
                                : { ...tileFace, color: 'rgba(255,255,255,0.55)' }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            }
        >
            <div className="flex justify-center" style={boardIn(200)}>
                <svg width={196} height={196} viewBox="0 0 196 196">
                    <circle cx="98" cy="98" r={R} fill="none" stroke={SURFACE.sunken} strokeWidth="16" />
                    <circle cx="98" cy="98" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="16" />
                    <circle
                        cx="98"
                        cy="98"
                        r={R}
                        fill="none"
                        stroke={tone}
                        strokeWidth="16"
                        strokeLinecap="round"
                        strokeDasharray={`${CIRC * width} ${CIRC}`}
                        strokeDashoffset={-CIRC * (gate.at - width / 2)}
                        transform="rotate(-90 98 98)"
                        style={{ transition: 'stroke 200ms ease-out' }}
                    />
                    {!outcome && (
                        <g style={{ transformOrigin: '98px 98px', animation: `mg-spin ${options.period}ms linear infinite` }}>
                            <line x1="98" y1="98" x2="98" y2="12" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
                            <circle cx="98" cy="14" r="5" fill="#FFFFFF" />
                        </g>
                    )}
                    <circle cx="98" cy="98" r="6" fill={tone} />
                </svg>
            </div>

            <p className={`${panelSub} text-center`}>
                {t('minigames.gateNarrows', 'The gate narrows each time')}
            </p>
        </MinigamePanel>
    );
}
