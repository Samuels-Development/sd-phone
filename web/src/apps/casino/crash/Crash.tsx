import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MutableRefObject, ReactNode } from 'react';
import { Coins, Info, Minus, Plus, Rocket } from 'lucide-react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { Scroller } from '@/ui/Scroller';
import { GameHeader } from '@/apps/_games/GameHeader';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { useDeckActive } from '@/shell/deckActive';
import { isFiveM } from '@/core/nui';
import type { CasinoGameProps } from '@/apps/casino/casinoApi';
import { EMBER, GOLD, GOLD_FRAME, PAD_B, SURFACE, TABLE, WELL_SHADOW, fmtChips } from '@/apps/casino/theme';
import { type CrashLoop, playBust, playCashout, playChipPlace, startCrashLoop } from '@/apps/casino/sfx';
import { MuteButton } from '@/apps/casino/MuteButton';

import type { CrashCashout, CrashMine, CrashPhase, CrashPlayerBet, CrashRound, CrashSnapshot } from './data';
import { K, MAX_X100, MIN_X100, fmtMult, payoutAt } from './curve';
import {
    BETTING_MS, BUST_HOLD_MS, MAX_BET, MIN_AUTO, MIN_BET,
    cashOutCrash, placeCrashBet, watchCrash,
} from './crashApi';
import { CurveChart } from './CurveChart';
import { FairnessSheet, type FairRound } from './FairnessSheet';
import { failText } from '@/core/api';

interface CrashClock { offset: number; startedAt: number; serverMx: number }

interface RailRow { n: string; s: number; m: number | null; w: number }

const QUICK = [100, 500, 1000, 5000];
const HISTORY_SHOWN = 5;
const RAIL_MAX = 20;

const EMBER_FRAME = `linear-gradient(160deg, ${EMBER.hot} 0%, ${EMBER.mid} 52%, ${EMBER.deep} 100%)`;

const KEYFRAMES = `
    @keyframes crash-shake { 0%, 100% { transform: translateX(0); } 18% { transform: translateX(-7px); } 38% { transform: translateX(6px); } 58% { transform: translateX(-4px); } 78% { transform: translateX(2px); } }
    @keyframes crash-pill-in { from { opacity: 0; transform: translateX(-12px) scale(0.9); } to { opacity: 1; transform: none; } }
    @keyframes crash-row-in { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
    @keyframes crash-glow { 0%, 100% { box-shadow: 0 6px 16px rgba(224,99,43,0.28); } 50% { box-shadow: 0 6px 26px rgba(224,99,43,0.52); } }
`;

function clampBet(n: number, chips: number): number {
    const ceiling = Math.min(MAX_BET, Math.max(MIN_BET, chips));
    if (!Number.isFinite(n)) return MIN_BET;
    return Math.max(MIN_BET, Math.min(ceiling, Math.floor(n)));
}

function betUnit(n: number): number {
    return n < 500 ? 25 : n < 5000 ? 100 : 500;
}

function autoUnit(n: number): number {
    return n < 300 ? 10 : n < 1000 ? 25 : 100;
}

function multColor(x100: number): string {
    if (x100 >= 1000) return GOLD.top;
    if (x100 >= 200) return '#fff';
    return TABLE.lose;
}

const LIVE_STEP_MS = 50;

const liveSubs = new Set<(v: number) => void>();
let liveClock: CrashClock | null = null;
let liveTimer: number | null = null;

function liveStep() {
    const c = liveClock;
    if (c === null) return;
    const elapsed = Date.now() + c.offset - c.startedAt;
    let m = elapsed > 0 ? Math.floor(100 * Math.exp(K * elapsed)) : MIN_X100;
    if (m > MAX_X100) m = MAX_X100;
    if (m < c.serverMx) m = c.serverMx;
    for (const notify of liveSubs) notify(m);
}

function useLiveMult(clock: MutableRefObject<CrashClock>, active: boolean): number {
    const [value, setValue] = useState(MIN_X100);

    useEffect(() => {
        if (!active) { setValue(MIN_X100); return; }
        liveClock = clock.current;
        liveSubs.add(setValue);
        if (liveTimer === null) liveTimer = window.setInterval(liveStep, LIVE_STEP_MS);
        liveStep();
        return () => {
            liveSubs.delete(setValue);
            if (liveSubs.size === 0 && liveTimer !== null) {
                window.clearInterval(liveTimer);
                liveTimer = null;
            }
        };
    }, [active, clock]);

    return value;
}

// Lua drops a nil field rather than encoding null, so an absent bet arrives as undefined and a
// `!== null` guard would wave it straight through into the placed-bet panel.
function normalizeMine(m: CrashMine | null | undefined): CrashMine | null {
    if (!m) return null;
    return { ...m, auto: m.auto ?? null, mx: m.mx ?? null, payout: m.payout ?? 0 };
}

export function Crash({ chips, onChips, onBack, onCashier }: CasinoGameProps) {
    const deckActive = useDeckActive();

    const [phase, setPhase]         = useState<CrashPhase>('idle');
    const [roundId, setRoundId]     = useState('');
    const [commit, setCommit]       = useState<string | null>(null);
    const [ceiling, setCeiling]     = useState(MAX_X100);
    const [bets, setBets]           = useState<CrashPlayerBet[]>([]);
    const [cash, setCash]           = useState<CrashCashout[]>([]);
    const [history, setHistory]     = useState<CrashRound[]>([]);
    const [mine, setMine]           = useState<CrashMine | null>(null);
    const [last, setLast]           = useState<FairRound | null>(null);
    const [betCloseAt, setBetClose] = useState(0);
    const [bustAt, setBustAt]       = useState(0);
    const [runKey, setRunKey]       = useState(0);
    const [runDelay, setRunDelay]   = useState(0);
    const [fairOpen, setFairOpen]   = useState(false);
    const [busy, setBusy]           = useState(false);
    const [needChips, setNeedChips] = useState(false);
    const [error, setError]         = useState<string | null>(null);

    const [amount, setAmount] = useSessionState<number>('casino:crashBet', 100);
    const [auto, setAuto]     = useSessionState<{ on: boolean; x100: number }>('casino:crashAuto', { on: false, x100: 200 });

    const clock    = useRef<CrashClock>({ offset: 0, startedAt: 0, serverMx: MIN_X100 });
    const climbSfx = useRef<CrashLoop | null>(null);
    const phaseRef = useRef<CrashPhase>('idle');
    const devTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const roundRef = useRef('');
    const cashing  = useRef(false);

    const applySnapshot = useCallback((s: CrashSnapshot) => {
        clock.current.offset    = s.now - Date.now();
        clock.current.startedAt = s.startedAt;
        clock.current.serverMx  = s.ph === 'run' ? s.mx : MIN_X100;
        phaseRef.current = s.ph;
        roundRef.current = s.id;
        setPhase(s.ph);
        setRoundId(s.id);
        setCommit(s.commit);
        setCeiling(s.max > MIN_X100 ? s.max : MAX_X100);
        setBets(s.bets);
        setCash(s.cash);
        setHistory(s.history);
        setMine(normalizeMine(s.mine));
        if (s.ph === 'bet')  setBetClose(Date.now() + s.msLeft);
        if (s.ph === 'run')  { setRunDelay(Math.max(0, s.now - s.startedAt)); setRunKey(k => k + 1); }
        if (s.ph === 'bust') setBustAt(Date.now());
        const top = s.history[0];
        setLast(top ? { id: top.id, bust: top.bust, seed: top.seed, commit: top.commit } : null);
    }, []);

    useEffect(() => {
        if (!deckActive) return;
        let live = true;
        void watchCrash(true).then(s => { if (live && s) applySnapshot(s); });
        return () => { live = false; void watchCrash(false); };
    }, [deckActive, applySnapshot]);

    useEffect(() => {
        if (phase !== 'run') return;
        climbSfx.current?.stop();
        const loop = startCrashLoop();
        climbSfx.current = loop;
        if (!loop) return;

        const feed = window.setInterval(() => {
            const c = clock.current;
            const elapsed = Date.now() + c.offset - c.startedAt;
            const x100 = elapsed > 0 ? Math.min(MAX_X100, Math.floor(100 * Math.exp(K * elapsed))) : MIN_X100;
            loop.tick(Math.max(c.serverMx, x100) / 100);
        }, 90);

        return () => {
            window.clearInterval(feed);
            loop.stop();
            climbSfx.current = null;
        };
    }, [phase]);

    useNuiEvent('sd-phone:crash:snapshot', d => { if (d) applySnapshot(d); });

    useNuiEvent('sd-phone:crash:tick', d => {
        if (!d) return;
        clock.current.offset = d.now - Date.now();

        const fresh = d.id !== roundRef.current;
        if (fresh) { roundRef.current = d.id; setRoundId(d.id); }

        if (d.ph === 'bet') {
            if (fresh || phaseRef.current !== 'bet') {
                phaseRef.current = 'bet';
                cashing.current = false;
                setPhase('bet');
                setBets([]);
                setCash([]);
                setMine(null);
                setBetClose(Date.now() + Math.max(0, d.ms));
            }
            if (d.commit !== undefined) setCommit(d.commit);
        } else {
            clock.current.startedAt = d.now - d.ms;
            if (typeof d.mx === 'number') clock.current.serverMx = d.mx;
            if (phaseRef.current !== 'run') {
                phaseRef.current = 'run';
                setPhase('run');
                setRunDelay(Math.max(0, d.ms));
                setRunKey(k => k + 1);
            }
        }

        const joined = d.bet;
        if (joined && joined.length > 0) setBets(prev => [...prev, ...joined]);
        const cashed = d.cash;
        if (cashed && cashed.length > 0) setCash(prev => [...prev, ...cashed]);
    });

    useNuiEvent('sd-phone:crash:bust', d => {
        if (!d) return;
        phaseRef.current = 'bust';
        clock.current.serverMx = d.bust;
        setPhase('bust');
        playBust();
        setBustAt(Date.now());
        setLast({ id: d.id, bust: d.bust, seed: d.seed, commit: d.commit });
        setHistory(prev => [{ id: d.id, bust: d.bust, seed: d.seed, commit: d.commit }, ...prev.filter(r => r.id !== d.id)].slice(0, RAIL_MAX));
    });

    useNuiEvent('sd-phone:crash:settled', d => {
        if (!d) return;
        setMine(prev => (prev === null
            ? { stake: d.stake, auto: null, settled: true, mx: d.mx ?? null, payout: d.payout }
            : { ...prev, settled: true, mx: d.mx ?? null, payout: d.payout }));
        onChips(d.chips);
        if (d.payout > 0) playCashout();
    });

    const stake = clampBet(amount, chips);
    const canAfford = chips >= MIN_BET;

    function devClimbTo50() {
        if (devTimer.current) clearTimeout(devTimer.current);
        void watchCrash(false);
        const ms = Math.log(50) / K;
        roundRef.current = 'devclimb';
        setRoundId('devclimb');
        clock.current.offset = 0;
        clock.current.startedAt = Date.now();
        clock.current.serverMx = MIN_X100;
        phaseRef.current = 'run';
        setPhase('run');
        devTimer.current = setTimeout(() => {
            clock.current.serverMx = 5000;
            phaseRef.current = 'bust';
            setPhase('bust');
            playBust();
        }, ms);
    }

    async function submitBet() {
        if (busy || phase !== 'bet' || mine !== null) return;
        if (!canAfford) { setNeedChips(true); return; }
        setBusy(true);
        const r = await placeCrashBet(stake, auto.on ? auto.x100 : null);
        setBusy(false);
        if (!r.ok || !r.data) {
            if (r.message === 'Not enough chips') setNeedChips(true);
            else setError(failText(r, t('casino.somethingWrong', 'Something went wrong')));
            return;
        }
        const data = r.data;
        setAmount(data.stake);
        setMine({ stake: data.stake, auto: data.auto, settled: false, mx: null, payout: 0 });
        onChips(data.chips);
        playChipPlace();
    }

    async function cashOut() {
        if (cashing.current || phase !== 'run' || mine === null || mine.settled) return;
        cashing.current = true;
        const r = await cashOutCrash(roundId);
        cashing.current = false;
        if (!r.ok || !r.data) {
            setError(failText(r, t('crash.roundOver', 'Round is over')));
            return;
        }
        const data = r.data;
        setMine(prev => (prev === null ? prev : { ...prev, settled: true, mx: data.mx, payout: data.payout }));
        onChips(data.chips);
    }

    const rows = useMemo<RailRow[]>(() => {
        const ranked = [...cash].sort((a, b) => b.m - a.m);
        const done = new Set(ranked.map(c => c.n));
        const stakes = new Map(bets.map(b => [b.n, b.s]));
        const out: RailRow[] = ranked.map(c => ({ n: c.n, s: stakes.get(c.n) ?? 0, m: c.m, w: c.w }));
        for (const b of bets) if (!done.has(b.n)) out.push({ n: b.n, s: b.s, m: null, w: 0 });
        return out.slice(0, RAIL_MAX);
    }, [bets, cash]);

    const chartPhase = phase === 'idle' ? 'bet' : phase;

    return (
        <>
            <style>{KEYFRAMES}</style>

            <div className="relative shrink-0">
                <GameHeader
                    title={t('crash.title', 'Crash')}
                    accent={EMBER.mid}
                    onBack={onBack}
                    right={(
                        <div className="flex items-center gap-1">
                            {!isFiveM && (
                                <button
                                    type="button"
                                    onClick={devClimbTo50}
                                    className="flex h-8 items-center justify-center rounded-full px-2 text-[11px] font-extrabold active:opacity-60"
                                    style={{ background: SURFACE.sunken, color: EMBER.hot }}
                                >
                                    50x
                                </button>
                            )}
                            <MuteButton accent={EMBER.mid} />
                            <button
                                type="button"
                                onClick={() => setFairOpen(true)}
                                aria-label={t('crash.provablyFair', 'Provably fair')}
                                className="flex h-8 w-8 items-center justify-center rounded-full active:opacity-60"
                                style={{ background: SURFACE.sunken }}
                            >
                                <Info className="h-[17px] w-[17px] text-white/65" strokeWidth={2.3} />
                            </button>
                        </div>
                    )}
                />
            </div>

            <div className="flex shrink-0 justify-center px-4 pb-1 pt-1">
                <button
                    type="button"
                    onClick={onCashier}
                    className="flex items-center gap-2 rounded-full px-4 py-1.5 active:opacity-70"
                    style={{ background: SURFACE.sunken, border: `1px solid ${SURFACE.hair}` }}
                >
                    <Coins className="h-[16px] w-[16px]" strokeWidth={2.4} style={{ color: TABLE.chip }} />
                    <span className="text-[17px] font-extrabold tabular-nums" style={{ color: TABLE.chip }}>{fmtChips(chips)}</span>
                    <span className="text-[13px] font-semibold text-white/55">{t('casino.chips', 'chips')}</span>
                </button>
            </div>

            <Readout clock={clock} phase={phase} bust={last?.bust ?? null} />

            <CurveChart phase={chartPhase} runKey={runKey} delayMs={runDelay} bustX100={phase === 'bust' ? last?.bust ?? null : null} />

            <div className="shrink-0 px-4 pt-2">
                {phase === 'bet' && mine === null && (
                    <BetPanel
                        stake={stake}
                        chips={chips}
                        auto={auto}
                        maxAuto={ceiling - 1}
                        busy={busy}
                        deadline={betCloseAt}
                        onStake={setAmount}
                        onAuto={setAuto}
                        onBet={() => { void submitBet(); }}
                        onCashier={onCashier}
                    />
                )}

                {phase === 'bet' && mine !== null && <PlacedPanel mine={mine} deadline={betCloseAt} />}

                {phase === 'run' && mine !== null && !mine.settled && (
                    <CashOutPanel clock={clock} mine={mine} onCashOut={() => { void cashOut(); }} />
                )}

                {phase === 'run' && mine !== null && mine.settled && <SettledPanel mine={mine} />}

                {phase === 'run' && mine === null && (
                    <StatusPanel tint={EMBER.hot} label={t('crash.inFlight', 'In flight')} note={t('crash.notInRound', 'You are not in this round')} />
                )}

                {phase === 'bust' && (
                    <StatusPanel
                        tint={TABLE.lose}
                        label={mine !== null && mine.settled && mine.payout > 0
                            ? t('crash.cashedOut', 'Cashed Out')
                            : t('crash.busted', 'Busted')}
                        note={<Countdown deadline={bustAt + BUST_HOLD_MS} render={s => t('crash.nextRound', 'Next round in {s}s', { s })} />}
                        gain={mine !== null && mine.settled && mine.payout > 0 ? mine.payout : 0}
                    />
                )}

                {phase === 'idle' && (
                    <StatusPanel tint="rgba(255,255,255,0.55)" label={t('crash.waiting', 'Waiting for the next round')} />
                )}
            </div>

            <div className="mt-2 flex min-h-0 flex-1 flex-col px-4">
                <div className="flex shrink-0 items-center justify-between pb-1">
                    <span className="text-[12px] font-bold uppercase tracking-wide text-white/45">{t('crash.players', 'Players')}</span>
                    <span className="text-[12px] font-semibold tabular-nums text-white/45">{rows.length}</span>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden rounded-[16px]" style={{ background: SURFACE.sunken, boxShadow: WELL_SHADOW }}>
                    <Scroller className="h-full [contain:paint]">
                        {rows.length === 0 ? (
                            <div className="flex h-full items-center justify-center py-5 text-[13px] font-semibold text-white/35">
                                {t('crash.noBets', 'No bets yet')}
                            </div>
                        ) : (
                            rows.map((row, i) => <RailRowView key={`${row.n}-${i}`} row={row} phase={phase} first={i === 0} />)
                        )}
                    </Scroller>
                </div>
            </div>

            <div className="shrink-0 px-4 pt-2" style={{ paddingBottom: PAD_B }}>
                <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
                    <span className="shrink-0 pr-0.5 text-[11px] font-bold uppercase tracking-wide text-white/35">
                        {t('crash.history', 'History')}
                    </span>
                    {history.slice(0, HISTORY_SHOWN).map(round => (
                        <span
                            key={round.id}
                            className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                            style={{
                                background: SURFACE.soft,
                                color: multColor(round.bust),
                                border: `1px solid ${SURFACE.hair}`,
                                animation: 'crash-pill-in 200ms cubic-bezier(0.2,0.8,0.3,1)',
                            }}
                        >
                            {fmtMult(round.bust)}x
                        </span>
                    ))}
                </div>
            </div>

            {fairOpen && <FairnessSheet commit={commit} previous={last} ceiling={ceiling} onClose={() => setFairOpen(false)} />}

            {needChips && (
                <AlertDialog
                    forceDark
                    title={t('casino.outOfChips', 'Out of chips')}
                    message={t('casino.outOfChipsBody', 'Head to the cashier to buy more.')}
                    confirmLabel={t('casino.buyChips', 'Buy chips')}
                    cancelLabel={t('casino.notNow', 'Not now')}
                    onCancel={() => setNeedChips(false)}
                    onConfirm={() => { setNeedChips(false); onCashier(); }}
                />
            )}

            {error !== null && (
                <AlertDialog
                    forceDark
                    hideCancel
                    title={t('casino.somethingWrong', 'Something went wrong')}
                    message={error}
                    confirmLabel={t('casino.done', 'Done')}
                    onCancel={() => setError(null)}
                    onConfirm={() => setError(null)}
                />
            )}
        </>
    );
}

function Readout({ clock, phase, bust }: { clock: MutableRefObject<CrashClock>; phase: CrashPhase; bust: number | null }) {
    const live = useLiveMult(clock, phase === 'run');
    const value = phase === 'run' ? live : phase === 'bust' ? bust ?? MIN_X100 : MIN_X100;

    const color = phase === 'bust'
        ? TABLE.lose
        : value >= 1000 ? EMBER.hot : value >= 200 ? GOLD.top : '#fff';

    const caption = phase === 'bet'
        ? t('crash.betsOpen', 'Bets open')
        : phase === 'run'
            ? t('crash.inFlight', 'In flight')
            : phase === 'bust'
                ? t('crash.busted', 'Busted')
                : t('crash.waiting', 'Waiting for the next round');

    return (
        <div className="flex h-[78px] shrink-0 flex-col items-center justify-center">
            <span
                key={phase}
                className="text-[56px] font-black leading-none tabular-nums"
                style={{ color, animation: phase === 'bust' ? 'crash-shake 240ms ease-in-out' : undefined }}
            >
                {fmtMult(value)}x
            </span>
            <span className="pt-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-white/40">{caption}</span>
        </div>
    );
}

function BetPanel({ stake, chips, auto, maxAuto, busy, deadline, onStake, onAuto, onBet, onCashier }: {
    stake:      number;
    chips:      number;
    auto:       { on: boolean; x100: number };
    maxAuto:    number;
    busy:       boolean;
    deadline:   number;
    onStake:    (n: number) => void;
    onAuto:     (v: { on: boolean; x100: number }) => void;
    onBet:      () => void;
    onCashier:  () => void;
}) {
    const broke = chips < MIN_BET;

    return (
        <div className="flex flex-col gap-2">
            <CountdownBar deadline={deadline} totalMs={BETTING_MS} color={GOLD.mid} />

            <div className="flex items-center gap-2">
                <RoundButton label={t('crash.lower', 'Lower stake')} onClick={() => onStake(clampBet(stake - betUnit(stake), chips))}>
                    <Minus className="h-[18px] w-[18px]" strokeWidth={3} />
                </RoundButton>
                <div
                    className="flex flex-1 flex-col items-center rounded-2xl py-1"
                    style={{ background: SURFACE.sunken, border: `1px solid ${SURFACE.hair}` }}
                >
                    <span className="text-[11px] font-bold uppercase tracking-wide text-white/45">{t('crash.stake', 'Stake')}</span>
                    <span className="text-[22px] font-extrabold leading-tight tabular-nums" style={{ color: TABLE.chip }}>{fmtChips(stake)}</span>
                </div>
                <RoundButton label={t('crash.raise', 'Raise stake')} onClick={() => onStake(clampBet(stake + betUnit(stake), chips))}>
                    <Plus className="h-[18px] w-[18px]" strokeWidth={3} />
                </RoundButton>
            </div>

            <div className="flex items-center gap-1.5">
                {QUICK.map(q => (
                    <button
                        key={q}
                        type="button"
                        onClick={() => onStake(clampBet(q, chips))}
                        className="flex-1 rounded-full py-1.5 text-[12px] font-extrabold tabular-nums text-white/75 active:opacity-70"
                        style={{ background: SURFACE.soft, border: `1px solid ${SURFACE.hair}` }}
                    >
                        {q >= 1000 ? `${q / 1000}k` : q}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => onStake(clampBet(Math.min(MAX_BET, chips), chips))}
                    className="flex-1 rounded-full py-1.5 text-[12px] font-extrabold active:opacity-70"
                    style={{ background: SURFACE.soft, color: GOLD.top, border: `1px solid ${GOLD.deep}` }}
                >
                    {t('slots.max', 'MAX')}
                </button>
            </div>

            <div
                className="flex items-center gap-2 rounded-2xl px-2 py-1.5"
                style={{ background: SURFACE.sunken, border: `1px solid ${SURFACE.hair}` }}
            >
                <button
                    type="button"
                    onClick={() => onAuto({ ...auto, on: !auto.on })}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1 text-left active:opacity-70"
                >
                    <span
                        className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full"
                        style={{ background: auto.on ? EMBER.mid : 'rgba(255,255,255,0.10)', boxShadow: auto.on ? `0 0 8px ${EMBER.mid}` : 'none' }}
                    >
                        <Rocket className="h-[12px] w-[12px]" strokeWidth={2.6} style={{ color: auto.on ? '#fff' : 'rgba(255,255,255,0.45)' }} />
                    </span>
                    <span className="truncate text-[13px] font-semibold text-white/70">{t('crash.auto', 'Auto cash out')}</span>
                </button>

                {auto.on ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                        <StepChip label={t('crash.lowerAuto', 'Lower target')} onClick={() => onAuto({ on: true, x100: Math.max(MIN_AUTO, auto.x100 - autoUnit(auto.x100)) })}>
                            <Minus className="h-[13px] w-[13px]" strokeWidth={3} />
                        </StepChip>
                        <span className="w-[58px] text-center text-[15px] font-extrabold tabular-nums" style={{ color: EMBER.hot }}>
                            {fmtMult(auto.x100)}x
                        </span>
                        <StepChip label={t('crash.raiseAuto', 'Raise target')} onClick={() => onAuto({ on: true, x100: Math.min(maxAuto, auto.x100 + autoUnit(auto.x100)) })}>
                            <Plus className="h-[13px] w-[13px]" strokeWidth={3} />
                        </StepChip>
                    </div>
                ) : (
                    <span className="shrink-0 pr-2 text-[13px] font-bold text-white/35">{t('crash.autoOff', 'Off')}</span>
                )}
            </div>

            {broke ? (
                <button
                    type="button"
                    onClick={onCashier}
                    className="w-full rounded-2xl py-3.5 text-[17px] font-extrabold active:scale-[0.97]"
                    style={{ background: GOLD_FRAME, color: '#0B3A24', boxShadow: `inset 0 1px 0 ${GOLD.hi}`, transition: 'transform 0.08s' }}
                >
                    {t('casino.buyChips', 'Buy chips')}
                </button>
            ) : (
                <button
                    type="button"
                    onClick={onBet}
                    disabled={busy}
                    className="w-full rounded-2xl py-3.5 text-[17px] font-extrabold active:scale-[0.97]"
                    style={{
                        background: GOLD_FRAME,
                        color: '#0B3A24',
                        boxShadow: `inset 0 1px 0 ${GOLD.hi}`,
                        opacity: busy ? 0.5 : 1,
                        transition: 'transform 0.08s',
                    }}
                >
                    {t('crash.betAmount', 'Bet {n}', { n: fmtChips(stake) })}
                </button>
            )}
        </div>
    );
}

function PlacedPanel({ mine, deadline }: { mine: CrashMine; deadline: number }) {
    return (
        <div className="flex flex-col gap-2">
            <CountdownBar deadline={deadline} totalMs={BETTING_MS} color={GOLD.mid} />
            <div
                className="flex items-center justify-between rounded-2xl px-4 py-3.5"
                style={{ background: SURFACE.sunken, border: `1.5px solid ${GOLD.deep}`, boxShadow: WELL_SHADOW }}
            >
                <span className="flex flex-col">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-white/45">{t('crash.stake', 'Stake')}</span>
                    <span className="text-[22px] font-extrabold leading-tight tabular-nums" style={{ color: TABLE.chip }}>{fmtChips(mine.stake)}</span>
                </span>
                <span className="flex flex-col items-end">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-white/45">{t('crash.auto', 'Auto cash out')}</span>
                    <span className="text-[22px] font-extrabold leading-tight tabular-nums" style={{ color: mine.auto === null ? 'rgba(255,255,255,0.35)' : EMBER.hot }}>
                        {mine.auto === null ? t('crash.autoOff', 'Off') : `${fmtMult(mine.auto)}x`}
                    </span>
                </span>
            </div>
        </div>
    );
}

function CashOutPanel({ clock, mine, onCashOut }: { clock: MutableRefObject<CrashClock>; mine: CrashMine; onCashOut: () => void }) {
    const live = useLiveMult(clock, true);
    const payout = payoutAt(mine.stake, live);

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                onClick={onCashOut}
                className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-[19px] font-extrabold text-white active:scale-[0.97]"
                style={{
                    background: EMBER_FRAME,
                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.28)`,
                    animation: 'crash-glow 1.6s ease-in-out infinite',
                    transition: 'transform 0.08s',
                }}
            >
                {t('crash.cashOut', 'Cash Out')}
                <span className="tabular-nums">+{fmtChips(payout)}</span>
            </button>
            <div className="flex items-center justify-center gap-3 text-[12px] font-semibold text-white/45">
                <span className="tabular-nums">{t('crash.stake', 'Stake')} {fmtChips(mine.stake)}</span>
                {mine.auto !== null && (
                    <span className="tabular-nums" style={{ color: EMBER.hot }}>
                        {t('crash.auto', 'Auto cash out')} {fmtMult(mine.auto)}x
                    </span>
                )}
            </div>
        </div>
    );
}

function SettledPanel({ mine }: { mine: CrashMine }) {
    const won = mine.payout > 0;

    return (
        <div
            className="flex items-center justify-between rounded-2xl px-4 py-3.5"
            style={{
                background: won ? GOLD_FRAME : SURFACE.sunken,
                boxShadow: won ? `inset 0 1px 0 ${GOLD.hi}` : WELL_SHADOW,
            }}
        >
            <span className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: won ? 'rgba(11,58,36,0.65)' : 'rgba(255,255,255,0.45)' }}>
                    {won ? t('crash.cashedOut', 'Cashed Out') : t('crash.busted', 'Busted')}
                </span>
                <span className="text-[24px] font-extrabold leading-tight tabular-nums" style={{ color: won ? '#0B3A24' : TABLE.lose }}>
                    {mine.mx === null ? fmtChips(mine.stake) : `${fmtMult(mine.mx)}x`}
                </span>
            </span>
            <span className="text-[24px] font-extrabold tabular-nums" style={{ color: won ? '#0B3A24' : TABLE.lose }}>
                {won ? `+${fmtChips(mine.payout)}` : `-${fmtChips(mine.stake)}`}
            </span>
        </div>
    );
}

function StatusPanel({ tint, label, note, gain = 0 }: { tint: string; label: string; note?: ReactNode; gain?: number }) {
    return (
        <div
            className="flex items-center justify-between rounded-2xl px-4 py-3.5"
            style={{ background: SURFACE.sunken, boxShadow: WELL_SHADOW }}
        >
            <span className="flex flex-col">
                <span className="text-[16px] font-extrabold" style={{ color: tint }}>{label}</span>
                {note !== undefined && <span className="pt-0.5 text-[12px] font-semibold text-white/45">{note}</span>}
            </span>
            {gain > 0 && (
                <span className="text-[22px] font-extrabold tabular-nums" style={{ color: GOLD.top }}>+{fmtChips(gain)}</span>
            )}
        </div>
    );
}

function RailRowView({ row, phase, first }: { row: RailRow; phase: CrashPhase; first: boolean }) {
    const cashed = row.m !== null;
    const lost = !cashed && phase === 'bust';

    const badge = cashed
        ? { text: `${fmtMult(row.m ?? MIN_X100)}x`, tint: GOLD.top, wash: 'rgba(240,212,138,0.16)' }
        : lost
            ? { text: t('crash.busted', 'Busted'), tint: TABLE.lose, wash: 'rgba(255,133,133,0.14)' }
            : phase === 'run'
                ? { text: t('crash.inFlight', 'In flight'), tint: EMBER.hot, wash: 'rgba(224,99,43,0.16)' }
                : null;

    return (
        <div
            className="flex items-center gap-2 px-3 py-[7px]"
            style={{
                borderTop: first ? 'none' : `1px solid ${SURFACE.hair}`,
                animation: 'crash-row-in 220ms cubic-bezier(0.2,0.8,0.3,1)',
            }}
        >
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white/85">{row.n}</span>
            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-white/45">{fmtChips(row.s)}</span>
            <span className="w-[68px] shrink-0">
                {badge !== null && (
                    <span
                        className="block truncate rounded-full px-1 py-0.5 text-center text-[12px] font-extrabold tabular-nums"
                        style={{ background: badge.wash, color: badge.tint }}
                    >
                        {badge.text}
                    </span>
                )}
            </span>
            <span className="w-[62px] shrink-0 text-right text-[13px] font-extrabold tabular-nums" style={{ color: cashed ? GOLD.top : TABLE.lose }}>
                {cashed ? `+${fmtChips(row.w)}` : lost ? `-${fmtChips(row.s)}` : ''}
            </span>
        </div>
    );
}

function CountdownBar({ deadline, totalMs, color }: { deadline: number; totalMs: number; color: string }) {
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const left = Math.max(0, deadline - Date.now());
        const pct = totalMs > 0 ? Math.max(0, Math.min(100, (left / totalMs) * 100)) : 0;
        el.style.transition = 'none';
        el.style.width = `${pct}%`;
        void el.offsetWidth;
        el.style.transition = `width ${left}ms linear`;
        el.style.width = '0%';
    }, [deadline, totalMs]);

    return (
        <div className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }}>
            <div ref={ref} className="h-full rounded-full" style={{ background: color, width: '100%' }} />
        </div>
    );
}

function Countdown({ deadline, render }: { deadline: number; render: (s: number) => string }) {
    const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));

    useEffect(() => {
        const step = () => setSecs(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        step();
        const id = window.setInterval(step, 250);
        return () => window.clearInterval(id);
    }, [deadline]);

    return <>{render(secs)}</>;
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white active:opacity-70"
            style={{ background: SURFACE.sunken, border: `1px solid ${SURFACE.hair}` }}
        >
            {children}
        </button>
    );
}

function StepChip({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    const style: CSSProperties = { background: 'rgba(255,255,255,0.08)', border: `1px solid ${SURFACE.hair}` };
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-white/80 active:opacity-60"
            style={style}
        >
            {children}
        </button>
    );
}
