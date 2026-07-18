import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Trophy } from 'lucide-react';

import { t } from '@/i18n';
import { useGameLoop, type Phase } from '@/apps/_arcade/useGameLoop';
import { useDeckActive } from '@/shell/deckActive';
import { GameOverCard } from '@/apps/_arcade/GameOverCard';
import { GameHeader } from '@/apps/_games/GameHeader';
import { ScoreStartScreen } from '@/apps/_games/ScoreStartScreen';
import { Leaderboard } from '@/apps/_games/Leaderboard';
import { loadScoreboard, loadStats, submitScoreApi, type ScoreEntry } from '@/apps/_games/statsApi';
import { FlappyIcon } from '@/shell/AppIconSVG';
import {
    BIRD_SIZE, BIRD_X, FIELD_H, FIELD_W, FLAP_V, GRAVITY, GROUND_H,
    MAX_FALL, PIPE_GAP, PIPE_SPACING, PIPE_SPEED, PIPE_W,
    hitsPipe, initialPipes, randomGapY, skyH,
    type Pipe,
} from './logic';
import { playCoin, playFlap, playHit } from './sfx';

interface Props { onClose: () => void; }

const GAME = 'flappy';
const ACCENT = '#4EC0CA';
const SB_H = 58;

type Screen = 'menu' | 'game' | 'leaderboard';

const menuWrap = { background: 'radial-gradient(120% 90% at 50% 0%, #0F2E33 0%, #071A1E 60%)', color: '#EAF7F8' };

export function Flappy({ onClose: _onClose }: Props) {
    const [screen, setScreen] = useState<Screen>('menu');
    const [high,   setHigh]   = useState(0);
    const [plays,  setPlays]  = useState(0);
    const [last,   setLast]   = useState(0);
    const [isRecord, setIsRecord] = useState(false);
    const [lb,      setLb]      = useState<ScoreEntry[] | null>(null);
    const [lbLoading, setLbLoading] = useState(false);

    const [phase, setPhase] = useState<Phase>('ready');
    const [score, setScore] = useState(0);

    const [birdY, setBirdY] = useState<number>(skyH() / 2 - BIRD_SIZE / 2);
    const [tilt,  setTilt]  = useState(0);
    const [pipes, setPipes] = useState<Pipe[]>(() => initialPipes());

    const phaseRef = useRef<Phase>(phase);
    phaseRef.current = phase;
    const screenRef = useRef<Screen>(screen);
    screenRef.current = screen;
    const yRef   = useRef(birdY);
    const vRef   = useRef(0);
    const pipesRef = useRef<Pipe[]>(pipes);
    const scoreRef = useRef(0);
    const nextId   = useRef(1000);
    const highRef  = useRef(high);
    highRef.current = high;

    // Load the player's server record once on open.
    useEffect(() => {
        void loadStats(GAME).then(s => { setHigh(s.high ?? 0); setPlays(s.plays ?? 0); setLast(s.last ?? 0); });
    }, []);

    // Dark menu/leaderboard get the light (dark-mode) status bar; the bright-sky game screen keeps
    // the normal dark status bar so the time/battery stay readable.

    function reset() {
        yRef.current = skyH() / 2 - BIRD_SIZE / 2;
        vRef.current = 0;
        scoreRef.current = 0;
        pipesRef.current = initialPipes();
        setBirdY(yRef.current);
        setTilt(0);
        setPipes(pipesRef.current);
        setScore(0);
        setIsRecord(false);
        setPhase('ready');
    }

    function flap() {
        if (screenRef.current !== 'game') return;
        if (phaseRef.current === 'dead') { reset(); return; }
        if (phaseRef.current === 'ready') setPhase('playing');
        vRef.current = FLAP_V;
        playFlap();
    }

    function die() {
        playHit();
        setPhase('dead');
        const finalScore = scoreRef.current;
        // Report the run to the shared high-score board.
        setIsRecord(finalScore > highRef.current);
        void submitScoreApi(GAME, finalScore).then(r => { setHigh(r.best); setIsRecord(r.isRecord); setPlays(r.plays); setLast(r.last); });
    }

    useGameLoop({
        isActive: () => phaseRef.current === 'playing',
        onFrame: (steps) => {
            vRef.current = Math.min(MAX_FALL, vRef.current + GRAVITY * steps);
            yRef.current += vRef.current * steps;

            let scored = 0;
            const moved = pipesRef.current.map(p => {
                const x = p.x - PIPE_SPEED * steps;
                const { gapY, id } = p;
                let done = p.scored;
                if (x + PIPE_W < -20) {
                    const rightMost = Math.max(...pipesRef.current.map(q => q.x));
                    return { id: ++nextId.current, x: rightMost + PIPE_SPACING, gapY: randomGapY(), scored: false };
                }
                if (!done && x + PIPE_W < BIRD_X) { done = true; scored += 1; }
                return { id, x, gapY, scored: done };
            });
            pipesRef.current = moved;

            if (scored > 0) {
                scoreRef.current += scored;
                setScore(scoreRef.current);
                playCoin();
            }

            const floor = skyH() - BIRD_SIZE;
            if (yRef.current < 0) { yRef.current = 0; vRef.current = 0; }
            let dead = false;
            if (yRef.current >= floor) { yRef.current = floor; dead = true; }
            if (!dead) {
                for (const p of moved) {
                    if (hitsPipe(yRef.current, p)) { dead = true; break; }
                }
            }

            setBirdY(yRef.current);
            setTilt(Math.max(-28, Math.min(70, vRef.current * 6)));
            setPipes(moved);

            if (dead) die();
        },
        onIdle: (ts) => {
            if (phaseRef.current === 'ready') {
                const bob = Math.sin(ts / 300) * 6;
                setBirdY(skyH() / 2 - BIRD_SIZE / 2 + bob);
            }
        },
    });

    // Only listen while foreground: a backgrounded but still-mounted game would keep
    // preventDefault-ing Space/ArrowUp and starve text fields in other apps.
    const deckActive = useDeckActive();
    useEffect(() => {
        if (!deckActive) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === ' ' || e.code === 'Space' || e.key === 'ArrowUp') {
                e.preventDefault();
                flap();
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [deckActive]);

    const play = () => { reset(); setScreen('game'); };
    const toMenu = () => { setPhase('ready'); phaseRef.current = 'ready'; setScreen('menu'); };
    const openLeaderboard = () => {
        setScreen('leaderboard'); setLb(null); setLbLoading(true);
        void loadScoreboard(GAME).then(s => { setLb(s); setLbLoading(false); });
    };

    const displayBest = Math.max(high, score);
    const ground = skyH();

    return (
        <div
            className="absolute inset-0 z-10 flex flex-col select-none"
            style={screen === 'game'
                ? { background: 'linear-gradient(180deg, #4EC0CA 0%, #6FD3C9 48%, #9BE3C4 100%)' }
                : menuWrap}
        >
            <style>{`
                @keyframes flappy-pop {
                    0%   { transform: scale(0.6); opacity: 0; }
                    55%  { transform: scale(1.08); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes flappy-float {
                    0%,100% { transform: translateY(0); }
                    50%     { transform: translateY(-6px); }
                }
            `}</style>

            <div className="shrink-0" style={{ height: SB_H }} />

            <div key={screen} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                {screen === 'menu' && (
                    <ScoreStartScreen
                        config={{ icon: FlappyIcon, title: t('flappy.title', 'Flappy'), accent: ACCENT, flavor: t('flappy.flavor', "One tap keeps you airborne. Weave through the pipes, ride the gaps, and don't clip a wing.") }}
                        stats={{ high, plays, last }}
                        onPlay={play}
                        onLeaderboard={openLeaderboard}
                    />
                )}

                {screen === 'leaderboard' && (
                    <>
                        <GameHeader title={t('flappy.title', 'Flappy')} accent={ACCENT} onBack={toMenu} />
                        <Leaderboard variant="score" scores={lb} loading={lbLoading} accent={ACCENT} />
                    </>
                )}

                {screen === 'game' && (
                    <>
                        <div className="relative flex shrink-0 items-center justify-center px-5 pb-1 pt-1">
                            <button
                                type="button"
                                onClick={toMenu}
                                className="absolute left-4 flex items-center text-white active:opacity-60"
                                aria-label={t('games.back', 'Back')}
                            >
                                <ChevronLeft className="h-[28px] w-[28px]" strokeWidth={2.4} />
                            </button>
                            <h1 className="text-[20px] font-extrabold tracking-tight text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.22)' }}>
                                {t('flappy.title', 'Flappy')}
                            </h1>
                        </div>

                        <div className="flex shrink-0 items-center justify-center gap-6 pb-1 pt-2">
                            <div className="flex flex-col items-center">
                                <span className="text-[34px] font-black leading-none text-white" style={{ textShadow: '0 2px 3px rgba(0,0,0,0.22)' }}>
                                    {score}
                                </span>
                                <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/80">{t('flappy.score', 'Score')}</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="flex items-center gap-1.5 text-[34px] font-black leading-none text-white" style={{ textShadow: '0 2px 3px rgba(0,0,0,0.22)' }}>
                                    <Trophy className="h-[24px] w-[24px]" strokeWidth={2.6} />
                                    {displayBest}
                                </span>
                                <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/80">{t('flappy.best', 'Best')}</span>
                            </div>
                        </div>

                        <div className="flex flex-1 items-start justify-center">
                            <div
                                onPointerDown={(e) => { e.preventDefault(); flap(); }}
                                className="relative overflow-hidden rounded-[26px]"
                                style={{
                                    width: FIELD_W,
                                    height: FIELD_H,
                                    background: 'linear-gradient(180deg, #79D2DC 0%, #A6E6D8 70%, #C9F0DD 100%)',
                                    boxShadow: 'inset 0 2px 10px rgba(255,255,255,0.45), 0 12px 28px rgba(20,80,90,0.28)',
                                    touchAction: 'none',
                                    cursor: 'pointer',
                                }}
                            >
                                <div className="pointer-events-none absolute left-7 top-12 h-7 w-16 rounded-full bg-white/55" />
                                <div className="pointer-events-none absolute right-10 top-24 h-6 w-14 rounded-full bg-white/45" />
                                <div className="pointer-events-none absolute left-24 top-40 h-5 w-12 rounded-full bg-white/35" />

                                {pipes.map(p => (
                                    <PipePair key={p.id} x={p.x} gapY={p.gapY} skyHeight={ground} />
                                ))}

                                <div
                                    className="absolute inset-x-0 bottom-0 overflow-hidden"
                                    style={{ height: GROUND_H, background: 'linear-gradient(180deg, #DED27A 0%, #C9B962 100%)' }}
                                >
                                    <div className="absolute inset-x-0 top-0 h-2.5" style={{ background: 'linear-gradient(180deg, #8FD66B, #6FBF4E)' }} />
                                    <div className="absolute inset-x-0 top-2.5 flex">
                                        {Array.from({ length: 22 }).map((_, i) => (
                                            <span key={i} className="h-2 flex-1" style={{ background: i % 2 ? '#C2B257' : '#D2C268' }} />
                                        ))}
                                    </div>
                                </div>

                                <Bird y={birdY} tilt={phase === 'ready' ? 0 : tilt} flapping={phase === 'ready'} />

                                {phase === 'ready' && (
                                    <Overlay>
                                        <div className="text-[26px] font-black text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
                                            {t('flappy.tapToStart', 'Tap to start')}
                                        </div>
                                        <p className="mt-2 max-w-[230px] text-center text-[13px] font-semibold leading-snug text-white/90">
                                            {t('flappy.tapHint', "Tap (or press Space) to flap. Fly through the gaps — don't hit a pipe or the ground.")}
                                        </p>
                                    </Overlay>
                                )}

                                {phase === 'dead' && (
                                    <Overlay>
                                        <GameOverCard
                                            title={t('flappy.gameOver', 'Game Over')}
                                            accent="#E0833B"
                                            sub="#6B7980"
                                            ink="#1F2A30"
                                            cardBg="rgba(255,255,255,0.92)"
                                            cardShadow="0 10px 30px rgba(0,0,0,0.25)"
                                            pop="flappy-pop 0.32s ease-out"
                                            stats={[
                                                { label: t('flappy.score', 'Score'), value: score },
                                                { label: t('flappy.best', 'Best'), value: displayBest, highlight: isRecord },
                                            ]}
                                            newBest={isRecord}
                                            newBestLabel={t('flappy.newBest', 'New best!')}
                                            playAgainLabel={t('flappy.tapToPlayAgain', 'Tap to play again')}
                                            playAgainColor="#4EC0CA"
                                            onPlayAgain={reset}
                                        >
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); toMenu(); }}
                                                className="mt-3 text-[14px] font-semibold text-[#6B7980] active:opacity-70"
                                            >
                                                {t('games.menu', 'Menu')}
                                            </button>
                                        </GameOverCard>
                                    </Overlay>
                                )}
                            </div>
                        </div>

                        <div className="shrink-0" style={{ height: 24 }} />
                    </>
                )}
            </div>
        </div>
    );
}

function Bird({ y, tilt, flapping }: { y: number; tilt: number; flapping: boolean }) {
    return (
        <div
            className="pointer-events-none absolute z-20"
            style={{
                left: BIRD_X,
                top: y,
                width: BIRD_SIZE,
                height: BIRD_SIZE,
                transform: `rotate(${tilt}deg)`,
                transition: 'transform 0.08s linear',
                filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.25))',
                animation: flapping ? 'flappy-float 0.9s ease-in-out infinite' : undefined,
            }}
        >
            <svg viewBox="0 0 40 40" width={BIRD_SIZE} height={BIRD_SIZE}>
                <defs>
                    <radialGradient id="fb-body" cx="38%" cy="32%" r="75%">
                        <stop offset="0%" stopColor="#FFE27A" />
                        <stop offset="60%" stopColor="#FBC531" />
                        <stop offset="100%" stopColor="#E8A317" />
                    </radialGradient>
                </defs>
                <path d="M6,20 L0,13 L2,20 L0,27 Z" fill="#E8A317" />
                <circle cx="21" cy="20" r="16" fill="url(#fb-body)" stroke="rgba(160,100,10,0.35)" strokeWidth="1.4" />
                <ellipse cx="17" cy="24" rx="8" ry="5.2" fill="#F7B500" stroke="rgba(160,100,10,0.3)" strokeWidth="1" />
                <ellipse cx="22" cy="27" rx="9" ry="5.5" fill="#FFF0B8" opacity="0.55" />
                <circle cx="28" cy="15" r="6" fill="#fff" />
                <circle cx="30" cy="15" r="3" fill="#23303A" />
                <circle cx="29" cy="14" r="1" fill="#fff" />
                <path d="M33,19 L41,21 L33,24 Z" fill="#F06A2A" />
                <path d="M33,22 L40,22.5 L33,25 Z" fill="#D8541C" />
            </svg>
        </div>
    );
}

function PipePair({ x, gapY, skyHeight }: { x: number; gapY: number; skyHeight: number }) {
    const topH = gapY;
    const botY = gapY + PIPE_GAP;
    const botH = skyHeight - botY;
    const body = 'linear-gradient(90deg, #5FB13B 0%, #7CCB55 38%, #62B53E 70%, #4E9A30 100%)';
    const lipShadow = 'inset 0 -3px 0 rgba(0,0,0,0.12), inset 0 2px 0 rgba(255,255,255,0.35)';

    return (
        <div className="pointer-events-none absolute top-0 z-10" style={{ left: x, width: PIPE_W }}>
            <div className="absolute left-0 top-0" style={{ width: PIPE_W, height: Math.max(0, topH) }}>
                <div className="absolute inset-x-0 top-0 rounded-b-none" style={{ height: '100%', background: body, borderRight: '2px solid rgba(0,0,0,0.08)' }} />
                <div className="absolute inset-x-[-4px] bottom-0 rounded-[4px]" style={{ height: 18, background: body, boxShadow: lipShadow, border: '1px solid rgba(0,0,0,0.08)' }} />
            </div>
            <div className="absolute left-0" style={{ top: botY, width: PIPE_W, height: Math.max(0, botH) }}>
                <div className="absolute inset-x-0 top-0" style={{ height: '100%', background: body, borderRight: '2px solid rgba(0,0,0,0.08)' }} />
                <div className="absolute inset-x-[-4px] top-0 rounded-[4px]" style={{ height: 18, background: body, boxShadow: lipShadow, border: '1px solid rgba(0,0,0,0.08)' }} />
            </div>
        </div>
    );
}

function Overlay({ children }: { children: React.ReactNode }) {
    return (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center" style={{ background: 'rgba(20,70,80,0.18)' }}>
            {children}
        </div>
    );
}
