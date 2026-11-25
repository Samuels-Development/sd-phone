import { Clock, Delete } from 'lucide-react';

import { COLS, KEY_ROWS, ROWS } from './engine';
import type { Cell } from './engine';
import type { CoopState, Progress } from './coopTypes';
import { t } from '@/i18n';
import { formatDuration } from '@/lib/time';

type Pal = Record<string, string>;
const mmss = (sec: number) => formatDuration(sec);

const TILE = 37;

export function MatchView({ pal, state, you, youDone, input, timeLeft, low, keyStates, notice, onKey }: {
    pal: Pal; state: CoopState; you: Progress | undefined; youDone: boolean; input: string;
    timeLeft: number; low: boolean; keyStates: Record<string, Cell>; notice: string | null; onKey: (k: string) => void;
}) {
    const oppPlayer = state.players.find(p => !p.you);
    const opp = oppPlayer ? state.progress[oppPlayer.id] : undefined;

    function boardCell(c: Cell): { bg: string; bd: string; fg: string } {
        switch (c) {
            case 'correct': return { bg: pal.correct, bd: pal.correct, fg: '#fff' };
            case 'present': return { bg: pal.present, bd: pal.present, fg: '#fff' };
            case 'absent':  return { bg: pal.absent,  bd: pal.absent,  fg: '#fff' };
            case 'tbd':     return { bg: 'transparent', bd: pal.borderLit, fg: pal.text };
            default:        return { bg: 'transparent', bd: pal.border, fg: pal.text };
        }
    }
    function keyCol(c: Cell | undefined): { bg: string; fg: string } {
        if (c === 'correct') return { bg: pal.correct, fg: '#fff' };
        if (c === 'present') return { bg: pal.present, fg: '#fff' };
        if (c === 'absent')  return { bg: pal.absent,  fg: '#fff' };
        return { bg: pal.keyBg, fg: pal.keyText };
    }

    function grid(rows: Cell[][], opts?: { guesses: string[]; input: string }) {
        return (
            <div className="flex flex-col gap-[4px]">
                {Array.from({ length: ROWS }).map((_, r) => {
                    const submitted = r < rows.length;
                    const isCurrent = !!opts && !youDone && r === rows.length;
                    const word = opts ? (submitted ? opts.guesses[r] : isCurrent ? opts.input : '') : '';
                    return (
                        <div key={r} className="flex gap-[4px]">
                            {Array.from({ length: COLS }).map((__, c) => {
                                const letter = word[c] ?? '';
                                const st: Cell = submitted ? rows[r][c] : letter ? 'tbd' : 'empty';
                                const col = boardCell(st);
                                return (
                                    <div key={c} className="flex items-center justify-center font-bold"
                                        style={{ width: TILE, height: TILE, fontSize: 18, borderRadius: 6, color: col.fg, backgroundColor: col.bg, border: `2px solid ${col.bd}` }}>
                                        {letter}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        );
    }

    function statusLine(pr: Progress | undefined) {
        if (pr?.solved) return { text: t('wordle.solvedTries', 'solved {tries}', { tries: pr.tries }), color: pal.correct };
        if (pr?.failed) return { text: t('wordle.failed', 'failed'), color: pal.danger };
        return { text: `${pr?.rows.length ?? 0}/6`, color: pal.sub };
    }
    const youStatus = statusLine(you);
    const oppStatus = statusLine(opp);

    return (
        <div className="flex flex-1 flex-col">
            <div className="flex shrink-0 justify-center pt-2 pb-1.5">
                <div className="flex items-center gap-1.5 rounded-full px-3 py-1" style={{ backgroundColor: low ? 'rgba(224,65,59,0.14)' : pal.track, color: low ? pal.danger : pal.sub }}>
                    <Clock className="h-[14px] w-[14px]" strokeWidth={2.5} />
                    <span className="text-[14px] font-bold tabular-nums">{mmss(timeLeft)}</span>
                </div>
            </div>

            <div dir="ltr" className="flex flex-1 items-center justify-center gap-3 px-3">
                <div className="flex flex-col items-center gap-1.5">
                    <span className="max-w-[190px] truncate text-[12px] font-bold" style={{ color: pal.text }}>{t('wordle.you', 'You')}</span>
                    {grid(you?.rows ?? [], { guesses: you?.guesses ?? [], input })}
                    <span className="text-[11px] font-semibold" style={{ color: youStatus.color }}>{youStatus.text}</span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                    <span dir="auto" className="max-w-[190px] truncate text-[12px] font-bold" style={{ color: pal.text }}>{oppPlayer?.name.split(' ')[0] ?? t('wordle.opponent', 'Opponent')}</span>
                    {grid(opp?.rows ?? [])}
                    <span className="text-[11px] font-semibold" style={{ color: oppStatus.color }}>{oppStatus.text}</span>
                </div>
            </div>

            {(youDone || notice) && (
                <div className="flex shrink-0 flex-col items-center px-5 pb-2">
                    <div className="text-[14px] font-semibold" style={{ color: notice ? pal.danger : pal.sub }}>
                        {notice
                            ?? (you?.solved ? t('wordle.solvedWaiting', 'Solved in {tries}! Waiting on your opponent.', { tries: you.tries })
                            : you?.failed ? t('wordle.outOfGuessesWaiting', 'Out of guesses. Waiting on your opponent.')
                            : t('wordle.timeUpWaiting', "Time's up! Waiting for the result."))}
                    </div>
                </div>
            )}

            <div dir="ltr" className="flex shrink-0 flex-col gap-[6px] px-1.5" style={{ paddingBottom: 44 }}>
                {KEY_ROWS.map((row, ri) => (
                    <div key={ri} className="flex justify-center gap-[5px]">
                        {row.map(k => {
                            const wide = k === 'ENTER' || k === 'BACK';
                            const kc = wide ? { bg: pal.keyBg, fg: pal.keyText } : keyCol(keyStates[k]);
                            return (
                                <button key={k} type="button" onPointerDown={() => onKey(k)}
                                    className="flex items-center justify-center font-bold active:opacity-70"
                                    style={{ height: 50, flex: wide ? '1.5 1 0%' : '1 1 0%', maxWidth: wide ? 64 : 40, borderRadius: 6, backgroundColor: kc.bg, color: kc.fg, fontSize: wide ? 11 : 17, transition: 'background-color 0.18s' }}
                                    aria-label={k === 'BACK' ? t('wordle.backspace', 'Backspace') : k === 'ENTER' ? t('wordle.enter', 'Enter') : k}>
                                    {k === 'BACK' ? <Delete className="h-[20px] w-[20px]" strokeWidth={2.3} /> : k}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
