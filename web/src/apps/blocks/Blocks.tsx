import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ChevronLeft, ChevronsDown, Pause, Play, RotateCw } from 'lucide-react';

import { t } from '@/i18n';
import { GameHeader } from '@/apps/_games/GameHeader';
import { ScoreStartScreen } from '@/apps/_games/ScoreStartScreen';
import { Leaderboard } from '@/apps/_games/Leaderboard';
import { GameOverCard } from '@/apps/_arcade/GameOverCard';
import { loadScoreboard, loadStats, submitScoreApi, type ScoreEntry } from '@/apps/_games/statsApi';
import { BlocksIcon } from '@/shell/AppIconSVG';
import { useDeckActive } from '@/shell/deckActive';

import {
    Bag, COLS, ROWS, SHAPES,
    cellsOf, dropMs, emptyBoard, ghostY, levelFor, lineScore,
    lockAndClear, rotate, spawn, valid,
    type Board, type Piece, type PieceKind,
} from './logic';

interface Props { onClose: () => void; }

const GAME = 'blocks';
const ACCENT = '#7C4DFF';
const SB_H = 54;

type Screen = 'menu' | 'game' | 'leaderboard';
type Phase = 'playing' | 'paused' | 'over';

const pal = {
    bg:     '#0E0B1A',
    bg2:    '#171130',
    grid:   '#221A40',
    accent: ACCENT,
    text:   '#F4F1FF',
    sub:    '#9A92C4',
};
const wrapStyle = { background: `radial-gradient(120% 90% at 50% 0%, ${pal.bg2} 0%, ${pal.bg} 60%)`, color: pal.text };

export function Blocks({ onClose: _onClose }: Props) {
    const [screen, setScreen] = useState<Screen>('menu');
    const [high,   setHigh]   = useState(0);
    const [plays,  setPlays]  = useState(0);
    const [last,   setLast]   = useState(0);
    const [isRecord, setIsRecord] = useState(false);
    const [lb,      setLb]      = useState<ScoreEntry[] | null>(null);
    const [lbLoading, setLbLoading] = useState(false);

    const [board,   setBoard]   = useState<Board>(emptyBoard);
    const [piece,   setPiece]   = useState<Piece | null>(null);
    const [nextKind, setNextKind] = useState<PieceKind>('T');
    const [score,   setScore]   = useState(0);
    const [lines,   setLines]   = useState(0);
    const [phase,   setPhase]   = useState<Phase>('paused');
    const [flashRows, setFlashRows] = useState<number[]>([]);

    // Freeze the self-rescheduling gravity chain while backgrounded: a pending drop
    // timeout that fires after the switcher opens must not slide a piece in the card.
    const active = useDeckActive();
    const activeRef = useRef(active);  activeRef.current = active;

    const boardRef  = useRef(board);   boardRef.current  = board;
    const pieceRef  = useRef(piece);   pieceRef.current  = piece;
    const levelRef  = useRef(0);
    const phaseRef  = useRef(phase);   phaseRef.current  = phase;
    const bagRef    = useRef<Bag>(new Bag());
    const dropTimer = useRef<ReturnType<typeof setTimeout>>();
    const flashTimer = useRef<ReturnType<typeof setTimeout>>();
    const nextKindRef = useRef(nextKind);
    nextKindRef.current = nextKind;

    const level = levelFor(lines);
    levelRef.current = level;

    // Load the player's server record once on open.
    useEffect(() => {
        void loadStats(GAME).then(s => { setHigh(s.high ?? 0); setPlays(s.plays ?? 0); setLast(s.last ?? 0); });
    }, []);

    // Blocks is dark on every screen — force the status bar to its light (dark-mode) content.

    const lockPiece = useCallback((p: Piece) => {
        const { board: merged, cleared } = lockAndClear(boardRef.current, p);
        setBoard(merged);

        if (cleared > 0) {
            setScore(s => s + lineScore(cleared, levelRef.current));
            setLines(n => n + cleared);
            const rows = Array.from({ length: cleared }, (_, i) => i);
            setFlashRows(rows);
            clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setFlashRows([]), 160);
        }

        const kind = nextKindRef.current;
        const fresh = spawn(kind);
        nextKindRef.current = bagRef.current.next();
        setNextKind(nextKindRef.current);

        if (!valid(merged, fresh)) {
            setPiece(null);
            pieceRef.current = null;
            setPhase('over');
            return;
        }
        setPiece(fresh);
        pieceRef.current = fresh;
    }, []);

    const tick = useCallback(() => {
        if (phaseRef.current !== 'playing') return;
        if (!activeRef.current) return;  // frozen while backgrounded; resumed by the active effect
        const p = pieceRef.current;
        if (p) {
            const moved = { ...p, y: p.y + 1 };
            if (valid(boardRef.current, moved)) {
                setPiece(moved);
                pieceRef.current = moved;
            } else {
                lockPiece(p);
            }
        }
        dropTimer.current = setTimeout(tick, dropMs(levelRef.current));
    }, [lockPiece]);

    const startGame = useCallback(() => {
        clearTimeout(dropTimer.current);
        const fresh = emptyBoard();
        bagRef.current = new Bag();
        const first = spawn(bagRef.current.next());
        nextKindRef.current = bagRef.current.next();

        setBoard(fresh);            boardRef.current = fresh;
        setPiece(first);            pieceRef.current = first;
        setNextKind(nextKindRef.current);
        setScore(0);
        setLines(0);
        setFlashRows([]);
        setIsRecord(false);
        setPhase('playing');        phaseRef.current = 'playing';
        dropTimer.current = setTimeout(tick, dropMs(0));
    }, [tick]);

    const move = useCallback((dx: number) => {
        if (phaseRef.current !== 'playing') return;
        const p = pieceRef.current;
        if (!p) return;
        const cand = { ...p, x: p.x + dx };
        if (valid(boardRef.current, cand)) { setPiece(cand); pieceRef.current = cand; }
    }, []);

    const rotateCw = useCallback(() => {
        if (phaseRef.current !== 'playing') return;
        const p = pieceRef.current;
        if (!p) return;
        const r = rotate(boardRef.current, p);
        setPiece(r); pieceRef.current = r;
    }, []);

    const softDrop = useCallback(() => {
        if (phaseRef.current !== 'playing') return;
        const p = pieceRef.current;
        if (!p) return;
        const cand = { ...p, y: p.y + 1 };
        if (valid(boardRef.current, cand)) {
            setPiece(cand); pieceRef.current = cand;
            setScore(s => s + 1);
        }
    }, []);

    const hardDrop = useCallback(() => {
        if (phaseRef.current !== 'playing') return;
        const p = pieceRef.current;
        if (!p) return;
        const y = ghostY(boardRef.current, p);
        const dist = y - p.y;
        if (dist > 0) setScore(s => s + dist * 2);
        const landed = { ...p, y };
        pieceRef.current = landed;
        lockPiece(landed);
        clearTimeout(dropTimer.current);
        dropTimer.current = setTimeout(tick, dropMs(levelRef.current));
    }, [lockPiece, tick]);

    const togglePause = useCallback(() => {
        if (phaseRef.current === 'playing') {
            clearTimeout(dropTimer.current);
            setPhase('paused'); phaseRef.current = 'paused';
        } else if (phaseRef.current === 'paused') {
            setPhase('playing'); phaseRef.current = 'playing';
            dropTimer.current = setTimeout(tick, dropMs(levelRef.current));
        }
    }, [tick]);

    // Submit the run's score to the shared board when a game ends.
    useEffect(() => {
        if (phase !== 'over') return;
        setIsRecord(score > high);
        let cancelled = false;
        void submitScoreApi(GAME, score).then(r => {
            if (!cancelled) { setHigh(r.best); setIsRecord(r.isRecord); setPlays(r.plays); setLast(r.last); }
        });
        return () => { cancelled = true; };
    }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

    // Gate on deckActive too, not just phase: backgrounding pauses the drop timer but
    // leaves phase 'playing', so without this a backgrounded game keeps preventDefault-ing
    // arrows/Space and starves text fields in other apps.
    useEffect(() => {
        if (!active) return;
        function onKey(e: KeyboardEvent) {
            if (phaseRef.current !== 'playing') return;
            switch (e.key) {
                case 'ArrowLeft':  e.preventDefault(); move(-1); break;
                case 'ArrowRight': e.preventDefault(); move(1); break;
                case 'ArrowDown':  e.preventDefault(); softDrop(); break;
                case 'ArrowUp':    e.preventDefault(); rotateCw(); break;
                case ' ':          e.preventDefault(); hardDrop(); break;
                default: break;
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [active, move, softDrop, rotateCw, hardDrop]);

    // Pause on background (clear the pending drop) and, on resume, re-arm the gravity
    // chain if a game is in progress so the piece continues from exactly where it froze.
    useEffect(() => {
        if (!active) { clearTimeout(dropTimer.current); return; }
        if (phaseRef.current === 'playing') {
            clearTimeout(dropTimer.current);
            dropTimer.current = setTimeout(tick, dropMs(levelRef.current));
        }
    }, [active, tick]);

    useEffect(() => () => {
        clearTimeout(dropTimer.current);
        clearTimeout(flashTimer.current);
    }, []);

    const play = useCallback(() => { startGame(); setScreen('game'); }, [startGame]);
    const toMenu = useCallback(() => {
        clearTimeout(dropTimer.current);
        setPhase('paused'); phaseRef.current = 'paused';
        setScreen('menu');
    }, []);
    const openLeaderboard = useCallback(() => {
        setScreen('leaderboard'); setLb(null); setLbLoading(true);
        void loadScoreboard(GAME).then(s => { setLb(s); setLbLoading(false); });
    }, []);

    const displayBest = Math.max(high, score);

    // Board view (only rendered on the game screen; cheap enough to compute each render).
    type RenderCell = { kind: PieceKind; ghost?: boolean } | null;
    const view: RenderCell[][] = board.map(row => row.map(c => (c === 0 ? null : { kind: c })));
    if (piece && phase !== 'over') {
        const gy = ghostY(board, piece);
        if (gy !== piece.y) {
            for (const [dx, dy] of SHAPES[piece.kind].rotations[piece.rot]) {
                const x = piece.x + dx, y = gy + dy;
                if (y >= 0 && y < ROWS && x >= 0 && x < COLS && !view[y][x]) {
                    view[y][x] = { kind: piece.kind, ghost: true };
                }
            }
        }
        for (const [x, y] of cellsOf(piece)) {
            if (y >= 0 && y < ROWS && x >= 0 && x < COLS) view[y][x] = { kind: piece.kind };
        }
    }

    const CELL = 22;
    const GAP = 2;
    const boardW = COLS * CELL + (COLS + 1) * GAP;
    const boardH = ROWS * CELL + (ROWS + 1) * GAP;

    return (
        <div className="absolute inset-0 z-10 flex flex-col select-none" style={wrapStyle}>
            <style>{`
                @keyframes blocks-pop { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
                @keyframes blocks-flash { 0%,100% { opacity: 0; } 50% { opacity: 0.85; } }
                @keyframes blocks-overlay-in { 0% { opacity: 0; transform: translateY(14px) scale(0.97); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
            `}</style>

            <div className="shrink-0" style={{ height: SB_H }} />

            <div key={screen} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                {screen === 'menu' && (
                    <ScoreStartScreen
                        config={{ icon: BlocksIcon, title: t('blocks.title', 'Blocks'), accent: ACCENT, flavor: t('blocks.flavor', 'Slot the falling pieces, clear full rows, and push your run as far as it goes. Tap the controls or use the arrow keys.') }}
                        stats={{ high, plays, last }}
                        onPlay={play}
                        onLeaderboard={openLeaderboard}
                    />
                )}

                {screen === 'leaderboard' && (
                    <>
                        <GameHeader title={t('blocks.title', 'Blocks')} accent={ACCENT} onBack={toMenu} />
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
                            <h1 className="text-[22px] font-extrabold tracking-[0.16em]"
                                style={{ background: `linear-gradient(90deg, ${pal.accent}, #C9A8FF)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                {t('blocks.wordmark', 'BLOCKS')}
                            </h1>
                            {(phase === 'playing' || phase === 'paused') && (
                                <button
                                    type="button"
                                    onClick={togglePause}
                                    className="absolute right-4 flex h-9 w-9 items-center justify-center rounded-full active:opacity-60"
                                    style={{ color: pal.sub, background: 'rgba(255,255,255,0.06)' }}
                                    aria-label={phase === 'paused' ? t('blocks.resume', 'Resume') : t('blocks.pause', 'Pause')}
                                >
                                    {phase === 'paused'
                                        ? <Play className="h-[18px] w-[18px]" strokeWidth={2.4} />
                                        : <Pause className="h-[18px] w-[18px]" strokeWidth={2.4} />}
                                </button>
                            )}
                        </div>

                        <div className="flex shrink-0 items-stretch justify-center gap-2 px-5 pb-2.5">
                            <Stat label={t('blocks.score', 'SCORE')} value={score.toLocaleString()} sub={pal.sub} text={pal.text} />
                            <Stat label={t('blocks.lines', 'LINES')} value={String(lines)} sub={pal.sub} text={pal.text} />
                            <Stat label={t('blocks.level', 'LEVEL')} value={String(level + 1)} sub={pal.sub} text={pal.text} />
                            <Stat label={t('blocks.best', 'BEST')}  value={displayBest.toLocaleString()} sub={pal.sub} text={pal.accent} />
                        </div>

                        <div className="flex flex-1 items-center justify-center px-5">
                            <div className="relative" style={{ width: boardW, height: boardH }}>
                                <div
                                    className="grid h-full w-full rounded-[14px]"
                                    style={{
                                        gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
                                        gridTemplateRows: `repeat(${ROWS}, ${CELL}px)`,
                                        gap: GAP,
                                        padding: GAP,
                                        background: pal.grid,
                                        boxShadow: `0 0 0 1px rgba(124,77,255,0.18), 0 16px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)`,
                                    }}
                                >
                                    {view.flatMap((row, y) =>
                                        row.map((cell, x) => {
                                            if (!cell) {
                                                return (
                                                    <div
                                                        key={`${x}-${y}`}
                                                        style={{ borderRadius: 4, background: 'rgba(255,255,255,0.018)' }}
                                                    />
                                                );
                                            }
                                            const s = SHAPES[cell.kind];
                                            if (cell.ghost) {
                                                return (
                                                    <div
                                                        key={`${x}-${y}`}
                                                        style={{
                                                            borderRadius: 4,
                                                            border: `2px solid ${s.color}`,
                                                            opacity: 0.32,
                                                            boxSizing: 'border-box',
                                                        }}
                                                    />
                                                );
                                            }
                                            return (
                                                <div
                                                    key={`${x}-${y}`}
                                                    style={{
                                                        borderRadius: 4,
                                                        background: `linear-gradient(150deg, ${s.glow} 0%, ${s.color} 48%, ${s.color} 100%)`,
                                                        boxShadow: `inset 0 2px 0 rgba(255,255,255,0.34), inset 0 -2px 3px rgba(0,0,0,0.30)`,
                                                    }}
                                                />
                                            );
                                        }),
                                    )}
                                </div>

                                {flashRows.length > 0 && (
                                    <div className="pointer-events-none absolute inset-0 rounded-[14px]"
                                         style={{ background: 'rgba(255,255,255,0.9)', animation: 'blocks-flash 0.16s ease-out' }} />
                                )}

                                {phase === 'paused' && (
                                    <Overlay>
                                        <Pause className="h-9 w-9" strokeWidth={2.2} style={{ color: pal.accent }} />
                                        <div className="mt-3 text-[20px] font-extrabold tracking-tight">{t('blocks.paused', 'Paused')}</div>
                                        <button
                                            type="button"
                                            onClick={togglePause}
                                            className="mt-5 rounded-full px-10 py-3 text-[16px] font-bold text-white active:opacity-80"
                                            style={{ background: pal.accent, boxShadow: `0 8px 22px rgba(124,77,255,0.45)` }}
                                        >
                                            {t('blocks.resume', 'Resume')}
                                        </button>
                                    </Overlay>
                                )}

                                {phase === 'over' && (
                                    <Overlay>
                                        <GameOverCard
                                            title={t('blocks.gameOver', 'Game Over')}
                                            accent={pal.accent}
                                            sub={pal.sub}
                                            ink={pal.text}
                                            cardBg="rgba(23,17,48,0.96)"
                                            cardShadow="0 10px 30px rgba(0,0,0,0.5)"
                                            pop="blocks-pop 0.3s ease-out"
                                            stats={[
                                                { label: t('blocks.score', 'SCORE'), value: score },
                                                { label: t('blocks.best', 'BEST'), value: displayBest, highlight: isRecord },
                                            ]}
                                            newBest={isRecord}
                                            newBestLabel={t('blocks.newBest', 'New best!')}
                                            playAgainLabel={t('blocks.playAgain', 'Play again')}
                                            playAgainColor={pal.accent}
                                            onPlayAgain={startGame}
                                        >
                                            <button
                                                type="button"
                                                onClick={toMenu}
                                                className="mt-3 text-[14px] font-semibold active:opacity-70"
                                                style={{ color: pal.sub }}
                                            >
                                                {t('games.menu', 'Menu')}
                                            </button>
                                        </GameOverCard>
                                    </Overlay>
                                )}
                            </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-2.5 px-5" style={{ paddingBottom: 24, paddingTop: 8 }}>
                            <div className="flex items-stretch justify-center gap-2.5">
                                <CtrlBtn onPress={() => move(-1)} accent={pal.accent} label={t('blocks.left', 'Left')}>
                                    <ArrowLeft className="h-[26px] w-[26px]" strokeWidth={2.6} />
                                </CtrlBtn>
                                <CtrlBtn onPress={rotateCw} accent={pal.accent} primary label={t('blocks.rotate', 'Rotate')}>
                                    <RotateCw className="h-[26px] w-[26px]" strokeWidth={2.6} />
                                </CtrlBtn>
                                <CtrlBtn onPress={() => move(1)} accent={pal.accent} label={t('blocks.right', 'Right')}>
                                    <ArrowRight className="h-[26px] w-[26px]" strokeWidth={2.6} />
                                </CtrlBtn>
                            </div>
                            <div className="flex items-stretch justify-center gap-2.5">
                                <CtrlBtn onPress={softDrop} accent={pal.accent} wide label={t('blocks.softDrop', 'Soft drop')}>
                                    <ArrowDown className="h-[22px] w-[22px]" strokeWidth={2.6} />
                                    <span className="text-[14px] font-bold">{t('blocks.soft', 'Soft')}</span>
                                </CtrlBtn>
                                <CtrlBtn onPress={hardDrop} accent={pal.accent} wide solid label={t('blocks.hardDrop', 'Hard drop')}>
                                    <ChevronsDown className="h-[22px] w-[22px]" strokeWidth={2.6} />
                                    <span className="text-[14px] font-bold">{t('blocks.drop', 'Drop')}</span>
                                </CtrlBtn>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function Stat({ label, value, sub, text }: { label: string; value: string; sub: string; text: string }) {
    return (
        <div className="flex min-w-0 flex-1 flex-col items-center rounded-2xl px-1 py-1.5"
             style={{ background: 'rgba(255,255,255,0.05)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
            <span className="text-[9.5px] font-bold tracking-[0.12em]" style={{ color: sub }}>{label}</span>
            <span className="mt-0.5 max-w-full truncate text-[17px] font-extrabold leading-none tabular-nums" style={{ color: text }}>
                {value}
            </span>
        </div>
    );
}

function CtrlBtn({
    onPress, children, accent, primary = false, solid = false, wide = false, label,
}: {
    onPress: () => void;
    children: React.ReactNode;
    accent: string;
    primary?: boolean;
    solid?: boolean;
    wide?: boolean;
    label: string;
}) {
    return (
        <button
            type="button"
            onPointerDown={e => { e.preventDefault(); onPress(); }}
            aria-label={label}
            className="flex items-center justify-center gap-1.5 rounded-2xl active:scale-95"
            style={{
                height: 58,
                flex: wide ? '1 1 0%' : '0 0 84px',
                color: solid ? '#fff' : (primary ? accent : '#D8D2F2'),
                background: solid
                    ? `linear-gradient(160deg, ${accent}, #5E33D6)`
                    : primary
                        ? 'rgba(124,77,255,0.18)'
                        : 'rgba(255,255,255,0.07)',
                boxShadow: solid
                    ? '0 8px 20px rgba(124,77,255,0.4)'
                    : 'inset 0 1px 0 rgba(255,255,255,0.08)',
                transition: 'transform 0.06s ease',
                touchAction: 'manipulation',
            }}
        >
            {children}
        </button>
    );
}

function Overlay({ children }: { children: React.ReactNode }) {
    return (
        <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-[14px] px-5"
            style={{
                background: 'rgba(10,7,22,0.78)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                animation: 'blocks-overlay-in 0.26s ease-out',
            }}
        >
            {children}
        </div>
    );
}
