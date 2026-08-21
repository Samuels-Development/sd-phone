import { getGameRender } from '@/render';

const KEY = 'sd-phone:cctv:thumbs';
const THUMB_W = 448;
const THUMB_H = 320;
const SETTLE_MS = 900;
const MAX_STORED = 60;

type ThumbMap = Record<string, string>;

let cache: ThumbMap | null = null;
const listeners = new Set<() => void>();

function load(): ThumbMap {
    if (cache) return cache;
    try {
        const raw = window.localStorage.getItem(KEY);
        cache = raw ? (JSON.parse(raw) as ThumbMap) : {};
    } catch {
        cache = {};
    }
    return cache;
}

function persist(map: ThumbMap): void {
    cache = map;
    try {
        window.localStorage.setItem(KEY, JSON.stringify(map));
    } catch {
        const keys = Object.keys(map);
        for (let i = 0; i < Math.ceil(keys.length / 2); i++) delete map[keys[i]];
        try { window.localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* give up quietly */ }
    }
    for (const fn of listeners) fn();
}

export function thumbFor(cameraId: string): string | null {
    return load()[cameraId] ?? null;
}

export function curatedThumb(cameraId: string): string {
    return `cctv/${cameraId}.jpg`;
}

export function onThumbs(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

let capturing = false;

export async function captureThumb(cameraId: string): Promise<void> {
    if (capturing || !cameraId) return;
    capturing = true;

    let render: Awaited<ReturnType<typeof getGameRender>> | null = null;
    const source = document.createElement('canvas');

    try {
        const feed = await getGameRender();
        if (!feed) return;
        render = feed;
        feed.setZoom(1);
        feed.setTargetFps(10);
        feed.renderToTarget(source);

        await new Promise(resolve => window.setTimeout(resolve, SETTLE_MS));
        if (!source.width || !source.height) return;

        const out = document.createElement('canvas');
        out.width = THUMB_W;
        out.height = THUMB_H;
        const ctx = out.getContext('2d');
        if (!ctx) return;

        const scale = Math.max(THUMB_W / source.width, THUMB_H / source.height);
        const w = source.width * scale;
        const h = source.height * scale;
        ctx.drawImage(source, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);

        const data = out.toDataURL('image/jpeg', 0.78);
        if (data.length < 128) return;

        const map = { ...load(), [cameraId]: data };
        const keys = Object.keys(map);
        if (keys.length > MAX_STORED) delete map[keys[0]];
        persist(map);
    } catch {
        /* a thumbnail is a nicety; never let it break the camera view */
    } finally {
        try { render?.stop(); } catch { /* renderer gone */ }
        capturing = false;
    }
}
