
export function ancestorZoom(el: HTMLElement | null): number {
    let z = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const cz = parseFloat(getComputedStyle(n).getPropertyValue('zoom'));
        if (cz > 0 && cz !== 1) z *= cz;
    }
    return z || 1;
}

interface Box { left: number; top: number; width: number; height: number }

export function toLocal(clientX: number, clientY: number, rect: Box, width: number, height: number, zoom: number) {
    const w = width || rect.width || 1;
    const h = height || rect.height || 1;
    const fx = (rect.width || w) / w / zoom;
    const fy = (rect.height || h) / h / zoom;
    return {
        x: (clientX * fx - rect.left) * (w / (rect.width || w)),
        y: (clientY * fy - rect.top) * (h / (rect.height || h)),
    };
}

export function localPoint(el: HTMLElement, clientX: number, clientY: number) {
    return toLocal(clientX, clientY, el.getBoundingClientRect(), el.offsetWidth, el.offsetHeight, ancestorZoom(el));
}

export function trackFraction(el: HTMLElement, clientX: number): number | null {
    const r = el.getBoundingClientRect();
    const w = el.offsetWidth;
    if (w <= 0 || r.width <= 0) return null;
    const factor = (r.width / w) / ancestorZoom(el);
    const f = Math.max(0, Math.min(1, (clientX * factor - r.left) / r.width));
    return getComputedStyle(el).direction === 'rtl' ? 1 - f : f;
}

export function trackFractionY(el: HTMLElement, clientY: number): number | null {
    const r = el.getBoundingClientRect();
    const h = el.offsetHeight;
    if (h <= 0 || r.height <= 0) return null;
    const factor = (r.height / h) / ancestorZoom(el);
    return Math.max(0, Math.min(1, (clientY * factor - r.top) / r.height));
}
