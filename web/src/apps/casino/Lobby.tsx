import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight, Coins, Info, Trophy, Wallet } from 'lucide-react';

import { t } from '@/i18n';
import { CasinoIcon } from '@/shell/AppIconSVG';
import { Scroller } from '@/ui/Scroller';
import { loadStats, type GameStats } from '@/apps/_games/statsApi';

import { BaccaratThumb } from './baccarat/Thumb';
import { CrashThumb } from './crash/Thumb';
import { HoldemThumb } from './holdem/Thumb';
import { casinoGames, type CasinoGame, GAME_ACCENT } from './casinoApi';
import { CARD_SHADOW, FELT, GOLD, GOLD_FRAME, SURFACE, TABLE, WELL_SHADOW, fmtChips } from './theme';

const emptyStats = (): GameStats => ({ cpu: { wins: 0, losses: 0, draws: 0 }, online: { wins: 0, losses: 0, draws: 0 }, won: 0, lost: 0 });
const blankRecord = (): Record<CasinoGame, GameStats> => ({
    blackjack: emptyStats(), holdem: emptyStats(), crash: emptyStats(),
    baccarat: emptyStats(), roulette: emptyStats(), slots: emptyStats(),
});

const GAME_LABEL: Record<CasinoGame, () => string> = {
    blackjack: () => t('casino.blackjack', 'Blackjack'),
    holdem:    () => t('casino.holdem', "Texas Hold'em"),
    crash:     () => t('casino.crash', 'Crash'),
    baccarat:  () => t('casino.baccarat', 'Baccarat'),
    roulette:  () => t('casino.roulette', 'Roulette'),
    slots:     () => t('casino.slots', 'Slots'),
};

const GAME_DESC: Record<CasinoGame, () => string> = {
    blackjack: () => t('casino.blackjackDesc', 'Beat the dealer to 21'),
    holdem:    () => t('casino.holdemDesc', 'No limit, up to six players'),
    crash:     () => t('casino.crashDesc', 'Cash out before it busts'),
    baccarat:  () => t('casino.baccaratDesc', 'Player, Banker or Tie'),
    roulette:  () => t('casino.rouletteDesc', 'Single zero, thirty seven pockets'),
    slots:     () => t('casino.slotsDesc', 'Three reels, five lines'),
};

const GAME_THUMB: Record<CasinoGame, () => ReactNode> = {
    blackjack: () => <BlackjackThumb />,
    holdem:    () => <HoldemThumb />,
    crash:     () => <CrashThumb />,
    baccarat:  () => <BaccaratThumb />,
    roulette:  () => <RouletteThumb />,
    slots:     () => <SlotsThumb />,
};

export function Lobby({ chips, onPlay, onCashier, onLeaderboards, onRules }: {
    chips:          number;
    onPlay:         (game: CasinoGame) => void;
    onCashier:      () => void;
    onLeaderboards: () => void;
    onRules:        (game: CasinoGame) => void;
}) {
    const GAMES = useMemo(() => casinoGames(), []);
    const [stats, setStats] = useState<Record<CasinoGame, GameStats>>(blankRecord);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let live = true;
        void Promise.all(GAMES.map(g => loadStats(g)))
            .then(list => {
                if (!live) return;
                const next = blankRecord();
                GAMES.forEach((g, i) => { next[g] = list[i]; });
                setStats(next);
            })
            .catch(() => { if (live) setFailed(true); });
        return () => { live = false; };
    }, [GAMES]);

    const won    = GAMES.reduce((n, g) => n + stats[g].won, 0);
    const lost   = GAMES.reduce((n, g) => n + stats[g].lost, 0);
    const wins   = GAMES.reduce((n, g) => n + stats[g].cpu.wins, 0);
    const played = GAMES.reduce((n, g) => n + stats[g].cpu.wins + stats[g].cpu.losses + stats[g].cpu.draws, 0);
    const winRate = played > 0 ? Math.round((wins / played) * 100) : 0;

    return (
        <Scroller className="min-h-0 flex-1">
            <div className="flex flex-col px-5 pb-10 pt-1">
                <div
                    className="mx-auto h-[60px] w-[60px] overflow-hidden rounded-[14px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
                    style={{ boxShadow: CARD_SHADOW }}
                >
                    <CasinoIcon />
                </div>
                <h1 className="mt-2 text-center text-[28px] font-extrabold tracking-tight text-white">{t('casino.title', 'Casino')}</h1>

                <button type="button" onClick={onCashier} className="mx-auto mt-2 flex items-center gap-1.5 active:opacity-70">
                    <Coins className="h-[19px] w-[19px]" strokeWidth={2.5} style={{ color: TABLE.chip }} />
                    <span className="text-[22px] font-extrabold tabular-nums" style={{ color: TABLE.chip }}>{fmtChips(chips)}</span>
                    <span className="ml-0.5 text-[13px] font-semibold text-white/55">{t('casino.chips', 'chips')}</span>
                </button>

                <div className="mt-5 flex flex-col gap-3">
                    {GAMES.map(game => (
                        <GameCard key={game} game={game} onPlay={() => onPlay(game)} onRules={() => onRules(game)} />
                    ))}
                </div>

                <div className="mt-3 flex gap-3">
                    <TileButton
                        icon={<Wallet className="h-[18px] w-[18px]" strokeWidth={2.4} />}
                        label={t('casino.cashier', 'Cashier')}
                        onClick={onCashier}
                        background={GOLD_FRAME}
                        color={FELT.bot}
                    />
                    <TileButton
                        icon={<Trophy className="h-[18px] w-[18px]" strokeWidth={2.2} style={{ color: GOLD.top }} />}
                        label={t('casino.leaderboards', 'Leaderboards')}
                        onClick={onLeaderboards}
                    />
                </div>

                <div className="mt-3 rounded-[16px] px-4 py-3" style={{ background: SURFACE.sunken, boxShadow: WELL_SHADOW }}>
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-[12px] font-bold uppercase tracking-wide text-white/45">{t('casino.record', 'Record')}</span>
                        <span className="text-[12px] font-semibold text-white/45">{t('casino.winRate', '{winRate}% win rate', { winRate })}</span>
                    </div>
                    {GAMES.map(game => (
                        <div key={game} className="flex items-center justify-between py-[3px]">
                            <span className="text-[15px] font-bold text-white/85">{GAME_LABEL[game]()}</span>
                            <span className="flex items-center gap-3.5 text-[14px] font-semibold tabular-nums text-white/80">
                                <span><span className="font-extrabold text-[#9CCC65]">{stats[game].cpu.wins}</span> {t('casino.winsShort', 'W')}</span>
                                <span><span className="font-extrabold text-[#FF8A80]">{stats[game].cpu.losses}</span> {t('casino.lossesShort', 'L')}</span>
                                <span><span className="font-extrabold text-white">{stats[game].cpu.draws}</span> {t('casino.drawsShort', 'D')}</span>
                            </span>
                        </div>
                    ))}
                    <div className="my-2 h-px" style={{ background: SURFACE.hair }} />
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[15px] font-bold text-white/85">
                            <Coins className="h-[17px] w-[17px]" strokeWidth={2.2} style={{ color: TABLE.chip }} />
                            {t('casino.chipsLabel', 'Chips')}
                        </span>
                        <span className="flex items-center gap-3.5 text-[14px] font-semibold tabular-nums">
                            <span><span className="font-extrabold text-[#9CCC65]">+{fmtChips(won)}</span> {t('casino.won', 'won')}</span>
                            <span><span className="font-extrabold text-[#FF8A80]">-{fmtChips(lost)}</span> {t('casino.lost', 'lost')}</span>
                        </span>
                    </div>
                    {failed && (
                        <div className="mt-2 text-center text-[13px] font-semibold" style={{ color: TABLE.lose }}>
                            {t('casino.somethingWrong', 'Something went wrong')}
                        </div>
                    )}
                </div>
            </div>
        </Scroller>
    );
}

function GameCard({ game, onPlay, onRules }: { game: CasinoGame; onPlay: () => void; onRules: () => void }) {
    return (
        <div
            className="flex items-center gap-3 rounded-[20px] px-4 py-3.5"
            style={{ background: SURFACE.panel, boxShadow: `${CARD_SHADOW}, inset 0 2px 0 rgba(255,255,255,0.05)` }}
        >
            <div className="shrink-0">
                {GAME_THUMB[game]()}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[17px] font-bold text-white">{GAME_LABEL[game]()}</span>
                <span className="truncate text-[13px] font-semibold text-white/55">{GAME_DESC[game]()}</span>
            </div>
            <button
                type="button"
                onClick={onRules}
                aria-label={t('casino.paytable', 'Paytable')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:opacity-60"
                style={{ background: SURFACE.sunken }}
            >
                <Info className="h-[18px] w-[18px] text-white/60" strokeWidth={2.2} />
            </button>
            <button
                type="button"
                onClick={onPlay}
                className="shrink-0 rounded-[13px] px-4 py-2.5 text-[15px] font-bold text-white active:opacity-80"
                style={{ background: GAME_ACCENT[game], boxShadow: '0 1px 0 rgba(0,0,0,0.35)' }}
            >
                {t('casino.play', 'Play')}
            </button>
        </div>
    );
}

function TileButton({ icon, label, onClick, background, color }: {
    icon: ReactNode; label: string; onClick: () => void; background?: string; color?: string;
}) {
    const gold = background !== undefined;
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex flex-1 items-center justify-center gap-2 rounded-[16px] py-3.5 text-[15px] font-bold active:opacity-80"
            style={{
                background: background ?? SURFACE.soft,
                color: color ?? '#fff',
                boxShadow: gold ? `inset 0 1px 0 ${GOLD.hi}, 0 1px 0 rgba(0,0,0,0.35)` : `inset 0 1px 0 ${SURFACE.hair}`,
            }}
        >
            {icon}{label}
            <ChevronRight className="h-[16px] w-[16px]" strokeWidth={2.4} style={{ opacity: 0.45 }} />
        </button>
    );
}

function BlackjackThumb() {
    return (
        <svg width="52" height="52" viewBox="0 0 56 56" aria-hidden="true">
            <g transform="rotate(-14 20 32)">
                <rect x="7" y="14" width="24" height="34" rx="4" fill="#E7ECE9" stroke="rgba(0,0,0,0.18)" />
                <text x="11" y="26" fontSize="12" fontWeight="800" fill={TABLE.black}>A</text>
                <text x="18" y="43" fontSize="15" fill={TABLE.black}>&#9824;</text>
            </g>
            <g transform="rotate(12 36 32)">
                <rect x="25" y="12" width="24" height="34" rx="4" fill="#FFFFFF" stroke="rgba(0,0,0,0.18)" />
                <text x="29" y="24" fontSize="12" fontWeight="800" fill={TABLE.red}>K</text>
                <text x="36" y="41" fontSize="15" fill={TABLE.red}>&#9829;</text>
            </g>
        </svg>
    );
}

function wedgePath(i: number) {
    const a0 = (i * Math.PI) / 4;
    const a1 = a0 + Math.PI / 4;
    const r0 = 9;
    const r1 = 22;
    const p = (r: number, a: number) => `${(28 + r * Math.sin(a)).toFixed(2)} ${(28 - r * Math.cos(a)).toFixed(2)}`;
    return `M ${p(r0, a0)} L ${p(r1, a0)} A ${r1} ${r1} 0 0 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
}

function RouletteThumb() {
    return (
        <svg width="52" height="52" viewBox="0 0 56 56" aria-hidden="true">
            <defs>
                <linearGradient id="csn-lobby-wheel" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={GOLD.top} />
                    <stop offset="45%" stopColor={GOLD.mid} />
                    <stop offset="100%" stopColor={GOLD.deep} />
                </linearGradient>
            </defs>
            <circle cx="28" cy="28" r="25" fill={FELT.bot} />
            <circle cx="28" cy="28" r="23.5" fill="none" stroke="url(#csn-lobby-wheel)" strokeWidth="3" />
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
                <path key={i} d={wedgePath(i)} fill={i % 2 === 0 ? TABLE.red : TABLE.black} />
            ))}
            <circle cx="28" cy="28" r="7" fill="url(#csn-lobby-wheel)" />
            <circle cx="28" cy="28" r="2.6" fill={FELT.mid} />
        </svg>
    );
}

function SlotsThumb() {
    return (
        <svg width="52" height="52" viewBox="0 0 56 56" aria-hidden="true">
            <defs>
                <linearGradient id="csn-lobby-cabinet" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={GOLD.top} />
                    <stop offset="45%" stopColor={GOLD.mid} />
                    <stop offset="100%" stopColor={GOLD.deep} />
                </linearGradient>
            </defs>
            <rect x="3" y="8" width="50" height="40" rx="9" fill="url(#csn-lobby-cabinet)" />
            <rect x="7" y="12" width="42" height="32" rx="6" fill={FELT.bot} />
            <rect x="9.5" y="15.5" width="12" height="25" rx="3" fill="#F3F6F4" />
            <rect x="22" y="15.5" width="12" height="25" rx="3" fill="#F3F6F4" />
            <rect x="34.5" y="15.5" width="12" height="25" rx="3" fill="#F3F6F4" />
            <text x="15.5" y="33" fontSize="15" fontWeight="800" textAnchor="middle" fill={TABLE.red}>7</text>
            <text x="28" y="33" fontSize="15" fontWeight="800" textAnchor="middle" fill={TABLE.red}>7</text>
            <text x="40.5" y="33" fontSize="15" fontWeight="800" textAnchor="middle" fill={TABLE.red}>7</text>
        </svg>
    );
}
