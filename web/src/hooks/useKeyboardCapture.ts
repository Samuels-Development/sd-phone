import { useEffect } from 'react';

import { fetchNui, isFiveM } from '@/core/nui';
import { useDeckActive } from '@/shell/deckActive';

let fullHolders = 0;
let numericHolders = 0;

function sync(): void {
    if (!isFiveM) return;
    const typing  = fullHolders > 0 || numericHolders > 0;
    const numeric = fullHolders === 0 && numericHolders > 0;
    void fetchNui('sd-phone:typing', { typing, numeric });
}

function acquire(numeric: boolean): void {
    if (numeric) numericHolders += 1;
    else fullHolders += 1;
    sync();
}

function release(numeric: boolean): void {
    if (numeric) numericHolders = Math.max(0, numericHolders - 1);
    else fullHolders = Math.max(0, fullHolders - 1);
    sync();
}

export function isKeyboardCaptured(): boolean {
    return fullHolders + numericHolders > 0;
}

export function useKeyboardCapture(enabled = true, numeric = false): void {
    const deckActive = useDeckActive();
    const on = enabled && deckActive;

    useEffect(() => {
        if (!on) return;
        acquire(numeric);
        return () => release(numeric);
    }, [on, numeric]);
}
