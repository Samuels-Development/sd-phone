import { useEffect, useReducer } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { t } from '@/i18n';
import { formatRaceTime } from '@/apps/racing/data';
import type { HudSector, HudState, HudStyle, Standing } from '@/apps/racing/data';
import { RACING_ACCENT } from '@/apps/racing/racingTheme';

const TICK_MS       = 50;
const BOARD_ROWS    = 5;
const SECTOR_CELLS  = 4;
const MAX_PIPS      = 24;

const INK     = 'rgba(6, 9, 14, 0.90)';
const LINE    = 'rgba(255, 255, 255, 0.10)';
const TEXT    = '#F2F5F8';
const MUTE    = 'rgba(242, 245, 248, 0.46)';
const FAINT   = 'rgba(242, 245, 248, 0.16)';
const GAIN    = '#4ADE80';
const LOSS    = '#FF6B5A';
const ON_INK  = '#04120E';

const SLAB: CSSProperties = {
    background: INK,
    border:     `1px solid ${LINE}`,
    boxShadow:  '0 10px 30px rgba(0, 0, 0, 0.5)',
};

function shortTime(ms: number): string {
    const full = formatRaceTime(ms);
    return full.startsWith('00:') ? full.slice(3) : full.replace(/^0/, '');
}

function Slab({ width, children }: { width: number; children: ReactNode }) {
    return (
        <div className="overflow-hidden rounded-[11px]" style={{ ...SLAB, width }}>
            {children}
        </div>
    );
}

function Rule() {
    return <div className="h-px w-full" style={{ background: LINE }} />;
}

function Micro({ children, tone = MUTE }: { children: ReactNode; tone?: string }) {
    return (
        <span
            style={{
                fontSize:      9,
                fontWeight:    700,
                letterSpacing: '0.15em',
                lineHeight:    1,
                color:         tone,
            }}
        >
            {children}
        </span>
    );
}

function PitBlock({ pos, total }: { pos: number; total: number }) {
    return (
        <div
            className="flex w-[54px] shrink-0 flex-col items-center justify-center gap-[3px] py-2"
            style={{ background: RACING_ACCENT }}
        >
            <span
                style={{
                    fontSize:      27,
                    fontWeight:    800,
                    lineHeight:    0.9,
                    letterSpacing: '-0.04em',
                    color:         ON_INK,
                    fontVariantNumeric: 'tabular-nums',
                }}
            >
                {pos}
            </span>
            <Micro tone="rgba(4, 18, 14, 0.62)">{t('racing.hudOf', 'OF {n}', { n: total })}</Micro>
        </div>
    );
}

function PipStrip({ done, total }: { done: number; total: number }) {
    if (total <= 0) return null;

    if (total > MAX_PIPS) {
        const pct = Math.max(0, Math.min(1, done / total));
        return (
            <div className="h-[3px] w-full overflow-hidden rounded-full" style={{ background: FAINT }}>
                <div
                    className="h-full rounded-full transition-[width] duration-300 ease-out"
                    style={{ width: `${pct * 100}%`, background: RACING_ACCENT }}
                />
            </div>
        );
    }

    return (
        <div className="flex items-center gap-[3px]">
            {Array.from({ length: total }, (_, index) => (
                <span
                    key={index}
                    className="h-[3px] min-w-0 flex-1 rounded-full"
                    style={{ background: index < done ? RACING_ACCENT : FAINT }}
                />
            ))}
        </div>
    );
}

function HeadStrip({ state, current }: { state: HudState; current: string }) {
    return (
        <div className="flex items-stretch">
            <PitBlock pos={state.pos} total={state.totalRacers} />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-[7px] px-2.5 py-2">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="flex items-baseline gap-1">
                        <Micro>{t('racing.hudLap', 'LAP')}</Micro>
                        <span
                            style={{
                                fontSize:   14,
                                fontWeight: 700,
                                lineHeight: 1,
                                color:      TEXT,
                                fontVariantNumeric: 'tabular-nums',
                            }}
                        >
                            {state.lap}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: MUTE }}>/{state.totalLaps}</span>
                    </span>
                    <span
                        style={{
                            fontSize:      15,
                            fontWeight:    700,
                            lineHeight:    1,
                            letterSpacing: '-0.02em',
                            color:         TEXT,
                            fontVariantNumeric: 'tabular-nums',
                        }}
                    >
                        {current}
                    </span>
                </div>
                <PipStrip done={state.cp} total={state.cpTotal} />
            </div>
        </div>
    );
}

function GapText({ ms, ahead }: { ms: number; ahead: boolean }) {
    return (
        <span
            style={{
                fontSize:   12,
                fontWeight: 700,
                color:      ahead ? GAIN : LOSS,
                fontVariantNumeric: 'tabular-nums',
            }}
        >
            {ahead ? '-' : '+'}{shortTime(Math.abs(ms))}
        </span>
    );
}

function NeighbourRow({ glyph, name, gap, ahead, you }: {
    glyph:  string;
    name:   string;
    gap:    number | null;
    ahead:  boolean;
    you?:   boolean;
}) {
    return (
        <div className="flex items-center gap-2 px-2.5 py-[7px]" style={you ? { background: `${RACING_ACCENT}14` } : undefined}>
            <span
                className="w-[10px] text-center"
                style={{ fontSize: 10, lineHeight: 1, color: you ? RACING_ACCENT : MUTE }}
            >
                {glyph}
            </span>
            <span
                className="min-w-0 flex-1 truncate"
                style={{ fontSize: 12.5, fontWeight: you ? 700 : 600, color: you ? TEXT : 'rgba(242, 245, 248, 0.78)' }}
            >
                {name}
            </span>
            {gap !== null && <GapText ms={gap} ahead={ahead} />}
        </div>
    );
}

function Neighbours({ racers }: { racers: Standing[] }) {
    const meIndex = racers.findIndex(racer => racer.you);
    if (meIndex < 0) return null;

    const me     = racers[meIndex];
    const ahead  = meIndex > 0 ? racers[meIndex - 1] : null;
    const behind = meIndex < racers.length - 1 ? racers[meIndex + 1] : null;
    const myGap  = me.deltaMs ?? 0;

    return (
        <div className="flex flex-col">
            {ahead && (
                <NeighbourRow
                    glyph="▲"
                    name={ahead.name}
                    gap={(ahead.deltaMs ?? 0) - myGap}
                    ahead
                />
            )}
            <NeighbourRow glyph="●" name={me.name} gap={null} ahead={false} you />
            {behind && (
                <NeighbourRow
                    glyph="▼"
                    name={behind.name}
                    gap={(behind.deltaMs ?? 0) - myGap}
                    ahead={false}
                />
            )}
        </div>
    );
}

function boardRows(racers: Standing[]): Standing[] {
    const head = racers.slice(0, BOARD_ROWS);
    const you  = racers.find(racer => racer.you);
    if (!you || head.includes(you)) return head;
    return [...racers.slice(0, BOARD_ROWS - 1), you];
}

function FullBoard({ racers }: { racers: Standing[] }) {
    return (
        <div className="flex flex-col">
            {boardRows(racers).map(racer => (
                <div
                    key={racer.pos}
                    className="relative flex items-center gap-2 px-2.5 py-[6px]"
                    style={racer.you ? { background: `${RACING_ACCENT}14` } : undefined}
                >
                    {racer.you && (
                        <span className="absolute bottom-0 left-0 top-0 w-[2px]" style={{ background: RACING_ACCENT }} />
                    )}
                    <span
                        className="w-[12px] text-center"
                        style={{
                            fontSize:   11,
                            fontWeight: 700,
                            color:      racer.you ? RACING_ACCENT : MUTE,
                            fontVariantNumeric: 'tabular-nums',
                        }}
                    >
                        {racer.pos}
                    </span>
                    <span
                        className="min-w-0 flex-1 truncate"
                        style={{
                            fontSize:   12.5,
                            fontWeight: racer.you ? 700 : 600,
                            color:      racer.you ? TEXT : 'rgba(242, 245, 248, 0.78)',
                        }}
                    >
                        {racer.name}
                    </span>
                    {racer.deltaMs === null || racer.pos === 1
                        ? <Micro>{t('racing.hudLeader', 'LEAD')}</Micro>
                        : (
                            <span
                                style={{
                                    fontSize:   11.5,
                                    fontWeight: 700,
                                    color:      'rgba(242, 245, 248, 0.82)',
                                    fontVariantNumeric: 'tabular-nums',
                                }}
                            >
                                +{shortTime(racer.deltaMs)}
                            </span>
                        )}
                </div>
            ))}
        </div>
    );
}

function sectorCells(sectors: HudSector[]): HudSector[] {
    const cells = sectors.slice(0, SECTOR_CELLS);
    while (cells.length < SECTOR_CELLS) cells.push({ ms: 0, done: false });
    return cells;
}

function SectorBars({ sectors, liveMs }: { sectors: HudSector[]; liveMs: number }) {
    const cells  = sectorCells(sectors);
    const runIdx = cells.findIndex(cell => !cell.done);

    const spans = cells.map((cell, index) => {
        const prevMs = index > 0 ? cells[index - 1].ms : 0;
        if (cell.done) return Math.max(0, cell.ms - prevMs);
        if (index === runIdx) return Math.max(0, liveMs - prevMs);
        return 0;
    });
    const peak = Math.max(...spans, 1);

    return (
        <div className="flex flex-col gap-[5px] px-2.5 py-2">
            {cells.map((cell, index) => {
                const running = index === runIdx;
                const span    = spans[index];
                const fill    = cell.done ? GAIN : running ? RACING_ACCENT : FAINT;
                const width   = cell.done || running ? Math.max(0.06, span / peak) : 0;
                return (
                    <div key={index} className="flex items-center gap-2">
                        <Micro tone={running ? RACING_ACCENT : MUTE}>
                            {t('racing.hudSectorShort', 'S{n}', { n: index + 1 })}
                        </Micro>
                        <div className="h-[5px] min-w-0 flex-1 overflow-hidden rounded-full" style={{ background: FAINT }}>
                            <div
                                className="h-full rounded-full"
                                style={{ width: `${width * 100}%`, background: fill }}
                            />
                        </div>
                        <span
                            className="w-[46px] text-right"
                            style={{
                                fontSize:   11,
                                fontWeight: 700,
                                color:      cell.done ? 'rgba(242, 245, 248, 0.82)' : running ? TEXT : FAINT,
                                fontVariantNumeric: 'tabular-nums',
                            }}
                        >
                            {cell.done || running ? shortTime(span) : t('racing.hudNoTime', '--')}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

function Clocks({ best, total }: { best: string; total: string }) {
    return (
        <div className="flex items-center justify-between px-2.5 py-[7px]">
            <span className="flex items-baseline gap-1.5">
                <Micro>{t('racing.hudBestLap', 'BEST')}</Micro>
                <span
                    style={{
                        fontSize:   12.5,
                        fontWeight: 700,
                        color:      'rgba(242, 245, 248, 0.86)',
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    {best}
                </span>
            </span>
            <span className="flex items-baseline gap-1.5">
                <Micro>{t('racing.hudTotalTime', 'TOTAL')}</Micro>
                <span
                    style={{
                        fontSize:   12.5,
                        fontWeight: 700,
                        color:      'rgba(242, 245, 248, 0.86)',
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    {total}
                </span>
            </span>
        </div>
    );
}

interface LayoutProps {
    bestMs:    number;
    current:   string;
    currentMs: number;
    total:     string;
    state:     HudState;
}

function SimpleHud({ current, state }: LayoutProps) {
    return (
        <Slab width={228}>
            <HeadStrip state={state} current={current} />
        </Slab>
    );
}

function CasualHud({ current, state }: LayoutProps) {
    return (
        <Slab width={236}>
            <HeadStrip state={state} current={current} />
            <Rule />
            <Neighbours racers={state.racers} />
        </Slab>
    );
}

function AdvancedHud({ bestMs, current, currentMs, total, state }: LayoutProps) {
    return (
        <Slab width={272}>
            <HeadStrip state={state} current={current} />
            <Rule />
            <SectorBars sectors={state.sectors} liveMs={currentMs} />
            <Rule />
            <FullBoard racers={state.racers} />
            <Rule />
            <Clocks best={bestMs > 0 ? shortTime(bestMs) : t('racing.hudNoTime', '--')} total={total} />
        </Slab>
    );
}

export function RaceHud({ style, state, startedAt }: {
    style:     HudStyle;
    state:     HudState;
    startedAt: number;
}) {
    const [, tick] = useReducer((n: number) => n + 1, 0);

    useEffect(() => {
        const id = window.setInterval(tick, TICK_MS);
        return () => window.clearInterval(id);
    }, []);

    const elapsed   = Math.max(0, performance.now() - startedAt);
    const currentMs = Math.max(0, elapsed - state.lapStartElapsedMs);

    const layout: LayoutProps = {
        bestMs:  state.bestLapMs,
        current: shortTime(currentMs),
        currentMs,
        total:   shortTime(elapsed),
        state,
    };

    if (style === 'advanced') return <AdvancedHud {...layout} />;
    if (style === 'casual')   return <CasualHud {...layout} />;
    return <SimpleHud {...layout} />;
}
