import { useCallback, useEffect, useRef, useState } from 'react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useDeckActive } from '@/shell/deckActive';

import type { HoldemAction, HoldemHandEnd, HoldemStatePush } from './data';
import { actApi, leaveApi, sitApi, syncApi } from './holdemApi';
import { playCheckRap, playChipStack, playDealFlop, playFoldSlide, playPotPush } from '../sfx';
import { failText } from '@/core/api';

const SHOWDOWN_MS = 5200;

// Lua drops a nil field rather than encoding null, so an empty seat arrives with no `name` key at
// all. Every `name === null` test downstream would then read it as taken, showing a nameless pod
// with a 0 stack that cannot be sat in. Pin the nullable fields to real nulls at the boundary.
function normalizeState(data: HoldemStatePush): HoldemStatePush {
    return {
        ...data,
        actor: data.actor ?? null,
        legal: data.legal ?? null,
        handRank: data.handRank ?? null,
        seats: data.seats.map(s => ({ ...s, name: s.name ?? null, hole: s.hole ?? null })),
    };
}

export interface HoldemTableCtl {
    state:      HoldemStatePush | null;
    handEnd:    HoldemHandEnd | null;
    error:      string | null;
    busy:       boolean;
    clearError: () => void;
    fail:       (message: string) => void;
    sit:        (seat: number, buyIn: number) => Promise<boolean>;
    leave:      () => Promise<number | null>;
    act:        (action: HoldemAction, to?: number) => void;
}

export function useHoldemTable(tableId: string | null): HoldemTableCtl {
    const [state,   setState]   = useState<HoldemStatePush | null>(null);
    const [handEnd, setHandEnd] = useState<HoldemHandEnd | null>(null);
    const lastStreet = useRef<string | null>(null);
    const [error,   setError]   = useState<string | null>(null);
    const [busy,    setBusy]    = useState(false);

    const stateRef = useRef(state);
    stateRef.current = state;
    const acting = useRef(false);
    const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearEndTimer = useCallback(() => {
        if (endTimer.current === null) return;
        clearTimeout(endTimer.current);
        endTimer.current = null;
    }, []);

    useEffect(() => () => clearEndTimer(), [clearEndTimer]);

    useNuiEvent('sd-phone:holdem:state', data => {
        if (!data || (tableId && data.tableId !== tableId)) return;
        if (data.street !== lastStreet.current) {
            if (data.board.length > 0) playDealFlop();
            lastStreet.current = data.street;
        }
        setState(normalizeState(data));
    });

    useNuiEvent('sd-phone:holdem:hand', data => {
        if (!data || (tableId && data.tableId !== tableId)) return;
        setHandEnd(data);
        playPotPush();
        clearEndTimer();
        endTimer.current = setTimeout(() => { setHandEnd(null); endTimer.current = null; }, SHOWDOWN_MS);
    });

    const resync = useCallback(() => {
        if (!tableId) return;
        void syncApi(tableId).then(next => { if (next) setState(normalizeState(next)); });
    }, [tableId]);

    useEffect(() => {
        setState(null);
        setHandEnd(null);
        clearEndTimer();
        resync();
    }, [tableId, resync, clearEndTimer]);

    const deckActive = useDeckActive();
    const wasActive = useRef(deckActive);
    useEffect(() => {
        const rising = deckActive && !wasActive.current;
        wasActive.current = deckActive;
        if (rising) resync();
    }, [deckActive, resync]);

    const sit = useCallback(async (seat: number, buyIn: number) => {
        if (!tableId || busy) return false;
        setBusy(true);
        const res = await sitApi(tableId, seat, buyIn);
        setBusy(false);
        if (!res.ok) { setError(failText(res, null)); return false; }
        if (res.data) setState(normalizeState(res.data));
        return true;
    }, [tableId, busy]);

    const leave = useCallback(async () => {
        setBusy(true);
        const res = await leaveApi();
        setBusy(false);
        clearEndTimer();
        setHandEnd(null);
        setState(null);
        if (!res.ok) { setError(failText(res, null)); return null; }
        return res.data ? res.data.chips : null;
    }, [clearEndTimer]);

    const act = useCallback((action: HoldemAction, to = 0) => {
        if (action === 'fold') playFoldSlide();
        else if (action === 'check') playCheckRap();
        else playChipStack();
        const live = stateRef.current;
        if (!live || !live.legal || acting.current) return;
        acting.current = true;
        void actApi(live.tableId, live.handId, action, to).then(res => {
            acting.current = false;
            if (!res.ok && res.message) setError(res.message);
        });
    }, []);

    const clearError = useCallback(() => setError(null), []);
    const fail = useCallback((message: string) => setError(message), []);

    return { state, handEnd, error, busy, clearError, fail, sit, leave, act };
}
