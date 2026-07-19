import { useEffect, useRef, useState } from 'react';
import { BarChart3, Check, ChevronDown, ChevronLeft, ChevronUp, Coins, Crown, MoveHorizontal, RotateCcw, ShoppingBag, Trophy } from 'lucide-react';

import { useIosPush } from '@/hooks/useIosPush';
import { useGameLoop, type Phase } from '@/apps/_arcade/useGameLoop';
import { useDeckActive } from '@/shell/deckActive';
import { useGameToasts, GameToasts } from '@/apps/_arcade/GameToasts';
import { GameOverCard } from '@/apps/_arcade/GameOverCard';
import { AchievementsList } from '@/apps/_arcade/AchievementsList';
import { LeaderboardRow } from '@/apps/_arcade/GameLeaderboard';
import {
    ACHIEVEMENTS, CONTACT_Y, ENTITY_SIZE, FIELD_H, FIELD_W, GRAVITY, JUMP_IMPULSE, LANE_W, ROLL_MS,
    RUNNER_H, RUNNER_W, RUNNER_Y, ROW_GAP, TELEGRAPH_STEPS,
    crossedContact, entityContactY, initialEntities, laneCenter, loadAchievements, metres,
    resolveCross, satisfiedAchievements, saveAchievements, spawnRow, speedAt,
    type Entity, type Kind,
} from './logic';
import {
    buySkin, emptyProfile, getProfile, loadLeaderboard, selectSkin, submitRun,
    type LeaderboardData, type Profile,
} from './api';
import { getSkin, SKINS, type Skin } from './skins';
import { playCoin, playHit, playJump } from './sfx';
import { t } from '@/i18n';

interface Props { onClose: () => void; }

const SB_H = 58;
const ROLL_STEPS = ROLL_MS / 16.6667;

export function RailRunner({ onClose: _onClose }: Props) {
    const [phase, setPhase] = useState<Phase>('ready');
    const [profile, setProfile] = useState<Profile>(() => emptyProfile());
    const [achievements, setAchievements] = useState<string[]>(() => loadAchievements());
    const [newBest, setNewBest] = useState(false);
    const best = profile.best;
    const skin = getSkin(profile.selected);

    const [score, setScore] = useState(0);
    const [coins, setCoins] = useState(0);
    const [lane,  setLane]  = useState(1);
    const [jumpZ, setJumpZ] = useState(0);
    const [rolling, setRolling] = useState(false);
    const [trackOffset, setTrackOffset] = useState(0);

    const init = initialEntities();
    const [entities, setEntities] = useState<Entity[]>(() => init.entities);

    const [showPage, setShowPage] = useState(false);
    const { toasts, pushToast } = useGameToasts();

    const phaseRef = useRef<Phase>(phase);
    phaseRef.current = phase;
    const distRef  = useRef(0);
    const coinsRef = useRef(0);
    const laneRef  = useRef(1);
    const jumpZRef = useRef(0);
    const vzRef    = useRef(0);
    const rollRef  = useRef(0);
    const entsRef  = useRef<Entity[]>(init.entities);
    const nextId   = useRef(init.nextId);
    const spawnAcc = useRef(0);
    const deadAtRef = useRef(0);
    const profileRef = useRef(profile);
    profileRef.current = profile;
    const achRef = useRef(achievements);
    achRef.current = achievements;
    const showPageRef = useRef(showPage);
    showPageRef.current = showPage;

    useEffect(() => {
        let live = true;
        getProfile().then((p) => { if (live) setProfile(p); });
        return () => { live = false; };
    }, []);

    function reset() {
        const fresh = initialEntities();
        distRef.current = 0;
        coinsRef.current = 0;
        laneRef.current = 1;
        jumpZRef.current = 0;
        vzRef.current = 0;
        rollRef.current = 0;
        spawnAcc.current = 0;
        entsRef.current = fresh.entities;
        nextId.current = fresh.nextId;
        setScore(0); setCoins(0); setLane(1); setJumpZ(0); setRolling(false);
        setEntities(fresh.entities);
        phaseRef.current = 'ready';
        setPhase('ready');
    }

    function start() {
        if (phaseRef.current === 'ready') {
            phaseRef.current = 'playing';
            setPhase('playing');
        }
    }
    function moveLane(dir: -1 | 1) {
        if (showPageRef.current) return;
        if (phaseRef.current === 'dead') return;
        start();
        laneRef.current = Math.max(0, Math.min(2, laneRef.current + dir));
        setLane(laneRef.current);
    }
    const RESTART_LOCK_MS = 650;
    function tryRestart(): boolean {
        if (Date.now() - deadAtRef.current < RESTART_LOCK_MS) return false;
        reset();
        return true;
    }
    function jump() {
        if (showPageRef.current) return;
        if (phaseRef.current === 'dead') { tryRestart(); return; }
        start();
        if (jumpZRef.current <= 0 && vzRef.current <= 0) {
            vzRef.current = JUMP_IMPULSE;
            rollRef.current = 0;
            playJump();
        }
    }
    function roll() {
        if (showPageRef.current) return;
        if (phaseRef.current === 'dead') { tryRestart(); return; }
        start();
        if (jumpZRef.current <= 0) {
            rollRef.current = ROLL_STEPS;
            setRolling(true);
        }
    }

    function die() {
        playHit();
        deadAtRef.current = Date.now();
        phaseRef.current = 'dead';
        setPhase('dead');
        const finalScore = metres(distRef.current);
        const runCoins = coinsRef.current;
        setNewBest(finalScore > profileRef.current.best);

        void submitRun(finalScore, runCoins).then(({ profile: updated }) => {
            setProfile(updated);
            const unlocked = new Set(achRef.current);
            const newly: string[] = [];
            for (const id of satisfiedAchievements({ score: finalScore, runCoins, totalCoins: updated.totalCoins, plays: updated.plays })) {
                if (!unlocked.has(id)) { unlocked.add(id); newly.push(id); }
            }
            if (newly.length) {
                const arr = [...unlocked];
                setAchievements(arr);
                saveAchievements(arr);
                for (const id of newly) {
                    const a = ACHIEVEMENTS.find((x) => x.id === id);
                    if (a) pushToast(a.name);
                }
            }
        });
    }

    useGameLoop({
        isActive: () => phaseRef.current === 'playing' && !showPageRef.current,
        onFrame: (steps) => {
            const speed = speedAt(distRef.current);
            const adv = speed * steps;
            distRef.current += adv;
            setTrackOffset(o => (o + adv) % 80);

            if (jumpZRef.current > 0 || vzRef.current !== 0) {
                vzRef.current -= GRAVITY * steps;
                jumpZRef.current += vzRef.current * steps;
                if (jumpZRef.current <= 0) { jumpZRef.current = 0; vzRef.current = 0; }
            }
            if (rollRef.current > 0) {
                rollRef.current -= steps;
                if (rollRef.current <= 0) { rollRef.current = 0; setRolling(false); }
            }

            const rs = { lane: laneRef.current, jumpZ: jumpZRef.current, rolling: rollRef.current > 0 };
            let gotCoin = 0;
            let dead = false;

            const moved: Entity[] = [];
            for (const e of entsRef.current) {
                const y = e.y + adv;
                const ne: Entity = { ...e, y };
                if (!ne.resolved && crossedContact(e.y, y, ne.kind)) {
                    const r = resolveCross(ne, rs);
                    if (r === 'coin') { ne.taken = true; gotCoin += 1; }
                    else if (r === 'dead') { dead = true; }
                    ne.resolved = true;
                }
                if (y > FIELD_H + 60) continue;
                moved.push(ne);
            }

            spawnAcc.current += adv;
            while (spawnAcc.current >= ROW_GAP) {
                spawnAcc.current -= ROW_GAP;
                const row = spawnRow(nextId.current, -120 - spawnAcc.current);
                nextId.current = row.nextId;
                for (const e of row.entities) moved.push(e);
            }

            entsRef.current = moved;
            if (gotCoin > 0) {
                coinsRef.current += gotCoin;
                setCoins(coinsRef.current);
                playCoin();
            }

            setScore(metres(distRef.current));
            setJumpZ(jumpZRef.current);
            setEntities(moved);

            if (dead) die();
        },
        onIdle: () => {
            if (phaseRef.current === 'ready' && !showPageRef.current) {
                setTrackOffset(o => (o + 2.4) % 80);
            }
        },
    });

    // Only listen while foreground: a backgrounded but still-mounted game would keep
    // preventDefault-ing arrows/WASD/Space and starve text fields in other apps.
    const deckActive = useDeckActive();
    useEffect(() => {
        if (!deckActive) return;
        function onKey(e: KeyboardEvent) {
            switch (e.key) {
                case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); moveLane(-1); break;
                case 'ArrowRight': case 'd': case 'D': e.preventDefault(); moveLane(1); break;
                case 'ArrowUp':    case 'w': case 'W': case ' ': e.preventDefault(); jump(); break;
                case 'ArrowDown':  case 's': case 'S': e.preventDefault(); roll(); break;
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [deckActive]);

    const ptr = useRef<{ x: number; y: number; t: number } | null>(null);
    function onPointerDown(e: React.PointerEvent) {
        e.preventDefault();
        ptr.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    }
    function onPointerUp(e: React.PointerEvent) {
        const start0 = ptr.current;
        ptr.current = null;
        if (!start0) return;
        const dx = e.clientX - start0.x;
        const dy = e.clientY - start0.y;
        const THRESH = 24;
        if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) { jump(); return; }
        if (Math.abs(dx) > Math.abs(dy)) { moveLane(dx > 0 ? 1 : -1); }
        else if (dy < 0) { jump(); }
        else { roll(); }
    }

    let pendingKind: Kind | null = null;
    let pendingId = -1;
    let pendingClosest = -Infinity;
    if (phase === 'playing') {
        const leadPx = speedAt(score * 10) * TELEGRAPH_STEPS;
        for (const e of entities) {
            if (e.lane !== lane || e.kind === 'coin' || e.resolved) continue;
            const cy = entityContactY(e);
            if (cy > CONTACT_Y - leadPx && cy <= CONTACT_Y + 10) {
                if (cy > pendingClosest) { pendingClosest = cy; pendingKind = e.kind; pendingId = e.id; }
            }
        }
    }

    return (
        <div
            className="absolute inset-0 z-10 flex flex-col select-none"
            style={{ background: 'linear-gradient(180deg, #1B2440 0%, #2A3A66 52%, #3C5290 100%)' }}
        >
            <style>{`
                @keyframes rr-pop {
                    0%   { transform: scale(0.6); opacity: 0; }
                    55%  { transform: scale(1.08); opacity: 1; }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes rr-pulse {
                    0%, 100% { box-shadow: 0 0 0 2px rgba(255,255,255,0.55), 0 0 10px 2px rgba(255,255,255,0.30); }
                    50%      { box-shadow: 0 0 0 3px rgba(255,255,255,0.95), 0 0 18px 5px rgba(255,255,255,0.55); }
                }
                @keyframes rr-hint {
                    0%, 100% { transform: translateX(-50%) translateY(0) scale(1); }
                    50%      { transform: translateX(-50%) translateY(-3px) scale(1.06); }
                }
            `}</style>

            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="relative flex shrink-0 items-center justify-center px-5 pb-1 pt-1">
                {phase !== 'ready' && (
                    <button
                        type="button"
                        onClick={reset}
                        className="absolute left-4 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-semibold text-white active:opacity-60"
                        style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
                        aria-label={t('railrunner.restart', 'Restart')}
                    >
                        <RotateCcw className="h-[16px] w-[16px]" strokeWidth={2.6} />
                        {t('railrunner.reset', 'Reset')}
                    </button>
                )}
                <h1 className="text-[20px] font-extrabold tracking-tight text-white" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                    {t('railrunner.title', 'Rail Runner')}
                </h1>
                <button
                    type="button"
                    onClick={() => setShowPage(true)}
                    className="absolute right-4 flex h-9 w-9 items-center justify-center rounded-full text-white active:opacity-60"
                    style={{ backgroundColor: 'rgba(255,255,255,0.18)' }}
                    aria-label={t('railrunner.statsAndAchievements', 'Stats & achievements')}
                >
                    <BarChart3 className="h-[18px] w-[18px]" strokeWidth={2.6} />
                </button>
            </div>

            <div className="flex shrink-0 items-center justify-center gap-6 pb-1 pt-2">
                <ScoreStat value={score} label={t('railrunner.metres', 'Metres')} />
                <ScoreStat value={coins} label={t('railrunner.coins', 'Coins')} coin />
                <ScoreStat value={best} label={t('railrunner.best', 'Best')} trophy />
            </div>

            <div className="flex flex-1 items-start justify-center">
                <div
                    onPointerDown={onPointerDown}
                    onPointerUp={onPointerUp}
                    className="relative overflow-hidden rounded-[26px]"
                    style={{
                        width: FIELD_W,
                        height: FIELD_H,
                        background: 'linear-gradient(180deg, #3A4E8C 0%, #4A63A8 60%, #586FB4 100%)',
                        boxShadow: 'inset 0 2px 12px rgba(255,255,255,0.18), 0 12px 28px rgba(10,20,50,0.4)',
                        touchAction: 'none',
                        cursor: 'pointer',
                    }}
                >
                    {[1, 2].map(i => (
                        <div key={i} className="pointer-events-none absolute top-0 bottom-0" style={{ left: LANE_W * i, width: 2, background: 'rgba(255,255,255,0.16)' }} />
                    ))}
                    {[0, 1, 2].map(l => (
                        <div
                            key={l}
                            className="pointer-events-none absolute top-0 bottom-0"
                            style={{
                                left: laneCenter(l) - 2,
                                width: 4,
                                backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.5) 0 22px, transparent 22px 80px)',
                                backgroundPositionY: `${trackOffset}px`,
                            }}
                        />
                    ))}

                    <div
                        className="pointer-events-none absolute inset-x-0 z-0"
                        style={{
                            top: RUNNER_Y,
                            height: RUNNER_H,
                            background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0.03) 100%)',
                            borderTop: '1px dashed rgba(255,255,255,0.32)',
                            borderBottom: '1px dashed rgba(255,255,255,0.32)',
                        }}
                    />

                    {entities.map(e => <EntityView key={e.id} e={e} imminent={e.id === pendingId} />)}

                    <div
                        className="pointer-events-none absolute z-10 rounded-[50%]"
                        style={{
                            left: laneCenter(lane) - (RUNNER_W * (1 - Math.min(0.5, jumpZ / 200))) / 2,
                            top: RUNNER_Y + RUNNER_H - 8,
                            width: RUNNER_W * (1 - Math.min(0.5, jumpZ / 200)),
                            height: 12,
                            background: 'rgba(0,0,0,0.28)',
                            filter: 'blur(2px)',
                            transition: 'left 0.09s linear',
                        }}
                    />

                    <Runner lane={lane} jumpZ={jumpZ} rolling={rolling} idle={phase === 'ready'} skin={skin} />

                    {phase === 'playing' && pendingKind && (
                        <ActionHint kind={pendingKind} lane={lane} />
                    )}

                    {phase === 'ready' && (
                        <Overlay>
                            <div className="text-[26px] font-black text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                                {t('railrunner.tapToStart', 'Tap to start')}
                            </div>
                            <p className="mt-1.5 text-center text-[12.5px] font-semibold leading-snug text-white/90">
                                {t('railrunner.eachObstacleNeedsMove', 'Each obstacle needs a different move:')}
                            </p>
                            <div className="mt-3 flex flex-col gap-2.5">
                                <LegendRow kind="train"  action={t('railrunner.switchLane', 'Switch lane')}  control={t('railrunner.controlSwitchLane', 'swipe ◄ ►')} />
                                <LegendRow kind="hurdle" action={t('railrunner.jumpOver', 'Jump over')}    control={t('railrunner.controlJumpOver', 'swipe ▲ / tap')} />
                                <LegendRow kind="gate"   action={t('railrunner.slideUnder', 'Slide under')}  control={t('railrunner.controlSlideUnder', 'swipe ▼')} />
                            </div>
                            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-white/55">
                                {t('railrunner.promptFlashes', "A prompt flashes when it's time to act")}
                            </p>
                        </Overlay>
                    )}

                    {phase === 'dead' && (
                        <Overlay>
                            <GameOverCard
                                title={t('railrunner.gameOver', 'Game Over')}
                                accent="#3C5290"
                                sub="#6B7480"
                                ink="#1F2A30"
                                cardBg="rgba(255,255,255,0.94)"
                                cardShadow="0 10px 30px rgba(0,0,0,0.3)"
                                pop="rr-pop 0.32s ease-out"
                                statSize={30}
                                stats={[
                                    { label: t('railrunner.metres', 'Metres'), value: score },
                                    { label: t('railrunner.coins', 'Coins'), value: coins },
                                    { label: t('railrunner.best', 'Best'), value: best, highlight: newBest },
                                ]}
                                newBest={newBest}
                                newBestLabel={t('railrunner.newBest', 'New best!')}
                                playAgainLabel={t('railrunner.runAgain', 'Run again')}
                                playAgainColor="#3C5290"
                                onPlayAgain={reset}
                            />
                        </Overlay>
                    )}
                </div>
            </div>

            <div className="shrink-0" style={{ height: 24 }} />

            <GameToasts toasts={toasts} top={SB_H + 6} color="#3C5290" pop="rr-pop 0.3s ease-out" />

            {showPage && (
                <StatsPage
                    profile={profile}
                    achievements={achievements}
                    onProfile={setProfile}
                    onBack={() => setShowPage(false)}
                    onReset={reset}
                />
            )}
        </div>
    );
}

function Runner({ lane, jumpZ, rolling, idle, skin }: { lane: number; jumpZ: number; rolling: boolean; idle: boolean; skin: Skin }) {
    const h = rolling ? RUNNER_H * 0.6 : RUNNER_H;
    const top = RUNNER_Y - jumpZ + (RUNNER_H - h);
    return (
        <div
            className="pointer-events-none absolute z-20"
            style={{
                left: laneCenter(lane) - RUNNER_W / 2,
                top,
                width: RUNNER_W,
                height: h,
                transition: 'left 0.09s linear, height 0.08s ease-out, top 0.08s ease-out',
                filter: 'drop-shadow(0 3px 4px rgba(0,0,0,0.35))',
            }}
        >
            <svg viewBox="0 0 46 58" width={RUNNER_W} height={h} preserveAspectRatio="none">
                <RunnerArt skin={skin} idle={idle} />
            </svg>
        </div>
    );
}

function RunnerArt({ skin, idle }: { skin: Skin; idle: boolean }) {
    const c = skin.colors;
    return (
        <>
            <rect x="15" y="40" width="6" height="16" rx="3" fill={c.legA} />
            <rect x="25" y="40" width="6" height="16" rx="3" fill={c.legB} />
            <rect x="12" y="20" width="22" height="24" rx="8" fill={c.body} />
            <rect x="12" y="20" width="22" height="10" rx="6" fill={c.bodyLight} />
            <rect x="7"  y="23" width="6" height="15" rx="3" fill={c.arm} transform={idle ? undefined : 'rotate(-12 10 30)'} />
            <rect x="33" y="23" width="6" height="15" rx="3" fill={c.arm} transform={idle ? undefined : 'rotate(12 36 30)'} />
            <RunnerHead skin={skin} />
        </>
    );
}

function RunnerHead({ skin }: { skin: Skin }) {
    const c = skin.colors;
    switch (skin.variant) {
        case 'robot':
            return (
                <>
                    <rect x="22.2" y="1" width="1.6" height="5" fill={c.capDark} />
                    <circle cx="23" cy="1.4" r="2" fill={c.accent} />
                    <rect x="14" y="6" width="18" height="16" rx="4" fill={c.head} stroke={c.capDark} strokeWidth="1" />
                    <rect x="16" y="11" width="14" height="6" rx="3" fill="#11131F" />
                    <rect x="18" y="13" width="10" height="2" rx="1" fill={c.eye} />
                </>
            );
        case 'ninja':
            return (
                <>
                    <circle cx="23" cy="13" r="10" fill={c.head} />
                    <path d="M31,8 l9,-2 l0,3 l-9,2 z" fill={c.accent} />
                    <rect x="14" y="11" width="18" height="4" rx="2" fill={c.eye} />
                    <circle cx="20" cy="13" r="1.2" fill="#1C2030" />
                    <circle cx="26" cy="13" r="1.2" fill="#1C2030" />
                </>
            );
        case 'astronaut':
            return (
                <>
                    <circle cx="23" cy="13" r="10" fill={c.bodyLight} />
                    <circle cx="23" cy="13" r="7.5" fill={c.accent} />
                    <path d="M17,11 q6,-3 12,0" stroke="#FFFFFF" strokeWidth="1.4" fill="none" opacity="0.7" />
                </>
            );
        case 'alien':
            return (
                <>
                    <path d="M18,5 q-3,-3 -4,-4" stroke={c.head} strokeWidth="1.6" fill="none" />
                    <circle cx="14" cy="1.5" r="1.6" fill={c.accent} />
                    <path d="M28,5 q3,-3 4,-4" stroke={c.head} strokeWidth="1.6" fill="none" />
                    <circle cx="32" cy="1.5" r="1.6" fill={c.accent} />
                    <circle cx="23" cy="13" r="10" fill={c.head} />
                    <ellipse cx="19" cy="13" rx="2.4" ry="3.4" fill={c.eye} transform="rotate(-15 19 13)" />
                    <ellipse cx="27" cy="13" rx="2.4" ry="3.4" fill={c.eye} transform="rotate(15 27 13)" />
                </>
            );
        default: // classic + colour skins
            return (
                <>
                    <circle cx="23" cy="13" r="10" fill={c.head} />
                    <path d="M13,12 A10,10 0 0 1 33,12 Z" fill={c.cap} />
                    <rect x="22" y="10" width="14" height="4" rx="2" fill={c.capDark} />
                    <circle cx="26" cy="14" r="1.8" fill={c.eye} />
                </>
            );
    }
}

type ObstacleKind = Exclude<Kind, 'coin'>;

const HINT_META: Record<ObstacleKind, { color: string; label: string; icon: typeof ChevronUp }> = {
    train:  { color: '#D7443B', label: t('railrunner.switch', 'SWITCH'), icon: MoveHorizontal },
    hurdle: { color: '#E0A800', label: t('railrunner.jumpShort', 'JUMP'),   icon: ChevronUp },
    gate:   { color: '#2E9CA8', label: t('railrunner.slideShort', 'SLIDE'),  icon: ChevronDown },
};

function EntityView({ e, imminent }: { e: Entity; imminent: boolean }) {
    if (e.kind === 'coin') {
        if (e.taken) return null;
        return (
            <div
                className="pointer-events-none absolute z-10"
                style={{ left: laneCenter(e.lane) - 13, top: e.y, width: 26, height: 26 }}
            >
                <div className="h-full w-full rounded-full" style={{
                    background: 'radial-gradient(circle at 35% 30%, #FFE680 0%, #FFC83A 55%, #E0A000 100%)',
                    boxShadow: '0 0 8px rgba(255,200,60,0.6), inset 0 0 0 2px rgba(255,255,255,0.35)',
                }} />
            </div>
        );
    }

    const left = laneCenter(e.lane) - (LANE_W * 0.42);
    const w = LANE_W * 0.84;
    const pulse: React.CSSProperties | undefined = imminent ? { animation: 'rr-pulse 0.6s ease-in-out infinite' } : undefined;

    if (e.kind === 'train') {
        return (
            <div className="pointer-events-none absolute z-10 overflow-hidden rounded-[8px]" style={{
                left, top: e.y, width: w, height: ENTITY_SIZE,
                background: 'linear-gradient(180deg, #E4534A 0%, #A8261F 100%)',
                border: '2px solid #7E1812',
                ...pulse,
            }}>
                <div className="absolute inset-x-0 top-0 h-2.5" style={{ background: 'repeating-linear-gradient(45deg, #1c1c1c 0 7px, #F2C53D 7px 14px)' }} />
                <div
                    className="absolute left-1/2 top-1/2 flex items-center justify-center rounded-full"
                    style={{ transform: 'translate(-50%,-50%)', width: 24, height: 24, background: 'rgba(255,255,255,0.92)' }}
                >
                    <MoveHorizontal className="h-[15px] w-[15px]" strokeWidth={3.2} style={{ color: '#A8261F' }} />
                </div>
            </div>
        );
    }

    if (e.kind === 'hurdle') {
        return (
            <div className="pointer-events-none absolute z-10" style={{ left, top: e.y, width: w, height: ENTITY_SIZE }}>
                <div
                    className="absolute left-1/2 flex items-center justify-center rounded-full"
                    style={{ bottom: 22, transform: 'translateX(-50%)', width: 22, height: 22, background: '#F2C53D', boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }}
                >
                    <ChevronUp className="h-[15px] w-[15px]" strokeWidth={3.6} style={{ color: '#2E3550' }} />
                </div>
                <div className="absolute inset-x-0 rounded-[5px]" style={{
                    bottom: 0, height: 18,
                    background: 'repeating-linear-gradient(45deg, #F2C53D 0 8px, #2E3550 8px 16px)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                    ...pulse,
                }} />
            </div>
        );
    }

    return (
        <div className="pointer-events-none absolute z-10" style={{ left, top: e.y, width: w, height: ENTITY_SIZE }}>
            <div className="absolute inset-x-0 top-0 rounded-[4px]" style={{ height: 14, background: 'linear-gradient(180deg, #7AD3E0, #2E9CA8)', ...pulse }} />
            <div className="absolute left-0 top-0 h-full w-2 rounded-[3px]" style={{ background: '#2E9CA8' }} />
            <div className="absolute right-0 top-0 h-full w-2 rounded-[3px]" style={{ background: '#2E9CA8' }} />
            <div
                className="absolute left-1/2 flex items-center justify-center rounded-full"
                style={{ top: 18, transform: 'translateX(-50%)', width: 22, height: 22, background: '#2E9CA8', boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }}
            >
                <ChevronDown className="h-[15px] w-[15px]" strokeWidth={3.6} style={{ color: '#FFFFFF' }} />
            </div>
        </div>
    );
}

function ActionHint({ kind, lane }: { kind: ObstacleKind; lane: number }) {
    const meta = HINT_META[kind];
    const Icon = meta.icon;
    return (
        <div
            className="pointer-events-none absolute z-40"
            style={{ left: laneCenter(lane), top: RUNNER_Y - 52, transform: 'translateX(-50%)', animation: 'rr-hint 0.5s ease-in-out infinite' }}
        >
            <div className="flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-extrabold text-white shadow-lg" style={{ background: meta.color }}>
                <Icon className="h-[15px] w-[15px]" strokeWidth={3.2} />
                {meta.label}
            </div>
        </div>
    );
}

function LegendRow({ kind, action, control }: { kind: ObstacleKind; action: string; control: string }) {
    const meta = HINT_META[kind];
    const Icon = meta.icon;
    return (
        <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px]" style={{ background: meta.color }}>
                <Icon className="h-[16px] w-[16px] text-white" strokeWidth={3.2} />
            </span>
            <span className="w-[82px] text-left text-[13px] font-bold text-white">{action}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-white/60">{control}</span>
        </div>
    );
}

function ScoreStat({ value, label, coin, trophy }: { value: number; label: string; coin?: boolean; trophy?: boolean }) {
    return (
        <div className="flex flex-col items-center">
            <span className="flex items-center gap-1.5 text-[30px] font-black leading-none text-white" style={{ textShadow: '0 2px 3px rgba(0,0,0,0.3)' }}>
                {trophy && <Trophy className="h-[22px] w-[22px]" strokeWidth={2.6} />}
                {coin && <span className="inline-block h-[18px] w-[18px] rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, #FFE680, #FFC83A 60%, #E0A000)' }} />}
                {value}
            </span>
            <span className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/75">{label}</span>
        </div>
    );
}

const PAGE = {
    bg: '#FFFFFF', text: '#16202B', sub: '#6B7480', track: '#EEF1F5',
    border: '#DCE0E7', accent: '#3C5290', accentSoft: '#4A63A8', coin: '#E8A917',
};
const HERO = 'linear-gradient(135deg, #3C5290 0%, #4A63A8 60%, #586FB4 100%)';

type Tab = 'stats' | 'shop' | 'achievements' | 'leaderboard';

function StatsPage({ profile, achievements, onProfile, onBack, onReset }: {
    profile: Profile;
    achievements: string[];
    onProfile: (p: Profile) => void;
    onBack: () => void;
    onReset: () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const [tab, setTab] = useState<Tab>('stats');
    const selected = getSkin(profile.selected);

    const TABS: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
        { id: 'stats',        label: t('railrunner.tabStats', 'Stats'), icon: BarChart3 },
        { id: 'shop',         label: t('railrunner.tabShop', 'Shop'),  icon: ShoppingBag },
        { id: 'achievements', label: t('railrunner.tabGoals', 'Goals'), icon: Trophy },
        { id: 'leaderboard',  label: t('railrunner.tabRanks', 'Ranks'), icon: Crown },
    ];

    return (
        <div className="absolute inset-0 z-50 flex flex-col" style={{ ...pageStyle, backgroundColor: PAGE.bg, color: PAGE.text }}>
            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="relative flex h-11 shrink-0 items-center px-2">
                <button type="button" onClick={goBack} className="relative z-10 flex items-center gap-0.5 text-[17px] active:opacity-60" style={{ color: PAGE.accent }}>
                    <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.5} />
                    <span>{t('railrunner.title', 'Rail Runner')}</span>
                </button>
            </div>

            <div className="mx-4 mb-1 flex items-center gap-3.5 rounded-[20px] px-4 py-3.5" style={{ background: HERO }}>
                <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[16px]" style={{ background: 'rgba(255,255,255,0.16)' }}>
                    <svg viewBox="0 0 46 58" width={32} height={42}><RunnerArt skin={selected} idle /></svg>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-white/70">{t('railrunner.yourRunner', 'Your runner')}</div>
                    <div className="truncate text-[18px] font-extrabold text-white">{selected.name}</div>
                </div>
                <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: 'rgba(255,255,255,0.18)' }}>
                    <Coins className="h-[16px] w-[16px]" strokeWidth={2.6} style={{ color: '#FFD23E' }} />
                    <span className="text-[16px] font-black tabular-nums text-white">{profile.coins}</span>
                </div>
            </div>

            <div className="shrink-0 px-4 pt-2 pb-2">
                <div className="flex rounded-[12px] p-1" style={{ backgroundColor: PAGE.track }}>
                    {TABS.map(t => {
                        const active = tab === t.id;
                        const Icon = t.icon;
                        return (
                            <button key={t.id} type="button" onClick={() => setTab(t.id)}
                                    className="flex flex-1 items-center justify-center gap-1 rounded-[9px] py-1.5 text-[12px] font-bold transition"
                                    style={{ color: active ? '#fff' : PAGE.sub, backgroundColor: active ? PAGE.accent : 'transparent' }}>
                                <Icon className="h-[14px] w-[14px]" strokeWidth={2.6} />
                                {t.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-8">
                {tab === 'stats'        && <StatsTab profile={profile} onReset={() => { onReset(); goBack(); }} />}
                {tab === 'shop'         && <Shop profile={profile} onProfile={onProfile} />}
                {tab === 'achievements' && <AchievementsTab achievements={achievements} />}
                {tab === 'leaderboard'  && <LeaderboardTab />}
            </div>
        </div>
    );
}

function StatCard({ icon: Icon, color, value, label }: { icon: typeof BarChart3; color: string; value: number; label: string }) {
    return (
        <div className="flex items-center gap-3 rounded-[16px] px-4 py-3" style={{ backgroundColor: PAGE.track }}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={{ background: color }}>
                <Icon className="h-[18px] w-[18px] text-white" strokeWidth={2.6} />
            </span>
            <div className="flex min-w-0 flex-col">
                <span className="text-[20px] font-black leading-none tabular-nums" style={{ color: PAGE.text }}>{value.toLocaleString()}</span>
                <span className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide" style={{ color: PAGE.sub }}>{label}</span>
            </div>
        </div>
    );
}

function StatsTab({ profile, onReset }: { profile: Profile; onReset: () => void }) {
    return (
        <>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
                <StatCard icon={Trophy}    color={PAGE.accent}     value={profile.best}       label={t('railrunner.bestM', 'Best (m)')} />
                <StatCard icon={BarChart3} color={PAGE.accentSoft} value={profile.plays}      label={t('railrunner.plays', 'Plays')} />
                <StatCard icon={Coins}     color={PAGE.coin}       value={profile.coins}      label={t('railrunner.coins', 'Coins')} />
                <StatCard icon={Coins}     color="#C99A2E"         value={profile.totalCoins} label={t('railrunner.totalEarned', 'Total earned')} />
            </div>
            <button type="button" onClick={onReset}
                    className="mt-4 w-full rounded-2xl py-3.5 text-[15px] font-bold text-white active:opacity-80" style={{ backgroundColor: PAGE.accentSoft }}>
                {t('railrunner.playAgain', 'Play Again')}
            </button>
        </>
    );
}

function AchievementsTab({ achievements }: { achievements: string[] }) {
    return (
        <div className="flex flex-col gap-2 pt-1">
            <div className="pb-0.5 text-[12px] font-semibold" style={{ color: PAGE.sub }}>
                {t('railrunner.xOfYUnlocked', '{count} of {total} unlocked', { count: achievements.length, total: ACHIEVEMENTS.length })}
            </div>
            <AchievementsList
                items={ACHIEVEMENTS}
                unlocked={achievements}
                track={PAGE.track}
                accent={PAGE.accent}
                text={PAGE.text}
                sub={PAGE.sub}
                muted="#C2C9D2"
            />
        </div>
    );
}

function Shop({ profile, onProfile }: { profile: Profile; onProfile: (p: Profile) => void }) {
    const [busy, setBusy] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    async function onBuy(s: Skin) {
        setBusy(s.id); setErr(null);
        const r = await buySkin(s.id);
        setBusy(null);
        if (r.profile) onProfile(r.profile);
        else setErr(r.error || t('railrunner.purchaseFailed', 'Purchase failed'));
    }
    async function onSelect(s: Skin) {
        setBusy(s.id); setErr(null);
        const p = await selectSkin(s.id);
        setBusy(null);
        if (p) onProfile(p);
    }

    return (
        <div className="pt-1">
            {err && (
                <div className="mb-2.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold text-white" style={{ background: '#D7443B' }}>{err}</div>
            )}
            <div className="grid grid-cols-2 gap-2.5">
                {SKINS.map(s => {
                    const owned = s.cost === 0 || profile.unlocked.includes(s.id);
                    const isSelected = profile.selected === s.id;
                    const canBuy = !owned && profile.coins >= s.cost;
                    const disabled = busy != null;
                    return (
                        <div key={s.id} className="flex flex-col items-center rounded-[16px] p-2.5"
                             style={{ backgroundColor: PAGE.track, border: isSelected ? `2px solid ${PAGE.accent}` : '2px solid transparent' }}>
                            <div className="flex h-[66px] w-full items-center justify-center rounded-[12px]" style={{ background: HERO }}>
                                <svg viewBox="0 0 46 58" width={32} height={42}><RunnerArt skin={s} idle /></svg>
                            </div>
                            <div className="mt-2 text-[13.5px] font-bold" style={{ color: PAGE.text }}>{s.name}</div>
                            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: PAGE.sub }}>{s.kind}</div>
                            <div className="mt-2 w-full">
                                {isSelected ? (
                                    <div className="flex items-center justify-center gap-1 rounded-full py-1.5 text-[12.5px] font-bold text-white" style={{ background: PAGE.accent }}>
                                        <Check className="h-[13px] w-[13px]" strokeWidth={3} /> {t('railrunner.equipped', 'Equipped')}
                                    </div>
                                ) : owned ? (
                                    <button type="button" disabled={disabled} onClick={() => onSelect(s)}
                                            className="w-full rounded-full py-1.5 text-[12.5px] font-bold active:opacity-70 disabled:opacity-50"
                                            style={{ background: '#fff', border: `1px solid ${PAGE.border}`, color: PAGE.accent }}>
                                        {t('railrunner.equip', 'Equip')}
                                    </button>
                                ) : (
                                    <button type="button" disabled={!canBuy || disabled} onClick={() => onBuy(s)}
                                            className="flex w-full items-center justify-center gap-1 rounded-full py-1.5 text-[12.5px] font-bold text-white active:opacity-70"
                                            style={{ background: canBuy ? PAGE.accent : '#B9C0CC' }}>
                                        <Coins className="h-[13px] w-[13px]" strokeWidth={2.8} style={{ color: '#FFD23E' }} />
                                        {s.cost.toLocaleString()}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function LeaderboardTab() {
    const [data, setData] = useState<LeaderboardData | null>(null);
    useEffect(() => {
        let live = true;
        loadLeaderboard().then(d => { if (live) setData(d); });
        return () => { live = false; };
    }, []);

    if (!data) {
        return <div className="pt-8 text-center text-[13px] font-semibold" style={{ color: PAGE.sub }}>{t('railrunner.loading', 'Loading…')}</div>;
    }
    if (!data.top.length) {
        return <div className="pt-8 text-center text-[13px] font-semibold" style={{ color: PAGE.sub }}>{t('railrunner.noRunsYet', 'No runs yet — set the first record!')}</div>;
    }
    const youRank = data.you.rank;
    const youInList = youRank != null && youRank <= data.top.length;

    return (
        <div className="flex flex-col gap-1.5 pt-1">
            <div className="pb-0.5 text-[12px] font-semibold" style={{ color: PAGE.sub }}>
                {t('railrunner.bestDistanceM', 'Best distance (m)')}{youRank ? t('railrunner.youreRank', " · you're #{rank}", { rank: youRank }) : ''}
            </div>
            {data.top.map((r, i) => {
                const rank = i + 1;
                const isYou = youInList && rank === youRank;
                return (
                    <LeaderboardRow
                        key={`${r.name}-${i}`}
                        rank={rank}
                        name={`${r.name || 'Unknown'}${isYou ? ' (you)' : ''}`}
                        value={r.best.toLocaleString()}
                        highlight={isYou}
                        track={PAGE.track}
                        accent={PAGE.accent}
                        text={PAGE.text}
                        muted="#C2C9D2"
                    />
                );
            })}
            {youRank != null && !youInList && (
                <div className="mt-1 flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ backgroundColor: PAGE.accent }}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold text-white" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>
                        {youRank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-white">You</span>
                    <span className="shrink-0 text-[14px] font-extrabold tabular-nums text-white">{data.you.best.toLocaleString()}</span>
                </div>
            )}
        </div>
    );
}

function Overlay({ children }: { children: React.ReactNode }) {
    return (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center px-4" style={{ background: 'rgba(15,25,55,0.4)' }}>
            {children}
        </div>
    );
}
