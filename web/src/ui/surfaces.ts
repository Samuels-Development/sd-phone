import { device } from '@device';

const phone = device.id === 'phone';

export const cardSurface = 'rounded-[16px] bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] dark:shadow-none dark:ring-white/[0.06]';

export const cardRow = `${cardSurface} transition-colors duration-150 hover:bg-black/[0.04] active:bg-black/[0.07] dark:hover:bg-white/[0.05] dark:active:bg-white/[0.08]`;

export const cardRowPad = phone ? 'px-4 py-3.5' : 'px-3 py-2.5';

export const listStack = 'flex flex-col gap-2.5';

export const hairline = 'bg-black/[0.13] dark:bg-white/[0.13]';
export const ruleX = `h-px w-full shrink-0 ${hairline}`;
export const ruleY = `w-px shrink-0 ${hairline}`;

export const surfaceBackdrop = 'bg-base';

export const panePad = 'px-6 pt-5';

export const sectionHeader = phone
    ? 'text-[13.5px] uppercase tracking-wider text-ios-gray'
    : 'text-[13px] uppercase tracking-wider text-ios-gray';
export const columnTitle = phone
    ? 'text-[17px] font-semibold tracking-tight text-black dark:text-white'
    : 'text-[15px] font-semibold tracking-tight text-black dark:text-white';
export const rowTitle = phone
    ? 'text-[16.5px] font-semibold leading-tight text-black dark:text-white'
    : 'text-[15px] font-semibold leading-tight text-black dark:text-white';
export const rowBody = phone
    ? 'text-[15px] leading-snug text-black/70 dark:text-white/70'
    : 'text-[13.5px] leading-snug text-black/70 dark:text-white/70';
export const rowMeta = phone
    ? 'text-[13.5px] font-medium text-ios-gray'
    : 'text-[12.5px] font-medium text-ios-gray';
export const refText = phone
    ? 'text-[13.5px] font-bold uppercase tracking-wide tabular-nums text-ios-gray'
    : 'text-[12.5px] font-bold uppercase tracking-wide tabular-nums text-ios-gray';

export const rowHover = 'transition-colors duration-150 hover:bg-black/[0.035] active:bg-black/[0.06] dark:hover:bg-white/[0.05] dark:active:bg-white/[0.08]';

export const fieldBase = 'rounded-[9px] bg-black/[0.05] text-black outline-none ring-1 ring-inset ring-black/[0.07] transition-colors duration-150 placeholder:text-black/35 focus:bg-black/[0.07] focus:ring-ios-blue dark:bg-white/[0.07] dark:text-white dark:ring-white/[0.10] dark:placeholder:text-white/35 dark:focus:bg-white/[0.10]';

export const fieldClass = `w-full px-3 py-2 text-[15px] ${fieldBase}`;
export const fieldSm = `px-3 py-1.5 text-[14px] font-medium ${fieldBase}`;
export const fieldXs = `px-2 py-1 text-[13px] ${fieldBase}`;
export const fieldArea = `resize-none px-3 py-2 text-[15px] leading-snug ${fieldBase}`;
