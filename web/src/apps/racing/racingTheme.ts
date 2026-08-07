import type { PillTone } from '@/ui/Pill';
import type { RaceClass, RaceStatus } from './data';

export const RACING_STATUS_RESERVE = 54;

export const RACING_RAIL_W = 236;
export const RACING_RAIL_W_COLLAPSED = 68;

export const RACING_ACCENT = '#0BF2B4';
export const RACING_ACCENT_INK = '#046B54';

export const racingAccentText = 'text-[#046B54] dark:text-[#0BF2B4]';
export const racingAccentFill = 'bg-[#0BF2B4] text-black';
export const racingAccentSoft = 'bg-[#0BF2B4]/[0.14] dark:bg-[#0BF2B4]/[0.16]';
export const racingAccentRing = 'ring-1 ring-[#046B54]/30 dark:ring-[#0BF2B4]/35';
export const racingAccentBar = 'bg-[#0BF2B4]';

export const racingSegmented = '[&>button]:flex-auto [&>button]:min-w-0 [&>button]:truncate [&>button]:px-2';
export const racingViewEnter = 'animate-mdt-pane';
export const racingDetailEnter = 'animate-mdt-detail';

export const racingStat = 'text-[26px] font-bold tabular-nums tracking-tight text-black dark:text-white';
export const racingStatLabel = 'text-[12px] font-medium uppercase tracking-wider text-ios-gray';

export const CLASS_COLOR: Record<RaceClass, string> = {
    D: '#9ca3af',
    C: '#4ade80',
    B: '#60a5fa',
    A: '#c084fc',
    S: '#fbbf24',
};

export const CLASS_TONE: Record<RaceClass, PillTone> = {
    D: 'green',
    C: 'green',
    B: 'blue',
    A: 'red',
    S: 'orange',
};

export const STATUS_TONE: Record<RaceStatus, PillTone> = {
    registering: 'blue',
    live:        'green',
};
