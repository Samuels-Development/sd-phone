import { fetchNui } from './nui';
import { pluralSuffix, t } from '@/i18n';

export interface Envelope<T = void> {
    success:      boolean;
    message?:     string;
    messageKey?:  string;
    messageVars?: Record<string, string | number>;
    data?:        T;
}

export function failText<T extends string | null | undefined>(
    res: Pick<Envelope, 'message' | 'messageKey' | 'messageVars'>,
    fallback: T,
): string | T {
    if (res.messageKey && res.message !== undefined) {
        const vars = res.messageKey === 'mail.nameMustLeastCharacters' && res.messageVars
            ? { ...res.messageVars, s: pluralSuffix(Number(res.messageVars.n)) }
            : res.messageVars;
        return t(res.messageKey, res.message, vars);
    }
    return res.message ?? fallback;
}

export async function apiCall<T>(event: string, payload?: unknown): Promise<Envelope<T>> {
    const res = await fetchNui<Envelope<T>>(event, payload);
    return res && typeof res.success === 'boolean' ? res : { success: false };
}

export async function apiData<T>(event: string, payload?: unknown): Promise<T | null> {
    const res = await fetchNui<Envelope<T>>(event, payload);
    return res && res.success ? (res.data ?? null) : null;
}
