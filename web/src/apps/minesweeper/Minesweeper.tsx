import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bomb, ChevronLeft, Flag, Pickaxe, RotateCcw } from 'lucide-react';

import { t } from '@/i18n';
import { GameHeader } from '@/apps/_games/GameHeader';
import { ScoreStartScreen } from '@/apps/_games/ScoreStartScreen';
import { Leaderboard } from '@/apps/_games/Leaderboard';
import { GameOverCard } from '@/apps/_arcade/GameOverCard';
import { loadScoreboard, loadStats, submitScoreApi, type ScoreEntry } from '@/apps/_games/statsApi';
import { MinesweeperIcon } from '@/shell/AppIconSVG';
import { useDeckActive } from '@/shell/deckActive';

import {
    DIFFICULTIES, DIFFICULTY_ORDER, FLAGGED, REVEALED,
    chordAt, emptyBoard, flagAllMines, formatClock, isWon, minesLeft,
    revealAllMines, revealAt, safeCells, scoreFor, toggleFlag,
    type Board, type Difficulty,
} from './logic';

interface Props { onClose: () => void }

const GAME = 'minesweeper';
const ACCENT = '#E4483D';
const SB_H = 54;
const LONG_PRESS_MS = 320;
const MOVE_TOLERANCE = 12;

type Screen = 'menu' | 'game' | 'leaderboard';
type Phase = 'ready' | 'playing' | 'won' | 'lost';

const pal = {
    bg:     '#0F1116',
    bg2:    '#1C2029',
    grid:   '#262B36',
    accent: ACCENT,
    text:   '#F2F4F8',
    sub:    '#8D96A8',
};

const NUMBER_INK = ['', '#5AA9FF', '#5BD68A', '#FF7A70', '#B98BFF', '#FFB347', '#4FD8D8', '#FF9ED8', '#C9CEDA'];

const wrapStyle = { background: `radial-gradient(120% 90% at 50% 0%, ${pal.bg2} 0%, ${pal.bg} 62%)`, color: pal.text };

const BOARD_MAX_W = 392;
const BOARD_MAX_H = 470;

export function Minesweeper({ onClose: _onClose }: Props) {
    const [screen, setScreen] = useState<Screen>('menu');
    const [difficulty, setDifficulty] = useState<Difficulty>('easy');

    const [high, setHigh]   = useState(0);
    const [plays, setPlays] = useState(0);
    const [last, setLast]   = useState(0);
    const [isRecord, setIsRecord] = useState(false);
    const [lb, setLb] = useState<ScoreEntry[] | null>(null);
    const [lbLoading, setLbLoading] = useState(false);

    const [board, setBoard]   = useState<Board>(() => emptyBoard('easy'));
    const [phase, setPhase]   = useState<Phase>('ready');
    const [seconds, setSeconds] = useState(0);
    const [flagMode, setFlagMode] = useState(false);
    const [score, setScore] = useState(0);

    const active = useDeckActive();
    const phaseRef = useRef(phase); phaseRef.current = phase;
    const boardRef = useRef(board); boardRef.current = board;

    const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const pressOrigin = useRef<{ x: number; y: number } | null>(null);
    const pressHandled = useRef(false);

    useEffect(() => {
        void loadStats(GAME).then(s => { setHigh(s.high ?? 0); setPlays(s.plays ?? 0); setLast(s.last ?? 0); });
    }, []);

    useEffect(() => {
        if (phase !== 'playing' || !active) return;
        const id = setInterval(() => setSeconds(n => n + 1), 1000);
        return () => clearInterval(id);
    }, [phase, active]);

    useEffect(() => () => clearTimeout(pressTimer.current), []);

    const finish = useCallback((next: Board, won: boolean) => {
        const shown = won ? flagAllMines(next) : revealAllMines(next);
        const runScore = scoreFor(next, seconds, won);
        setBoard(shown);
        setPhase(won ? 'won' : 'lost');
        setScore(runScore);
        setIsRecord(runScore > high);
        void submitScoreApi(GAME, runScore).then(r => {
            setHigh(r.best); setIsRecord(r.isRecord); setPlays(r.plays); setLast(r.last);
        });
    }, [seconds, high]);

    const settle = useCallback((next: Board) => {
        if (next.hit >= 0) { finish(next, false); return; }
        if (isWon(next)) { finish(next, true); return; }
        setBoard(next);
        if (phaseRef.current === 'ready' && next.seeded) setPhase('playing');
    }, [finish]);

    const dig = useCallback((index: number) => {
        const current = boardRef.current;
        if (current.state[index] === FLAGGED) return;
        if (current.state[index] === REVEALED) { settle(chordAt(current, index)); return; }
        settle(revealAt(current, index));
    }, [settle]);

    const flag = useCallback((index: number) => {
        const current = boardRef.current;
        if (current.state[index] === REVEALED) return;
        setBoard(toggleFlag(current, index));
    }, []);

    const startGame = useCallback((level: Difficulty) => {
        clearTimeout(pressTimer.current);
        setDifficulty(level);
        setBoard(emptyBoard(level));
        setPhase('ready');
        setSeconds(0);
        setScore(0);
        setIsRecord(false);
        setFlagMode(false);
    }, []);

    const play = useCallback(() => { startGame(difficulty); setScreen('game'); }, [startGame, difficulty]);
    const replay = useCallback(() => startGame(difficulty), [startGame, difficulty]);

    const toMenu = useCallback(() => {
        clearTimeout(pressTimer.current);
        setPhase('ready');
        setScreen('menu');
    }, []);

    const openLeaderboard = useCallback(() => {
        setScreen('leaderboard'); setLb(null); setLbLoading(true);
        void loadScoreboard(GAME).then(s => { setLb(s); setLbLoading(false); });
    }, []);

    const onCellDown = useCallback((index: number, e: React.PointerEvent) => {
        if (phaseRef.current === 'won' || phaseRef.current === 'lost') return;
        pressHandled.current = false;
        pressOrigin.current = { x: e.clientX, y: e.clientY };
        clearTimeout(pressTimer.current);
        pressTimer.current = setTimeout(() => {
            pressHandled.current = true;
            flag(index);
        }, LONG_PRESS_MS);
    }, [flag]);

    const onCellMove = useCallback((e: React.PointerEvent) => {
        const origin = pressOrigin.current;
        if (!origin) return;
        if (Math.abs(e.clientX - origin.x) > MOVE_TOLERANCE || Math.abs(e.clientY - origin.y) > MOVE_TOLERANCE) {
            clearTimeout(pressTimer.current);
            pressHandled.current = true;
        }
    }, []);

    const onCellUp = useCallback((index: number) => {
        clearTimeout(pressTimer.current);
        pressOrigin.current = null;
        if (pressHandled.current) { pressHandled.current = false; return; }
        if (phaseRef.current === 'won' || phaseRef.current === 'lost') return;
        if (flagMode) flag(index); else dig(index);
    }, [flagMode, dig, flag]);

    const onCellLeave = useCallback(() => {
        clearTimeout(pressTimer.current);
        pressOrigin.current = null;
        pressHandled.current = true;
    }, []);

    const def = DIFFICULTIES[difficulty];
    const cell = useMemo(() => {
        const byWidth = Math.floor((BOARD_MAX_W - (def.cols + 1) * 2) / def.cols);
        const byHeight = Math.floor((BOARD_MAX_H - (def.rows + 1) * 2) / def.rows);
        return Math.max(18, Math.min(40, byWidth, byHeight));
    }, [def.cols, def.rows]);

    const gap = 2;
    const boardW = def.cols * cell + (def.cols + 1) * gap;
    const boardH = def.rows * cell + (def.rows + 1) * gap;
    const numberSize = Math.max(11, Math.round(cell * 0.52));
    const glyphSize = Math.max(13, Math.round(cell * 0.62));

    const cleared = safeCells(board) > 0 ? Math.round((board.revealed / safeCells(board)) * 100) : 0;
    const over = phase === 'won' || phase === 'lost';

    return (
        <div className="absolute inset-0 z-10 flex flex-col select-none" style={wrapStyle}>
            <style>{`
                @keyframes ms-pop { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
                @keyframes ms-overlay-in { 0% { opacity: 0; transform: translateY(14px) scale(0.97); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
                @keyframes ms-boom { 0% { transform: scale(0.4); } 60% { transform: scale(1.18); } 100% { transform: scale(1); } }
            `}</style>

            <div className="shrink-0" style={{ height: SB_H }} />

            <div key={screen} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                {screen === 'menu' && (
                    <ScoreStartScreen
                        config={{
                            icon: MinesweeperIcon,
                            title: t('minesweeper.title', 'Minesweeper'),
                            accent: ACCENT,
                            flavor: t('minesweeper.flavor', 'Clear every safe square without setting off a mine. Tap to dig, hold to plant a flag, and tap a number with its flags placed to sweep around it.'),
                        }}
                        stats={{ high, plays, last }}
                        onPlay={play}
                        onLeaderboard={openLeaderboard}
                    >
                        <div className="mt-4 flex gap-2">
                            {DIFFICULTY_ORDER.map(level => {
                                const on = level === difficulty;
                                return (
                                    <button
                                        key={level}
                                        type="button"
                                        onClick={() => setDifficulty(level)}
                                        className="flex-1 rounded-[12px] py-2.5 text-[13px] font-bold active:opacity-80"
                                        style={{
                                            background: on ? ACCENT : 'rgba(255,255,255,0.08)',
                                            color: on ? '#fff' : 'rgba(255,255,255,0.72)',
                                        }}
                                    >
                                        <span className="block">{levelLabel(level)}</span>
                                        <span className="mt-0.5 block text-[10px] font-semibold opacity-70">
                                            {DIFFICULTIES[level].cols}×{DIFFICULTIES[level].rows} · {DIFFICULTIES[level].mines}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </ScoreStartScreen>
                )}

                {screen === 'leaderboard' && (
                    <>
                        <GameHeader title={t('minesweeper.title', 'Minesweeper')} accent={ACCENT} onBack={toMenu} />
                        <Leaderboard variant="score" scores={lb} loading={lbLoading} accent={ACCENT} />
                    </>
                )}

                {screen === 'game' && (
                    <>
                        <div className="relative flex shrink-0 items-center justify-center px-5 pb-2 pt-1">
                            <button
                                type="button"
                                onClick={toMenu}
                                className="absolute left-3 flex items-center active:opacity-60"
                                style={{ color: pal.sub }}
                                aria-label={t('games.back', 'Back')}
                            >
                                <ChevronLeft className="h-[28px] w-[28px]" strokeWidth={2.4} />
                            </button>
                            <h1 className="text-[20px] font-extrabold tracking-[0.14em]" style={{ color: pal.text }}>
                                {t('minesweeper.wordmark', 'MINESWEEPER')}
                            </h1>
                            <button
                                type="button"
                                onClick={replay}
                                className="absolute right-4 flex h-9 w-9 items-center justify-center rounded-full active:opacity-60"
                                style={{ color: pal.sub, background: 'rgba(255,255,255,0.06)' }}
                                aria-label={t('minesweeper.restart', 'Restart')}
                            >
                                <RotateCcw className="h-[17px] w-[17px]" strokeWidth={2.4} />
                            </button>
                        </div>

                        <div className="flex shrink-0 items-stretch justify-center gap-2 px-5 pb-2.5">
                            <Stat label={t('minesweeper.mines', 'MINES')} value={String(minesLeft(board))} sub={pal.sub} text={pal.accent} />
                            <Stat label={t('minesweeper.time', 'TIME')} value={formatClock(seconds)} sub={pal.sub} text={pal.text} />
                            <Stat label={t('minesweeper.cleared', 'CLEARED')} value={`${cleared}%`} sub={pal.sub} text={pal.text} />
                            <Stat label={t('minesweeper.level', 'LEVEL')} value={levelLabel(difficulty)} sub={pal.sub} text={pal.text} />
                        </div>

                        <div className="flex flex-1 items-center justify-center px-3">
                            <div className="relative" style={{ width: boardW, height: boardH }}>
                                <div
                                    className="grid h-full w-full rounded-[14px]"
                                    style={{
                                        gridTemplateColumns: `repeat(${def.cols}, ${cell}px)`,
                                        gridTemplateRows: `repeat(${def.rows}, ${cell}px)`,
                                        gap,
                                        padding: gap,
                                        background: pal.grid,
                                        boxShadow: '0 0 0 1px rgba(228,72,61,0.16), 0 16px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)',
                                        touchAction: 'manipulation',
                                    }}
                                >
                                    {board.state.map((st, i) => (
                                        <Cell
                                            key={i}
                                            index={i}
                                            state={st}
                                            mine={board.mine[i]}
                                            adj={board.adj[i]}
                                            hit={board.hit === i}
                                            size={cell}
                                            numberSize={numberSize}
                                            glyphSize={glyphSize}
                                            onDown={onCellDown}
                                            onMove={onCellMove}
                                            onUp={onCellUp}
                                            onLeave={onCellLeave}
                                        />
                                    ))}
                                </div>

                                {over && (
                                    <div
                                        className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-[14px] px-4"
                                        style={{ background: 'rgba(10,12,18,0.9)', animation: 'ms-overlay-in 0.26s ease-out' }}
                                    >
                                        <GameOverCard
                                            title={phase === 'won' ? t('minesweeper.swept', 'Swept!') : t('minesweeper.boom', 'Boom!')}
                                            accent={pal.accent}
                                            sub={pal.sub}
                                            ink={pal.text}
                                            cardBg="rgba(28,32,41,0.96)"
                                            cardShadow="0 10px 30px rgba(0,0,0,0.5)"
                                            pop="ms-pop 0.3s ease-out"
                                            stats={[
                                                { label: t('minesweeper.score', 'SCORE'), value: score },
                                                { label: t('minesweeper.best', 'BEST'), value: Math.max(high, score), highlight: isRecord },
                                            ]}
                                            statSize={28}
                                            newBest={isRecord}
                                            newBestLabel={t('minesweeper.newBest', 'New best!')}
                                            playAgainLabel={t('minesweeper.playAgain', 'Play again')}
                                            playAgainColor={pal.accent}
                                            onPlayAgain={replay}
                                        >
                                            <div className="mt-2 text-[13px] font-semibold" style={{ color: pal.sub }}>
                                                {t('minesweeper.summary', '{level} · {time} · {cleared}% cleared', {
                                                    level: levelLabel(difficulty),
                                                    time: formatClock(seconds),
                                                    cleared: String(cleared),
                                                })}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={toMenu}
                                                className="mt-3 text-[14px] font-semibold active:opacity-70"
                                                style={{ color: pal.sub }}
                                            >
                                                {t('games.menu', 'Menu')}
                                            </button>
                                        </GameOverCard>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex shrink-0 items-stretch justify-center gap-2.5 px-5" style={{ paddingBottom: 58, paddingTop: 10 }}>
                            <ModeBtn
                                on={!flagMode}
                                onPress={() => setFlagMode(false)}
                                label={t('minesweeper.dig', 'Dig')}
                                accent={ACCENT}
                            >
                                <Pickaxe className="h-[20px] w-[20px]" strokeWidth={2.4} />
                            </ModeBtn>
                            <ModeBtn
                                on={flagMode}
                                onPress={() => setFlagMode(true)}
                                label={t('minesweeper.flag', 'Flag')}
                                accent={ACCENT}
                            >
                                <Flag className="h-[20px] w-[20px]" strokeWidth={2.4} />
                            </ModeBtn>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function levelLabel(level: Difficulty): string {
    if (level === 'easy') return t('minesweeper.easy', 'Easy');
    if (level === 'medium') return t('minesweeper.medium', 'Medium');
    return t('minesweeper.hard', 'Hard');
}

interface CellProps {
    index: number;
    state: number;
    mine: boolean;
    adj: number;
    hit: boolean;
    size: number;
    numberSize: number;
    glyphSize: number;
    onDown: (index: number, e: React.PointerEvent) => void;
    onMove: (e: React.PointerEvent) => void;
    onUp: (index: number) => void;
    onLeave: () => void;
}

function Cell({ index, state, mine, adj, hit, size, numberSize, glyphSize, onDown, onMove, onUp, onLeave }: CellProps) {
    const revealed = state === REVEALED;
    const flagged = state === FLAGGED;

    const background = revealed
        ? (hit ? 'linear-gradient(160deg, #FF6A5E, #C7302A)' : 'rgba(255,255,255,0.045)')
        : flagged
            ? 'linear-gradient(160deg, #5A3942 0%, #462C33 55%, #3C262C 100%)'
            : 'linear-gradient(160deg, #39404F 0%, #2C323E 55%, #262B36 100%)';

    return (
        <div
            role="button"
            tabIndex={-1}
            aria-label={`${index}`}
            onPointerDown={e => { e.preventDefault(); onDown(index, e); }}
            onPointerMove={onMove}
            onPointerUp={() => onUp(index)}
            onPointerLeave={onLeave}
            onPointerCancel={onLeave}
            className="flex items-center justify-center"
            style={{
                borderRadius: Math.max(3, Math.round(size * 0.18)),
                background,
                boxShadow: revealed
                    ? 'inset 0 1px 2px rgba(0,0,0,0.35)'
                    : 'inset 0 1.5px 0 rgba(255,255,255,0.10), inset 0 -1.5px 2px rgba(0,0,0,0.28)',
                touchAction: 'manipulation',
            }}
        >
            {flagged && (
                <Flag
                    style={{ width: glyphSize, height: glyphSize, color: '#FF7063' }}
                    fill="#FF3B2F"
                    strokeWidth={2.2}
                />
            )}
            {revealed && mine && (
                <Bomb
                    style={{ width: glyphSize, height: glyphSize, color: hit ? '#FFFFFF' : '#FF9A8E', animation: hit ? 'ms-boom 0.3s ease-out' : undefined }}
                    fill={hit ? '#FFFFFF' : '#FF6B5F'}
                    strokeWidth={2.2}
                />
            )}
            {revealed && !mine && adj > 0 && (
                <span className="font-black leading-none tabular-nums" style={{ fontSize: numberSize, color: NUMBER_INK[adj] }}>
                    {adj}
                </span>
            )}
        </div>
    );
}

function Stat({ label, value, sub, text }: { label: string; value: string; sub: string; text: string }) {
    return (
        <div className="flex flex-1 flex-col items-center rounded-[14px] py-1.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: sub }}>{label}</span>
            <span className="text-[16px] font-extrabold tabular-nums" style={{ color: text }}>{value}</span>
        </div>
    );
}

function ModeBtn({ on, onPress, label, accent, children }: {
    on: boolean;
    onPress: () => void;
    label: string;
    accent: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onPointerDown={e => { e.preventDefault(); onPress(); }}
            aria-label={label}
            aria-pressed={on}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl active:scale-95"
            style={{
                height: 52,
                color: on ? '#fff' : '#B9C1D0',
                background: on ? `linear-gradient(160deg, ${accent}, #B0332B)` : 'rgba(255,255,255,0.07)',
                boxShadow: on ? '0 8px 20px rgba(228,72,61,0.36)' : 'inset 0 1px 0 rgba(255,255,255,0.08)',
                transition: 'transform 0.06s ease',
                touchAction: 'manipulation',
            }}
        >
            {children}
            <span className="text-[15px] font-bold">{label}</span>
        </button>
    );
}
