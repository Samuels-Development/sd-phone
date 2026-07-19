import { isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { apiCall, apiData } from '@/core/api';
import { writeJson } from '@/lib/storage';

export interface ChipState { chips: number; bank: number }

const CHIP_KEY = 'sd-phone:casino-chips:v1';
const BANK_KEY = 'sd-phone:casino-bank:v1';

function devRead(): ChipState {
    const chips = Math.max(0, Number(localStorage.getItem(CHIP_KEY) ?? '2000') || 0);
    const bank  = Math.max(0, Number(localStorage.getItem(BANK_KEY) ?? '50000') || 0);
    return { chips, bank };
}
function devWrite(s: ChipState) { writeJson(CHIP_KEY, s.chips); writeJson(BANK_KEY, s.bank); }

export async function loadChips(): Promise<ChipState> {
    if (!isFiveM) return devRead();
    return (await apiData<ChipState>('sd-phone:games:chipsGet')) ?? { chips: 0, bank: 0 };
}

export async function buyChips(amount: number, game: string): Promise<{ ok: boolean; state?: ChipState; message?: string }> {
    if (!isFiveM) {
        const s = devRead();
        if (s.bank < amount) return { ok: false, message: t('games.notEnoughMoneyBank', 'Not enough money in the bank') };
        const ns = { chips: s.chips + amount, bank: s.bank - amount }; devWrite(ns);
        return { ok: true, state: ns };
    }
    const r = await apiCall<ChipState>('sd-phone:games:chipsBuy', { amount, game });
    return r.success && r.data ? { ok: true, state: r.data } : { ok: false, message: r.message };
}

export async function sellChips(amount: number, game: string): Promise<{ ok: boolean; state?: ChipState; message?: string }> {
    if (!isFiveM) {
        const s = devRead();
        if (s.chips < amount) return { ok: false, message: t('games.notEnoughChips', 'Not enough chips') };
        const ns = { chips: s.chips - amount, bank: s.bank + amount }; devWrite(ns);
        return { ok: true, state: ns };
    }
    const r = await apiCall<ChipState>('sd-phone:games:chipsSell', { amount, game });
    return r.success && r.data ? { ok: true, state: r.data } : { ok: false, message: r.message };
}
