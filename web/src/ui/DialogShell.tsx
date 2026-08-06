import type { ReactNode } from 'react';

interface FooterButton {
    label:        string;
    onClick:      () => void;
    destructive?: boolean;
    disabled?:    boolean;
    busy?:        boolean;
}

interface Props {
    title:      string;
    message?:   string;
    exiting:    boolean;
    forceDark?: boolean;
    zIndex?:    number;
    cancel?:    { label: string; onClick: () => void };
    confirm:    FooterButton;
    children?:  ReactNode;
}

export function DialogShell({ title, message, exiting, forceDark = false, zIndex = 50, cancel, confirm, children }: Props) {
    return (
        <div
            className={`absolute inset-0 flex items-center justify-center backdrop-blur-md ${forceDark ? 'dark' : ''}`}
            style={{
                zIndex,
                background: 'rgba(0,0,0,0.28)',
                animation: exiting
                    ? 'ios-sheet-backdrop-out 0.18s ease-in forwards'
                    : 'ios-sheet-backdrop-in 0.18s ease-out',
            }}
            onPointerDown={e => e.stopPropagation()}
        >
            <div
                className="flex w-[338px] flex-col overflow-hidden rounded-[18px] bg-elevated/80 dark:bg-elevated/90 backdrop-blur-2xl text-center text-black dark:text-white"
                style={{
                    animation: exiting
                        ? 'ios-alert-out 0.18s ease-in forwards'
                        : 'ios-alert-in 0.22s cubic-bezier(0.32,0.72,0,1)',
                    willChange: 'transform, opacity',
                }}
            >
                <div className="px-5 pb-4 pt-5">
                    <div className="text-[22px] font-semibold leading-snug break-words">{title}</div>
                    {message && (
                        <div className="mt-1.5 text-[16px] leading-snug text-black/80 dark:text-white/85 break-words">
                            {message}
                        </div>
                    )}
                    {children}
                </div>

                <div className="relative flex border-t border-black/[0.13] dark:border-white/[0.13]">
                    {cancel && (
                        <button
                            type="button"
                            onClick={cancel.onClick}
                            className="flex-1 px-4 py-[14px] text-[20px] text-ios-blue transition-colors hover:text-ios-blue/70 active:bg-black/10 dark:active:bg-white/10"
                        >
                            {cancel.label}
                        </button>
                    )}
                    {cancel && (
                        <div className="pointer-events-none absolute left-1/2 top-1/2 h-1/2 w-px -translate-x-1/2 -translate-y-1/2 bg-black/[0.13] dark:bg-white/[0.13]" />
                    )}
                    <button
                        type="button"
                        onClick={confirm.onClick}
                        disabled={confirm.disabled}
                        className={[
                            'flex-1 px-4 py-[14px] text-[20px] font-semibold transition-colors active:bg-black/10 disabled:opacity-40 dark:active:bg-white/10',
                            confirm.destructive ? 'text-ios-red hover:text-ios-red/70' : 'text-ios-blue hover:text-ios-blue/70',
                            confirm.busy ? 'animate-pulse' : '',
                        ].join(' ')}
                    >
                        {confirm.label}
                    </button>
                </div>
            </div>
        </div>
    );
}
