import { useRef } from 'react';
import { appLabel } from '@/i18n';

import { useGrid } from '@/device/grid';
import { APP_LABEL_CLASS, appLabelStyle } from './appLabel';
import type { AppDef } from '@/core/types';
import { useDownloadProgress } from '@/stores/downloadStore';
import { useIconAppearance, useShowAppNames } from '@/stores/iconThemeStore';
import { AppIconSVG } from './AppIconSVG';
import { AppGlyph } from './AppGlyphs';
import { AppBadge } from './AppBadge';
import { launchOriginFrom } from './launchOrigin';
import { asAppId, preloadApp } from './appRegistry';
import { CircularProgress } from '@/ui/CircularProgress';

// AppIconSVG always draws on a fixed 60px design box; every caller scales that box to fit.
export const ART = 60;

export const TILE_SHADOW = '0 2px 10px rgba(0,0,0,0.38), 0 0 0 0.5px rgba(0,0,0,0.12)';

export function radiusPct(fraction: number): string {
    return `${Math.round(fraction * 1000) / 10}%`;
}

export interface AppIconProps {
    app:    AppDef;
    label?: boolean;
    onOpen: (app: AppDef, origin: { x: number; y: number }) => void;
    badge?: number;
}

export function AppIcon({ app, label = true, onOpen, badge }: AppIconProps) {
    const grid = useGrid();
    const TILE = grid.icon;
    const btnRef = useRef<HTMLButtonElement>(null);
    const {
        background, glyph, art, radius, glyphSize, glyphWeight, boxShadow,
        labelColor, labelWeight, labelShow, icon: glyphOverride,
    } = useIconAppearance(app.id, app.accent);
    const showAppNames = useShowAppNames();
    const showLabel = label && (labelShow ?? showAppNames);
    const downloadProgress = useDownloadProgress(app.id);
    const downloading = downloadProgress !== undefined;
    const queued = downloading && downloadProgress < 0;

    function handleClick() {
        if (downloading) return;
        onOpen(app, launchOriginFrom(btnRef.current));
    }

    function handlePointerDown() {
        if (downloading) return;
        const id = asAppId(app.id);
        if (!id) return;
        void preloadApp(id);
    }

    return (
        <button
            ref={btnRef}
            type="button"
            onPointerDown={handlePointerDown}
            onClick={handleClick}
            className="group flex w-full flex-col items-center gap-[7px]"
        >
            <div className="relative">
                <div
                    className={`relative overflow-hidden transition-transform duration-150 ease-out ${downloading ? '' : 'group-active:scale-[0.96]'}`}
                    style={{
                        width:        TILE,
                        height:       TILE,
                        borderRadius: radiusPct(radius),
                        boxShadow:    [TILE_SHADOW, boxShadow].filter(Boolean).join(', '),
                    }}
                >
                    {art === 'native' ? (
                        <div
                            style={{
                                width:           ART,
                                height:          ART,
                                transform:       `scale(${TILE / ART})`,
                                transformOrigin: '0 0',
                            }}
                        >
                            <AppIconSVG icon={app.icon} />
                        </div>
                    ) : (
                        <div className="flex h-full w-full items-center justify-center" style={{ background }}>
                            <AppGlyph
                                icon={app.icon}
                                override={glyphOverride}
                                label={appLabel(app)}
                                color={glyph}
                                size={glyphSize}
                                strokeWidth={glyphWeight}
                            />
                        </div>
                    )}

                    {boxShadow !== '' && (
                        <div
                            className="pointer-events-none absolute inset-0"
                            style={{ borderRadius: radiusPct(radius), boxShadow }}
                        />
                    )}

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

            {showLabel && (
                <span
                    className={APP_LABEL_CLASS}
                    style={{
                        ...appLabelStyle(grid),
                        color:      labelColor,
                        fontWeight: labelWeight,
                    }}
                >
                    {appLabel(app)}
                </span>
            )}
        </button>
    );
}
