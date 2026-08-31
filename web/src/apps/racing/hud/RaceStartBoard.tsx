import { useEffect, useReducer } from 'react';
import type { CSSProperties } from 'react';

import { t } from '@/i18n';
import { formatMoney } from '@/apps/racing/data';
import type { LineupState, StartBoard } from '@/apps/racing/data';
import { CLASS_COLOR } from '@/apps/racing/racingTheme';

const TICK_MS  = 500;
const RAIL_MAX = 16;
const BOARD_W  = 560;

const INK   = '#FFFFFF';
const MUTE  = 'rgba(255, 255, 255, 0.55)';
const FAINT = 'rgba(255, 255, 255, 0.18)';
const READY = '#34D399';
const WARN  = '#FBBF24';
const WRONG = '#F87171';

const SHADOW = '0 2px 8px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)';
const MONO   = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const SCRIM: CSSProperties = {
    position:     'absolute',
    left:         -18,
    right:        -18,
    top:          -14,
    bottom:       -12,
    zIndex:       -1,
    borderRadius: 30,
    background:   'rgba(0, 0, 0, 0.46)',
    filter:       'blur(26px)',
};

const lineupHint = (state: LineupState): { tone: string; text: string } => ({
    ready:   { tone: READY, text: t('racing.lineupReady', 'Lined up') },
    vehicle: { tone: MUTE,  text: t('racing.lineupVehicle', 'Get in the driver seat') },
    turn:    { tone: WRONG, text: t('racing.lineupTurn', 'Facing the wrong way') },
    backup:  { tone: WARN,  text: t('racing.lineupBackup', 'Back up behind the line') },
}[state]);

function clock(left: number): string {
    if (left >= 3600) {
        return `${Math.floor(left / 3600)}h ${String(Math.floor((left % 3600) / 60)).padStart(2, '0')}`;
    }
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

function GridRail({ taken, seats, joined, tone }: { taken: number; seats: number; joined: boolean; tone: string }) {
    const slots  = Math.max(1, Math.min(RAIL_MAX, seats));
    const filled = Math.round((Math.min(taken, seats) / Math.max(1, seats)) * slots);

    return (
        <span className="flex items-end gap-[3px]">
            {Array.from({ length: slots }, (_, i) => {
                const isFilled = i < filled;
                const isMine   = joined && i === filled - 1;
                return (
                    <span
                        key={i}
                        style={{
                            width:        6,
                            height:       isMine ? 19 : 14,
                            borderRadius: 1.5,
                            background:   isMine ? tone : isFilled ? 'rgba(255,255,255,0.88)' : FAINT,
                        }}
                    />
                );
            })}
        </span>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <span className="flex flex-col items-end gap-[3px]">
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: MUTE }}>
                {label}
            </span>
            <span
                style={{
                    fontFamily: MONO, fontSize: 16, fontWeight: 700, color: INK,
                    fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                }}
            >
                {value}
            </span>
        </span>
    );
}

export function RaceStartBoard({ board, x, y, lineup }: {
    board:  StartBoard;
    x:      number;
    y:      number;
    lineup: LineupState | null;
}) {
    const [, tick] = useReducer((n: number) => n + 1, 0);

    useEffect(() => {
        const id = window.setInterval(tick, TICK_MS);
        return () => window.clearInterval(id);
    }, []);

    const now  = Math.floor(Date.now() / 1000);
    const left = Math.max(0, board.startsAt - now);
    const full = board.registered >= board.maxRacers;
    const hint = lineup ? lineupHint(lineup) : null;
    const tone = CLASS_COLOR[board.class];

    const clockTone = left <= 10 ? WRONG : left <= 30 ? WARN : INK;

    const meta = [
        board.trackName,
        board.mode === 'sprint'
            ? t('racing.boardSprint', 'Sprint')
            : t('racing.boardLapCount', '{n} laps', { n: board.laps }),
        t('racing.boardGates', '{n} checkpoints', { n: board.gates }),
    ].join('  ·  ');

    const stencil: CSSProperties = {
        fontSize:              62,
        fontWeight:            800,
        lineHeight:            0.78,
        letterSpacing:         '-0.05em',
        color:                 'transparent',
        WebkitTextStrokeWidth: 2,
        WebkitTextStrokeColor: tone,
    };

    return (
        <div
            className="pointer-events-none absolute flex flex-col"
            style={{
                left:       `${x * 100}%`,
                top:        `${y * 100}%`,
                width:      BOARD_W,
                transform:  'translate(-50%, -100%)',
                zIndex:     3,
                textShadow: SHADOW,
                isolation:  'isolate',
            }}
        >
            <span style={SCRIM} />

            <div className="flex items-start gap-4">
                <span className="flex w-[84px] shrink-0 flex-col items-center gap-1">
                    <span style={stencil}>{board.class}</span>
                    <span
                        className="whitespace-nowrap"
                        style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', color: MUTE }}
                    >
                        {t('racing.boardClassBelow', 'AND BELOW')}
                    </span>
                </span>

                <span className="flex min-w-0 flex-1 flex-col pt-[3px]">
                    <span
                        className="truncate"
                        style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', color: INK, lineHeight: 1.12 }}
                    >
                        {board.name}
                    </span>
                    <span className="mt-1 truncate" style={{ fontSize: 13, fontWeight: 600, color: MUTE }}>
                        {meta}
                    </span>
                </span>

                <span className="flex shrink-0 flex-col items-end pt-[2px]">
                    <span
                        className={left <= 10 ? 'animate-pulse motion-reduce:animate-none' : undefined}
                        style={{
                            fontFamily: MONO, fontSize: 42, fontWeight: 700, color: clockTone,
                            letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1,
                        }}
                    >
                        {clock(left)}
                    </span>
                    <span className="mt-1" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', color: MUTE }}>
                        {t('racing.boardToStart', 'TO START')}
                    </span>
                </span>
            </div>

            <span
                className="mt-3 h-px w-full"
                style={{ background: `linear-gradient(90deg, transparent, ${tone} 18%, ${tone} 82%, transparent)` }}
            />

            <div className="mt-3 flex items-end justify-between gap-6">
                <span className="flex min-w-0 flex-col gap-[7px]">
                    <GridRail taken={board.registered} seats={board.maxRacers} joined={board.joined} tone={tone} />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: MUTE }}>
                        {t('racing.boardGridCount', '{n} of {m} on the grid', { n: board.registered, m: board.maxRacers })}
                    </span>
                </span>

                <span className="flex shrink-0 items-end gap-5">
                    <Stat
                        label={t('racing.boardBuyIn', 'BUY-IN')}
                        value={board.entryFee > 0 ? formatMoney(board.entryFee) : t('racing.boardNoFee', 'Free')}
                    />
                    <span className="h-[26px] w-px shrink-0" style={{ background: FAINT }} />
                    <Stat label={t('racing.boardPrize', 'PRIZE')} value={formatMoney(board.prizePool)} />
                </span>
            </div>

            <div className="mt-3.5 flex items-center gap-3">
                {hint && (
                    <span className="flex min-w-0 items-center gap-2">
                        <span style={{ width: 7, height: 7, borderRadius: 4, background: hint.tone }} />
                        <span className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: hint.tone }}>
                            {hint.text}
                        </span>
                    </span>
                )}

                <span className="ml-auto flex shrink-0 items-center gap-2">
                    <span
                        className="flex h-[20px] min-w-[20px] items-center justify-center rounded-[5px] px-1"
                        style={{
                            border: `1px solid ${MUTE}`, fontSize: 11.5, fontWeight: 700,
                            color: INK, textShadow: 'none', lineHeight: 1,
                        }}
                    >
                        E
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: full && !board.joined ? MUTE : tone }}>
                        {board.joined
                            ? t('racing.boardLeave', 'Leave')
                            : full
                                ? t('racing.boardFull', 'Grid full')
                                : t('racing.boardJoin', 'Join')}
                    </span>
                </span>
            </div>
        </div>
    );
}
