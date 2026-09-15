import { useCallback, useEffect, useRef, useState } from 'react';

import { apiCall, apiData } from '@/core/api';
import { isFiveM } from '@/core/nui';
import palette from './palette.json';
import type { Customization, ExtrasCatalog } from './customization';
import { useNuiEvent } from '@/hooks/useNuiEvent';


export interface ScootScooter {
    customization?: Customization;
    extraFee?: number;
    id:        number;
    plate:     string;
    colour:    number;
    x:         number;
    y:         number;
    z:         number;
    distance:  number;
    available: boolean;
    bunkerId:  number | null;
}

export interface ScootStation {
    id:       number;
    name:     string;
    x:        number;
    y:        number;
    z:        number;
    distance: number;
    stock:    number;
    busy:     boolean;
}

export interface ScootRide {
    customization?: Customization;
    extraFee?: number;
    id:        number;
    scooterId: number;
    plate:     string;
    colour:    number;
    startedAt: number;
    minutes:   number;
    cost:      number;
}

export interface ScootPricing {
    unlock:       number;
    perMinute:    number;
    currency:     string;
    rentDistance:    number;
    stationDistance: number;
    refreshMs:       number;
}

export interface ScootColour { id: number; name: string; hex: string; previewHex?: string }
export interface ScootDispense { customization?: Customization; extraFee?: number; bunkerId: number; colour: number; readyAt: number }

export interface ScootSnapshot {
    extrasCatalog?: ExtrasCatalog;
    colours?: ScootColour[];
    canChooseColour?: boolean;
    dispense?: ScootDispense | null;
    player:   { x: number; y: number; z: number; heading: number };
    scooters: ScootScooter[];
    bunkers:  ScootStation[];
    ride:     ScootRide | null;
    pricing:  ScootPricing;
}

export interface ScootReceipt {
    plate:   string;
    minutes: number;
    cost:    number;
    paid:    boolean;
    docked?: string | null;
}

export interface ScootPastRide {
    id:        number;
    scooterId: number;
    plate:     string | null;
    startedAt: number;
    endedAt:   number;
    minutes:   number;
    cost:      number;
    paid:      number;
}

export const SCOOT_PALETTE: ScootColour[] = palette;
export const SCOOT_COLOURS: Record<number, string> = Object.fromEntries(palette.map(c => [c.id, c.hex]));

export const scoot = {
    snapshot: () => apiData<ScootSnapshot>('sd-phone:scoot:snapshot'),
    history:  () => apiData<{ rides: ScootPastRide[] }>('sd-phone:scoot:history'),
    rent:     (id: number) => apiCall<{ ride: ScootRide; nearby: ScootSnapshot }>('sd-phone:scoot:rent', { id }),
    rentHere: (bunkerId: number, colour: number, customization: Customization) => apiCall<{ dispense: { bunkerId: number; colour: number; spawnAt: number }; nearby: ScootSnapshot }>('sd-phone:scoot:rentHere', { bunkerId, colour, customization }),
    finish:   () => apiCall<{ receipt: ScootReceipt; nearby: ScootSnapshot }>('sd-phone:scoot:finish'),
    waypoint: (x: number, y: number) => apiData('sd-phone:scoot:waypoint', { x, y }),
};

export const DEV_SNAPSHOT: ScootSnapshot = {
    colours: SCOOT_PALETTE, canChooseColour: true, dispense: null,
    player: { x: 201, y: -940, z: 30.7, heading: 20 },
    scooters: [
        { id: 1, plate: 'SCOOT001', colour: 10, x: 195.2, y: -935.4, z: 31, distance: 7.4, available: true, bunkerId: 1 },
        { id: 2, plate: 'SCOOT002', colour: 3, x: 210.9, y: -921.1, z: 30.7, distance: 21.3, available: true, bunkerId: 1 },
        { id: 3, plate: 'SCOOT003', colour: 5, x: 240, y: -900, z: 30.7, distance: 56, available: false, bunkerId: null },
    ],
    bunkers: [{ id: 1, name: 'Legion Square', x: 195.2, y: -933.8, z: 30.69, distance: 8.7, stock: 4, busy: false }],
    ride: null,
    pricing: { unlock: 5, perMinute: 1, currency: '$', rentDistance: 12, stationDistance: 12, refreshMs: 2500 },
};

export function useScootFeed() {
    const [snapshot, setSnapshot] = useState<ScootSnapshot | null>(isFiveM ? null : DEV_SNAPSHOT);
    const [connected, setConnected] = useState(!isFiveM);
    const timer = useRef<number | null>(null);

    const refresh = useCallback(async () => {
        if (!isFiveM) return;
        try {
            const next = await scoot.snapshot();
            setConnected(!!next);
            if (next) setSnapshot(next);
        } catch { setConnected(false); }
    }, []);

    useEffect(() => {
        if (!isFiveM) return;
        let alive = true;
        const loop = async () => {
            await refresh();
            if (!alive) return;
            timer.current = window.setTimeout(loop, snapshot?.pricing.refreshMs ?? 2500);
        };
        void loop();
        return () => {
            alive = false;
            if (timer.current) window.clearTimeout(timer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refresh]);

    useNuiEvent('sd-phone:scoot:rideUpdated', useCallback(() => { void refresh(); }, [refresh]));

    return { snapshot, setSnapshot, refresh, connected };
}
