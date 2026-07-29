import type { WidgetSize, WidgetPlacement } from '@/apps/appstore/appsApi';

const COLS = 4;
const ROWS = 6;

export const SPAN: Record<WidgetSize, { w: number; h: number }> = {
    sm: { w: 2, h: 2 },
    md: { w: 4, h: 2 },
    lg: { w: 4, h: 4 },
};

const ICON = 78;
const COL_STRIDE = 102;
const ROW_STRIDE = 122;

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

export function reflowAround(
    slots: (string | null)[],
    widgets: WidgetPlacement[],
    itemsPerPage: number,
): (string | null)[] {
    const covered = new Map<number, Set<number>>();
    for (const w of widgets) {
        const set = covered.get(w.page) ?? new Set<number>();
        for (const c of coveredCells(w)) set.add(c);
        covered.set(w.page, set);
    }

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
