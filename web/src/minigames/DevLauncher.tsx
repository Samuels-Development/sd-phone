import { useState } from 'react';

import { devSecret, devStartMinigame } from './devHarness';
import { MINIGAMES } from './registry';

export function DevLauncher() {
    const [secret, setSecret] = useState<number[]>([]);

    function launch(gameId: string) {
        devStartMinigame(gameId);
        window.setTimeout(() => setSecret(devSecret()), 0);
    }

    return (
        <div className="fixed bottom-3 left-3 z-[99999] flex max-w-[330px] flex-col items-start gap-1.5 rounded-lg bg-black/80 p-2 font-sf ring-1 ring-white/20">
            <span className="px-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/45">Minigames</span>
            <div className="flex flex-wrap gap-1.5">
                {Object.keys(MINIGAMES).map(gameId => (
                    <button
                        key={gameId}
                        type="button"
                        onClick={() => launch(gameId)}
                        className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold capitalize text-white ring-1 ring-white/15 hover:bg-white/20"
                    >
                        {gameId}
                    </button>
                ))}
            </div>
            {secret.length > 0 && (
                <span className="px-0.5 font-mono text-[10.5px] text-[#AF52DE]">answer {secret.join(' ')}</span>
            )}
        </div>
    );
}
