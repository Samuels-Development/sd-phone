import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Coins, Repeat, Trash2, Undo2, Wallet } from 'lucide-react';

import { t } from '@/i18n';
import { isFiveM } from '@/core/nui';
import { AlertDialog } from '@/ui/AlertDialog';
import { GameHeader } from '@/apps/_games/GameHeader';
import { recordResultApi } from '@/apps/_games/statsApi';
import { useSessionState } from '@/hooks/useSessionState';
import { readJson, writeJson } from '@/lib/storage';

import type { Card } from '../cards';
import { CardFace } from '../CardFace';
import { CHIP_DENOMS, Chip } from '../roulette/Chip';
import type { CasinoGameProps } from '../casinoApi';
import { CARD_SHADOW, FELT, GOLD, GOLD_FRAME, PAD_B, SURFACE, TABLE, WELL_SHADOW, fmtChips } from '../theme';
import { MuteButton } from '../MuteButton';
import { playBigWin, playCardDeal, playChipPlace, playLose, playPush, playWin } from '../sfx';
import { BetSpot } from './BetSpot';
import { type BaccaratResult, baccaratDeal } from './baccaratApi';
import { type BaccaratBets, type BaccaratSpot, MAX_TOTAL, MIN_BET, emptyBets, spotMax, stakeOf, totalOf } from './logic';
import { failText } from '@/core/api';

const GAME = 'baccarat';
const CHIP_KEY = 'sd-phone:baccarat:chip';

const PLAYER_INK = '#3C7DD9';
const CARD_W = 56;
const CARD_H = 78;
const FAN = -18;

const DENOMS = CHIP_DENOMS.filter(value => value >= MIN_BET);

const DEAL_MS: Record<'player' | 'banker', number[]> = { player: [0, 280, 700], banker: [140, 420, 860] };
const CARD_ANIM = 260;
const TWO_CARD_AT = DEAL_MS.banker[1] + CARD_ANIM;
const THIRD_AT = DEAL_MS.banker[2] + CARD_ANIM;

type Phase = 'betting' | 'dealing' | 'result';
type Stage = 0 | 1 | 2;

interface SpotMeta {
    spot:  BaccaratSpot;
    label: () => string;
    odds:  string;
    color: string;
    grow:  number;
}

const MAIN_ROW: SpotMeta[] = [
    { spot: 'player', label: () => t('baccarat.player', 'Player'), odds: '1:1',    color: PLAYER_INK, grow: 1 },
    { spot: 'tie',    label: () => t('baccarat.tie', 'Tie'),       odds: '8:1',    color: TABLE.green, grow: 0.8 },
    { spot: 'banker', label: () => t('baccarat.banker', 'Banker'), odds: '0.95:1', color: TABLE.red,   grow: 1 },
];

const PAIR_ROW: SpotMeta[] = [
    { spot: 'ppair', label: () => t('baccarat.playerPair', 'P Pair'), odds: '11:1', color: PLAYER_INK, grow: 1 },
    { spot: 'bpair', label: () => t('baccarat.bankerPair', 'B Pair'), odds: '11:1', color: TABLE.red,  grow: 1 },
];

function initialDenom(): number {
    const stored = readJson<number>(CHIP_KEY);
    return stored !== null && DENOMS.includes(stored) ? stored : DENOMS[0];
}

export function Baccarat({ chips, onChips, onBack, onCashier }: CasinoGameProps) {
    const chipsRef = useRef(chips); chipsRef.current = chips;

    const [bets, setBets]       = useState<BaccaratBets>(emptyBets);
    const [history, setHistory] = useState<BaccaratBets[]>([]);
    const [denom, setDenom]     = useState<number>(initialDenom);
    const [phase, setPhase]     = useState<Phase>('betting');
    const [stage, setStage]     = useState<Stage>(0);
    const [hand, setHand]       = useState<BaccaratResult | null>(null);
    const [notice, setNotice]   = useState<string | null>(null);
    const [lowChips, setLow]    = useState(false);
    const [lastBets, setLastBets] = useSessionState<BaccaratBets>('casino:baccaratBets', emptyBets);

    const acting = useRef(false);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const after = useCallback((ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); }, []);
    useEffect(() => () => {
        timers.current.forEach(clearTimeout);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
    }, []);

    useEffect(() => { writeJson(CHIP_KEY, denom); }, [denom]);

    const flash = useCallback((message: string) => {
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        setNotice(message);
        noticeTimer.current = setTimeout(() => setNotice(null), 2600);
    }, []);

    const stake = stakeOf(bets);

    function pushHistory() { setHistory(list => [...list.slice(-29), bets]); }

    function clearResult() {
        if (phase !== 'result') return;
        timers.current.forEach(clearTimeout);
        timers.current = [];
        setHand(null);
        setStage(0);
        setPhase('betting');
    }

    function place(spot: BaccaratSpot) {
        if (phase === 'dealing') return;
        clearResult();
        const amount = bets[spot] + denom;
        if (amount > spotMax(spot)) { flash(t('baccarat.tableLimit', 'Table limit')); return; }
        const next = { ...bets, [spot]: amount };
        const total = stakeOf(next);
        if (total > MAX_TOTAL) { flash(t('baccarat.tableLimit', 'Table limit')); return; }
        if (total > chipsRef.current) { setLow(true); return; }
        setNotice(null);
        pushHistory();
        setBets(next);
        playChipPlace();
    }

    function clearSpot(spot: BaccaratSpot) {
        if (phase === 'dealing' || bets[spot] <= 0) return;
        clearResult();
        pushHistory();
        setBets({ ...bets, [spot]: 0 });
    }

    function undo() {
        if (phase === 'dealing' || history.length === 0) return;
        clearResult();
        setBets(history[history.length - 1]);
        setHistory(list => list.slice(0, -1));
    }

    function clearAll() {
        if (phase === 'dealing' || stake <= 0) return;
        clearResult();
        pushHistory();
        setBets(emptyBets());
    }

    function rebet() {
        if (phase === 'dealing') return;
        const total = stakeOf(lastBets);
        if (total <= 0) return;
        if (total > chipsRef.current) { setLow(true); return; }
        clearResult();
        pushHistory();
        setBets({ ...lastBets });
    }

    async function deal() {
        if (acting.current || phase === 'dealing') return;
        if (stake <= 0) { flash(t('baccarat.placeBet', 'Place a bet')); return; }
        if (stake > chipsRef.current) { setLow(true); return; }

        timers.current.forEach(clearTimeout);
        timers.current = [];
        acting.current = true;
        setNotice(null);
        setHand(null);
        setStage(0);
        setPhase('dealing');
        onChips(chipsRef.current - stake);
        playCardDeal();

        const reply = await baccaratDeal(bets);
        acting.current = false;

        if (!reply.ok || !reply.data) {
            setPhase('betting');
            onChips(chipsRef.current + stake);
            flash(failText(reply, t('casino.somethingWrong', 'Something went wrong')));
            return;
        }

        const data = reply.data;
        setBets(data.bets);
        setLastBets(data.bets);
        setHand(data);

        const thirds = data.player.cards.length > 2 || data.banker.cards.length > 2;
        after(TWO_CARD_AT, () => { setStage(1); playCardDeal(); });
        after(thirds ? THIRD_AT : TWO_CARD_AT + 90, () => {
            setStage(2);
            setPhase('result');
            onChips(data.chips);
            if (data.net > 0) { if (data.net >= stake * 5) playBigWin(); else playWin(); }
            else if (data.net < 0) playLose();
            else playPush();
            if (!isFiveM) {
                const result = data.net > 0 ? 'win' : data.net < 0 ? 'loss' : 'draw';
                void recordResultApi(GAME, 'cpu', result, data.net);
            }
        });
    }

    const locked = phase === 'dealing';
    const settled: BaccaratResult | null = stage === 2 ? hand : null;
    const canDeal = phase !== 'dealing' && stake > 0;

    return (
        <>
            <style>{`
                @keyframes bac-deal { from { transform: translate(90px, -120px) rotate(-14deg); opacity: 0 } to { transform: none; opacity: 1 } }
                @keyframes bac-win { 0% { box-shadow: 0 0 0 0 rgba(240,212,138,0) } 50% { box-shadow: 0 0 0 4px rgba(240,212,138,0.55) } 100% { box-shadow: 0 0 0 0 rgba(240,212,138,0) } }
                @keyframes bac-badge-in { 0% { transform: translateY(8px) scale(0.92); opacity: 0 } 60% { transform: translateY(0) scale(1.04) } 100% { transform: translateY(0) scale(1); opacity: 1 } }
                @keyframes bac-net { 0% { transform: translateY(0); opacity: 0 } 25% { transform: translateY(-6px); opacity: 1 } 100% { transform: translateY(-26px); opacity: 0 } }
            `}</style>

            <GameHeader title={t('baccarat.title', 'Baccarat')} accent={TABLE.chip} onBack={onBack} right={<MuteButton accent={TABLE.chip} />} />

            <button
                type="button"
                onClick={onCashier}
                className="flex shrink-0 items-center justify-center gap-1.5 pb-1 active:opacity-70"
            >
                <Coins className="h-[17px] w-[17px]" strokeWidth={2.5} style={{ color: TABLE.chip }} />
                <span className="text-[18px] font-extrabold tabular-nums" style={{ color: TABLE.chip }}>{fmtChips(chips)}</span>
                <span className="ml-0.5 text-[12px] font-semibold text-white/55">{t('casino.chips', 'chips')}</span>
            </button>

            <div className="flex min-h-0 flex-1 flex-col px-4 pb-1">
                <div
                    className="flex min-h-[230px] flex-1 flex-col rounded-[26px] px-3 pb-2 pt-3"
                    style={{
                        background: `radial-gradient(120% 70% at 50% 0%, ${FELT.top} 0%, ${FELT.mid} 55%, ${FELT.bot} 100%)`,
                        boxShadow: `inset 0 0 0 6px ${FELT.rail}, inset 0 0 36px rgba(0,0,0,0.32), 0 8px 24px rgba(0,0,0,0.30)`,
                    }}
                >
                    <div className="flex flex-1 items-start justify-center gap-2">
                        <HandColumn
                            label={t('baccarat.player', 'Player')}
                            tint={PLAYER_INK}
                            cards={hand ? hand.player.cards : []}
                            delays={DEAL_MS.player}
                            total={hand ? (stage === 2 ? hand.player.total : totalOf(hand.player.cards.slice(0, 2))) : null}
                            showTotal={hand !== null && stage > 0}
                            winner={settled?.outcome === 'player'}
                            pair={settled?.ppair ?? false}
                        />
                        <HandColumn
                            label={t('baccarat.banker', 'Banker')}
                            tint={TABLE.red}
                            cards={hand ? hand.banker.cards : []}
                            delays={DEAL_MS.banker}
                            total={hand ? (stage === 2 ? hand.banker.total : totalOf(hand.banker.cards.slice(0, 2))) : null}
                            showTotal={hand !== null && stage > 0}
                            winner={settled?.outcome === 'banker'}
                            pair={settled?.bpair ?? false}
                        />
                    </div>

                    <div className="flex h-[70px] shrink-0 items-center justify-center px-2">
                        {notice ? (
                            <span className="text-center text-[13px] font-semibold" style={{ color: TABLE.lose }}>{notice}</span>
                        ) : settled ? (
                            <ResultBadge hand={settled} />
                        ) : hand === null ? (
                            <span className="text-center text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: GOLD.mid }}>
                                {t('baccarat.commission', '5% commission on Banker wins, to the nearest chip')}
                            </span>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="shrink-0 px-4">
                <div className="flex gap-2">
                    {MAIN_ROW.map(meta => (
                        <BetSpot
                            key={meta.spot}
                            label={meta.label()}
                            odds={meta.odds}
                            amount={bets[meta.spot]}
                            color={meta.color}
                            grow={meta.grow}
                            locked={locked}
                            won={(settled?.pays[meta.spot] ?? 0) > 0}
                            onAdd={() => place(meta.spot)}
                            onClear={() => clearSpot(meta.spot)}
                        />
                    ))}
                </div>
                <div className="mt-2 flex gap-2">
                    {PAIR_ROW.map(meta => (
                        <BetSpot
                            key={meta.spot}
                            compact
                            label={meta.label()}
                            odds={meta.odds}
                            amount={bets[meta.spot]}
                            color={meta.color}
                            grow={meta.grow}
                            locked={locked}
                            won={(settled?.pays[meta.spot] ?? 0) > 0}
                            onAdd={() => place(meta.spot)}
                            onClear={() => clearSpot(meta.spot)}
                        />
                    ))}
                </div>
            </div>

            <div className="shrink-0 px-4 pt-2.5" style={{ paddingBottom: PAD_B }}>
                <div className="flex items-center justify-between">
                    {DENOMS.map(value => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setDenom(value)}
                            aria-label={`${t('roulette.chip', 'Chip')} ${value}`}
                            className="flex h-[46px] w-[46px] items-center justify-center rounded-full active:opacity-70"
                            style={{
                                background: denom === value ? 'rgba(255,255,255,0.10)' : 'transparent',
                                boxShadow: denom === value ? `0 0 0 2px ${GOLD.mid}` : 'none',
                                transform: denom === value ? 'translateY(-6px)' : 'none',
                                transition: 'transform 120ms ease',
                            }}
                        >
                            <Chip value={value} size={34} dim={denom !== value} />
                        </button>
                    ))}
                </div>

                <div className="mt-2 flex items-center gap-2">
                    <ToolButton label={t('baccarat.undo', 'Undo')} disabled={locked || history.length === 0} onClick={undo}>
                        <Undo2 className="h-[17px] w-[17px]" strokeWidth={2.3} />
                    </ToolButton>
                    <ToolButton label={t('baccarat.clear', 'Clear')} disabled={locked || stake <= 0} onClick={clearAll}>
                        <Trash2 className="h-[17px] w-[17px]" strokeWidth={2.3} />
                    </ToolButton>
                    <ToolButton label={t('baccarat.rebet', 'Rebet')} disabled={locked || stakeOf(lastBets) <= 0} onClick={rebet}>
                        <Repeat className="h-[17px] w-[17px]" strokeWidth={2.3} />
                    </ToolButton>
                    <div className="ml-auto flex flex-col items-end">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-white/45">{t('baccarat.total', 'Total')}</span>
                        <span className="text-[18px] font-extrabold tabular-nums" style={{ color: TABLE.chip }}>{fmtChips(stake)}</span>
                    </div>
                </div>

                {chips <= 0 && stake <= 0 ? (
                    <button
                        type="button"
                        onClick={onCashier}
                        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[17px] font-extrabold active:scale-[0.97]"
                        style={{
                            background: GOLD_FRAME,
                            color: FELT.bot,
                            boxShadow: `inset 0 1px 0 ${GOLD.hi}, 0 1px 0 rgba(0,0,0,0.35)`,
                            transition: 'transform 0.08s',
                        }}
                    >
                        <Wallet className="h-[17px] w-[17px]" strokeWidth={2.6} />
                        {t('casino.buyChips', 'Buy chips')}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => { void deal(); }}
                        disabled={!canDeal}
                        className="mt-2.5 w-full rounded-2xl py-3.5 text-[17px] font-extrabold active:scale-[0.97]"
                        style={{
                            background: canDeal ? GOLD_FRAME : 'rgba(0,0,0,0.30)',
                            color: canDeal ? FELT.bot : 'rgba(255,255,255,0.40)',
                            boxShadow: canDeal ? `inset 0 1px 0 ${GOLD.hi}, 0 1px 0 rgba(0,0,0,0.35), ${CARD_SHADOW}` : 'none',
                            transition: 'transform 0.08s',
                        }}
                    >
                        {t('baccarat.deal', 'Deal')}
                    </button>
                )}
            </div>

            {lowChips && (
                <AlertDialog
                    forceDark
                    title={t('casino.outOfChips', 'Out of chips')}
                    message={t('casino.outOfChipsBody', 'Head to the cashier to buy more.')}
                    confirmLabel={t('casino.buyChips', 'Buy chips')}
                    cancelLabel={t('casino.notNow', 'Not now')}
                    onCancel={() => setLow(false)}
                    onConfirm={() => { setLow(false); onCashier(); }}
                />
            )}
        </>
    );
}

function HandColumn({ label, tint, cards, delays, total, showTotal, winner, pair }: {
    label:     string;
    tint:      string;
    cards:     Card[];
    delays:    number[];
    total:     number | null;
    showTotal: boolean;
    winner:    boolean;
    pair:      boolean;
}) {
    return (
        <div className="flex min-w-0 flex-1 flex-col items-center">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.2em]" style={{ color: GOLD.mid }}>{label}</span>

            <div
                className="mt-1.5 flex items-center justify-center rounded-[16px] px-1.5 py-1.5"
                style={{
                    minHeight: CARD_H + 12,
                    animation: winner ? 'bac-win 1.1s ease-out 2' : undefined,
                }}
            >
                {cards.length === 0
                    ? [0, 1].map(i => (
                        <span
                            key={i}
                            className="block rounded-[12px]"
                            style={{
                                width: CARD_W, height: CARD_H,
                                marginLeft: i > 0 ? FAN : 0,
                                border: '1.5px dashed rgba(255,255,255,0.16)',
                            }}
                        />
                    ))
                    : cards.map((card, i) => (
                        <span
                            key={`${card.rank}${card.suit}-${i}`}
                            className="block"
                            style={{
                                marginLeft: i > 0 ? FAN : 0,
                                zIndex: i,
                                animation: `bac-deal ${CARD_ANIM}ms cubic-bezier(0.2,0.8,0.3,1) ${delays[i] ?? 0}ms both`,
                            }}
                        >
                            <CardFace card={card} w={CARD_W} h={CARD_H} />
                        </span>
                    ))}
            </div>

            <div className="mt-1.5 flex items-center gap-1.5">
                <span
                    className="flex h-[44px] w-[44px] items-center justify-center rounded-full text-[22px] font-black tabular-nums"
                    style={{
                        background: showTotal ? GOLD_FRAME : SURFACE.sunken,
                        color: showTotal ? FELT.bot : 'rgba(255,255,255,0.25)',
                        boxShadow: showTotal ? `inset 0 1px 0 ${GOLD.hi}, 0 2px 6px rgba(0,0,0,0.35)` : WELL_SHADOW,
                    }}
                >
                    {showTotal && total !== null ? total : ''}
                </span>
                {pair && (
                    <span
                        className="rounded-full px-2 py-[2px] text-[10px] font-extrabold uppercase tracking-wide"
                        style={{ background: 'rgba(0,0,0,0.32)', color: tint, border: `1px solid ${tint}` }}
                    >
                        {t('baccarat.pairs', 'Pairs')}
                    </span>
                )}
            </div>
        </div>
    );
}

function ResultBadge({ hand }: { hand: BaccaratResult }) {
    const label = hand.outcome === 'player'
        ? t('baccarat.playerWins', 'Player Wins')
        : hand.outcome === 'banker'
            ? t('baccarat.bankerWins', 'Banker Wins')
            : t('baccarat.tieResult', 'Tie');
    const color = hand.net > 0 ? TABLE.win : hand.net < 0 ? TABLE.lose : TABLE.push;

    return (
        <div className="flex flex-col items-center" style={{ animation: 'bac-badge-in 0.34s ease-out' }}>
            <div
                className="rounded-2xl px-4 py-1.5 text-[19px] font-black tracking-tight"
                style={{ color, background: 'rgba(0,0,0,0.32)', border: `1.5px solid ${color}`, textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
            >
                {label}{hand.natural ? ` ${t('baccarat.natural', 'Natural')}` : ''}
            </div>
            {hand.net !== 0 && (
                <div
                    className="mt-1 text-[15px] font-extrabold tabular-nums"
                    style={{ color, animation: 'bac-net 1.1s ease-out forwards' }}
                >
                    {hand.net > 0 ? `+${fmtChips(hand.net)}` : fmtChips(hand.net)}
                </div>
            )}
        </div>
    );
}

function ToolButton({ label, disabled, onClick, children }: {
    label:    string;
    disabled: boolean;
    onClick:  () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold active:opacity-70"
            style={{
                background: SURFACE.soft,
                color: '#fff',
                boxShadow: `inset 0 1px 0 ${SURFACE.hair}`,
                opacity: disabled ? 0.35 : 1,
            }}
        >
            {children}{label}
        </button>
    );
}
