import { Star } from 'lucide-react';

import { isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { initials } from '@/lib/format';
import { driverStats, useRyde } from '../store';
import type { LeaderEntry } from '../data';
import { leaderScore } from '../data';
import { useRydeLeaderboard, useRydeLeaderWeight } from '../rydeApi';

const MEDAL_STYLES: { bg: string; ring: string; fg: string }[] = [
    { bg: 'linear-gradient(145deg,#FFE491,#F2B204)', ring: '#C99700', fg: '#6B4E00' },
    { bg: 'linear-gradient(145deg,#EDEFF2,#BCC2CA)', ring: '#98A0A8', fg: '#565C64' },
    { bg: 'linear-gradient(145deg,#E8A86F,#C77B3A)', ring: '#A45F26', fg: '#5E3411' },
];

export function Leaderboard() {
    const g = useRyde();
    const board = useRydeLeaderboard();
    const { prior, weight } = useRydeLeaderWeight();

    const localMe: LeaderEntry | null = (!isFiveM && g.authed && g.driver.enabled)
        ? { username: g.me?.username, name: g.me?.name || g.me?.username || t('ryde.you', 'You'), rating: driverStats(g.rides).avgRating ?? 5, trips: g.driver.trips, color: '#111' }
        : null;

    const rows: LeaderEntry[] = localMe ? [...board, localMe] : [...board];
    rows.sort((a, b) => leaderScore(b.rating, b.trips, prior, weight) - leaderScore(a.rating, a.trips, prior, weight) || b.trips - a.trips);
    const myUsername = g.me?.username;
    const myIndex = rows.findIndex(e => e === localMe || (!!myUsername && !!e.username && e.username === myUsername));

    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <div className="shrink-0 px-5 pb-1" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">{t('ryde.leaderboard', 'Leaderboard')}</h1>
                <p className="text-[17px] text-ios-gray">{t('ryde.topRatedDrivers', 'Top-rated drivers in Los Santos')}</p>
            </div>

            <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-3">
                <div className="overflow-hidden rounded-[14px] bg-surface">
                    {rows.map((r, i) => {
                        const rank = i + 1;
                        const isMe = i === myIndex;
                        const name = r.username ?? r.name;
                        const av = name.includes(' ') ? initials(name) : name.slice(0, 2).toUpperCase();
                        return (
                            <div
                                key={name + i}
                                className={'relative flex items-center gap-3.5 px-4 py-4 ' + (isMe ? 'bg-black/[0.06] dark:bg-white/[0.10]' : '')}
                            >
                                <div className="flex w-[34px] shrink-0 justify-center">
                                    {rank <= 3 ? (
                                        <span
                                            className="flex h-[33px] w-[33px] items-center justify-center rounded-full text-[16px] font-extrabold"
                                            style={{
                                                background: MEDAL_STYLES[rank - 1].bg,
                                                color: MEDAL_STYLES[rank - 1].fg,
                                                boxShadow: `inset 0 0 0 1.5px ${MEDAL_STYLES[rank - 1].ring}, 0 1px 2.5px rgba(0,0,0,0.25)`,
                                            }}
                                        >
                                            {rank}
                                        </span>
                                    ) : (
                                        <span className="text-[20px] font-bold text-ios-gray">{rank}</span>
                                    )}
                                </div>
                                <span
                                    className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full text-[19px] font-bold text-white"
                                    style={{ background: r.color }}
                                >
                                    {av}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[20px] font-semibold text-black dark:text-white">
                                        {name}
                                    </p>
                                    <p className="text-[16px] text-ios-gray">{t('ryde.tripsCount', '{n} trips', { n: r.trips.toLocaleString() })}</p>
                                </div>
                                <span className="inline-flex shrink-0 items-center gap-1 text-[19px] font-bold text-black dark:text-white">
                                    <Star className="h-[18px] w-[18px]" style={{ color: '#FF9600', fill: '#FF9600' }} /> {r.rating.toFixed(2)}
                                </span>
                                {i < rows.length - 1 && (
                                    <div className="pointer-events-none absolute bottom-0 left-4 right-0 h-px bg-black/[0.07] dark:bg-white/[0.08]" />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
