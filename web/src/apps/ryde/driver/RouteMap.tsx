import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';

import { MapView, useStageProjector } from '@/apps/maps/MapView';
import type { Place, Ride } from '../data';
import { DropoffPin, PickupDot, Pin } from '../ui';
import { t } from '@/i18n';
import { portalToPhoneScreen } from '@/ui/portal';

function RouteLine({ a, b }: { a: Place; b: Place }) {
    const project = useStageProjector();
    const p1 = project(a.x, a.y);
    const p2 = project(b.x, b.y);
    return (
        <svg className="absolute inset-0 h-full w-full" style={{ overflow: 'visible' }}>
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#fff" strokeOpacity={0.9} strokeWidth={7} strokeLinecap="round" />
            <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#0A84FF" strokeWidth={4} strokeLinecap="round" />
        </svg>
    );
}

export function RouteMap({ request, onClose }: { request: Ride; onClose: () => void }) {
    const r = request;
    const fitTo = useMemo(
        () => [{ x: r.pickup.x, y: r.pickup.y }, { x: r.dropoff.x, y: r.dropoff.y }],
        [r.pickup.x, r.pickup.y, r.dropoff.x, r.dropoff.y],
    );

    const [shown, setShown] = useState(false);
    useEffect(() => {
        const id = window.setTimeout(() => setShown(true), 20);
        return () => window.clearTimeout(id);
    }, []);
    function close() {
        setShown(false);
        window.setTimeout(onClose, 320);
    }

    const view = (
        <div
            className="absolute inset-0 z-[70] flex flex-col bg-base font-sf"
            style={{ transform: shown ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)' }}
        >
            <div className="flex shrink-0 items-center px-3 pb-1" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <button onClick={close} className="flex items-center gap-0.5 py-1 pr-3 text-[17px] font-semibold text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-[26px] w-[26px]" strokeWidth={2.4} /> {t('ryde.offer', 'Offer')}
                </button>
            </div>
            <div className="shrink-0 px-5 pb-2">
                <h1 className="text-[30px] font-bold tracking-tight text-black dark:text-white">{t('ryde.route', 'Route')}</h1>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <MapView fitTo={fitTo} stageOverlay={<RouteLine a={r.pickup} b={r.dropoff} />}>
                    <Pin x={r.pickup.x} y={r.pickup.y}><PickupDot /></Pin>
                    <Pin x={r.dropoff.x} y={r.dropoff.y}><DropoffPin /></Pin>
                </MapView>
            </div>

            <div className="shrink-0 rounded-t-[18px] bg-surface px-5 pb-[calc(var(--safe-bottom)+16px)] pt-3 shadow-[0_-6px_24px_rgba(0,0,0,0.12)]">
                <div className="mb-3 space-y-2.5 rounded-2xl bg-black/[0.05] p-4 dark:bg-white/[0.07]">
                    <div className="flex items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full bg-[#22c55e]" /><span className="truncate text-[16px] font-medium text-black dark:text-white">{r.pickup.name}</span></div>
                    <div className="flex items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full bg-black dark:bg-white" /><span className="truncate text-[16px] font-medium text-black dark:text-white">{r.dropoff.name}</span></div>
                </div>
                <p className="text-center text-[15px] text-ios-gray">{r.distanceKm.toFixed(1)} km · about {r.durationMin} min</p>
            </div>
        </div>
    );

    return portalToPhoneScreen(view);
}
