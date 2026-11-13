import { createContext, useContext } from 'react';

const DeckActiveContext = createContext(true);

export const DeckActiveProvider = DeckActiveContext.Provider;

export function useDeckActive(): boolean {
    return useContext(DeckActiveContext);
}
