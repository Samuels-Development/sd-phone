import { useCallback, useEffect, useRef, useState } from 'react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { COLS, RANK, ROWS, scoreGuess } from './engine';
import type { Cell } from './engine';
import { wordForGame } from './words';
import { useCountdown } from '@/hooks/useCountdown';
import { useKeyboardCapture } from '@/hooks/useKeyboardCapture';
import { useDeckActive } from '@/shell/deckActive';
import { TIME_LIMIT } from './stats';
import { emptyProgress, type CoopState, type Progress } from './coopTypes';
import { moveApi } from '@/apps/_games/onlineApi';
import { MatchView } from './MatchView';
import { ResultsView } from './ResultsView';
import { t } from '@/i18n';

type Pal = Record<string, string>;

function decide(you: Progress, opp: Progress): 'win' | 'loss' | 'draw' {
    if (you.solved !== opp.solved) return you.solved ? 'win' : 'loss';
    if (!you.solved) return 'draw';
    if (you.tries !== opp.tries) return you.tries < opp.tries ? 'win' : 'loss';
    if (you.finishMs !== opp.finishMs) return you.finishMs < opp.finishMs ? 'win' : 'loss';
    return 'draw';
}

export function OnlineMatch({ pal, dk, gameId, opponent, pot, oppLeft, onResult, onRematch, onMenu, rematchDisabled }: {
    pal: Pal; dk: boolean; gameId: string; opponent: string; pot: number; oppLeft: boolean;
    onResult: (r: 'win' | 'loss' | 'draw') => void; onRematch: () => void; onMenu: () => void; rematchDisabled: boolean;
}) {
    const wordRef = useRef<string>();
    if (!wordRef.current) wordRef.current = wordForGame(gameId);
    const word = wordRef.current;

    const startRef = useRef(0);
    if (startRef.current === 0) startRef.current = Date.now();

    const [me, setMe]   = useState<Progress>(() => emptyProgress());
    const [opp, setOpp] = useState<Progress>(() => emptyProgress());
    const [current, setCurrent]   = useState('');
    const [phase, setPhase]   = useState<'playing' | 'results'>('playing');
    const [result, setResult] = useState<'win' | 'loss' | 'draw'>('draw');

    const meRef = useRef(me); meRef.current = me;
    const currentRef = useRef(current); currentRef.current = current;
    const resolvedRef = useRef(false);
    const myDone = me.solved || me.failed;
    const timeLeft = useCountdown(TIME_LIMIT, phase === 'playing' && !myDone);

    const sendSnapshot = useCallback((p: Progress) => {
        moveApi(gameId, { rows: p.rows, solved: p.solved, failed: p.failed, tries: p.tries, finishMs: p.finishMs === Infinity ? 0 : p.finishMs });
    }, [gameId]);

    useNuiEvent('wordle:move', useCallback((d: { gameId: string; move: { rows: string[][]; solved: boolean; failed: boolean; tries: number; finishMs: number } }) => {
        const m = d?.move; if (!m) return;
        const rows = (Array.isArray(m.rows) ? m.rows : []) as Cell[][];
        setOpp({
            rows, guesses: rows.map(() => ''),
            solved: !!m.solved, failed: !!m.failed,
            tries: m.tries ?? 0,
            finishMs: (m.solved || m.failed) ? (m.finishMs || 0) : Infinity,
        });
    }, []));

    const submit = useCallback((guess: string) => {
        const cur = meRef.current;
        if (cur.solved || cur.failed) return;
        const g = guess.toUpperCase();
        if (g.length !== COLS) return;
        const rows = [...cur.rows, scoreGuess(g, word)];
        const solved = g === word;
        const failed = !solved && rows.length >= ROWS;
        const next: Progress = {
            rows, guesses: [...cur.guesses, g], solved, failed,
            tries: solved || failed ? rows.length : 0,
            finishMs: solved || failed ? Date.now() - startRef.current : Infinity,
        };
        setMe(next); setCurrent('');
        sendSnapshot(next);
    }, [word, sendSnapshot]);

    const onKey = useCallback((k: string) => {
        if (phase !== 'playing' || meRef.current.solved || meRef.current.failed) return;
        if (k === 'ENTER') { if (currentRef.current.length === COLS) submit(currentRef.current); return; }
        if (k === 'BACK')  { setCurrent(c => c.slice(0, -1)); return; }
        if (/^[A-Z]$/.test(k)) setCurrent(c => (c.length < COLS ? c + k : c));
    }, [phase, submit]);

    // See SoloGame: this view types without a text field, so it claims the keyboard.
    useKeyboardCapture();

    // Only listen while foreground - see SoloGame. A backgrounded but still-mounted match
    // would keep preventDefault()-ing every key and starve text fields in other apps.
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

    useEffect(() => {
        if (timeLeft !== 0) return;
        const cur = meRef.current;
        if (cur.solved || cur.failed) return;
        const next: Progress = { ...cur, failed: true, tries: cur.rows.length, finishMs: Date.now() - startRef.current };
        setMe(next); sendSnapshot(next);
    }, [timeLeft, sendSnapshot]);

    useEffect(() => {
        if (resolvedRef.current || phase !== 'playing') return;
        if (oppLeft) {
            resolvedRef.current = true;
            setOpp(o => (o.solved || o.failed) ? o : { ...o, failed: true, tries: o.rows.length });
            setResult('win'); setPhase('results'); onResult('win');
            return;
        }
        const meDone = me.solved || me.failed;
        const oppDone = opp.solved || opp.failed;
        if (meDone && oppDone) {
            resolvedRef.current = true;
            const r = decide(me, opp);
            setResult(r); setPhase('results'); onResult(r);
        }
    }, [me, opp, oppLeft, phase, onResult]);

    const keyStates: Record<string, Cell> = {};
    me.guesses.forEach((g, gi) => {
        const sc = me.rows[gi]; if (!sc) return;
        for (let i = 0; i < COLS; i++) {
            const ch = g[i]; if (!ch) continue;
            if (RANK[sc[i]] > RANK[keyStates[ch] ?? 'empty']) keyStates[ch] = sc[i];
        }
    });

    const state: CoopState = {
        phase, word, startMs: startRef.current,
        players: [{ id: 'you', name: t('wordle.you', 'You'), you: true }, { id: 'opp', name: opponent }],
        progress: { you: me, opp },
    };

    const outcome = result === 'win'
        ? { text: pot > 0 ? t('wordle.youWonAmount', 'You won ${amount}', { amount: pot.toLocaleString('en-US') }) : t('wordle.youWin', 'You win!'), color: pal.correct }
        : result === 'loss'
            ? { text: t('wordle.youLose', 'You lose'), color: pal.danger }
            : { text: pot > 0 ? t('wordle.drawRefunded', 'Draw, wager refunded') : t('wordle.itsADraw', "It's a draw"), color: pal.sub };

    if (phase === 'results') {
        return <ResultsView pal={pal} dk={dk} state={state} outcome={outcome} onRematch={onRematch} onMenu={onMenu} rematchDisabled={rematchDisabled} />;
    }
    return <MatchView pal={pal} state={state} you={me} youDone={myDone} input={current} timeLeft={timeLeft} low={timeLeft <= 15} keyStates={keyStates} onKey={onKey} />;
}
