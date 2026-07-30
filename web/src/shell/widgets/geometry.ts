import { device } from '@device';
import { freeCellNear } from '../dockMoves';
import type { WidgetSize, WidgetPlacement } from '@/apps/appstore/appsApi';

// The same destructure the homescreen does. A widget's cells have to index the SAME number space
// the icons are drawn in, so both sides must read the grid from the profile rather than inline it.
const { cols: COLS, rows: ROWS, icon: ICON, colStride: COL_STRIDE, rowStride: ROW_STRIDE } = device.screen.grid;

export const SPAN: Record<WidgetSize, { w: number; h: number }> = {
    sm: { w: 2, h: 2 },
    md: { w: 4, h: 2 },
    lg: { w: 4, h: 4 },
};

export function widgetPx(size: WidgetSize, scale = 1): { width: number; height: number } {
    const { w, h } = SPAN[size];
    return {
        width:  Math.round((w * ICON + (w - 1) * (COL_STRIDE - ICON)) * scale),
        height: Math.round((h * ICON + (h - 1) * (ROW_STRIDE - ICON)) * scale),
    };
}

const JIGGLE_SWEEP_PX = 3;

export function jiggleDeg(size: WidgetSize): number {
    const { width, height } = widgetPx(size);
    const halfDiagonal = Math.hypot(width, height) / 2;
    const deg = (Math.asin(Math.min(1, JIGGLE_SWEEP_PX / halfDiagonal)) * 180) / Math.PI;
    return Math.round(deg * 100) / 100;
}

export function coveredCells(w: Pick<WidgetPlacement, 'size' | 'col' | 'row'>): number[] {
    const { w: sw, h: sh } = SPAN[w.size];
    const out: number[] = [];
    for (let r = w.row; r < w.row + sh; r++) {
        for (let c = w.col; c < w.col + sw; c++) {
            if (r < ROWS && c < COLS) out.push(r * COLS + c);
        }
    }
    return out;
}

export function firstFit(
    size: WidgetSize,
    page: number,
    slots: (string | null)[],
    widgets: WidgetPlacement[],
    itemsPerPage: number,
): { col: number; row: number } | null {
    const blocked = new Set<number>();

    const base = page * itemsPerPage;
    for (let i = 0; i < itemsPerPage; i++) {
        if (slots[base + i]) blocked.add(i);
    }
    for (const w of widgets) {
        if (w.page === page) coveredCells(w).forEach(c => blocked.add(c));
    }

    const { w: sw, h: sh } = SPAN[size];
    for (let row = 0; row + sh <= ROWS; row++) {
        for (let col = 0; col + sw <= COLS; col++) {
            const cells = coveredCells({ size, col, row });
            if (cells.every(c => !blocked.has(c))) return { col, row };
        }
    }
    return null;
}

type Placed = Pick<WidgetPlacement, 'size' | 'col' | 'row'>;

export function fitsGrid(w: Placed): boolean {
    const { w: sw, h: sh } = SPAN[w.size];
    return w.col >= 0 && w.row >= 0 && w.col + sw <= COLS && w.row + sh <= ROWS;
}

function overlaps(a: Placed, b: Placed): boolean {
    const cells = new Set(coveredCells(a));
    return coveredCells(b).some(c => cells.has(c));
}

export function trySwap(
    widgets: WidgetPlacement[],
    draggedUid: string,
    target: { page: number; col: number; row: number },
): WidgetPlacement[] | null {
    const dragged = widgets.find(w => w.uid === draggedUid);
    if (!dragged) return null;

    const landing: Placed = { size: dragged.size, col: target.col, row: target.row };
    const hit = widgets.filter(o => o.uid !== draggedUid && o.page === target.page && overlaps(o, landing));
    if (hit.length !== 1) return null;

    const partner = hit[0];
    const nextDragged = { ...dragged, page: target.page, col: target.col, row: target.row };
    const nextPartner = { ...partner, page: dragged.page, col: dragged.col, row: dragged.row };
    if (!fitsGrid(nextDragged) || !fitsGrid(nextPartner)) return null;
    if (nextDragged.page === nextPartner.page && overlaps(nextDragged, nextPartner)) return null;

    for (const o of widgets) {
        if (o.uid === draggedUid || o.uid === partner.uid) continue;
        if (o.page === nextDragged.page && overlaps(o, nextDragged)) return null;
        if (o.page === nextPartner.page && overlaps(o, nextPartner)) return null;
    }

    return widgets.map(w => {
        if (w.uid === draggedUid) return nextDragged;
        if (w.uid === partner.uid) return nextPartner;
        return w;
    });
}

export function pageMoves(
    before: (string | null)[],
    after: (string | null)[],
    itemsPerPage: number,
): { count: number; page: number } {
    const was = new Map<string, number>();
    before.forEach((id, i) => {
        if (id !== null) was.set(id, Math.floor(i / itemsPerPage));
    });

    let count = 0;
    let page = 0;
    after.forEach((id, i) => {
        if (id === null) return;
        const from = was.get(id);
        if (from === undefined) return;
        const to = Math.floor(i / itemsPerPage);
        if (to === from) return;
        count++;
        if (to > page) page = to;
    });

    return count ? { count, page } : { count: 0, page: 0 };
}

export function landingCell(
    slots: (string | null)[],
    covered: Set<number> | undefined,
    page: number,
    cell: number,
    itemsPerPage: number,
): number | null {
    const base = page * itemsPerPage;
    if (!covered?.has(cell)) return base + cell;

    const local = freeCellNear(slots.slice(base, base + itemsPerPage), covered, cell);
    return local === null ? null : base + local;
}

function coveredByPage(widgets: WidgetPlacement[]): Map<number, Set<number>> {
    const covered = new Map<number, Set<number>>();
    for (const w of widgets) {
        const set = covered.get(w.page) ?? new Set<number>();
        for (const c of coveredCells(w)) set.add(c);
        covered.set(w.page, set);
    }
    return covered;
}

export function placeNewApps(
    slots: (string | null)[],
    ids: string[],
    widgets: WidgetPlacement[],
    itemsPerPage: number,
): (string | null)[] {
    if (!ids.length) return slots;

    const covered = coveredByPage(widgets);
    const out = [...slots];
    let cell = 0;

    const taken = (c: number) => out[c] !== null && out[c] !== undefined;
    const hidden = (c: number) => !!covered.get(Math.floor(c / itemsPerPage))?.has(c % itemsPerPage);

    for (const id of ids) {
        while (taken(cell) || hidden(cell)) cell++;
        while (out.length <= cell) out.push(null);
        out[cell] = id;
        cell++;
    }

    while (out.length % itemsPerPage !== 0) out.push(null);
    return out;
}

export function reflowAround(
    slots: (string | null)[],
    widgets: WidgetPlacement[],
    itemsPerPage: number,
): (string | null)[] {
    const covered = coveredByPage(widgets);

    const out: (string | null)[] = slots.map(() => null);
    let cell = 0;
    for (const id of slots) {
        if (id === null) continue;
        while (covered.get(Math.floor(cell / itemsPerPage))?.has(cell % itemsPerPage)) cell++;
        while (out.length <= cell) out.push(null);
        out[cell] = id;
        cell++;
    }
    while (out.length % itemsPerPage !== 0) out.push(null);
    return out;
}
