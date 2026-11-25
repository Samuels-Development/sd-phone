import { createContext, useContext } from 'react';

const DeckActiveContext = createContext(true);

export const DeckActiveProvider = DeckActiveContext.Provider;

export function useDeckActive(): boolean {
    return useContext(DeckActiveContext);
}

let holds = 0;

export function holdDeck(): () => void {
    holds += 1;
    let held = true;
    return () => {
        if (!held) return;
        held = false;
        holds -= 1;
    };
}

export function deckHeld(): boolean {
    return holds > 0;
}
