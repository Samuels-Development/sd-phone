import { fetchNui, isFiveM } from '@/core/nui';
import { apiCall, apiData } from '@/core/api';

export interface DialResult {
    success:  boolean;
    message?: string;
    channel?: number;
}

export interface CallParty {
    name?:  string;
    number: string;
}

export interface CurrentCall {
    channel:  number;
    phase:    'incoming' | 'outgoing' | 'active';
    number:   string;
    name?:    string;
    elapsed:  number;
    video?:   boolean;
    others?:  CallParty[];
    pending?: CallParty | null;
}

let devChannel = 5000;
let devTimers: number[] = [];

function clearDevTimers(): void {
    for (const t of devTimers) window.clearTimeout(t);
    devTimers = [];
}

function devPost(action: string, data: unknown): void {
    window.postMessage({ action, data }, '*');
}

export async function dialCall(number: string, name?: string, video = false): Promise<DialResult> {
    if (!isFiveM) {
        const channel = ++devChannel;
        clearDevTimers();
        devPost('sd-phone:call:outgoing', { channel, number, name, video });
        devTimers.push(window.setTimeout(() => devPost('sd-phone:call:connected', { channel }), 2400));
        return { success: true, channel };
    }
    const res = await apiCall<{ channel: number }>('sd-phone:call:dial', { number, video });
    return { success: res.success, message: res.message, channel: res.data?.channel };
}

export async function acceptCall(channel: number): Promise<void> {
    if (!isFiveM) { devPost('sd-phone:call:connected', { channel }); return; }
    await fetchNui('sd-phone:call:accept', { channel });
}

export async function declineCall(channel: number): Promise<void> {
    if (!isFiveM) { clearDevTimers(); devPost('sd-phone:call:ended', { channel, reason: 'declined' }); return; }
    await fetchNui('sd-phone:call:decline', { channel });
}

export async function hangupCall(channel: number): Promise<void> {
    if (!isFiveM) { clearDevTimers(); devPost('sd-phone:call:ended', { channel, reason: 'hangup' }); return; }
    await fetchNui('sd-phone:call:hangup', { channel });
}

export async function addToCall(number: string): Promise<DialResult> {
    if (!isFiveM) {
        devPost('sd-phone:call:roster', { others: [{ number }], pending: null });
        return { success: true };
    }
    const res = await apiCall<{ channel: number }>('sd-phone:call:add', { number });
    return { success: res.success, message: res.message, channel: res.data?.channel };
}

export async function getCurrentCall(): Promise<CurrentCall | null> {
    if (!isFiveM) return null;
    return await apiData<CurrentCall | null>('sd-phone:call:current');
}
