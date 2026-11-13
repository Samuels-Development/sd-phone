
import homescreen from '@/assets/wallpapers/homescreen.webp';
import lockscreen from '@/assets/wallpapers/lockscreen.webp';
import { PHOTO_SOURCES } from '@/apps/photos/data';

const PHOTO_KEYS = PHOTO_SOURCES.map((_, i) => `background${i + 3}.jpg`);

const WALLPAPERS: Record<string, string> = {
    'wallpaper-lock.jpg':  lockscreen,
    'wallpaper-home.jpg':  homescreen,
    'lockscreen.jpg':      lockscreen,
    'homescreen.jpg':      homescreen,
};
PHOTO_KEYS.forEach((key, i) => { WALLPAPERS[key] = PHOTO_SOURCES[i]; });

const URL_TO_KEY: Record<string, string> = { [lockscreen]: 'lockscreen.jpg', [homescreen]: 'homescreen.jpg' };
PHOTO_KEYS.forEach((key, i) => { URL_TO_KEY[PHOTO_SOURCES[i]] = key; });

function isUrl(value: string): boolean {
    return /^(?:https?:|data:|blob:|nui:|\/)/i.test(value);
}

export function resolveWallpaper(name: string): string {
    if (!name) return homescreen;
    if (name in WALLPAPERS) return WALLPAPERS[name];
    return isUrl(name) ? name : homescreen;
}

export function wallpaperKey(value: string): string {
    if (!value) return value;
    if (value in WALLPAPERS) return value;
    const exact = URL_TO_KEY[value];
    if (exact) return exact;
    const stem = value.match(/(?:^|\/)([a-z0-9]+)-[A-Za-z0-9_-]{6,}\.(?:jpe?g|webp)(?:[?#]|$)/);
    if (stem) {
        const candidate = `${stem[1]}.jpg`;
        if (candidate in WALLPAPERS) return candidate;
    }
    return value;
}
