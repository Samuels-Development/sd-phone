function webUrl(candidate: string): string {
    try {
        const url = new URL(candidate);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
        return '';
    }
}

export function resolveCustomUi(ui: string | null | undefined): string {
    const raw = typeof ui === 'string' ? ui.trim() : '';
    if (!raw) return '';
    if (raw.startsWith('nui://')) return webUrl(`https://cfx-nui-${raw.slice(6)}`);
    if (/^https?:\/\//i.test(raw)) return webUrl(raw);
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return '';
    return webUrl(`https://cfx-nui-${raw.replace(/^\/+/, '')}`);
}

export function withQuery(url: string, params: Record<string, string | number>): string {
    if (!url) return '';
    const query = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
    if (!query) return url;
    const hash = url.indexOf('#');
    const base = hash === -1 ? url : url.slice(0, hash);
    const frag = hash === -1 ? '' : url.slice(hash);
    return `${base}${base.includes('?') ? '&' : '?'}${query}${frag}`;
}
