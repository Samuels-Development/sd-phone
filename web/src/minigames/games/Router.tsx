import { useMemo, useState } from 'react';

import { t } from '@/i18n';
import { MinigamePanel } from '../MinigamePanel';
import { answerMinigame, forfeitMinigame } from '../minigamesApi';
import { PANEL, SURFACE, boardCard, boardIn, glow, tileFace } from '../panel';
import { sfx } from '../sfx';
import { numberOpts, type GameProps, type MinigameOutcome, type MinigameResult, type RouterOptions, type RouterRow } from '../data';

const SETTLE_MS = 1900;

const NORTH = 1, EAST = 2, SOUTH = 4, WEST = 8;

const DEFAULTS: RouterOptions = { grid: 4, time: 45 };

function Pipe({ mask, lit }: { mask: number; lit: boolean }) {
    const color = lit ? PANEL.accent : 'rgba(255,255,255,0.34)';
    const arm = 'absolute rounded-full';
    return (
        <>
            <span className="absolute left-1/2 top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: color, boxShadow: lit ? glow(PANEL.accent) : undefined }} />
            {(mask & NORTH) !== 0 && <span className={`${arm} left-1/2 top-0 h-1/2 w-[6px] -translate-x-1/2`} style={{ backgroundColor: color }} />}
            {(mask & SOUTH) !== 0 && <span className={`${arm} bottom-0 left-1/2 h-1/2 w-[6px] -translate-x-1/2`} style={{ backgroundColor: color }} />}
            {(mask & WEST) !== 0 && <span className={`${arm} left-0 top-1/2 h-[6px] w-1/2 -translate-y-1/2`} style={{ backgroundColor: color }} />}
            {(mask & EAST) !== 0 && <span className={`${arm} right-0 top-1/2 h-[6px] w-1/2 -translate-y-1/2`} style={{ backgroundColor: color }} />}
        </>
    );
}

function turned(mask: number, times: number): number {
    let out = mask;
    for (let i = 0; i < times % 4; i += 1) out = ((out << 1) & 15) | ((out & WEST) >> 3);
    return out;
}

function reaches(tiles: number[], grid: number): Set<number> {
    const seen = new Set<number>();
    if ((tiles[0]! & WEST) === 0) return seen;

    const queue = [1];
    seen.add(1);
    while (queue.length) {
        const cell = queue.pop()!;
        const row = Math.floor((cell - 1) / grid);
        const col = (cell - 1) % grid;
        const steps: [number, number, boolean][] = [
            [NORTH, cell - grid, row > 0],
            [SOUTH, cell + grid, row < grid - 1],
            [WEST, cell - 1, col > 0],
            [EAST, cell + 1, col < grid - 1],
        ];
        for (const [dir, next, ok] of steps) {
            const back = dir === NORTH ? SOUTH : dir === SOUTH ? NORTH : dir === EAST ? WEST : EAST;
            if (ok && !seen.has(next) && (tiles[cell - 1]! & dir) !== 0 && (tiles[next - 1]! & back) !== 0) {
                seen.add(next);
                queue.push(next);
            }
        }
    }
    return seen;
}

export function Router({ start, leaving, onDone }: GameProps) {
    const options = useMemo(() => numberOpts(start.options, DEFAULTS), [start.options]);
    const base = useMemo(() => start.puzzle?.tiles ?? [], [start.puzzle]);

    const [turns, setTurns]     = useState<number[]>(() => base.map(() => 0));
    const [moves, setMoves]     = useState(0);
    const [outcome, setOutcome] = useState<MinigameOutcome>(null);
    const [busy, setBusy]       = useState(false);

    const tiles = base.map((mask, i) => turned(mask, turns[i] ?? 0));
    const live = reaches(tiles, options.grid);
    const done = live.has(options.grid * options.grid) && (tiles[tiles.length - 1]! & EAST) !== 0;

    function rotate(i: number) {
        const next = turns.map((v, at) => (at === i ? (v + 1) % 4 : v));
        const nextTiles = base.map((mask, at) => turned(mask, next[at] ?? 0));
        const nextLive = reaches(nextTiles, options.grid);
        const nextDone = nextLive.has(options.grid * options.grid) && (nextTiles[nextTiles.length - 1]! & EAST) !== 0;

        setTurns(next);
        setMoves(n => n + 1);

        if (nextDone && !done) sfx('reveal');
        else if (nextLive.size > live.size) sfx('lock');
        else if (nextLive.size < live.size) sfx('deny');
    }

    function finish(result: MinigameResult<RouterRow>) {
        setOutcome(result.win ? 'win' : 'lose');
        window.setTimeout(onDone, SETTLE_MS);
    }

    async function submit() {
        if (busy || outcome) return;
        setBusy(true);
        const result = await answerMinigame<RouterRow>(turns);
        setBusy(false);
        if (result) finish(result);
    }

    async function expire() {
        if (outcome) return;
        const result = await forfeitMinigame<RouterRow>();
        finish(result ?? { done: true, win: false });
    }

    return (
        <MinigamePanel
            title={t('minigames.router', 'Router')}
            headline={t('minigames.routeThePacket', 'Route the packet')}
            sub={done
                ? t('minigames.lineOpen', 'Line is open')
                : t('minigames.tapToRotate', 'Tap a tile to turn it')}
            score={{ label: t('minigames.statRotations', 'Rotations'), value: String(moves) }}
            seconds={options.time}
            total={0}
            left={0}
            outcome={outcome}
            leaving={leaving}
            onExpire={() => { void expire(); }}
            meta={
                <button
                    type="button"
                    disabled={busy || outcome !== null || !done}
                    onClick={() => { void submit(); }}
                    className="rounded-full px-8 py-2.5 text-[15px] font-semibold text-white transition-opacity active:opacity-70 disabled:opacity-30"
                    style={{ backgroundColor: PANEL.accent }}
                >
                    {t('minigames.sendPacket', 'Send it')}
                </button>
            }
        >
            <div
                className="grid gap-[7px] rounded-[22px] p-3"
                style={{ ...boardCard, ...boardIn(200), gridTemplateColumns: `repeat(${options.grid}, minmax(0, 1fr))` }}
            >
                {base.map((_, i) => {
                    const cell = i + 1;
                    const isLit = live.has(cell);
                    return (
                        <button
                            key={cell}
                            type="button"
                            disabled={outcome !== null}
                            onClick={() => rotate(i)}
                            aria-label={t('minigames.tile', 'Tile {n}', { n: cell })}
                            className="relative aspect-square rounded-[10px] transition-transform duration-150 active:scale-[0.92]"
                            style={isLit
                                ? { backgroundColor: `${PANEL.accent}1A`, boxShadow: `inset 0 0 0 1px ${PANEL.accent}59` }
                                : tileFace}
                        >
                            <Pipe mask={tiles[i] ?? 0} lit={isLit} />
                        </button>
                    );
                })}
            </div>

            <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: PANEL.accent }}>
                    {t('minigames.inbound', 'In')}
                </span>
                <span className="h-[1px] flex-1 mx-3" style={{ backgroundColor: SURFACE.hair }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: done ? PANEL.win : 'rgba(255,255,255,0.3)' }}>
                    {t('minigames.outbound', 'Out')}
                </span>
            </div>
        </MinigamePanel>
    );
}
