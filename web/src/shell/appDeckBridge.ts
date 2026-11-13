
type Listener = () => void;

const cardStages = new Map<string, HTMLElement>();
const listeners  = new Set<Listener>();

let fullscreenStage: HTMLElement | null = null;

export function registerCardStage(id: string, el: HTMLElement | null): void {
    if (el) cardStages.set(id, el);
    else    cardStages.delete(id);
    for (const fn of listeners) fn();
}

export function getCardStage(id: string): HTMLElement | undefined {
    return cardStages.get(id);
}

let splitStage: HTMLElement | null = null;

export function registerFullscreenStage(el: HTMLElement | null): void {
    fullscreenStage = el;
    for (const fn of listeners) fn();
}

export function getFullscreenStage(): HTMLElement | null {
    return fullscreenStage;
}

export function registerSplitStage(el: HTMLElement | null): void {
    splitStage = el;
    for (const fn of listeners) fn();
}

export function getSplitStage(): HTMLElement | null {
    return splitStage;
}

export function subscribeCardStages(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
