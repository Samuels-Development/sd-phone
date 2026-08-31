import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Coins, Repeat, Trash2, Undo2 } from 'lucide-react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { Scroller } from '@/ui/Scroller';
import { Sheet } from '@/ui/Sheet';
import { GameHeader } from '@/apps/_games/GameHeader';
import { useSessionState } from '@/hooks/useSessionState';
import { readJson, writeJson } from '@/lib/storage';
import { CARD_SHADOW, GOLD, GOLD_FRAME, PAD_B, SURFACE, TABLE, fmtChips } from '@/apps/casino/theme';
import { MuteButton } from '@/apps/casino/MuteButton';
import { type SpinLoop, playBallDrop, playBigWin, playChipPlace, playLose, playWin, startWheelSpin } from '@/apps/casino/sfx';
import type { CasinoGameProps } from '@/apps/casino/casinoApi';
import { BetLayout } from './BetLayout';
import { CHIP_DENOMS, Chip } from './Chip';
import { BALL_REST_R, BALL_TRACK_R, WHEEL_SIZE, Wheel } from './WheelFace';
import { type PlacedBet, type RouletteResult, rouletteSpin } from './rouletteApi';
import { betInfo, mergeBets, stakeOf } from './bets';
import { POCKET_ANGLE, colorOf } from './wheel';
import { failText } from '@/core/api';

const TABLE_MAX  = 25000;
const MAX_BETS   = 20;
const RECENT_MAX = 5;
const SPIN_MS    = 4200;
const CHIP_KEY   = 'sd-phone:roulette:chip';

type Phase = 'betting' | 'spinning' | 'result';

const POCKET_BG: Record<string, string> = { red: TABLE.red, black: '#1C1C1C', green: TABLE.green };

const PAYOUT_ROWS: { name: () => string; odds: number }[] = [
    { name: () => t('roulette.straight', 'Straight'), odds: 35 },
    { name: () => t('roulette.split', 'Split'),       odds: 17 },
    { name: () => t('roulette.street', 'Street'),     odds: 11 },
    { name: () => t('roulette.corner', 'Corner'),     odds: 8 },
    { name: () => t('roulette.basket', 'Basket'),     odds: 8 },
    { name: () => t('roulette.line', 'Six line'),     odds: 5 },
    { name: () => t('roulette.column', 'Column'),     odds: 2 },
    { name: () => t('roulette.dozen', 'Dozen'),       odds: 2 },
    { name: () => `${t('roulette.red', 'Red')} / ${t('roulette.black', 'Black')}`, odds: 1 },
    { name: () => `${t('roulette.odd', 'Odd')} / ${t('roulette.even', 'Even')}`,   odds: 1 },
    { name: () => `${t('roulette.low', '1-18')} / ${t('roulette.high', '19-36')}`, odds: 1 },
];

const KIND_LABEL: Record<string, () => string> = {
    straight: () => t('roulette.straight', 'Straight'),
    split:    () => t('roulette.split', 'Split'),
    street:   () => t('roulette.street', 'Street'),
    corner:   () => t('roulette.corner', 'Corner'),
    basket:   () => t('roulette.basket', 'Basket'),
    line:     () => t('roulette.line', 'Six line'),
    column:   () => t('roulette.column', 'Column'),
    dozen:    () => t('roulette.dozen', 'Dozen'),
    color:    () => t('roulette.colorBet', 'Colour'),
    parity:   () => t('roulette.parityBet', 'Odd / Even'),
    half:     () => t('roulette.halfBet', 'Half'),
};

function initialDenom(): number {
    const stored = readJson<number>(CHIP_KEY);
    return stored !== null && CHIP_DENOMS.includes(stored) ? stored : CHIP_DENOMS[0];
}

export function Roulette({ chips, onChips, onBack, onCashier }: CasinoGameProps) {
    const [placements, setPlacements] = useState<PlacedBet[]>([]);
    const [denom, setDenom]           = useState<number>(initialDenom);
    const [phase, setPhase]           = useState<Phase>('betting');
    const [result, setResult]         = useState<RouletteResult | null>(null);
    const [recent, setRecent]         = useState<number[]>([]);
    const [notice, setNotice]         = useState<string | null>(null);
    const [lowChips, setLowChips]     = useState(false);
    const [payoutsOpen, setPayouts]   = useState(false);
    const [lastBets, setLastBets]     = useSessionState<PlacedBet[]>('casino:rouletteLastBets', []);

    const [wheelDeg, setWheelDeg] = useState(0);
    const [ballDeg, setBallDeg]   = useState(0);
    const [ballR, setBallR]       = useState(BALL_TRACK_R);
    const [ballSnap, setBallSnap] = useState(false);

    const wheelRef  = useRef(0);
    const ballRef   = useRef(0);
    const spinning  = useRef(false);
    const spinSfx   = useRef<SpinLoop | null>(null);
    const pending   = useRef<RouletteResult | null>(null);
    const spinTimers  = useRef<ReturnType<typeof setTimeout>[]>([]);
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const chipsRef    = useRef(chips); chipsRef.current = chips;

    const after = useCallback((ms: number, fn: () => void) => { spinTimers.current.push(setTimeout(fn, ms)); }, []);
    useEffect(() => () => {
        spinTimers.current.forEach(clearTimeout);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        spinSfx.current?.stop();
    }, []);

    useEffect(() => { writeJson(CHIP_KEY, denom); }, [denom]);

    const merged = mergeBets(placements);
    const stake  = stakeOf(placements);

    const flash = useCallback((message: string) => {
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        setNotice(message);
        noticeTimer.current = setTimeout(() => setNotice(null), 2600);
    }, []);

    function resetRound() {
        setPlacements([]);
        setResult(null);
        setPhase('betting');
    }

    function place(id: string) {
        if (phase === 'spinning') return;
        const base = phase === 'result' ? [] : placements;
        if (phase === 'result') { setResult(null); setPhase('betting'); }

        const next  = [...base, { id, amount: denom }];
        const total = stakeOf(next);
        if (mergeBets(next).length > MAX_BETS) { flash(t('roulette.tooManyBets', 'Too many bets on the table')); return; }
        if (total > TABLE_MAX) { flash(t('roulette.tableMax', 'Table max {n}', { n: fmtChips(TABLE_MAX) })); return; }
        if (total > chipsRef.current) { setLowChips(true); return; }
        setPlacements(next);
        playChipPlace();
        const info = betInfo(id);
        const label = info ? KIND_LABEL[info.kind]?.() : null;
        if (label && info) flash(t('roulette.placedBet', '{name} pays {odds} to 1', { name: label, odds: info.odds }));
        else setNotice(null);
    }

    function undo() {
        if (phase === 'spinning' || !placements.length) return;
        setPlacements(list => list.slice(0, -1));
    }

    function rebet() {
        if (phase === 'spinning' || !lastBets.length) return;
        if (stakeOf(lastBets) > chipsRef.current) { setLowChips(true); return; }
        setResult(null);
        setPhase('betting');
        setPlacements(lastBets.map(b => ({ ...b })));
    }

    const settle = useCallback(() => {
        const data = pending.current;
        if (!data) return;
        pending.current = null;
        spinning.current = false;
        setResult(data);
        setPhase('result');
        setPlacements([]);
        onChips(data.chips);
        spinSfx.current?.stop();
        spinSfx.current = null;
        playBallDrop();
        if (data.win >= data.stake * 8) playBigWin();
        else if (data.win > 0) playWin();
        else playLose();
        setRecent(list => [data.pocket, ...list].slice(0, RECENT_MAX));
    }, [onChips]);

    function startSpin(index: number) {
        spinTimers.current.forEach(clearTimeout);
        spinTimers.current = [];
        spinSfx.current?.stop();
        spinSfx.current = startWheelSpin(SPIN_MS);

        const wheelEnd = wheelRef.current + 1080;
        const raw      = wheelEnd + index * POCKET_ANGLE;
        const ballEnd  = raw - 360 * Math.ceil((raw - ballRef.current) / 360 + 6);
        wheelRef.current = wheelEnd;
        ballRef.current  = ballEnd;

        setBallSnap(true);
        setBallR(BALL_TRACK_R);
        after(30, () => {
            setBallSnap(false);
            setBallR(BALL_REST_R);
            setWheelDeg(wheelEnd);
            setBallDeg(ballEnd);
        });
        after(SPIN_MS + 500, settle);
    }

    async function spin() {
        if (spinning.current) return;
        const bets = mergeBets(placements);
        if (!bets.length) { flash(t('roulette.noBets', 'Place a bet first')); return; }
        const total = stakeOf(bets);
        if (total > chipsRef.current) { setLowChips(true); return; }

        spinning.current = true;
        setNotice(null);
        setResult(null);
        setPhase('spinning');
        onChips(chipsRef.current - total);

        const reply = await rouletteSpin(bets);
        if (!reply.ok || !reply.data) {
            spinning.current = false;
            setPhase('betting');
            onChips(chipsRef.current + total);
            flash(failText(reply, t('casino.somethingWrong', 'Something went wrong')));
            return;
        }
        setLastBets(bets);
        pending.current = reply.data;
        startSpin(reply.data.index);
    }

    const idle     = phase !== 'spinning';
    const canSpin  = phase === 'betting' && merged.length > 0;
    const winners  = result ? result.hits.map(h => h.id) : [];

    return (
        <>
            <style>{`
                @keyframes rl-badge { 0% { transform: scale(0.6); opacity: 0 } 60% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
                @keyframes rl-net { 0% { transform: scale(0.86) } 55% { transform: scale(1.07) } 100% { transform: scale(1) } }
            `}</style>

            <GameHeader title={t('roulette.title', 'Roulette')} accent={TABLE.chip} onBack={onBack} right={<MuteButton accent={TABLE.chip} />} />

            <div className="flex shrink-0 items-center gap-2 px-4 pb-1">
                <button type="button" onClick={onCashier} className="flex items-center gap-1.5 active:opacity-70">
                    <Coins className="h-[17px] w-[17px]" strokeWidth={2.5} style={{ color: TABLE.chip }} />
                    <span className="text-[18px] font-extrabold tabular-nums" style={{ color: TABLE.chip }}>{fmtChips(chips)}</span>
                    <span className="text-[12px] font-semibold text-white/50">{t('casino.chips', 'chips')}</span>
                </button>
                <div className="ml-auto flex min-w-0 items-center gap-1.5 overflow-hidden">
                    {recent.length > 0 && (
                        <span className="text-[11px] font-bold uppercase tracking-wide text-white/40">{t('roulette.recent', 'Recent')}</span>
                    )}
                    {recent.map((pocket, i) => (
                        <span
                            key={`${pocket}-${i}`}
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums text-white"
                            style={{ background: POCKET_BG[colorOf(pocket)], border: '1px solid rgba(255,255,255,0.2)', opacity: 1 - i * 0.07 }}
                        >
                            {pocket}
                        </span>
                    ))}
                </div>
            </div>

            <div className="relative flex shrink-0 items-start justify-center" style={{ height: WHEEL_SIZE + 20 }}>
                <Wheel wheelDeg={wheelDeg} ballDeg={ballDeg} ballR={ballR} ballSnap={ballSnap} onSettled={settle} />
                {result && phase === 'result' && (
                    <div
                        className="absolute bottom-0 flex h-9 w-9 items-center justify-center rounded-full text-[16px] font-extrabold tabular-nums text-white"
                        aria-label={t('roulette.result', 'Landed on {n}', { n: result.pocket })}
                        style={{
                            background: POCKET_BG[result.color],
                            boxShadow: `0 0 0 2px ${GOLD.mid}, ${CARD_SHADOW}`,
                            animation: 'rl-badge 380ms cubic-bezier(0.2,0.8,0.3,1)',
                        }}
                    >
                        {result.pocket}
                    </div>
                )}
            </div>

            <div className="flex h-[28px] shrink-0 items-center justify-center px-4">
                <ResultLine phase={phase} result={result} notice={notice} hasBets={merged.length > 0} />
            </div>

            <Scroller className="min-h-0 flex-1 [contain:paint]">
                <div
                    className="px-3 pb-4 pt-1"
                    style={{
                        opacity: idle ? 1 : 0.45,
                        pointerEvents: idle ? 'auto' : 'none',
                        transition: 'opacity 200ms ease',
                    }}
                >
                    <BetLayout stacks={merged} winning={phase === 'result' && result ? result.pocket : null} winners={winners} onPlace={place} />
                    <button
                        type="button"
                        onClick={() => setPayouts(true)}
                        className="mx-auto mt-3 block text-[13px] font-semibold text-white/55 underline-offset-2 active:opacity-60"
                    >
                        {t('roulette.payouts', 'Payouts')}
                    </button>
                </div>
            </Scroller>

            <div className="shrink-0 px-4 pt-2" style={{ paddingBottom: PAD_B }}>
                <div className="mb-1 text-[12px] font-bold uppercase tracking-wide text-white/45">{t('roulette.chip', 'Chip')}</div>
                <div className="flex items-center justify-between">
                    {CHIP_DENOMS.map(value => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setDenom(value)}
                            aria-label={`${t('roulette.chip', 'Chip')} ${value}`}
                            className="flex h-[46px] w-[46px] items-center justify-center rounded-full active:opacity-70"
                            style={{
                                background: denom === value ? 'rgba(255,255,255,0.10)' : 'transparent',
                                boxShadow: denom === value ? `0 0 0 2px ${GOLD.mid}` : 'none',
                            }}
                        >
                            <Chip value={value} size={34} dim={denom !== value} />
                        </button>
                    ))}
                </div>

                <div className="mt-2.5 flex items-center gap-2">
                    <ToolButton label={t('roulette.undo', 'Undo')} disabled={!idle || !placements.length} onClick={undo}>
                        <Undo2 className="h-[17px] w-[17px]" strokeWidth={2.3} />
                    </ToolButton>
                    <ToolButton label={t('roulette.clear', 'Clear')} disabled={!idle || !placements.length} onClick={resetRound}>
                        <Trash2 className="h-[17px] w-[17px]" strokeWidth={2.3} />
                    </ToolButton>
                    <ToolButton label={t('roulette.rebet', 'Rebet')} disabled={!idle || !lastBets.length} onClick={rebet}>
                        <Repeat className="h-[17px] w-[17px]" strokeWidth={2.3} />
                    </ToolButton>
                    <div className="ml-auto flex flex-col items-end">
                        <span className="text-[12px] font-bold uppercase tracking-wide text-white/45">{t('roulette.totalStake', 'Total stake')}</span>
                        <span className="text-[18px] font-extrabold tabular-nums" style={{ color: TABLE.chip }}>{fmtChips(stake)}</span>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => { void spin(); }}
                    disabled={!canSpin}
                    className="mt-2.5 w-full rounded-[18px] text-[19px] font-extrabold tracking-tight active:opacity-85"
                    style={{
                        height: 56,
                        background: GOLD_FRAME,
                        color: '#2A1E05',
                        boxShadow: canSpin ? `inset 0 1px 0 ${GOLD.hi}, 0 1px 0 rgba(0,0,0,0.35), ${CARD_SHADOW}` : 'none',
                        opacity: canSpin ? 1 : 0.4,
                    }}
                >
                    {idle ? t('roulette.spin', 'Spin') : t('roulette.spinning', 'No more bets')}
                </button>
                <div className="mt-1 text-center text-[12px] font-semibold tabular-nums text-white/35">
                    {t('roulette.tableMax', 'Table max {n}', { n: fmtChips(TABLE_MAX) })}
                </div>
            </div>

            {lowChips && (
                <AlertDialog
                    forceDark
                    title={t('casino.outOfChips', 'Out of chips')}
                    message={t('casino.outOfChipsBody', 'Head to the cashier to buy more.')}
                    confirmLabel={t('casino.buyChips', 'Buy chips')}
                    cancelLabel={t('casino.notNow', 'Not now')}
                    onCancel={() => setLowChips(false)}
                    onConfirm={() => { setLowChips(false); onCashier(); }}
                />
            )}

            {payoutsOpen && (
                <Sheet fit="content" forceDark className="bg-[#0A472C] text-white" onClose={() => setPayouts(false)}>
                    {({ close }) => (
                        <div className="px-5 pb-2 pt-1">
                            <h2 className="mb-3 text-[20px] font-extrabold tracking-tight">{t('roulette.payouts', 'Payouts')}</h2>
                            {PAYOUT_ROWS.map(row => (
                                <div key={row.odds + row.name()} className="flex items-center justify-between border-b border-white/10 py-2 last:border-0">
                                    <span className="text-[15px] font-semibold text-white/85">{row.name()}</span>
                                    <span className="text-[15px] font-extrabold tabular-nums" style={{ color: TABLE.chip }}>{row.odds}:1</span>
                                </div>
                            ))}
                            <p className="mt-3 text-[13px] font-semibold text-white/55">{t('casino.house', 'House edge {pct}%', { pct: '2.70' })}</p>
                            <button
                                type="button"
                                onClick={close}
                                className="mt-4 w-full rounded-[14px] py-3 text-[17px] font-bold text-white active:opacity-80"
                                style={{ background: SURFACE.panel }}
                            >
                                {t('casino.done', 'Done')}
                            </button>
                        </div>
                    )}
                </Sheet>
            )}
        </>
    );
}

function ToolButton({ label, disabled, onClick, children }: {
    label: string; disabled: boolean; onClick: () => void; children: ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            className="flex h-9 w-9 items-center justify-center rounded-full text-white active:opacity-70"
            style={{ background: SURFACE.panel, opacity: disabled ? 0.35 : 1 }}
        >
            {children}
        </button>
    );
}

function ResultLine({ phase, result, notice, hasBets }: {
    phase: Phase; result: RouletteResult | null; notice: string | null; hasBets: boolean;
}) {
    if (notice) return <span className="text-[14px] font-bold" style={{ color: TABLE.lose }}>{notice}</span>;
    if (phase === 'spinning') return <span className="text-[14px] font-bold" style={{ color: GOLD.top }}>{t('roulette.spinning', 'No more bets')}</span>;

    if (phase === 'result' && result) {
        const style = { animation: 'rl-net 520ms cubic-bezier(0.2,0.8,0.3,1)' };
        if (result.net > 0) {
            return <span className="text-[16px] font-extrabold tabular-nums" style={{ color: TABLE.win, ...style }}>{t('roulette.youWon', 'You won {n} chips', { n: fmtChips(result.net) })}</span>;
        }
        if (result.net < 0) {
            return <span className="text-[15px] font-bold tabular-nums" style={{ color: TABLE.lose, ...style }}>{t('roulette.youLost', 'You lost {n} chips', { n: fmtChips(-result.net) })}</span>;
        }
        return <span className="text-[15px] font-bold" style={{ color: TABLE.push, ...style }}>{t('roulette.pushed', 'You broke even')}</span>;
    }

    if (hasBets) return null;
    return <span className="text-[14px] font-semibold text-white/45">{t('roulette.placeBets', 'Place your bets')}</span>;
}
