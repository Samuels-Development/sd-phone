import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Coins, Cpu, Layers, Minus, Plus, Trophy, Wallet } from 'lucide-react';

import { t } from '@/i18n';

import { AlertDialog } from '@/ui/AlertDialog';
import { BlackjackIcon } from '@/shell/AppIconSVG';
import {
    type Card, type Outcome,
    SUIT_GLYPH,
    fmtChips, handValue, isBlackjack, isBust, isRed, statResultFor,
} from './logic';
import { type BjResult, bjDeal, bjDouble, bjHit, bjStand } from './blackjackApi';
import { isFiveM } from '@/core/nui';
import { Leaderboard } from '@/apps/_games/Leaderboard';
import { Cashier } from '@/apps/_games/Cashier';
import { loadChips } from '@/apps/_games/chipsApi';
import { loadLeaderboard, loadStats, recordResultApi, type GameLeaderboard, type GameStats } from '@/apps/_games/statsApi';
import { readJson, writeJson } from '@/lib/storage';

interface Props { onClose: () => void; }

const SB_H = 54;
const GAME = 'blackjack';
const ACCENT = '#1C8A4E';

// Face-down placeholder for the dealer hole while the player acts; the real hole arrives on resolve.
const HOLE_CARD: Card = { rank: 'A', suit: 'S' };

const BET_KEY = 'sd-phone:blackjack:lastbet';
const initialBet = () => { const n = readJson<number>(BET_KEY) ?? 25; return Number.isFinite(n) && n > 0 ? Math.floor(n) : 25; };

const FELT = {
    bgTop:    '#1B7A4B',
    bgMid:    '#11663E',
    bgBot:    '#0B4A2D',
    gold:     '#E8C463',
    goldDeep: '#C99B2E',
    rail:     '#0A3D26',
    chipText: '#0B3A24',
    win:      '#FFD55A',
    lose:     '#FF8585',
    push:     '#CFE9D8',
};

type Screen = 'home' | 'solo' | 'leaderboard' | 'cashier';
type Phase = 'betting' | 'playing' | 'dealer' | 'result';

const CHIP_STEPS = [5, 25, 100, 1000];

export function Blackjack({ onClose: _onClose }: Props) {
    const [screen, setScreen] = useState<Screen>('home');

    const [chips, setChips] = useState(0);
    const [bank,  setBank]  = useState(0);
    const chipsRef = useRef(0); chipsRef.current = chips;
    const [lastBet, setLastBet] = useState(() => initialBet());
    useEffect(() => { writeJson(BET_KEY, lastBet); }, [lastBet]);

    const syncChips = useCallback(() => { void loadChips().then(s => { setChips(s.chips); setBank(s.bank); }); }, []);

    const [stats, setStats] = useState<GameStats>(() => ({ cpu: { wins: 0, losses: 0, draws: 0 }, online: { wins: 0, losses: 0, draws: 0 }, won: 0, lost: 0 }));
    const [leaderboard, setLeaderboard] = useState<GameLeaderboard | null>(null);
    const [lbLoading, setLbLoading] = useState(false);

    useEffect(() => { void loadStats(GAME).then(setStats); syncChips(); }, [syncChips]);

    const [phase,   setPhase]   = useState<Phase>('betting');
    const [bet,     setBet]     = useState<number>(() => initialBet());
    const [player,  setPlayer]  = useState<Card[]>([]);
    const [dealer,  setDealer]  = useState<Card[]>([]);
    const [holeUp,  setHoleUp]  = useState(false);
    const [doubled, setDoubled] = useState(false);
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const [payout,  setPayout]  = useState(0);
    const [confirmLeave, setConfirmLeave] = useState(false);

    const acting = useRef(false);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
    const after = useCallback((ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); }, []);
    useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

    function adjustBet(delta: number) { setBet(b => Math.max(0, Math.min(chipsRef.current, b + delta))); }
    function setBetMax() { setBet(chipsRef.current); }
    function setBetTo(n: number) { setBet(Math.max(0, Math.min(chipsRef.current, Math.floor(n) || 0))); }

    function enterSolo() {
        timers.current.forEach(clearTimeout); timers.current = [];
        setPhase('betting'); setPlayer([]); setDealer([]); setHoleUp(false); setDoubled(false); setOutcome(null); setPayout(0);
        setBet(Math.min(Math.max(lastBet || 25, 5), chipsRef.current) || Math.min(5, chipsRef.current));
        setScreen('solo');
    }

    // Shows a resolved hand: the server records stats in-game, so we just refresh; dev records locally.
    function finishResult(res: BjResult) {
        setOutcome(res.outcome ?? null);
        setPayout(res.net ?? 0);
        if (res.chips !== undefined) setChips(res.chips);
        setPhase('result');
        if (!isFiveM && res.outcome) void recordResultApi(GAME, 'cpu', statResultFor(res.outcome), res.net ?? 0).then(st => { if (st) setStats(st); });
        else void loadStats(GAME).then(setStats);
    }

    // Animates the server-resolved dealer hand: flip the hole, step any dealer draws, then the result.
    function revealResolution(res: BjResult) {
        setPlayer(res.player);
        const full = res.dealer;
        const busted = isBust(res.player);
        if (!busted) setPhase('dealer');   // a player bust keeps the (dead) play controls, as before
        setDealer(full.slice(0, 2));
        if (busted || full.length <= 2) {
            after(busted ? 460 : 520, () => { setHoleUp(true); after(busted ? 420 : 460, () => finishResult(res)); });
            return;
        }
        after(520, () => {
            setHoleUp(true);
            const revealFrom = (i: number) => {
                if (i >= full.length) { after(300, () => finishResult(res)); return; }
                after(560, () => { setDealer(full.slice(0, i + 1)); revealFrom(i + 1); });
            };
            revealFrom(2);
        });
    }

    async function deal() {
        if (acting.current) return;
        const wager = Math.min(bet, chipsRef.current); if (wager <= 0) return;
        acting.current = true;
        const res = await bjDeal(wager);
        acting.current = false;
        if (!res) return;
        setLastBet(wager); setBet(res.bet ?? wager);
        if (res.chips !== undefined) setChips(res.chips);
        setPlayer(res.player); setHoleUp(false); setDoubled(false); setOutcome(null); setPayout(0);
        setDealer([res.dealer[0], HOLE_CARD]); setPhase('playing');
        if (res.phase === 'result') after(320, () => revealResolution(res));
    }
    async function hit() {
        if (acting.current || phase !== 'playing') return;
        acting.current = true;
        const res = await bjHit();
        acting.current = false;
        if (!res) return;
        setPlayer(res.player);
        if (res.chips !== undefined) setChips(res.chips);
        if (res.phase === 'result') after(320, () => revealResolution(res));
    }
    async function stand() {
        if (acting.current || phase !== 'playing') return;
        acting.current = true;
        const res = await bjStand();
        acting.current = false;
        if (res) revealResolution(res);
    }
    async function doubleDown() {
        if (acting.current || !(phase === 'playing' && player.length === 2 && !doubled && chipsRef.current >= bet)) return;
        acting.current = true;
        const res = await bjDouble();
        acting.current = false;
        if (!res) return;
        setDoubled(true);
        if (res.bet !== undefined) setBet(res.bet);
        if (res.chips !== undefined) setChips(res.chips);
        setPlayer(res.player);
        after(440, () => revealResolution(res));
    }
    function soloNewHand() {
        setPhase('betting'); setPlayer([]); setDealer([]); setHoleUp(false); setDoubled(false); setOutcome(null);
        setBet(b => Math.min(Math.max(b, 5), chipsRef.current) || Math.min(5, chipsRef.current));
    }

    function openLeaderboard() { setScreen('leaderboard'); setLbLoading(true); void loadLeaderboard(GAME).then(d => { setLeaderboard(d); setLbLoading(false); }); }

    function goHome() {
        timers.current.forEach(clearTimeout); timers.current = [];
        setScreen('home');
        void loadStats(GAME).then(setStats); syncChips();
    }

    const inPlay = phase === 'playing' || phase === 'dealer';
    const title = screen === 'leaderboard' ? t('blackjack.leaderboard', 'Leaderboard') : screen === 'cashier' ? t('blackjack.cashier', 'Cashier') : t('blackjack.title', 'Blackjack');
    const totalGames = stats.cpu.wins + stats.cpu.losses + stats.cpu.draws;
    const winRate = totalGames > 0 ? Math.round((stats.cpu.wins / totalGames) * 100) : 0;

    function onBack() {
        if (screen === 'leaderboard' || screen === 'cashier') { setScreen('home'); syncChips(); return; }
        if (screen === 'solo' && inPlay) { setConfirmLeave(true); return; }
        goHome();
    }

    return (
        <div className="absolute inset-0 z-10 flex flex-col select-none" style={{ background: `radial-gradient(120% 80% at 50% 12%, ${FELT.bgTop} 0%, ${FELT.bgMid} 46%, ${FELT.bgBot} 100%)`, color: '#fff' }}>
            <style>{`
                @keyframes bj-deal { 0% { transform: translateY(-120px) translateX(40px) rotate(-12deg) scale(0.9); opacity: 0; } 100% { transform: translateY(0) translateX(0) rotate(0deg) scale(1); opacity: 1; } }
                @keyframes bj-badge-in { 0% { transform: translateY(8px) scale(0.92); opacity: 0; } 60% { transform: translateY(0) scale(1.04); } 100% { transform: translateY(0) scale(1); opacity: 1; } }
                @keyframes bj-chip-pop { 0% { transform: scale(0.6); opacity: 0; } 60% { transform: scale(1.12); } 100% { transform: scale(1); opacity: 1; } }
                @keyframes bj-net { 0% { transform: translateY(0); opacity: 0; } 25% { transform: translateY(-6px); opacity: 1; } 100% { transform: translateY(-26px); opacity: 0; } }
            `}</style>

            <div className="shrink-0" style={{ height: SB_H }} />

            {screen !== 'home' && (
                <div className="relative z-10 flex shrink-0 items-center justify-center px-5 pb-1 pt-1">
                    <button type="button" onClick={onBack} aria-label={t('blackjack.back', 'Back')} className="absolute left-3 flex items-center text-[#E8C463] active:opacity-60">
                        <ChevronLeft className="h-[30px] w-[30px]" strokeWidth={2.4} />
                    </button>
                    <h1 className="text-[20px] font-extrabold tracking-tight" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>{title}</h1>
                </div>
            )}
            {screen === 'solo' && (
                <div className="flex shrink-0 items-center justify-center gap-1.5 pb-0.5">
                    <Coins className="h-[17px] w-[17px]" strokeWidth={2.5} style={{ color: FELT.gold }} />
                    <span className="text-[18px] font-extrabold tabular-nums" style={{ color: FELT.gold }}>{fmtChips(chips)}</span>
                    <span className="ml-0.5 text-[12px] font-semibold text-white/50">{t('blackjack.chips', 'chips')}</span>
                </div>
            )}

            <div key={screen} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                {screen === 'home' && (
                    <Home stats={stats} chips={chips} winRate={winRate} onSolo={enterSolo} onLeaderboard={openLeaderboard} onCashier={() => setScreen('cashier')} />
                )}

                {screen === 'cashier' && (
                    <Cashier chips={chips} bank={bank} accent={ACCENT} game={GAME} onChange={s => { setChips(s.chips); setBank(s.bank); }} />
                )}

                {screen === 'leaderboard' && (
                    <Leaderboard data={leaderboard} loading={lbLoading} accent={ACCENT} variant="chips" />
                )}

                {screen === 'solo' && (
                    <SoloTable
                        phase={phase} bet={bet} chips={chips} player={player} dealer={dealer} holeUp={holeUp} outcome={outcome} payout={payout}
                        canDouble={phase === 'playing' && player.length === 2 && !doubled && chips >= bet}
                        onAdjust={adjustBet} onMax={setBetMax} onSet={setBetTo} onDeal={deal}
                        onHit={hit} onStand={stand} onDouble={doubleDown} onNewHand={soloNewHand} onCashier={() => setScreen('cashier')}
                    />
                )}
            </div>

            {confirmLeave && (
                <AlertDialog
                    title={t('blackjack.leaveTitle', 'Leave Table?')}
                    message={t('blackjack.leaveMessage', 'You will forfeit your current bet for this hand.')}
                    confirmLabel={t('blackjack.leave', 'Leave')} cancelLabel={t('blackjack.stay', 'Stay')} destructive
                    onCancel={() => setConfirmLeave(false)}
                    onConfirm={() => { setConfirmLeave(false); goHome(); }}
                />
            )}
        </div>
    );
}

function Home({ stats, chips, winRate, onSolo, onLeaderboard, onCashier }: {
    stats: GameStats; chips: number; winRate: number;
    onSolo: () => void; onLeaderboard: () => void; onCashier: () => void;
}) {
    return (
        <div className="flex flex-1 flex-col px-5 pt-2">
            <div className="mx-auto h-[60px] w-[60px] overflow-hidden rounded-[14px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full" style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.45)' }}>
                <BlackjackIcon />
            </div>
            <h1 className="mt-2 text-center text-[28px] font-extrabold tracking-tight text-white">{t('blackjack.title', 'Blackjack')}</h1>

            <button type="button" onClick={onCashier} className="mx-auto mt-2.5 flex items-center gap-1.5 active:opacity-70">
                <Coins className="h-[19px] w-[19px]" strokeWidth={2.5} style={{ color: FELT.gold }} />
                <span className="text-[22px] font-extrabold tabular-nums" style={{ color: FELT.gold }}>{fmtChips(chips)}</span>
                <span className="ml-0.5 text-[13px] font-semibold text-white/50">{t('blackjack.chips', 'chips')}</span>
            </button>

            <div className="mt-5 rounded-[18px] p-4" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className="mb-1 flex items-center gap-2 text-[15px] font-bold text-white">
                    <Cpu className="h-[18px] w-[18px]" strokeWidth={2.2} /> {t('blackjack.solo', 'Solo')}
                </div>
                <p className="mb-3 text-[13px] text-white/55">{t('blackjack.soloDesc', 'Play one-on-one against the dealer.')}</p>
                <button type="button" onClick={onSolo} className="w-full rounded-[14px] py-3 text-center text-[17px] font-bold text-white active:opacity-80" style={{ background: ACCENT }}>{t('blackjack.play', 'Play')}</button>
            </div>

            <div className="mt-3 rounded-[18px] px-4 py-3.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <div className="mb-2 text-[15px] font-bold text-white">{t('blackjack.payouts', 'Payouts')}</div>
                <PayoutRow label={t('blackjack.payoutWin', 'Win')} sub={t('blackjack.payoutWinSub', 'Beat the dealer')} result={t('blackjack.betTimes2', 'Bet × 2')} example="100 → 200" />
                <PayoutRow label={t('blackjack.payoutBjLabel', 'Blackjack')} sub={t('blackjack.payoutBjSub', '21 on your first two cards')} result={t('blackjack.betTimes25', 'Bet × 2.5')} example="100 → 250" highlight />
                <PayoutRow label={t('blackjack.payoutPush', 'Push')} sub={t('blackjack.payoutPushSub', 'Tie with the dealer')} result={t('blackjack.betBack', 'Bet back')} example="100 → 100" />
                <p className="mt-2 text-[13px] text-white/55">{t('blackjack.dealerStops', 'The dealer stops drawing at 17.')}</p>
            </div>

            <div className="mt-auto flex flex-col gap-3">
                <div className="flex gap-3">
                    <button type="button" onClick={onCashier} className="flex flex-1 items-center justify-center gap-2 rounded-[16px] py-3.5 text-[15px] font-bold text-white active:opacity-80" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <Wallet className="h-[18px] w-[18px]" strokeWidth={2.2} style={{ color: FELT.gold }} /> {t('blackjack.cashier', 'Cashier')}
                        <ChevronRight className="h-[16px] w-[16px] text-white/40" strokeWidth={2.4} />
                    </button>
                    <button type="button" onClick={onLeaderboard} className="flex flex-1 items-center justify-center gap-2 rounded-[16px] py-3.5 text-[15px] font-bold text-white active:opacity-80" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <Trophy className="h-[18px] w-[18px] text-[#FFD54F]" strokeWidth={2.2} /> {t('blackjack.leaderboard', 'Leaderboard')}
                        <ChevronRight className="h-[16px] w-[16px] text-white/40" strokeWidth={2.4} />
                    </button>
                </div>

                <div className="rounded-[16px] px-4 py-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-[12px] font-semibold uppercase tracking-wide text-white/40">{t('blackjack.record', 'Record')}</span>
                        <span className="text-[12px] font-semibold text-white/40">{t('blackjack.winRate', '{winRate}% win rate', { winRate })}</span>
                    </div>
                    <StatRow label={t('blackjack.solo', 'Solo')} t={stats.cpu} Icon={Cpu} />
                    <div className="my-2 h-px bg-white/10" />
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[15px] font-bold text-white/85">
                            <Coins className="h-[17px] w-[17px]" strokeWidth={2.2} style={{ color: FELT.gold }} /> {t('blackjack.chipsRow', 'Chips')}
                        </span>
                        <span className="flex items-center gap-3.5 text-[14px] font-semibold">
                            <span><span className="font-extrabold text-[#9CCC65]">+{fmtChips(stats.won)}</span> {t('blackjack.won', 'won')}</span>
                            <span><span className="font-extrabold text-[#FF8A80]">-{fmtChips(stats.lost)}</span> {t('blackjack.lost', 'lost')}</span>
                        </span>
                    </div>
                </div>
            </div>
            <div className="pb-10" />
        </div>
    );
}

function StatRow({ label, t, Icon }: { label: string; t: { wins: number; losses: number; draws: number }; Icon: typeof Cpu }) {
    return (
        <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[15px] font-bold text-white/85">
                <Icon className="h-[17px] w-[17px] text-white/55" strokeWidth={2.2} />{label}
            </span>
            <span className="flex items-center gap-3.5 text-[14px] font-semibold text-white/80">
                <span><span className="font-extrabold text-[#9CCC65]">{t.wins}</span> W</span>
                <span><span className="font-extrabold text-[#FF8A80]">{t.losses}</span> L</span>
                <span><span className="font-extrabold text-white">{t.draws}</span> D</span>
            </span>
        </div>
    );
}

function PayoutRow({ label, sub, result, example, highlight }: { label: string; sub: string; result: string; example: string; highlight?: boolean }) {
    return (
        <div className="flex items-center justify-between py-1.5">
            <span className="flex min-w-0 flex-col">
                <span className="text-[15px] font-bold text-white">{label}</span>
                <span className="text-[13px] text-white/55">{sub}</span>
            </span>
            <span className="flex flex-col items-end">
                <span className="text-[15px] font-extrabold tabular-nums" style={{ color: highlight ? FELT.gold : '#fff' }}>{result}</span>
                <span className="text-[13px] tabular-nums text-white/55">{example}</span>
            </span>
        </div>
    );
}

function SoloTable({ phase, bet, chips, player, dealer, holeUp, outcome, payout, canDouble, onAdjust, onMax, onSet, onDeal, onHit, onStand, onDouble, onNewHand, onCashier }: {
    phase: Phase; bet: number; chips: number; player: Card[]; dealer: Card[]; holeUp: boolean; outcome: Outcome | null; payout: number; canDouble: boolean;
    onAdjust: (d: number) => void; onMax: () => void; onSet: (n: number) => void; onDeal: () => void;
    onHit: () => void; onStand: () => void; onDouble: () => void; onNewHand: () => void; onCashier: () => void;
}) {
    const pVal = handValue(player).total;
    const dVal = handValue(dealer).total;
    const dShown = holeUp ? dVal : (dealer.length ? handValue(dealer.slice(0, 1)).total : 0);
    return (
        <>
            <div className="relative flex min-h-0 flex-1 flex-col px-4 pt-2" style={{ paddingBottom: 24 }}>
                <div className="flex min-h-0 flex-1 flex-col rounded-[26px] px-3 py-3" style={{ background: `radial-gradient(120% 70% at 50% 0%, ${FELT.bgTop} 0%, ${FELT.bgMid} 55%, ${FELT.bgBot} 100%)`, boxShadow: `inset 0 0 0 6px ${FELT.rail}, inset 0 0 36px rgba(0,0,0,0.32), 0 8px 24px rgba(0,0,0,0.30)` }}>
                    <HandRow label={t('blackjack.dealer', 'Dealer')} cards={dealer} hideHole={!holeUp} total={dShown} showTotal={dealer.length > 0 && (holeUp || phase !== 'betting')} soft={holeUp && handValue(dealer).soft} emptyHint={phase === 'betting' ? t('blackjack.dealerWaiting', 'Dealer waiting') : undefined} />
                    <div className="relative my-1 flex flex-1 items-center justify-center">
                        {phase === 'betting' && player.length === 0 ? (
                            <div className="flex flex-col items-center" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ border: `2.5px dashed ${FELT.gold}`, opacity: 0.55 }}>
                                    <span className="text-[26px] font-black" style={{ color: FELT.gold }}>21</span>
                                </div>
                                <div className="mt-2 text-[12px] font-semibold uppercase tracking-[0.16em]" style={{ color: FELT.gold, opacity: 0.85 }}>{t('blackjack.blackjackPays', 'Blackjack pays 1.5× in profit')}</div>
                            </div>
                        ) : <ResultBadge phase={phase} outcome={outcome} payout={payout} />}
                    </div>
                    <HandRow label={t('blackjack.you', 'You')} cards={player} hideHole={false} total={pVal} showTotal={player.length > 0} soft={handValue(player).soft} emphasize={isBlackjack(player)} />
                </div>
            </div>
            <div className="shrink-0 px-4" style={{ paddingBottom: 'calc(var(--safe-bottom) + 30px)' }}>
                {phase === 'betting'
                    ? <BetControls bet={bet} chips={chips} onAdjust={onAdjust} onMax={onMax} onSet={onSet} onDeal={onDeal} onCashier={onCashier} />
                    : phase === 'playing'
                        ? <PlayControls onHit={onHit} onStand={onStand} onDouble={onDouble} canDouble={canDouble} />
                        : phase === 'dealer'
                            ? <WaitNote text={t('blackjack.dealerPlaying', 'Dealer is playing…')} />
                            : <ResultControls onNewHand={onNewHand} canPlay={chips > 0} onCashier={onCashier} />}
            </div>
        </>
    );
}

function HandRow({ label, cards, hideHole, total, showTotal, soft, emptyHint, emphasize }: {
    label: string; cards: Card[]; hideHole: boolean; total: number; showTotal: boolean; soft: boolean;
    emptyHint?: string; emphasize?: boolean;
}) {
    const bust = showTotal && total > 21;
    return (
        <div className="flex shrink-0 flex-col items-center">
            <div className="mb-1 flex items-center gap-2">
                <span className="max-w-[140px] truncate text-[13px] font-bold uppercase tracking-[0.28em]" style={{ color: 'rgba(255,255,255,0.78)' }}>{label}</span>
                {showTotal && (
                    <span className="rounded-full px-2 py-[1px] text-[14px] font-extrabold tabular-nums" style={{ background: bust ? 'rgba(255,90,90,0.22)' : 'rgba(0,0,0,0.28)', color: bust ? FELT.lose : (emphasize ? FELT.gold : '#fff'), border: `1px solid ${bust ? 'rgba(255,90,90,0.5)' : 'rgba(255,255,255,0.18)'}` }}>
                        {emphasize ? t('blackjack.bj', 'BJ') : total}{soft && !emphasize ? t('blackjack.softSuffix', ' (soft)') : ''}
                    </span>
                )}
            </div>
            <div className="flex min-h-[120px] items-center justify-center gap-[6px]">
                {cards.length === 0 && emptyHint && <span className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>{emptyHint}</span>}
                {cards.map((card, i) => {
                    const isHole = hideHole && i === 1;
                    return (
                        <div key={`${card.rank}${card.suit}-${i}`} style={{ animation: `bj-deal 0.42s cubic-bezier(0.2,0.8,0.3,1) ${i * 0.13}s both`, marginLeft: i > 0 ? -13 : 0, zIndex: i }}>
                            {isHole ? <CardBack /> : <CardFace card={card} />}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function CardFace({ card }: { card: Card }) {
    const w = 80; const h = 112;
    const color = isRed(card.suit) ? '#D4213B' : '#1A1A22';
    const glyph = SUIT_GLYPH[card.suit];
    return (
        <div className="relative flex flex-col justify-between rounded-[12px] bg-white" style={{ width: w, height: h, boxShadow: '0 2px 6px rgba(0,0,0,0.32), inset 0 0 0 1px rgba(0,0,0,0.06)', padding: 7 }}>
            <div className="flex flex-col items-center leading-none" style={{ color }}>
                <span className="text-[21px] font-extrabold">{card.rank}</span>
                <span className="text-[15px] leading-none">{glyph}</span>
            </div>
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 leading-none" style={{ color, fontSize: 40 }}>{glyph}</span>
            <div className="flex flex-col items-center self-end leading-none" style={{ color, transform: 'rotate(180deg)' }}>
                <span className="text-[21px] font-extrabold">{card.rank}</span>
                <span className="text-[15px] leading-none">{glyph}</span>
            </div>
        </div>
    );
}

function CardBack() {
    const w = 80; const h = 112;
    return (
        <div className="relative overflow-hidden rounded-[12px]" style={{ width: w, height: h, background: `repeating-linear-gradient(45deg, #B11E33 0 6px, #8E1527 6px 12px)`, boxShadow: '0 2px 6px rgba(0,0,0,0.32)', border: '4px solid #fff' }}>
            <div className="absolute inset-[7px] rounded-[7px]" style={{ border: '1.5px solid rgba(255,255,255,0.55)' }} />
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[26px] font-black" style={{ color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>♠</span>
            </div>
        </div>
    );
}

function ResultBadge({ phase, outcome, payout }: { phase: Phase; outcome: Outcome | null; payout: number }) {
    if (phase !== 'result' || !outcome) return <div className="h-[1px] w-[60%]" style={{ background: 'rgba(255,255,255,0.12)' }} />;
    const label = outcome === 'blackjack' ? t('blackjack.resultBlackjack', 'Blackjack!') : outcome === 'win' ? t('blackjack.resultWin', 'You Win') : outcome === 'push' ? t('blackjack.resultPush', 'Push') : t('blackjack.resultDealerWins', 'Dealer Wins');
    const color = outcome === 'lose' ? FELT.lose : outcome === 'push' ? FELT.push : FELT.win;
    return (
        <div className="flex flex-col items-center" style={{ animation: 'bj-badge-in 0.34s ease-out' }}>
            <div className="rounded-2xl px-5 py-2 text-[22px] font-black tracking-tight" style={{ color, background: 'rgba(0,0,0,0.32)', border: `1.5px solid ${color}`, textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>{label}</div>
            {payout !== 0 && <div className="mt-1.5 text-[15px] font-extrabold tabular-nums" style={{ color, animation: 'bj-net 1.1s ease-out forwards' }}>{payout > 0 ? `+${fmtChips(payout)}` : fmtChips(payout)}</div>}
        </div>
    );
}

function BetControls({ bet, chips, onAdjust, onMax, onSet, onDeal, onCashier }: {
    bet: number; chips: number; onAdjust: (d: number) => void; onMax: () => void; onSet: (n: number) => void; onDeal: () => void; onCashier: () => void;
}) {
    if (chips <= 0) {
        return (
            <div className="flex flex-col items-center gap-2.5">
                <div className="text-[14px] font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>{t('blackjack.outOfChips', "You're out of chips.")}</div>
                <button type="button" onClick={onCashier} className="flex items-center gap-2 rounded-2xl px-7 py-3.5 text-[16px] font-extrabold active:scale-[0.97]" style={{ background: `linear-gradient(160deg, ${FELT.gold}, ${FELT.goldDeep})`, color: FELT.chipText }}>
                    <Wallet className="h-[17px] w-[17px]" strokeWidth={2.6} />{t('blackjack.visitCashier', 'Visit the Cashier')}
                </button>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-center gap-2">
                {CHIP_STEPS.map(step => {
                    const can = bet + step <= chips;
                    return (
                        <button key={step} type="button" disabled={!can} onClick={() => onAdjust(step)} className="active:scale-90" style={{ opacity: can ? 1 : 0.35, transition: 'transform 0.08s' }} aria-label={t('blackjack.addChips', 'Add {step} chips', { step })}>
                            <Chip value={step} />
                        </button>
                    );
                })}
                <button type="button" onClick={onMax} className="rounded-full px-3 py-2 text-[12px] font-extrabold active:scale-95" style={{ background: 'rgba(0,0,0,0.3)', color: FELT.gold, border: `1px solid ${FELT.goldDeep}` }}>{t('blackjack.max', 'MAX')}</button>
            </div>
            <div className="flex items-center justify-center gap-3">
                <button type="button" onClick={() => onAdjust(-5)} disabled={bet <= 0} className="flex h-9 w-9 items-center justify-center rounded-full active:scale-90" style={{ background: 'rgba(0,0,0,0.3)', opacity: bet <= 0 ? 0.35 : 1 }} aria-label={t('blackjack.remove5', 'Remove 5 chips')}>
                    <Minus className="h-[18px] w-[18px]" strokeWidth={3} />
                </button>
                <div className="flex flex-col items-center rounded-2xl px-5 py-1.5" style={{ background: 'rgba(0,0,0,0.26)', border: '1px solid rgba(255,255,255,0.14)', minWidth: 130 }}>
                    <span className="text-[10px] font-bold uppercase tracking-[0.25em]" style={{ color: 'rgba(255,255,255,0.6)' }}>{t('blackjack.bet', 'Bet')}</span>
                    <input
                        type="text"
                        inputMode="numeric"
                        value={bet ? String(bet) : ''}
                        placeholder="0"
                        onChange={e => onSet(Math.floor(Number(e.target.value.replace(/[^0-9]/g, '')) || 0))}
                        className="w-full bg-transparent text-center text-[24px] font-black tabular-nums outline-none placeholder:text-white/30"
                        style={{ color: FELT.gold }}
                        aria-label={t('blackjack.betAmount', 'Bet amount')}
                    />
                </div>
                <button type="button" onClick={() => onAdjust(5)} disabled={bet >= chips} className="flex h-9 w-9 items-center justify-center rounded-full active:scale-90" style={{ background: 'rgba(0,0,0,0.3)', opacity: bet >= chips ? 0.35 : 1 }} aria-label={t('blackjack.add5', 'Add 5 chips')}>
                    <Plus className="h-[18px] w-[18px]" strokeWidth={3} />
                </button>
            </div>
            <button type="button" onClick={onDeal} disabled={bet <= 0} className="flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[17px] font-extrabold active:scale-[0.98]" style={{ background: bet > 0 ? `linear-gradient(160deg, ${FELT.gold}, ${FELT.goldDeep})` : 'rgba(0,0,0,0.3)', color: bet > 0 ? FELT.chipText : 'rgba(255,255,255,0.4)', transition: 'transform 0.08s' }}>
                <Layers className="h-[18px] w-[18px]" strokeWidth={2.6} />{t('blackjack.deal', 'Deal')}
            </button>
        </div>
    );
}

function PlayControls({ onHit, onStand, onDouble, canDouble }: { onHit: () => void; onStand: () => void; onDouble: () => void; canDouble: boolean }) {
    return (
        <div className="flex items-stretch gap-2.5">
            <ActionButton label={t('blackjack.hit', 'Hit')} onClick={onHit} tone="light" />
            <ActionButton label={t('blackjack.stand', 'Stand')} onClick={onStand} tone="gold" />
            <ActionButton label={t('blackjack.double', 'Double')} onClick={onDouble} tone="dark" disabled={!canDouble} />
        </div>
    );
}

function ActionButton({ label, onClick, tone, disabled }: { label: string; onClick: () => void; tone: 'light' | 'gold' | 'dark'; disabled?: boolean }) {
    const styles = tone === 'gold'
        ? { background: `linear-gradient(160deg, ${FELT.gold}, ${FELT.goldDeep})`, color: FELT.chipText }
        : tone === 'light'
            ? { background: 'rgba(255,255,255,0.92)', color: '#0B3A24' }
            : { background: 'rgba(0,0,0,0.32)', color: '#fff', border: '1px solid rgba(255,255,255,0.18)' };
    return (
        <button type="button" onClick={onClick} disabled={disabled} className="flex-1 rounded-2xl py-3.5 text-[16px] font-extrabold active:scale-[0.97]" style={{ ...styles, opacity: disabled ? 0.4 : 1, transition: 'transform 0.08s' }}>{label}</button>
    );
}

function ResultControls({ onNewHand, canPlay, onCashier }: { onNewHand: () => void; canPlay: boolean; onCashier: () => void }) {
    if (!canPlay) {
        return (
            <button type="button" onClick={onCashier} className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[16px] font-extrabold active:scale-[0.98]" style={{ background: `linear-gradient(160deg, ${FELT.gold}, ${FELT.goldDeep})`, color: FELT.chipText }}>
                <Wallet className="h-[17px] w-[17px]" strokeWidth={2.6} />{t('blackjack.visitCashier', 'Visit the Cashier')}
            </button>
        );
    }
    return (
        <button type="button" onClick={onNewHand} className="w-full rounded-2xl py-3.5 text-[17px] font-extrabold active:scale-[0.98]" style={{ background: `linear-gradient(160deg, ${FELT.gold}, ${FELT.goldDeep})`, color: FELT.chipText, transition: 'transform 0.08s' }}>{t('blackjack.newHand', 'New Hand')}</button>
    );
}

function WaitNote({ text }: { text: string }) {
    return <div className="flex h-[52px] items-center justify-center text-[14px] font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>{text}</div>;
}

const CHIP_COLORS: Record<number, { ring: string; body: string }> = {
    5:    { ring: '#E23B4E', body: '#B11E33' },
    25:   { ring: '#2FA45C', body: '#15723C' },
    100:  { ring: '#2B2F3A', body: '#10131C' },
    1000: { ring: '#8E63D6', body: '#5B3AA6' },
};

function Chip({ value }: { value: number }) {
    const c = CHIP_COLORS[value] ?? CHIP_COLORS[5];
    return (
        <div className="relative flex items-center justify-center rounded-full" style={{ width: 50, height: 50, background: `radial-gradient(circle at 50% 38%, ${c.ring} 0%, ${c.body} 70%)`, boxShadow: '0 2px 5px rgba(0,0,0,0.4), inset 0 0 0 4px rgba(255,255,255,0.16)', animation: 'bj-chip-pop 0.3s ease-out' }}>
            <div className="absolute inset-[7px] rounded-full" style={{ border: '2px dashed rgba(255,255,255,0.55)' }} />
            <span className={`relative font-black text-white ${value >= 1000 ? 'text-[12px]' : 'text-[14px]'}`} style={{ textShadow: '0 1px 1px rgba(0,0,0,0.4)' }}>{value}</span>
        </div>
    );
}
