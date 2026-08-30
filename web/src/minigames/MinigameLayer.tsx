import { useCallback, useEffect, useRef, useState } from 'react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { closeMinigame, syncMinigame } from './minigamesApi';
import { EXIT_MS, setAccent } from './panel';
import { MINIGAMES } from './registry';
import type { MinigameStart } from './data';

export function MinigameLayer() {
    const [round, setRound]     = useState<MinigameStart | null>(null);
    const [leaving, setLeaving] = useState(false);
    const timer = useRef<number | undefined>(undefined);

    const clear = useCallback(() => {
        if (timer.current !== undefined) window.clearTimeout(timer.current);
        timer.current = undefined;
    }, []);

    useEffect(() => clear, [clear]);

    useEffect(() => {
        let cancelled = false;
        void syncMinigame().then(res => {
            if (!cancelled && res?.round) {
                setAccent(res.round.gameId);
                setRound(prev => prev ?? res.round ?? null);
            }
        });
        return () => { cancelled = true; };
    }, []);

    useNuiEvent('sd-phone:minigames:start', data => {
        if (data) setAccent(data.gameId);
        clear();
        setLeaving(false);
        setRound(data ?? null);
    });

    useNuiEvent('sd-phone:minigames:stop', () => {
        setLeaving(true);
        clear();
        timer.current = window.setTimeout(() => { setRound(null); setLeaving(false); }, EXIT_MS);
    });

    const done = useCallback(() => {
        setLeaving(true);
        clear();
        timer.current = window.setTimeout(() => { void closeMinigame(); }, EXIT_MS);
    }, [clear]);

    if (!round) return null;

    const Game = MINIGAMES[round.gameId];
    if (!Game) return null;

    return <Game key={round.roundId} start={round} leaving={leaving} onDone={done} />;
}
