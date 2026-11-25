import { useCallback, useEffect, useRef, useState } from 'react';

import { COLS, RANK } from './engine';
import type { Cell } from './engine';
import { useCountdown } from '@/hooks/useCountdown';
import { useKeyboardCapture } from '@/hooks/useKeyboardCapture';
import { useDeckActive } from '@/shell/deckActive';
import { emptyProgress, type CoopState, type Progress } from './coopTypes';
import { moveApi } from '@/apps/_games/onlineApi';
import { useGameEvent, type OnlineResult } from '@/apps/_games/useOnlineLobby';
import { MatchView } from './MatchView';
import { ResultsView } from './ResultsView';
import { t } from '@/i18n';

type Pal = Record<string, string>;

interface GuessView { side: string; guess?: string; row: Cell[]; solved: boolean; failed: boolean; tries: number }
interface FinalProgress { rows: Cell[][]; solved: boolean; failed: boolean; tries: number; finishMs: number }
interface WordleReveal { word?: string; progress?: Record<string, FinalProgress> }

function settle(local: Progress, final: FinalProgress | undefined): Progress {
    if (!final) return local.solved || local.failed ? local : { ...local, failed: true, tries: local.rows.length };
    return { ...local, rows: final.rows, solved: final.solved, failed: final.failed, tries: final.tries, finishMs: final.finishMs };
}

export function OnlineMatch({ pal, dk, gameId, side, timeLimit, opponent, pot, verdict, oppLeft, reveal, onRematch, onMenu, rematchDisabled }: {
    pal: Pal; dk: boolean; gameId: string; side: string; timeLimit: number; opponent: string; pot: number;
    verdict: OnlineResult | null; oppLeft: boolean; reveal: unknown; onRematch: () => void; onMenu: () => void; rematchDisabled: boolean;
}) {
    const [me, setMe]   = useState<Progress>(() => emptyProgress());
    const [opp, setOpp] = useState<Progress>(() => emptyProgress());
    const [current, setCurrent] = useState('');
    const [pending, setPending] = useState(false);
    const [notice, setNotice]   = useState<string | null>(null);

    const meRef = useRef(me); meRef.current = me;
    const currentRef = useRef(current); currentRef.current = current;
    const pendingRef = useRef(pending); pendingRef.current = pending;

    const phase: 'playing' | 'results' = verdict || oppLeft ? 'results' : 'playing';
    const myDone = me.solved || me.failed;
    const timeLeft = useCountdown(timeLimit, phase === 'playing' && !myDone);
    const timeUp = timeLeft === 0;

    useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(null), 1600); return () => clearTimeout(id); }, [notice]);

    useGameEvent('wordle:move', useCallback((d: { gameId: string; move: GuessView }) => {
        const m = d?.move;
        if (!m || d.gameId !== gameId || !Array.isArray(m.row)) return;
        const apply = (p: Progress, guess: string): Progress => ({
            rows: [...p.rows, m.row], guesses: [...p.guesses, guess],
            solved: !!m.solved, failed: !!m.failed, tries: m.tries ?? 0, finishMs: p.finishMs,
        });
        if (m.side === side) {
            setMe(p => apply(p, m.guess ?? ''));
            setCurrent('');
            setPending(false);
        } else {
            setOpp(p => apply(p, ''));
        }
    }, [gameId, side]));

    const submit = useCallback((guess: string) => {
        if (pendingRef.current) return;
        const g = guess.toUpperCase();
        setPending(true);
        void moveApi(gameId, { guess: g }).then(r => {
            if (r.ok) return;
            setPending(false);
            setNotice(r.message ?? t('wordle.guessRefused', 'That guess did not count'));
        });
    }, [gameId]);

    const onKey = useCallback((k: string) => {
        if (phase !== 'playing' || timeUp || pendingRef.current || meRef.current.solved || meRef.current.failed) return;
        if (k === 'ENTER') { if (currentRef.current.length === COLS) submit(currentRef.current); return; }
        if (k === 'BACK')  { setCurrent(c => c.slice(0, -1)); return; }
        if (/^[A-Z]$/.test(k)) setCurrent(c => (c.length < COLS ? c + k : c));
    }, [phase, timeUp, submit]);

    useKeyboardCapture();

    const deckActive = useDeckActive();
    const keyRef = useRef(onKey); keyRef.current = onKey;
    useEffect(() => {
        if (!deckActive) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === 'Enter') { e.preventDefault(); keyRef.current('ENTER'); }
            else if (e.key === 'Backspace') { e.preventDefault(); keyRef.current('BACK'); }
            else { const c = e.key.toUpperCase(); if (/^[A-Z]$/.test(c)) { e.preventDefault(); keyRef.current(c); } }
        }
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [deckActive]);

    const keyStates: Record<string, Cell> = {};
    me.guesses.forEach((g, gi) => {
        const sc = me.rows[gi]; if (!sc) return;
        for (let i = 0; i < COLS; i++) {
            const ch = g[i]; if (!ch) continue;
            if (RANK[sc[i]] > RANK[keyStates[ch] ?? 'empty']) keyStates[ch] = sc[i];
        }
    });

    const final = (reveal ?? verdict?.reveal) as WordleReveal | undefined;
    const oppSide = Object.keys(final?.progress ?? {}).find(s => s !== side);
    const shownMe  = phase === 'results' ? settle(me, final?.progress?.[side]) : me;
    const shownOpp = phase === 'results' ? settle(opp, oppSide ? final?.progress?.[oppSide] : undefined) : opp;

    const state: CoopState = {
        phase, word: final?.word ?? '', startMs: 0,
        players: [{ id: 'you', name: t('wordle.you', 'You'), you: true }, { id: 'opp', name: opponent }],
        progress: { you: shownMe, opp: shownOpp },
    };

    const result: 'win' | 'loss' | 'draw' = oppLeft ? 'win' : !verdict?.winner ? 'draw' : verdict.winner === side ? 'win' : 'loss';
    const outcome = result === 'win'
        ? { text: pot > 0 ? t('wordle.youWonAmount', 'You won ${amount}', { amount: pot.toLocaleString('en-US') }) : t('wordle.youWin', 'You win!'), color: pal.correct }
        : result === 'loss'
            ? { text: t('wordle.youLose', 'You lose'), color: pal.danger }
            : { text: pot > 0 ? t('wordle.drawRefunded', 'Draw, wager refunded') : t('wordle.itsADraw', "It's a draw"), color: pal.sub };

    if (phase === 'results') {
        return <ResultsView pal={pal} dk={dk} state={state} outcome={outcome} onRematch={onRematch} onMenu={onMenu} rematchDisabled={rematchDisabled} />;
    }
    return <MatchView pal={pal} state={state} you={me} youDone={myDone || timeUp} input={current} timeLeft={timeLeft} low={timeLeft <= 15} keyStates={keyStates} notice={notice} onKey={onKey} />;
}
