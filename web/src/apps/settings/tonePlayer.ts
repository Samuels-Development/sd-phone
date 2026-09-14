
import { youtubeId } from '@/apps/music/data';


function clampVol(vol: number): number {
    if (!Number.isFinite(vol)) return 1;
    return Math.min(1, Math.max(0, vol));
}

let apiPromise: Promise<void> | null = null;
function loadYtApi(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if ((window as any).YT?.Player) return Promise.resolve();
    if (!apiPromise) {
        apiPromise = new Promise<void>(resolve => {
            const w = window as any;
            const prev = w.onYouTubeIframeAPIReady;
            w.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
            if (!document.querySelector('script[data-yt-tone-api]')) {
                const tag = document.createElement('script');
                tag.src = 'https://www.youtube.com/iframe_api';
                tag.setAttribute('data-yt-tone-api', '1');
                document.head.appendChild(tag);
            }
        });
    }
    return apiPromise;
}

interface YtChannel {
    play: (vid: string, vol: number, loop: boolean, onEnded?: () => void) => void;
    stop: () => void;
    warm: () => void;
}

function createYtChannel(): YtChannel {
    let player: any = null;
    let playerPromise: Promise<void> | null = null;
    let loop = false;
    let onEnded: (() => void) | null = null;
    let gen = 0;

    function ensure(): Promise<void> {
        if (player) return Promise.resolve();
        if (!playerPromise) {
            playerPromise = loadYtApi().then(() => new Promise<void>(resolve => {
                if (player) return resolve();
                const host = document.createElement('div');
                host.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none';
                const inner = document.createElement('div');
                host.appendChild(inner);
                document.body.appendChild(host);
                const w = window as any;
                player = new w.YT.Player(inner, {
                    height: '1', width: '1',
                    playerVars: { controls: 0, disablekb: 1, playsinline: 1 },
                    events: {
                        onReady: () => resolve(),
                        onStateChange: (e: any) => {
                            if (e.data !== 0) return;
                            if (loop) { try { player.seekTo(0, true); player.playVideo(); } catch { /* */ } }
                            else { const cb = onEnded; onEnded = null; cb?.(); }
                        },
                    },
                });
            }));
        }
        return playerPromise;
    }

    return {
        warm() { void ensure().catch(() => {}); },
        play(vid, vol, lp, ended) {
            const mine = ++gen;
            loop = lp;
            onEnded = ended ?? null;
            void ensure().then(() => {
                if (mine !== gen) return;
                try {
                    player.setVolume(Math.round(clampVol(vol) * 100));
                    player.loadVideoById(vid);
                    player.playVideo();
                } catch { /* no-op */ }
            });
        },
        stop() {
            gen++;
            loop = false;
            onEnded = null;
            try { player?.stopVideo?.(); } catch { /* no-op */ }
        },
    };
}

const ringChannel  = createYtChannel();
const notifChannel = createYtChannel();

export function warmYouTube(): void { ringChannel.warm(); notifChannel.warm(); }

let oneShot: HTMLAudioElement | null = null;
let preview: HTMLAudioElement | null = null;
let previewIsYt = false;

export function playOnce(url: string, vol = 1): void {
    if (!url) return;
    const vid = youtubeId(url);
    if (vid) { notifChannel.play(vid, vol, false); return; }
    try {
        if (oneShot) oneShot.pause();
        const a = new Audio(url);
        a.volume = clampVol(vol);
        oneShot = a;
        void a.play().catch(() => {});
    } catch { /* no-op */ }
}

export function startPreview(url: string, vol = 1, onEnded?: () => void): void {
    stopPreview();
    if (!url) return;
    const vid = youtubeId(url);
    if (vid) {
        previewIsYt = true;
        ringChannel.play(vid, vol, false, () => { previewIsYt = false; onEnded?.(); });
        return;
    }
    try {
        const a = new Audio(url);
        a.volume = clampVol(vol);
        preview = a;
        a.addEventListener('ended', () => {
            if (preview === a) { preview = null; onEnded?.(); }
        });
        void a.play().catch(() => {});
    } catch { /* no-op */ }
}

export function stopPreview(): void {
    if (previewIsYt) { previewIsYt = false; ringChannel.stop(); return; }
    if (!preview) return;
    try { preview.pause(); preview.currentTime = 0; } catch { /* no-op */ }
    preview = null;
}

export function startRingtone(url: string, vol = 1): () => void {
    if (!url) return () => {};
    const vid = youtubeId(url);
    if (vid) {
        ringChannel.play(vid, vol, true);
        return () => ringChannel.stop();
    }
    let a: HTMLAudioElement | null = null;
    try {
        a = new Audio(url);
        a.loop = true;
        a.volume = clampVol(vol);
        void a.play().catch(() => {});
    } catch { /* no-op */ }
    return () => {
        if (!a) return;
        try { a.pause(); a.currentTime = 0; } catch { /* no-op */ }
        a = null;
    };
}
