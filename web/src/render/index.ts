import { fetchNui, isFiveM } from '@/core/nui';
import type { GameRender, GameViewMode } from './GameRender';

export { PORTRAIT_CROP } from './crop';
export type { GameRender } from './GameRender';

let loader: Promise<GameRender | null> | null = null;

const GAME_VIEW_MODES: readonly GameViewMode[] = ['off', 'probe', 'force'];

async function fetchGameViewMode(): Promise<GameViewMode> {
    const res = await fetchNui<{ mode?: string }>('sd-phone:render:gameViewMode').catch(() => null);
    const mode = res?.mode as GameViewMode | undefined;
    return mode && GAME_VIEW_MODES.includes(mode) ? mode : 'off';
}

export function getGameRender(): Promise<GameRender | null> {
    if (!isFiveM) return Promise.resolve(null);
    if (!loader) {
        loader = Promise.all([import('./GameRender'), fetchGameViewMode()])
            .then(([m, mode]) => new m.GameRender(mode))
            .catch(() => null);
    }
    return loader;
}
