import { create } from 'zustand';

import { subscribeNui } from '@/hooks/useNuiEvent';
import { fetchNui, isFiveM } from '@/core/nui';


type Phase = 'incoming' | 'outgoing' | 'active';

export interface CallParty { name?: string; number: string }

interface CallInfo { channel: number; name?: string; number: string; video?: boolean }
interface CurrentCall { channel: number; phase: Phase; name?: string; number: string; elapsed: number; video?: boolean; others?: CallParty[]; pending?: CallParty | null }
interface Roster { channel?: number; others?: CallParty[]; pending?: CallParty | null }

interface CallState {
    phase:     Phase | null;
    channel:   number | null;
    name:      string;
    number:    string;
    startedAt: number | null;
    video:     boolean;
    others:    CallParty[];
    pending:   CallParty | null;
    minimised: boolean;
    incoming:  (d: CallInfo) => void;
    outgoing:  (d: CallInfo) => void;
    connected: (d: { channel: number }) => void;
    roster:    (d: Roster) => void;
    ended:     () => void;
    setMinimised: (v: boolean) => void;
    hydrate:   (cur: CurrentCall) => void;
    reconcile: (cur: CurrentCall | null) => void;
}

const RESET: Pick<CallState, 'phase' | 'channel' | 'name' | 'number' | 'startedAt' | 'video' | 'others' | 'pending' | 'minimised'> = {
    phase: null, channel: null, name: '', number: '', startedAt: null, video: false, others: [], pending: null, minimised: false,
};

export const useCallStore = create<CallState>((set, get) => ({
    ...RESET,
    incoming:  (d) => set({ ...RESET, phase: 'incoming', channel: d.channel, name: d.name ?? '', number: d.number, video: d.video === true }),
    outgoing:  (d) => set({ ...RESET, phase: 'outgoing', channel: d.channel, name: d.name ?? '', number: d.number, video: d.video === true }),
    connected: (d) => { if (get().channel === d.channel) set({ phase: 'active', startedAt: Date.now() }); },
    roster:    (d) => set({ others: d.others ?? [], pending: d.pending ?? null }),
    setMinimised: (v) => { set({ minimised: v }); if (isFiveM) void fetchNui('sd-phone:call:minimised', { on: v }); },
    ended:     () => set({ ...RESET }),
    hydrate:   (cur) => set({
        phase:     cur.phase,
        channel:   cur.channel,
        name:      cur.name ?? '',
        number:    cur.number,
        startedAt: cur.phase === 'active' ? Date.now() - cur.elapsed * 1000 : null,
        video:     cur.video === true,
        others:    cur.others ?? [],
        pending:   cur.pending ?? null,
    }),
    reconcile: (cur) => (cur ? get().hydrate(cur) : get().ended()),
}));

subscribeNui('sd-phone:call:incoming',  d => useCallStore.getState().incoming(d));
subscribeNui('sd-phone:call:outgoing',  d => useCallStore.getState().outgoing(d));
subscribeNui('sd-phone:call:connected', d => useCallStore.getState().connected(d));
subscribeNui('sd-phone:call:ended',     () => useCallStore.getState().ended());
subscribeNui('sd-phone:call:roster',    d => useCallStore.getState().roster(d ?? {}));
