// The catalogs are the resource-root locales/<lang>.json files (shared with the
// Lua side), stored as nested tables. Flatten each once into dot-path keys so
// t('ns.key') resolves — mirrors the flatten in bridge/shared/locale.lua.
function flatten(obj: Record<string, unknown>, prefix: string, out: Record<string, string>): Record<string, string> {
    for (const k in obj) {
        const v = obj[k];
        const nk = prefix ? prefix + '.' + k : k;
        if (v !== null && typeof v === 'object') flatten(v as Record<string, unknown>, nk, out);
        else out[nk] = String(v);
    }
    return out;
}

// NO catalog ships in the boot bundle. English is served entirely by the
// inline t() fallbacks (locales/en.json is GENERATED from them, so bundling
// it would spend ~110 KB returning identical strings — the file stays on disk
// for the Lua side and as the translators' source). Non-English catalogs are
// ~120 KB of JSON each and load on demand as their own chunks; every t() call
// carries an English fallback, so the UI renders English for the moment a
// catalog is in flight, then re-renders via the locale store.
const catalogs: Record<string, Record<string, string>> = {
    en: {},
};

// Every resource-root catalog, discovered at build time and code-split into its own lazy
// chunk. Dropping a new locales/<code>.json in is all it takes: the loader and both language
// pickers derive from the files (a UI rebuild is still required, as the catalogs are bundled).
const catalogFiles = import.meta.glob<{ default: Record<string, unknown> }>(
    ['../../../locales/*.json', '!**/en.json']);

const loaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {};
for (const path in catalogFiles) {
    const code = path.slice(path.lastIndexOf('/') + 1).replace('.json', '');
    loaders[code] = catalogFiles[path];
}

export interface LocaleOption { code: string; name: string }

// A language's name for itself from the browser's own Intl data, e.g. 'fr' -> 'Français'.
function nativeName(code: string): string {
    try {
        const raw = new Intl.DisplayNames([code], { type: 'language' }).of(code);
        if (raw && raw !== code) return raw.charAt(0).toUpperCase() + raw.slice(1);
    } catch { /* unrecognized code: fall through */ }
    return code.toUpperCase();
}

// Player-facing language options, derived from the discovered catalogs: English (served by the
// inline fallbacks) first, then every locales/*.json alphabetically. Drives the pickers in
// Setup and Settings > General > Language & Region.
export const SUPPORTED_LOCALES: LocaleOption[] = [
    { code: 'en', name: 'English' },
    ...Object.keys(loaders).sort().map(code => ({ code, name: nativeName(code) })),
];

let active = catalogs.en;
let currentCode = 'en';

/** Select the active language (from config.Locale, or a player's saved pick).
 *  Falls back to English for an unknown code. Resolves once the catalog is
 *  applied; a newer setLocale call wins over a slower in-flight one. */
export function setLocale(lang: string): Promise<void> {
    const code = catalogs[lang] || loaders[lang] ? lang : 'en';
    currentCode = code;
    if (catalogs[code]) {
        active = catalogs[code];
        return Promise.resolve();
    }
    return loaders[code]()
        .then(m => {
            catalogs[code] = flatten(m.default as Record<string, unknown>, '', {});
            if (currentCode === code) active = catalogs[code];
        })
        .catch(() => {
            if (currentCode === code) { currentCode = 'en'; active = catalogs.en; }
        });
}

export function getLocale(): string {
    return currentCode;
}

const LOCALE_TAGS: Record<string, string> = {
    en: 'en-US', fr: 'fr-FR', es: 'es-ES', de: 'de-DE', it: 'it-IT',
    pt: 'pt-PT', nl: 'nl-NL', pl: 'pl-PL', da: 'da-DK', no: 'nb-NO',
};

/** BCP-47 tag for the active locale, for Intl/toLocaleDateString calls. */
export function getLocaleTag(): string {
    return LOCALE_TAGS[currentCode] ?? 'en-US';
}

export function t(key: string, fallback: string, vars?: Record<string, string | number>): string {
    let s = active[key] ?? fallback;
    if (vars) {
        for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
    }
    return s;
}
