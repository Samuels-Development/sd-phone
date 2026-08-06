import { useState } from 'react';

import { t } from '@/i18n';
import { portalToPhoneScreen } from './portal';

interface ActionSheetButton {
    label:        string;
    onClick:      () => void;
    destructive?: boolean;
    disabled?:    boolean;
}

interface Props {
    actions:      ActionSheetButton[];
    cancelLabel?: string;
    forceDark?:   boolean;
    onClose:      () => void;
}

export function ActionSheet({ actions, cancelLabel, forceDark = false, onClose }: Props) {
    const [exiting, setExiting] = useState(false);

    function close(after?: () => void) {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(() => { onClose(); after?.(); }, 260);
    }

    const rowBorder = 'border-t border-black/[0.10] dark:border-white/[0.12]';

    // Portaled to the phone screen (like Sheet) so the sheet always rises from the very
    // bottom and covers tab bars, no matter how deeply the opener is nested.
    return portalToPhoneScreen(
        <div className={`absolute inset-0 z-50 ${forceDark ? 'dark' : ''}`} onClick={() => close()}>
            <div
                className="absolute inset-0 bg-black/40"
                style={{ animation: exiting ? 'ios-sheet-backdrop-out 0.26s ease forwards' : 'ios-sheet-backdrop-in 0.3s ease' }}
            />

            <div
                className="absolute inset-x-0 bottom-0 flex flex-col border-t border-black/10 bg-base pt-2 text-center dark:border-white/10 dark:bg-surface"
                style={{
                    paddingBottom: 'calc(var(--safe-bottom) + 10px)',
                    animation: exiting
                        ? 'ios-sheet-down 0.26s cubic-bezier(0.32,0,0.68,1) forwards'
                        : 'ios-sheet-up 0.3s cubic-bezier(0.32,0.72,0,1)',
                    willChange: 'transform',
                }}
                onClick={e => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={() => close()}
                    aria-label={t('common.close', 'Close')}
                    className="mx-auto flex h-6 w-32 items-start justify-center pt-1.5 active:opacity-60"
                >
                    <span className="h-[5px] w-9 rounded-full bg-black/25 dark:bg-white/30" />
                </button>

                {actions.map(a => (
                    <button
                        key={a.label}
                        type="button"
                        disabled={a.disabled}
                        onClick={() => { if (!a.disabled) close(a.onClick); }}
                        className={`w-full px-4 py-[16px] text-[21px] transition-colors ${rowBorder} ${
                            a.disabled
                                ? 'text-black/30 dark:text-white/30'
                                : `active:bg-black/10 dark:active:bg-white/10 ${a.destructive ? 'text-ios-red' : 'text-ios-blue'}`
                        }`}
                    >
                        {a.label}
                    </button>
                ))}

                {cancelLabel && (
                    <button
                        type="button"
                        onClick={() => close()}
                        className={`mt-2 w-full px-4 py-[16px] text-[21px] font-semibold text-ios-blue transition-colors active:bg-black/10 dark:active:bg-white/10 ${rowBorder}`}
                    >
                        {cancelLabel}
                    </button>
                )}
            </div>
        </div>,
    );
}
