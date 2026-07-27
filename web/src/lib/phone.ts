import { digits } from './format';

/**
 * Display patterns keyed by digit count, mirroring config.Phone.Number.Formats. Seeded with the
 * stock US shape so dev mode and the frames before the open payload lands still read correctly.
 */
let FORMATS: Record<number, string> = { 10: '(XXX) XXX-XXXX' };

/** Digit count a newly generated number has, mirroring config.Phone.Number.Length. */
let LENGTH = 10;

/** Applied from the `sd-phone:open` payload so the UI matches the server's configuration. */
export function setNumberFormat(formats?: Record<number, string>, length?: number): void {
    if (formats && Object.keys(formats).length > 0) FORMATS = formats;
    if (length && length > 0) LENGTH = length;
}

/**
 * Digit counts this server treats as a real number: the length it generates, plus every length
 * with a display format, so numbers minted before a `Length` change stay editable. Ascending.
 */
export function acceptedNumberLengths(): number[] {
    const lengths = new Set<number>([LENGTH]);
    for (const key of Object.keys(FORMATS)) {
        const n = Number(key);
        if (Number.isFinite(n) && n > 0) lengths.add(n);
    }
    return [...lengths].sort((a, b) => a - b);
}

/** Fills `pattern`'s X placeholders from `d`, printing every other character literally. */
function applyPattern(pattern: string, d: string): string {
    let out = '';
    let i = 0;
    for (const c of pattern) {
        if (c === 'X') {
            if (i >= d.length) return out;
            out += d[i++];
        } else {
            out += c;
        }
    }
    return i < d.length ? `${out}${d.slice(i)}` : out;
}

/**
 * A complete number, formatted for display. A digit count with no configured pattern passes
 * through untouched rather than being forced into the wrong shape, which is what keeps numbers
 * issued under an older `Length` readable after the config changes.
 */
export function formatPhone(value: string): string {
    const d = digits(value);
    const pattern = FORMATS[d.length];
    if (!pattern) return value;
    return applyPattern(pattern, d);
}

/**
 * A number being typed. Formats against the pattern for the configured generated length, so the
 * shape a player is entering is the shape this server issues, and falls back to the longest
 * configured pattern when that length has none.
 */
export function formatPhonePartial(value: string): string {
    const d = digits(value);
    if (d.length === 0) return '';

    const pattern = FORMATS[LENGTH] ?? FORMATS[Math.max(...Object.keys(FORMATS).map(Number))];
    if (!pattern) return d;
    return applyPattern(pattern, d);
}
