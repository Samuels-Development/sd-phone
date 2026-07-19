import { isFiveM } from '@/core/nui';
import { apiData } from '@/core/api';
import { writeJson } from '@/lib/storage';
import {
    type Card, type Outcome,
    dealerShouldHit, freshDeck, isBlackjack, isBust, outcomeVsDealer, payoutFor,
} from './logic';

export interface BjResult {
    phase: 'playing' | 'result';
    player: Card[];
    dealer: Card[];          // playing: dealer up card only; result: full dealer hand
    outcome?: Outcome;
    net?: number;            // signed profit for the hand (result only)
    chips?: number;          // authoritative balance after this action (present when it changed)
    bet?: number;            // current wager (doubles report the doubled bet)
}

// --- Browser dev fallback: no server, so a local dealer runs the same rules for development only.
// In FiveM the server is authoritative and none of this runs. Shares chip storage with chipsApi.
const CHIP_KEY = 'sd-phone:casino-chips:v1';
function devChips(): number { return Math.max(0, Number(localStorage.getItem(CHIP_KEY) ?? '2000') || 0); }
function setDevChips(n: number) { writeJson(CHIP_KEY, Math.max(0, Math.floor(n))); }

let dev: { deck: Card[]; player: Card[]; dealer: Card[]; bet: number; doubled: boolean } | null = null;

function devResolve(playDealer: boolean): BjResult {
    const s = dev!;
    if (playDealer) while (dealerShouldHit(s.dealer)) s.dealer.push(s.deck.pop()!);
    const outcome = outcomeVsDealer(s.player, s.dealer);
    const { credit, net } = payoutFor(s.bet, outcome);
    const chips = devChips() + credit;
    setDevChips(chips);
    const res: BjResult = { phase: 'result', player: s.player, dealer: s.dealer, outcome, net, chips, bet: s.bet };
    dev = null;
    return res;
}

export async function bjDeal(bet: number): Promise<BjResult | null> {
    if (isFiveM) return apiData<BjResult>('sd-phone:games:bjDeal', { bet });
    const chips = devChips();
    if (bet < 1 || bet > chips) return null;
    setDevChips(chips - bet);
    const deck = freshDeck();
    const player = [deck.pop()!, deck.pop()!];
    const dealer = [deck.pop()!, deck.pop()!];
    dev = { deck, player, dealer, bet, doubled: false };
    if (isBlackjack(player) || isBlackjack(dealer)) return devResolve(false);
    return { phase: 'playing', player, dealer: [dealer[0]], chips: chips - bet, bet };
}

export async function bjHit(): Promise<BjResult | null> {
    if (isFiveM) return apiData<BjResult>('sd-phone:games:bjHit');
    if (!dev) return null;
    dev.player.push(dev.deck.pop()!);
    if (isBust(dev.player)) return devResolve(false);
    return { phase: 'playing', player: dev.player, dealer: [dev.dealer[0]], bet: dev.bet };
}

export async function bjStand(): Promise<BjResult | null> {
    if (isFiveM) return apiData<BjResult>('sd-phone:games:bjStand');
    if (!dev) return null;
    return devResolve(true);
}

export async function bjDouble(): Promise<BjResult | null> {
    if (isFiveM) return apiData<BjResult>('sd-phone:games:bjDouble');
    if (!dev || dev.player.length !== 2 || dev.doubled) return null;
    const chips = devChips();
    if (chips < dev.bet) return null;
    setDevChips(chips - dev.bet);
    dev.doubled = true;
    dev.bet *= 2;
    dev.player.push(dev.deck.pop()!);
    if (isBust(dev.player)) return devResolve(false);
    return devResolve(true);
}
