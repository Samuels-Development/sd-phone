import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

import { t } from '@/i18n';

type BackMode = 'full' | 'generic' | 'minimal';

export function NavBar({ backLabel, onBack, title, right, hairline = false, className = '' }: {
    backLabel?: string;
    onBack?:    () => void;
    title?:     string;
    right?:     ReactNode;
    hairline?:  boolean;
    className?: string;
}) {
    const genericLabel = t('common.back', 'Back');
    const slotRef = useRef<HTMLDivElement>(null);
    const fullRef = useRef<HTMLSpanElement>(null);
    const genericRef = useRef<HTMLSpanElement>(null);
    const [mode, setMode] = useState<BackMode>('full');

    // Like UIKit: a back title that does not fit falls back to the generic "Back",
    // then to the chevron alone, instead of being truncated or overlapping the title.
    useLayoutEffect(() => {
        const slot = slotRef.current;
        if (!slot || !onBack || !backLabel) return;
        const pick = () => {
            // Sub-pixel widths: rounded offsetWidth lets a label that is a fraction too wide truncate.
            const room = slot.getBoundingClientRect().width - 24; // chevron + gap
            const full = fullRef.current?.getBoundingClientRect().width ?? 0;
            const generic = genericRef.current?.getBoundingClientRect().width ?? 0;
            setMode(full <= room ? 'full' : generic <= room ? 'generic' : 'minimal');
        };
        pick();
        const ro = new ResizeObserver(pick);
        ro.observe(slot);
        return () => ro.disconnect();
    }, [onBack, backLabel, genericLabel]);

    const shownLabel = !backLabel ? undefined : mode === 'full' ? backLabel : mode === 'generic' ? genericLabel : undefined;

    return (
        <div className={`relative flex h-11 shrink-0 items-center gap-2 px-2 ${className}`}>
            {/* Equal-basis side slots keep the title centred; the back slot yields first. */}
            <div ref={slotRef} className="relative flex min-w-0 flex-1 basis-0">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label={backLabel || genericLabel}
                        title={backLabel}
                        className="relative z-10 flex min-w-0 max-w-full items-center gap-0.5 text-[17px] text-ios-blue active:opacity-60"
                    >
                        <ChevronLeft className="h-[22px] w-[22px] shrink-0" strokeWidth={2.5} />
                        {shownLabel && <span className="truncate">{shownLabel}</span>}
                    </button>
                )}
                {onBack && backLabel && (
                    <span aria-hidden className="pointer-events-none invisible absolute left-0 top-0 flex whitespace-nowrap text-[17px]">
                        <span ref={fullRef}>{backLabel}</span>
                        <span ref={genericRef}>{genericLabel}</span>
                    </span>
                )}
            </div>
            {title && (
                <div className="pointer-events-none min-w-0 max-w-[60%] shrink">
                    <span title={title} className="block truncate text-[17px] font-semibold text-black dark:text-white">{title}</span>
                </div>
            )}
            {/* Bar buttons are never clipped; the title gives way instead. */}
            <div className="flex flex-1 basis-0 items-center justify-end pe-2 text-ios-blue" style={{ minWidth: 'max-content' }}>
                {right}
            </div>
            {hairline && <div className="absolute inset-x-0 bottom-0 h-[0.5px] bg-control" />}
        </div>
    );
}
