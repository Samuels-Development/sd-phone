import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, TransitionEvent } from 'react';
import { Coins, Info, Minus, Plus } from 'lucide-react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { Sheet } from '@/ui/Sheet';
import { GameHeader } from '@/apps/_games/GameHeader';
import { readJson, writeJson } from '@/lib/storage';
import type { CasinoGameProps } from '@/apps/casino/casinoApi';
import { CARD_SHADOW, FELT, GOLD, GOLD_FRAME, PAD_B, SURFACE, TABLE, WELL_SHADOW, fmtChips } from '@/apps/casino/theme';
import { MuteButton } from '@/apps/casino/MuteButton';
import { type ReelLoop, playBigWin, playReelSpin, playReelStop, playWin, startReelLoop } from '@/apps/casino/sfx';
import { REELS, STRIP_LEN, type SlotSymbolId } from './strips';
import { LINES, PAYLINES, PAY_ORDER, SUITS_PAY, TRIPLE_PAY } from './paytable';
import { SlotSymbol } from './SlotSymbol';
import { type SlotLine, type SlotResult, slotsSpin } from './slotsApi';
import { failText } from '@/core/api';

const CELL = 104;
const REEL_W = 112;
const GUTTER = 8;
const WELL_W = REEL_W * 3 + GUTTER * 2;
const WELL_H = CELL * 3;
const CAB_W = WELL_W + 40;
const SYMBOL_PX = 66;

const HOME = 1;
const LOOPS = [4, 5, 6];
const COPIES = [LOOPS[0] + 3, LOOPS[1] + 3, LOOPS[2] + 3];
const DURATION = [1500, 1900, 2300];
const SPIN_EASE = 'cubic-bezier(0.09, 0.72, 0.16, 1)';
const SETTLE_MS = 160;

const BET_STEPS = [5, 25, 50, 100, 250, 500, 1000];
const BET_KEY = 'sd-phone:slots:linebet';
const LAND_GRACE = 600;

const offsetFor = (stop: number) => -((HOME * STRIP_LEN + stop - 1) * CELL) + CELL;

const CELL_STYLE: CSSProperties = {
    height: CELL,
    width: REEL_W,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const REEL_CELLS: ReactElement[][] = REELS.map((strip, reel) => {
    const cells: ReactElement[] = [];
    for (let copy = 0; copy < COPIES[reel]; copy++) {
        for (let i = 0; i < STRIP_LEN; i++) {
            cells.push(
                <div key={`${copy}-${i}`} style={CELL_STYLE}>
                    <SlotSymbol id={strip[i]} size={SYMBOL_PX} />
                </div>,
            );
        }
    }
    return cells;
});

const STREAKS = [
    'repeating-linear-gradient(180deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, rgba(255,255,255,0) 1px, rgba(255,255,255,0) 6px)',
    'linear-gradient(180deg, rgba(0,0,0,0.34) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 78%, rgba(0,0,0,0.34) 100%)',
].join(', ');

const RESTING_STOPS = [7, 18, 29];
const SUIT_IDS: SlotSymbolId[] = ['spade', 'heart', 'diamond', 'club'];

type Phase = 'idle' | 'spinning' | 'result';

function symbolName(id: SlotSymbolId): string {
    switch (id) {
        case 'crown':     return t('slots.symbolCrown', 'Crown');
        case 'seven':     return t('slots.symbolSeven', 'Seven');
        case 'horseshoe': return t('slots.symbolHorseshoe', 'Horseshoe');
        case 'bell':      return t('slots.symbolBell', 'Bell');
        case 'diamond':   return t('slots.symbolDiamond', 'Diamond');
        case 'club':      return t('slots.symbolClub', 'Club');
        case 'heart':     return t('slots.symbolHeart', 'Heart');
        case 'spade':     return t('slots.symbolSpade', 'Spade');
    }
}

function initialBet(): number {
    const n = readJson<number>(BET_KEY);
    return typeof n === 'number' && BET_STEPS.indexOf(n) >= 0 ? n : 25;
}

export function Slots({ chips, onChips, onBack, onCashier }: CasinoGameProps) {
    const [bet, setBet] = useState<number>(initialBet);
    const [phase, setPhase] = useState<Phase>('idle');
    const [blurred, setBlurred] = useState<boolean[]>([false, false, false]);
    const [lines, setLines] = useState<SlotLine[]>([]);
    const [net, setNet] = useState(0);
    const [win, setWin] = useState(0);
    const [paytableOpen, setPaytableOpen] = useState(false);
    const [needChips, setNeedChips] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const stripRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
    const wrapRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);
    const stops = useRef<number[]>([...RESTING_STOPS]);
    const landed = useRef<boolean[]>([false, false, false]);
    const pending = useRef<SlotResult | null>(null);
    const spinning = useRef(false);
    const reelLoop = useRef<ReelLoop | null>(null);
    const timers = useRef<number[]>([]);

    useEffect(() => { writeJson(BET_KEY, bet); }, [bet]);
    useEffect(() => () => { timers.current.forEach(id => window.clearTimeout(id)); reelLoop.current?.stop(); }, []);

    const attachStrip = useMemo(
        () => [0, 1, 2].map(r => (el: HTMLDivElement | null) => {
            stripRefs.current[r] = el;
            if (el && !el.style.transform) el.style.transform = `translateY(${offsetFor(stops.current[r])}px)`;
        }),
        [],
    );
    const attachWrap = useMemo(
        () => [0, 1, 2].map(r => (el: HTMLDivElement | null) => { wrapRefs.current[r] = el; }),
        [],
    );

    const stake = bet * LINES;
    const chipsRef = useRef(chips); chipsRef.current = chips;
    const affordable = stake <= chips;
    const betIndex = BET_STEPS.indexOf(bet);

    function stepBet(delta: number) {
        if (spinning.current) return;
        const from = betIndex < 0 ? 0 : betIndex;
        const next = Math.max(0, Math.min(BET_STEPS.length - 1, from + delta));
        setBet(BET_STEPS[next]);
    }

    function maxBet() {
        if (spinning.current) return;
        let best = BET_STEPS[0];
        for (const step of BET_STEPS) if (step * LINES <= chips) best = step;
        setBet(best);
    }

    function launch(target: number[]) {
        for (let r = 0; r < 3; r++) {
            const el = stripRefs.current[r];
            if (!el) continue;
            el.style.transition = 'none';
            el.style.transform = `translateY(${offsetFor(stops.current[r]) - LOOPS[r] * STRIP_LEN * CELL}px)`;
            void el.offsetHeight;
            el.style.transition = `transform ${DURATION[r]}ms ${SPIN_EASE}`;
            el.style.transform = `translateY(${offsetFor(target[r])}px)`;
        }
        timers.current.push(window.setTimeout(() => { for (let r = 0; r < 3; r++) land(r); }, DURATION[DURATION.length - 1] + LAND_GRACE));
    }

    function land(r: number) {
        const data = pending.current;
        if (!data || landed.current[r]) return;
        landed.current[r] = true;

        const el = stripRefs.current[r];
        if (el) {
            el.style.transition = 'none';
            el.style.transform = `translateY(${offsetFor(data.stops[r])}px)`;
            void el.offsetHeight;
            el.style.transition = '';
        }
        stops.current[r] = data.stops[r];
        playReelStop(r);
        reelLoop.current?.reelLanded(landed.current.filter(v => !v).length);
        setBlurred(prev => prev.map((v, i) => (i === r ? false : v)));

        const wrap = wrapRefs.current[r];
        if (wrap) {
            wrap.classList.add('slot-settle');
            timers.current.push(window.setTimeout(() => wrap.classList.remove('slot-settle'), SETTLE_MS + 40));
        }

        if (landed.current.every(Boolean)) {
            reelLoop.current?.stop();
            reelLoop.current = null;
            spinning.current = false;
            pending.current = null;
            setLines(data.lines);
            setWin(data.win);
            setNet(data.net);
            setPhase('result');
            onChips(data.chips);
            if (data.win >= data.bet * 10) playBigWin();
            else if (data.win > 0) playWin();
        }
    }

    function onReelEnd(e: TransitionEvent<HTMLDivElement>, r: number) {
        if (e.propertyName !== 'transform' || e.target !== e.currentTarget) return;
        land(r);
    }

    async function spin() {
        if (spinning.current) return;
        if (!affordable) { setNeedChips(true); return; }
        spinning.current = true;
        timers.current.forEach(id => window.clearTimeout(id));
        timers.current = [];
        wrapRefs.current.forEach(wrap => wrap?.classList.remove('slot-settle'));
        landed.current = [false, false, false];
        setLines([]);
        setWin(0);
        setNet(0);
        setPhase('spinning');
        setBlurred([true, true, true]);
        onChips(chipsRef.current - stake);
        playReelSpin();
        reelLoop.current?.stop();
        reelLoop.current = startReelLoop();

        const res = await slotsSpin(bet);
        if (!res.ok || !res.data) {
            reelLoop.current?.stop();
            reelLoop.current = null;
            spinning.current = false;
            setPhase('idle');
            setBlurred([false, false, false]);
            onChips(chipsRef.current + stake);
            if (res.message === 'Not enough chips') setNeedChips(true);
            else setError(failText(res, t('casino.somethingWrong', 'Something went wrong')));
            return;
        }
        pending.current = res.data;
        setBet(res.data.bet);
        launch(res.data.stops);
    }

    const winCells = useMemo(() => {
        const seen: string[] = [];
        for (const l of lines) {
            const rows = PAYLINES[l.line - 1];
            if (!rows) continue;
            for (let c = 0; c < 3; c++) {
                const key = `${c}:${rows[c]}`;
                if (seen.indexOf(key) < 0) seen.push(key);
            }
        }
        return seen;
    }, [lines]);

    const showWins = phase === 'result' && lines.length > 0;

    return (
        <>
            <style>{`
                @keyframes slot-settle { 0%, 100% { transform: translateY(0); } 45% { transform: translateY(6px); } }
                @keyframes slot-win { from { box-shadow: inset 0 0 0 2px rgba(255,213,90,0); } to { box-shadow: inset 0 0 0 2px rgba(255,213,90,0.95); } }
                @keyframes slot-line { to { stroke-dashoffset: 0; } }
                @keyframes slot-net { 0% { transform: scale(0.85); } 55% { transform: scale(1.06); } 100% { transform: scale(1); } }
                .slot-settle { animation: slot-settle ${SETTLE_MS}ms ease-out; }
            `}</style>

            <GameHeader title={t('slots.title', 'Slots')} accent={TABLE.chip} onBack={onBack} right={<MuteButton accent={TABLE.chip} />} />

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

            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4">
                <div style={{ width: CAB_W, borderRadius: 26, padding: 3, background: GOLD_FRAME, boxShadow: CARD_SHADOW }}>
                    <div
                        style={{
                            borderRadius: 23,
                            padding: '16px 17px',
                            background: `linear-gradient(180deg, ${FELT.top} 0%, ${FELT.mid} 55%, ${FELT.bot} 100%)`,
                            boxShadow: `inset 0 2px 0 rgba(255,255,255,0.05), inset 0 0 0 1px ${GOLD.deep}`,
                        }}
                    >
                        <div
                            className="mb-3 flex items-center justify-between rounded-[10px] px-3"
                            style={{ width: WELL_W, height: 46, background: 'rgba(0,0,0,0.34)', boxShadow: `inset 0 1px 4px rgba(0,0,0,0.6), inset 0 0 0 1px ${SURFACE.hair}` }}
                        >
                            <span className="text-[12px] font-bold uppercase tracking-wide text-white/45">{t('slots.paylines', 'Paylines')}</span>
                            <div className="flex items-center gap-2">
                                {PAYLINES.map((_, i) => {
                                    const lit = showWins && lines.some(l => l.line === i + 1);
                                    return (
                                        <span
                                            key={i}
                                            className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-extrabold"
                                            style={{
                                                background: lit ? TABLE.win : 'rgba(255,255,255,0.06)',
                                                color: lit ? '#3A2A08' : 'rgba(255,255,255,0.4)',
                                                border: `1px solid ${lit ? TABLE.win : SURFACE.hair}`,
                                                boxShadow: lit ? '0 0 10px rgba(255,213,90,0.55)' : 'none',
                                                transition: 'background 200ms ease, color 200ms ease, box-shadow 200ms ease',
                                            }}
                                        >
                                            {i + 1}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="relative" style={{ width: WELL_W, height: WELL_H }}>
                            <div className="flex" style={{ gap: GUTTER }}>
                                {[0, 1, 2].map(r => (
                                    <div
                                        key={r}
                                        className="relative overflow-hidden"
                                        style={{ width: REEL_W, height: WELL_H, borderRadius: 9, background: '#06231A' }}
                                    >
                                        <div className="absolute inset-0 overflow-hidden">
                                            <div ref={attachWrap[r]} className="absolute inset-0">
                                                <div
                                                    ref={attachStrip[r]}
                                                    onTransitionEnd={e => onReelEnd(e, r)}
                                                    style={{ position: 'absolute', left: 0, top: 0, width: REEL_W, willChange: 'transform' }}
                                                >
                                                    {REEL_CELLS[r]}
                                                </div>
                                            </div>
                                        </div>
                                        <div
                                            className="pointer-events-none absolute inset-0"
                                            style={{
                                                background: STREAKS,
                                                opacity: blurred[r] ? 1 : 0,
                                                transition: 'opacity 220ms ease',
                                            }}
                                        />
                                        <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: 24, background: 'linear-gradient(180deg, rgba(0,0,0,0.6), rgba(0,0,0,0))' }} />
                                        <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ height: 24, background: 'linear-gradient(0deg, rgba(0,0,0,0.6), rgba(0,0,0,0))' }} />
                                        <div className="pointer-events-none absolute inset-0" style={{ borderRadius: 9, boxShadow: WELL_SHADOW }} />
                                    </div>
                                ))}
                            </div>

                            {showWins && (
                                <div className="pointer-events-none absolute inset-0">
                                    {winCells.map(key => {
                                        const [c, row] = key.split(':').map(Number);
                                        return (
                                            <div
                                                key={key}
                                                style={{
                                                    position: 'absolute',
                                                    left: c * (REEL_W + GUTTER),
                                                    top: row * CELL,
                                                    width: REEL_W,
                                                    height: CELL,
                                                    borderRadius: 6,
                                                    animation: 'slot-win 1.1s ease-in-out 2 alternate',
                                                }}
                                            />
                                        );
                                    })}
                                    <svg width={WELL_W} height={WELL_H} viewBox={`0 0 ${WELL_W} ${WELL_H}`} style={{ position: 'absolute', left: 0, top: 0 }}>
                                        {lines.map((l, i) => {
                                            const rows = PAYLINES[l.line - 1];
                                            if (!rows) return null;
                                            const pts = rows.map((row, c) => `${c * (REEL_W + GUTTER) + REEL_W / 2},${row * CELL + CELL / 2}`).join(' ');
                                            return (
                                                <polyline
                                                    key={l.line}
                                                    points={pts}
                                                    fill="none"
                                                    stroke={TABLE.win}
                                                    strokeWidth={3}
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    style={{ strokeDasharray: 600, strokeDashoffset: 600, animation: `slot-line 420ms ease-out ${i * 120}ms forwards` }}
                                                />
                                            );
                                        })}
                                    </svg>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex h-[44px] shrink-0 flex-col items-center justify-center gap-[3px]">
                    {phase === 'result' && win > 0 && (
                        <span className="text-[19px] font-extrabold leading-none tabular-nums" style={{ color: TABLE.win, animation: 'slot-net 520ms cubic-bezier(0.2,0.8,0.3,1)' }}>
                            {t('slots.youWon', 'You won {n} chips', { n: fmtChips(win) })}
                        </span>
                    )}
                    {phase === 'result' && win === 0 && (
                        <span className="text-[15px] font-semibold leading-none text-white/45">{t('slots.noWin', 'No win')}</span>
                    )}
                    {phase === 'result' && (
                        <span className="text-[12px] font-bold leading-none tabular-nums" style={{ color: net > 0 ? TABLE.win : TABLE.lose }}>
                            {t('slots.thisSpin', '{n} this spin', { n: (net > 0 ? '+' : '') + fmtChips(net) })}
                        </span>
                    )}
                </div>

                <div className="flex w-full items-center justify-center gap-2" style={{ maxWidth: CAB_W }}>
                    <StepButton label={t('slots.lower', 'Lower bet')} disabled={betIndex <= 0} onClick={() => stepBet(-1)}>
                        <Minus className="h-[18px] w-[18px]" strokeWidth={3} />
                    </StepButton>
                    <div className="flex flex-1 flex-col items-center rounded-2xl py-1" style={{ background: SURFACE.sunken, border: `1px solid ${SURFACE.hair}` }}>
                        <span className="text-[12px] font-bold uppercase tracking-wide text-white/45">{t('slots.totalBet', 'Total bet')}</span>
                        <span className="text-[22px] font-extrabold leading-tight tabular-nums" style={{ color: TABLE.chip }}>{fmtChips(stake)}</span>
                    </div>
                    <StepButton label={t('slots.raise', 'Raise bet')} disabled={betIndex >= BET_STEPS.length - 1} onClick={() => stepBet(1)}>
                        <Plus className="h-[18px] w-[18px]" strokeWidth={3} />
                    </StepButton>
                    <button
                        type="button"
                        onClick={maxBet}
                        className="rounded-full px-3 py-2 text-[12px] font-extrabold active:opacity-70"
                        style={{ background: SURFACE.sunken, color: GOLD.top, border: `1px solid ${GOLD.deep}` }}
                    >
                        {t('slots.max', 'MAX')}
                    </button>
                </div>

                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-white/55">
                    <span className="tabular-nums text-white">{fmtChips(bet)}</span>
                    <span>{t('slots.perLine', 'per line')}</span>
                    <span className="text-white/25">|</span>
                    <span>{t('slots.lines', '5 lines')}</span>
                </div>

            </div>

            <div className="shrink-0 px-[10px]" style={{ paddingBottom: PAD_B }}>
                <button
                    type="button"
                    onClick={spin}
                    disabled={phase === 'spinning'}
                    className="flex w-full items-center justify-center rounded-[20px] text-[20px] font-extrabold active:opacity-90"
                    style={{
                        height: 84,
                        background: GOLD_FRAME,
                        color: '#0B3A24',
                        opacity: phase === 'spinning' || !affordable ? 0.4 : 1,
                        boxShadow: CARD_SHADOW,
                    }}
                >
                    {phase === 'spinning' ? t('slots.spinning', 'Spinning') : t('slots.spin', 'Spin')}
                </button>
                <button
                    type="button"
                    onClick={() => setPaytableOpen(true)}
                    className="mx-auto mt-2 flex items-center gap-1.5 py-1 text-[14px] font-semibold text-white/55 active:opacity-60"
                >
                    <Info className="h-[15px] w-[15px]" strokeWidth={2.4} />
                    {t('casino.paytable', 'Paytable')}
                </button>
            </div>

            {paytableOpen && <PaytableSheet onClose={() => setPaytableOpen(false)} />}

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

function StepButton({ label, disabled, onClick, children }: {
    label: string; disabled: boolean; onClick: () => void; children: ReactElement;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white active:opacity-70"
            style={{ background: SURFACE.sunken, border: `1px solid ${SURFACE.hair}`, opacity: disabled ? 0.35 : 1 }}
        >
            {children}
        </button>
    );
}

const DIAGRAM_DOTS = [0, 1, 2].flatMap(c => [0, 1, 2].map(r => ({ key: `${c}-${r}`, cx: 8 + c * 14, cy: 6 + r * 10 })));

function PaylineChip({ rows }: { rows: number[] }) {
    const pts = rows.map((row, c) => `${8 + c * 14},${6 + row * 10}`).join(' ');
    return (
        <svg width={44} height={32} viewBox="0 0 44 32" aria-hidden="true">
            {DIAGRAM_DOTS.map(d => <circle key={d.key} cx={d.cx} cy={d.cy} r={2.2} fill="rgba(255,255,255,0.22)" />)}
            <polyline points={pts} fill="none" stroke={TABLE.win} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function PaytableSheet({ onClose }: { onClose: () => void }) {
    return (
        <Sheet onClose={onClose} fit="content" forceDark className="bg-[#0A472C] text-white" title={t('casino.paytable', 'Paytable')}>
            {() => (
                <div className="px-5 pb-2">
                    <div className="flex items-center justify-between pb-2">
                        <span className="text-[12px] font-bold uppercase tracking-wide text-white/45">{t('slots.paylines', 'Paylines')}</span>
                        <span className="text-[13px] font-semibold text-white/55">{t('slots.lines', '5 lines')}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl px-3 py-2" style={{ background: SURFACE.soft, border: `1px solid ${SURFACE.hair}` }}>
                        {PAYLINES.map((rows, i) => <PaylineChip key={i} rows={rows} />)}
                    </div>

                    <div className="flex items-center justify-between pb-1 pt-4">
                        <span className="text-[12px] font-bold uppercase tracking-wide text-white/45">{t('casino.paytable', 'Paytable')}</span>
                        <span className="text-[12px] font-bold uppercase tracking-wide text-white/45">{t('slots.perLine', 'per line')}</span>
                    </div>
                    <div className="overflow-hidden rounded-2xl" style={{ background: SURFACE.soft, border: `1px solid ${SURFACE.hair}` }}>
                        {PAY_ORDER.map((id, i) => (
                            <div key={id} className="flex items-center gap-3 px-3 py-2" style={{ borderTop: i === 0 ? 'none' : `1px solid ${SURFACE.hair}` }}>
                                <SlotSymbol id={id} size={30} />
                                <span className="flex-1 text-[15px] font-semibold">{t('slots.threeOf', 'Three {symbol}', { symbol: symbolName(id) })}</span>
                                <span className="text-[17px] font-extrabold tabular-nums" style={{ color: GOLD.top }}>{TRIPLE_PAY[id]}</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-3 px-3 py-2" style={{ borderTop: `1px solid ${SURFACE.hair}` }}>
                            <div className="grid h-[30px] w-[30px] grid-cols-2 gap-px">
                                {SUIT_IDS.map(id => <SlotSymbol key={id} id={id} size={14} />)}
                            </div>
                            <span className="flex-1 text-[15px] font-semibold">{t('slots.anySuits', 'Any three suits')}</span>
                            <span className="text-[17px] font-extrabold tabular-nums" style={{ color: GOLD.top }}>{SUITS_PAY}</span>
                        </div>
                    </div>

                    <div className="pt-3 text-center text-[13px] font-semibold text-white/55">{t('slots.rtp', 'Returns 95.35% over time')}</div>
                    <div className="pb-1 pt-0.5 text-center text-[13px] font-semibold text-white/45">{t('casino.house', 'House edge {pct}%', { pct: '4.65' })}</div>
                </div>
            )}
        </Sheet>
    );
}
