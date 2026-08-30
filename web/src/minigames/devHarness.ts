import { bypassOptions, memoryOptions, numberOpts, type CircuitLine, type MazeCell, type MinigameResult, type MinigameStart, type SequencerRule, type SkillcheckGate, type WiresClue } from './data';

interface DevRound {
    start:    MinigameStart;
    secret:   number[];
    map:      Record<number, number>;
    found:    number;
    mistakes: number;
    hits:     number;
    attempts: number;
    openedAt: number;
    traps:    Record<number, number[]>;
    lines:    CircuitLine[];
    rules:    SequencerRule[];
    tiles:    number[];
    lives:    number;
    probes:   number;
    layerAt:  number;
    maze:     number[];
    mazePos:  number;
    mazeKeys: number[];
    mazeGot:  number;
    gates:    SkillcheckGate[];
    cleared:  number;
    pinAt:    number[];
    pinsSet:  number;
    snapped:  number;
    liveWire: number;
    wrongCut: number;
    regs:     number[];
    regDone:  number;
    word:     string;
    scramble: string[];
    seq:      number[];
    matchAt:  number;
}

let round: DevRound | null = null;

function shuffle(from: number, to: number): number[] {
    const pool: number[] = [];
    for (let n = from; n <= to; n += 1) pool.push(n);
    for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool;
}

function pick(count: number, from: number, to: number): number[] {
    return shuffle(from, to).slice(0, count);
}

const NORTH = 1, EAST = 2, SOUTH = 4, WEST = 8;

function spin(mask: number, times: number): number {
    let out = mask;
    for (let i = 0; i < times % 4; i += 1) out = ((out << 1) & 15) | ((out & WEST) >> 3);
    return out;
}

function routerBoard(grid: number): number[] {
    const masks = Array.from({ length: grid * grid }, () => [NORTH | EAST, NORTH | SOUTH, EAST | SOUTH][Math.floor(Math.random() * 3)]!);
    let row = 1, col = 1;
    const path = [1];
    while (row < grid || col < grid) {
        if (col < grid && (row >= grid || Math.random() < 0.5)) col += 1; else row += 1;
        path.push((row - 1) * grid + col);
    }
    masks[path[0]! - 1] = WEST;
    for (let i = 0; i < path.length - 1; i += 1) {
        const from = path[i]!, to = path[i + 1]!;
        const dir = to - from === 1 ? EAST : SOUTH;
        masks[from - 1] = masks[from - 1]! | dir;
        masks[to - 1] = dir === EAST ? WEST : NORTH;
    }
    masks[path[path.length - 1]! - 1] = masks[path[path.length - 1]! - 1]! | EAST;
    return masks.map(m => spin(m, Math.floor(Math.random() * 4)));
}

function routerConnected(tiles: number[], grid: number): boolean {
    if ((tiles[0]! & WEST) === 0) return false;
    const seen = new Set([1]);
    const queue = [1];
    while (queue.length) {
        const cell = queue.pop()!;
        if (cell === grid * grid && (tiles[cell - 1]! & EAST) !== 0) return true;
        const row = Math.floor((cell - 1) / grid), col = (cell - 1) % grid;
        const steps: [number, number, boolean][] = [
            [NORTH, cell - grid, row > 0], [SOUTH, cell + grid, row < grid - 1],
            [WEST, cell - 1, col > 0], [EAST, cell + 1, col < grid - 1],
        ];
        for (const [dir, next, ok] of steps) {
            const back = dir === NORTH ? SOUTH : dir === SOUTH ? NORTH : dir === EAST ? WEST : EAST;
            if (ok && !seen.has(next) && (tiles[cell - 1]! & dir) !== 0 && (tiles[next - 1]! & back) !== 0) {
                seen.add(next); queue.push(next);
            }
        }
    }
    return false;
}

function carveMaze(width: number, height: number): number[] {
    const cells = Array.from({ length: width * height }, () => NORTH | EAST | SOUTH | WEST);
    const seen = new Set([1]);
    const stack: { row: number; col: number }[] = [{ row: 1, col: 1 }];
    const dirs = [
        { bit: NORTH, back: SOUTH, dr: -1, dc: 0 },
        { bit: EAST, back: WEST, dr: 0, dc: 1 },
        { bit: SOUTH, back: NORTH, dr: 1, dc: 0 },
        { bit: WEST, back: EAST, dr: 0, dc: -1 },
    ];

    while (stack.length) {
        const at = stack[stack.length - 1]!;
        const open = dirs.filter(d => {
            const r = at.row + d.dr, c = at.col + d.dc;
            return r >= 1 && r <= height && c >= 1 && c <= width && !seen.has((r - 1) * width + c);
        });
        if (!open.length) { stack.pop(); continue; }
        const d = open[Math.floor(Math.random() * open.length)]!;
        const from = (at.row - 1) * width + at.col;
        const to = (at.row + d.dr - 1) * width + (at.col + d.dc);
        cells[from - 1] = cells[from - 1]! & ~d.bit;
        cells[to - 1] = cells[to - 1]! & ~d.back;
        seen.add(to);
        stack.push({ row: at.row + d.dr, col: at.col + d.dc });
    }
    return cells;
}

function mazeKeys(cells: number[], width: number, height: number, count: number): number[] {
    const last = width * height;
    let reach = Math.max(2, Math.floor((width + height) * 0.34));
    let pool: { cell: number; walls: number; dist: number }[] = [];

    while (reach >= 0) {
        pool = [];
        for (let index = 2; index <= last - 1; index += 1) {
            const dist = Math.floor((index - 1) / width) + ((index - 1) % width);
            if (dist < reach) continue;
            const mask = cells[index - 1]!;
            const walls = [NORTH, EAST, SOUTH, WEST].filter(b => (mask & b) !== 0).length;
            pool.push({ cell: index, walls, dist });
        }
        if (pool.length >= count) break;
        reach -= 2;
    }

    pool.sort((a, b) => (b.walls - a.walls) || (b.dist - a.dist) || (a.cell - b.cell));

    const out: number[] = [];
    for (let i = 0; i < count && pool.length; i += 1) {
        const at = Math.floor(Math.random() * Math.min(4, pool.length));
        out.push(pool[at]!.cell);
        pool.splice(at, 1);
    }
    return out;
}

function mazeSight(cells: number[], pos: number, width: number, height: number, sight: number): MazeCell[] {
    const row = Math.floor((pos - 1) / width) + 1;
    const col = ((pos - 1) % width) + 1;
    const out: MazeCell[] = [];
    for (let r = row - sight; r <= row + sight; r += 1) {
        for (let c = col - sight; c <= col + sight; c += 1) {
            if (r >= 1 && r <= height && c >= 1 && c <= width) {
                const i = (r - 1) * width + c;
                out.push({ i, w: cells[i - 1]! });
            }
        }
    }
    return out;
}

const HEX = '0123456789ABCDEF';

function hexPair(): string {
    return HEX[Math.floor(Math.random() * 16)]! + HEX[Math.floor(Math.random() * 16)]!;
}

const WORDS = ['access', 'backup', 'binary', 'breach', 'bypass', 'cipher', 'client', 'daemon',
    'decode', 'device', 'domain', 'encode', 'kernel', 'keypad', 'memory', 'module', 'packet',
    'proxy', 'router', 'script', 'secure', 'server', 'signal', 'socket', 'system', 'tunnel'];

function scrambleWord(word: string): string[] {
    const letters = word.split('');
    for (let tries = 0; tries < 12; tries += 1) {
        for (let i = letters.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [letters[i], letters[j]] = [letters[j]!, letters[i]!];
        }
        if (letters.join('') !== word) break;
    }
    return letters;
}

function signature(bars: number): number[] {
    return Array.from({ length: bars }, () => Math.floor(Math.random() * 83) + 18);
}

function nudged(source: number[]): number[] {
    const copy = [...source];
    const changes = Math.floor(Math.random() * 2) + 1;
    for (let i = 0; i < changes; i += 1) {
        const at = Math.floor(Math.random() * copy.length);
        const shift = (Math.floor(Math.random() * 17) + 14) * (Math.random() < 0.5 ? 1 : -1);
        copy[at] = Math.min(100, Math.max(10, copy[at]! + shift));
    }
    return copy;
}

function evalLine(line: CircuitLine, on: boolean[]): boolean {
    let a = on[line.a - 1] === true, b = on[line.b - 1] === true;
    if (line.na) a = !a;
    if (line.nb) b = !b;
    return line.gate === 'and' ? a && b : line.gate === 'or' ? a || b : a !== b;
}

function circuitLines(inputs: number, outputs: number): CircuitLine[] {
    for (let tries = 0; tries < 60; tries += 1) {
        const lines: CircuitLine[] = Array.from({ length: outputs }, () => {
            const a = Math.floor(Math.random() * inputs) + 1;
            let b = Math.floor(Math.random() * inputs) + 1;
            while (b === a) b = Math.floor(Math.random() * inputs) + 1;
            return { a, b, na: Math.random() < 0.5, nb: Math.random() < 0.5, gate: ['and', 'or', 'xor'][Math.floor(Math.random() * 3)]! };
        });
        for (let combo = 0; combo < (1 << inputs); combo += 1) {
            const on = Array.from({ length: inputs }, (_, i) => ((combo >> i) & 1) === 1);
            if (lines.every(l => evalLine(l, on))) return lines;
        }
    }
    return [];
}

function neighbourCount(live: number[], cell: number, grid: number): number {
    const row = Math.floor((cell - 1) / grid), col = (cell - 1) % grid;
    let n = 0;
    for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) continue;
            const r = row + dr, c = col + dc;
            if (r >= 0 && r < grid && c >= 0 && c < grid && live.includes(r * grid + c + 1)) n += 1;
        }
    }
    return n;
}

export function devSecret(): number[] {
    if (!round) return [];
    if (round.start.gameId === 'rewire') {
        return Object.keys(round.map).map(k => round!.map[Number(k)]!);
    }
    return round.secret;
}

interface Built {
    options: Record<string, number | boolean>;
    puzzle?: MinigameStart['puzzle'];
    secret:  number[];
    map:     Record<number, number>;
    traps?:  Record<number, number[]>;
    lines?:  CircuitLine[];
    rules?:  SequencerRule[];
    tiles?:  number[];
    maze?:   number[];
    mazeKeys?: number[];
    gates?:  SkillcheckGate[];
    pinAt?:  number[];
    liveWire?: number;
    regs?:   number[];
    word?:   string;
    scramble?: string[];
    seq?:    number[];
    matchAt?: number;
}

function build(gameId: string, params: Record<string, number | boolean>): Built {
    const map: Record<number, number> = {};

    if (gameId === 'skillcheck') {
        const o = numberOpts(params, { rounds: 3, period: 1500, window: 15, shrink: 82, time: 25 });
        const gates: SkillcheckGate[] = Array.from({ length: o.rounds }, () => ({
            at: (Math.floor(Math.random() * 81) + 10) / 100,
            key: Math.floor(Math.random() * 4) + 1,
        }));
        return { options: { ...o }, puzzle: { gates, period: o.period, window: o.window, shrink: o.shrink }, secret: [], map, gates };
    }
    if (gameId === 'lockpick') {
        const o = numberOpts(params, { pins: 3, tolerance: 5, breaks: 3, time: 40 });
        const pinAt = Array.from({ length: o.pins }, () => Math.floor(Math.random() * 89) + 6);
        return { options: { ...o }, puzzle: { pins: o.pins }, secret: pinAt, map, pinAt };
    }
    if (gameId === 'wires') {
        const o = numberOpts(params, { wires: 5, clues: 3, cuts: 1, time: 35 });
        const live = Math.floor(Math.random() * o.wires) + 1;
        const clues: WiresClue[] = [];
        const seen = new Set<string>();
        let guard = 0;
        while (clues.length < o.clues && guard < 60) {
            guard += 1;
            const kind = Math.floor(Math.random() * 3);
            let clue: WiresClue;
            if (kind === 0) {
                let other = Math.floor(Math.random() * o.wires) + 1;
                while (other === live) other = Math.floor(Math.random() * o.wires) + 1;
                clue = { kind: 'notWire', a: other };
            } else if (kind === 1 && live > 1 && live < o.wires) {
                clue = { kind: 'notEnd' };
            } else {
                clue = { kind: live % 2 === 0 ? 'even' : 'odd' };
            }
            const key = clue.kind + (clue.a ?? '');
            if (!seen.has(key)) { seen.add(key); clues.push(clue); }
        }
        return { options: { ...o }, puzzle: { wires: o.wires, clues }, secret: [live], map, liveWire: live };
    }
    if (gameId === 'varhack') {
        const o = numberOpts(params, { columns: 4, rows: 7, mistakes: 2, time: 30 });
        const columns: string[][] = [];
        const regs: number[] = [];
        for (let c = 0; c < o.columns; c += 1) {
            const seen = new Set<string>();
            const list: string[] = [];
            while (list.length < o.rows) {
                const v = hexPair();
                if (!seen.has(v)) { seen.add(v); list.push(v); }
            }
            columns.push(list);
            regs.push(Math.floor(Math.random() * o.rows) + 1);
        }
        const wanted = columns.map((list, c) => list[regs[c]! - 1]!);
        return { options: { ...o }, puzzle: { columns, wanted }, secret: [], map, regs };
    }
    if (gameId === 'scanner') {
        const o = numberOpts(params, { bars: 7, options: 6, attempts: 2, time: 30 });
        const target = signature(o.bars);
        const matchAt = Math.floor(Math.random() * o.options) + 1;
        const lineup = Array.from({ length: o.options }, (_, i) => (i + 1 === matchAt ? target : nudged(target)));
        return { options: { ...o }, puzzle: { target, lineup }, secret: [matchAt], map, matchAt };
    }
    if (gameId === 'anagram') {
        const o = numberOpts(params, { attempts: 3, time: 45 });
        const word = WORDS[Math.floor(Math.random() * WORDS.length)]!;
        const scramble = scrambleWord(word);
        return { options: { ...o }, puzzle: { letters: scramble }, secret: [], map, word, scramble };
    }
    if (gameId === 'simon') {
        const o = numberOpts(params, { pads: 4, length: 5, pace: 520, time: 45 });
        const seq = Array.from({ length: o.length }, () => Math.floor(Math.random() * o.pads) + 1);
        return { options: { ...o }, puzzle: { order: seq, pace: o.pace, pads: o.pads }, secret: seq, map, seq };
    }
    if (gameId === 'maze') {
        const o = numberOpts(params, { width: 12, height: 14, sight: 2, nodes: 3, time: 80 });
        const cells = carveMaze(o.width, o.height);
        const last = o.width * o.height;
        const keys = mazeKeys(cells, o.width, o.height, o.nodes);
        const seen = mazeSight(cells, 1, o.width, o.height, o.sight);
        return {
            options: { ...o },
            puzzle:  {
                width: o.width, height: o.height, sight: o.sight, total: o.nodes, pos: 1, exit: last,
                cells: seen, nodes: keys.filter(k => seen.some(c => c.i === k)),
            },
            secret:  [], map, maze: cells, mazeKeys: keys,
        };
    }
    if (gameId === 'router') {
        const o = numberOpts(params, { grid: 4, time: 45 });
        const tiles = routerBoard(o.grid);
        return { options: { ...o }, puzzle: { grid: o.grid, tiles }, secret: [], map, tiles };
    }
    if (gameId === 'circuit') {
        const o = numberOpts(params, { inputs: 4, outputs: 3, attempts: 3, time: 45 });
        const lines = circuitLines(o.inputs, o.outputs);
        return { options: { ...o }, puzzle: { lines }, secret: [], map, lines };
    }
    if (gameId === 'intrusion') {
        const o = numberOpts(params, { layers: 4, width: 3, traps: 1, probes: 3, lives: 1, time: 40 });
        const traps: Record<number, number[]> = {};
        for (let layer = 1; layer <= o.layers; layer += 1) traps[layer] = pick(o.traps, 1, o.width);
        return { options: { ...o }, puzzle: { layers: o.layers, width: o.width, probes: o.probes }, secret: [], map, traps };
    }
    if (gameId === 'sequencer') {
        const o = numberOpts(params, { steps: 5, rules: 3, time: 45 });
        const order = pick(o.steps, 1, o.steps);
        const place: Record<number, number> = {};
        order.forEach((step, i) => { place[step] = i + 1; });
        const rules: SequencerRule[] = [];
        let guard = 0;
        while (rules.length < o.rules && guard < 200) {
            guard += 1;
            const kind = Math.floor(Math.random() * 3);
            if (kind === 0) {
                const a = Math.floor(Math.random() * o.steps) + 1;
                const b = Math.floor(Math.random() * o.steps) + 1;
                if (place[a]! < place[b]!) rules.push({ kind: 'before', a, b });
            } else if (kind === 1) {
                rules.push({ kind: 'last', a: order[o.steps - 1]! });
            } else {
                const a = Math.floor(Math.random() * o.steps) + 1;
                if (place[a] !== 1) rules.push({ kind: 'notFirst', a });
            }
        }
        return { options: { ...o }, puzzle: { steps: o.steps, rules }, secret: order, map, rules };
    }
    if (gameId === 'sweep') {
        const o = numberOpts(params, { grid: 5, live: 4, mistakes: 1, time: 50 });
        const live = pick(o.live, 1, o.grid * o.grid);
        return { options: { ...o }, puzzle: { grid: o.grid, live: o.live }, secret: live, map };
    }

    if (gameId === 'memory') {
        const o = memoryOptions(params);
        const pattern = pick(o.targets, 1, o.grid * o.grid).sort((a, b) => a - b);
        return { options: { ...o }, puzzle: { pattern }, secret: pattern, map };
    }
    if (gameId === 'tune') {
        const o = numberOpts(params, { span: 100, tolerance: 3, attempts: 5, time: 30 });
        return { options: { ...o }, secret: [Math.floor(Math.random() * (o.span + 1))], map };
    }
    if (gameId === 'rewire') {
        const o = numberOpts(params, { ports: 5, mistakes: 2, time: 30 });
        const order = pick(o.ports, 1, o.ports);
        order.forEach((right, i) => { map[i + 1] = right; });
        return { options: { ...o }, secret: order, map };
    }
    if (gameId === 'sync') {
        const o = numberOpts(params, { hits: 3, period: 1600, window: 18, shrink: 74, time: 20 });
        const centers = Array.from({ length: o.hits }, () => (Math.floor(Math.random() * 61) + 20) / 100);
        return { options: { ...o }, puzzle: { centers, period: o.period, window: o.window, shrink: o.shrink }, secret: [], map };
    }
    if (gameId === 'vent') {
        const o = numberOpts(params, { need: 4, rise: 15, vent: 27, band: 18, drift: 5200, time: 20 });
        const seed = Math.floor(Math.random() * 1000) / 100;
        return { options: { ...o }, puzzle: { seed, step: 50, start: 50, swing: 26 }, secret: [], map };
    }
    if (gameId === 'decode') {
        const o = numberOpts(params, { symbols: 4, digits: 4, preview: 4, time: 25 });
        const glyphs = pick(o.symbols, 1, 8);
        const values = pick(o.symbols, 0, 9);
        const key = glyphs.map((glyph, i) => ({ glyph, digit: values[i]! }));
        const code: number[] = [];
        const answer: number[] = [];
        for (let i = 0; i < o.digits; i += 1) {
            const at = Math.floor(Math.random() * o.symbols);
            code.push(glyphs[at]!);
            answer.push(values[at]!);
        }
        return { options: { ...o }, puzzle: { key, code }, secret: answer, map };
    }

    const o = bypassOptions(params);
    const code = o.repeats
        ? Array.from({ length: o.digits }, () => Math.floor(Math.random() * 10))
        : pick(o.digits, 0, 9);
    return { options: { ...o }, secret: code, map };
}

export function devStartMinigame(gameId: string, params: Record<string, number | boolean> = {}): void {
    const built = build(gameId, params);
    const start: MinigameStart = {
        roundId: `dev-${Date.now()}`,
        gameId,
        options: built.options,
        puzzle:  built.puzzle,
    };
    round = {
        start, secret: built.secret, map: built.map, found: 0, mistakes: 0, hits: 0, attempts: 0,
        openedAt: Date.now(),
        traps:    built.traps ?? {},
        lines:    built.lines ?? [],
        rules:    built.rules ?? [],
        tiles:    built.tiles ?? [],
        lives:    typeof built.options.lives === 'number' ? built.options.lives : 0,
        probes:   typeof built.options.probes === 'number' ? built.options.probes : 0,
        layerAt:  0,
        maze:     built.maze ?? [],
        mazePos:  1,
        mazeKeys: built.mazeKeys ?? [],
        mazeGot:  0,
        gates:    built.gates ?? [],
        cleared:  0,
        pinAt:    built.pinAt ?? [],
        pinsSet:  0,
        snapped:  0,
        liveWire: built.liveWire ?? 0,
        wrongCut: 0,
        regs:     built.regs ?? [],
        regDone:  0,
        word:     built.word ?? '',
        scramble: built.scramble ?? [],
        seq:      built.seq ?? [],
        matchAt:  built.matchAt ?? 0,
    };
    window.postMessage({ action: 'sd-phone:minigames:start', data: start }, '*');
}

function judge<F>(answer: unknown): MinigameResult<F> | null {
    const r = round!;
    const o = r.start.options as Record<string, number>;

    switch (r.start.gameId) {
        case 'memory': {
            const taps = [...new Set(answer as number[])];
            const hits = taps.filter(n => r.secret.includes(n)).length;
            const misses = taps.length - hits;
            return { done: true, win: hits === o.targets && misses <= o.mistakes!, feedback: { taps, hits, misses } as F, reveal: r.secret };
        }
        case 'tune': {
            const value = Number(answer);
            const distance = Math.abs(value - r.secret[0]!);
            r.attempts += 1;
            const win = distance <= o.tolerance!;
            const fractions = [0.06, 0.14, 0.26, 0.44];
            let band = 0;
            for (let i = 0; i < fractions.length; i += 1) {
                if (distance <= o.span! * fractions[i]!) { band = fractions.length - i; break; }
            }
            const done = win || r.attempts >= o.attempts!;
            return { done, win, feedback: { value, band: win ? 5 : band, above: value > r.secret[0]! } as F, reveal: done ? r.secret : undefined };
        }
        case 'rewire': {
            const { left, right } = answer as { left: number; right: number };
            const correct = r.map[left] === right;
            if (correct) r.found += 1; else r.mistakes += 1;
            const win = r.found >= o.ports!;
            return { done: win || r.mistakes > o.mistakes!, win, feedback: { left, right, correct, found: r.found, mistakes: r.mistakes } as F };
        }
        case 'sync': {
            const at = (answer as { at: number }).at;
            const index = r.hits;
            const center = r.start.puzzle?.centers?.[index] ?? 0.5;
            const phase = (at % o.period!) / o.period!;
            const position = phase < 0.5 ? phase * 2 : 2 - phase * 2;
            const width = Math.max(0.05, (o.window! / 100) * Math.pow(o.shrink! / 100, index));
            const caught = Math.abs(position - center) <= width / 2;
            if (caught) r.hits += 1;
            const win = r.hits >= o.hits!;
            return { done: win || !caught, win, feedback: { index: index + 1, position, caught, hits: r.hits } as F };
        }
        case 'vent': {
            const holds = answer as { from: number; to: number }[];
            const seed = r.start.puzzle?.seed ?? 0;
            let needle = 50;
            let inBand = 0;
            const last = Math.min(Date.now() - r.openedAt, o.time! * 1000);
            for (let at = 0; at <= last; at += 50) {
                const holding = holds.some(h => at >= h.from && at < h.to);
                needle = Math.min(100, Math.max(0, needle + (50 / 1000) * (holding ? -o.vent! : o.rise!)));
                const center = 50 + 26 * Math.sin((at / o.drift!) * Math.PI * 2 + seed);
                if (Math.abs(needle - center) <= o.band! / 2) inBand += 50;
            }
            const held = inBand / 1000;
            return { done: true, win: held >= o.need!, feedback: { held, needle } as F };
        }
        case 'decode': {
            const typed = answer as number[];
            const correct = typed.filter((d, i) => d === r.secret[i]).length;
            return { done: true, win: correct === o.digits, feedback: { typed, correct } as F, reveal: r.secret };
        }
        case 'skillcheck': {
            const { at, key } = answer as { at: number; key: number };
            const index = r.cleared;
            const gate = r.gates[index];
            if (!gate) return null;
            const position = (at % o.period!) / o.period!;
            const reach = Math.max(0.04, (o.window! / 100) * Math.pow(o.shrink! / 100, index)) / 2;
            const inGate = Math.abs(position - gate.at) <= reach || Math.abs(position - gate.at) >= 1 - reach;
            const caught = inGate && key === gate.key;
            if (caught) r.cleared += 1;
            const win = r.cleared >= o.rounds!;
            return { done: win || !caught, win, feedback: { index: index + 1, position, caught, rightKey: key === gate.key, cleared: r.cleared } as F };
        }
        case 'lockpick': {
            const value = Number(answer);
            const target = r.pinAt[r.pinsSet]!;
            const distance = Math.abs(value - target);
            const caught = distance <= o.tolerance!;
            if (caught) r.pinsSet += 1; else r.snapped += 1;
            const feels = [0.05, 0.12, 0.24];
            let feel = 0;
            for (let i = 0; i < feels.length; i += 1) {
                if (distance <= 100 * feels[i]!) { feel = feels.length - i; break; }
            }
            const win = r.pinsSet >= o.pins!;
            return { done: win || r.snapped > o.breaks!, win, feedback: { pin: r.pinsSet, value, set: r.pinsSet, feel: caught ? 4 : feel, above: value > target, broken: r.snapped } as F };
        }
        case 'wires': {
            const { wire } = answer as { wire: number };
            if (wire === r.liveWire) {
                return { done: true, win: true, feedback: { wire, right: true, wrong: r.wrongCut } as F };
            }
            r.wrongCut += 1;
            return { done: r.wrongCut >= o.cuts!, win: false, feedback: { wire, right: false, wrong: r.wrongCut } as F };
        }
        case 'varhack': {
            const { column, row } = answer as { column: number; row: number };
            const right = r.regs[column - 1] === row;
            if (right) r.regDone += 1; else r.mistakes += 1;
            const win = r.regDone >= o.columns!;
            return { done: win || r.mistakes > o.mistakes!, win, feedback: { column, row, right, done: r.regDone, mistakes: r.mistakes } as F };
        }
        case 'scanner': {
            const pick = Number(answer);
            r.attempts += 1;
            const win = pick === r.matchAt;
            return { done: win || r.attempts >= o.attempts!, win, feedback: { pick, right: win } as F, reveal: [r.matchAt] };
        }
        case 'anagram': {
            const order = answer as number[];
            const spelled = order.map(slot => r.scramble[slot - 1] ?? '').join('');
            r.attempts += 1;
            const win = spelled === r.word;
            let right = 0;
            for (let i = 0; i < r.word.length; i += 1) if (spelled[i] === r.word[i]) right += 1;
            return { done: win || r.attempts >= o.attempts!, win, feedback: { right, size: r.word.length } as F };
        }
        case 'simon': {
            const played = answer as number[];
            let right = 0;
            for (let i = 0; i < r.seq.length; i += 1) {
                if (played[i] !== r.seq[i]) break;
                right += 1;
            }
            return { done: true, win: right >= r.seq.length, feedback: { right, length: r.seq.length } as F, reveal: r.seq };
        }
        case 'maze': {
            const { dir } = answer as { dir: 'n' | 'e' | 's' | 'w' };
            const bits = { n: NORTH, e: EAST, s: SOUTH, w: WEST };
            const deltas = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] } as Record<string, number[]>;
            const width = o.width!, height = o.height!;
            if ((r.maze[r.mazePos - 1]! & bits[dir]) !== 0) {
                return { done: false, win: false, feedback: { pos: r.mazePos, blocked: true, cells: [], nodes: [], got: r.mazeGot } as F };
            }
            const row = Math.floor((r.mazePos - 1) / width) + 1 + deltas[dir]![0]!;
            const col = ((r.mazePos - 1) % width) + 1 + deltas[dir]![1]!;
            if (row < 1 || row > height || col < 1 || col > width) {
                return { done: false, win: false, feedback: { pos: r.mazePos, blocked: true, cells: [], nodes: [], got: r.mazeGot } as F };
            }
            r.mazePos = (row - 1) * width + col;
            if (r.mazeKeys.includes(r.mazePos)) {
                r.mazeKeys = r.mazeKeys.filter(k => k !== r.mazePos);
                r.mazeGot += 1;
            }
            const visible = mazeSight(r.maze, r.mazePos, width, height, o.sight!);
            const win = r.mazePos === width * height && r.mazeGot >= o.nodes!;
            return { done: win, win, feedback: { pos: r.mazePos, blocked: false, cells: visible, nodes: r.mazeKeys.filter(k => visible.some(c => c.i === k)), got: r.mazeGot } as F };
        }
        case 'router': {
            const turns = answer as number[];
            const tiles = r.tiles.map((mask, i) => spin(mask, turns[i] ?? 0));
            return { done: true, win: routerConnected(tiles, o.grid!), feedback: { turns } as F };
        }
        case 'circuit': {
            const on = (answer as number[]).map(v => v === 1);
            const live = r.lines.map(l => evalLine(l, on));
            const lit = live.filter(Boolean).length;
            r.attempts += 1;
            const win = lit === r.lines.length;
            return { done: win || r.attempts >= o.attempts!, win, feedback: { live, lit } as F };
        }
        case 'intrusion': {
            const { action, index } = answer as { action: string; index: number };
            const layer = r.layerAt + 1;
            const trap = (r.traps[layer] ?? []).includes(index);
            if (action === 'probe') {
                r.probes -= 1;
                return { done: false, win: false, feedback: { action: 'probe', layer, index, trap, probes: r.probes } as F };
            }
            if (trap) {
                r.lives -= 1;
                return { done: r.lives < 0, win: false, feedback: { action: 'hop', layer, index, trap: true, lives: r.lives } as F };
            }
            r.layerAt = layer;
            const win = r.layerAt >= o.layers!;
            return { done: win, win, feedback: { action: 'hop', layer, index, trap: false, lives: r.lives } as F };
        }
        case 'sequencer': {
            const order = answer as number[];
            const place: Record<number, number> = {};
            order.forEach((step, i) => { place[step] = i + 1; });
            const broken: number[] = [];
            r.rules.forEach((rule, i) => {
                const ok = rule.kind === 'before' ? place[rule.a]! < place[rule.b!]!
                    : rule.kind === 'last' ? place[rule.a] === o.steps
                    : place[rule.a] !== 1;
                if (!ok) broken.push(i + 1);
            });
            return { done: true, win: broken.length === 0, feedback: { broken } as F };
        }
        case 'sweep': {
            const req = answer as { action: string; cell?: number; flags?: number[] };
            if (req.action === 'probe') {
                const cell = req.cell!;
                if (r.secret.includes(cell)) {
                    r.mistakes += 1;
                    return { done: r.mistakes > o.mistakes!, win: false, feedback: { action: 'probe', cell, hot: true, mistakes: r.mistakes } as F };
                }
                return { done: false, win: false, feedback: { action: 'probe', cell, hot: false, near: neighbourCount(r.secret, cell, o.grid!) } as F };
            }
            const flags = req.flags ?? [];
            const matched = flags.filter(c => r.secret.includes(c)).length;
            return { done: true, win: matched >= o.live!, feedback: { action: 'flag', matched } as F };
        }
        default: {
            const guess = answer as number[];
            const code = r.secret;
            let exact = 0;
            const codeLeft: Record<number, number> = {};
            const guessLeft: Record<number, number> = {};
            for (let i = 0; i < code.length; i += 1) {
                if (code[i] === guess[i]) exact += 1;
                else {
                    codeLeft[code[i]!] = (codeLeft[code[i]!] ?? 0) + 1;
                    guessLeft[guess[i]!] = (guessLeft[guess[i]!] ?? 0) + 1;
                }
            }
            let present = 0;
            for (const [digit, count] of Object.entries(guessLeft)) {
                present += Math.min(count, codeLeft[Number(digit)] ?? 0);
            }
            r.attempts += 1;
            const win = exact === code.length;
            const done = win || r.attempts >= o.attempts!;
            return { done, win, feedback: { guess, exact, present } as F, reveal: done ? code : undefined, attempts: r.attempts };
        }
    }
}

export function devAnswerMinigame<F>(answer: unknown): MinigameResult<F> | null {
    if (!round) return null;
    return judge<F>(answer);
}

export function devForfeitMinigame<F>(): MinigameResult<F> | null {
    if (!round) return null;
    return { done: true, win: false, reveal: round.secret };
}

export function devSyncMinigame(): { round?: MinigameStart } {
    return round ? { round: round.start } : {};
}

export function devCloseMinigame(): void {
    round = null;
    window.postMessage({ action: 'sd-phone:minigames:stop', data: {} }, '*');
}
