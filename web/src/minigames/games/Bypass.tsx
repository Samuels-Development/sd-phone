import { useMemo, useState } from 'react';

import { Keypad } from '@/ui/Keypad';
import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, glow, panelEyebrow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { bypassOptions, type BypassRow, type GameProps, type MinigameOutcome, type MinigameResult } from '../data';

const SETTLE_MS = 1900;

function Row({ row, digits, dim }: { row: BypassRow; digits: number; dim: number }) {
    return (
        <div className="flex items-center justify-between gap-3" style={{ opacity: dim }}>
            <div className="flex items-center gap-1.5">
                {Array.from({ length: digits }, (_, i) => (
                    <span
                        key={i}
                        className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[15px] font-semibold tabular-nums text-white"
                        style={tileFace}
                    >
                        {row.guess[i]}
                    </span>
                ))}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-[5px]">
                {Array.from({ length: row.exact }, (_, i) => (
                    <span key={`e${i}`} className="h-[9px] w-[9px] rounded-full" style={{ backgroundColor: PANEL.accent }} />
                ))}
                {Array.from({ length: row.present }, (_, i) => (
                    <span
                        key={`p${i}`}
                        className="h-[9px] w-[9px] rounded-full"
                        style={{ boxShadow: `inset 0 0 0 1.5px ${PANEL.accent}` }}
                    />
                ))}
            </div>
        </div>
    );
}

export function Bypass({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => bypassOptions(start.options), [start.options]);

    const [entry, setEntry]     = useState<number[]>([]);
    const [rows, setRows]       = useState<BypassRow[]>([]);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [reveal, setReveal]   = useState<number[] | null>(null);
    const [busy, setBusy]       = useState(false);

    function finish(result: MinigameResult<BypassRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        setReveal(result.reveal ?? null);
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function submit(code: number[]) {
        if (busy || outcome) return;
        setBusy(true);
        const result = await answerMinigame<BypassRow>(code);
        setBusy(false);
        setEntry([]);
        if (!result) return;
        if (result.feedback) setRows(prev => [...prev, result.feedback as BypassRow]);
        if (result.feedback && !result.done) sfx(result.feedback.exact > 0 ? 'lock' : 'deny');
        if (result.done) finish(result);
    }

    async function expire() {
        if (outcome) return;
        const result = await forfeitMinigame<BypassRow>();
        finish(result ?? { done: true, win: false });
    }

    function press(digit: string) {
        if (busy || outcome || entry.length >= options.digits) return;
        const next = [...entry, Number(digit)];
        setEntry(next);
        if (next.length === options.digits) void submit(next);
    }

    return (
        <MinigamePanel
            title={t('minigames.bypass', 'Bypass')}
            headline={t('minigames.enterCode', 'Crack the code')}
            sub={t('minigames.guessesLeft', '{n} guesses left', { n: options.attempts - rows.length })}
            score={{ label: t('minigames.statGuesses', 'Guesses'), value: String(rows.length) }}
            seconds={options.time}
            total={options.attempts}
            left={options.attempts - rows.length}
            outcome={outcome}
            outcomeLabel={outcome === 'lose' && reveal
                ? t('minigames.codeWas', 'Code was {code}', { code: reveal.join(' ') })
                : undefined}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            footer={
                <Keypad
                    variant="digits"
                    onPress={press}
                    onDelete={() => setEntry(prev => prev.slice(0, -1))}
                    canDelete={entry.length > 0}
                />
            }
        >
            <div className="flex flex-col gap-2.5" style={boardIn(200)}>
                <p className={`${panelEyebrow} text-center text-white/35`} style={{ visibility: rows.length === 0 ? 'visible' : 'hidden' }}>
                    {t('minigames.bypassLegend', 'Filled = right slot · Ring = wrong slot')}
                </p>

                {rows.map((row, i) => (
                    <Row
                        key={i}
                        row={row}
                        digits={options.digits}
                        dim={Math.max(0.4, 1 - 0.16 * (rows.length - 1 - i))}
                    />
                ))}

                <div className="flex items-center justify-center gap-2.5 pt-1">
                    {Array.from({ length: options.digits }, (_, i) => {
                        const filled = entry[i] !== undefined;
                        return (
                            <span
                                key={i}
                                className="flex h-[42px] w-[42px] items-center justify-center rounded-[12px] text-[19px] font-semibold tabular-nums text-white transition-all duration-150"
                                style={filled
                                    ? { backgroundColor: PANEL.accent, boxShadow: glow(PANEL.accent) }
                                    : { backgroundColor: SURFACE.sunken, boxShadow: `inset 0 0 0 1px ${SURFACE.hair}` }}
                            >
                                {filled ? entry[i] : ''}
                            </span>
                        );
                    })}
                </div>
            </div>
        </MinigamePanel>
    );
}
