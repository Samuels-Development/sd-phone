import { isHostMessage } from '@/core/messageSource';
import { fetchNui } from '@/core/nui';
import { TILE_SOURCES, tileUrl } from './data';

const BASE_LAYER_Z = 3;

function testTile(url: string): Promise<boolean> {
    return new Promise(resolve => {
        const img = new Image();
        let done = false;
        const finish = (ok: boolean) => { if (!done) { done = true; resolve(ok); } };
        img.onload  = () => finish(img.naturalWidth > 0);
        img.onerror = () => finish(false);
        img.src = url;
        setTimeout(() => finish(false), 6000);
    });
}

interface StyleReport {
    name: 'satellite' | 'atlas';
    base: string;
    maxZoom: number;
    deepestOk: number;
    levels: { z: number; ok: boolean }[];
}

async function checkStyle(name: 'satellite' | 'atlas'): Promise<StyleReport> {
    const src = TILE_SOURCES[name];
    const top = Math.min(9, src.maxZoom + 2);
    const levels: { z: number; ok: boolean }[] = [];
    for (let z = BASE_LAYER_Z; z <= top; z++) {
        const n = 2 ** z;
        const c = Math.floor(n / 2);
        levels.push({ z, ok: await testTile(tileUrl(name, z, c, c)) });
    }
    let deepestOk = -1;
    for (const l of levels) if (l.ok) deepestOk = l.z;
    return { name, base: src.base, maxZoom: src.maxZoom, deepestOk, levels };
}

let running = false;

export function initTileCheck(): void {
    window.addEventListener('message', async (event: MessageEvent) => {
        if (!isHostMessage(event)) return;
        const msg = event.data as { action?: string } | undefined;
        if (!msg || msg.action !== 'sd-phone:maps:tilecheck' || running) return;
        running = true;
        try {
            const styles: StyleReport[] = [];
            for (const name of ['satellite', 'atlas'] as const) styles.push(await checkStyle(name));
            await fetchNui('sd-phone:maps:tilecheckResult', { styles });
        } finally {
            running = false;
        }
    });
}
