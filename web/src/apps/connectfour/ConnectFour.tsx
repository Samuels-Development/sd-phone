import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { ConnectFourIcon } from '@/shell/AppIconSVG';
import { Board, discColor } from './Board';
import {
    DEPTH, chooseMove, dropRow, emptyBoard, findWin, idx, isFull,
    type Board as BoardT, type Difficulty, type Player,
} from './logic';
import { StartScreen, type GameStartConfig } from '@/apps/_games/StartScreen';
import { OnlineHub } from '@/apps/_games/OnlineHub';
import { LobbyRoom } from '@/apps/_games/LobbyRoom';
import { Leaderboard } from '@/apps/_games/Leaderboard';
import { GameOverDialog } from '@/apps/_games/GameOverDialog';
import { GameHeader } from '@/apps/_games/GameHeader';
import { finishApi, moveApi, registerGameSides, reportResultApi, type Side } from '@/apps/_games/onlineApi';
import { useOnlineLobby } from '@/apps/_games/useOnlineLobby';
import { loadLeaderboard, loadStats, recordResultApi, type GameLeaderboard, type GameStats } from '@/apps/_games/statsApi';

interface Props { onClose: () => void; }

const SB_H = 54;

type Screen = 'home' | 'lobby' | 'game' | 'leaderboard';
type Mode   = 'cpu' | 'online';
type Status = 'playing' | 'win' | 'draw';

const GAME   = 'connectfour';
const ACCENT = '#2E76E0';
registerGameSides(GAME, ['1', '2']);

const C4_CONFIG: GameStartConfig = {
    icon: ConnectFourIcon,
    title: t('connectfour.connectFour', 'Connect Four'),
    accent: ACCENT,
    sideOptions: [{ id: '1', label: t('connectfour.red', 'Red') }, { id: '2', label: t('connectfour.yellow', 'Yellow') }, { id: 'random', label: t('connectfour.random', 'Random') }],
    difficultyOptions: [{ id: 'easy', label: t('connectfour.easy', 'Easy') }, { id: 'medium', label: t('connectfour.medium', 'Medium') }, { id: 'hard', label: t('connectfour.hard', 'Hard') }],
    onlineBlurb: t('connectfour.onlineBlurb', 'Create public or private lobbies, invite players by server ID, and accept invites.'),
};
const sideLabel = (s: Side) => (s === 'random' ? t('connectfour.random', 'Random') : s === '1' ? t('connectfour.red', 'Red') : t('connectfour.yellow', 'Yellow'));
const other = (p: Player): Player => (p === 1 ? 2 : 1);

function replay(cols: number[]): { board: BoardT; turn: Player; lastDrop: number | null; status: Status; winner: Player | null; winLine: number[] } {
    let board = emptyBoard();
    let turn: Player = 1;
    let lastDrop: number | null = null;
    for (const col of cols) {
        const r = dropRow(board, col);
        if (r < 0) continue;
        board = board.slice();
        const cell = idx(r, col);
        board[cell] = turn;
        lastDrop = cell;
        const line = findWin(board, turn);
        if (line) return { board, turn, lastDrop, status: 'win', winner: turn, winLine: line };
        turn = other(turn);
    }
    if (isFull(board)) return { board, turn, lastDrop, status: 'draw', winner: null, winLine: [] };
    return { board, turn, lastDrop, status: 'playing', winner: null, winLine: [] };
}

export function ConnectFour({ onClose: _onClose }: Props) {
    const [screen,     setScreen]     = useState<Screen>('home');
    const [mode,       setMode]       = useState<Mode>('cpu');
    const [moves,      setMoves]      = useState<number[]>([]);
    const [humanColor, setHumanColor] = useState<Player>(1);
    const [depth,      setDepth]      = useState<number>(DEPTH.medium);
    const [thinking,   setThinking]   = useState(false);
    const [stats,      setStats]      = useState<GameStats>(() => ({ cpu: { wins: 0, losses: 0, draws: 0 }, online: { wins: 0, losses: 0, draws: 0 }, won: 0, lost: 0 }));

    const [ended,      setEnded]      = useState<{ reason: string } | null>(null);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [leaderboard, setLeaderboard] = useState<GameLeaderboard | null>(null);
    const [lbLoading,  setLbLoading]  = useState(false);

    const aiTimer   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const recorded  = useRef(false);

    useEffect(() => { void loadStats(GAME).then(setStats); }, []);


    const view = useMemo(() => replay(moves), [moves]);
    const { board, turn, lastDrop, status: gameStatus, winner, winLine } = view;
    const cpuOver = gameStatus !== 'playing';
    const over = mode === 'cpu' ? cpuOver : (cpuOver || !!ended);

    const applyCol = useCallback((col: number) => { setMoves(ms => [...ms, col]); }, []);

    const online = useOnlineLobby(GAME, {
        onStart: d => {
            clearTimeout(aiTimer.current);
            recorded.current = false;
            setMode('online'); setHumanColor(Number(d.color) as Player);
            setMoves([]); setEnded(null); setThinking(false);
            setScreen('game');
        },
        onMove: mv => {
            const m = mv as { col?: number };
            if (typeof m?.col === 'number') applyCol(m.col);
        },
        onEnded: reason => setEnded({ reason }),
        onReset: () => {
            clearTimeout(aiTimer.current);
            recorded.current = false;
            setEnded(null); setMoves([]); setThinking(false);
            setScreen('lobby');
        },
        onHome: () => {
            clearTimeout(aiTimer.current);
            setEnded(null);
            setScreen('home');
        },
        onStats: setStats,
        inLobbyScreen: screen === 'lobby',
        matchOver: over,
    });
    const { lobby, lobbies, incoming, hubError, inviteError, lobbyGone, onlineGame } = online;

    const onlineRef = useRef(onlineGame);
    onlineRef.current = onlineGame;

    const onHumanDrop = useCallback((col: number) => {
        if (over || thinking || turn !== humanColor || dropRow(board, col) < 0) return;
        applyCol(col);
        if (mode === 'online' && onlineRef.current) moveApi(onlineRef.current.gameId, { col });
    }, [over, thinking, turn, humanColor, board, applyCol, mode]);

    useEffect(() => {
        if (mode !== 'cpu' || screen !== 'game' || cpuOver || turn === humanColor) return;
        setThinking(true);
        aiTimer.current = setTimeout(() => {
            const col = chooseMove(board.slice(), turn, depth);
            setThinking(false);
            if (col >= 0) applyCol(col);
        }, 460 + Math.random() * 320);
        return () => clearTimeout(aiTimer.current);
    }, [mode, screen, cpuOver, turn, humanColor, board, depth, applyCol]);

    useEffect(() => {
        if (screen !== 'game' || !over || recorded.current) return;
        let result: 'win' | 'loss' | 'draw';
        if (mode === 'online' && ended) result = 'win';
        else if (gameStatus === 'draw') result = 'draw';
        else if (gameStatus === 'win') result = winner === humanColor ? 'win' : 'loss';
        else return;
        recorded.current = true;
        void recordResultApi(GAME, mode, result).then(s => { if (s) setStats(s); });
        if (mode === 'online' && !ended && onlineRef.current) {
            const og = onlineRef.current;
            finishApi(og.gameId);
            if (og.pot > 0) reportResultApi(og.gameId, result);
        }
    }, [screen, over, ended, gameStatus, winner, humanColor, mode]);

    useEffect(() => () => clearTimeout(aiTimer.current), []);

    function startCpu(side: Side, difficulty: string) {
        clearTimeout(aiTimer.current); recorded.current = false;
        const color: Player = side === 'random' ? (Math.random() < 0.5 ? 1 : 2) : (Number(side) as Player);
        setMode('cpu'); setHumanColor(color); setDepth(DEPTH[difficulty as Difficulty] ?? DEPTH.medium);
        setMoves([]); setThinking(false); setEnded(null);
        setScreen('game');
    }
    function resetCpu() { clearTimeout(aiTimer.current); recorded.current = false; setMoves([]); setThinking(false); }

    function openLeaderboard() {
        setScreen('leaderboard');
        setLbLoading(true);
        void loadLeaderboard(GAME).then(d => { setLeaderboard(d); setLbLoading(false); });
    }

    const banner = (() => {
        const pot = mode === 'online' ? (onlineGame?.pot ?? 0) : 0;
        if (mode === 'online' && ended) {
            const win = pot > 0 ? t('connectfour.youWinAmountLc', 'you win ${amount}!', { amount: pot.toLocaleString('en-US') }) : t('connectfour.youWinLc', 'you win!');
            return { text: (ended.reason === 'resign' ? t('connectfour.opponentResigned', 'Opponent resigned, ') : t('connectfour.opponentLeft', 'Opponent left, ')) + win, color: '#FFD54F' };
        }
        if (gameStatus === 'win') {
            const youWin = winner === humanColor;
            if (mode === 'cpu') return { text: youWin ? t('connectfour.youWin', 'You win!') : t('connectfour.computerWins', 'Computer wins'), color: discColor(winner ?? 1).hi };
            return { text: youWin ? (pot > 0 ? t('connectfour.youWinAmount', 'You win ${amount}!', { amount: pot.toLocaleString('en-US') }) : t('connectfour.youWin', 'You win!')) : t('connectfour.youLose', 'You lose'), color: '#FFD54F' };
        }
        if (gameStatus === 'draw') return { text: pot > 0 ? t('connectfour.drawRefunded', 'Draw, wager refunded') : t('connectfour.itsADraw', "It's a draw"), color: '#B0BEC5' };
        if (mode === 'cpu' && thinking) return { text: t('connectfour.computerThinking', 'Computer is thinking…'), color: discColor(turn).hi };
        const yourTurn = turn === humanColor;
        const opp = mode === 'cpu' ? t('connectfour.computer', 'Computer') : (onlineGame?.opponent ?? t('connectfour.opponent', 'Opponent'));
        return { text: yourTurn ? t('connectfour.yourMove', 'Your move') : t('connectfour.oppMove', '{opp}’s move', { opp }), color: discColor(turn).hi };
    })();

    const screenKey = screen === 'lobby' ? (lobby ? 'lobby-room' : 'lobby-hub') : screen;

    return (
        <div className="absolute inset-0 z-10 flex flex-col select-none" style={{ background: 'linear-gradient(180deg, #0B1E3D 0%, #102A52 48%, #0B1E3D 100%)' }}>
            <style>{`
                @keyframes c4-drop { 0% { transform: translateY(var(--c4-from)); } 70% { transform: translateY(0); } 82% { transform: translateY(-7px); } 100% { transform: translateY(0); } }
                @keyframes c4-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }
                @keyframes c4-banner-in { 0% { transform: translateY(8px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
            `}</style>

            <div className="shrink-0" style={{ height: SB_H }} />

            {screen !== 'home' && (
                <GameHeader
                    accent="#6BA8F0"
                    onBack={() => { if (screen === 'game' && !over) setConfirmLeave(true); else online.goHome(); }}
                    title={screen === 'lobby' ? (lobby ? t('connectfour.lobby', 'Lobby') : t('connectfour.playOnline', 'Play Online')) : screen === 'leaderboard' ? t('connectfour.leaderboard', 'Leaderboard') : t('connectfour.connectFour', 'Connect Four')}
                />
            )}

            <div key={screenKey} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
            {screen === 'home' && (
                <StartScreen config={C4_CONFIG} stats={stats} hasInvite={!!incoming} onPlayCpu={startCpu} onPlayOnline={() => setScreen('lobby')} onLeaderboard={openLeaderboard} />
            )}

            {screen === 'lobby' && (lobby ? (
                <LobbyRoom lobby={lobby} inviteError={inviteError} accent={ACCENT} sideLabel={sideLabel} onInvite={online.invite} onStart={online.start} onLeave={online.leave} onKick={online.kick} onSetWager={online.setWager} onSetReady={online.ready} />
            ) : (
                <OnlineHub lobbies={lobbies} incoming={incoming} error={hubError} accent={ACCENT} sideOptions={C4_CONFIG.sideOptions} onCreate={online.create} onJoin={online.join} onAccept={online.accept} onDecline={online.decline} onRefresh={online.refresh} />
            ))}

            {screen === 'leaderboard' && (
                <Leaderboard data={leaderboard} loading={lbLoading} accent={ACCENT} />
            )}

            {screen === 'game' && (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center justify-center pt-2">
                        <div className="flex items-center gap-2 rounded-full px-4 py-1.5" style={{ background: 'rgba(255,255,255,0.10)' }}>
                            {gameStatus === 'playing' && (
                                <span className="block h-3.5 w-3.5 rounded-full" style={{ background: `radial-gradient(circle at 32% 30%, ${discColor(turn).hi}, ${discColor(turn).base})`, boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.35)', animation: 'c4-pulse 1.1s ease-in-out infinite' }} />
                            )}
                            <span className="text-[15px] font-bold" style={{ color: banner.color }}>{banner.text}</span>
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-3" style={{ paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}>
                        <Board board={board} onDrop={onHumanDrop} locked={over || turn !== humanColor} winLine={winLine} lastDrop={lastDrop} previewDisc={humanColor} />
                    </div>
                </div>
            )}
            </div>

            {screen === 'game' && over && (
                <GameOverDialog
                    title={banner.text}
                    accent={ACCENT}
                    onPlayAgain={mode === 'cpu' ? resetCpu : undefined}
                    onReturnToLobby={mode === 'online' && !ended ? online.returnToLobby : undefined}
                    returnDisabled={lobbyGone}
                    onMenu={online.goHome}
                />
            )}

            {confirmLeave && (
                <AlertDialog
                    title={t('connectfour.leaveGame', 'Leave Game?')}
                    message={mode === 'online' ? t('connectfour.leaveForfeit', 'Leaving will forfeit the match.') : t('connectfour.leaveLost', 'Your current game will be lost.')}
                    confirmLabel={t('connectfour.leave', 'Leave')}
                    cancelLabel={t('connectfour.stay', 'Stay')}
                    destructive
                    onCancel={() => setConfirmLeave(false)}
                    onConfirm={() => { setConfirmLeave(false); online.goHome(); }}
                />
            )}
        </div>
    );
}
