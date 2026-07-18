import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, Trophy } from 'lucide-react';

import { t } from '@/i18n';
import { useGameLoop, type Phase } from '@/apps/_arcade/useGameLoop';
import { useDeckActive } from '@/shell/deckActive';
import { GameOverCard } from '@/apps/_arcade/GameOverCard';
import { GameHeader } from '@/apps/_games/GameHeader';
import { ScoreStartScreen } from '@/apps/_games/ScoreStartScreen';
import { Leaderboard } from '@/apps/_games/Leaderboard';
import { loadScoreboard, loadStats, submitScoreApi, type ScoreEntry } from '@/apps/_games/statsApi';
import { ClimberIcon } from '@/shell/AppIconSVG';

import {
    BOUNCE_V, CHAR_H, CHAR_W, FIELD_H, FIELD_W, GRAVITY, MAX_FALL, MOVE_SPEED, MOVING_SPEED,
    PLAT_GAP_MAX, PLAT_H, PLAT_W, SCROLL_LINE,
    initialPlatforms, landsOn, makePlatformAbove,
    type Platform,
} from './logic';

interface Props { onClose: () => void; }

const GAME = 'climber';
const ACCENT = '#6BA53B';
const SB_H = 54;

const START_X = FIELD_W / 2 - CHAR_W / 2;
const START_Y = FIELD_H - 70 - CHAR_H;

const PAL = {
    sky0: '#EAF7E0',
    sky1: '#D2EFC4',
    sky2: '#B9E6A8',
    field0: '#F4FBEE',
    field1: '#E3F4D6',
    accent: '#6BA53B',
    accentDeep: '#4E8A28',
    ink: '#2E4318',
};
const menuWrap = { background: 'radial-gradient(120% 90% at 50% 0%, #1B2E12 0%, #0B1507 60%)', color: '#EAF7E0' };

type Screen = 'menu' | 'game' | 'leaderboard';

export function Climber({ onClose: _onClose }: Props) {
    const [screen, setScreen] = useState<Screen>('menu');
    const [high,   setHigh]   = useState(0);
    const [plays,  setPlays]  = useState(0);
    const [last,   setLast]   = useState(0);
    const [isRecord, setIsRecord] = useState(false);
    const [lb,      setLb]      = useState<ScoreEntry[] | null>(null);
    const [lbLoading, setLbLoading] = useState(false);

    const [phase, setPhase] = useState<Phase>('ready');
    const [score, setScore] = useState(0);

    const [charX, setCharX]   = useState(START_X);
    const [charY, setCharY]   = useState(START_Y);
    const [facing, setFacing] = useState<1 | -1>(1);
    const [squash, setSquash] = useState(0);
    const [plats, setPlats]   = useState<Platform[]>(() => initialPlatforms(START_X));

    const phaseRef = useRef<Phase>(phase);
    phaseRef.current = phase;
    const screenRef = useRef<Screen>(screen);
    screenRef.current = screen;
    const xRef = useRef(charX);
    const yRef = useRef(charY);
    const vRef = useRef(0);
    const platsRef = useRef<Platform[]>(plats);
    const heightRef = useRef(0);
    const scoreRef = useRef(0);
    const topYRef = useRef(0);
    const squashRef = useRef(0);
    const inputRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
    const highRef = useRef(high);
    highRef.current = high;

    // Load the player's server record once on open.
    useEffect(() => {
        void loadStats(GAME).then(s => { setHigh(s.high ?? 0); setPlays(s.plays ?? 0); setLast(s.last ?? 0); });
    }, []);

    // Dark menu/leaderboard get the light (dark-mode) status bar; the bright-sky game screen keeps
    // the normal dark status bar so the time/battery stay readable.

    function commitTop(list: Platform[]) {
        let min = Infinity;
        for (const p of list) if (p.y < min) min = p.y;
        topYRef.current = min;
    }

    function reset() {
        const init = initialPlatforms(START_X);
        xRef.current = START_X;
        yRef.current = START_Y;
        vRef.current = 0;
        heightRef.current = 0;
        scoreRef.current = 0;
        squashRef.current = 0;
        platsRef.current = init;
        inputRef.current = { left: false, right: false };
        commitTop(init);
        setCharX(START_X);
        setCharY(START_Y);
        setFacing(1);
        setSquash(0);
        setPlats(init);
        setScore(0);
        setIsRecord(false);
        setPhase('ready');
    }

    function begin() {
        if (screenRef.current !== 'game') return;
        if (phaseRef.current === 'dead') { reset(); return; }
        if (phaseRef.current === 'ready') {
            vRef.current = BOUNCE_V;
            setPhase('playing');
        }
    }

    function die() {
        setPhase('dead');
        const finalScore = Math.floor(heightRef.current);
        // Report the run to the shared high-score board.
        setIsRecord(finalScore > highRef.current);
        void submitScoreApi(GAME, finalScore).then(r => { setHigh(r.best); setIsRecord(r.isRecord); setPlays(r.plays); setLast(r.last); });
    }

    useGameLoop({
        isActive: () => phaseRef.current === 'playing',
        onFrame: (steps) => {
            let dx = 0;
            if (inputRef.current.left)  dx -= MOVE_SPEED * steps;
            if (inputRef.current.right) dx += MOVE_SPEED * steps;
            if (dx !== 0) setFacing(dx < 0 ? -1 : 1);
            let nx = xRef.current + dx;
            const center = nx + CHAR_W / 2;
            if (center < 0)        nx += FIELD_W;
            else if (center > FIELD_W) nx -= FIELD_W;
            xRef.current = nx;

            const prevBottom = yRef.current + CHAR_H;
            vRef.current = Math.min(MAX_FALL, vRef.current + GRAVITY * steps);
            yRef.current += vRef.current * steps;
            const bottom = yRef.current + CHAR_H;
            const left = xRef.current;
            const right = xRef.current + CHAR_W;

            const moved = platsRef.current.map((p) => {
                let { x, dir } = p;
                if (p.kind === 'moving' && !p.dead) {
                    x += dir * MOVING_SPEED * steps;
                    if (x <= 0) { x = 0; dir = 1; }
                    else if (x >= FIELD_W - PLAT_W) { x = FIELD_W - PLAT_W; dir = -1; }
                }
                return dir === p.dir && x === p.x ? p : { ...p, x, dir };
            });

            if (vRef.current > 0) {
                for (const p of moved) {
                    if (landsOn(prevBottom, bottom, left, right, p)) {
                        vRef.current = BOUNCE_V;
                        yRef.current = p.y - CHAR_H;
                        squashRef.current = 1;
                        if (p.kind === 'breakable') p.dead = true;
                        break;
                    }
                }
            }
            squashRef.current = Math.max(0, squashRef.current - 0.12 * steps);

            if (yRef.current < SCROLL_LINE) {
                const shift = SCROLL_LINE - yRef.current;
                yRef.current = SCROLL_LINE;
                heightRef.current += shift / 10;
                for (const p of moved) p.y += shift;
                topYRef.current += shift;
            }

            const kept = moved.filter((p) => p.y < FIELD_H + 30 && !(p.dead && p.y > yRef.current));
            let topY = Infinity;
            for (const p of kept) if (p.y < topY) topY = p.y;
            if (!isFinite(topY)) topY = topYRef.current;
            while (topY > -PLAT_GAP_MAX) {
                const np = makePlatformAbove(topY, heightRef.current);
                kept.push(np);
                topY = np.y;
            }
            platsRef.current = kept;
            topYRef.current = topY;

            const sc = Math.floor(heightRef.current);
            if (sc !== scoreRef.current) { scoreRef.current = sc; setScore(sc); }

            let dead = false;
            if (yRef.current > FIELD_H + 4) dead = true;

            setCharX(xRef.current);
            setCharY(yRef.current);
            setSquash(squashRef.current);
            setPlats(kept);

            if (dead) die();
        },
        onIdle: (ts) => {
            if (phaseRef.current === 'ready') {
                const bob = Math.sin(ts / 360) * 5;
                setCharY(START_Y + bob);
            }
        },
    });

    // Only listen while foreground: a backgrounded but still-mounted game would keep
    // preventDefault-ing arrows/Space and starve text fields in other apps.
    const deckActive = useDeckActive();
    useEffect(() => {
        if (!deckActive) return;
        function onDown(e: KeyboardEvent) {
            if (screenRef.current !== 'game') return;
            if (e.key === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); inputRef.current.left = true; begin(); }
            else if (e.key === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); inputRef.current.right = true; begin(); }
            else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); begin(); }
        }
        function onUp(e: KeyboardEvent) {
            if (e.key === 'ArrowLeft' || e.code === 'KeyA') inputRef.current.left = false;
            else if (e.key === 'ArrowRight' || e.code === 'KeyD') inputRef.current.right = false;
        }
        window.addEventListener('keydown', onDown);
        window.addEventListener('keyup', onUp);
        return () => {
            window.removeEventListener('keydown', onDown);
            window.removeEventListener('keyup', onUp);
        };
    }, [deckActive]);

    const play = () => { reset(); setScreen('game'); };
    const toMenu = () => { setPhase('ready'); phaseRef.current = 'ready'; setScreen('menu'); };
    const openLeaderboard = () => {
        setScreen('leaderboard'); setLb(null); setLbLoading(true);
        void loadScoreboard(GAME).then(s => { setLb(s); setLbLoading(false); });
    };

    const displayBest = Math.max(high, score);

    return (
        <div
            className="absolute inset-0 z-10 flex flex-col select-none"
            style={screen === 'game'
                ? { background: `linear-gradient(180deg, ${PAL.sky0} 0%, ${PAL.sky1} 50%, ${PAL.sky2} 100%)` }
                : menuWrap}
        >
            <style>{`
                @keyframes climber-pop {
                    0%   { transform: scale(0.6); opacity: 0; }
                    55%  { transform: scale(1.08); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
            `}</style>

            <div className="shrink-0" style={{ height: SB_H }} />

            <div key={screen} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                {screen === 'menu' && (
                    <ScoreStartScreen
                        config={{ icon: ClimberIcon, title: t('climber.title', 'Climber'), accent: ACCENT, flavor: t('climber.flavor', 'You bounce on your own — steer left and right, hop from platform to platform, and climb as high as you can.') }}
                        stats={{ high, plays, last }}
                        onPlay={play}
                        onLeaderboard={openLeaderboard}
                    />
                )}

                {screen === 'leaderboard' && (
                    <>
                        <GameHeader title={t('climber.title', 'Climber')} accent={ACCENT} onBack={toMenu} />
                        <Leaderboard variant="score" scores={lb} loading={lbLoading} accent={ACCENT} />
                    </>
                )}

                {screen === 'game' && (
                    <>
                        <div className="relative flex shrink-0 items-center justify-center px-5 pb-1 pt-1">
                            <button
                                type="button"
                                onClick={toMenu}
                                className="absolute left-3 flex items-center active:opacity-60"
                                style={{ color: PAL.accentDeep }}
                                aria-label={t('games.back', 'Back')}
                            >
                                <ChevronLeft className="h-[28px] w-[28px]" strokeWidth={2.4} />
                            </button>
                            <h1 className="text-[20px] font-extrabold tracking-tight" style={{ color: PAL.ink }}>
                                {t('climber.title', 'Climber')}
                            </h1>
                        </div>

                        <div className="flex shrink-0 items-center justify-center gap-6 pb-2 pt-1">
                            <div className="flex flex-col items-center">
                                <span className="text-[34px] font-black leading-none tabular-nums" style={{ color: PAL.ink }}>
                                    {score}
                                </span>
                                <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: PAL.accentDeep }}>{t('climber.metres', 'Metres')}</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="flex items-center gap-1 text-[20px] font-extrabold leading-none tabular-nums" style={{ color: PAL.accentDeep }}>
                                    <Trophy className="h-[15px] w-[15px]" strokeWidth={2.6} />
                                    {displayBest}
                                </span>
                                <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: PAL.accentDeep }}>{t('climber.best', 'Best')}</span>
                            </div>
                        </div>

                        <div className="flex flex-1 items-start justify-center">
                            <div
                                onPointerDown={(e) => { e.preventDefault(); if (phase !== 'playing') begin(); }}
                                className="relative overflow-hidden rounded-[26px]"
                                style={{
                                    width: FIELD_W,
                                    height: FIELD_H,
                                    background: `linear-gradient(180deg, ${PAL.field0} 0%, ${PAL.field1} 100%)`,
                                    boxShadow: 'inset 0 2px 10px rgba(255,255,255,0.6), 0 12px 28px rgba(60,100,30,0.22)',
                                    touchAction: 'none',
                                    cursor: 'pointer',
                                }}
                            >
                                <div className="pointer-events-none absolute left-8 top-16 h-7 w-16 rounded-full bg-white/55" />
                                <div className="pointer-events-none absolute right-12 top-32 h-6 w-14 rounded-full bg-white/45" />
                                <div className="pointer-events-none absolute left-24 top-56 h-5 w-12 rounded-full bg-white/40" />

                                {plats.map((p) => (
                                    <PlatformView key={p.id} p={p} />
                                ))}

                                <Character x={charX} y={charY} facing={facing} squash={squash} idle={phase === 'ready'} />

                                {phase === 'ready' && (
                                    <Overlay>
                                        <div className="text-[26px] font-black" style={{ color: PAL.ink }}>
                                            {t('climber.tapToStart', 'Tap to start')}
                                        </div>
                                        <p className="mt-2 max-w-[240px] text-center text-[13px] font-semibold leading-snug" style={{ color: PAL.accentDeep }}>
                                            {t('climber.instructions', 'You bounce automatically — just steer with the arrows to land on platforms and climb as high as you can.')}
                                        </p>
                                    </Overlay>
                                )}

                                {phase === 'dead' && (
                                    <Overlay>
                                        <GameOverCard
                                            title={t('climber.gameOver', 'Game Over')}
                                            accent={PAL.accentDeep}
                                            sub={PAL.accentDeep}
                                            ink={PAL.ink}
                                            cardBg="rgba(255,255,255,0.94)"
                                            cardShadow="0 10px 30px rgba(0,0,0,0.22)"
                                            pop="climber-pop 0.32s ease-out"
                                            stats={[
                                                { label: t('climber.metres', 'Metres'), value: score },
                                                { label: t('climber.best', 'Best'), value: displayBest, highlight: isRecord },
                                            ]}
                                            newBest={isRecord}
                                            newBestLabel={t('climber.newBest', 'New best!')}
                                            playAgainLabel={t('climber.tapToPlayAgain', 'Tap to play again')}
                                            playAgainColor={PAL.accent}
                                            onPlayAgain={reset}
                                        >
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); toMenu(); }}
                                                className="mt-3 text-[14px] font-semibold active:opacity-70"
                                                style={{ color: PAL.accentDeep }}
                                            >
                                                {t('games.menu', 'Menu')}
                                            </button>
                                        </GameOverCard>
                                    </Overlay>
                                )}
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center justify-center gap-5 pb-6 pt-3">
                            <SteerButton
                                label={t('climber.left', 'Left')}
                                onPress={(v) => { inputRef.current.left = v; if (v) begin(); }}
                            >
                                <ArrowLeft className="h-7 w-7" strokeWidth={3} />
                            </SteerButton>
                            <SteerButton
                                label={t('climber.right', 'Right')}
                                onPress={(v) => { inputRef.current.right = v; if (v) begin(); }}
                            >
                                <ArrowRight className="h-7 w-7" strokeWidth={3} />
                            </SteerButton>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function SteerButton({
    label, onPress, children,
}: { label: string; onPress: (down: boolean) => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            onPointerDown={(e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); onPress(true); }}
            onPointerUp={(e) => { e.preventDefault(); onPress(false); }}
            onPointerCancel={() => onPress(false)}
            onPointerLeave={() => onPress(false)}
            onContextMenu={(e) => e.preventDefault()}
            className="flex h-16 w-[120px] items-center justify-center rounded-[20px] text-white transition active:scale-95"
            style={{
                background: `linear-gradient(180deg, ${PAL.accent} 0%, ${PAL.accentDeep} 100%)`,
                boxShadow: '0 6px 14px rgba(60,100,30,0.32), inset 0 1px 0 rgba(255,255,255,0.35)',
                touchAction: 'none',
            }}
        >
            {children}
        </button>
    );
}

function PlatformView({ p }: { p: Platform }) {
    if (p.dead) return null;
    const body =
        p.kind === 'breakable'
            ? 'linear-gradient(180deg, #E8A04B 0%, #CC7F2E 100%)'
            : p.kind === 'moving'
                ? 'linear-gradient(180deg, #5BB3D6 0%, #3E8FB5 100%)'
                : 'linear-gradient(180deg, #8FD16A 0%, #6BA53B 100%)';
    return (
        <div
            className="pointer-events-none absolute z-10 rounded-[8px]"
            style={{
                left: p.x,
                top: p.y,
                width: PLAT_W,
                height: PLAT_H,
                background: body,
                boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.45), 0 2px 4px rgba(40,70,20,0.25)',
                border: '1px solid rgba(40,70,20,0.12)',
            }}
        >
            {p.kind === 'breakable' && (
                <div
                    className="absolute inset-0 rounded-[8px]"
                    style={{
                        background:
                            'repeating-linear-gradient(115deg, transparent 0 9px, rgba(120,60,10,0.28) 9px 10.5px)',
                    }}
                />
            )}
        </div>
    );
}

function Character({
    x, y, facing, squash, idle,
}: { x: number; y: number; facing: 1 | -1; squash: number; idle: boolean }) {
    const sx = 1 + squash * 0.18;
    const sy = 1 - squash * 0.2;
    return (
        <div
            className="pointer-events-none absolute z-20"
            style={{
                left: x,
                top: y,
                width: CHAR_W,
                height: CHAR_H,
                transform: `scaleX(${facing * sx}) scaleY(${sy})`,
                transformOrigin: 'center bottom',
                filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.22))',
            }}
        >
            <svg viewBox="0 0 42 46" width={CHAR_W} height={CHAR_H}>
                <defs>
                    <radialGradient id="cl-body" cx="40%" cy="32%" r="78%">
                        <stop offset="0%" stopColor="#C8F08F" />
                        <stop offset="60%" stopColor="#9AD85C" />
                        <stop offset="100%" stopColor="#74B43A" />
                    </radialGradient>
                </defs>
                <ellipse cx="14" cy="44" rx="6" ry="3" fill="#5E9430" />
                <ellipse cx="28" cy="44" rx="6" ry="3" fill="#5E9430" />
                <rect x="5" y="5" width="32" height="36" rx="15" fill="url(#cl-body)" stroke="rgba(70,110,30,0.4)" strokeWidth="1.4" />
                <ellipse cx="21" cy="30" rx="11" ry="8" fill="#E4F8C2" opacity="0.5" />
                <circle cx="15" cy="19" r="5.5" fill="#fff" />
                <circle cx="27" cy="19" r="5.5" fill="#fff" />
                <circle cx={idle ? 16 : 17} cy="20" r="2.6" fill="#23381A" />
                <circle cx={idle ? 28 : 29} cy="20" r="2.6" fill="#23381A" />
                <circle cx={idle ? 15 : 16} cy="18.5" r="0.9" fill="#fff" />
                <circle cx={idle ? 27 : 28} cy="18.5" r="0.9" fill="#fff" />
                <circle cx="10" cy="27" r="2.6" fill="#F5A9B8" opacity="0.6" />
                <circle cx="32" cy="27" r="2.6" fill="#F5A9B8" opacity="0.6" />
                <path d="M16,29 Q21,33 26,29" fill="none" stroke="#3A5A22" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
        </div>
    );
}

function Overlay({ children }: { children: React.ReactNode }) {
    return (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center" style={{ background: 'rgba(80,120,40,0.14)' }}>
            {children}
        </div>
    );
}
