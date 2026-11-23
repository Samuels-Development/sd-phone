import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { t } from '@/i18n';
import { useScreenPortal } from './portal';

export function Sheet({ onClose, top = 60, fit = 'top', title, grabber = true, className = '', forceDark = false, dim = true, dismissable = true, durationMs, zIndex = 60, children }: {
    onClose:      () => void;
    top?:         number | string;
    fit?:         'top' | 'content' | 'full';
    title?:       string;
    grabber?:     boolean;
    className?:   string;
    forceDark?:   boolean;
    dim?:         boolean;
    dismissable?: boolean;
    durationMs?:  number;
    zIndex?:      number;
    children:     (api: { close: () => void }) => ReactNode;
}) {
    const [exiting, setExiting] = useState(false);
    const portal = useScreenPortal();
    const exitMs = durationMs ?? 260;

    function close() {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(onClose, exitMs);
    }

    const cardStyle: CSSProperties = {
        animation: exiting
            ? `ios-sheet-down ${exitMs}ms cubic-bezier(0.32,0,0.68,1) forwards`
            : 'ios-sheet-up 0.34s cubic-bezier(0.32,0.72,0,1)',
        willChange: 'transform',
    };
    if (fit === 'top') {
        cardStyle.top = top;
    } else if (fit === 'full') {
        cardStyle.top = `calc(var(--safe-top) + ${typeof top === 'number' ? top : 60}px)`;
    } else {
        cardStyle.paddingBottom = 'calc(var(--safe-bottom) + 16px)';
    }

    const cardClass =
        fit === 'top'  ? 'absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[14px]'
      : fit === 'full' ? 'absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[16px]'
      :                  'absolute inset-x-0 bottom-0 flex max-h-[85%] flex-col overflow-y-auto rounded-t-[18px] no-scrollbar';

    const sheet = (
        <div className={`absolute inset-0 isolate ${forceDark ? 'dark' : ''}`} style={{ zIndex }}>
            <div
                onClick={dismissable ? close : undefined}
                className={`absolute inset-0 ${dim ? 'bg-black/40' : ''}`}
                style={dim ? { animation: exiting ? `ios-sheet-backdrop-out ${exitMs}ms ease forwards` : 'ios-sheet-backdrop-in 0.3s ease' } : undefined}
            />
            <div className={`${cardClass} ${className}`} style={cardStyle}>
                {grabber && fit === 'top' && (
                    <button
                        type="button"
                        onClick={close}
                        aria-label={t('common.close', 'Close')}
                        className="absolute left-1/2 top-0 z-10 flex h-8 w-32 -translate-x-1/2 cursor-pointer items-start justify-center pt-2 active:opacity-60"
                    >
                        <span className="h-[5px] w-9 rounded-full bg-black/25 dark:bg-white/30" />
                    </button>
                )}
                {grabber && (fit === 'content' || fit === 'full') && (
                    <button
                        type="button"
                        onClick={close}
                        aria-label={t('common.close', 'Close')}
                        className="mx-auto flex w-16 shrink-0 cursor-pointer justify-center pb-1 pt-2.5 active:opacity-60"
                    >
                        <span className="h-[5px] w-9 rounded-full bg-black/25 dark:bg-white/30" />
                    </button>
                )}
                {title && (
                    <div className={`flex h-[44px] shrink-0 items-center justify-center px-4 ${fit === 'top' && grabber ? 'mt-3' : ''}`}>
                        <span className="truncate text-[17px] font-semibold text-black dark:text-white">{title}</span>
                    </div>
                )}
                {children({ close })}
            </div>
        </div>
    );

    return portal(sheet);
}
