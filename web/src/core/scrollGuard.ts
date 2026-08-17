const hiddenAxis = new WeakMap<Element, { y: boolean; x: boolean }>();

function axes(el: Element): { y: boolean; x: boolean } {
    const cached = hiddenAxis.get(el);
    if (cached) return cached;
    const s = getComputedStyle(el);
    const value = { y: s.overflowY === 'hidden', x: s.overflowX === 'hidden' };
    hiddenAxis.set(el, value);
    return value;
}

export function installScrollGuard(): void {
    document.addEventListener('scroll', event => {
        const el = event.target as HTMLElement | null;
        if (!el || el === (document as unknown as HTMLElement) || !el.getBoundingClientRect) return;
        if (el.scrollTop === 0 && el.scrollLeft === 0) return;

        const { y, x } = axes(el);
        if (y && el.scrollTop !== 0) el.scrollTop = 0;
        if (x && el.scrollLeft !== 0) el.scrollLeft = 0;
    }, true);
}
