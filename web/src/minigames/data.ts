export type MinigameOutcome = 'win' | 'lose' | null;

export interface MinigameStart {
    roundId: string;
    gameId:  string;
    options: Record<string, number | boolean>;
    puzzle?: {
        pattern?: number[];
        centers?: number[];
        period?:  number;
        window?:  number;
        shrink?:  number;
        seed?:    number;
        step?:    number;
        start?:   number;
        swing?:   number;
        key?:     { glyph: number; digit: number }[];
        code?:    number[];
        tiles?:   number[];
        lines?:   CircuitLine[];
        rules?:   SequencerRule[];
        layers?:  number;
        width?:   number;
        probes?:  number;
        live?:    number;
        steps?:   number;
        grid?:    number;
        exit?:    number;
        pos?:     number;
        sight?:   number;
        cells?:   MazeCell[];
        height?:  number;
        nodes?:   number[];
        total?:   number;
        gates?:   SkillcheckGate[];
        pins?:    number;
        clues?:   WiresClue[];
        wires?:   number;
        columns?: string[][];
        wanted?:  string[];
        target?:  number[];
        lineup?:  number[][];
        letters?: string[];
        order?:   number[];
        pace?:    number;
        pads?:    number;
    };
}

export interface GameProps {
    start:   MinigameStart;
    leaving: boolean;
    onDone:  () => void;
}

export interface MinigameResult<F> {
    done:      boolean;
    win:       boolean;
    feedback?: F;
    reveal?:   number[];
    attempts?: number;
}

export interface SkillcheckOptions { rounds: number; period: number; window: number; shrink: number; time: number }
export interface SkillcheckGate { at: number; key: number }
export interface SkillcheckRow { index: number; position: number; caught: boolean; rightKey: boolean; cleared: number }

export interface LockpickOptions { pins: number; tolerance: number; breaks: number; time: number }
export interface LockpickRow { pin: number; value: number; set: number; feel: number; above: boolean; broken: number }

export interface WiresClue { kind: string; a?: number }
export interface WiresOptions { wires: number; clues: number; cuts: number; time: number }
export interface WiresRow { wire: number; right: boolean; wrong: number }

export interface VarhackOptions { columns: number; rows: number; mistakes: number; time: number }
export interface VarhackRow { column: number; row: number; right: boolean; done: number; mistakes: number }

export interface ScannerOptions { bars: number; options: number; attempts: number; time: number }
export interface ScannerRow { pick: number; right: boolean }

export interface AnagramOptions { attempts: number; time: number }
export interface AnagramRow { right: number; size: number }

export interface SimonOptions { pads: number; length: number; pace: number; time: number }
export interface SimonRow { right: number; length: number }

export interface MazeOptions { width: number; height: number; sight: number; nodes: number; time: number }
export interface MazeCell { i: number; w: number }
export interface MazeRow { pos: number; blocked: boolean; cells: MazeCell[]; nodes: number[]; got: number }

export interface RouterOptions { grid: number; time: number }
export interface RouterRow { turns: number[] }

export interface CircuitLine { a: number; b: number; na: boolean; nb: boolean; gate: string }
export interface CircuitOptions { inputs: number; outputs: number; attempts: number; time: number }
export interface CircuitRow { live: boolean[]; lit: number }

export interface IntrusionOptions { layers: number; width: number; traps: number; probes: number; lives: number; time: number }
export interface IntrusionRow { action: string; layer: number; index: number; trap: boolean; probes?: number; lives?: number }

export interface SequencerRule { kind: string; a: number; b?: number }
export interface SequencerOptions { steps: number; rules: number; time: number }
export interface SequencerRow { broken: number[] }

export interface SweepOptions { grid: number; live: number; mistakes: number; time: number }
export interface SweepRow { action: string; cell?: number; hot?: boolean; near?: number; mistakes?: number; matched?: number }

export interface TuneOptions { span: number; tolerance: number; attempts: number; time: number }
export interface TuneRow { value: number; band: number; above: boolean }

export interface RewireOptions { ports: number; mistakes: number; time: number }
export interface RewireRow { left: number; right: number; correct: boolean; found: number; mistakes: number }

export interface SyncOptions { hits: number; period: number; window: number; shrink: number; time: number }
export interface SyncRow { index: number; position: number; caught: boolean; hits: number }

export interface VentOptions { need: number; rise: number; vent: number; band: number; drift: number; time: number }
export interface VentRow { held: number; needle: number }

export interface DecodeOptions { symbols: number; digits: number; preview: number; time: number }
export interface DecodeRow { typed: number[]; correct: number }

export function numberOpts<T>(raw: Record<string, number | boolean>, fallbacks: T): T {
    const out = { ...fallbacks } as Record<string, number>;
    for (const key of Object.keys(out)) {
        if (typeof raw[key] === 'number') out[key] = raw[key];
    }
    return out as T;
}

export interface MemoryOptions {
    grid:     number;
    targets:  number;
    preview:  number;
    time:     number;
    mistakes: number;
}

export interface MemoryRow {
    taps:   number[];
    hits:   number;
    misses: number;
}

export function memoryOptions(raw: Record<string, number | boolean>): MemoryOptions {
    return {
        grid:     typeof raw.grid === 'number' ? raw.grid : 5,
        targets:  typeof raw.targets === 'number' ? raw.targets : 5,
        preview:  typeof raw.preview === 'number' ? raw.preview : 3,
        time:     typeof raw.time === 'number' ? raw.time : 20,
        mistakes: typeof raw.mistakes === 'number' ? raw.mistakes : 2,
    };
}

export interface BypassOptions {
    digits:   number;
    attempts: number;
    time:     number;
    repeats:  boolean;
}

export interface BypassRow {
    guess:   number[];
    exact:   number;
    present: number;
}

export function bypassOptions(raw: Record<string, number | boolean>): BypassOptions {
    return {
        digits:   typeof raw.digits === 'number' ? raw.digits : 4,
        attempts: typeof raw.attempts === 'number' ? raw.attempts : 6,
        time:     typeof raw.time === 'number' ? raw.time : 45,
        repeats:  raw.repeats === true,
    };
}
