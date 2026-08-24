import { useEffect, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';

import { projectPct, tileUrl } from '@/apps/maps/data';
import { adminLivePositions } from '../adminApi';
import type { AdminLivePlayer } from '../types';
import { Btn, Card, CenterNote, Spinner } from '../ui';

const ZOOM = 3;
const SIDE = 2 ** ZOOM;
const POLL_MS = 5000;

export function MapPage({ onOpenPlayer }: { onOpenPlayer: (cid: string) => void }) {
    const [players, setPlayers] = useState<AdminLivePlayer[]>([]);
    const [loading, setLoading] = useState(true);
    const [live, setLive] = useState(true);
    const [hover, setHover] = useState<AdminLivePlayer | null>(null);

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

    const tiles: React.ReactNode[] = [];
    for (let y = 0; y < SIDE; y++) {
        for (let x = 0; x < SIDE; x++) {
            tiles.push(
                <img
                    key={`${x}-${y}`}
                    src={tileUrl('satellite', ZOOM, x, y)}
                    alt=""
                    draggable={false}
                    className="h-full w-full object-cover"
                />,
            );
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[13px] text-zinc-400">
                    <Users size={14} className="text-zinc-500" />
                    <span className="font-semibold text-zinc-200 tabular-nums">{players.length}</span>
                    online
                    {live && <span className="text-[11.5px] text-zinc-600">· refreshing every {POLL_MS / 1000}s</span>}
                </div>
                <Btn onClick={() => setLive(v => !v)}>
                    <RefreshCw size={13} className={live ? 'animate-spin' : undefined} />
                    {live ? 'Pause' : 'Resume'}
                </Btn>
            </div>

            <Card className="p-3">
                <div className="relative w-full overflow-hidden rounded-lg bg-[#0b1418]" style={{ aspectRatio: '1 / 1' }}>
                    <div
                        className="absolute inset-0 grid"
                        style={{ gridTemplateColumns: `repeat(${SIDE}, 1fr)`, gridTemplateRows: `repeat(${SIDE}, 1fr)` }}
                    >
                        {tiles}
                    </div>

                    {loading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Spinner /></div>
                    )}

                    {players.map(p => {
                        const at = projectPct(p.x, p.y);
                        return (
                            <button
                                key={p.source}
                                type="button"
                                onClick={() => onOpenPlayer(p.cid)}
                                onMouseEnter={() => setHover(p)}
                                onMouseLeave={() => setHover(null)}
                                className="absolute -ml-[6px] -mt-[6px] h-3 w-3 rounded-full ring-2 ring-black/60 transition-transform hover:scale-150"
                                style={{ left: `${at.left}%`, top: `${at.top}%`, background: '#6db4ff' }}
                                aria-label={p.name}
                            />
                        );
                    })}

                    {hover && (
                        <div
                            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[150%] whitespace-nowrap rounded-md bg-black/85 px-2 py-1 text-[11.5px] text-zinc-100 ring-1 ring-white/10"
                            style={{ left: `${projectPct(hover.x, hover.y).left}%`, top: `${projectPct(hover.x, hover.y).top}%` }}
                        >
                            <span className="font-semibold">{hover.name}</span>
                            <span className="ml-1.5 tabular-nums text-zinc-500">{hover.x}, {hover.y}</span>
                        </div>
                    )}
                </div>
            </Card>

            {!loading && players.length === 0 && <CenterNote>Nobody is online right now.</CenterNote>}
        </div>
    );
}
