
export type Piece = 'P'|'N'|'B'|'R'|'Q'|'K'|'p'|'n'|'b'|'r'|'q'|'k';
export type Color = 'w' | 'b';
export type Board = (Piece | null)[];

interface Castling { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean }
export interface GameState {
    board:    Board;
    turn:     Color;
    castling: Castling;
    ep:       number | null;
}

export interface Move {
    from:  number;
    to:    number;
    promo?: 'Q' | 'R' | 'B' | 'N';
    flag?: 'ep' | 'castle' | '2pawn';
}

export type Status = 'playing' | 'check' | 'checkmate' | 'stalemate';

const INITIAL: Board = [
    'r','n','b','q','k','b','n','r',
    'p','p','p','p','p','p','p','p',
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    null,null,null,null,null,null,null,null,
    'P','P','P','P','P','P','P','P',
    'R','N','B','Q','K','B','N','R',
];

export function initialState(): GameState {
    return { board: INITIAL.slice(), turn: 'w', castling: { wK: true, wQ: true, bK: true, bQ: true }, ep: null };
}

const row = (sq: number) => sq >> 3;
const col = (sq: number) => sq & 7;
export const colorOf = (p: Piece): Color => (p >= 'A' && p <= 'Z' ? 'w' : 'b');
const isWhite = (p: Piece) => p <= 'Z';
const enemy   = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const sameColor = (p: Piece | null, c: Color) => p !== null && colorOf(p) === c;

const KNIGHT_D: [number, number][] = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KING_D:   [number, number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DIAG:     [number, number][] = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ORTHO:    [number, number][] = [[-1,0],[1,0],[0,-1],[0,1]];

const onBoard = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

export function findKing(board: Board, c: Color): number {
    const k: Piece = c === 'w' ? 'K' : 'k';
    for (let i = 0; i < 64; i++) if (board[i] === k) return i;
    return -1;
}

function isAttacked(board: Board, sq: number, by: Color): boolean {
    const r = row(sq), c = col(sq);

    if (by === 'w') {
        if (onBoard(r + 1, c - 1) && board[(r + 1) * 8 + c - 1] === 'P') return true;
        if (onBoard(r + 1, c + 1) && board[(r + 1) * 8 + c + 1] === 'P') return true;
    } else {
        if (onBoard(r - 1, c - 1) && board[(r - 1) * 8 + c - 1] === 'p') return true;
        if (onBoard(r - 1, c + 1) && board[(r - 1) * 8 + c + 1] === 'p') return true;
    }

    const N: Piece = by === 'w' ? 'N' : 'n';
    for (const [dr, dc] of KNIGHT_D) {
        if (onBoard(r + dr, c + dc) && board[(r + dr) * 8 + c + dc] === N) return true;
    }

    const K: Piece = by === 'w' ? 'K' : 'k';
    for (const [dr, dc] of KING_D) {
        if (onBoard(r + dr, c + dc) && board[(r + dr) * 8 + c + dc] === K) return true;
    }

    const B: Piece = by === 'w' ? 'B' : 'b';
    const R: Piece = by === 'w' ? 'R' : 'r';
    const Q: Piece = by === 'w' ? 'Q' : 'q';
    for (const [dr, dc] of DIAG) {
        let rr = r + dr, cc = c + dc;
        while (onBoard(rr, cc)) {
            const p = board[rr * 8 + cc];
            if (p) { if (p === B || p === Q) return true; break; }
            rr += dr; cc += dc;
        }
    }
    for (const [dr, dc] of ORTHO) {
        let rr = r + dr, cc = c + dc;
        while (onBoard(rr, cc)) {
            const p = board[rr * 8 + cc];
            if (p) { if (p === R || p === Q) return true; break; }
            rr += dr; cc += dc;
        }
    }
    return false;
}

function inCheck(state: GameState, c: Color): boolean {
    return isAttacked(state.board, findKing(state.board, c), enemy(c));
}

function genPseudo(state: GameState, c: Color): Move[] {
    const { board } = state;
    const moves: Move[] = [];
    const pushPawn = (from: number, to: number, flag?: Move['flag']) => {
        if (row(to) === 0 || row(to) === 7) {
            (['Q','R','B','N'] as const).forEach(promo => moves.push({ from, to, promo }));
        } else {
            moves.push({ from, to, flag });
        }
    };

    for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p || colorOf(p) !== c) continue;
        const r = row(sq), cc = col(sq);
        const kind = p.toUpperCase();

        if (kind === 'P') {
            const dir = c === 'w' ? -1 : 1;
            const startRow = c === 'w' ? 6 : 1;
            const one = (r + dir) * 8 + cc;
            if (onBoard(r + dir, cc) && board[one] === null) {
                pushPawn(sq, one);
                const two = (r + 2 * dir) * 8 + cc;
                if (r === startRow && board[two] === null) moves.push({ from: sq, to: two, flag: '2pawn' });
            }
            for (const dc of [-1, 1]) {
                const tr = r + dir, tcc = cc + dc;
                if (!onBoard(tr, tcc)) continue;
                const t = tr * 8 + tcc;
                if (board[t] && colorOf(board[t]!) !== c) pushPawn(sq, t);
                else if (t === state.ep) moves.push({ from: sq, to: t, flag: 'ep' });
            }
        } else if (kind === 'N') {
            for (const [dr, dc] of KNIGHT_D) {
                if (!onBoard(r + dr, cc + dc)) continue;
                const t = (r + dr) * 8 + cc + dc;
                if (!sameColor(board[t], c)) moves.push({ from: sq, to: t });
            }
        } else if (kind === 'K') {
            for (const [dr, dc] of KING_D) {
                if (!onBoard(r + dr, cc + dc)) continue;
                const t = (r + dr) * 8 + cc + dc;
                if (!sameColor(board[t], c)) moves.push({ from: sq, to: t });
            }
            const opp = enemy(c);
            if (c === 'w' && sq === 60) {
                if (state.castling.wK && board[61] === null && board[62] === null && board[63] === 'R'
                    && !isAttacked(board, 60, opp) && !isAttacked(board, 61, opp) && !isAttacked(board, 62, opp))
                    moves.push({ from: 60, to: 62, flag: 'castle' });
                if (state.castling.wQ && board[59] === null && board[58] === null && board[57] === null && board[56] === 'R'
                    && !isAttacked(board, 60, opp) && !isAttacked(board, 59, opp) && !isAttacked(board, 58, opp))
                    moves.push({ from: 60, to: 58, flag: 'castle' });
            } else if (c === 'b' && sq === 4) {
                if (state.castling.bK && board[5] === null && board[6] === null && board[7] === 'r'
                    && !isAttacked(board, 4, opp) && !isAttacked(board, 5, opp) && !isAttacked(board, 6, opp))
                    moves.push({ from: 4, to: 6, flag: 'castle' });
                if (state.castling.bQ && board[3] === null && board[2] === null && board[1] === null && board[0] === 'r'
                    && !isAttacked(board, 4, opp) && !isAttacked(board, 3, opp) && !isAttacked(board, 2, opp))
                    moves.push({ from: 4, to: 2, flag: 'castle' });
            }
        } else {
            const rays = kind === 'B' ? DIAG : kind === 'R' ? ORTHO : [...DIAG, ...ORTHO];
            for (const [dr, dc] of rays) {
                let rr = r + dr, ccc = cc + dc;
                while (onBoard(rr, ccc)) {
                    const t = rr * 8 + ccc;
                    if (board[t] === null) moves.push({ from: sq, to: t });
                    else { if (colorOf(board[t]!) !== c) moves.push({ from: sq, to: t }); break; }
                    rr += dr; ccc += dc;
                }
            }
        }
    }
    return moves;
}

export function makeMove(state: GameState, move: Move): GameState {
    const board = state.board.slice();
    const piece = board[move.from]!;
    const c = colorOf(piece);
    board[move.from] = null;

    if (move.flag === 'ep') board[row(move.from) * 8 + col(move.to)] = null;

    if (move.flag === 'castle') {
        if (move.to === 62)      { board[61] = board[63]; board[63] = null; }
        else if (move.to === 58) { board[59] = board[56]; board[56] = null; }
        else if (move.to === 6)  { board[5] = board[7];  board[7] = null; }
        else if (move.to === 2)  { board[3] = board[0];  board[0] = null; }
    }

    board[move.to] = move.promo ? (c === 'w' ? move.promo : move.promo.toLowerCase() as Piece) : piece;

    const castling = { ...state.castling };
    const touch = (sq: number) => {
        if (sq === 60) { castling.wK = false; castling.wQ = false; }
        if (sq === 4)  { castling.bK = false; castling.bQ = false; }
        if (sq === 63) castling.wK = false;
        if (sq === 56) castling.wQ = false;
        if (sq === 7)  castling.bK = false;
        if (sq === 0)  castling.bQ = false;
    };
    touch(move.from); touch(move.to);

    const ep = move.flag === '2pawn' ? (move.from + move.to) / 2 : null;
    return { board, turn: enemy(c), castling, ep };
}

function legalMoves(state: GameState, c: Color = state.turn): Move[] {
    return genPseudo(state, c).filter(m => !isAttacked(makeMove(state, m).board, findKing(makeMove(state, m).board, c), enemy(c)));
}

export function legalMovesFrom(state: GameState, sq: number): Move[] {
    return legalMoves(state).filter(m => m.from === sq);
}

export function status(state: GameState): Status {
    const moves = legalMoves(state);
    const checked = inCheck(state, state.turn);
    if (moves.length > 0) return checked ? 'check' : 'playing';
    return checked ? 'checkmate' : 'stalemate';
}

const FILES = 'abcdefgh';
function sqName(sq: number): string { return FILES[sq & 7] + (8 - (sq >> 3)); }

export function toSan(state: GameState, move: Move): string {
    const board = state.board;
    const piece = board[move.from]!;
    const kind = piece.toUpperCase();

    if (kind === 'K' && Math.abs((move.to & 7) - (move.from & 7)) === 2) {
        return (move.to & 7) === 6 ? 'O-O' : 'O-O-O';
    }

    const isCapture = board[move.to] !== null || move.flag === 'ep';
    let s: string;
    if (kind === 'P') {
        s = (isCapture ? FILES[move.from & 7] + 'x' : '') + sqName(move.to) + (move.promo ? '=' + move.promo : '');
    } else {
        s = kind;
        const rivals = legalMoves(state).filter(m => m.to === move.to && m.from !== move.from && board[m.from]?.toUpperCase() === kind);
        if (rivals.length > 0) {
            if (!rivals.some(m => (m.from & 7) === (move.from & 7))) s += FILES[move.from & 7];
            else if (!rivals.some(m => (m.from >> 3) === (move.from >> 3))) s += String(8 - (move.from >> 3));
            else s += FILES[move.from & 7] + String(8 - (move.from >> 3));
        }
        s += (isCapture ? 'x' : '') + sqName(move.to);
    }

    const after = status(makeMove(state, move));
    return s + (after === 'checkmate' ? '#' : after === 'check' ? '+' : '');
}

const VAL: Record<string, number> = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
const MATE = 1_000_000;

const PST: Record<string, number[]> = {
    P: [ 0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0 ],
    N: [ -50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50 ],
    B: [ -20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20 ],
    R: [ 0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0 ],
    Q: [ -20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20 ],
    K: [ -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20 ],
};

function evaluate(board: Board): number {
    let s = 0;
    for (let sq = 0; sq < 64; sq++) {
        const p = board[sq];
        if (!p) continue;
        const k = p.toUpperCase();
        const v = VAL[k] + PST[k][isWhite(p) ? sq : sq ^ 56];
        s += isWhite(p) ? v : -v;
    }
    return s;
}

const isKing = (p: Piece | null) => p === 'K' || p === 'k';

function order(board: Board, moves: Move[]): Move[] {
    return moves
        .map(m => {
            const victim = board[m.to];
            const score = victim ? 10 * VAL[victim.toUpperCase()] - VAL[board[m.from]!.toUpperCase()] : 0;
            return { m, score };
        })
        .sort((a, b) => b.score - a.score)
        .map(x => x.m);
}

function negamax(state: GameState, depth: number, alpha: number, beta: number): number {
    if (depth === 0) return state.turn === 'w' ? evaluate(state.board) : -evaluate(state.board);
    let best = -Infinity;
    for (const m of order(state.board, genPseudo(state, state.turn))) {
        if (isKing(state.board[m.to])) return MATE - (10 - depth);
        const score = -negamax(makeMove(state, m), depth - 1, -beta, -alpha);
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
    }
    return best === -Infinity ? (inCheck(state, state.turn) ? -MATE : 0) : best;
}

export type Difficulty = 'easy' | 'medium' | 'hard';
export interface AiOptions { depth: number; blunder: number; }
export const AI: Record<Difficulty, AiOptions> = {
    easy:   { depth: 1, blunder: 0.35 },
    medium: { depth: 2, blunder: 0.08 },
    hard:   { depth: 3, blunder: 0 },
};

export function chooseMove(state: GameState, opts: AiOptions = AI.hard): Move | null {
    const moves = order(state.board, legalMoves(state));
    if (moves.length === 0) return null;
    if (opts.blunder > 0 && Math.random() < opts.blunder) {
        return moves[Math.floor(Math.random() * moves.length)];
    }
    let best = -Infinity;
    let bestMoves: Move[] = [];
    for (const m of moves) {
        const score = -negamax(makeMove(state, m), opts.depth - 1, -Infinity, Infinity);
        if (score > best + 1e-6) { best = score; bestMoves = [m]; }
        else if (score >= best - 1e-6) bestMoves.push(m);
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}
