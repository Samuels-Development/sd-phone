import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, CloudOff, CloudRain, Crown, Lock, Pencil, RotateCcw, Trophy } from 'lucide-react';

import {
    EMPTY_SAVE, costOf, deriveStats, fmt, fmtRate, getAchievements, getUpgrades,
    leaderboard, loadGame, normalizeSave, rankWithYou, saveGame,
    type LeaderRow, type SaveState,
} from './game';
import { playCrunch } from './crunch';
import { NicknameSheet } from './NicknameSheet';
import { fetchNui, isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';
import { MEDALS } from '@/apps/_arcade/GameLeaderboard';
import { useDeckActive } from '@/shell/deckActive';
import { t } from '@/i18n';

type Tab = 'store' | 'achievements' | 'leaderboard';

const SB_H = 58;
const TICK_MS = 100;

interface Props { onClose: () => void; }

interface Pop   { id: number; x: number; y: number; text: string; }
interface Crumb { id: number; x: number; y: number; dx: number; dy: number; }
interface Toast { key: string; name: string; gold?: boolean; exiting?: boolean; }
interface Drop  { id: number; x: string; size: number; dur: number; spin: number; }

export function Cookie({ onClose: _onClose }: Props) {
    // Freeze the idle income + cookie-rain ticks while backgrounded (iOS-correct: the
    // count holds where you left it); the 2s autosave below is left running so a
    // backgrounded tab still flushes its last state.
    const active = useDeckActive();
    const [save, setSave] = useState<SaveState>(() => (isFiveM ? { ...EMPTY_SAVE } : loadGame()));
    const loadedRef = useRef(!isFiveM);

    const [pops,   setPops]   = useState<Pop[]>([]);
    const [crumbs, setCrumbs] = useState<Crumb[]>([]);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [rain,   setRain]   = useState<Drop[]>([]);
    const [golden, setGolden] = useState<{ id: number; top: number } | null>(null);
    const [pressed,      setPressed]      = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);
    const [tab,          setTab]          = useState<Tab>('store');
    const [nickEditor,   setNickEditor]   = useState<string | null>(null);
    const [lbRefresh,    setLbRefresh]    = useState(0);

    const saveRef    = useRef(save);
    saveRef.current  = save;
    const zoneRef    = useRef<HTMLDivElement>(null);
    const topRef     = useRef<HTMLDivElement>(null);
    const [fallH, setFallH] = useState(420);
    const seq        = useRef(0);
    const goldenHide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const goldenNext = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const scheduleRef = useRef<() => void>(() => {});
    const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const { cps } = deriveStats(save.owned);

    const TABS: { id: Tab; label: string }[] = [
        { id: 'store',        label: t('cookie.tabStore', 'Store') },
        { id: 'achievements', label: t('cookie.tabAchievements', 'Achievements') },
        { id: 'leaderboard',  label: t('cookie.tabLeaderboard', 'Leaderboard') },
    ];

    useLayoutEffect(() => {
        if (topRef.current) setFallH(topRef.current.offsetHeight);
    }, []);

    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => {
            setSave(prev => {
                const rate = deriveStats(prev.owned).cps;
                if (rate <= 0) return prev;
                const add = rate * (TICK_MS / 1000);
                return { ...prev, cookies: prev.cookies + add, earned: prev.earned + add };
            });
        }, TICK_MS);
        return () => clearInterval(id);
    }, [active]);

    useEffect(() => {
        if (!active) return;
        const TICK = 120;
        let carry = 0;
        const id = setInterval(() => {
            if (!saveRef.current.rainOn) return;
            const rate = Math.min(18, deriveStats(saveRef.current.owned).cps);
            if (rate <= 0) return;
            carry += rate * (TICK / 1000);
            const n = Math.floor(carry);
            if (n <= 0) return;
            carry -= n;
            spawnRain(Math.min(n, 4));
        }, TICK);
        return () => clearInterval(id);
    }, [active]);

    useEffect(() => {
        if (!isFiveM) return;
        let alive = true;
        apiData<SaveState>('sd-phone:cookie:load')
            .then(r => {
                if (!alive) return;
                if (r) { setSave(normalizeSave(r)); loadedRef.current = true; }
            })
            .catch(() => { /* leave the gate closed so we never clobber a save we failed to read */ });
        return () => { alive = false; };
    }, []);

    function persistState(s: SaveState) {
        if (isFiveM) {
            if (loadedRef.current) void fetchNui('sd-phone:cookie:save', s);
        } else {
            saveGame(s);
        }
    }

    useEffect(() => {
        const id = setInterval(() => persistState(saveRef.current), 2000);
        return () => { clearInterval(id); persistState(saveRef.current); };
         
    }, []);

    useEffect(() => {
        const { clickPower, cps } = deriveStats(save.owned);
        const ctx = { earned: save.earned, cps, clickPower, owned: save.owned };
        const newly = getAchievements().filter(a => a.test(ctx) && !save.achievements.includes(a.id));
        if (!newly.length) return;
        setSave(p => ({ ...p, achievements: [...p.achievements, ...newly.map(a => a.id)] }));
        newly.forEach(a => pushToast(a.name));
    }, [save.earned, save.owned]);

    useEffect(() => {
        function scheduleNext() {
            goldenNext.current = setTimeout(spawn, 60_000 + Math.random() * 60_000);
        }
        function spawn() {
            setGolden({ id: Date.now(), top: 16 + Math.random() * 56 });
            goldenHide.current = setTimeout(() => { setGolden(null); scheduleNext(); }, 9_000);
        }
        scheduleRef.current = scheduleNext;
        scheduleNext();
        return () => { clearTimeout(goldenNext.current); clearTimeout(goldenHide.current); };
    }, []);

    function spawnFx(clientX: number, clientY: number, text: string) {
        const rect = zoneRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        const popId = ++seq.current;
        setPops(p => [...p, { id: popId, x, y, text }]);

        const made: Crumb[] = [];
        for (let i = 0; i < 3; i++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 26 + Math.random() * 30;
            made.push({
                id: ++seq.current, x, y,
                dx: Math.cos(ang) * dist,
                dy: Math.sin(ang) * dist + 14, // bias downward so crumbs "fall"
            });
        }
        setCrumbs(c => [...c, ...made]);
    }

    function spawnRain(n: number) {
        const made: Drop[] = [];
        for (let i = 0; i < n; i++) {
            made.push({
                id:   ++seq.current,
                x:    `${Math.random() * 84 + 4}%`,
                size: 16 + Math.random() * 12,
                dur:  1.1 + Math.random() * 0.7,
                spin: Math.round((Math.random() - 0.5) * 320),
            });
        }
        setRain(r => (r.length > 44 ? r.slice(made.length) : r).concat(made));
    }

    function pushToast(name: string, gold = false) {
        const key = `t${seq.current++}`;
        setToasts(list => [...list, { key, name, gold }]);
        setTimeout(() => {
            setToasts(list => list.map(x => (x.key === key ? { ...x, exiting: true } : x)));
            setTimeout(() => setToasts(list => list.filter(x => x.key !== key)), 240);
        }, 2600);
    }

    function tapCookie(e: React.PointerEvent) {
        playCrunch();
        const gain = deriveStats(saveRef.current.owned).clickPower;
        setSave(p => ({ ...p, cookies: p.cookies + gain, earned: p.earned + gain }));
        spawnFx(e.clientX, e.clientY, `+${fmt(gain)}`);
        if (saveRef.current.rainOn) spawnRain(1);
    }

    function toggleRain() {
        setSave(p => ({ ...p, rainOn: !p.rainOn }));
        setRain([]);
    }

    function buy(id: string) {
        setSave(p => {
            const u = getUpgrades().find(x => x.id === id)!;
            const cost = costOf(u, p.owned[id] ?? 0);
            if (p.cookies < cost) return p;
            return { ...p, cookies: p.cookies - cost, owned: { ...p.owned, [id]: (p.owned[id] ?? 0) + 1 } };
        });
    }

    function tapGolden() {
        clearTimeout(goldenHide.current);
        const s = saveRef.current;
        const rate = deriveStats(s.owned).cps;
        const bonus = Math.floor(Math.max(25, s.cookies * 0.10 + rate * 30));
        setSave(p => ({ ...p, cookies: p.cookies + bonus, earned: p.earned + bonus }));
        pushToast(t('cookie.luckyBonus', 'Lucky! +{amount}', { amount: fmt(bonus) }), true);
        setGolden(null);
        scheduleRef.current();
    }

    function tapReset() {
        if (!confirmReset) {
            setConfirmReset(true);
            resetTimer.current = setTimeout(() => setConfirmReset(false), 3000);
            return;
        }
        clearTimeout(resetTimer.current);
        setConfirmReset(false);
        const fresh: SaveState = { cookies: 0, earned: 0, owned: {}, achievements: [], rainOn: saveRef.current.rainOn };
        setSave(fresh);
        persistState(fresh);
    }

    return (
        <div
            className="absolute inset-0 z-10 flex flex-col select-none"
            style={{ background: 'linear-gradient(180deg, #FFF6E9 0%, #F6E0B5 52%, #E9C786 100%)' }}
        >
            <div ref={topRef} className="relative flex shrink-0 flex-col">
                <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
                    {rain.map(d => (
                        <span
                            key={d.id}
                            onAnimationEnd={() => setRain(list => list.filter(x => x.id !== d.id))}
                            className="absolute top-[-34px]"
                            style={{
                                left: d.x,
                                ['--fall' as string]: `${fallH + 60}px`,
                                ['--spin' as string]: `${d.spin}deg`,
                                animation: `cookie-rain ${d.dur}s linear forwards`,
                            }}
                        >
                            <CookieGraphic size={d.size} lite />
                        </span>
                    ))}
                </div>

            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="relative z-10 flex shrink-0 items-center justify-center px-5 pb-1 pt-1">
                <h1 className="text-[20px] font-extrabold tracking-tight text-[#5B3A1A]">{t('cookie.title', 'Cookie')}</h1>
                <button
                    type="button"
                    onClick={toggleRain}
                    className="absolute left-4 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-semibold active:opacity-60"
                    style={{
                        color:           save.rainOn ? '#9C6B33' : '#AFA79B',
                        backgroundColor: 'rgba(155,107,51,0.12)',
                    }}
                    aria-label={save.rainOn ? t('cookie.disableRain', 'Disable cookie rain') : t('cookie.enableRain', 'Enable cookie rain')}
                >
                    {save.rainOn
                        ? <CloudRain className="h-[16px] w-[16px]" strokeWidth={2.5} />
                        : <CloudOff  className="h-[16px] w-[16px]" strokeWidth={2.5} />}
                    {t('cookie.rain', 'Rain')}
                </button>
                <button
                    type="button"
                    onClick={tapReset}
                    className="absolute right-4 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[14px] font-semibold active:opacity-60"
                    style={{
                        color:           confirmReset ? '#fff' : '#9C6B33',
                        backgroundColor: confirmReset ? '#E5163E' : 'rgba(155,107,51,0.12)',
                    }}
                >
                    <RotateCcw className="h-[16px] w-[16px]" strokeWidth={2.5} />
                    {confirmReset ? t('cookie.resetConfirm', 'Sure?') : t('cookie.reset', 'Reset')}
                </button>
            </div>

            <div className="relative z-10 flex shrink-0 flex-col items-center pb-1 pt-2">
                <div className="text-[44px] font-black leading-none tracking-tight text-[#4A2C12]">
                    {fmt(save.cookies)}
                </div>
                <div
                    className="overflow-hidden text-[14px] font-semibold leading-[18px] tabular-nums text-[#B07E3E] transition-all duration-300 ease-out"
                    style={{
                        maxHeight: save.cookies >= 1000 ? 20 : 0,
                        opacity:   save.cookies >= 1000 ? 1 : 0,
                        marginTop: save.cookies >= 1000 ? 2 : 0,
                        transform: save.cookies >= 1000 ? 'translateY(0)' : 'translateY(-4px)',
                    }}
                >
                    {t('cookie.cookiesCount', '{n} cookies', { n: Math.floor(save.cookies).toLocaleString() })}
                </div>
                <div className="mt-1 text-[15px] font-semibold text-[#9C6B33]">
                    {t('cookie.ratePerSecond', '{rate} per second', { rate: fmtRate(cps) })}
                </div>
            </div>

            <div ref={zoneRef} className="relative z-10 flex shrink-0 items-center justify-center" style={{ height: 228 }}>
                <button
                    type="button"
                    onPointerDown={e => { setPressed(true); tapCookie(e); }}
                    onPointerUp={() => setPressed(false)}
                    onPointerLeave={() => setPressed(false)}
                    className="relative outline-none"
                    style={{
                        transform:  pressed ? 'scale(0.93)' : 'scale(1)',
                        transition: 'transform 0.09s ease',
                        filter:     'drop-shadow(0 10px 18px rgba(120,72,20,0.32))',
                    }}
                    aria-label={t('cookie.cookieAria', 'Cookie')}
                >
                    <CookieGraphic size={188} />
                </button>

                {pops.map(p => (
                    <span
                        key={p.id}
                        onAnimationEnd={() => setPops(list => list.filter(x => x.id !== p.id))}
                        className="pointer-events-none absolute text-[20px] font-black text-[#6B4220]"
                        style={{ left: p.x, top: p.y, animation: 'cookie-pop 0.9s ease-out forwards', textShadow: '0 1px 0 rgba(255,255,255,0.6)' }}
                    >
                        {p.text}
                    </span>
                ))}

                {crumbs.map(c => (
                    <span
                        key={c.id}
                        onAnimationEnd={() => setCrumbs(list => list.filter(x => x.id !== c.id))}
                        className="pointer-events-none absolute rounded-[2px] bg-[#7A4A1E]"
                        style={{
                            left: c.x, top: c.y, width: 6, height: 5,
                            ['--dx' as string]: `${c.dx}px`,
                            ['--dy' as string]: `${c.dy}px`,
                            animation: 'cookie-crumb 0.7s ease-out forwards',
                        }}
                    />
                ))}

                {golden && (
                    <button
                        key={golden.id}
                        type="button"
                        onClick={tapGolden}
                        className="absolute z-20 outline-none"
                        style={{ top: `${golden.top}%`, animation: 'golden-drift 9s linear forwards' }}
                        aria-label={t('cookie.goldenCookie', 'Golden cookie')}
                    >
                        <span className="block" style={{ animation: 'golden-pulse 1s ease-in-out infinite' }}>
                            <CookieGraphic size={48} gold />
                        </span>
                    </button>
                )}
            </div>
            </div>

            <div className="flex flex-1 flex-col overflow-hidden rounded-t-[22px] bg-white/55 backdrop-blur-sm">
                <div className="shrink-0 px-3 pt-2.5 pb-1.5">
                    <div className="flex rounded-[10px] p-0.5" style={{ background: 'rgba(155,107,51,0.14)' }}>
                        {TABS.map(t => {
                            const active = tab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setTab(t.id)}
                                    className="flex-1 rounded-[9px] py-2.5 text-[14px] font-semibold transition"
                                    style={{
                                        color:      active ? '#5B3A1A' : '#9C6B33',
                                        background: active ? '#fff' : 'transparent',
                                        boxShadow:  active ? '0 1px 3px rgba(120,72,20,0.18)' : undefined,
                                    }}
                                >
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar px-3 pb-6 pt-1">
                    {tab === 'store'        && <StoreTab save={save} onBuy={buy} />}
                    {tab === 'achievements' && <AchievementsTab unlocked={save.achievements} />}
                    {tab === 'leaderboard'  && <LeaderboardTab earned={save.earned} refreshKey={lbRefresh} onEditNickname={setNickEditor} />}
                </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 z-40 flex flex-col items-center gap-1.5" style={{ top: SB_H + 4 }}>
                {toasts.map(toast => (
                    <div
                        key={toast.key}
                        className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-bold text-white shadow-lg"
                        style={{
                            background: toast.gold
                                ? 'linear-gradient(120deg, #F6B73C, #E5901A)'
                                : 'linear-gradient(120deg, #8A5A28, #6B4220)',
                            animation: toast.exiting
                                ? 'cookie-toast-out 0.24s ease-in forwards'
                                : 'cookie-toast-in 0.28s ease-out',
                        }}
                    >
                        <Trophy className="h-[13px] w-[13px]" strokeWidth={2.5} />
                        {toast.gold ? toast.name : t('cookie.achievementToast', 'Achievement: {name}', { name: toast.name })}
                    </div>
                ))}
            </div>

            {nickEditor !== null && (
                <NicknameSheet
                    initial={nickEditor}
                    onClose={() => setNickEditor(null)}
                    onSave={name => {
                        setNickEditor(null);
                        if (isFiveM) void fetchNui('sd-phone:cookie:nickname', { nickname: name });
                        setLbRefresh(n => n + 1);
                    }}
                />
            )}
        </div>
    );
}

function CookieGraphic({ size, gold = false, lite = false }: { size: number; gold?: boolean; lite?: boolean }) {
    const uid  = gold ? 'ckg' : lite ? 'ckl' : 'ck';
    const body = gold ? ['#FFE08A', '#F1B53C', '#D88E1E'] : ['#E9BE7D', '#D49A50', '#B9772F'];
    const chip = gold ? '#9A6A12' : '#5A3417';
    const chipHi = gold ? '#C28A1E' : '#7A4A24';

    const chips: ReadonlyArray<readonly [number, number, number]> = lite
        ? [[35, 36, 8], [64, 40, 8], [44, 64, 7], [70, 66, 6]]
        : [
            [34, 30, 6], [64, 28, 6.6], [50, 50, 6], [29, 58, 5.4],
            [69, 56, 5.6], [45, 72, 5], [60, 70, 4.4], [40, 44, 4],
        ];

    return (
        <svg viewBox="0 0 100 100" width={size} height={size}>
            <defs>
                <radialGradient id={`${uid}-b`} cx="38%" cy="32%" r="72%">
                    <stop offset="0%"   stopColor={body[0]} />
                    <stop offset="55%"  stopColor={body[1]} />
                    <stop offset="100%" stopColor={body[2]} />
                </radialGradient>
            </defs>

            <circle cx="50" cy="50" r="46" fill={`url(#${uid}-b)`} />
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(90,52,23,0.30)" strokeWidth="2" />
            {!lite && <path d="M22,30 A40,40 0 0 1 50,12" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="3.5" strokeLinecap="round" />}

            {chips.map(([cx, cy, r], i) => (
                <g key={i}>
                    <circle cx={cx} cy={cy} r={r} fill={chip} />
                    <circle cx={cx - r * 0.32} cy={cy - r * 0.34} r={r * 0.42} fill={chipHi} opacity="0.8" />
                </g>
            ))}
        </svg>
    );
}

function StoreTab({ save, onBuy }: { save: SaveState; onBuy: (id: string) => void }) {
    const upgrades = getUpgrades();
    return (
        <div className="flex flex-col gap-2">
            {upgrades.map(u => {
                const owned = save.owned[u.id] ?? 0;
                const cost  = costOf(u, owned);
                const can   = save.cookies >= cost;
                const Icon  = u.icon;
                return (
                    <button
                        key={u.id}
                        type="button"
                        disabled={!can}
                        onClick={() => onBuy(u.id)}
                        className="flex w-full items-center gap-3.5 rounded-2xl bg-white px-3.5 py-3 text-left transition active:scale-[0.98]"
                        style={{
                            opacity:   can ? 1 : 0.45,
                            boxShadow: '0 1px 3px rgba(120,72,20,0.10), 0 4px 12px rgba(120,72,20,0.06)',
                        }}
                    >
                        <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                            style={{ background: 'linear-gradient(160deg, #F6C56B, #D98A33)' }}
                        >
                            <Icon className="h-[23px] w-[23px] text-white" strokeWidth={2.4} />
                        </span>

                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-1.5">
                                <span className="truncate text-[16px] font-bold text-[#4A2C12]">{u.name}</span>
                                {owned > 0 && <span className="text-[12.5px] font-semibold text-[#B07E3E]">×{owned}</span>}
                            </div>
                            <div className="truncate text-[13.5px] font-medium text-[#8A5A28]">{u.blurb}</div>
                        </div>

                        <div className="shrink-0 text-right">
                            <div className="text-[15px] font-extrabold text-[#C77D2E]">{fmt(cost)}</div>
                            <div className="text-[10.5px] font-medium uppercase tracking-wide text-[#B79268]">
                                {u.kind === 'click'
                                    ? t('cookie.perTapUnit', '+{n}/tap', { n: u.inc })
                                    : t('cookie.perSecondUnit', '+{rate}/s', { rate: fmtRate(u.inc) })}
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function AchievementsTab({ unlocked }: { unlocked: string[] }) {
    const items = getAchievements();
    return (
        <div className="flex flex-col gap-2">
            <div className="px-1 pb-0.5 text-[12px] font-semibold text-[#9C6B33]">
                {t('cookie.unlockedCount', '{n} of {total} unlocked', { n: unlocked.length, total: items.length })}
            </div>
            {items.map(a => {
                const got = unlocked.includes(a.id);
                return (
                    <div
                        key={a.id}
                        className="flex items-center gap-3.5 rounded-2xl bg-white px-3.5 py-3"
                        style={{ opacity: got ? 1 : 0.62, boxShadow: '0 1px 3px rgba(120,72,20,0.10)' }}
                    >
                        <span
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                            style={{ background: got ? 'linear-gradient(160deg, #F6C56B, #D98A33)' : 'rgba(120,72,20,0.12)' }}
                        >
                            <Trophy className="h-[23px] w-[23px]" strokeWidth={2.4} style={{ color: got ? '#fff' : '#B79268' }} />
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="text-[16px] font-bold text-[#4A2C12]">{a.name}</div>
                            <div className="text-[13.5px] font-medium text-[#8A5A28]">{a.desc}</div>
                        </div>
                        {got
                            ? <Check className="h-[19px] w-[19px] shrink-0 text-[#34A853]" strokeWidth={3} />
                            : <Lock  className="h-[17px] w-[17px] shrink-0 text-[#B79268]" strokeWidth={2.4} />}
                    </div>
                );
            })}
        </div>
    );
}

function LeaderboardTab({ earned, refreshKey, onEditNickname }: {
    earned: number;
    refreshKey: number;
    onEditNickname: (currentNick: string) => void;
}) {
    const [rivals, setRivals] = useState<LeaderRow[] | null>(null);
    const [me, setMe] = useState<{ name: string; nickname: string } | null>(null);
    useEffect(() => {
        if (!isFiveM) return;
        let alive = true;
        apiData<{ rivals: LeaderRow[]; me: { name: string; nickname: string } }>('sd-phone:cookie:leaderboard')
            .then(r => { if (alive && r) { setRivals(r.rivals); setMe(r.me); } })
            .catch(() => {});
        return () => { alive = false; };
    }, [refreshKey]);

    if (isFiveM && rivals === null) {
        return (
            <div className="flex animate-pulse flex-col gap-1.5">
                {Array.from({ length: 8 }, (_, i) => (
                    <div
                        key={i}
                        className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5"
                        style={{ boxShadow: '0 1px 3px rgba(120,72,20,0.10)' }}
                    >
                        <span className="h-8 w-8 shrink-0 rounded-full bg-[rgba(155,107,51,0.16)]" />
                        <span className="h-3 flex-1 rounded-full bg-[rgba(155,107,51,0.16)]" />
                        <span className="h-3 w-12 shrink-0 rounded-full bg-[rgba(155,107,51,0.16)]" />
                    </div>
                ))}
            </div>
        );
    }

    const rows = isFiveM ? rankWithYou(rivals ?? [], earned, me?.name || t('cookie.you', 'You')) : leaderboard(earned);
    return (
        <div className="flex flex-col gap-1.5" style={{ animation: 'cookie-fade-in 0.28s ease-out' }}>
            {rows.map((r, i) => {
                const rank = i + 1;
                const top  = rank <= 3;
                const editable = r.you && isFiveM;
                return (
                    <div
                        key={`${r.name}-${i}`}
                        onClick={editable ? () => onEditNickname(me?.nickname ?? '') : undefined}
                        role={editable ? 'button' : undefined}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${editable ? 'cursor-pointer active:opacity-90' : ''}`}
                        style={{
                            background: r.you ? 'linear-gradient(120deg, #F6C56B, #E59C3C)' : '#fff',
                            boxShadow:  '0 1px 3px rgba(120,72,20,0.10)',
                        }}
                    >
                        <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-extrabold"
                            style={{
                                background: top ? MEDALS[rank - 1] : 'rgba(155,107,51,0.14)',
                                color:      '#5B3A1A',
                            }}
                        >
                            {rank === 1 ? <Crown className="h-[16px] w-[16px]" strokeWidth={2.5} /> : rank}
                        </span>
                        <span
                            className="min-w-0 flex-1 truncate text-[16px] font-bold"
                            style={{ color: '#4A2C12' }}
                        >
                            {r.name}
                        </span>
                        {editable && <Pencil className="h-[15px] w-[15px] shrink-0 text-[#5B3A1A]/75" strokeWidth={2.5} />}
                        <span
                            className="shrink-0 text-[15px] font-extrabold"
                            style={{ color: r.you ? '#5B3A1A' : '#C77D2E' }}
                        >
                            {fmt(r.cookies)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
