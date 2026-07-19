import { describe, expect, it } from 'vitest';

import type { Card } from './logic';
import { dealerShouldHit, handValue, isBlackjack, isBust, outcomeVsDealer, payoutFor } from './logic';

// These rules are the oracle the server-authoritative Lua (server/games/blackjack.lua) mirrors.
// Keep the two in lockstep: any change here must be reflected there.

const h = (...ranks: Card['rank'][]): Card[] => ranks.map(rank => ({ rank, suit: 'S' }));

describe('handValue', () => {
    it('sums pips and faces as ten', () => {
        expect(handValue(h('10', 'K')).total).toBe(20);
        expect(handValue(h('7', '9')).total).toBe(16);
    });
    it('counts an ace as eleven when it fits (soft)', () => {
        const v = handValue(h('A', '6'));
        expect(v.total).toBe(17);
        expect(v.soft).toBe(true);
    });
    it('demotes aces to one to avoid a bust (hard)', () => {
        const v = handValue(h('A', '6', 'K'));
        expect(v.total).toBe(17);
        expect(v.soft).toBe(false);
    });
    it('demotes only as many aces as needed', () => {
        expect(handValue(h('A', 'A', '9')).total).toBe(21); // 11 + 1 + 9
    });
});

describe('isBlackjack / isBust', () => {
    it('is a blackjack only on two cards totalling 21', () => {
        expect(isBlackjack(h('A', 'K'))).toBe(true);
        expect(isBlackjack(h('A', '9', 'A'))).toBe(false); // 21 but three cards
        expect(isBlackjack(h('10', '9'))).toBe(false);
    });
    it('busts above 21', () => {
        expect(isBust(h('K', 'Q', '2'))).toBe(true);
        expect(isBust(h('K', 'Q'))).toBe(false);
    });
});

describe('dealerShouldHit', () => {
    it('draws below 17 and stands at 17+, including soft 17', () => {
        expect(dealerShouldHit(h('10', '6'))).toBe(true);   // 16
        expect(dealerShouldHit(h('10', '7'))).toBe(false);  // 17
        expect(dealerShouldHit(h('A', '6'))).toBe(false);   // soft 17: stands
    });
});

describe('outcomeVsDealer', () => {
    it('rewards a natural and pushes two naturals', () => {
        expect(outcomeVsDealer(h('A', 'K'), h('10', '9'))).toBe('blackjack');
        expect(outcomeVsDealer(h('A', 'K'), h('A', 'Q'))).toBe('push');
        expect(outcomeVsDealer(h('10', '9'), h('A', 'Q'))).toBe('lose');
    });
    it('resolves busts before comparing totals', () => {
        expect(outcomeVsDealer(h('K', 'Q', '5'), h('10', '7'))).toBe('lose'); // player bust
        expect(outcomeVsDealer(h('10', '8'), h('K', 'Q', '5'))).toBe('win');  // dealer bust
    });
    it('compares totals otherwise', () => {
        expect(outcomeVsDealer(h('10', '9'), h('10', '8'))).toBe('win');
        expect(outcomeVsDealer(h('10', '7'), h('10', '9'))).toBe('lose');
        expect(outcomeVsDealer(h('10', '8'), h('10', '8'))).toBe('push');
    });
});

describe('payoutFor', () => {
    it('pays 3:2 on a blackjack (credit includes the returned stake)', () => {
        expect(payoutFor(100, 'blackjack')).toEqual({ credit: 250, net: 150 });
        expect(payoutFor(25, 'blackjack')).toEqual({ credit: 63, net: 38 }); // round(37.5) = 38
    });
    it('pays even money on a win, returns the stake on a push, nothing on a loss', () => {
        expect(payoutFor(100, 'win')).toEqual({ credit: 200, net: 100 });
        expect(payoutFor(100, 'push')).toEqual({ credit: 100, net: 0 });
        expect(payoutFor(100, 'lose')).toEqual({ credit: 0, net: -100 });
    });
});
