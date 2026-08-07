import type { PillTone } from '@/ui/Pill';
import { device } from '@device';
import type { RaceClass, RaceStatus } from './data';

const PHONE_ENTER = device.id === 'phone';

export const RACING_STATUS_RESERVE = 54;

export const RACING_RAIL_W = 236;
export const RACING_RAIL_W_COLLAPSED = 68;

export const RACING_ACCENT = 'rgb(var(--ios-blue))';
export const RACING_ACCENT_INK = 'rgb(var(--ios-blue))';
export const RACING_ACCENT_SOFT = 'rgb(var(--ios-blue) / 0.08)';

export const racingAccentText = 'text-ios-blue';
export const racingAccentFill = 'bg-ios-blue text-white';
export const racingAccentSoft = 'bg-ios-blue/[0.14] dark:bg-ios-blue/[0.16]';
export const racingAccentRing = 'ring-1 ring-ios-blue/30 dark:ring-ios-blue/35';
export const racingAccentBar = 'bg-ios-blue';

export const racingSegmented = '[&>button]:flex-auto [&>button]:min-w-0 [&>button]:truncate [&>button]:px-2';
export const racingViewEnter = PHONE_ENTER ? 'animate-swipe-in-left' : 'animate-mdt-pane';
export const racingDetailEnter = PHONE_ENTER ? 'animate-swipe-in-left' : 'animate-mdt-detail';

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
