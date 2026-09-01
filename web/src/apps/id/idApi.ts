import { fetchNui, isFiveM } from '@/core/nui';
import { apiCall, apiData } from '@/core/api';
import { SEED_CARDS, type IdCardData } from './data';

export interface IdListData { cards: IdCardData[]; portrait: string | null }

let devPortrait: string | null = null;

export async function idList(): Promise<IdListData | null> {
    if (!isFiveM) return { cards: SEED_CARDS.map(c => ({ ...c, portrait: devPortrait })), portrait: devPortrait };
    const res = await apiData<Partial<IdListData>>('sd-phone:id:list');
    if (!res) return null;
    const portrait = res.portrait ?? null;
    return { cards: (res.cards ?? []).map(c => ({ ...c, portrait: c.portrait ?? portrait })), portrait };
}

export async function idSetPortrait(url: string | null): Promise<boolean> {
    if (!isFiveM) { devPortrait = url; return true; }
    const res = await apiCall<{ portrait: string | null }>('sd-phone:id:setPortrait', { url });
    return res.success;
}

export async function idShare(target: number, card: string, portrait: string | null): Promise<boolean> {
    if (!isFiveM) return true;
    const res = await apiCall<void>('sd-phone:id:share', { target, card, portrait: portrait ?? undefined });
    return res.success;
}

export async function devCapturePortrait(): Promise<string> {
    return `https://picsum.photos/seed/idportrait${Math.floor(Math.random() * 1000)}/400/533`;
}

function textureToDataUrl(txd: string): Promise<string | null> {
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width  = img.naturalWidth;
                canvas.height = img.naturalHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) { resolve(null); return; }
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = `https://nui-img/${txd}/${txd}?t=${Date.now()}`;
    });
}

export async function idHeadshot(): Promise<string | null> {
    if (!isFiveM) return SEED_CARDS[0]?.portrait ?? null;
    const res = await fetchNui<{ txd?: string | null }>('sd-phone:id:headshot');
    if (!res?.txd) return null;
    try {
        return await textureToDataUrl(res.txd);
    } finally {
        void fetchNui('sd-phone:id:headshotDone');
    }
}
