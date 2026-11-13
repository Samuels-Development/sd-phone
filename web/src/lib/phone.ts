import { digits } from './format';

let FORMATS: Record<number, string> = { 10: '(XXX) XXX-XXXX' };

let LENGTH = 10;

interface CustomNumberRange { min: number; max: number }

let CUSTOM: CustomNumberRange | null = null;

export function setNumberFormat(formats?: Record<number, string>, length?: number, custom?: CustomNumberRange | null): void {
    if (formats && Object.keys(formats).length > 0) FORMATS = formats;
    if (length && length > 0) LENGTH = length;
    CUSTOM = custom && custom.min >= 2 && custom.max <= 15 && custom.min <= custom.max ? { ...custom } : null;
}

export function acceptedNumberLengths(): number[] {
    const lengths = new Set<number>([LENGTH]);
    for (const key of Object.keys(FORMATS)) {
        const n = Number(key);
        if (Number.isFinite(n) && n > 0) lengths.add(n);
    }
    if (CUSTOM) for (let n = CUSTOM.min; n <= CUSTOM.max; n++) lengths.add(n);
    return [...lengths].sort((a, b) => a - b);
}

export function numberLengthsText(): string {
    const parts: string[] = [];
    if (CUSTOM) parts.push(CUSTOM.min === CUSTOM.max ? `${CUSTOM.min}` : `${CUSTOM.min} to ${CUSTOM.max}`);
    for (const n of acceptedNumberLengths()) {
        if (!CUSTOM || n < CUSTOM.min || n > CUSTOM.max) parts.push(`${n}`);
    }
    return parts.join(' or ');
}

export function minTypedNumberLength(): number {
    return Math.min(3, acceptedNumberLengths()[0]);
}

export function isServiceShortCode(value: string): boolean {
    const d = digits(value);
    return d.length > 0 && d.length < 7 && !acceptedNumberLengths().includes(d.length);
}

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

export function formatPhone(value: string): string {
    const d = digits(value);
    const pattern = FORMATS[d.length];
    if (!pattern) return value;
    return applyPattern(pattern, d);
}

export function formatPhonePartial(value: string): string {
    const d = digits(value);
    if (d.length === 0) return '';

    const pattern = FORMATS[LENGTH] ?? FORMATS[Math.max(...Object.keys(FORMATS).map(Number))];
    if (!pattern) return d;
    return applyPattern(pattern, d);
}
