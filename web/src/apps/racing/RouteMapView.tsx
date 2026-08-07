import { forwardRef, useMemo } from 'react';

import { MapView, useStageProjector, type MapViewHandle } from '@/apps/maps/MapView';
import { Pin } from '@/apps/ryde/ui';

import { RACING_ACCENT } from './racingTheme';
import type { RoutePoint } from './data';

export function TrackRoute({ points, accent, thin = false }: {
    points: RoutePoint[];
    accent: string;
    thin?:  boolean;
}) {
    const project = useStageProjector();
    const plotted = points.map(point => project(point.x, point.y));
    const d = plotted.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');

    return (
        <svg className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
            <path
                d={d}
                fill="none"
                stroke="#000"
                strokeOpacity={0.45}
                strokeWidth={thin ? 6 : 9}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <path
                d={d}
                fill="none"
                stroke={accent}
                strokeWidth={thin ? 3.5 : 5}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            {!thin && plotted.slice(1, -1).map((point, index) => (
                <circle
                    key={`${point.x}:${point.y}:${index}`}
                    cx={point.x}
                    cy={point.y}
                    r={4}
                    fill="#fff"
                    stroke="#000"
                    strokeOpacity={0.5}
                    strokeWidth={1.5}
                />
            ))}
        </svg>
    );
}

export function StartPin({ small = false }: { small?: boolean }) {
    const size = small ? 12 : 16;
    return (
        <span
            className="block rounded-full border-white shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
            style={{ height: size, width: size, background: RACING_ACCENT, borderWidth: small ? 2.5 : 3 }}
        />
    );
}

export function FinishPin({ small = false }: { small?: boolean }) {
    const size = small ? 12 : 16;
    return (
        <span
            className="block rounded-[4px] border-white bg-black shadow-[0_2px_6px_rgba(0,0,0,0.4)]"
            style={{ height: size, width: size, borderWidth: small ? 2.5 : 3 }}
        />
    );
}

export const RouteMapView = forwardRef<MapViewHandle, {
    points:        RoutePoint[];
    chromeBottom?: string;
    interactive?:  boolean;
    compact?:      boolean;
}>(function RouteMapView({ points, chromeBottom, interactive = true, compact = false }, ref) {
    const framePoints = useMemo(() => points.map(point => ({ x: point.x, y: point.y })), [points]);

    if (points.length === 0) return null;

    const start  = points[0];
    const finish = points[points.length - 1];

    return (
        <div className={`absolute inset-0 ${interactive ? '' : 'pointer-events-none'}`}>
            <MapView
                ref={ref}
                fitTo={framePoints}
                chromeBottom={chromeBottom}
                stageOverlay={<TrackRoute points={points} accent={RACING_ACCENT} thin={compact} />}
            >
                <Pin x={start.x} y={start.y}><StartPin small={compact} /></Pin>
                <Pin x={finish.x} y={finish.y}><FinishPin small={compact} /></Pin>
            </MapView>
        </div>
    );
});
