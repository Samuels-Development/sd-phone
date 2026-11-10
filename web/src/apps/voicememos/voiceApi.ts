import { fetchNui, isFiveM } from '@/core/nui';
import { uploadDirect, uploadViaServer } from '@/shared/mediaUpload';
import { getLocaleTag, t } from '@/i18n';
import { apiCall, apiData } from '@/core/api';
import { formatClockTime } from '@/lib/time';

export interface VoiceMemo {
    id:       string;
    name:     string;
    url:      string;
    duration: number;
    date:     string;
}

const devMemos: VoiceMemo[] = [];

export async function fetchMemos(): Promise<VoiceMemo[]> {
    if (!isFiveM) return [...devMemos];
    return (await apiData<{ memos: VoiceMemo[] }>('sd-phone:voice:list'))?.memos ?? [];
}

export function uploadMemo(audioBase64: string, name: string, duration: number, blob?: Blob): VoiceMemo | null {
    if (!isFiveM) {
        const memo: VoiceMemo = {
            id:       'dev-' + Date.now(),
            name,
            url:      blob ? URL.createObjectURL(blob) : audioBase64,
            duration,
            date:     new Date().toISOString(),
        };
        devMemos.unshift(memo);
        return memo;
    }
    void sendMemo(audioBase64, name, duration, blob);
    return null;
}

async function sendMemo(audioBase64: string, name: string, duration: number, blob?: Blob): Promise<void> {
    if (blob) {
        const hosted = await uploadDirect(blob, `sdphone-voice-${Date.now()}.webm`, {
            slot: 'sd-phone:voice:uploadSlot',
            done: 'sd-phone:voice:uploadDone',
        }, { name, duration });
        if (hosted) return;
    }

    if (await uploadViaServer(audioBase64, 'sd-phone:voice:httpSlot', { name, duration })) return;

    void fetchNui('sd-phone:voice:upload', { audio: audioBase64, name, duration });
}

export function renameMemo(id: string, name: string): void {
    if (!isFiveM) {
        const m = devMemos.find(x => x.id === id);
        if (m) m.name = name;
        return;
    }
    void fetchNui('sd-phone:voice:rename', { id, name });
}

export async function shareMemo(id: string, target: number): Promise<boolean> {
    if (!isFiveM) return true;
    const r = await apiCall<unknown>('sd-phone:voice:share', { id, target });
    return r.success;
}

export function deleteMemo(id: string): void {
    if (!isFiveM) {
        const i = devMemos.findIndex(x => x.id === id);
        if (i >= 0) devMemos.splice(i, 1);
        return;
    }
    void fetchNui('sd-phone:voice:delete', { id });
}

export function fmtDuration(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

export function fmtMemoDate(iso: string): string {
    const d     = new Date(iso);
    const time  = formatClockTime(d, true);
    const dayK  = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
    const today = new Date();
    if (dayK(d) === dayK(today)) return t('voicememos.today', 'Today {time}', { time });
    if (dayK(d) === dayK(new Date(today.getTime() - 86_400_000))) return t('voicememos.yesterday', 'Yesterday {time}', { time });
    return `${d.toLocaleDateString(getLocaleTag(), { day: 'numeric', month: 'short', year: 'numeric' })} ${time}`;
}
