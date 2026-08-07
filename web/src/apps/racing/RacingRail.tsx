import { ChevronLeft, ChevronRight } from 'lucide-react';

import { t } from '@/i18n';
import { Scroller } from '@/ui/Scroller';
import { ruleY } from '@/ui/surfaces';
import { useSessionState } from '@/hooks/useSessionState';
import { RACING_SECTIONS } from './data';
import { navItems } from './racingNav';
import { RACING_RAIL_W, RACING_RAIL_W_COLLAPSED, racingAccentFill } from './racingTheme';
import { useRacingSession } from './useRacingSession';

export function RacingRail({ compact = false }: { compact?: boolean }) {
    const { admin, section, setSection } = useRacingSession();
    const [railOpen, setRailOpen] = useSessionState('racing:railOpen', true);

    const open = railOpen && !compact;
    const catalog = navItems();
    const visible = RACING_SECTIONS
        .map(id => catalog[id])
        .filter(item => item.id !== 'admin' || admin);

    return (
        <div className="relative flex shrink-0">
            <div
                className="flex min-h-0 flex-col overflow-hidden transition-[width] duration-200 ease-out"
                style={{ width: open ? RACING_RAIL_W : RACING_RAIL_W_COLLAPSED }}
            >
                <Scroller className="min-h-0 flex-1 px-3 pb-6 pt-3">
                    <div className="flex flex-col gap-[3px]">
                        {visible.map(item => {
                            const Icon = item.icon;
                            const active = section === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setSection(item.id)}
                                    title={open ? undefined : item.label}
                                    aria-label={item.label}
                                    aria-current={active ? 'page' : undefined}
                                    className={`flex items-center rounded-[10px] transition-colors duration-150 ${
                                        open ? 'gap-3 px-3 py-[9px]' : 'justify-center px-0 py-[10px]'
                                    } ${
                                        active
                                            ? racingAccentFill
                                            : 'text-black hover:bg-black/[0.05] active:bg-black/[0.09] dark:text-white dark:hover:bg-white/[0.07] dark:active:bg-white/[0.11]'
                                    }`}
                                >
                                    <Icon
                                        className="h-5 w-5 shrink-0"
                                        strokeWidth={active ? 2.3 : 1.9}
                                        style={active ? undefined : { opacity: 0.72 }}
                                    />
                                    {open && (
                                        <span className="min-w-0 flex-1 truncate text-left text-[15px] font-medium tracking-tight">
                                            {item.label}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </Scroller>
            </div>

            <div className={ruleY} />

            {!compact && (
                <button
                    type="button"
                    onClick={() => setRailOpen(o => !o)}
                    aria-label={open ? t('racing.collapseNav', 'Collapse sidebar') : t('racing.expandNav', 'Expand sidebar')}
                    className="absolute right-0 top-1/2 z-20 flex h-[46px] w-[15px] -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full bg-[#efefef] text-ios-gray shadow-[0_1px_4px_rgba(0,0,0,0.14)] ring-1 ring-black/[0.06] transition-colors duration-150 hover:bg-[#f6f6f6] hover:text-black active:bg-elevated dark:ring-white/[0.08] dark:hover:text-white"
                >
                    {open
                        ? <ChevronLeft className="h-[13px] w-[13px]" strokeWidth={2.6} />
                        : <ChevronRight className="h-[13px] w-[13px]" strokeWidth={2.6} />}
                </button>
            )}
        </div>
    );
}
