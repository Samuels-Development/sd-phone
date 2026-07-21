export function initials(name: string, max = 2): string {
    return name
        .split(/\s+/)
        .map(p => p[0] ?? '')
        .join('')
        .slice(0, max)
        .toUpperCase() || '?';
}

const CONTACT_PALETTE = ['#0a84ff', '#30d158', '#ff375f', '#ff9f0a', '#bf5af2', '#ff453a', '#5e5ce6', '#64d2ff', '#ffd60a', '#636366'];

export function colorFor(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(h, 31) + str.charCodeAt(i)) | 0;
    return CONTACT_PALETTE[Math.abs(h) % CONTACT_PALETTE.length];
}

export function initialsFor(name: string): string {
    const words = name.trim().split(/\s+/);
    const out = ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
    return out || name[0]?.toUpperCase() || '#';
}

export function digits(s: string): string {
    return s.replace(/\D/g, '');
}

// True when a display name is a phone number (no letters) — i.e. an unsaved/unknown contact.
export function isNumericName(name: string): boolean {
    return !/\p{L}/u.test(name);
}

export function hashIndex(s: string, buckets: number): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % buckets;
}

export function hashColor(s: string, palette: readonly string[]): string {
    return palette[hashIndex(s, palette.length)];
}

export function newId(prefix = ''): string {
    return prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
