import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Maximize, Minus, Plus, RefreshCw, Users } from 'lucide-react';

import type { MapStyleId } from '@/apps/maps/data';
import { getMapStyles, loadStyleId, projectPct, saveStyleId } from '@/apps/maps/data';
import { adminLivePositions } from '../adminApi';
import type { AdminLivePlayer } from '../types';
import { Btn, Card, CenterNote, Spinner } from '../ui';
import { TileCanvas } from './map/TileCanvas';
import { MAX_ZOOM, MIN_ZOOM, useMapViewport } from './map/useMapViewport';

const POLL_MS = 5000;

export function MapPage({ onOpenPlayer }: { onOpenPlayer: (cid: string) => void }) {
    const [players, setPlayers] = useState<AdminLivePlayer[]>([]);
    const [loading, setLoading] = useState(true);
    const [live, setLive] = useState(true);
    const [hover, setHover] = useState<AdminLivePlayer | null>(null);
    const [styleId, setStyleId] = useState<MapStyleId>(() => loadStyleId());

    const styles = useMemo(() => getMapStyles(), []);
    const style = styles.find(s => s.id === styleId) ?? styles[0]!;
    const vp = useMapViewport();

    useEffect(() => {
        let alive = true;
        function pull() {
            void adminLivePositions().then(res => {
                if (!alive) return;
                setPlayers(res.success ? res.data?.players ?? [] : []);
                setLoading(false);
            });
        }
        pull();
        if (!live) return () => { alive = false; };
        const id = window.setInterval(pull, POLL_MS);
        return () => { alive = false; window.clearInterval(id); };
    }, [live]);

    function pickStyle(id: MapStyleId) {
        setStyleId(id);
        saveStyleId(id);
    }

    const hoverWorld = hover ? projectPct(hover.x, hover.y) : null;
    const hoverAt = hoverWorld ? vp.toScreen(hoverWorld.left, hoverWorld.top) : null;

    return (
        <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[13px] text-zinc-400">
                    <Users size={14} className="text-zinc-500" />
                    <span className="font-semibold text-zinc-200 tabular-nums">{players.length}</span>
                    online
                    {live && <span className="text-[11.5px] text-zinc-600">· refreshing every {POLL_MS / 1000}s</span>}
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex overflow-hidden rounded-lg ring-1 ring-white/10">
                        {styles.map(s => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => pickStyle(s.id)}
                                className={`px-2.5 py-1.5 text-[12px] font-medium transition-colors ${s.id === styleId ? 'bg-white/15 text-zinc-100' : 'bg-transparent text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    <Btn onClick={() => setLive(v => !v)}>
                        <RefreshCw size={13} className={live ? 'animate-spin' : undefined} />
                        {live ? 'Pause' : 'Resume'}
                    </Btn>
                </div>
            </div>

            <Card className="flex min-h-0 flex-1 p-3">
                <div
                    ref={vp.ref}
                    onPointerDown={vp.surface.onPointerDown}
                    onWheel={vp.surface.onWheel}
                    className={`relative mx-auto h-full max-w-full touch-none overflow-hidden rounded-lg ${vp.panning ? 'cursor-grabbing' : 'cursor-grab'}`}
                    style={{ aspectRatio: '1 / 1', background: style.bg }}
                >
                    <TileCanvas style={style} view={vp.view} width={vp.width} />

                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Spinner /></div>
                    )}

                    {players.map(p => {
                        const world = projectPct(p.x, p.y);
                        const at = vp.toScreen(world.left, world.top);
                        if (at.left < -4 || at.left > 104 || at.top < -4 || at.top > 104) return null;
                        return (
                            <button
                                key={p.source}
                                type="button"
                                onClick={() => onOpenPlayer(p.cid)}
                                onPointerEnter={() => setHover(p)}
                                onPointerLeave={() => setHover(null)}
                                className="absolute -ml-[6px] -mt-[6px] h-3 w-3 rounded-full ring-2 ring-black/60 transition-transform hover:scale-150"
                                style={{ left: `${at.left}%`, top: `${at.top}%`, background: '#6db4ff' }}
                                aria-label={p.name}
                            />
                        );
                    })}

                    {hover && hoverAt && (
                        <div
                            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[150%] whitespace-nowrap rounded-md bg-black/85 px-2 py-1 text-[11.5px] text-zinc-100 ring-1 ring-white/10"
                            style={{ left: `${hoverAt.left}%`, top: `${hoverAt.top}%` }}
                        >
                            <span className="font-semibold">{hover.name}</span>
                            <span className="ml-1.5 tabular-nums text-zinc-500">{hover.x}, {hover.y}</span>
                        </div>
                    )}

                    <div className="absolute right-2.5 top-2.5 z-10 flex flex-col overflow-hidden rounded-lg bg-black/70 ring-1 ring-white/10">
                        <ZoomBtn label="Zoom in" disabled={vp.view.zoom >= MAX_ZOOM} onClick={() => vp.zoomBy(1.6)}>
                            <Plus size={14} />
                        </ZoomBtn>
                        <ZoomBtn label="Zoom out" disabled={vp.view.zoom <= MIN_ZOOM} onClick={() => vp.zoomBy(1 / 1.6)}>
                            <Minus size={14} />
                        </ZoomBtn>
                        <ZoomBtn label="Reset view" disabled={vp.atHome} onClick={vp.home}>
                            <Maximize size={13} />
                        </ZoomBtn>
                    </div>

                    <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-10 rounded-md bg-black/70 px-2 py-1 text-[11px] tabular-nums text-zinc-400 ring-1 ring-white/10">
                        {vp.view.zoom.toFixed(1)}x
                    </div>
                </div>
            </Card>

            {!loading && players.length === 0 && <CenterNote>Nobody is online right now.</CenterNote>}
        </div>
    );
}

function ZoomBtn({ children, label, onClick, disabled }: {
    children:  ReactNode;
    label:     string;
    onClick:   () => void;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onPointerDown={e => e.stopPropagation()}
            onClick={onClick}
            className="flex h-7 w-7 items-center justify-center text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:text-zinc-600"
        >
            {children}
        </button>
    );
}
