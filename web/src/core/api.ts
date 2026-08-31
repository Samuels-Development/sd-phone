import { fetchNui } from './nui';
import { t } from '@/i18n';

export interface Envelope<T = void> {
    success:      boolean;
    message?:     string;
    messageKey?:  string;
    messageVars?: Record<string, string | number>;
    data?:        T;
}

// The server refuses in English and sends the catalogue key alongside it, because it has no
// per-player language. Resolve the key against the player's own catalogue, falling back to the
// server's English, then to the caller's own text when the action returned no message at all.
export function failText<T extends string | null | undefined>(
    res: Pick<Envelope, 'message' | 'messageKey' | 'messageVars'>,
    fallback: T,
): string | T {
    if (res.messageKey && res.message !== undefined) return t(res.messageKey, res.message, res.messageVars);
    return res.message ?? fallback;
}

export async function apiCall<T>(event: string, payload?: unknown): Promise<Envelope<T>> {
    const res = await fetchNui<Envelope<T>>(event, payload);
    return res && typeof res.success === 'boolean' ? res : { success: false };
}

// Unwrap straight to the payload; null on failure. Use when the caller doesn't
// need the failure message.
export async function apiData<T>(event: string, payload?: unknown): Promise<T | null> {
    const res = await fetchNui<Envelope<T>>(event, payload);
    return res && res.success ? (res.data ?? null) : null;
}
