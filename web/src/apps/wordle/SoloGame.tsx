import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, Delete } from 'lucide-react';

import { COLS, KEY_ROWS, RANK, ROWS, scoreGuess } from './engine';
import type { Cell } from './engine';
import { randomWord } from './words';
import { useCountdown } from '@/hooks/useCountdown';
import { useKeyboardCapture } from '@/hooks/useKeyboardCapture';
import { TIME_LIMIT } from './stats';
import { t } from '@/i18n';
import { formatDuration } from '@/lib/time';

type Pal = Record<string, string>;
const mmss = (sec: number) => formatDuration(sec);

export function SoloGame({ pal, onFinish, onNew }: {
    pal: Pal;
    onFinish: (won: boolean) => void;
    onNew: () => void;
}) {
    const [answer] = useState(() => randomWord());
    const [guesses, setGuesses] = useState<string[]>([]);
    const [current, setCurrent] = useState('');
    const [status,  setStatus]  = useState<'playing' | 'won' | 'lost'>('playing');
    const timeLeft = useCountdown(TIME_LIMIT, status === 'playing');
    const [shake,   setShake]   = useState(false);
    const [revealRow, setRevealRow] = useState<number | null>(null);

    const shakeTimer = useRef<ReturnType<typeof setTimeout>>();
    const finishedRef = useRef(false);

    const done = useCallback((won: boolean) => {
        if (finishedRef.current) return;
        finishedRef.current = true;
        onFinish(won);
    }, [onFinish]);

    const keyStates: Record<string, Cell> = {};
    for (const g of guesses) {
        const score = scoreGuess(g, answer);
        for (let i = 0; i < COLS; i++) {
            const ch = g[i];
            if (RANK[score[i]] > RANK[keyStates[ch] ?? 'empty']) keyStates[ch] = score[i];
        }
    }

    const triggerShake = useCallback(() => {
        setShake(true);
        clearTimeout(shakeTimer.current);
        shakeTimer.current = setTimeout(() => setShake(false), 420);
    }, []);

    const submit = useCallback(() => {
        if (current.length !== COLS) { triggerShake(); return; }
        const guess = current;
        const rowIdx = guesses.length;
        setGuesses(g => [...g, guess]);
        setCurrent('');
        setRevealRow(rowIdx);
        if (guess === answer) { setStatus('won'); done(true); }
        else if (rowIdx + 1 >= ROWS) { setStatus('lost'); done(false); }
    }, [current, guesses.length, answer, done, triggerShake]);

    const press = useCallback((k: string) => {
        if (status !== 'playing') return;
        if (k === 'ENTER') { submit(); return; }
        if (k === 'BACK')  { setCurrent(c => c.slice(0, -1)); return; }
        if (/^[A-Z]$/.test(k)) setCurrent(c => (c.length < COLS ? c + k : c));
    }, [status, submit]);

    // No text field to type into, so claim the keyboard explicitly - otherwise every
    // letter also reaches the game and fires inventory / weapon wheel / other binds.
    useKeyboardCapture();

    const pressRef = useRef(press); pressRef.current = press;
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Enter') { e.preventDefault(); pressRef.current('ENTER'); }
            else if (e.key === 'Backspace') { e.preventDefault(); pressRef.current('BACK'); }
            else { const c = e.key.toUpperCase(); if (/^[A-Z]$/.test(c)) { e.preventDefault(); pressRef.current(c); } }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    useEffect(() => {
        if (timeLeft === 0 && status === 'playing') { setStatus('lost'); done(false); }
    }, [timeLeft, status, done]);

    useEffect(() => () => clearTimeout(shakeTimer.current), []);

    function cellColor(state: Cell): { bg: string; bd: string; fg: string } {
        switch (state) {
            case 'correct': return { bg: pal.correct, bd: pal.correct, fg: '#FFFFFF' };
            case 'present': return { bg: pal.present, bd: pal.present, fg: '#FFFFFF' };
            case 'absent':  return { bg: pal.absent,  bd: pal.absent,  fg: '#FFFFFF' };
            case 'tbd':     return { bg: 'transparent', bd: pal.borderLit, fg: pal.text };
            default:        return { bg: 'transparent', bd: pal.border,    fg: pal.text };
        }
    }
    function keyColor(state: Cell | undefined): { bg: string; fg: string } {
        switch (state) {
            case 'correct': return { bg: pal.correct, fg: '#FFFFFF' };
            case 'present': return { bg: pal.present, fg: '#FFFFFF' };
            case 'absent':  return { bg: pal.absent,  fg: '#FFFFFF' };
            default:        return { bg: pal.keyBg,   fg: pal.keyText };
        }
    }

    const lowTime = timeLeft <= 15 && status === 'playing';

    return (
        <div className="flex flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-center pt-2">
                <div className="flex items-center gap-1.5 rounded-full px-3 py-1" style={{ backgroundColor: lowTime ? 'rgba(224,65,59,0.14)' : pal.track, color: lowTime ? pal.danger : pal.sub }}>
                    <Clock className="h-[14px] w-[14px]" strokeWidth={2.5} />
                    <span className="text-[15px] font-bold tabular-nums">{mmss(timeLeft)}</span>
                </div>
            </div>

            <div className="flex flex-1 items-center justify-center px-5">
                <div className="flex flex-col gap-[6px]">
                    {Array.from({ length: ROWS }).map((_, r) => {
                        const submitted = r < guesses.length;
                        const isCurrent = r === guesses.length && status === 'playing';
                        const word = submitted ? guesses[r] : isCurrent ? current : '';
                        const score = submitted ? scoreGuess(guesses[r], answer) : null;
                        const rowShake = isCurrent && shake;
                        return (
                            <div key={r} className="flex gap-[6px]" style={rowShake ? { animation: 'wordle-shake 0.42s ease-in-out' } : undefined}>
                                {Array.from({ length: COLS }).map((__, c) => {
                                    const letter = word[c] ?? '';
                                    const state2: Cell = submitted ? score![c] : letter ? 'tbd' : 'empty';
                                    const col = cellColor(state2);
                                    const filledNow = isCurrent && c === current.length - 1;
                                    const reveal = submitted && revealRow === r;
                                    return (
                                        <div key={c} className="flex items-center justify-center font-bold"
                                            style={{ width: 60, height: 60, fontSize: 30, borderRadius: 6, color: col.fg, backgroundColor: col.bg, border: `2px solid ${col.bd}`,
                                                animation: reveal ? `wordle-flip 0.5s ease forwards ${c * 0.1}s` : filledNow ? 'wordle-pop 0.12s ease' : undefined }}>
                                            {letter}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>

            {status !== 'playing' && (
                <div className="flex shrink-0 flex-col items-center px-5 pb-2" style={{ animation: 'wordle-banner-in 0.3s ease-out' }}>
                    <div className="text-[15px] font-semibold" style={{ color: pal.sub }}>
                        {status === 'won' ? t('wordle.solvedIt', 'Nice! You solved it.') : timeLeft === 0 ? t('wordle.timesUp', "Time's up!") : t('wordle.outOfGuesses', 'Out of guesses.')}
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                        <span className="text-[20px] font-extrabold tracking-[0.18em]" style={{ color: status === 'won' ? pal.correct : pal.text }}>{answer}</span>
                        <button type="button" onClick={onNew} className="rounded-full px-4 py-1.5 text-[14px] font-bold text-white active:opacity-80" style={{ backgroundColor: pal.correct }}>{t('wordle.newWord', 'New Word')}</button>
                    </div>
                </div>
            )}

            <div className="flex shrink-0 flex-col gap-[7px] px-1.5" style={{ paddingBottom: 44 }}>
                {KEY_ROWS.map((row, ri) => (
                    <div key={ri} className="flex justify-center gap-[5px]">
                        {row.map(k => {
                            const wide = k === 'ENTER' || k === 'BACK';
                            const kc = wide ? { bg: pal.keyBg, fg: pal.keyText } : keyColor(keyStates[k]);
                            return (
                                <button key={k} type="button" onPointerDown={() => press(k)}
                                    className="flex items-center justify-center font-bold active:opacity-70"
                                    style={{ height: 56, flex: wide ? '1.5 1 0%' : '1 1 0%', maxWidth: wide ? 64 : 42, borderRadius: 6, backgroundColor: kc.bg, color: kc.fg, fontSize: wide ? 12 : 18, transition: 'background-color 0.18s' }}
                                    aria-label={k === 'BACK' ? t('wordle.backspace', 'Backspace') : k === 'ENTER' ? t('wordle.enter', 'Enter') : k}>
                                    {k === 'BACK' ? <Delete className="h-[22px] w-[22px]" strokeWidth={2.3} /> : k}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}
