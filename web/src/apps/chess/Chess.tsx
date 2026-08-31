import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AlertDialog } from '@/ui/AlertDialog';
import { Board } from './Board';
import { CapturedStrip, MoveList } from './GameInfo';
import { ChessIcon } from '@/shell/AppIconSVG';
import { StartScreen, type GameStartConfig } from '@/apps/_games/StartScreen';
import { OnlineHub } from '@/apps/_games/OnlineHub';
import { LobbyRoom } from '@/apps/_games/LobbyRoom';
import { Leaderboard } from '@/apps/_games/Leaderboard';
import { GameOverDialog } from '@/apps/_games/GameOverDialog';
import { GameHeader } from '@/apps/_games/GameHeader';
import {
    AI, chooseMove, initialState, makeMove, status, toSan,
    type AiOptions, type Color, type Difficulty, type Move,
} from './logic';
import { finishApi, moveApi, registerGameSides, reportResultApi, type Side } from '@/apps/_games/onlineApi';
import { useOnlineLobby } from '@/apps/_games/useOnlineLobby';
import { loadLeaderboard, loadStats, recordResultApi, type GameLeaderboard, type GameStats } from '@/apps/_games/statsApi';
import { t } from '@/i18n';

interface Props { onClose: () => void; }

const SB_H = 54;

type Screen = 'home' | 'lobby' | 'game' | 'leaderboard';
type Mode   = 'cpu' | 'online';

const GAME   = 'chess';
const ACCENT = '#769656';
registerGameSides(GAME, ['w', 'b']);

const chessConfig = (): GameStartConfig => ({
    icon: ChessIcon,
    title: t('chess.title','Chess'),
    accent: ACCENT,
    sideOptions: [{ id: 'w', label: t('chess.white','White') }, { id: 'b', label: t('chess.black','Black') }, { id: 'random', label: t('chess.random','Random') }],
    difficultyOptions: [{ id: 'easy', label: t('chess.easy','Easy') }, { id: 'medium', label: t('chess.medium','Medium') }, { id: 'hard', label: t('chess.hard','Hard') }],
    onlineBlurb: t('chess.onlineBlurb','Create public or private lobbies, invite players by server ID, and accept invites.'),
});
const sideLabel = (s: Side) => (s === 'random' ? t('chess.random','Random') : s === 'w' ? t('chess.white','White') : t('chess.black','Black'));

const PVAL: Record<string, number> = { Q: 9, R: 5, B: 3, N: 3, P: 1, K: 0 };
function annotate(moves: Move[]) {
    let s = initialState();
    const items: { san: string; side: Color }[] = [];
    const byWhite: string[] = [];
    const byBlack: string[] = [];
    for (const m of moves) {
        const mover = s.turn;
        const cap = s.board[m.to] ?? (m.flag === 'ep' ? (mover === 'w' ? 'p' : 'P') : null);
        items.push({ san: toSan(s, m), side: mover });
        if (cap) (mover === 'w' ? byWhite : byBlack).push(cap.toUpperCase());
        s = makeMove(s, m);
    }
    const wMat = byWhite.reduce((a, k) => a + (PVAL[k] || 0), 0);
    const bMat = byBlack.reduce((a, k) => a + (PVAL[k] || 0), 0);
    return { items, byWhite, byBlack, diff: wMat - bMat };
}

export function Chess({ onClose: _onClose }: Props) {
    const [screen,     setScreen]     = useState<Screen>('home');
    const [mode,       setMode]       = useState<Mode>('cpu');
    const [moves,      setMoves]      = useState<Move[]>([]);
    const [humanColor, setHumanColor] = useState<Color>('w');
    const [aiOpts,     setAiOpts]     = useState<AiOptions>(AI.medium);
    const [thinking,   setThinking]   = useState(false);
    const [stats,      setStats]      = useState<GameStats>(() => ({ cpu: { wins: 0, losses: 0, draws: 0 }, online: { wins: 0, losses: 0, draws: 0 }, won: 0, lost: 0 }));

    const [ended,      setEnded]      = useState<{ reason: string } | null>(null);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [leaderboard, setLeaderboard] = useState<GameLeaderboard | null>(null);
    const [lbLoading,  setLbLoading]  = useState(false);

    const aiTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const recorded = useRef(false);

    useEffect(() => { void loadStats(GAME).then(setStats); }, []);


    const game     = useMemo(() => moves.reduce((s, m) => makeMove(s, m), initialState()), [moves]);
    const lastMove = moves.length ? { from: moves[moves.length - 1].from, to: moves[moves.length - 1].to } : null;
    const info     = useMemo(() => annotate(moves), [moves]);

    const st = useMemo(() => status(game), [game]);
    const cpuOver = st === 'checkmate' || st === 'stalemate';
    const over = mode === 'cpu' ? cpuOver : (cpuOver || !!ended);

    const applyMove = useCallback((mv: Move) => { setMoves(ms => [...ms, mv]); }, []);

    const online = useOnlineLobby(GAME, {
        onStart: d => {
            clearTimeout(aiTimer.current);
            recorded.current = false;
            setMode('online'); setHumanColor(d.color as Color);
            setMoves([]); setEnded(null); setThinking(false);
            setScreen('game');
        },
        onMove: mv => applyMove(mv as Move),
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

    const onHumanMove = useCallback((mv: Move) => {
        applyMove(mv);
        if (mode === 'online' && onlineRef.current) moveApi(onlineRef.current.gameId, mv);
    }, [applyMove, mode]);

    useEffect(() => {
        if (mode !== 'cpu' || screen !== 'game' || cpuOver || game.turn === humanColor) return;
        setThinking(true);
        aiTimer.current = setTimeout(() => {
            const mv = chooseMove(game, aiOpts);
            setThinking(false);
            if (mv) applyMove(mv);
        }, 420 + Math.random() * 320);
        return () => clearTimeout(aiTimer.current);
    }, [mode, screen, cpuOver, game, humanColor, aiOpts, applyMove]);

    useEffect(() => {
        if (screen !== 'game' || !over || recorded.current) return;
        let result: 'win' | 'loss' | 'draw';
        if (mode === 'online' && ended) result = 'win';
        else if (st === 'stalemate') result = 'draw';
        else if (st === 'checkmate') result = game.turn !== humanColor ? 'win' : 'loss';
        else return;
        recorded.current = true;
        void recordResultApi(GAME, mode, result).then(s => { if (s) setStats(s); });
        if (mode === 'online' && !ended && onlineRef.current) {
            const og = onlineRef.current;
            finishApi(og.gameId);
            if (og.pot > 0) reportResultApi(og.gameId, result);
        }
    }, [screen, over, ended, st, game.turn, humanColor, mode]);

    useEffect(() => () => clearTimeout(aiTimer.current), []);

    function startCpu(side: Side, difficulty: string) {
        clearTimeout(aiTimer.current); recorded.current = false;
        const color: Color = side === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : (side as Color);
        setMode('cpu'); setHumanColor(color); setAiOpts(AI[difficulty as Difficulty]);
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
        const win = pot > 0 ? t('chess.youWinAmount','you win ${amount}!', { amount: pot.toLocaleString('en-US') }) : t('chess.youWin','you win!');
        if (mode === 'online' && ended) return { text: (ended.reason === 'resign' ? t('chess.opponentResigned','Opponent resigned, ') : t('chess.opponentLeft','Opponent left, ')) + win, color: '#FFD54F' };
        if (st === 'checkmate') { const youWin = game.turn !== humanColor; return { text: youWin ? t('chess.checkmateWin','Checkmate, {win}', { win }) : t('chess.checkmateLose','Checkmate, you lose'), color: '#FFD54F' }; }
        if (st === 'stalemate') return { text: pot > 0 ? t('chess.stalemateRefunded','Stalemate, draw (wager refunded)') : t('chess.stalemateDraw','Stalemate, draw'), color: '#B0BEC5' };
        if (mode === 'cpu' && thinking) return { text: t('chess.computerThinking','Computer is thinking…'), color: '#FFD54F' };
        const yourTurn = game.turn === humanColor;
        const opp = mode === 'cpu' ? t('chess.computer','Computer') : (onlineGame?.opponent ?? t('chess.opponent','Opponent'));
        if (st === 'check') {
            return yourTurn
                ? { text: t('chess.checkSafety','Check! Get your king to safety'), color: '#FF8A80' }
                : { text: t('chess.oppInCheck','{opp} is in check', { opp }), color: '#FF8A80' };
        }
        const text = yourTurn ? t('chess.yourMove','Your move') : t('chess.oppMove','{opp}’s move', { opp });
        return { text, color: '#fff' };
    })();

    const oppColor: Color = humanColor === 'w' ? 'b' : 'w';
    const oppName  = mode === 'cpu' ? t('chess.computer','Computer') : (onlineGame?.opponent ?? t('chess.opponent','Opponent'));
    const oppCaptured = oppColor === 'w' ? info.byWhite : info.byBlack;
    const youCaptured = humanColor === 'w' ? info.byWhite : info.byBlack;
    const oppAdv = Math.max(0, oppColor === 'w' ? info.diff : -info.diff);
    const youAdv = Math.max(0, humanColor === 'w' ? info.diff : -info.diff);

    const startConfig = chessConfig();
    const screenKey = screen === 'lobby' ? (lobby ? 'lobby-room' : 'lobby-hub') : screen;

    return (
        <div className="absolute inset-0 z-10 flex flex-col select-none" style={{ background: 'linear-gradient(180deg, #2C2A28 0%, #211F1D 52%, #161412 100%)' }}>
            <style>{`
                @keyframes chess-pop { 0% { transform: scale(0.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
                @keyframes chess-banner-in { 0% { transform: translateY(8px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
            `}</style>

            <div className="shrink-0" style={{ height: SB_H }} />

            {screen !== 'home' && (
                <GameHeader
                    accent="#7FA650"
                    onBack={() => { if (screen === 'game' && !over) setConfirmLeave(true); else online.goHome(); }}
                    title={screen === 'lobby' ? (lobby ? t('chess.lobby','Lobby') : t('chess.playOnline','Play Online')) : screen === 'leaderboard' ? t('chess.leaderboard','Leaderboard') : t('chess.title','Chess')}
                />
            )}

            <div key={screenKey} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
            {screen === 'home' && (
                <StartScreen config={startConfig} stats={stats} hasInvite={!!incoming} onPlayCpu={startCpu} onPlayOnline={() => setScreen('lobby')} onLeaderboard={openLeaderboard} />
            )}

            {screen === 'lobby' && (lobby ? (
                <LobbyRoom lobby={lobby} inviteError={inviteError} accent={ACCENT} sideLabel={sideLabel} onInvite={online.invite} onStart={online.start} onLeave={online.leave} onKick={online.kick} onSetWager={online.setWager} onSetReady={online.ready} />
            ) : (
                <OnlineHub lobbies={lobbies} incoming={incoming} error={hubError} accent={ACCENT} sideOptions={startConfig.sideOptions} onCreate={online.create} onJoin={online.join} onAccept={online.accept} onDecline={online.decline} onRefresh={online.refresh} />
            ))}

            {screen === 'leaderboard' && (
                <Leaderboard data={leaderboard} loading={lbLoading} accent={ACCENT} />
            )}

            {screen === 'game' && (
                <>
                    <div className="flex shrink-0 items-center justify-center pt-1.5">
                        <div className="rounded-full px-4 py-1.5" style={{ background: 'rgba(255,255,255,0.10)' }}>
                            <span className="text-[15px] font-bold" style={{ color: banner.color }}>{banner.text}</span>
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col items-center gap-2 px-3 pt-2" style={{ paddingBottom: 'calc(var(--safe-bottom) + 28px)' }}>
                        <CapturedStrip name={oppName} captured={oppCaptured} dark={humanColor === 'b'} advantage={oppAdv} active={!over && game.turn === oppColor} />

                        <Board
                            game={game}
                            humanColor={humanColor}
                            locked={over || (mode === 'cpu' && thinking)}
                            lastMove={lastMove}
                            status={st}
                            flipped={humanColor === 'b'}
                            onMove={onHumanMove}
                        />

                        <CapturedStrip name={t('chess.you','You')} captured={youCaptured} dark={oppColor === 'b'} advantage={youAdv} active={!over && game.turn === humanColor} />

                        <MoveList items={info.items} />
                    </div>
                </>
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
                    title={t('chess.leaveGameTitle','Leave Game?')}
                    message={mode === 'online' ? t('chess.leaveForfeit','Leaving will forfeit the match.') : t('chess.leaveLost','Your current game will be lost.')}
                    confirmLabel={t('chess.leave','Leave')}
                    cancelLabel={t('chess.stay','Stay')}
                    destructive
                    forceDark
                    onCancel={() => setConfirmLeave(false)}
                    onConfirm={() => { setConfirmLeave(false); online.goHome(); }}
                />
            )}

        </div>
    );
}
