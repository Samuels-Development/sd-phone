import { useCallback, useEffect, useState } from 'react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useAsyncData } from '@/hooks/useAsyncData';
import { fetchNui, isFiveM } from '@/core/nui';
import type { RydeLatLng, RydeRequestPush } from '@/core/types';
import { LEADERBOARD, PLACES } from './data';
import type { DriverInfo, LeaderEntry, Place } from './data';
import { apiData } from '@/core/api';

export interface RydeActiveRide {
    id: string; tripId?: string; status: string;
    pickup: RydeLatLng; dropoff: RydeLatLng; distance: number;
    payment?: 'card' | 'cash'; fare?: number; createdAt?: number; riderName?: string; riderNumber?: string;
    driver?: DriverInfo;
    offers?: { tripId: string; fare: number; driver: DriverInfo }[];
}
export interface RydeSync {
    rider?: RydeActiveRide | null;
    driver?: RydeActiveRide | null;
    lastEnded?: { id: string; status: string; fare: number } | null;
    requests?: RydeRequestPush[] | null;
}


async function rydeCall<T = unknown>(event: string, payload?: unknown): Promise<T | null> {
    if (!isFiveM) return null;
    return apiData<T>(event, payload);
}

export const ryde = {
    requestRide: (dropoff: { label: string; x: number; y: number }) =>
        rydeCall<{ requestId: string }>('sd-phone:ryde:requestRide', { dropoff }),
    sync:       () => rydeCall<RydeSync>('sd-phone:ryde:sync'),
    watchTrip:  (tripId: string, on: boolean) => rydeCall('sd-phone:ryde:watchTrip', { tripId, on }),
    respond:    (tripId: string, accept: boolean) => rydeCall('sd-phone:ryde:respond', { tripId, accept }),
    cancel:     () => rydeCall('sd-phone:ryde:cancel'),
    setOnline:  (online: boolean, vehicle?: { vehicle: string; plate: string; color: string }) =>
        rydeCall<{ online: boolean; requests?: RydeRequestPush[]; waiting?: number }>('sd-phone:ryde:setOnline', { online, ...(vehicle ?? {}) }),
    waitingCount: () => rydeCall<{ count: number }>('sd-phone:ryde:waitingCount'),
    accept:     (requestId: string, fare: number) => rydeCall<{ tripId: string }>('sd-phone:ryde:accept', { requestId, fare }),
    tripStatus: (tripId: string, status: string) => rydeCall('sd-phone:ryde:tripStatus', { tripId, status }),
    complete:   (tripId: string) => rydeCall('sd-phone:ryde:complete', { tripId }),
    rate:       (rideId: string, stars: number, tip = 0) => rydeCall<{ rated: number; tipPaid: number }>('sd-phone:ryde:rate', { rideId, stars, tip }),
};

export async function rydeDeleteAccount(): Promise<void> {
    await rydeCall('sd-phone:ryde:deleteAccount');
}

export async function rydeZoneName(x: number, y: number): Promise<string> {
    if (isFiveM) {
        const r = await rydeCall<{ name: string }>('sd-phone:ryde:zoneName', { x, y });
        if (r?.name) return r.name;
    }
    let best = PLACES[0], bestD = Infinity;
    for (const p of PLACES) {
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) { bestD = d; best = p; }
    }
    return best.sub || best.name;
}

export interface PeerPos { x: number; y: number; h: number }

export function useTripPeer(tripId: string | undefined): PeerPos | null {
    const [peer, setPeer] = useState<PeerPos | null>(null);
    useNuiEvent('sd-phone:ryde:peerLocation', useCallback((d) => {
        if (d && d.tripId === tripId) setPeer({ x: d.x, y: d.y, h: d.h });
    }, [tripId]));
    useEffect(() => {
        if (!isFiveM || !tripId) return;
        setPeer(null);
        void ryde.watchTrip(tripId, true);
        return () => { void ryde.watchTrip(tripId, false); };
    }, [tripId]);
    return peer;
}

export async function rydeNearPoint(x: number, y: number, radius = 100): Promise<{ near: boolean; distance: number }> {
    if (!isFiveM) return { near: true, distance: 0 };
    const r = await fetchNui<{ near: boolean; distance: number }>('sd-phone:ryde:nearPoint', { x, y, radius });
    return r ?? { near: false, distance: -1 };
}

export async function rydeSameVehicle(tripId: string): Promise<boolean> {
    if (!isFiveM) return true;
    const r = await rydeCall<{ same: boolean }>('sd-phone:ryde:sameVehicle', { tripId });
    return !!r?.same;
}

function slug(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'loc';
}

export function useRydeDriverCut(): number {
    const [cut, setCut] = useState(1);
    useEffect(() => {
        if (!isFiveM) return;
        void rydeCall<{ driverCut: number }>('sd-phone:ryde:config').then(d => {
            if (d && typeof d.driverCut === 'number' && d.driverCut > 0) setCut(d.driverCut);
        });
    }, []);
    return cut;
}

export function useRydeLeaderWeight(): { prior: number; weight: number } {
    const [w, setW] = useState({ prior: 4.5, weight: 10 });
    useEffect(() => {
        if (!isFiveM) return;
        void rydeCall<{ leaderPrior: number; leaderWeight: number }>('sd-phone:ryde:config').then(d => {
            if (d) setW({ prior: d.leaderPrior ?? 4.5, weight: d.leaderWeight ?? 10 });
        });
    }, []);
    return w;
}

interface RydeLocation { name: string; sub: string; x: number; y: number }

const NO_PLACES: Place[] = [];

export function useRydeLocations(): Place[] {
    const { data } = useAsyncData(
        async () => {
            const d = await rydeCall<{ locations: RydeLocation[] }>('sd-phone:ryde:config');
            return d?.locations ? d.locations.map(l => ({ id: slug(l.name), name: l.name, sub: l.sub, x: l.x, y: l.y })) : null;
        },
        [],
        { enabled: isFiveM },
    );
    return isFiveM ? data ?? NO_PLACES : PLACES;
}

export interface RydeVehicle { name: string; plate: string }

const DEV_VEHICLES: RydeVehicle[] = [
    { name: 'Karin Sultan',       plate: '12ABC345' },
    { name: 'Vapid Dominator',    plate: '88KMA221' },
    { name: 'Übermacht Sentinel', plate: 'NORTH019' },
    { name: 'Declasse Tornado',   plate: 'VESP771' },
];

const NO_VEHICLES: RydeVehicle[] = [];
const NO_LEADERS: LeaderEntry[] = [];

export function useRydeVehicles(): { vehicles: RydeVehicle[]; loading: boolean } {
    const { data, loading } = useAsyncData(
        () => apiData<{ model: string; plate: string }[]>('sd-phone:garages:list')
            .then(r => (r ? r.map(v => ({ name: v.model, plate: (v.plate || '').trim() })) : null)),
        [],
        { enabled: isFiveM },
    );
    return { vehicles: isFiveM ? data ?? NO_VEHICLES : DEV_VEHICLES, loading };
}

export function useRydeLeaderboard(): LeaderEntry[] {
    const { data } = useAsyncData(
        () => rydeCall<{ leaders: LeaderEntry[] }>('sd-phone:ryde:leaderboard').then(d => d?.leaders ?? null),
        [],
        { enabled: isFiveM },
    );
    return isFiveM ? data ?? NO_LEADERS : LEADERBOARD;
}
