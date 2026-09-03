import { fetchNui, isFiveM } from '@/core/nui';
import type { Envelope } from '@/core/api';
import { VEHICLES } from './data';
import type { Vehicle } from './data';

export async function fetchVehicles(): Promise<Vehicle[]> {
    if (!isFiveM) return VEHICLES;
    const res = await fetchNui<Envelope<Vehicle[]>>('sd-phone:garages:list');
    return res?.success && Array.isArray(res.data) ? res.data : [];
}

export function resolveImage(v: Pick<Vehicle, 'image' | 'customImage'>, showStock: boolean): string | null {
    if (typeof v.customImage === 'string' && v.customImage !== '') return v.customImage;
    if (showStock && typeof v.image === 'string' && v.image !== '') return v.image;
    return null;
}

export async function setVehicleImage(plate: string, url: string | null): Promise<Envelope<{ plate: string; url?: string }>> {
    if (!isFiveM) {
        const v = VEHICLES.find(x => x.plate === plate);
        if (v) {
            if (url) v.customImage = url;
            else delete v.customImage;
        }
        return { success: true, data: { plate, ...(url ? { url } : {}) } };
    }
    const res = await fetchNui<Envelope<{ plate: string; url?: string }>>('sd-phone:garages:setImage', { plate, url: url ?? undefined });
    return res ?? { success: false, message: 'No response' };
}
