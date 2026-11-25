import { useEffect } from 'react';

import { bgLuma } from '@/lib/contrast';
import { ancestorZoom } from '@/lib/zoom';
import { useThemeStore } from '@/stores/themeStore';

const SETTLE_MS = 160;
const FALLBACK_MS = 2000;
const DARK_BELOW = 0.5;
const FRACS = [0.2, 0.8];

interface ScreenFrame {
    rect: DOMRect;
    kx:   number;
    ky:   number;
}

function readBg(el: Element): number | 'image' | null {
    const cs = getComputedStyle(el);
    return bgLuma(cs.backgroundColor, cs.backgroundImage);
}

function sampleIframe(iframe: HTMLIFrameElement, fx: number, edge: 'top' | 'bottom'): number | 'image' | null {
    try {
        const doc = iframe.contentDocument;
        const root = doc?.documentElement;
        if (!doc || !root) return null;
        const w = root.clientWidth;
        const h = root.clientHeight;
        if (w < 2 || h < 2) return null;
        const ix = Math.max(1, Math.min(w - 1, fx * w));
        const iy = edge === 'top' ? Math.min(24, h * 0.06) : Math.max(1, h - Math.min(16, h * 0.05));
        for (const el of doc.elementsFromPoint(ix, iy)) {
            const v = readBg(el);
            if (v != null) return v;
        }
        return null;
    } catch {
        return null;
    }
}

function lumaAt(cx: number, cy: number, fx: number, edge: 'top' | 'bottom'): number | null {
    for (const el of document.elementsFromPoint(cx, cy)) {
        if (!el.closest('[data-phone-screen]') || el.closest('[inert]')) continue;
        if (el instanceof HTMLIFrameElement) {
            const inner = sampleIframe(el, fx, edge);
            return inner == null || inner === 'image' ? null : inner;
        }
        const v = readBg(el);
        if (v === 'image') return null;
        if (v != null) return v;
    }
    return null;
}

function screenFrame(screen: HTMLElement): ScreenFrame | null {
    const rect = screen.getBoundingClientRect();
    const w = screen.offsetWidth;
    const h = screen.offsetHeight;
    if (!w || !h || rect.width < 2 || rect.height < 2) return null;
    const z = ancestorZoom(screen);
    return { rect, kx: (z * w) / rect.width, ky: (z * h) / rect.height };
}

function sampleStrip(frame: ScreenFrame, edge: 'top' | 'bottom'): boolean | null {
    const fy = edge === 'top' ? 0.03 : 0.985;
    const { rect, kx, ky } = frame;
    let sum = 0;
    let n = 0;
    for (const fx of FRACS) {
        const l = lumaAt((rect.left + fx * rect.width) * kx, (rect.top + fy * rect.height) * ky, fx, edge);
        if (l == null) continue;
        sum += l;
        n += 1;
    }
    if (n === 0) return null;
    return sum / n < DARK_BELOW;
}

export function useAutoContrast(enabled: boolean, sampleKey: string): void {
    useEffect(() => {
        if (!enabled) {
            const st = useThemeStore.getState();
            if (st.statusBarAutoLight !== null || st.homeAutoLight !== null) st.setAutoContrast(null, null);
            return;
        }
        let settle = 0;
        let watched: HTMLElement | null = null;
        const observer = new MutationObserver(() => soon());
        const run = () => {
            window.clearTimeout(settle);
            const screen = document.querySelector('[data-phone-screen]') as HTMLElement | null;
            if (screen !== watched) {
                observer.disconnect();
                watched = screen;
                if (screen) observer.observe(screen, { childList: true, subtree: true });
            }
            if (!screen) return;
            const frame = screenFrame(screen);
            if (!frame) return;
            const top = sampleStrip(frame, 'top');
            const bottom = sampleStrip(frame, 'bottom');
            const st = useThemeStore.getState();
            if (top !== st.statusBarAutoLight || bottom !== st.homeAutoLight) st.setAutoContrast(top, bottom);
        };
        const soon = () => {
            window.clearTimeout(settle);
            settle = window.setTimeout(run, SETTLE_MS);
        };
        run();
        soon();
        document.addEventListener('scroll', soon, true);
        document.addEventListener('animationend', soon, true);
        document.addEventListener('transitionend', soon, true);
        const fallback = window.setInterval(run, FALLBACK_MS);
        return () => {
            window.clearTimeout(settle);
            window.clearInterval(fallback);
            observer.disconnect();
            document.removeEventListener('scroll', soon, true);
            document.removeEventListener('animationend', soon, true);
            document.removeEventListener('transitionend', soon, true);
        };
    }, [enabled, sampleKey]);
}
