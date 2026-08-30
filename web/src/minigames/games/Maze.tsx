import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DoorOpen, KeyRound, Lock } from 'lucide-react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardIn, glow } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MazeOptions, type MazeRow, type MinigameOutcome, type MinigameResult } from '../data';

const SETTLE_MS = 1900;
const CELL = 40;
const VIEW = 298;
const GLIDE_MS = 165;
const DRAG_MIN = 16;
const NORTH = 1, EAST = 2, SOUTH = 4, WEST = 8;

type Dir = 'n' | 'e' | 's' | 'w';

const STEP: Record<Dir, { bit: number; dr: number; dc: number }> = {
    n: { bit: NORTH, dr: -1, dc: 0 },
    e: { bit: EAST,  dr: 0,  dc: 1 },
    s: { bit: SOUTH, dr: 1,  dc: 0 },
    w: { bit: WEST,  dr: 0,  dc: -1 },
};

const KEYS: Record<string, Dir> = {
    ArrowUp: 'n', ArrowRight: 'e', ArrowDown: 's', ArrowLeft: 'w',
    w: 'n', d: 'e', s: 's', a: 'w',
};

const DEFAULTS: MazeOptions = { width: 12, height: 14, sight: 2, nodes: 3, time: 80 };

export function Maze({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const exit = start.puzzle?.exit ?? options.width * options.height;
    const total = start.puzzle?.total ?? options.nodes;

    const [cells, setCells] = useState<Record<number, number>>(() => {
        const seed: Record<number, number> = {};
        for (const cell of start.puzzle?.cells ?? []) seed[cell.i] = cell.w;
        return seed;
    });
    const [nodes, setNodes]     = useState<number[]>(() => start.puzzle?.nodes ?? []);
    const [pos, setPos]         = useState(start.puzzle?.pos ?? 1);
    const [got, setGot]         = useState(0);
    const [steps, setSteps]     = useState(0);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);

    const cellsRef = useRef(cells);
    cellsRef.current = cells;
    const posRef = useRef(pos);
    posRef.current = pos;
    const settled = useRef(false);
    const heldRef = useRef<Dir | null>(null);
    const timerRef = useRef<number | undefined>(undefined);
    const dragRef = useRef<{ x: number; y: number } | null>(null);
    const deniedRef = useRef<Dir | null>(null);
    const gotRef = useRef(0);

    function finish(result: MinigameResult<MazeRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        settled.current = true;
        window.setTimeout(onDone, SETTLE_MS);
    }

    const finishRef = useRef(finish);
    finishRef.current = finish;

    const step = useCallback(async (dir: Dir) => {
        if (settled.current) return false;

        const here = cellsRef.current[posRef.current];
        if (here === undefined || (here & STEP[dir].bit) !== 0) {
            if (here !== undefined && deniedRef.current !== dir) {
                deniedRef.current = dir;
                sfx('deny');
            }
            return false;
        }

        const row = Math.floor((posRef.current - 1) / options.width) + STEP[dir].dr;
        const col = ((posRef.current - 1) % options.width) + STEP[dir].dc;
        if (row < 0 || row >= options.height || col < 0 || col >= options.width) return false;

        const next = row * options.width + col + 1;
        deniedRef.current = null;
        posRef.current = next;
        setPos(next);
        setSteps(n => n + 1);
        setNodes(prev => prev.filter(n => n !== next));

        const result = await answerMinigame<MazeRow>({ dir });
        if (!result) return true;

        const row2 = result.feedback;
        if (row2) {
            if (row2.cells.length > 0) {
                setCells(prev => {
                    const merged = { ...prev };
                    for (const cell of row2.cells) merged[cell.i] = cell.w;
                    return merged;
                });
                setNodes(prev => [...new Set([...prev.filter(n => n !== row2.pos), ...row2.nodes])]);
            }
            if (row2.got > gotRef.current) sfx(row2.got >= total ? 'reveal' : 'lock');
            gotRef.current = row2.got;
            setGot(row2.got);
            posRef.current = row2.pos;
            setPos(row2.pos);
        }
        if (result.done) finishRef.current(result);
        return true;
    }, [options.width, options.height, total]);

    const hold = useCallback((dir: Dir | null) => {
        heldRef.current = dir;
        deniedRef.current = null;
        if (timerRef.current !== undefined) {
            window.clearInterval(timerRef.current);
            timerRef.current = undefined;
        }
        if (!dir) return;

        void step(dir);
        timerRef.current = window.setInterval(() => {
            const held = heldRef.current;
            if (!held || settled.current) {
                window.clearInterval(timerRef.current);
                timerRef.current = undefined;
                return;
            }
            void step(held);
        }, GLIDE_MS);
    }, [step]);

    useEffect(() => () => { if (timerRef.current !== undefined) window.clearInterval(timerRef.current); }, []);

    useEffect(() => {
        function down(event: KeyboardEvent) {
            const dir = KEYS[event.key];
            if (!dir || event.repeat) return;
            event.preventDefault();
            hold(dir);
        }
        function up(event: KeyboardEvent) {
            if (KEYS[event.key] && heldRef.current === KEYS[event.key]) hold(null);
        }
        window.addEventListener('keydown', down, true);
        window.addEventListener('keyup', up, true);
        return () => {
            window.removeEventListener('keydown', down, true);
            window.removeEventListener('keyup', up, true);
        };
    }, [hold]);

    async function expire() {
        if (settled.current) return;
        settled.current = true;
        hold(null);
        const result = await forfeitMinigame<MazeRow>();
        finish(result ?? { done: true, win: false });
    }

    const col = (pos - 1) % options.width;
    const row = Math.floor((pos - 1) / options.width);
    const unlocked = got >= total;

    return (
        <MinigamePanel
            title={t('minigames.maze', 'Maze')}
            headline={unlocked
                ? t('minigames.exitOpen', 'The exit is open')
                : t('minigames.findTheKeys', 'Find the keys')}
            sub={t('minigames.keysCarried', '{got} of {total} keys · {steps} steps', { got, total, steps })}
            score={{ label: t('minigames.statSteps', 'Steps'), value: String(steps) }}
            seconds={options.time}
            total={total}
            left={got}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => { void expire(); }}
        >
            <div
                onPointerDown={e => {
                    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
                    dragRef.current = { x: e.clientX, y: e.clientY };
                }}
                onPointerMove={e => {
                    const from = dragRef.current;
                    if (!from) return;
                    const dx = e.clientX - from.x;
                    const dy = e.clientY - from.y;
                    if (Math.abs(dx) < DRAG_MIN && Math.abs(dy) < DRAG_MIN) return;
                    const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
                    dragRef.current = { x: e.clientX, y: e.clientY };
                    if (heldRef.current !== dir) hold(dir);
                }}
                onPointerUp={() => { dragRef.current = null; hold(null); }}
                onPointerCancel={() => { dragRef.current = null; hold(null); }}
                onPointerLeave={() => { dragRef.current = null; hold(null); }}
                className="relative mx-auto touch-none select-none overflow-hidden rounded-[18px]"
                style={{ width: VIEW, height: VIEW, backgroundColor: '#05070C', boxShadow: `inset 0 0 0 1px ${SURFACE.hair}`, ...boardIn(200) }}
            >
                <div
                    className="absolute left-0 top-0"
                    style={{
                        width:      options.width * CELL,
                        height:     options.height * CELL,
                        transform:  `translate(${VIEW / 2 - (col + 0.5) * CELL}px, ${VIEW / 2 - (row + 0.5) * CELL}px)`,
                        transition: `transform ${GLIDE_MS}ms linear`,
                    }}
                >
                    {Object.entries(cells).map(([key, mask]) => {
                        const index = Number(key);
                        const r = Math.floor((index - 1) / options.width);
                        const c = (index - 1) % options.width;
                        const near = Math.max(Math.abs(r - row), Math.abs(c - col));
                        const seen = near <= options.sight;
                        const fade = seen ? 1 : near <= options.sight + 2 ? 0.5 : 0.32;
                        const wall = `1.5px solid rgba(196,168,255,${(seen ? 0.42 : 0.2) * fade + 0.1})`;

                        return (
                            <div
                                key={index}
                                className="absolute"
                                style={{
                                    left:         c * CELL,
                                    top:          r * CELL,
                                    width:        CELL,
                                    height:       CELL,
                                    borderTop:    (mask & NORTH) !== 0 ? wall : '1.5px solid transparent',
                                    borderRight:  (mask & EAST) !== 0 ? wall : '1.5px solid transparent',
                                    borderBottom: (mask & SOUTH) !== 0 ? wall : '1.5px solid transparent',
                                    borderLeft:   (mask & WEST) !== 0 ? wall : '1.5px solid transparent',
                                    background:   index === exit
                                        ? (unlocked ? `${PANEL.win}47` : `${PANEL.fail}3D`)
                                        : `rgba(255,255,255,${seen ? 0.05 : 0.02})`,
                                    boxShadow:    index === exit
                                        ? (unlocked
                                            ? `inset 0 0 0 1.5px ${PANEL.win}, 0 0 16px ${PANEL.win}66`
                                            : `inset 0 0 0 1.5px ${PANEL.fail}B3`)
                                        : undefined,
                                    transition:   'background 300ms ease-out, border-color 300ms ease-out, box-shadow 300ms ease-out',
                                }}
                            />
                        );
                    })}

                    {cells[exit] !== undefined && (
                        <span
                            className="pointer-events-none absolute flex items-center justify-center"
                            style={{
                                left:   ((exit - 1) % options.width) * CELL,
                                top:    Math.floor((exit - 1) / options.width) * CELL,
                                width:  CELL,
                                height: CELL,
                                color:  unlocked ? PANEL.win : PANEL.fail,
                            }}
                        >
                            {unlocked
                                ? <DoorOpen className="h-[17px] w-[17px]" strokeWidth={2.4} />
                                : <Lock className="h-[15px] w-[15px]" strokeWidth={2.6} />}
                        </span>
                    )}

                    {nodes.map(index => {
                        const r = Math.floor((index - 1) / options.width);
                        const c = (index - 1) % options.width;
                        return (
                            <span
                                key={`k${index}`}
                                className="absolute rounded-full"
                                style={{
                                    left:       c * CELL + CELL / 2 - 5,
                                    top:        r * CELL + CELL / 2 - 5,
                                    width:      10,
                                    height:     10,
                                    background: '#FFD60A',
                                    boxShadow:  '0 0 14px rgba(255,214,10,0.75)',
                                    animation:  'mg-urgent 1.6s ease-in-out infinite',
                                }}
                            />
                        );
                    })}

                    <div
                        className="absolute rounded-full"
                        style={{
                            left:       col * CELL + CELL / 2 - 7,
                            top:        row * CELL + CELL / 2 - 7,
                            width:      14,
                            height:     14,
                            background: PANEL.accent,
                            boxShadow:  glow(PANEL.accent),
                            transition: `left ${GLIDE_MS}ms linear, top ${GLIDE_MS}ms linear`,
                        }}
                    />
                </div>

                <div
                    className="pointer-events-none absolute inset-0"
                    style={{ background: 'radial-gradient(circle at 50% 50%, rgba(5,7,12,0) 34%, rgba(5,7,12,0.62) 66%, rgba(5,7,12,0.94) 100%)' }}
                />
            </div>

            <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-3">
                    <KeyRound className="h-[22px] w-[22px]" strokeWidth={2.3} style={{ color: unlocked ? PANEL.win : '#FFD60A' }} />
                    <span className="text-[26px] font-bold tabular-nums leading-none text-white">
                        {got}<span className="text-white/35"> / {total}</span>
                    </span>
                </div>
                <div className="flex gap-2">
                    {Array.from({ length: total }, (_, i) => (
                        <span
                            key={i}
                            className="h-[9px] w-[30px] rounded-full transition-colors duration-300"
                            style={{
                                backgroundColor: i < got ? '#FFD60A' : 'rgba(255,255,255,0.13)',
                                boxShadow:       i < got ? '0 0 12px rgba(255,214,10,0.55)' : undefined,
                            }}
                        />
                    ))}
                </div>
                <span className="text-[12.5px] font-medium text-white/35">
                    {t('minigames.dragToMove', 'Drag the map or use the arrow keys')}
                </span>
            </div>
        </MinigamePanel>
    );
}
