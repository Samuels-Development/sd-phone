import { ChevronRight, Clock, Gamepad2, Trophy } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { t } from '@/i18n';

interface ScoreStartConfig {
    icon:   React.ComponentType;
    title:  string;
    accent: string;
    flavor: string;
}

interface ScoreStartScreenProps {
    config:        ScoreStartConfig;
    stats:         { high: number; plays: number; last: number };
    onPlay:        () => void;
    onLeaderboard: () => void;
    playLabel?:    string;
    children?:     ReactNode;
}

/**
 * The shared landing ("visual main menu") for single-player high-score games (Blocks, Flappy).
 * Mirrors the _games StartScreen card/accent language: a play card carrying the game's flavor text,
 * a Leaderboard row, and a Record card (plays / high score / most recent) in the same place and
 * style as the vs-game Record card - just with score stats instead of W/L/D.
 */
export function ScoreStartScreen({ config, stats, onPlay, onLeaderboard, playLabel, children }: ScoreStartScreenProps) {
    const { icon: Icon, title, accent, flavor } = config;
    return (
        <div className="flex flex-1 flex-col px-5 pt-2">
            <div className="mx-auto h-[60px] w-[60px] overflow-hidden rounded-[14px] [&>svg]:block [&>svg]:h-full [&>svg]:w-full" style={{ boxShadow: '0 8px 20px rgba(0,0,0,0.45)' }}>
                <Icon />
            </div>
            <h1 className="mt-2 text-center text-[28px] font-extrabold tracking-tight text-white">{title}</h1>

            <div className="mt-5 rounded-[18px] p-5" style={{ background: 'rgba(255,255,255,0.07)' }}>
                <p className="text-[14px] leading-snug text-white/70">{flavor}</p>
                {children}
                <button
                    type="button"
                    onClick={onPlay}
                    className="mt-4 w-full rounded-[14px] py-3 text-center text-[17px] font-bold text-white active:opacity-80"
                    style={{ background: accent }}
                >
                    {playLabel ?? t('games.play', 'Play')}
                </button>
            </div>

            <div className="mt-auto flex flex-col gap-3">
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

                <div className="rounded-[16px] px-4 py-3" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-white/40">{t('games.record', 'Record')}</div>
                    <RecordRow label={t('games.plays', 'Plays')} value={stats.plays} Icon={Gamepad2} />
                    <div className="my-2 h-px bg-white/10" />
                    <RecordRow label={t('games.highScore', 'High score')} value={stats.high} Icon={Trophy} color={accent} />
                    <div className="my-2 h-px bg-white/10" />
                    <RecordRow label={t('games.mostRecent', 'Most recent')} value={stats.last} Icon={Clock} />
                </div>
            </div>
            <div className="pb-10" />
        </div>
    );
}

function RecordRow({ label, value, Icon, color }: { label: string; value: number; Icon: LucideIcon; color?: string }) {
    return (
        <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[15px] font-bold text-white/85">
                <Icon className="h-[17px] w-[17px] text-white/55" strokeWidth={2.2} />
                {label}
            </span>
            <span className="text-[16px] font-extrabold tabular-nums" style={{ color: color ?? '#fff' }}>
                {value.toLocaleString('en-US')}
            </span>
        </div>
    );
}
