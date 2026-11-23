import { createContext, createElement, useContext } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export function portalToPhoneScreen(node: ReactNode): ReactNode {
    const root = typeof document !== 'undefined'
        ? (document.querySelector('[data-phone-screen]') as HTMLElement | null)
        : null;
    if (!root) return node;
    return createPortal(
        createElement('div', { 'data-motion-app': '1', style: { display: 'contents' } }, node),
        root,
    );
}

/** Where a sheet mounts when it is opened from a surface drawn outside the phone, such as the
 *  panel of a full-screen overlay; null leaves it on the phone screen. */
export const ScreenRootContext = createContext<HTMLElement | null>(null);

/** Mounts a screen-wide layer on the surface it was opened from: the element ScreenRootContext
 *  names, or else the phone screen. */
export function useScreenPortal(): (node: ReactNode) => ReactNode {
    const root = useContext(ScreenRootContext);
    return node => (root ? createPortal(node, root) : portalToPhoneScreen(node));
}
