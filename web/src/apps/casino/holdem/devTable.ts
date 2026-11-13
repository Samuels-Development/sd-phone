import { RANKS, SUITS, type Card } from '@/apps/casino/cards';
import { writeJson } from '@/lib/storage';

import type {
    HoldemAction, HoldemCreateLimits, HoldemCreateOpts, HoldemHandEnd, HoldemLegal, HoldemLobby,
    HoldemPot, HoldemSeat, HoldemStatePush, HoldemStreet, HoldemTableInfo, SeatState,
} from './data';

const CHIP_KEY = 'sd-phone:casino-chips:v1';
const SEATS = 6;
const ACTION_MS = 20000;
const NEXT_HAND_MS = 3400;

export const DEV_TABLES: HoldemTableInfo[] = [
    { id: 'low',  name: 'Sandy Shores', sb: 25,  bb: 50,   minBuyIn: 2000,  maxBuyIn: 10000,  seated: 0, playing: false, custom: false, ownerName: null },
    { id: 'mid',  name: 'Vinewood',     sb: 100, bb: 200,  minBuyIn: 8000,  maxBuyIn: 40000,  seated: 0, playing: false, custom: false, ownerName: null },
    { id: 'high', name: 'Diamond',      sb: 500, bb: 1000, minBuyIn: 40000, maxBuyIn: 200000, seated: 0, playing: false, custom: false, ownerName: null },
];

const DEV_CREATE: HoldemCreateLimits = {
    enabled: true, nameMax: 24, blinds: [5, 10, 25, 50, 100, 250, 500, 1000, 2500], bbRatioMax: 3,
    minBuyInBB: 20, maxBuyInBB: 400,
};

const devMade: HoldemTableInfo[] = [];
let devMadeId = 0;

const BOT_NAMES = ['Lester', 'Trevor', 'Paige', 'Lamar', 'Tanisha', 'Karim', 'Solomon', 'Maude'];

const RANK_VALUE: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

const CAT_KEY = ['highCard', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'fullHouse', 'quads', 'straightFlush'];

function packScore(cat: number, r: number[]): number {
    return cat * 759375 + r[0] * 50625 + r[1] * 3375 + r[2] * 225 + r[3] * 15 + r[4];
}

export function score5(cards: Card[]): number {
    const vals = cards.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
    const flush = cards.every(c => c.suit === cards[0].suit);

    const uniq: number[] = [];
    for (const v of vals) if (!uniq.includes(v)) uniq.push(v);
    let straightHigh = 0;
    if (uniq.length === 5) {
        if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
        else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5;
    }

    const counts = new Map<number, number>();
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
    const groups = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (b[0] - a[0]));

    if (flush && straightHigh) return packScore(8, [straightHigh, 0, 0, 0, 0]);
    if (groups[0][1] === 4) return packScore(7, [groups[0][0], groups[1][0], 0, 0, 0]);
    if (groups[0][1] === 3 && groups[1][1] === 2) return packScore(6, [groups[0][0], groups[1][0], 0, 0, 0]);
    if (flush) return packScore(5, vals);
    if (straightHigh) return packScore(4, [straightHigh, 0, 0, 0, 0]);
    if (groups[0][1] === 3) return packScore(3, [groups[0][0], groups[1][0], groups[2][0], 0, 0]);
    if (groups[0][1] === 2 && groups[1][1] === 2) return packScore(2, [groups[0][0], groups[1][0], groups[2][0], 0, 0]);
    if (groups[0][1] === 2) return packScore(1, [groups[0][0], groups[1][0], groups[2][0], groups[3][0], 0]);
    return packScore(0, vals);
}

export function categoryOf(score: number): string {
    return CAT_KEY[Math.floor(score / 759375)] ?? 'highCard';
}

export function best7(cards: Card[]): { score: number; best: Card[] } {
    let score = -1;
    let best: Card[] = cards.slice(0, 5);
    const n = cards.length;
    for (let a = 0; a < n - 4; a++) {
        for (let b = a + 1; b < n - 3; b++) {
            for (let c = b + 1; c < n - 2; c++) {
                for (let d = c + 1; d < n - 1; d++) {
                    for (let e = d + 1; e < n; e++) {
                        const hand = [cards[a], cards[b], cards[c], cards[d], cards[e]];
                        const s = score5(hand);
                        if (s > score) { score = s; best = hand; }
                    }
                }
            }
        }
    }
    return { score, best };
}

export interface PotBuild { pots: HoldemPot[]; refund: { seat: number; amount: number } | null }

export function buildPots(contribIn: number[], folded: boolean[]): PotBuild {
    const contrib = contribIn.slice();
    let refund: { seat: number; amount: number } | null = null;

    let hiSeat = -1;
    let hi = 0;
    for (let s = 0; s < contrib.length; s++) if (contrib[s] > hi) { hi = contrib[s]; hiSeat = s; }
    let second = 0;
    for (let s = 0; s < contrib.length; s++) if (s !== hiSeat && contrib[s] > second) second = contrib[s];
    if (hiSeat >= 0 && hi > second) { refund = { seat: hiSeat, amount: hi - second }; contrib[hiSeat] = second; }

    const levels: number[] = [];
    for (let s = 0; s < contrib.length; s++) {
        if (contrib[s] > 0 && !folded[s] && !levels.includes(contrib[s])) levels.push(contrib[s]);
    }
    levels.sort((a, b) => a - b);

    const pots: HoldemPot[] = [];
    let prev = 0;
    for (const level of levels) {
        let amount = 0;
        for (let s = 0; s < contrib.length; s++) amount += Math.min(contrib[s], level) - Math.min(contrib[s], prev);
        const eligible: number[] = [];
        for (let s = 0; s < contrib.length; s++) if (!folded[s] && contrib[s] >= level) eligible.push(s);
        if (amount > 0 && eligible.length > 0) pots.push({ amount, eligible });
        prev = level;
    }
    return { pots, refund };
}

export function awardPots(pots: HoldemPot[], scores: number[], order: number[]): { seat: number; amount: number }[] {
    const tally = new Map<number, number>();
    for (const pot of pots) {
        let best = -1;
        const winners: number[] = [];
        for (const s of order) {
            if (!pot.eligible.includes(s)) continue;
            const sc = scores[s] ?? -1;
            if (sc < 0) continue;
            if (sc > best) { best = sc; winners.length = 0; winners.push(s); }
            else if (sc === best) winners.push(s);
        }
        if (!winners.length) continue;
        const share = Math.floor(pot.amount / winners.length);
        let odd = pot.amount - share * winners.length;
        for (const s of winners) {
            let amount = share;
            if (odd > 0) { amount += 1; odd -= 1; }
            tally.set(s, (tally.get(s) ?? 0) + amount);
        }
    }
    const out: { seat: number; amount: number }[] = [];
    for (const [seat, amount] of tally) out.push({ seat, amount });
    out.sort((a, b) => b.amount - a.amount || a.seat - b.seat);
    return out;
}

interface DevSeat {
    i: number;
    name: string | null;
    stack: number;
    committed: number;
    contrib: number;
    hole: Card[];
    acted: boolean;
    state: SeatState;
    bot: boolean;
}

export interface DevEngine {
    tableId: string;
    sb: number;
    bb: number;
    readonly button: number;
    readonly street: HoldemStreet;
    readonly handId: number;
    actorSeat: () => number | null;
    sit: (seat: number, name: string, buyIn: number, bot: boolean) => boolean;
    stand: (seat: number) => number;
    act: (seat: number, action: HoldemAction, to: number) => boolean;
    view: (me: number | null) => HoldemStatePush;
    lastHand: () => HoldemHandEnd | null;
    startHand: () => boolean;
    runHand: (maxActions?: number) => boolean;
    tick: (now: number) => boolean;
    totalStacks: () => number;
    seatedCount: () => number;
    playableCount: () => number;
    topUp: (seat: number, amount: number) => void;
}

export function createDevEngine(tableId: string, sb: number, bb: number, rng: () => number = Math.random): DevEngine {
    const seats: DevSeat[] = [];
    for (let i = 0; i <= SEATS; i++) {
        seats.push({ i, name: null, stack: 0, committed: 0, contrib: 0, hole: [], acted: false, state: 'empty', bot: false });
    }

    let button = 1;
    let street: HoldemStreet = 'idle';
    let board: Card[] = [];
    let deck: Card[] = [];
    let betToCall = 0;
    let minRaise = bb;
    let actor: number | null = null;
    let handId = 0;
    let deadline = 0;
    let lastEnd: HoldemHandEnd | null = null;
    let nextHandAt = 0;
    let botAt = 0;
    let revealed = false;

    function shuffled(): Card[] {
        const out: Card[] = [];
        for (const s of SUITS) for (const r of RANKS) out.push({ rank: r, suit: s });
        for (let i = out.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            const tmp = out[i];
            out[i] = out[j];
            out[j] = tmp;
        }
        return out;
    }

    function occupied(s: DevSeat): boolean { return s.name !== null; }
    function contender(s: DevSeat): boolean { return s.state === 'in' || s.state === 'allin'; }
    function actionable(): DevSeat[] { return seats.filter(s => s.state === 'in'); }
    function contenders(): DevSeat[] { return seats.filter(contender); }
    function eligibleForHand(s: DevSeat): boolean { return occupied(s) && s.stack > 0 && s.state !== 'sitout'; }

    function nextOccupied(from: number, pick: (s: DevSeat) => boolean): number {
        for (let step = 1; step <= SEATS; step++) {
            const i = ((from - 1 + step) % SEATS) + 1;
            if (pick(seats[i])) return i;
        }
        return from;
    }

    function post(seat: DevSeat, amount: number): void {
        const amt = Math.max(0, Math.min(amount, seat.stack));
        seat.stack -= amt;
        seat.committed += amt;
        seat.contrib += amt;
        if (seat.stack === 0) seat.state = 'allin';
    }

    function startHand(): boolean {
        const ready = seats.filter(eligibleForHand);
        if (ready.length < 2) { actor = null; street = 'idle'; return false; }

        handId += 1;
        board = [];
        deck = shuffled();
        street = 'preflop';
        betToCall = bb;
        minRaise = bb;
        revealed = false;
        lastEnd = null;

        for (const s of seats) {
            s.committed = 0;
            s.contrib = 0;
            s.hole = [];
            s.acted = false;
            if (s.i === 0) { s.state = 'empty'; continue; }
            s.state = eligibleForHand(s) ? 'in' : (occupied(s) ? 'sitting' : 'empty');
        }

        button = nextOccupied(button, s => s.state === 'in');
        const live = seats.filter(s => s.state === 'in');
        const headsUp = live.length === 2;
        const sbSeat = headsUp ? button : nextOccupied(button, s => s.state === 'in');
        const bbSeat = nextOccupied(sbSeat, s => s.state === 'in');

        post(seats[sbSeat], sb);
        post(seats[bbSeat], bb);

        for (const s of live) s.hole = [deck.pop() as Card, deck.pop() as Card];

        const first = headsUp ? button : nextOccupied(bbSeat, s => s.state === 'in');
        actor = seats[first].state === 'in' ? first : nextOccupied(first, s => s.state === 'in');
        if (seats[actor].state !== 'in') actor = null;
        deadline = Date.now() + ACTION_MS;
        botAt = Date.now() + 900;
        return true;
    }

    function dealBoard(n: number): void {
        for (let i = 0; i < n; i++) board.push(deck.pop() as Card);
    }

    function streetClosed(): boolean {
        const ins = actionable();
        if (ins.length === 0) return true;
        return ins.every(s => s.acted && s.committed === betToCall);
    }

    function resolve(): void {
        const contrib: number[] = [];
        const folded: boolean[] = [];
        for (let i = 0; i <= SEATS; i++) {
            contrib.push(seats[i].contrib);
            folded.push(!contender(seats[i]));
        }

        const built = buildPots(contrib, folded);
        if (built.refund) seats[built.refund.seat].stack += built.refund.amount;

        const live = contenders();
        const scores: number[] = new Array(SEATS + 1).fill(-1);
        const shown: HoldemHandEnd['shown'] = [];
        if (live.length > 1) {
            for (const s of live) {
                const rated = best7([...s.hole, ...board]);
                scores[s.i] = rated.score;
                shown.push({ seat: s.i, hole: s.hole.slice(), best: rated.best, cat: categoryOf(rated.score) });
            }
            revealed = true;
        } else if (live.length === 1) {
            scores[live[0].i] = 0;
        }

        const order: number[] = [];
        for (let step = 1; step <= SEATS; step++) order.push(((button - 1 + step) % SEATS) + 1);
        const awards = awardPots(built.pots, scores, order);
        for (const a of awards) seats[a.seat].stack += a.amount;

        street = 'showdown';
        actor = null;
        lastEnd = { tableId, handId, pots: built.pots, awards, shown };
        nextHandAt = Date.now() + NEXT_HAND_MS;

        for (const s of seats) {
            if (s.i === 0) continue;
            if (occupied(s)) s.state = 'sitting';
        }
    }

    function openStreet(): void {
        for (const s of seats) { s.committed = 0; s.acted = false; }
        betToCall = 0;
        minRaise = bb;
        const first = nextOccupied(button, s => s.state === 'in');
        actor = seats[first].state === 'in' ? first : null;
        deadline = Date.now() + ACTION_MS;
        botAt = Date.now() + 800;
    }

    function nextStreet(): void {
        for (;;) {
            if (street === 'preflop') { dealBoard(3); street = 'flop'; }
            else if (street === 'flop') { dealBoard(1); street = 'turn'; }
            else if (street === 'turn') { dealBoard(1); street = 'river'; }
            else { resolve(); return; }

            if (contenders().length < 2) { resolve(); return; }
            if (actionable().length > 1) { openStreet(); return; }
        }
    }

    function afterAction(): void {
        if (contenders().length < 2) { resolve(); return; }
        if (streetClosed()) { nextStreet(); return; }
        const next = nextOccupied(actor ?? button, s => s.state === 'in');
        actor = seats[next].state === 'in' ? next : null;
        if (actor === null) { nextStreet(); return; }
        deadline = Date.now() + ACTION_MS;
        botAt = Date.now() + 600 + Math.floor(rng() * 900);
    }

    function legalFor(seat: DevSeat): HoldemLegal {
        const need = Math.max(0, betToCall - seat.committed);
        const ceiling = seat.committed + seat.stack;
        const canRaise = ceiling > betToCall;
        return {
            fold: true,
            check: need === 0,
            call: need > 0,
            callAmount: Math.min(need, seat.stack),
            minRaiseTo: canRaise ? Math.min(betToCall + minRaise, ceiling) : 0,
            maxRaiseTo: canRaise ? ceiling : 0,
        };
    }

    function apply(seat: DevSeat, action: HoldemAction, to: number): boolean {
        const legal = legalFor(seat);
        if (action === 'fold') { seat.state = 'folded'; seat.acted = true; return true; }
        if (action === 'check') {
            if (!legal.check) return false;
            seat.acted = true;
            return true;
        }
        if (action === 'call') {
            if (!legal.call) return false;
            post(seat, legal.callAmount);
            seat.acted = true;
            return true;
        }
        if (!legal.maxRaiseTo) return false;
        const target = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.floor(to)));
        const full = target >= betToCall + minRaise;
        post(seat, target - seat.committed);
        if (full) {
            minRaise = target - betToCall;
            betToCall = target;
            for (const s of seats) if (s.i !== seat.i && s.state === 'in') s.acted = false;
        } else if (target > betToCall) {
            betToCall = target;
        }
        seat.acted = true;
        return true;
    }

    function act(seatIndex: number, action: HoldemAction, to: number): boolean {
        if (actor !== seatIndex) return false;
        const seat = seats[seatIndex];
        if (seat.state !== 'in') return false;
        if (!apply(seat, action, to)) return false;
        afterAction();
        return true;
    }

    function botDecision(seat: DevSeat): { action: HoldemAction; to: number } {
        const legal = legalFor(seat);
        const roll = rng();
        if (legal.check) {
            if (roll < 0.85 || !legal.maxRaiseTo) return { action: 'check', to: 0 };
            return { action: 'raise', to: legal.minRaiseTo };
        }
        if (roll < 0.25) return { action: 'fold', to: 0 };
        if (roll < 0.85 || !legal.maxRaiseTo) return { action: 'call', to: 0 };
        const bump = rng() < 0.3 ? bb * 2 : 0;
        return { action: 'raise', to: Math.min(legal.maxRaiseTo, legal.minRaiseTo + bump) };
    }

    function timeoutAction(seat: DevSeat): void {
        const legal = legalFor(seat);
        apply(seat, legal.check ? 'check' : 'fold', 0);
        afterAction();
    }

    function runHand(maxActions = 400): boolean {
        if (!startHand()) return false;
        let guard = 0;
        while (street !== 'showdown' && street !== 'idle' && guard < maxActions) {
            guard += 1;
            if (actor === null) break;
            const seat = seats[actor];
            const move = botDecision(seat);
            act(seat.i, move.action, move.to);
        }
        if (street !== 'showdown') resolve();
        street = 'idle';
        return true;
    }

    function tick(now: number): boolean {
        if (street === 'showdown') {
            if (now >= nextHandAt) { startHand(); return true; }
            return false;
        }
        if (street === 'idle') {
            if (now >= nextHandAt && seats.filter(eligibleForHand).length >= 2) return startHand();
            return false;
        }
        if (actor === null) return false;
        const seat = seats[actor];
        if (seat.bot) {
            if (now < botAt) return false;
            const move = botDecision(seat);
            act(seat.i, move.action, move.to);
            return true;
        }
        if (now >= deadline + 5000) { timeoutAction(seat); return true; }
        return false;
    }

    function heroRank(s: DevSeat | null): string | null {
        if (!s || (s.state !== 'in' && s.state !== 'allin') || s.hole.length < 2) return null;
        if (board.length === 0) return s.hole[0].rank === s.hole[1].rank ? 'pair' : 'highCard';
        return categoryOf(best7([...s.hole, ...board]).score);
    }

    function livePots(): HoldemPot[] {
        if (contenders().length === 0) return [];
        const contrib: number[] = [];
        const folded: boolean[] = [];
        for (let i = 0; i <= SEATS; i++) {
            contrib.push(seats[i].contrib);
            folded.push(!contender(seats[i]));
        }
        return buildPots(contrib, folded).pots;
    }

    function view(me: number | null): HoldemStatePush {
        const out: HoldemSeat[] = [];
        for (let i = 1; i <= SEATS; i++) {
            const s = seats[i];
            const show = s.hole.length > 0 && (s.i === me || (revealed && contender(s)));
            out.push({
                i: s.i,
                name: s.name,
                stack: s.stack,
                committed: s.committed,
                state: s.state,
                hole: show ? s.hole.slice() : null,
                me: s.i === me,
            });
        }
        const meSeat = me !== null ? seats[me] : null;
        return {
            tableId,
            handId,
            street,
            button,
            actor,
            deadline,
            now: Date.now(),
            board: board.slice(),
            pots: street === 'showdown' && lastEnd ? lastEnd.pots : livePots(),
            seats: out,
            legal: meSeat && actor === me && meSeat.state === 'in' ? legalFor(meSeat) : null,
            handRank: heroRank(meSeat),
            sb,
            bb,
        };
    }

    return {
        tableId,
        sb,
        bb,
        get button() { return button; },
        get street() { return street; },
        get handId() { return handId; },
        actorSeat: () => actor,
        sit(seat, name, buyIn, bot) {
            if (seat < 1 || seat > SEATS) return false;
            const s = seats[seat];
            if (occupied(s)) return false;
            s.name = name;
            s.stack = Math.floor(buyIn);
            s.bot = bot;
            s.state = 'sitting';
            s.hole = [];
            s.committed = 0;
            s.contrib = 0;
            if (street === 'idle') nextHandAt = Date.now() + 1400;
            return true;
        },
        stand(seat) {
            const s = seats[seat];
            if (!occupied(s)) return 0;
            const back = s.stack;
            const mid = contender(s) && street !== 'idle' && street !== 'showdown';
            s.stack = 0;
            s.name = null;
            s.bot = false;
            s.hole = [];
            if (mid) {
                s.state = 'folded';
                if (actor === seat) afterAction();
                return back;
            }
            s.state = 'empty';
            s.committed = 0;
            s.contrib = 0;
            return back;
        },
        act,
        view,
        lastHand: () => lastEnd,
        startHand,
        runHand,
        tick,
        totalStacks() {
            let n = 0;
            for (const s of seats) n += s.stack;
            return n;
        },
        seatedCount() {
            let n = 0;
            for (let i = 1; i <= SEATS; i++) if (occupied(seats[i])) n += 1;
            return n;
        },
        playableCount() {
            let n = 0;
            for (let i = 1; i <= SEATS; i++) if (eligibleForHand(seats[i])) n += 1;
            return n;
        },
        topUp(seat, amount) {
            if (seat < 1 || seat > SEATS) return;
            seats[seat].stack += Math.floor(amount);
        },
    };
}

function devChips(): number { return Math.max(0, Number(localStorage.getItem(CHIP_KEY) ?? '20000') || 0); }
function setDevChips(n: number): void { writeJson(CHIP_KEY, Math.max(0, Math.floor(n))); }

interface DevRoom { engine: DevEngine; info: HoldemTableInfo; seat: number | null }

const rooms = new Map<string, DevRoom>();
let loop = 0;
let watching: string | null = null;
let pushedHand = 0;

function roomFor(tableId: string): DevRoom | null {
    const info = DEV_TABLES.find(x => x.id === tableId) ?? devMade.find(x => x.id === tableId);
    if (!info) return null;
    const found = rooms.get(tableId);
    if (found) return found;
    const engine = createDevEngine(tableId, info.sb, info.bb);
    if (!info.custom) {
        const first = 1 + Math.floor(Math.random() * 2);
        const shift = Math.floor(Math.random() * BOT_NAMES.length);
        for (let n = 0; n < 3; n++) {
            engine.sit(((first - 1 + n * 2) % SEATS) + 1, BOT_NAMES[(shift + n) % BOT_NAMES.length], info.minBuyIn * 2, true);
        }
    }
    const room: DevRoom = { engine, info: { ...info }, seat: null };
    rooms.set(tableId, room);
    return room;
}

function push(room: DevRoom): void {
    window.postMessage({ action: 'sd-phone:holdem:state', data: room.engine.view(room.seat) }, '*');
    const end = room.engine.lastHand();
    if (end && end.handId !== pushedHand) {
        pushedHand = end.handId;
        window.postMessage({ action: 'sd-phone:holdem:hand', data: end }, '*');
    }
}

function ensureLoop(): void {
    if (loop) return;
    loop = window.setInterval(() => {
        if (!watching) return;
        const room = rooms.get(watching);
        if (!room) return;
        if (room.engine.tick(Date.now())) push(room);
    }, 250);
}

export const devHoldem = {
    tables(): HoldemLobby {
        const tables = [...DEV_TABLES, ...devMade].map(info => {
            const room = rooms.get(info.id);
            return {
                ...info,
                seated:  room ? room.engine.seatedCount() : 0,
                playing: room ? room.engine.street !== 'idle' : false,
            };
        });
        return { tables, create: DEV_CREATE };
    },
    create(opts: HoldemCreateOpts): { ok: boolean; message?: string; data?: { tableId: string } } {
        if (devMade.length >= 1) return { ok: false, message: 'You already have a table open. Close that one first.' };
        const sb = Math.max(1, Math.floor(opts.sb));
        const bb = Math.min(sb * DEV_CREATE.bbRatioMax, Math.max(sb * 2, Math.floor(opts.bb)));
        const minBuyIn = Math.max(bb * DEV_CREATE.minBuyInBB, Math.floor(opts.minBuyIn / bb) * bb);
        const maxBuyIn = Math.min(bb * DEV_CREATE.maxBuyInBB, Math.max(minBuyIn, Math.floor(opts.maxBuyIn / bb) * bb));
        devMadeId += 1;
        const id = `pt${devMadeId}`;
        devMade.push({
            id, name: opts.name.trim().slice(0, DEV_CREATE.nameMax) || 'Your table',
            sb, bb, minBuyIn, maxBuyIn, seated: 0, playing: false, custom: true, ownerName: 'You',
        });
        return { ok: true, data: { tableId: id } };
    },
    sync(tableId: string): HoldemStatePush | null {
        const room = roomFor(tableId);
        if (!room) return null;
        watching = tableId;
        ensureLoop();
        return room.engine.view(room.seat);
    },
    sit(tableId: string, seat: number, buyIn: number): { ok: boolean; message?: string; data?: HoldemStatePush } {
        const room = roomFor(tableId);
        if (!room) return { ok: false, message: 'Table not found' };
        const held = devChips();
        if (buyIn < room.info.minBuyIn || buyIn > room.info.maxBuyIn) return { ok: false, message: 'Buy in out of range' };
        if (buyIn > held) return { ok: false, message: 'Not enough chips' };
        if (!room.engine.sit(seat, 'You', buyIn, false)) return { ok: false, message: 'Seat taken' };
        setDevChips(held - buyIn);
        room.seat = seat;
        watching = tableId;
        ensureLoop();
        return { ok: true, data: room.engine.view(room.seat) };
    },
    leave(): { ok: boolean; chips: number } {
        let chips = devChips();
        for (const room of rooms.values()) {
            if (room.seat === null) continue;
            chips = devChips() + room.engine.stand(room.seat);
            setDevChips(chips);
            room.seat = null;
        }
        watching = null;
        return { ok: true, chips };
    },
    act(tableId: string, handId: number, action: HoldemAction, to: number): { ok: boolean; message?: string } {
        const room = rooms.get(tableId);
        if (!room || room.seat === null) return { ok: false, message: 'Not seated' };
        if (handId !== room.engine.handId) return { ok: false, message: 'Hand is over' };
        if (!room.engine.act(room.seat, action, to)) return { ok: false, message: 'Not your turn' };
        push(room);
        return { ok: true };
    },
};
