import { useState } from 'react';
import { Flag } from 'lucide-react';

import { t } from '@/i18n';
import { ContactAvatar } from '@/shared/ContactAvatar';
import { Pill } from '@/ui/Pill';
import { ruleX } from '@/ui/surfaces';
import { colorFor, initialsFor } from '@/lib/format';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { RACING_ACCENT } from './racingTheme';
import { useRacingSession } from './useRacingSession';

export function RacingHeader({ compact = false, phone = false }: { compact?: boolean; phone?: boolean }) {
    const { me, setSection } = useRacingSession();
    const [liveRace, setLiveRace] = useState(false);

    useNuiEvent('sd-phone:racing:standings', () => setLiveRace(true));
    useNuiEvent('sd-phone:racing:raceResult', () => setLiveRace(false));

    const driverName = me?.alias?.trim() || me?.name || '';

    if (phone) {
        return (
            <div className="shrink-0">
                <div className="flex items-center gap-3 px-4 pb-3 pt-1">
                    <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
                        style={{ background: RACING_ACCENT }}
                    >
                        <Flag className="h-[19px] w-[19px] text-black" strokeWidth={2.4} />
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col">
                        <h1 className="min-w-0 truncate text-[20px] font-bold leading-tight tracking-tight text-black dark:text-white">
                            {t('racing.wordmark', 'Racing')}
                        </h1>
                        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-ios-gray">
                            {t('racing.terminalName', 'Street Racing Network')}
                        </span>
                    </div>

                    {liveRace && (
                        <Pill tone="red" className="gap-1.5">
                            <span className="h-[6px] w-[6px] animate-pulse rounded-full bg-current" />
                            {t('racing.liveShort', 'Live')}
                        </Pill>
                    )}

                    {me && (
                        <button
                            type="button"
                            onClick={() => setSection('driver')}
                            aria-label={t('racing.openDriver', 'Open my driver profile')}
                            className="shrink-0 rounded-full transition-opacity duration-150 active:opacity-60"
                        >
                            <ContactAvatar
                                size={34}
                                contact={{
                                    name:     driverName,
                                    initials: initialsFor(driverName),
                                    color:    colorFor(me.citizenid),
                                    avatar:   me.avatar ?? undefined,
                                }}
                            />
                        </button>
                    )}
                </div>

                <div className={ruleX} />
            </div>
        );
    }

    return (
        <div className="shrink-0">
            <div className="flex items-center gap-3.5 px-6 pb-3.5 pt-1">
                <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]"
                    style={{ background: RACING_ACCENT }}
                >
                    <Flag className="h-[22px] w-[22px] text-black" strokeWidth={2.4} />
                </span>

                <div className="flex min-w-0 flex-col">
                    <h1 className="min-w-0 truncate text-[19px] font-semibold leading-tight tracking-tight text-black dark:text-white">
                        {t('racing.wordmark', 'Racing')}
                    </h1>
                    <span className="min-w-0 truncate text-[12px] font-semibold uppercase tracking-[0.09em] text-ios-gray">
                        {t('racing.terminalName', 'Street Racing Network')}
                    </span>
                </div>

                <span className="flex-1" />

                {liveRace && (
                    <Pill tone="red" className="gap-1.5">
                        <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-current" />
                        {t('racing.liveNow', 'Race live')}
                    </Pill>
                )}

                {me && (
                    <button
                        type="button"
                        onClick={() => setSection('driver')}
                        aria-label={t('racing.openDriver', 'Open my driver profile')}
                        className="flex shrink-0 items-center gap-3 rounded-[12px] px-2 py-1 transition-colors duration-150 hover:bg-black/[0.04] active:bg-black/[0.07] dark:hover:bg-white/[0.06] dark:active:bg-white/[0.09]"
                    >
                        <Pill tone="blue">{t('racing.mmrValue', '{mmr} MMR', { mmr: me.mmr })}</Pill>

                        {!compact && (
                            <span className="flex min-w-0 flex-col items-end">
                                <span className="min-w-0 max-w-[220px] truncate text-[15px] font-semibold leading-tight text-black dark:text-white">
                                    {driverName}
                                </span>
                                <span className="min-w-0 max-w-[220px] truncate text-[12.5px] font-medium text-ios-gray">
                                    {me.rank === null
                                        ? t('racing.unranked', 'Unranked')
                                        : t('racing.rankValue', 'Rank #{rank}', { rank: me.rank })}
                                </span>
                            </span>
                        )}

                        <ContactAvatar
                            size={40}
                            contact={{
                                name:     driverName,
                                initials: initialsFor(driverName),
                                color:    colorFor(me.citizenid),
                                avatar:   me.avatar ?? undefined,
                            }}
                        />
                    </button>
                )}
            </div>

            <div className={ruleX} />
        </div>
    );
}
