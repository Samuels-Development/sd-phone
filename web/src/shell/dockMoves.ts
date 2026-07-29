export const DOCK_MAX = 4;

export function insertIntoDock(dock: string[], id: string, index: number, max: number = DOCK_MAX): { dock: string[]; displaced: string | null } {
    const rest = dock.filter(x => x !== id);
    if (rest.length < max) {
        const at = Math.max(0, Math.min(rest.length, index));
        const next = [...rest];
        next.splice(at, 0, id);
        return { dock: next, displaced: null };
    }
    const at = Math.max(0, Math.min(rest.length - 1, index));
    const next = [...rest];
    const displaced = next[at] ?? null;
    next[at] = id;
    return { dock: next, displaced };
}

export function freeCellNear(cells: (string | null)[], covered: Set<number>, from: number): number | null {
    const usable = (c: number) => c >= 0 && c < cells.length && !covered.has(c) && cells[c] === null;
    if (usable(from)) return from;
    for (let d = 1; d < cells.length; d++) {
        if (usable(from - d)) return from - d;
        if (usable(from + d)) return from + d;
    }
    return null;
}
