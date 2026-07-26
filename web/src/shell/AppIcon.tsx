import { useRef } from 'react';

import type { AppDef } from '@/core/types';
import { useDownloadProgress } from '@/stores/downloadStore';
import { preloadApp } from './appRegistry';
import { AppIconSVG } from './AppIconSVG';
import { AppBadge } from './AppBadge';
import { CircularProgress } from '@/ui/CircularProgress';

export interface AppIconProps {
    app:    AppDef;
    label?: boolean;
    onOpen: (app: AppDef, origin: { x: number; y: number }) => void;
    badge?: number;
    /** The app is collapsing to home: play the iOS close pop (icon zooms from large back into its slot). */
    closing?: boolean;
}

export function AppIcon({ app, label = true, onOpen, badge, closing = false }: AppIconProps) {
    const btnRef = useRef<HTMLButtonElement>(null);
    const downloadProgress = useDownloadProgress(app.id);
    const downloading = downloadProgress !== undefined;
    const queued = downloading && downloadProgress < 0;

    function handleClick() {
        if (downloading) return;
        let origin = { x: 0.5, y: 0.8 };

        if (btnRef.current) {
            const iconRect   = btnRef.current.getBoundingClientRect();
            const screenEl   = document.querySelector('[data-phone-screen]') as HTMLElement | null;
            const screenRect = screenEl?.getBoundingClientRect();

            if (screenRect && screenRect.width > 0) {
                const cx = iconRect.left + iconRect.width  / 2;
                const cy = iconRect.top  + iconRect.height / 2;
                origin = {
                    x: Math.max(0, Math.min(1, (cx - screenRect.left) / screenRect.width)),
                    y: Math.max(0, Math.min(1, (cy - screenRect.top)  / screenRect.height)),
                };
            }
        }

        onOpen(app, origin);
    }

    return (
        <button
            ref={btnRef}
            type="button"
            data-app-icon={app.id}
            onClick={handleClick}
            onPointerEnter={() => preloadApp(app.id)}
            onPointerDown={() => preloadApp(app.id)}
            className="group flex w-full flex-col items-center gap-[7px]"
        >
            <div
                className="relative"
                style={closing
                    ? { animation: 'ios-icon-close 0.35s cubic-bezier(0.32,0.72,0,1) both', willChange: 'transform, opacity' }
                    : undefined}
            >
                <div
                    className={`relative h-[78px] w-[78px] overflow-hidden transition-transform duration-150 ease-out ${downloading ? '' : 'group-active:scale-[0.96]'}`}
                    style={{
                        borderRadius: '27.6%',
                        boxShadow:
                            '0 2px 10px rgba(0,0,0,0.38), ' +
                            '0 0 0 0.5px rgba(0,0,0,0.12)',
                    }}
                >
                    <div
                        style={{
                            width:           60,
                            height:          60,
                            transform:       'scale(1.3)',
                            transformOrigin: '0 0',
                        }}
                    >
                        <AppIconSVG icon={app.icon} />
                    </div>

                    {/* Hover/press dim as a background-color overlay rather than filter: brightness.
                        A filter promotes/demotes the icon's compositing layer on hover, which forces
                        the shared home-strip layer to re-rasterize and — under the phone's fractional
                        CSS zoom — re-snaps neighbouring icons a subpixel (visible jitter). A
                        background-color transition is a localized paint that never re-layers. */}
                    {!downloading && (
                        <div className="pointer-events-none absolute inset-0 transition-colors duration-150 ease-out group-hover:bg-black/[0.22] group-active:bg-black/[0.4]" />
                    )}

                    {downloading && (
                        <>
                            <div className="absolute inset-0 bg-black/45" />
                            <div className={`absolute inset-0 flex items-center justify-center text-white ${queued ? 'animate-pulse' : ''}`}>
                                <CircularProgress progress={queued ? 0 : downloadProgress!} size={40} stroke={3} />
                                <div className="absolute h-[9px] w-[9px] rounded-[2px] bg-white" />
                            </div>
                        </>
                    )}
                </div>

                {!downloading && <AppBadge count={badge} />}
            </div>

            {label && (
                <span
                    className="w-full truncate text-center font-sf text-[13px] font-semibold tracking-[0.01em] text-white"
                    style={{
                        textShadow: '0 0 2px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.5)',
                        ...(closing ? { animation: 'ios-icon-label-in 0.35s ease both' } : null),
                    }}
                >
                    {app.label}
                </span>
            )}
        </button>
    );
}
