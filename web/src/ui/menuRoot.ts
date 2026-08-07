import { createContext, useContext } from 'react';

const MenuRootContext = createContext<HTMLElement | null>(null);

export const MenuRootProvider = MenuRootContext.Provider;

export function useMenuRoot(): HTMLElement | null {
    return useContext(MenuRootContext);
}
