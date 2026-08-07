import { useEffect, useReducer } from 'react';
import type { CSSProperties } from 'react';

import { t } from '@/i18n';
import { formatMoney, startsInLabel } from '@/apps/racing/data';
import type { LineupState, StartBoard } from '@/apps/racing/data';
import { RACING_ACCENT } from '@/apps/racing/racingTheme';

const TICK_MS = 500;
const BOARD_W = 336;

const INK    = 'rgba(6, 9, 14, 0.92)';
const LINE   = 'rgba(255, 255, 255, 0.10)';
const TEXT   = '#F2F5F8';
const MUTE   = 'rgba(242, 245, 248, 0.48)';
const WARN   = '#FFD60A';
const ON_INK = '#04120E';

const SLAB: CSSProperties = {
    background: INK,
    border:     `1px solid ${LINE}`,
    boxShadow:  '0 14px 40px rgba(0, 0, 0, 0.6)',
    width:      BOARD_W,
};

function lineupCopy(state: LineupState): { text: string; tone: string } {
    if (state === 'vehicle') return { text: t('racing.lineupVehicle', 'Get in a vehicle'), tone: WARN };
    if (state === 'turn')    return { text: t('racing.lineupTurn', 'Turn to face the track'), tone: WARN };
    if (state === 'backup')  return { text: t('racing.lineupBackup', 'Back up behind the line'), tone: WARN };
    return { text: t('racing.lineupReady', 'Lined up and ready'), tone: RACING_ACCENT };
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex min-w-0 flex-col gap-[4px]">
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: MUTE }}>{label}</span>
            <span
                className="truncate"
                style={{ fontSize: 15, fontWeight: 700, color: TEXT, fontVariantNumeric: 'tabular-nums' }}
            >
                {value}
            </span>
        </div>
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
    const full = board.registered >= board.maxRacers;
    const hint = lineup && board.joined ? lineupCopy(lineup) : null;

    return (
        <div
            className="pointer-events-none absolute"
            style={{
                left:      `${x * 100}%`,
                top:       `${y * 100}%`,
                transform: 'translate(-50%, -100%)',
                zIndex:    3,
            }}
        >
            <div className="overflow-hidden rounded-[13px]" style={SLAB}>
                <div className="flex items-stretch">
                    <div
                        className="flex w-[58px] shrink-0 flex-col items-center justify-center gap-[2px] py-2.5"
                        style={{ background: RACING_ACCENT }}
                    >
                        <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 0.9, color: ON_INK, letterSpacing: '-0.04em' }}>
                            {board.class}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', color: 'rgba(4, 18, 14, 0.62)' }}>
                            {t('racing.boardClass', 'CLASS')}
                        </span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-[3px] px-3 py-2.5">
                        <span className="truncate" style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>
                            {board.name}
                        </span>
                        <span className="truncate" style={{ fontSize: 13, fontWeight: 600, color: MUTE }}>
                            {board.trackName}
                        </span>
                    </div>
                </div>

                <div className="h-px w-full" style={{ background: LINE }} />

                <div className="px-3 py-[7px]">
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(242, 245, 248, 0.80)' }}>
                        {t('racing.boardClassCeiling', 'Class {cls} and below may enter', { cls: board.class })}
                    </span>
                </div>

                <div className="h-px w-full" style={{ background: LINE }} />

                <div className="grid grid-cols-4 gap-2 px-3 py-2.5">
                    <Stat
                        label={t('racing.boardGrid', 'GRID')}
                        value={`${board.registered}/${board.maxRacers}`}
                    />
                    <Stat
                        label={t('racing.boardLaps', 'LAPS')}
                        value={board.mode === 'sprint' ? t('racing.boardSprint', 'Sprint') : String(board.laps)}
                    />
                    <Stat label={t('racing.boardBuyIn', 'BUY IN')} value={board.entryFee > 0 ? formatMoney(board.entryFee) : t('racing.boardFree', 'Free')} />
                    <Stat label={t('racing.boardPool', 'POOL')} value={formatMoney(board.prizePool)} />
                </div>

                <div className="h-px w-full" style={{ background: LINE }} />

                <div className="flex items-center justify-between gap-2 px-3 py-[9px]">
                    <span style={{ fontSize: 13, fontWeight: 700, color: MUTE, fontVariantNumeric: 'tabular-nums' }}>
                        {startsInLabel(board.startsAt, now)}
                    </span>
                    <span className="flex items-center gap-2">
                        <span
                            className="flex h-[21px] w-[21px] items-center justify-center rounded-[5px]"
                            style={{ background: 'rgba(255,255,255,0.15)', fontSize: 11.5, fontWeight: 800, color: TEXT }}
                        >
                            E
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>
                            {board.joined
                                ? t('racing.boardLeave', 'Leave')
                                : full
                                    ? t('racing.boardFull', 'Grid full')
                                    : t('racing.boardJoin', 'Join')}
                        </span>
                    </span>
                </div>

                {hint && (
                    <>
                        <div className="h-px w-full" style={{ background: LINE }} />
                        <div className="px-3 py-[8px]">
                            <span style={{ fontSize: 13, fontWeight: 700, color: hint.tone }}>{hint.text}</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
