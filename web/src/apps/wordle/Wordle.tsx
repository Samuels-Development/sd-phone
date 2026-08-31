import { useCallback, useEffect, useRef, useState } from 'react';

import { AlertDialog } from '@/ui/AlertDialog';
import { WordleIcon } from '@/shell/AppIconSVG';
import { SoloGame } from './SoloGame';
import { OnlineMatch } from './OnlineMatch';
import { StartScreen, type GameStartConfig } from '@/apps/_games/StartScreen';
import { OnlineHub } from '@/apps/_games/OnlineHub';
import { LobbyRoom } from '@/apps/_games/LobbyRoom';
import { Leaderboard } from '@/apps/_games/Leaderboard';
import { finishApi, registerGameSides, reportResultApi, type Side } from '@/apps/_games/onlineApi';
import { useOnlineLobby } from '@/apps/_games/useOnlineLobby';
import { loadLeaderboard, loadStats as loadServerStats, recordResultApi, type GameLeaderboard, type GameStats } from '@/apps/_games/statsApi';
import { GameHeader } from '@/apps/_games/GameHeader';
import { t } from '@/i18n';

interface Props { onClose: () => void; }

const SB_H = 54;
const GAME   = 'wordle';
const ACCENT = '#6AAA64';
registerGameSides(GAME, ['a', 'b']);

type Screen = 'home' | 'solo' | 'lobby' | 'game' | 'leaderboard';

const PAL: Record<string, string> = {
    bg: '#121213', card: '#1E1E20', text: '#FFFFFF', sub: '#818384',
    border: '#3A3A3C', borderLit: '#565758', keyBg: '#818384', keyText: '#FFFFFF',
    track: '#2A2A2C', correct: ACCENT, present: '#C9B458', absent: '#3A3A3C', danger: '#E0413B',
};

const wordleConfig = (): GameStartConfig => ({
    icon: WordleIcon,
    title: t('wordle.title', 'Penta'),
    accent: ACCENT,
    sideOptions: [{ id: 'a', label: t('wordle.player1', 'Player 1') }, { id: 'b', label: t('wordle.player2', 'Player 2') }, { id: 'random', label: t('wordle.random', 'Random') }],
    onlineBlurb: t('wordle.onlineBlurb', 'Create or join a lobby, set a wager, and race a friend to the same word.'),
    soloLabel: t('wordle.solo', 'Solo'),
    soloBlurb: t('wordle.soloBlurb', 'Guess the 5-letter word in 6 tries, and beat the 2:00 clock.'),
    hideSetup: true,
});
const sideLabel = (s: Side) => (s === 'random' ? t('wordle.random', 'Random') : s === 'a' ? t('wordle.player1', 'Player 1') : t('wordle.player2', 'Player 2'));

export function Wordle({ onClose: _onClose }: Props) {
    const [screen, setScreen] = useState<Screen>('home');

    const [serverStats, setServerStats] = useState<GameStats>(() => ({ cpu: { wins: 0, losses: 0, draws: 0 }, online: { wins: 0, losses: 0, draws: 0 }, won: 0, lost: 0 }));
    const [soloSeed, setSoloSeed] = useState(0);

    const [ended,    setEnded]    = useState(false);
    const [resolved, setResolved] = useState(false);
    const [confirmLeave, setConfirmLeave] = useState(false);
    const [leaderboard, setLeaderboard] = useState<GameLeaderboard | null>(null);
    const [lbLoading, setLbLoading] = useState(false);

    const endedRef  = useRef(ended);      useEffect(() => { endedRef.current = ended; }, [ended]);
    const recordedRef = useRef(false);

    useEffect(() => { void loadServerStats(GAME).then(setServerStats); }, []);

    const online = useOnlineLobby(GAME, {
        onStart: () => {
            recordedRef.current = false; setResolved(false); setEnded(false);
            setScreen('game');
        },
        onEnded: () => setEnded(true),
        onReset: () => {
            recordedRef.current = false;
            setEnded(false); setResolved(false);
            setScreen('lobby');
        },
        onHome: () => {
            setEnded(false); setResolved(false);
            setScreen('home');
            void loadServerStats(GAME).then(setServerStats);
        },
        onStats: setServerStats,
        inLobbyScreen: screen === 'lobby',
        matchOver: resolved || ended,
    });
    const { lobby, lobbies, incoming, hubError, inviteError, lobbyGone, onlineGame } = online;

    const onlineRef = useRef(onlineGame);
    onlineRef.current = onlineGame;


    function startSolo() { setSoloSeed(s => s + 1); setScreen('solo'); }

    function finishSolo(won: boolean) {
        void recordResultApi(GAME, 'cpu', won ? 'win' : 'loss').then(s => { if (s) setServerStats(s); });
    }

    const onMatchResult = useCallback((r: 'win' | 'loss' | 'draw') => {
        setResolved(true);
        if (recordedRef.current) return;
        recordedRef.current = true;
        void recordResultApi(GAME, 'online', r).then(s => { if (s) setServerStats(s); });
        const og = onlineRef.current;
        if (og && !endedRef.current) { finishApi(og.gameId); if (og.pot > 0) reportResultApi(og.gameId, r); }
    }, []);

    function openLeaderboard() {
        setScreen('leaderboard');
        setLbLoading(true);
        void loadLeaderboard(GAME).then(d => { setLeaderboard(d); setLbLoading(false); });
    }

    const startConfig = wordleConfig();
    const inMatch = screen === 'game' && !resolved && !ended;
    const title = screen === 'lobby' ? (lobby ? t('wordle.lobby', 'Lobby') : t('wordle.playOnline', 'Play Online')) : screen === 'leaderboard' ? t('wordle.leaderboard', 'Leaderboard') : t('wordle.title', 'Penta');

    return (
        <div className="absolute inset-0 z-10 flex flex-col select-none" style={{ backgroundColor: PAL.bg, color: PAL.text }}>
            <style>{`
                @keyframes wordle-flip { 0% { transform: rotateX(0deg); } 49% { transform: rotateX(90deg); } 50% { transform: rotateX(90deg); } 100% { transform: rotateX(0deg); } }
                @keyframes wordle-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-5px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
                @keyframes wordle-pop { 0% { transform: scale(0.85); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }
                @keyframes wordle-banner-in { 0% { transform: translateY(10px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
            `}</style>

            <div className="shrink-0" style={{ height: SB_H }} />

            {screen !== 'home' && (
                <GameHeader
                    accent={ACCENT}
                    onBack={() => { if (inMatch) setConfirmLeave(true); else online.goHome(); }}
                    title={title}
                />
            )}

            <div key={screen} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                {screen === 'home' && (
                    <StartScreen config={startConfig} stats={serverStats} hasInvite={!!incoming} onPlayCpu={() => startSolo()} onPlayOnline={() => setScreen('lobby')} onLeaderboard={openLeaderboard} />
                )}

                {screen === 'solo' && (
                    <SoloGame key={soloSeed} pal={PAL} onFinish={finishSolo} onNew={startSolo} />
                )}

                {screen === 'lobby' && (lobby ? (
                    <LobbyRoom lobby={lobby} inviteError={inviteError} accent={ACCENT} sideLabel={sideLabel} wagered currency="bank" onInvite={online.invite} onStart={online.start} onLeave={online.leave} onKick={online.kick} onSetWager={online.setWager} onSetReady={online.ready} />
                ) : (
                    <OnlineHub lobbies={lobbies} incoming={incoming} error={hubError} accent={ACCENT} sideOptions={startConfig.sideOptions} wagered chooseSide={false} currency="bank" onCreate={online.create} onJoin={online.join} onAccept={online.accept} onDecline={online.decline} onRefresh={online.refresh} />
                ))}

                {screen === 'leaderboard' && (
                    <Leaderboard data={leaderboard} loading={lbLoading} accent={ACCENT} cpuLabel={t('wordle.solo', 'Solo')} />
                )}

                {screen === 'game' && onlineGame && (
                    <OnlineMatch pal={PAL} dk gameId={onlineGame.gameId} opponent={onlineGame.opponent} pot={onlineGame.pot} oppLeft={ended} onResult={onMatchResult} onRematch={online.returnToLobby} onMenu={online.goHome} rematchDisabled={lobbyGone} />
                )}
            </div>

            {confirmLeave && (
                <AlertDialog
                    title={t('wordle.leaveMatchTitle', 'Leave the match?')}
                    message={t('wordle.leaveMatchMessage', 'Leaving forfeits the match and your wager.')}
                    confirmLabel={t('wordle.leave', 'Leave')} cancelLabel={t('wordle.stay', 'Stay')} destructive
                    onCancel={() => setConfirmLeave(false)}
                    onConfirm={() => { setConfirmLeave(false); online.goHome(); }}
                />
            )}
        </div>
    );
}
