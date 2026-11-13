import { hostResource, isFiveM } from '@/core/nui';
import { device } from '@device';
function flatten(obj: Record<string, unknown>, prefix: string, out: Record<string, string>): Record<string, string> {
    for (const k in obj) {
        const v = obj[k];
        const nk = prefix ? prefix + '.' + k : k;
        if (v !== null && typeof v === 'object') flatten(v as Record<string, unknown>, nk, out);
        else out[nk] = String(v);
    }
    return out;
}

const catalogs: Record<string, Record<string, string>> = {
    en: {},
};

const catalogFiles = import.meta.glob<{ default: Record<string, unknown> }>(
    ['../../../locales/*.json', '!../../../locales/en.json']);

const loaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {};
for (const path in catalogFiles) {
    const code = path.slice(path.lastIndexOf('/') + 1).replace('.json', '');
    if (code === 'en') continue;
    loaders[code] = catalogFiles[path];
}

export interface LocaleOption { code: string; name: string }

function nativeName(code: string): string {
    try {
        const raw = new Intl.DisplayNames([code], { type: 'language' }).of(code);
        if (raw && raw !== code) return raw.charAt(0).toUpperCase() + raw.slice(1);
    } catch {}
    return code.toUpperCase();
}

export const SUPPORTED_LOCALES: LocaleOption[] = [
    { code: 'en', name: 'English' },
    ...Object.keys(loaders).sort().map(code => ({ code, name: nativeName(code) })),
];


const runtimeCodes = new Set<string>();

export function registerRuntimeLocales(codes: unknown): void {
    if (!Array.isArray(codes)) return;

    let added = false;
    for (const raw of codes) {
        const code = String(raw);
        if (code === 'en' || loaders[code] || runtimeCodes.has(code) || !/^[a-z]{2}(-[a-z]{2})?$/i.test(code)) continue;
        runtimeCodes.add(code);
        SUPPORTED_LOCALES.push({ code, name: nativeName(code) });
        added = true;
    }

    if (added) {
        SUPPORTED_LOCALES.sort((a, b) =>
            a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.code.localeCompare(b.code));
    }
}

async function fetchCatalog(code: string): Promise<Record<string, unknown> | null> {
    if (!isFiveM) return null;
    try {
        const res = await fetch(`https://cfx-nui-${hostResource}/locales/${code}.json`);
        if (!res.ok) return null;
        return await res.json() as Record<string, unknown>;
    } catch {
        return null;
    }
}
let active = catalogs.en;
let currentCode = 'en';
let catalogVersion = 0;

function applyDocumentLocale(code: string): void {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = code;
}

function bundledCatalog(code: string): Promise<Record<string, unknown> | null> {
    const loader = loaders[code];
    if (!loader) return Promise.resolve(null);
    return loader().then(m => m.default as Record<string, unknown>).catch(() => null);
}

function isKnownLocale(code: string): boolean {
    return Boolean(catalogs[code] || loaders[code] || runtimeCodes.has(code));
}

export function setLocale(requested: string): Promise<void> {
    const base = requested.split(/[-_]/)[0].toLowerCase();
    const lang = !isKnownLocale(requested) && isKnownLocale(base) ? base : requested;
    const known = isKnownLocale(lang);
    const code = known ? lang : 'en';
    currentCode = code;
    applyDocumentLocale(code);
    if (catalogs[code]) {
        active = catalogs[code];
        catalogVersion += 1;
        return Promise.resolve();
    }

    const load = device.rpcAction
        ? bundledCatalog(code).then(data => data ?? fetchCatalog(code))
        : isFiveM
            ? fetchCatalog(code).then(data => data ?? bundledCatalog(code))
            : bundledCatalog(code).then(data => data ?? fetchCatalog(code));

    return load
        .then(data => {
            if (!data) throw new Error('no catalog for ' + code);
            catalogs[code] = flatten(data, '', {});
            if (currentCode === code) { active = catalogs[code]; catalogVersion += 1; }
        })
        .catch(() => {
            if (currentCode === code) { currentCode = 'en'; active = catalogs.en; catalogVersion += 1; }
        });
}

export function getLocale(): string {
    return currentCode;
}

export function getCatalogVersion(): number {
    return catalogVersion;
}

const LOCALE_TAGS: Record<string, string> = {
    en: 'en-US', pt: 'pt-PT', no: 'nb-NO', zh: 'zh-CN',
};

export function getLocaleTag(): string {
    return LOCALE_TAGS[currentCode] ?? currentCode ?? 'en-US';
}

const RTL_CODES = new Set(['ar', 'fa', 'he', 'ur']);

function isolated(value: string): string {
    return RTL_CODES.has(currentCode.split('-')[0])
        ? `⁨${value}⁩`
        : value;
}

export function t(key: string, fallback: string, vars?: Record<string, string | number>): string {
    let s = active[key] ?? fallback;
    if (vars) {
        for (const k in vars) s = s.split('{' + k + '}').join(isolated(String(vars[k])));
    }
    return s;
}

export function pluralSuffix(count: number): string {
    return count === 1 ? '' : t('common.pluralSuffix', 's');
}

let appLabelSource: () => Record<string, string> = () => ({});

export function setAppLabelSource(source: () => Record<string, string>): void {
    appLabelSource = source;
}

export function appLabel(app: { id: string; label: string }): string {
    const custom = appLabelSource()[app.id];
    if (custom) return custom;
    return t('apps.' + app.id, app.label);
}
