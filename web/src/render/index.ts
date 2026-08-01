import { isFiveM } from '@/core/nui';
import type { GameRender } from './GameRender';

export { PORTRAIT_CROP } from './crop';
export type { GameRender } from './GameRender';

let loader: Promise<GameRender | null> | null = null;

// Lazy singleton: the three fork chunk is only fetched, and the WebGL context
// only created, the first time a camera surface actually opens. Resolves null
// outside FiveM (dev browser) — callers already handle the feed being absent.
export function getGameRender(): Promise<GameRender | null> {
    if (!isFiveM) return Promise.resolve(null);
    if (!loader) {
        loader = import('./GameRender')
            .then((m) => new m.GameRender())
            .catch(() => null);
    }
    return loader;
}
