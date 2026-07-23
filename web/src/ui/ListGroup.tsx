import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Toggle } from './Toggle';

const RADIUS: Record<10 | 12 | 14 | 16, string> = {
    10: 'rounded-[10px]',
    12: 'rounded-[12px]',
    14: 'rounded-[14px]',
    16: 'rounded-[16px]',
};

export function GroupCard({ children, className = '', radius = 10, header, footer }: {
    children:   ReactNode;
    className?: string;
    radius?:    10 | 12 | 14 | 16;
    header?:    string;
    footer?:    string;
}) {
    const card = (
        <div className={`overflow-hidden ${RADIUS[radius]} bg-[#e5e5e5] dark:bg-surface ${className}`}>
            {children}
        </div>
    );
    if (!header && !footer) return card;
    return (
        <div>
            {header && (
                <div className="px-3 pb-1.5 pt-1 text-[13px] font-normal uppercase tracking-wider text-ios-gray">
                    {header}
                </div>
            )}
            {card}
            {footer && (
                <div className="px-3 pt-2 text-[13px] font-normal text-ios-gray">
                    {footer}
                </div>
            )}
        </div>
    );
}

export function ListGroup({ children, header, footer }: {
    children: ReactNode;
    header?:  string;
    footer?:  string;
}) {
    return (
        <div>
            {header && (
                <div className="px-7 pb-1.5 pt-1 text-[13px] font-normal uppercase tracking-wider text-ios-gray">
                    {header}
                </div>
            )}
            <GroupCard className="mx-4">
                {children}
            </GroupCard>
            {footer && (
                <div className="px-7 pt-2 text-[13px] font-normal text-ios-gray">
                    {footer}
                </div>
            )}
        </div>
    );
}

export function ListRow({ label, sub, value, chevron, divider, destructive, selected, large, left, right, onPress }: {
    label:        string;
    /** Optional second line under the label (ios-gray) - file rows, previews, etc. */
    sub?:         string;
    value?:       string;
    chevron?:     boolean;
    divider?:     boolean;
    destructive?: boolean;
    selected?:    boolean;
    /** Roomier variant: taller row, 18px label, 14px sub - list-browsing apps (Files). */
    large?:       boolean;
    left?:        ReactNode;
    right?:       ReactNode;
    onPress?:     () => void;
}) {
    const isPicker    = selected !== undefined;
    const showChevron = !isPicker && (chevron !== undefined ? chevron : value === undefined);
    const labelColor  = destructive ? 'text-ios-red' : 'text-black dark:text-white';
    const labelSize   = large ? 'text-[18px]' : 'text-[17px]';
    const subSize     = large ? 'text-[14px]' : 'text-[13px]';
    return (
        <button
            type="button"
            onClick={onPress}
            className={`relative flex w-full items-center px-4 text-left active:bg-black/5 dark:active:bg-white/5 ${large ? 'py-3.5' : 'py-3'}`}
        >
            {left !== undefined && (
                <span className="mr-3 flex shrink-0 items-center">{left}</span>
            )}
            {sub !== undefined ? (
                <span className="min-w-0 flex-1">
                    <span className={`block truncate ${labelSize} font-normal ${labelColor}`}>{label}</span>
                    <span className={`block truncate ${subSize} text-ios-gray`}>{sub}</span>
                </span>
            ) : (
                <span className={`flex-1 ${labelSize} font-normal ${labelColor}`}>
                    {label}
                </span>
            )}
            {value && (
                <span className="mr-1 shrink-0 text-[17px] font-normal text-ios-gray">{value}</span>
            )}
            {right !== undefined && (
                <span className="mr-1 flex shrink-0 items-center">{right}</span>
            )}
            {selected && (
                <Check className="h-[17px] w-[17px] shrink-0 text-ios-blue" strokeWidth={2.5} />
            )}
            {showChevron && (
                <ChevronRight
                    className={`h-[17px] w-[17px] shrink-0 ${destructive ? 'text-ios-red/50' : 'text-ios-gray3'}`}
                    strokeWidth={2.5}
                />
            )}
            {divider && (
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-ios-gray4 dark:bg-control"
                    style={{ height: '0.5px' }}
                />
            )}
        </button>
    );
}

export function ToggleRow({ label, defaultOn = false, divider, on: controlledOn, onToggle }: {
    label:      string;
    defaultOn?: boolean;
    divider?:   boolean;
    on?:        boolean;
    onToggle?:  () => void;
}) {
    const [internalOn, setInternalOn] = useState(defaultOn);
    const on = controlledOn !== undefined ? controlledOn : internalOn;
    return (
        <button
            type="button"
            onClick={() => { if (onToggle) onToggle(); else setInternalOn(o => !o); }}
            className="relative flex w-full items-center px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
        >
            <span className="flex-1 text-[17px] font-normal text-black dark:text-white">{label}</span>
            {/* The 31px switch exceeds the text line; the negative margin keeps it from
                stretching the row, so toggle rows match plain ListRow height. */}
            <div className="pointer-events-none -my-1">
                <Toggle on={on} />
            </div>
            {divider && (
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-ios-gray4 dark:bg-control"
                    style={{ height: '0.5px' }}
                />
            )}
        </button>
    );
}
