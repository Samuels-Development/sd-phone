import { useState } from 'react';
import { ChevronRight, Coins, Cpu, Globe, Trophy, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { t } from '@/i18n';
import type { Side } from './onlineApi';
import type { GameStats, Tally } from './statsApi';

export interface GameStartConfig {
    icon:               React.ComponentType;
    title:              string;
    accent:             string;
    sideOptions:        { id: Side; label: string }[];
    difficultyOptions?: { id: string; label: string }[];
    onlineBlurb:        string;
    soloLabel?:         string;
    soloBlurb?:         string;
    hideSetup?:         boolean;
    hideOnline?:        boolean;
}

interface StartScreenProps {
    config:         GameStartConfig;
    stats:          GameStats;
    hasInvite?:     boolean;
    chips?:         number;
    buyIn?:         number;
    onCashier?:     () => void;
    onPlayCpu:      (side: Side, difficulty: string) => void;
    onPlayOnline?:  () => void;
    onLeaderboard:  () => void;
}

export function StartScreen({ config, stats, hasInvite, chips, buyIn, onCashier, onPlayCpu, onPlayOnline, onLeaderboard }: StartScreenProps) {
    const { icon: Icon, title, accent, sideOptions, difficultyOptions, onlineBlurb, hideSetup, hideOnline, soloLabel, soloBlurb } = config;
    const cpuLabel = soloLabel ?? t('games.vsComputer', 'vs Computer');
    const cantAfford = buyIn !== undefined && chips !== undefined && chips < buyIn;
    const [side, setSide] = useState<Side>(sideOptions[0].id);
    const [diff, setDiff] = useState<string>(difficultyOptions ? difficultyOptions[Math.min(1, difficultyOptions.length - 1)].id : 'medium');

    return (
        <div className="flex flex-1 flex-col px-5 pt-2">
            <div className="mx-auto h-[60px] w-[60px] overflow-hidden rounded-[14px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full" style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.45)' }}>
                <Icon />
            </div>
            <h1 className="mt-2 text-center text-[28px] font-extrabold tracking-tight text-white">{title}</h1>

            {chips !== undefined && (
                <button type="button" onClick={onCashier} className="mx-auto mt-2.5 flex items-center gap-1.5 active:opacity-70">
                    <Coins className="h-[19px] w-[19px]" strokeWidth={2.5} style={{ color: accent }} />
                    <span className="text-[22px] font-extrabold tabular-nums text-white">{chips.toLocaleString('en-US')}</span>
                    <span className="ml-0.5 text-[13px] font-semibold text-white/50">{t('games.chips', 'chips')}</span>
                </button>
            )}

            <div className="mt-5 rounded-[18px] p-4" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <div className={`flex items-center gap-2 text-[15px] font-bold text-white ${soloBlurb ? 'mb-1' : 'mb-3'}`}>
                    <Cpu className="h-[18px] w-[18px]" strokeWidth={2.2} /> {cpuLabel}
                </div>
                {soloBlurb && <p className="mb-3 text-[13px] text-white/55">{soloBlurb}</p>}

                {!hideSetup && (
                    <>
                        <Label>{t('games.playAs', 'Play as')}</Label>
                        <Segmented value={side} onChange={setSide} options={sideOptions} />
                        {difficultyOptions && (
                            <>
                                <div className="h-3" />
                                <Label>{t('games.difficulty', 'Difficulty')}</Label>
                                <Segmented value={diff} onChange={setDiff} options={difficultyOptions} />
                            </>
                        )}
                    </>
                )}

                {buyIn !== undefined && (
                    <div className="mt-3 flex items-center justify-between text-[13px]">
                        <span className="font-semibold text-white/45">{t('games.buyIn', 'Buy-in')}</span>
                        <span className="font-bold text-white">{t('games.chipsAmount', '{n} chips', { n: buyIn.toLocaleString('en-US') })}</span>
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => (cantAfford ? onCashier?.() : onPlayCpu(side, diff))}
                    className="mt-4 w-full rounded-[14px] py-3 text-center text-[17px] font-bold text-white active:opacity-80"
                    style={{ background: accent }}
                >
                    {cantAfford ? t('games.getChipsToPlay', 'Get chips to play') : t('games.play', 'Play')}
                </button>
            </div>

            {!hideOnline && (
                <div className="mt-4 rounded-[18px] p-4" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <div className="mb-1 flex items-center gap-2 text-[15px] font-bold text-white">
                        <Globe className="h-[18px] w-[18px]" strokeWidth={2.2} /> {t('games.online', 'Online')}
                        {hasInvite && (
                            <span className="ml-0.5 rounded-full px-2 py-[2px] text-[10px] font-extrabold uppercase tracking-wide text-white" style={{ background: accent }}>{t('games.inviteBadge', 'Invite')}</span>
                        )}
                    </div>
                    <p className="mb-3 text-[13px] text-white/55">{onlineBlurb}</p>
                    <button
                        type="button"
                        onClick={onPlayOnline}
                        className="flex w-full items-center justify-center gap-2 rounded-[14px] py-3 text-center text-[17px] font-bold text-white active:opacity-80"
                        style={{ background: hasInvite ? accent : 'rgba(255,255,255,0.16)' }}
                    >
                        {t('games.playOnline', 'Play Online')}
                        {hasInvite && <span className="h-2 w-2 rounded-full bg-white" />}
                    </button>
                </div>
            )}

            <div className="mt-auto flex flex-col gap-3">
                {onCashier ? (
                    <div className="flex gap-3">
                        <button type="button" onClick={onCashier} className="flex flex-1 items-center justify-center gap-2 rounded-[16px] py-3.5 text-[15px] font-bold text-white active:opacity-80" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <Wallet className="h-[18px] w-[18px]" strokeWidth={2.2} style={{ color: accent }} /> {t('games.cashier', 'Cashier')}
                            <ChevronRight className="h-[16px] w-[16px] text-white/40" strokeWidth={2.4} />
                        </button>
                        <button type="button" onClick={onLeaderboard} className="flex flex-1 items-center justify-center gap-2 rounded-[16px] py-3.5 text-[15px] font-bold text-white active:opacity-80" style={{ background: 'rgba(255,255,255,0.06)' }}>
                            <Trophy className="h-[18px] w-[18px] text-[#FFD54F]" strokeWidth={2.2} /> {t('games.leaderboard', 'Leaderboard')}
                            <ChevronRight className="h-[16px] w-[16px] text-white/40" strokeWidth={2.4} />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={onLeaderboard}
                        className="flex items-center justify-between rounded-[16px] px-4 py-3.5 active:opacity-80"
                        style={{ background: 'rgba(255,255,255,0.06)' }}
                    >
                        <span className="flex items-center gap-2.5 text-[16px] font-bold text-white">
                            <Trophy className="h-[19px] w-[19px] text-[#FFD54F]" strokeWidth={2.2} /> {t('games.leaderboard', 'Leaderboard')}
                        </span>
                        <ChevronRight className="h-[19px] w-[19px] text-white/40" strokeWidth={2.4} />
                    </button>
                )}

                <div className="rounded-[16px] px-4 py-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">{t('games.record', 'Record')}</div>
                    <StatRow label={cpuLabel} tally={stats.cpu} Icon={Cpu} />
                    {!hideOnline && (
                        <>
                            <div className="my-2 h-px bg-white/10" />
                            <StatRow label={t('games.vsPlayers', 'vs Players')} tally={stats.online} Icon={Users} />
                        </>
                    )}
                    {chips !== undefined && (
                        <>
                            <div className="my-2 h-px bg-white/10" />
                            <div className="flex items-center justify-between">
                                <span className="flex items-center gap-2 text-[15px] font-bold text-white/85">
                                    <Coins className="h-[17px] w-[17px]" strokeWidth={2.2} style={{ color: accent }} /> {t('games.chipsLabel', 'Chips')}
                                </span>
                                <span className="flex items-center gap-3.5 text-[14px] font-semibold">
                                    <span><span className="font-extrabold text-[#9CCC65]">+{stats.won.toLocaleString('en-US')}</span> {t('games.wonSuffix', 'won')}</span>
                                    <span><span className="font-extrabold text-[#FF8A80]">-{stats.lost.toLocaleString('en-US')}</span> {t('games.lostSuffix', 'lost')}</span>
                                </span>
                            </div>
                        </>
                    )}
                </div>
            </div>
            <div className="pb-10" />
        </div>
    );
}

function StatRow({ label, tally, Icon }: { label: string; tally: Tally; Icon: LucideIcon }) {
    return (
        <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[15px] font-bold text-white/85">
                <Icon className="h-[17px] w-[17px] text-white/55" strokeWidth={2.2} />
                {label}
            </span>
            <span className="flex items-center gap-3.5 text-[14px] font-semibold text-white/80">
                <span><span className="font-extrabold text-[#9CCC65]">{tally.wins}</span> {t('games.winsShort', 'W')}</span>
                <span><span className="font-extrabold text-[#FF8A80]">{tally.losses}</span> {t('games.lossesShort', 'L')}</span>
                <span><span className="font-extrabold text-white">{tally.draws}</span> {t('games.drawsShort', 'D')}</span>
            </span>
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-white/45">{children}</div>;
}

function Segmented<T extends string>({ value, onChange, options }: {
    value: T;
    onChange: (v: T) => void;
    options: { id: T; label: string }[];
}) {
    return (
        <div className="flex rounded-[11px] p-0.5" style={{ background: 'rgba(0,0,0,0.28)' }}>
            {options.map(o => {
                const active = value === o.id;
                return (
                    <button
                        key={o.id}
                        type="button"
                        onClick={() => onChange(o.id)}
                        className="flex-1 rounded-[9px] py-1.5 text-[14px] font-semibold transition"
                        style={{ color: active ? '#211F1D' : 'rgba(255,255,255,0.7)', background: active ? '#fff' : 'transparent', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.3)' : undefined }}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
