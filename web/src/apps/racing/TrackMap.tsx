import { useMemo, useRef } from 'react';
import { ChevronLeft, Crosshair, Route as RouteIcon } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { EmptyState } from '@/ui/EmptyState';
import { type MapViewHandle } from '@/apps/maps/MapView';

import { racingTrackRoute } from './racingApi';
import { RACING_ACCENT } from './racingTheme';
import { RouteMapView } from './RouteMapView';
import { routeLengthMetres } from './data';

const TRACK_MAP_CHROME = '54px';

export interface TrackMapTrack {
    id:   number;
    name: string;
}

export function TrackMap({ track, onBack }: { track: TrackMapTrack; onBack: () => void }) {
    const mapRef = useRef<MapViewHandle>(null);

    const { data, loading, settled } = useAsyncData(() => racingTrackRoute(track.id), [track.id]);

    const route = useMemo(() => data ?? [], [data]);
    const framePoints = useMemo(() => route.map(point => ({ x: point.x, y: point.y })), [route]);

    const kilometres = useMemo(() => routeLengthMetres(route) / 1000, [route]);

    const header = (
        <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-4">
            <button
                type="button"
                onClick={onBack}
                className="-ml-1.5 flex shrink-0 items-center gap-0.5 py-1 pr-2 text-[15px] font-semibold text-ios-blue transition-opacity duration-150 hover:opacity-85 active:opacity-60"
            >
                <ChevronLeft className="h-[20px] w-[20px]" strokeWidth={2.4} />
                {t('racing.backToTrack', 'Track')}
            </button>
            <h2 className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-tight text-black dark:text-white">
                {track.name}
            </h2>
            <button
                type="button"
                disabled={framePoints.length === 0}
                onClick={() => mapRef.current?.fitWorld(framePoints, 0.18)}
                aria-label={t('racing.frameRoute', 'Frame the route')}
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-ios-gray transition-colors duration-150 hover:bg-black/[0.06] hover:text-black active:opacity-60 disabled:cursor-default disabled:opacity-30 dark:hover:bg-white/[0.10] dark:hover:text-white"
            >
                <Crosshair className="h-[16px] w-[16px]" strokeWidth={2.2} />
            </button>
        </div>
    );

    if (route.length === 0) {
        return (
            <div className="flex min-h-0 flex-1 flex-col">
                {header}
                <div className="flex min-h-0 flex-1 items-center justify-center px-10">
                    <EmptyState
                        center
                        icon={RouteIcon}
                        title={loading || !settled
                            ? t('racing.loadingRoute', 'Loading the route')
                            : t('racing.noRoute', 'No route to draw')}
                        subtitle={loading || !settled
                            ? undefined
                            : t('racing.noRouteSub', 'The checkpoint list for this track could not be read, so there is nothing to plot.')}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {header}
            <div className="relative min-h-0 flex-1 overflow-hidden">
                <RouteMapView ref={mapRef} points={route} chromeBottom={TRACK_MAP_CHROME} />

                <div className="pointer-events-none absolute inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 rounded-[10px] bg-black/60 px-3 py-[7px]">
                        <span className="flex items-center gap-[6px]">
                            <span className="h-[9px] w-[9px] shrink-0 rounded-full ring-1 ring-white/70" style={{ background: RACING_ACCENT }} />
                            <span className="text-[11px] font-semibold tracking-wide text-white/85">
                                {t('racing.startLine', 'Start')}
                            </span>
                        </span>
                        <span className="flex items-center gap-[6px]">
                            <span className="h-[9px] w-[9px] shrink-0 rounded-[2px] bg-black ring-1 ring-white/70" />
                            <span className="text-[11px] font-semibold tracking-wide text-white/85">
                                {t('racing.finishLine', 'Finish')}
                            </span>
                        </span>
                    </div>
                    <div className="rounded-[10px] bg-black/60 px-3 py-[7px] text-[11px] font-semibold tabular-nums tracking-wide text-white/80">
                        {t('racing.routeSummary', '{n} checkpoints · {km} km', { n: route.length, km: kilometres.toFixed(2) })}
                    </div>
                </div>
            </div>
        </div>
    );
}
