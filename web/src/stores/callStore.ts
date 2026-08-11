import { create } from 'zustand';


type Phase = 'incoming' | 'outgoing' | 'active';

export interface CallParty { name?: string; number: string }

interface CallInfo { channel: number; name?: string; number: string }
interface CurrentCall { channel: number; phase: Phase; name?: string; number: string; elapsed: number; others?: CallParty[]; pending?: CallParty | null }
interface Roster { channel?: number; others?: CallParty[]; pending?: CallParty | null }

interface CallState {
    phase:     Phase | null;
    channel:   number | null;
    name:      string;
    number:    string;
    startedAt: number | null;
    others:    CallParty[];
    pending:   CallParty | null;
    incoming:  (d: CallInfo) => void;
    outgoing:  (d: CallInfo) => void;
    connected: (d: { channel: number }) => void;
    roster:    (d: Roster) => void;
    ended:     () => void;
    hydrate:   (cur: CurrentCall) => void;
}

const RESET: Pick<CallState, 'phase' | 'channel' | 'name' | 'number' | 'startedAt' | 'others' | 'pending'> = {
    phase: null, channel: null, name: '', number: '', startedAt: null, others: [], pending: null,
};

export const useCallStore = create<CallState>((set, get) => ({
    ...RESET,
    incoming:  (d) => set({ ...RESET, phase: 'incoming', channel: d.channel, name: d.name ?? '', number: d.number }),
    outgoing:  (d) => set({ ...RESET, phase: 'outgoing', channel: d.channel, name: d.name ?? '', number: d.number }),
    connected: (d) => { if (get().channel === d.channel) set({ phase: 'active', startedAt: Date.now() }); },
    roster:    (d) => set({ others: d.others ?? [], pending: d.pending ?? null }),
    ended:     () => set({ ...RESET }),
    hydrate:   (cur) => set({
        phase:     cur.phase,
        channel:   cur.channel,
        name:      cur.name ?? '',
        number:    cur.number,
        startedAt: cur.phase === 'active' ? Date.now() - cur.elapsed * 1000 : null,
        others:    cur.others ?? [],
        pending:   cur.pending ?? null,
    }),
}));
