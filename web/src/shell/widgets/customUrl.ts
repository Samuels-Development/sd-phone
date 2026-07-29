export function resolveCustomUi(ui: string | null | undefined): string {
    if (!ui) return '';
    if (ui.startsWith('nui://')) return `https://cfx-nui-${ui.slice(6)}`;
    if (ui.includes('http')) return ui;
    return `https://cfx-nui-${ui.replace(/^\//, '')}`;
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
