import { newCustomIconThemeId, sanitizeCustomIconTheme } from '@/stores/iconThemeStore';
import type { CustomIconTheme } from '@/stores/iconThemeStore';

const PREFIX = 'SDTHEME1:';
const MAX_CODE = 8192;

function toBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

function fromBase64(token: string): string {
    const padded = token.length % 4 === 0 ? token : token + '='.repeat(4 - (token.length % 4));
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
}

export function encodeThemeCode(theme: CustomIconTheme): string {
    const clean = sanitizeCustomIconTheme(theme);
    if (!clean) return '';
    const { id, ...shared } = clean;
    try {
        return PREFIX + toBase64(JSON.stringify(shared));
    } catch {
        return '';
    }
}

export function decodeThemeCode(code: unknown): CustomIconTheme | null {
    if (typeof code !== 'string' || code.length > MAX_CODE) return null;
    const at = code.indexOf(PREFIX);
    if (at < 0) return null;
    const word = code.slice(at + PREFIX.length).trim().split(/\s/)[0];
    const token = word.replace(/-/g, '+').replace(/_/g, '/');
    if (token === '') return null;
    try {
        const parsed: unknown = JSON.parse(fromBase64(token));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return sanitizeCustomIconTheme({ ...parsed, id: newCustomIconThemeId() });
    } catch {
        return null;
    }
}
