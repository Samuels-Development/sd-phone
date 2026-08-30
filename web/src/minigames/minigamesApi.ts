import { apiData } from '@/core/api';
import { fetchNui, isFiveM } from '@/core/nui';
import { devAnswerMinigame, devCloseMinigame, devForfeitMinigame, devSyncMinigame } from './devHarness';
import type { MinigameResult, MinigameStart } from './data';

export function answerMinigame<F>(answer: unknown): Promise<MinigameResult<F> | null> {
    if (!isFiveM) return Promise.resolve(devAnswerMinigame<F>(answer));
    return apiData<MinigameResult<F>>('sd-phone:minigames:answer', { answer });
}

export function forfeitMinigame<F>(): Promise<MinigameResult<F> | null> {
    if (!isFiveM) return Promise.resolve(devForfeitMinigame<F>());
    return apiData<MinigameResult<F>>('sd-phone:minigames:forfeit');
}

export function syncMinigame(): Promise<{ round?: MinigameStart } | null> {
    if (!isFiveM) return Promise.resolve(devSyncMinigame());
    return fetchNui<{ round?: MinigameStart }>('sd-phone:minigames:sync');
}

export function closeMinigame(): Promise<unknown> {
    if (!isFiveM) { devCloseMinigame(); return Promise.resolve(null); }
    return fetchNui('sd-phone:minigames:close');
}
