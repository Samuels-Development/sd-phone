import { type ReactNode } from 'react';

import { projectPct, styleMaxZoom, tileUrl } from '@/apps/maps/data';

const TILE_PX = 256;
const BACKDROP_Z = 2;

export interface LocationMapPreviewProps {
    x: number;
    y: number;
    width?: number;
    height?: number;
}

export function LocationMapPreview({ x, y, width = 230, height = 140 }: LocationMapPreviewProps) {
    const zMax = styleMaxZoom('satellite');
    const n = 2 ** zMax;
    const { left, top } = projectPct(x, y);
    const px = (left / 100) * n * TILE_PX;
    const py = (top / 100) * n * TILE_PX;
    const originX = width / 2 - px;
    const originY = height / 2 - py;

    const layer = (z: number): ReactNode[] => {
        const span = TILE_PX * 2 ** (zMax - z);
        const nz = 2 ** z;
        const clampIdx = (v: number) => Math.max(0, Math.min(nz - 1, v));
        const iMin = clampIdx(Math.floor((px - width / 2) / span));
        const iMax = clampIdx(Math.floor((px + width / 2) / span));
        const jMin = clampIdx(Math.floor((py - height / 2) / span));
        const jMax = clampIdx(Math.floor((py + height / 2) / span));

        const tiles: ReactNode[] = [];
        for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
                tiles.push(
                    <img
                        key={`${z}-${i}-${j}`}
                        src={tileUrl('satellite', z, i, j)}
                        alt=""
                        draggable={false}
                        decoding="async"
                        onError={e => {
                            const imgEl = e.currentTarget as HTMLImageElement;
                            imgEl.style.opacity = '0';
                            const tries = Number(imgEl.dataset.retry ?? '0');
                            if (tries < 2) {
                                imgEl.dataset.retry = String(tries + 1);
                                const base = imgEl.src.replace(/&r=\d+$/, '');
                                window.setTimeout(() => { imgEl.src = `${base}&r=${tries + 1}`; }, 900 * (tries + 1));
                            }
                        }}
                        onLoad={e => { (e.currentTarget as HTMLImageElement).style.opacity = '1'; }}
                        className="absolute max-w-none select-none"
                        style={{
                            left: originX + i * span,
                            top: originY + j * span,
                            width: span + 0.6,
                            height: span + 0.6,
                        }}
                    />,
                );
            }
        }
        return tiles;
    };

    return <>{layer(BACKDROP_Z)}{layer(zMax - 1)}{layer(zMax)}</>;
}
