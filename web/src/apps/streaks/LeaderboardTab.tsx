import { Flame, Loader2, Trophy } from 'lucide-react';

import { EmptyState } from '@/ui/EmptyState';
import { useAsyncData } from '@/hooks/useAsyncData';
import { t } from '@/i18n';
import type { LeaderboardEntry } from './data';
import { streaksLeaderboard } from './streaksApi';

const STREAK_ORANGE = '#FF7A1A';

const MEDAL: Record<number, string> = {
    1: '#FFC93C',
    2: '#C2C9D1',
    3: '#D08A4E',
};

export function LeaderboardTab({ dark }: { dark: boolean }) {
    const { data, loading } = useAsyncData(streaksLeaderboard, []);
    const rows = data ?? [];

    if (loading) {
        return (
            <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-ios-gray" strokeWidth={2.4} />
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="flex-1 overflow-y-auto no-scrollbar">
                <EmptyState
                    icon={Trophy}
                    title={t('streaks.noStreaksTitle', 'No Streaks Yet')}
                    subtitle={t('streaks.noStreaksSubtitle', 'Post a photo every day to climb the leaderboard.')}
                />
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-6 pt-2">
            <div className="flex flex-col gap-2.5">
                {rows.map(row => (
                    <Row key={`${row.rank}-${row.name}`} row={row} dark={dark} />
                ))}
            </div>
        </div>
    );
}

function Row({ row, dark }: { row: LeaderboardEntry; dark: boolean }) {
    const medal = MEDAL[row.rank];

    const base = dark ? 'bg-surface' : 'bg-surface';
    const mineRing = row.isMe ? 'ring-2' : '';

    return (
        <div
            className={`flex items-center gap-3.5 rounded-2xl px-4 py-4 shadow-sm ${base} ${mineRing}`}
            style={row.isMe ? ({ '--tw-ring-color': STREAK_ORANGE } as React.CSSProperties) : undefined}
        >
            {medal ? (
                <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[19px] font-extrabold text-black shadow-sm"
                    style={{ background: medal }}
                >
                    {row.rank}
                </span>
            ) : (
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[19px] font-bold tabular-nums ${dark ? 'bg-white/[0.06] text-white/55' : 'bg-black/[0.05] text-black/45'}`}>
                    {row.rank}
                </span>
            )}

            <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-[18.5px] font-bold tracking-tight">{row.name}</span>
                {row.isMe && (
                    <span
                        className="shrink-0 rounded-full px-2 py-[2px] text-[10.5px] font-extrabold uppercase tracking-wide text-white"
                        style={{ background: STREAK_ORANGE }}
                    >
                        {t('streaks.you', 'You')}
                    </span>
                )}
            </div>

            <div
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2"
                style={{ background: `${STREAK_ORANGE}22`, color: STREAK_ORANGE }}
            >
                <Flame className="h-[19px] w-[19px]" strokeWidth={2.6} fill={STREAK_ORANGE} />
                <span className="text-[19px] font-extrabold tabular-nums">{row.current}</span>
            </div>
        </div>
    );
}
