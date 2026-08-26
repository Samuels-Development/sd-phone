import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';

import type { MapStyle } from '@/apps/maps/data';
import { styleMaxZoom, tileUrl } from '@/apps/maps/data';
import type { Viewport } from './useMapViewport';

const BACKDROP_Z = 2;
const TARGET_PX = 160;
const MIN_DETAIL_Z = 3;
const MAX_RETRIES = 1;

const missing = new Set<string>();

export function tileZoomFor(style: MapStyle, width: number, zoom: number): number {
    if (!width) return BACKDROP_Z;
    const ideal = Math.round(Math.log2((width * zoom) / TARGET_PX));
    return Math.max(MIN_DETAIL_Z, Math.min(styleMaxZoom(style.tiles), ideal));
}

function layer(style: MapStyle, z: number, width: number, view: Viewport, cull: boolean): ReactNode[] {
    const n = 2 ** z;
    const ts = width / n;
    const seam = 0.7 / view.zoom;

    let lo = 0;
    let hi = n - 1;
    let loY = 0;
    let hiY = n - 1;

    if (cull) {
        const reach = 0.5 / view.zoom;
        const pin = (v: number) => Math.max(0, Math.min(n - 1, v));
        lo  = pin(Math.floor((view.x + 0.5 - reach) * n) - 1);
        hi  = pin(Math.floor((view.x + 0.5 + reach) * n) + 1);
        loY = pin(Math.floor((view.y + 0.5 - reach) * n) - 1);
        hiY = pin(Math.floor((view.y + 0.5 + reach) * n) + 1);
    }

    const out: ReactNode[] = [];
    for (let j = loY; j <= hiY; j++) {
        for (let i = lo; i <= hi; i++) {
            const id = `${style.tiles}/${z}/${i}/${j}`;
            if (missing.has(id)) continue;
            out.push(
                <img
                    key={`${z}-${i}-${j}`}
                    src={tileUrl(style.tiles, z, i, j)}
                    alt=""
                    draggable={false}
                    decoding="async"
                    onLoad={e => {
                        const img = e.currentTarget;
                        img.style.visibility = '';
                        img.style.opacity = '1';
                    }}
                    onError={e => {
                        const img = e.currentTarget;
                        img.style.visibility = 'hidden';
                        img.style.opacity = '0';
                        const tries = Number(img.dataset.retry ?? '0');
                        if (tries >= MAX_RETRIES) {
                            missing.add(id);
                            return;
                        }
                        img.dataset.retry = String(tries + 1);
                        const base = img.src.replace(/&r=\d+$/, '');
                        window.setTimeout(() => { img.src = `${base}&r=${tries + 1}`; }, 700 * (tries + 1));
                    }}
                    className="absolute select-none opacity-0 transition-opacity duration-200"
                    style={{ left: i * ts, top: j * ts, width: ts + seam, height: ts + seam, filter: style.filter }}
                />,
            );
        }
    }
    return out;
}

export const TileCanvas = memo(function TileCanvas({ style, view, width }: {
    style: MapStyle;
    view:  Viewport;
    width: number;
}) {
    const z = tileZoomFor(style, width, view.zoom);

    const backdrop = useMemo(
        () => (width ? layer(style, BACKDROP_Z, width, view, false) : []),
        [style, width, view],
    );

    const detail = useMemo(
        () => (width && z > BACKDROP_Z ? layer(style, z, width, view, true) : []),
        [style, width, z, view],
    );

    if (!width) return null;

    return (
        <div
            className="absolute left-0 top-0 will-change-transform"
            style={{
                width,
                height: width,
                transformOrigin: 'center',
                transform: `scale(${view.zoom}) translate(${-view.x * width}px, ${-view.y * width}px)`,
            }}
        >
            {backdrop}
            {detail}
        </div>
    );
});
