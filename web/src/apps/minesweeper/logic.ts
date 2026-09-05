export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultyDef {
    cols: number;
    rows: number;
    mines: number;
    par: number;
    multiplier: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
    easy:   { cols: 9,  rows: 9,  mines: 10, par: 90,  multiplier: 1 },
    medium: { cols: 12, rows: 14, mines: 25, par: 180, multiplier: 2 },
    hard:   { cols: 14, rows: 18, mines: 45, par: 300, multiplier: 3 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

export const HIDDEN = 0;
export const REVEALED = 1;
export const FLAGGED = 2;

export interface Board {
    difficulty: Difficulty;
    cols: number;
    rows: number;
    mines: number;
    mine: boolean[];
    adj: number[];
    state: number[];
    revealed: number;
    flags: number;
    seeded: boolean;
    hit: number;
}

export function emptyBoard(difficulty: Difficulty): Board {
    const def = DIFFICULTIES[difficulty];
    const size = def.cols * def.rows;
    return {
        difficulty,
        cols: def.cols,
        rows: def.rows,
        mines: def.mines,
        mine: new Array<boolean>(size).fill(false),
        adj: new Array<number>(size).fill(0),
        state: new Array<number>(size).fill(HIDDEN),
        revealed: 0,
        flags: 0,
        seeded: false,
        hit: -1,
    };
}

export function neighbours(board: Board, index: number): number[] {
    const { cols, rows } = board;
    const cx = index % cols;
    const cy = Math.floor(index / cols);
    const out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const x = cx + dx;
            const y = cy + dy;
            if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
            out.push(y * cols + x);
        }
    }
    return out;
}

function clone(board: Board): Board {
    return { ...board, mine: [...board.mine], adj: [...board.adj], state: [...board.state] };
}

export function plant(board: Board, safeIndex: number): Board {
    const next = clone(board);
    const size = next.cols * next.rows;
    const banned = new Set<number>([safeIndex, ...neighbours(next, safeIndex)]);

    const pool: number[] = [];
    for (let i = 0; i < size; i++) if (!banned.has(i)) pool.push(i);

    const count = Math.min(next.mines, pool.length);
    for (let i = 0; i < count; i++) {
        const pick = i + Math.floor(Math.random() * (pool.length - i));
        const tmp = pool[i];
        pool[i] = pool[pick];
        pool[pick] = tmp;
        next.mine[pool[i]] = true;
    }

    for (let i = 0; i < size; i++) {
        if (next.mine[i]) { next.adj[i] = 0; continue; }
        let n = 0;
        for (const j of neighbours(next, i)) if (next.mine[j]) n++;
        next.adj[i] = n;
    }

    next.mines = count;
    next.seeded = true;
    return next;
}

function floodFrom(board: Board, start: number): void {
    const stack = [start];
    while (stack.length > 0) {
        const i = stack.pop() as number;
        if (board.state[i] !== HIDDEN) continue;
        board.state[i] = REVEALED;
        board.revealed++;
        if (board.adj[i] !== 0) continue;
        for (const j of neighbours(board, i)) {
            if (board.state[j] === HIDDEN) stack.push(j);
        }
    }
}

export function revealAt(board: Board, index: number): Board {
    if (board.state[index] !== HIDDEN) return board;

    const seeded = board.seeded ? board : plant(board, index);
    const next = clone(seeded);

    if (next.mine[index]) {
        next.state[index] = REVEALED;
        next.hit = index;
        return next;
    }

    floodFrom(next, index);
    return next;
}

export function toggleFlag(board: Board, index: number): Board {
    if (board.state[index] === REVEALED) return board;
    const next = clone(board);
    if (next.state[index] === FLAGGED) {
        next.state[index] = HIDDEN;
        next.flags--;
    } else {
        next.state[index] = FLAGGED;
        next.flags++;
    }
    return next;
}

export function chordAt(board: Board, index: number): Board {
    if (board.state[index] !== REVEALED || board.adj[index] === 0) return board;

    const around = neighbours(board, index);
    let flagged = 0;
    for (const j of around) if (board.state[j] === FLAGGED) flagged++;
    if (flagged !== board.adj[index]) return board;

    let next = clone(board);
    for (const j of around) {
        if (next.state[j] !== HIDDEN) continue;
        if (next.mine[j]) {
            next.state[j] = REVEALED;
            next.hit = j;
            return next;
        }
        floodFrom(next, j);
    }
    if (next.revealed === board.revealed) next = board;
    return next;
}

export function safeCells(board: Board): number {
    return board.cols * board.rows - board.mines;
}

export function isWon(board: Board): boolean {
    return board.seeded && board.hit < 0 && board.revealed >= safeCells(board);
}

export function revealAllMines(board: Board): Board {
    const next = clone(board);
    for (let i = 0; i < next.state.length; i++) {
        if (next.mine[i] && next.state[i] !== FLAGGED) next.state[i] = REVEALED;
    }
    return next;
}

export function flagAllMines(board: Board): Board {
    const next = clone(board);
    let flags = 0;
    for (let i = 0; i < next.state.length; i++) {
        if (next.mine[i]) { next.state[i] = FLAGGED; flags++; }
    }
    next.flags = flags;
    return next;
}

export function minesLeft(board: Board): number {
    return board.mines - board.flags;
}

export function scoreFor(board: Board, seconds: number, won: boolean): number {
    const def = DIFFICULTIES[board.difficulty];
    const base = board.revealed * 10 * def.multiplier;
    if (!won) return base;
    return base + Math.max(0, def.par - seconds) * 5 * def.multiplier;
}

export function formatClock(seconds: number): string {
    const capped = Math.max(0, Math.min(seconds, 59 * 60 + 59));
    const m = Math.floor(capped / 60);
    const s = capped % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}
