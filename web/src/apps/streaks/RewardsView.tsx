import { ChevronLeft, Flame, Gift } from 'lucide-react';

import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import type { StreakConfig, StreakState } from './data';

const STREAK_ORANGE = '#FF7A1A';
const SB_H = 54;

function money(n: number): string {
    return formatMoney(n, { whole: true });
}

export function RewardsView({ state, config, dark, onBack }: {
    state:  StreakState;
    config: StreakConfig;
    dark:   boolean;
    onBack: () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);

    const current = state.current;
    const rewardFor: Record<number, number> = {};
    for (const m of config.milestones) rewardFor[m.day] = m.reward;
    const lastDay = config.milestones.length ? config.milestones[config.milestones.length - 1].day : 1;
    const beyond = current > lastDay;

    const days: number[] = [];
    for (let d = 1; d <= lastDay; d++) days.push(d);

    const mutedLine = dark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.13)';

    return (
        <div
            className={`absolute inset-0 z-40 flex flex-col select-none ${dark ? 'bg-black text-white' : 'bg-[#d4d4d4] text-black'}`}
            style={pageStyle}
        >
            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="flex shrink-0 items-center px-2 pb-0.5 pt-1">
                <button
                    type="button"
                    onClick={goBack}
                    aria-label={t('streaks.back', 'Back')}
                    className="flex h-9 items-center pl-1 pr-2 text-[16px] font-semibold active:opacity-60"
                    style={{ color: STREAK_ORANGE }}
                >
                    <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.6} />
                    {t('streaks.streaks', 'Streaks')}
                </button>
            </div>

            <div className="px-5 pb-3 pt-1">
                <h1 className="text-[30px] font-extrabold tracking-tight">{t('streaks.rewards', 'Rewards')}</h1>
                <p className={`mt-2 text-[17px] font-semibold leading-snug ${dark ? 'text-white/85' : 'text-black/75'}`}>
                    {t('streaks.youreOn', "You're on")} <span style={{ color: STREAK_ORANGE }}>{t('streaks.dayLower', 'day {day}', { day: current })}</span>.{' '}
                    <span className={`font-medium ${dark ? 'text-white/75' : 'text-black/65'}`}>
                        {beyond ? t('streaks.allRewardsUnlocked', 'All rewards unlocked.') : t('streaks.postDailyNextReward', 'Post daily for the next reward.')}
                    </span>
                </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-10">
                <div className="rounded-3xl px-4 py-2.5" style={{ background: dark ? 'rgb(var(--surface))' : '#e5e5e5' }}>
                    {days.map((day, i) => {
                        const reached   = current >= day;
                        const passed    = current > day;
                        const isCurrent = current === day;
                        const reward    = rewardFor[day];
                        const isReward  = reward !== undefined;
                        const isLast    = i === days.length - 1;
                        return (
                            <div key={day} className="relative flex gap-3.5">
                                <div className="relative w-7 shrink-0" style={{ minHeight: isReward ? 72 : 56 }}>
                                    {i > 0 && (
                                        <span
                                            className="absolute left-1/2 top-0 h-1/2 w-[2.5px] -translate-x-1/2"
                                            style={{ background: reached ? STREAK_ORANGE : mutedLine }}
                                        />
                                    )}
                                    {!isLast && (
                                        <span
                                            className="absolute bottom-0 left-1/2 h-1/2 w-[2.5px] -translate-x-1/2"
                                            style={{ background: passed ? STREAK_ORANGE : mutedLine }}
                                        />
                                    )}
                                    <span
                                        className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                                        style={{
                                            height: isReward ? 34 : 18,
                                            width:  isReward ? 34 : 18,
                                            background: reached ? STREAK_ORANGE : (dark ? '#2a2a2c' : '#d0d0d0'),
                                            border: reached ? 'none' : `2px solid ${mutedLine}`,
                                            boxShadow: isCurrent ? `0 0 0 4px ${STREAK_ORANGE}38` : undefined,
                                        }}
                                    >
                                        {isReward && (
                                            reached
                                                ? <Flame className="h-[18px] w-[18px] text-white" strokeWidth={2.5} />
                                                : <Gift className={`h-[17px] w-[17px] ${dark ? 'text-white/55' : 'text-black/45'}`} strokeWidth={2.4} />
                                        )}
                                    </span>
                                </div>

                                <div className={`flex flex-1 items-center justify-between gap-2 ${isLast ? '' : `border-b ${dark ? 'border-white/[0.06]' : 'border-black/[0.06]'}`}`}>
                                    <div className="min-w-0 py-2.5">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`text-[17.5px] font-bold tracking-tight ${
                                                    reached ? '' : (dark ? 'text-white/65' : 'text-black/60')
                                                }`}
                                                style={isCurrent ? { color: STREAK_ORANGE } : undefined}
                                            >
                                                {t('streaks.dayN', 'Day {day}', { day })}
                                            </span>
                                            {isCurrent && (
                                                <span className="rounded-full bg-[#FF7A1A]/20 px-2.5 py-[3px] text-[12px] font-extrabold uppercase tracking-wide text-[#C2410C] dark:text-[#FF7A1A]">
                                                    {t('streaks.youreHere', "You're here")}
                                                </span>
                                            )}
                                        </div>
                                        {isReward && (
                                            <div className={`mt-0.5 text-[15.5px] font-semibold ${dark ? 'text-white/80' : 'text-black/65'}`}>
                                                {t('streaks.milestoneReward', 'Milestone reward')}
                                            </div>
                                        )}
                                    </div>

                                    {isReward && (
                                        <span
                                            className="shrink-0 py-2.5 text-[18.5px] font-extrabold tracking-tight"
                                            style={{ color: reached ? STREAK_ORANGE : (dark ? '#ffffff99' : '#00000080') }}
                                        >
                                            {money(reward)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
