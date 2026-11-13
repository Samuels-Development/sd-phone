
import { fetchNui, isFiveM } from '@/core/nui';
import { buildDevHolders, buildDevMarket, type Asset, type Holders, type Market } from './data';
import { apiCall, apiData } from '@/core/api';

export interface TradeResult { success: boolean; message?: string; cash?: number }

const DEV_COMMISSION = 0.005;
const DEV_MIN = 1;

const DEV_LIQUIDITY = 2_000_000;
const DEV_IMPACT_SCALE = 0.5;
const DEV_MAX_IMPACT = 0.5;

function applyDevImpact(a: Asset, value: number, isBuy: boolean) {
    if (value <= 0) return;
    const impact = Math.min(DEV_MAX_IMPACT, (DEV_IMPACT_SCALE * value) / DEV_LIQUIDITY);
    a.price = Math.max(0.01, a.price * (1 + (isBuy ? impact : -impact)));
    a.history = [...a.history, a.price].slice(-48);
    a.changePct = a.history[0] ? (a.price - a.history[0]) / a.history[0] : a.changePct;
}

let dev: Market | null = null;
function devState(): Market {
    if (!dev) dev = buildDevMarket();
    return dev;
}
function devAsset(symbol: string): Asset | undefined {
    return devState().assets.find(a => a.symbol === symbol);
}
function clone(m: Market): Market {
    return JSON.parse(JSON.stringify(m)) as Market;
}

export async function fetchMarket(): Promise<Market> {
    if (!isFiveM) return clone(devState());
    return (await apiData<Market>('sd-phone:stocks:market')) ?? { assets: [], cash: 0 };
}

export function watchMarket(on: boolean): void {
    if (isFiveM) void fetchNui('sd-phone:stocks:watch', { on });
}

export async function fetchHolders(symbol: string): Promise<Holders> {
    if (!isFiveM) {
        const a = devAsset(symbol);
        return buildDevHolders(symbol, a?.units ?? 0, a?.price ?? 1);
    }
    return (await apiData<Holders>('sd-phone:stocks:holders', { symbol }))
        ?? { holders: [], investorCount: 0, supply: 0, topPlayerPct: 0, whaleThreshold: 1 };
}

export async function deposit(amount: number): Promise<TradeResult> {
    if (!isFiveM) {
        if (amount < DEV_MIN) return { success: false, message: 'Enter a valid amount' };
        devState().cash += amount;
        return { success: true, cash: devState().cash };
    }
    const r = await apiCall<{ cash: number }>('sd-phone:stocks:deposit', { amount });
    return { success: r.success, message: r.message, cash: r.data?.cash };
}

export async function withdraw(amount: number): Promise<TradeResult> {
    if (!isFiveM) {
        if (amount < DEV_MIN) return { success: false, message: 'Enter a valid amount' };
        if (devState().cash < amount) return { success: false, message: 'Insufficient brokerage cash' };
        devState().cash -= amount;
        return { success: true, cash: devState().cash };
    }
    const r = await apiCall<{ cash: number }>('sd-phone:stocks:withdraw', { amount });
    return { success: r.success, message: r.message, cash: r.data?.cash };
}

export async function buy(symbol: string, amount: number): Promise<TradeResult> {
    if (!isFiveM) {
        const a = devAsset(symbol);
        if (!a) return { success: false, message: 'Unknown asset' };
        if (amount < DEV_MIN) return { success: false, message: 'Enter a valid amount' };
        const fee = Math.round(amount * DEV_COMMISSION);
        const total = amount + fee;
        if (devState().cash < total) return { success: false, message: 'Insufficient brokerage cash' };
        const units = amount / a.price;
        const newQty = a.units + units;
        a.avgCost = newQty > 0 ? (a.units * a.avgCost + amount) / newQty : a.price;
        a.units = newQty;
        devState().cash -= total;
        applyDevImpact(a, amount, true);
        return { success: true, cash: devState().cash };
    }
    const r = await apiCall<{ cash: number }>('sd-phone:stocks:buy', { symbol, amount });
    return { success: r.success, message: r.message, cash: r.data?.cash };
}

export async function sell(symbol: string, opts: { amount?: number; all?: boolean }): Promise<TradeResult> {
    if (!isFiveM) {
        const a = devAsset(symbol);
        if (!a) return { success: false, message: 'Unknown asset' };
        if (a.units <= 0) return { success: false, message: "You don't own any" };
        const unitsToSell = opts.all ? a.units : Math.min((opts.amount ?? 0) / a.price, a.units);
        if (unitsToSell <= 0) return { success: false, message: 'Enter a valid amount' };
        const gross = unitsToSell * a.price;
        const net = Math.round(gross - Math.round(gross * DEV_COMMISSION));
        a.units = Math.max(0, a.units - unitsToSell);
        if (a.units < 1e-8) { a.units = 0; a.avgCost = 0; }
        devState().cash += net;
        applyDevImpact(a, gross, false);
        return { success: true, cash: devState().cash };
    }
    const r = await apiCall<{ cash: number }>('sd-phone:stocks:sell', { symbol, amount: opts.amount, all: opts.all });
    return { success: r.success, message: r.message, cash: r.data?.cash };
}
