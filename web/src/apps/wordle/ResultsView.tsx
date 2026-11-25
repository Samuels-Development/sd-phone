import { Check, Crown, X } from 'lucide-react';

import { COLS, ROWS } from './engine';
import type { Cell } from './engine';
import { ranked, type CoopState } from './coopTypes';
import { t } from '@/i18n';

type Pal = Record<string, string>;
const tileBg = (c: Cell | undefined, pal: Pal) => (c === 'correct' ? pal.correct : c === 'present' ? pal.present : c === 'absent' ? pal.absent : 'transparent');

export function ResultsView({ pal, dk, state, outcome, onRematch, onMenu, rematchDisabled }: {
    pal: Pal; dk: boolean; state: CoopState; outcome: { text: string; color: string };
    onRematch: () => void; onMenu: () => void; rematchDisabled: boolean;
}) {
    const rows = ranked(state);
    const medal = ['#E8B923', '#AEB4BD', '#CD7F32'];
    return (
        <div className="flex flex-1 flex-col px-4 pt-3 pb-7">
            <div className="mb-1 text-center text-[20px] font-extrabold" style={{ color: outcome.color }}>{outcome.text}</div>
            {state.word && (
                <div className="mb-2.5 text-center text-[14px] font-semibold" style={{ color: pal.sub }}>
                    {t('wordle.theWordWas', 'The word was')} <span dir="ltr" style={{ color: pal.correct }}>{state.word}</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="flex flex-col gap-3">
                    {rows.map(({ player, prog }, i) => {
                        const rank = i + 1;
                        const top = rank <= 3 && prog.solved;
                        return (
                            <div key={player.id} className="flex items-center gap-3.5 rounded-2xl px-4 py-3.5" style={{ backgroundColor: player.you ? pal.correct : pal.track }}>
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px] font-extrabold" style={{ backgroundColor: top ? medal[rank - 1] : (dk ? '#3A3A3C' : '#C9CDD2'), color: '#fff' }}>
                                    {rank === 1 && prog.solved ? <Crown className="h-[18px] w-[18px]" strokeWidth={2.5} /> : rank}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div dir="auto" className="truncate text-[18px] font-bold" style={{ color: player.you ? '#fff' : pal.text }}>{player.name}</div>
                                    <div className="mt-0.5 flex items-center gap-1 text-[13.5px] font-semibold" style={{ color: player.you ? 'rgba(255,255,255,0.9)' : (prog.solved ? pal.correct : pal.danger) }}>
                                        {prog.solved
                                            ? <><Check className="h-[14px] w-[14px]" strokeWidth={3} /> {prog.tries} {prog.tries === 1 ? t('wordle.try', 'try') : t('wordle.tries', 'tries')} · {Math.round(prog.finishMs / 1000)}s</>
                                            : <><X className="h-[14px] w-[14px]" strokeWidth={3} /> {t('wordle.didNotSolve', 'Did not solve')}</>}
                                    </div>
                                </div>
                                <div dir="ltr" className="flex shrink-0 flex-col gap-[3px]">
                                    {Array.from({ length: ROWS }).map((_, r) => {
                                        const row = prog.rows[r];
                                        return (
                                            <div key={r} className="flex gap-[3px]">
                                                {Array.from({ length: COLS }).map((__, c) => {
                                                    const cell = row?.[c];
                                                    return <div key={c} style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: cell ? tileBg(cell, pal) : 'transparent', border: cell ? 'none' : `1px solid ${player.you ? 'rgba(255,255,255,0.4)' : pal.border}` }} />;
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-3 flex gap-2.5">
                <button type="button" onClick={onMenu} className="flex-1 rounded-2xl py-3.5 text-[15px] font-bold active:opacity-80" style={{ backgroundColor: pal.track, color: pal.text }}>{t('wordle.menu', 'Menu')}</button>
                <button type="button" onClick={onRematch} disabled={rematchDisabled} className="flex-1 rounded-2xl py-3.5 text-[15px] font-bold text-white active:opacity-80" style={{ backgroundColor: pal.correct, opacity: rematchDisabled ? 0.5 : 1 }}>{t('wordle.rematch', 'Rematch')}</button>
            </div>
        </div>
    );
}
