import { isFiveM } from '@/core/nui';
import { apiCall, apiData } from '@/core/api';

export interface CallRecording {
    id:         string;
    label?:     string | null;
    peerNumber: string;
    peerName?:  string | null;
    direction:  'incoming' | 'outgoing';
    oneSided:   boolean;
    url:        string;
    duration:   number;
    date:       string;
}

const devRecordings: CallRecording[] = [
    {
        id: 'dev-1', peerNumber: '2135550118', peerName: 'Marcus Delgado', direction: 'outgoing',
        oneSided: false, url: 'https://download.samplelib.com/mp3/sample-9s.mp3', duration: 47,
        date: new Date(Date.now() - 3600_000).toISOString(),
    },
    {
        id: 'dev-2', peerNumber: '3105550391', peerName: null, direction: 'incoming',
        oneSided: true, url: 'https://download.samplelib.com/mp3/sample-9s.mp3', duration: 12,
        date: new Date(Date.now() - 86_400_000).toISOString(),
    },
];

export async function recordingEnabled(): Promise<boolean> {
    if (!isFiveM) return true;
    return (await apiData<{ enabled: boolean }>('sd-phone:callrec:enabled'))?.enabled === true;
}

export async function fetchRecordings(): Promise<CallRecording[]> {
    if (!isFiveM) return [...devRecordings];
    return (await apiData<{ recordings: CallRecording[] }>('sd-phone:callrec:list'))?.recordings ?? [];
}

export async function deleteRecording(id: string): Promise<boolean> {
    if (!isFiveM) {
        const at = devRecordings.findIndex(r => r.id === id);
        if (at >= 0) devRecordings.splice(at, 1);
        return true;
    }
    return (await apiCall<unknown>('sd-phone:callrec:delete', { id })).success;
}

export async function renameRecording(id: string, name: string): Promise<boolean> {
    if (!isFiveM) {
        const rec = devRecordings.find(r => r.id === id);
        if (rec) rec.label = name.trim() || null;
        return true;
    }
    return (await apiCall<unknown>('sd-phone:callrec:rename', { id, name })).success;
}
