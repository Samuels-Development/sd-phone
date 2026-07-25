import { useState } from 'react';
import { Camera, ChevronRight, Clock, Flame, Gift, Lock, Trophy } from 'lucide-react';

import { Sheet } from '@/ui/Sheet';
import { useCountdown } from '@/hooks/useCountdown';
import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import type { StreakConfig, StreakState } from './data';

const STREAK_ORANGE = '#FF7A1A';

function money(n: number): string {
    return formatMoney(n, { whole: true });
}

export function MeTab({ state, config, dark, posting, onPost, onOpenRewards }: {
    state:   StreakState;
    config:  StreakConfig;
    dark:    boolean;
    posting: boolean;
    onPost:  (caption: string | undefined) => void;
    onOpenRewards: () => void;
}) {
    const [sheetOpen, setSheetOpen] = useState(false);
    const [caption, setCaption]     = useState('');

    const surface = dark ? 'bg-[#1c1c1e]' : 'bg-[#e5e5e5]';
    const maxReward = config.milestones.length ? config.milestones[config.milestones.length - 1].reward : 0;

    const rewardByDay: Record<number, number> = {};
    for (const m of config.milestones) rewardByDay[m.day] = m.reward;
    const startDay = Math.max(1, state.current - 2);
    const timeline = Array.from({ length: 7 }, (_, i) => {
        const day = startDay + i;
        return { day, reward: rewardByDay[day] as number | undefined };
    });
    const lineMuted = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';

    function confirmPost(close: () => void) {
        const trimmed = caption.trim();
        onPost(trimmed.length ? trimmed : undefined);
        setCaption('');
        close();
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar px-4 pb-4 pt-2">
            <div
                className="relative shrink-0 overflow-hidden rounded-3xl px-5 pb-6 pt-6 shadow-sm"
                style={{ background: dark
                    ? 'linear-gradient(155deg, #3a230f 0%, #1c1c1e 62%)'
                    : 'linear-gradient(155deg, #ffe7d2 0%, #e7e7e7 66%)' }}
            >
                <div
                    className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full blur-3xl"
                    style={{ background: STREAK_ORANGE, opacity: 0.32 }}
                />

                <div className="relative flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                        <Flame
                            className="h-[70px] w-[70px] shrink-0"
                            style={{ color: STREAK_ORANGE }}
                            strokeWidth={2.1}
                            fill={STREAK_ORANGE}
                            fillOpacity={0.2}
                        />
                        <div className="min-w-0">
                            <span className="block text-[66px] font-extrabold leading-none tracking-tight" style={{ color: STREAK_ORANGE }}>
                                {state.current}
                            </span>
                            <span className="mt-1.5 block text-[14px] font-bold uppercase tracking-[0.16em] opacity-70">
                                {t('streaks.dayStreakLabel', 'day streak')}
                            </span>
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2 pt-1">
                        <span className="flex items-center gap-1.5 text-[13px] font-bold opacity-85">
                            <Trophy className="h-[14px] w-[14px]" style={{ color: STREAK_ORANGE }} strokeWidth={2.4} />
                            {t('streaks.longestN', 'Longest {n}', { n: state.longest })}
                        </span>
                        <span className={`flex items-center gap-1.5 text-[13px] font-bold ${
                            state.postedToday ? 'text-[#C2410C] dark:text-[#FF7A1A]' : 'opacity-60'
                        }`}>
                            <span
                                className="h-[7px] w-[7px] rounded-full"
                                style={{ background: state.postedToday ? STREAK_ORANGE : (dark ? '#ffffff66' : '#0000004d') }}
                            />
                            {state.postedToday ? t('streaks.postedToday', 'Posted today') : t('streaks.notPosted', 'Not posted')}
                        </span>
                    </div>
                </div>

                <div className="relative mt-5 flex">
                    {timeline.map((node, i) => {
                        const reached = state.current >= node.day;
                        const passed  = state.current > node.day;
                        const isCur   = state.current === node.day;
                        const isLast  = i === timeline.length - 1;
                        return (
                            <div key={node.day} className="relative flex flex-1 flex-col items-center">
                                {!isLast && (
                                    <span
                                        className="absolute left-1/2 top-[12px] h-[3px] w-full"
                                        style={{ background: passed ? STREAK_ORANGE : lineMuted }}
                                    />
                                )}
                                <span
                                    className="relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full"
                                    style={{
                                        background: reached ? STREAK_ORANGE : (dark ? '#2c2113' : '#ecdccb'),
                                        border: reached ? 'none' : `2px solid ${lineMuted}`,
                                        boxShadow: isCur ? `0 0 0 4px ${STREAK_ORANGE}38` : undefined,
                                    }}
                                >
                                    {node.reward !== undefined ? (
                                        <Flame
                                            className={`h-[15px] w-[15px] ${reached ? 'text-white' : (dark ? 'text-white/45' : 'text-black/35')}`}
                                            strokeWidth={2.5}
                                        />
                                    ) : (
                                        reached && <span className="h-[6px] w-[6px] rounded-full bg-white" />
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <button
                type="button"
                onClick={onOpenRewards}
                className={`mt-3 flex w-full shrink-0 items-center gap-4 rounded-2xl px-4 py-[21px] text-left shadow-sm active:opacity-90 ${surface}`}
            >
                <span
                    className="flex h-[56px] w-[56px] shrink-0 items-center justify-center rounded-full text-white shadow-sm"
                    style={{ background: `linear-gradient(135deg, ${STREAK_ORANGE}, #FF3D2E)` }}
                >
                    <Gift className="h-[28px] w-[28px]" strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[18.5px] font-bold tracking-tight">{t('streaks.rewards', 'Rewards')}</span>
                    <span className={`mt-0.5 block text-[16px] font-semibold ${dark ? 'text-white/85' : 'text-black/75'}`}>
                        {t('streaks.milestonesSummary', '{count} milestones, up to {amount}', { count: config.milestones.length, amount: money(maxReward) })}
                    </span>
                </span>
                <ChevronRight className={`h-[22px] w-[22px] shrink-0 ${dark ? 'text-white/35' : 'text-black/30'}`} strokeWidth={2.4} />
            </button>

            <div className="mt-3 flex min-h-0 flex-1 flex-col">
                {state.postedToday ? (
                    <div className={`relative min-h-0 flex-1 overflow-hidden rounded-3xl ${surface} shadow-sm`}>
                        {state.todayPost?.imageUrl && (
                            <img src={state.todayPost.imageUrl} alt="" className="h-full w-full object-cover" />
                        )}
                        <span
                            className="absolute left-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[13.5px] font-bold text-white shadow-sm ring-1 ring-black/10"
                            style={{ background: STREAK_ORANGE }}
                        >
                            <Flame className="h-[14px] w-[14px]" strokeWidth={2.6} />
                            {t('streaks.dayN', 'Day {day}', { day: state.current })}
                        </span>
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-4 pt-12">
                            {state.todayPost?.caption && (
                                <p className="mb-1.5 line-clamp-2 text-[14.5px] font-medium leading-snug text-white/90">
                                    {state.todayPost.caption}
                                </p>
                            )}
                            <p className="flex items-center gap-1.5 text-[15px] font-bold text-white">
                                <Lock className="h-[15px] w-[15px]" strokeWidth={2.5} />
                                {t('streaks.postedForToday', 'Posted for today')}
                            </p>
                            <PostAgainTimer seconds={state.resetInSeconds} />
                        </div>
                    </div>
                ) : (
                    <>
                        <div className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed ${dark ? 'border-white/15 bg-white/[0.03]' : 'border-black/15 bg-black/[0.02]'}`}>
                            <span
                                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
                                style={{ background: `${STREAK_ORANGE}1f` }}
                            >
                                <Camera className="h-8 w-8" style={{ color: STREAK_ORANGE }} strokeWidth={1.9} />
                            </span>
                            <div className="px-8 text-center">
                                <p className="text-[16.5px] font-bold tracking-tight">{t('streaks.todaysPhoto', "Today's photo")}</p>
                                <p className={`mt-1 text-[15px] font-medium leading-snug ${dark ? 'text-white/70' : 'text-black/65'}`}>
                                    {t('streaks.dailyShotHint', 'Your daily shot shows up here once you take it.')}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            disabled={posting}
                            onClick={() => setSheetOpen(true)}
                            className="mt-3 flex w-full shrink-0 items-center justify-center gap-2.5 rounded-2xl py-4 text-[17px] font-bold text-white shadow-sm transition-[transform,opacity] active:scale-[0.98] disabled:opacity-70"
                            style={{ background: `linear-gradient(90deg, ${STREAK_ORANGE}, #FF3D2E)` }}
                        >
                            {posting ? (
                                <>
                                    <span className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-white/40 border-t-white" />
                                    {t('streaks.posting', 'Posting...')}
                                </>
                            ) : (
                                <>
                                    <Camera className="h-[22px] w-[22px]" strokeWidth={2.3} />
                                    {t('streaks.postTodaysPhoto', "Post today's photo")}
                                </>
                            )}
                        </button>
                    </>
                )}
            </div>

            {sheetOpen && (
                <Sheet
                    onClose={() => setSheetOpen(false)}
                    forceDark={dark}
                    top={628}
                    className="font-sf bg-[#d4d4d4] text-black dark:bg-base dark:text-white"
                >
                    {({ close }) => (
                        <div className="flex h-full flex-col px-5 pb-9 pt-7">
                            <span className="mb-3 text-[18px] font-extrabold tracking-tight">{t('streaks.addCaption', 'Add a caption')}</span>
                            <textarea
                                value={caption}
                                onChange={e => setCaption(e.target.value.slice(0, config.maxCaptionLength))}
                                maxLength={config.maxCaptionLength}
                                rows={3}
                                placeholder={t('streaks.captionPlaceholder', 'Say something about today (optional)')}
                                className="ios-scrollbar w-full resize-none rounded-[14px] bg-[#e5e5e5] px-4 py-3.5 text-[18px] leading-snug text-black placeholder-black/80 outline-none dark:bg-surface dark:text-white dark:placeholder-white/65"
                            />
                            <div className="mt-1.5 text-right text-[12px] font-semibold opacity-50">
                                {caption.length}/{config.maxCaptionLength}
                            </div>
                            <button
                                type="button"
                                disabled={posting}
                                onClick={() => confirmPost(close)}
                                className="mt-auto flex w-full items-center justify-center gap-2.5 rounded-2xl py-[18px] text-[18px] font-bold text-white active:scale-[0.98] disabled:opacity-70"
                                style={{ background: `linear-gradient(90deg, ${STREAK_ORANGE}, #FF3D2E)` }}
                            >
                                <Camera className="h-[24px] w-[24px]" strokeWidth={2.3} />
                                {t('streaks.takePhotoAndPost', 'Take photo and post')}
                            </button>
                        </div>
                    )}
                </Sheet>
            )}
        </div>
    );
}

function PostAgainTimer({ seconds }: { seconds: number }) {
    const remaining = useCountdown(seconds);

    if (remaining <= 0) {
        return (
            <p className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold text-white/90">
                <Clock className="h-[15px] w-[15px]" strokeWidth={2.4} />
                {t('streaks.canPostAgainNow', 'You can post again now')}
            </p>
        );
    }

    const h = Math.floor(remaining / 3600);
    const m = Math.floor((remaining % 3600) / 60);
    const s = remaining % 60;
    const left = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;

    return (
        <p className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold text-white/90">
            <Clock className="h-[15px] w-[15px]" strokeWidth={2.4} />
            {t('streaks.postAgainIn', 'Post again in {left}', { left })}
        </p>
    );
}
