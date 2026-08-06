export interface Scrollable {
    scrollTop:    number;
    scrollHeight: number;
    clientHeight: number;
    isConnected:  boolean;
}

const LINE_HEIGHT = 40;
const PAGE_HEIGHT = 400;

const EASE     = 0.2;
const TICK_MS  = 16;
const SETTLE   = 0.5;
const MAX_QUEUE = 3;

function scaled(raw: number, mode?: number): number {
    if (!raw) return 0;
    if (mode === 1) return raw * LINE_HEIGHT;
    if (mode === 2) return raw * PAGE_HEIGHT;
    return raw;
}

export function shiftWheelDelta(e: { shiftKey: boolean; deltaY: number; deltaX: number; deltaMode?: number }): number {
    if (!e.shiftKey) return 0;
    return scaled(e.deltaY || e.deltaX, e.deltaMode);
}

export function wheelDelta(e: { deltaY: number; deltaX: number; deltaMode?: number }): number {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return 0;
    return scaled(e.deltaY, e.deltaMode);
}

export function verticalScrollerFor(start: Element | null, root: Element | null): HTMLElement | null {
    let node: HTMLElement | null = start instanceof HTMLElement ? start : null;
    while (node) {
        const style = getComputedStyle(node);
        if (canScroll(style.overflowX) && node.scrollWidth > node.clientWidth) return null;
        if (canScroll(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
        if (node === root) return null;
        node = node.parentElement;
    }
    return null;
}

function canScroll(overflow: string): boolean {
    return overflow === 'auto' || overflow === 'scroll';
}

let target: Scrollable | null = null;
let goal = 0;
let timer: number | undefined;

function stop(): void {
    if (timer !== undefined) globalThis.clearInterval(timer);
    timer = undefined;
    target = null;
}

export function scrollRange(el: Scrollable): number {
    return Math.max(0, el.scrollHeight - el.clientHeight);
}

export function smoothScrollStep(): void {
    const el = target;
    if (!el || !el.isConnected) {
        stop();
        return;
    }
    const want = Math.max(0, Math.min(goal, scrollRange(el)));
    const diff = want - el.scrollTop;
    if (Math.abs(diff) <= SETTLE) {
        el.scrollTop = want;
        stop();
        return;
    }
    el.scrollTop += diff * EASE;
}

export function smoothScrollBy(el: Scrollable, delta: number): void {
    const range = scrollRange(el);
    if (range <= 0 || !delta) return;

    if (el !== target) {
        target = el;
        goal = el.scrollTop;
    }

    const reach = Math.abs(delta) * MAX_QUEUE;
    const from = Math.max(el.scrollTop - reach, Math.min(el.scrollTop + reach, goal));
    goal = Math.max(0, Math.min(from + delta, range));

    if (el.scrollTop === goal) return;
    if (timer === undefined) timer = globalThis.setInterval(smoothScrollStep, TICK_MS) as unknown as number;
}

export function cancelSmoothScroll(el?: Scrollable): void {
    if (!el || el === target) stop();
}
