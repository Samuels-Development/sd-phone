import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Shuffle } from 'lucide-react';

import { AlertDialog } from '@/ui/AlertDialog';
import { BattleshipIcon } from '@/shell/AppIconSVG';
import { t } from '@/i18n';
import { Grid, type CellView } from './Board';
import {
    CELLS, FLEET_CELLS, aiNextShot, randomFleet, shipAt, sunkCells,
    type Difficulty, type Fleet,
} from './logic';
import { StartScreen, type GameStartConfig } from '@/apps/_games/StartScreen';
import { OnlineHub } from '@/apps/_games/OnlineHub';
import { LobbyRoom } from '@/apps/_games/LobbyRoom';
import { Leaderboard } from '@/apps/_games/Leaderboard';
import { GameOverDialog } from '@/apps/_games/GameOverDialog';
import { GameHeader } from '@/apps/_games/GameHeader';
import { moveApi, registerGameSides, setupReadyApi, type Side } from '@/apps/_games/onlineApi';
import { useOnlineLobby, type OnlineResult } from '@/apps/_games/useOnlineLobby';
import { LOW_CLOCK, useTurnClock } from '@/apps/_games/useTurnClock';
import { loadLeaderboard, loadStats, recordResultApi, type GameLeaderboard, type GameStats } from '@/apps/_games/statsApi';

interface Props { onClose: () => void; }

const SB_H = 54;

type Screen = 'home' | 'lobby' | 'game' | 'leaderboard';
type Mode   = 'cpu' | 'online';
type Phase  = 'placing' | 'waiting' | 'firing';

const GAME   = 'battleship';
const ACCENT = '#17A0B5';
registerGameSides(GAME, ['1', '2']);

const bsConfig = (): GameStartConfig => ({
    icon: BattleshipIcon,
    title: t('battleship.title', 'Battleship'),
    accent: ACCENT,
    sideOptions: [{ id: '1', label: t('battleship.goFirst', 'Go First') }, { id: '2', label: t('battleship.goSecond', 'Go Second') }, { id: 'random', label: t('battleship.random', 'Random') }],
    difficultyOptions: [{ id: 'easy', label: t('battleship.easy', 'Easy') }, { id: 'medium', label: t('battleship.medium', 'Medium') }, { id: 'hard', label: t('battleship.hard', 'Hard') }],
    onlineBlurb: t('battleship.onlineBlurb', 'Create public or private lobbies, invite players by server ID, and accept invites.'),
});
const sideLabel = (s: Side) => (s === 'random' ? t('battleship.random', 'Random') : s === '1' ? t('battleship.first', 'First') : t('battleship.second', 'Second'));

interface ShotView { by: string; cell: number; hit: boolean; sunk?: string }
interface Reveal { fleets?: Record<string, Fleet> }
type Shots = Record<number, 'hit' | 'miss'>;

const CELL  = 34;
const PLACE = 38;

export function Battleship({ onClose: _onClose }: Props) {
    const [screen, setScreen] = useState<Screen>('home');
    const [mode,   setMode]   = useState<Mode>('cpu');
    const [stats,  setStats]  = useState<GameStats>(() => ({ cpu: { wins: 0, losses: 0, draws: 0 }, online: { wins: 0, losses: 0, draws: 0 }, won: 0, lost: 0 }));

    const [phase,        setPhase]        = useState<Phase>('placing');
    const [myFleet,      setMyFleet]      = useState<Fleet>(() => randomFleet());
    const [enemyFleet,   setEnemyFleet]   = useState<Fleet | null>(null);
    const [myTurn,       setMyTurn]       = useState(false);
    const [shotsAtEnemy, setShotsAtEnemy] = useState<Shots>({});
    const [shotsAtMe,    setShotsAtMe]    = useState<Shots>({});
    const [humanSide,    setHumanSide]    = useState<'1' | '2'>('1');
    const [difficulty,   setDifficulty]   = useState<Difficulty>('medium');
    const [thinking,     setThinking]     = useState(false);
    const [oppDeployed,  setOppDeployed]  = useState(false);
    const [flash,        setFlash]        = useState<string | null>(null);

    const [ended,       setEnded]       = useState<{ reason: string } | null>(null);
    const [verdict,     setVerdict]     = useState<OnlineResult | null>(null);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [leaderboard, setLeaderboard] = useState<GameLeaderboard | null>(null);
    const [lbLoading,   setLbLoading]   = useState(false);

    const recorded     = useRef(false);
    const aiTimer      = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const myFleetRef   = useRef(myFleet);    useEffect(() => { myFleetRef.current = myFleet; }, [myFleet]);
    const enemyFleetRef = useRef(enemyFleet); useEffect(() => { enemyFleetRef.current = enemyFleet; }, [enemyFleet]);
    const phaseRef     = useRef(phase);      useEffect(() => { phaseRef.current = phase; }, [phase]);
    const sideRef      = useRef(humanSide);  useEffect(() => { sideRef.current = humanSide; }, [humanSide]);
    const enemyRef     = useRef<Shots>({});
    const meRef        = useRef<Shots>({});

    useEffect(() => { void loadStats(GAME).then(setStats); }, []);


    const enemyCellsHit = useMemo(() => Object.values(shotsAtEnemy).filter(v => v === 'hit').length, [shotsAtEnemy]);
    const myCellsHit     = useMemo(() => Object.values(shotsAtMe).filter(v => v === 'hit').length, [shotsAtMe]);
    const verdictResult: 'win' | 'loss' | 'draw' | null = verdict ? (verdict.winner ? (verdict.winner === humanSide ? 'win' : 'loss') : 'draw') : null;
    const result: 'win' | 'loss' | 'draw' | null = mode === 'online'
        ? verdictResult
        : enemyCellsHit >= FLEET_CELLS ? 'win' : myCellsHit >= FLEET_CELLS ? 'loss' : null;
    const over = (mode === 'online' && !!ended) || result !== null;

    const online = useOnlineLobby(GAME, {
        onStart: d => {
            resetMatch('online', d.color === '1' ? '1' : '2', 'medium');
            setScreen('game');
        },
        onMove: mv => handleShot(mv as ShotView),
        onBegin: d => {
            phaseRef.current = 'firing';
            setPhase('firing');
            setOppDeployed(true);
            setMyTurn(d.turn === d.you);
        },
        onOppReady: () => setOppDeployed(true),
        onResult: setVerdict,
        onEnded: reason => setEnded({ reason }),
        onReset: () => {
            clearGame();
            setScreen('lobby');
        },
        onHome: () => {
            clearGame();
            setScreen('home');
        },
        onStats: setStats,
        inLobbyScreen: screen === 'lobby',
        matchOver: over,
    });
    const { lobby, lobbies, incoming, hubError, inviteError, lobbyGone, onlineGame } = online;

    const onlineRef = useRef(onlineGame);
    onlineRef.current = onlineGame;

    const pot  = mode === 'online' ? (onlineGame?.pot ?? 0) : 0;
    const oppName = mode === 'cpu' ? t('battleship.computer', 'Computer') : (onlineGame?.opponent ?? t('battleship.opponent', 'Opponent'));

    const mySunk = useMemo(() => {
        const hits = new Set<number>(Object.keys(shotsAtMe).map(Number).filter(c => shotsAtMe[c] === 'hit'));
        return sunkCells(myFleet, hits);
    }, [shotsAtMe, myFleet]);

    const revealed: Fleet | undefined = useMemo(() => {
        const fleets = (verdict?.reveal as Reveal | undefined)?.fleets;
        return fleets?.[humanSide === '1' ? '2' : '1'];
    }, [verdict, humanSide]);

    const enemyView: CellView[] = useMemo(() => Array.from({ length: CELLS }, (_, i) =>
        shotsAtEnemy[i] === 'hit' ? 'hit' : shotsAtEnemy[i] === 'miss' ? 'miss' : revealed && shipAt(revealed, i) ? 'ship' : 'water'), [shotsAtEnemy, revealed]);
    const myFleetView: CellView[] = useMemo(() => Array.from({ length: CELLS }, (_, i) => {
        if (shipAt(myFleet, i)) return mySunk.has(i) ? 'sunk' : shotsAtMe[i] === 'hit' ? 'hit' : 'ship';
        return shotsAtMe[i] === 'miss' ? 'miss' : 'water';
    }), [myFleet, shotsAtMe, mySunk]);

    const writeEnemy = (next: Shots) => { enemyRef.current = next; setShotsAtEnemy(next); };
    const writeMe    = (next: Shots) => { meRef.current = next; setShotsAtMe(next); };

    const handleShot = useCallback((m: ShotView) => {
        if (typeof m?.cell !== 'number') return;
        const mark = m.hit ? 'hit' : 'miss';
        if (m.by === sideRef.current) {
            writeEnemy({ ...enemyRef.current, [m.cell]: mark });
            setFlash(m.hit ? (m.sunk ? t('battleship.youSankTheir', 'You sank their {name}!', { name: m.sunk }) : t('battleship.directHit', 'Direct hit!')) : t('battleship.miss', 'Miss.'));
            setMyTurn(false);
            return;
        }
        writeMe({ ...meRef.current, [m.cell]: mark });
        setFlash(m.hit ? (m.sunk ? t('battleship.theySankYour', 'They sank your {name}!', { name: m.sunk }) : t('battleship.theyHitFleet', 'They hit your fleet!')) : t('battleship.theyMissed', 'They missed.'));
        setMyTurn(true);
    }, []);

    const resetMatch = useCallback((newMode: Mode, side: '1' | '2', diff: Difficulty) => {
        clearTimeout(aiTimer.current);
        recorded.current = false;
        enemyRef.current = {}; meRef.current = {};
        phaseRef.current = 'placing';
        sideRef.current = side;
        setMode(newMode); setHumanSide(side); setDifficulty(diff);
        setMyFleet(randomFleet());
        setEnemyFleet(newMode === 'cpu' ? randomFleet() : null);
        setShotsAtEnemy({}); setShotsAtMe({});
        setPhase('placing'); setMyTurn(false); setThinking(false); setEnded(null); setVerdict(null); setFlash(null);
        setOppDeployed(false);
    }, []);

    useEffect(() => {
        if (mode !== 'cpu' || screen !== 'game' || phase !== 'firing' || over || myTurn) return;
        setThinking(true);
        aiTimer.current = setTimeout(() => {
            setThinking(false);
            const sunk = sunkCells(myFleetRef.current, new Set(Object.keys(meRef.current).map(Number).filter(c => meRef.current[c] === 'hit')));
            const cell = aiNextShot(meRef.current, sunk, difficulty);
            const ship = shipAt(myFleetRef.current, cell);
            const next: Shots = { ...meRef.current, [cell]: ship ? 'hit' : 'miss' };
            writeMe(next);
            if (ship) {
                const hits = new Set<number>(Object.keys(next).map(Number).filter(c => next[c] === 'hit'));
                setFlash(ship.cells.every(c => hits.has(c)) ? t('battleship.theySankYour', 'They sank your {name}!', { name: ship.name }) : t('battleship.theyHitFleet', 'They hit your fleet!'));
            } else setFlash(t('battleship.theyMissed', 'They missed.'));
            setMyTurn(true);
        }, 650 + Math.random() * 450);
        return () => clearTimeout(aiTimer.current);
    }, [mode, screen, phase, over, myTurn, shotsAtMe, difficulty]);

    useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 1700); return () => clearTimeout(t); }, [flash]);

    useEffect(() => {
        if (mode !== 'cpu' || screen !== 'game' || !result || recorded.current) return;
        recorded.current = true;
        void recordResultApi(GAME, mode, result).then(s => { if (s) setStats(s); });
    }, [screen, result, mode]);

    useEffect(() => () => clearTimeout(aiTimer.current), []);

    function startCpu(side: Side, diff: string) {
        const s: '1' | '2' = side === 'random' ? (Math.random() < 0.5 ? '1' : '2') : (side as '1' | '2');
        resetMatch('cpu', s, diff as Difficulty);
        setScreen('game');
    }
    function shuffleFleet() { if (phase === 'placing') setMyFleet(randomFleet()); }
    function confirmPlacement() {
        if (mode === 'online') {
            if (!onlineRef.current) return;
            phaseRef.current = 'waiting';
            setPhase('waiting');
            setMyTurn(false);
            void setupReadyApi(onlineRef.current.gameId, myFleet.map(s => ({ id: s.id, cells: s.cells }))).then(r => {
                if (r.ok || phaseRef.current !== 'waiting') return;
                phaseRef.current = 'placing';
                setPhase('placing');
                if (r.message) setFlash(r.message);
            });
            return;
        }
        phaseRef.current = 'firing';
        setPhase('firing');
        setMyTurn(humanSide === '1');
    }
    function fire(cell: number) {
        if (over || phase !== 'firing' || !myTurn || thinking) return;
        if (enemyRef.current[cell] !== undefined) return;
        if (mode === 'cpu') {
            const ship = shipAt(enemyFleetRef.current ?? [], cell);
            const next: Shots = { ...enemyRef.current, [cell]: ship ? 'hit' : 'miss' };
            writeEnemy(next);
            if (ship) {
                const hits = new Set<number>(Object.keys(next).map(Number).filter(c => next[c] === 'hit'));
                setFlash(ship.cells.every(c => hits.has(c)) ? t('battleship.sunkTheir', 'Sunk their {name}!', { name: ship.name }) : t('battleship.hit', 'Hit!'));
            } else setFlash(t('battleship.miss', 'Miss.'));
            setMyTurn(false);
        } else if (onlineRef.current) {
            setMyTurn(false);
            void moveApi(onlineRef.current.gameId, { cell }).then(r => {
                if (r.ok) return;
                setMyTurn(true);
                if (r.message) setFlash(r.message);
            });
        }
    }

    function openLeaderboard() {
        setScreen('leaderboard'); setLbLoading(true);
        void loadLeaderboard(GAME).then(d => { setLeaderboard(d); setLbLoading(false); });
    }
    function clearGame() {
        clearTimeout(aiTimer.current);
        enemyRef.current = {}; meRef.current = {};
        setShotsAtEnemy({}); setShotsAtMe({}); setPhase('placing'); setMyTurn(false); setThinking(false); setEnded(null); setVerdict(null); setFlash(null);
        setOppDeployed(false);
        phaseRef.current = 'placing';
        recorded.current = false;
    }
    const shotCount = Object.keys(shotsAtEnemy).length + Object.keys(shotsAtMe).length;
    const clock = useTurnClock(
        (phase === 'firing' ? onlineGame?.turnSeconds : onlineGame?.setupSeconds) ?? 0,
        mode === 'online' && screen === 'game' && !over,
        phase === 'firing' ? shotCount : -1,
    );

    const special = (() => {
        const youWin = pot > 0 ? t('battleship.youWinAmount', 'You win ${amount}!', { amount: pot.toLocaleString('en-US') }) : t('battleship.youWin', 'You win!');
        if (mode === 'online' && ended) return (ended.reason === 'resign' ? t('battleship.opponentResigned', 'Opponent resigned. ') : t('battleship.opponentLeft', 'Opponent left. ')) + youWin;
        if (result === 'draw') return pot > 0 ? t('battleship.nobodyDeployedRefunded', 'Nobody deployed. Wager refunded.') : t('battleship.nobodyDeployed', 'Nobody deployed.');
        if (mode === 'online' && verdict?.reason === 'timeout') return result === 'win' ? t('battleship.oppOutOfTime', 'Opponent ran out of time. ') + youWin : t('battleship.youOutOfTime', 'You ran out of time.');
        return null;
    })();

    const baseBanner = (() => {
        if (over) {
            const win = pot > 0 ? t('battleship.youWinAmount', 'You win ${amount}!', { amount: pot.toLocaleString('en-US') }) : t('battleship.victoryFleetSunk', 'Victory! Their fleet is sunk.');
            if (special) return special;
            return result === 'win' ? win : t('battleship.defeatFleetSunk', 'Defeat. Your fleet was sunk.');
        }
        if (phase === 'placing') return t('battleship.positionFleet', 'Position your fleet');
        if (phase === 'waiting') {
            return oppDeployed
                ? t('battleship.startingMatch', 'Starting match…')
                : t('battleship.waitingForOpponent', 'Waiting for {name} to deploy…', { name: oppName });
        }
        if (flash) return flash;
        return myTurn ? t('battleship.yourShot', 'Your shot, fire!') : (thinking ? t('battleship.takingAim', '{name} is taking aim…', { name: oppName }) : t('battleship.oppTurn', "{name}'s turn", { name: oppName }));
    })();
    const lowClock = mode === 'online' && !over && !flash && clock > 0 && clock <= LOW_CLOCK;
    const banner = lowClock ? t('games.withClock', '{text} · {n}s', { text: baseBanner, n: clock }) : baseBanner;
    const resultTitle = special
        ?? (result === 'win' ? (pot > 0 ? t('battleship.youWinAmount', 'You win ${amount}!', { amount: pot.toLocaleString('en-US') }) : t('battleship.victoryFleetSunkShort', 'Victory! Fleet sunk.'))
        : t('battleship.defeatFleetSunk', 'Defeat. Your fleet was sunk.'));

    const startConfig = bsConfig();
    const screenKey = screen === 'lobby' ? (lobby ? 'lobby-room' : 'lobby-hub') : screen;

    return (
        <div className="absolute inset-0 z-10 flex flex-col select-none" style={{ background: 'linear-gradient(180deg, #07223A 0%, #0A2C49 50%, #061A2E 100%)' }}>
            <style>{`@keyframes bs-banner-in { 0% { transform: translateY(8px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }`}</style>

            <div className="shrink-0" style={{ height: SB_H }} />

            {screen !== 'home' && (
                <GameHeader
                    accent="#5FC7DA"
                    onBack={() => { if (screen === 'game' && !over) setConfirmLeave(true); else online.goHome(); }}
                    title={screen === 'lobby' ? (lobby ? t('battleship.lobby', 'Lobby') : t('battleship.playOnline', 'Play Online')) : screen === 'leaderboard' ? t('battleship.leaderboard', 'Leaderboard') : t('battleship.title', 'Battleship')}
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
                <div className="flex min-h-0 flex-1 flex-col items-center px-3">
                    <div className="flex shrink-0 items-center justify-center pt-1.5">
                        <div className="rounded-full px-4 py-1.5" style={{ background: 'rgba(255,255,255,0.10)' }}>
                            <span className="text-[15px] font-bold text-white">{banner}</span>
                        </div>
                    </div>

                    {phase === 'placing' ? (
                        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
                            <Grid cells={myFleetView} cell={PLACE} accent={ACCENT} ships={myFleet} />
                            <div className="flex gap-2.5">
                                <button type="button" onClick={shuffleFleet} className="flex items-center gap-1.5 rounded-[13px] px-4 py-2.5 text-[15px] font-bold text-white active:opacity-80" style={{ background: 'rgba(255,255,255,0.14)' }}>
                                    <Shuffle className="h-[16px] w-[16px]" strokeWidth={2.4} /> {t('battleship.shuffle', 'Shuffle')}
                                </button>
                                <button type="button" onClick={confirmPlacement} className="rounded-[13px] px-6 py-2.5 text-[15px] font-bold text-white active:opacity-80" style={{ background: ACCENT }}>
                                    {t('battleship.deployFleet', 'Deploy Fleet')}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 pt-2" style={{ paddingBottom: 'calc(var(--safe-bottom) + 16px)' }}>
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{t('battleship.enemyWaters', 'Enemy waters')}</div>
                            <Grid cells={enemyView} cell={CELL} accent={ACCENT} onTap={fire} locked={!myTurn || over || thinking} ships={revealed} />
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">{t('battleship.yourFleet', 'Your fleet')}</div>
                            <Grid cells={myFleetView} cell={CELL} accent={ACCENT} ships={myFleet} />
                        </div>
                    )}
                </div>
            )}
            </div>

            {screen === 'game' && over && (
                <GameOverDialog
                    title={resultTitle}
                    accent={ACCENT}
                    onPlayAgain={mode === 'cpu' ? () => startCpu(humanSide, difficulty) : undefined}
                    onReturnToLobby={mode === 'online' && !ended ? online.returnToLobby : undefined}
                    returnDisabled={lobbyGone}
                    onMenu={online.goHome}
                />
            )}

            {confirmLeave && (
                <AlertDialog
                    title={t('battleship.leaveGameTitle', 'Leave Game?')}
                    message={mode === 'online' ? t('battleship.leaveForfeit', 'Leaving will forfeit the match.') : t('battleship.leaveLost', 'Your current game will be lost.')}
                    confirmLabel={t('battleship.leave', 'Leave')}
                    cancelLabel={t('battleship.stay', 'Stay')}
                    destructive
                    forceDark
                    onCancel={() => setConfirmLeave(false)}
                    onConfirm={() => { setConfirmLeave(false); online.goHome(); }}
                />
            )}
        </div>
    );
}
