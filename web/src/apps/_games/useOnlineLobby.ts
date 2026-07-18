import { useCallback, useEffect, useRef, useState } from 'react';

import { useDeckActive } from '@/shell/deckActive';
import { t } from '@/i18n';
import {
    checkPendingApi, createLobbyApi, declineInviteApi, inviteLobbyApi, joinLobbyApi,
    kickMemberApi, leaveLobbyApi, lobbiesApi, resignApi, returnToLobbyApi,
    setReadyApi, setWagerApi, startLobbyApi,
    type LobbyListItem, type LobbyState, type PendingInvite, type Side,
} from './onlineApi';
import { recordResultApi, type GameStats } from './statsApi';

interface OnlineGameInfo { gameId: string; opponent: string; pot: number }
interface OnlineStartData { gameId: string; color: string; opponent: string; pot: number }

export interface UseOnlineLobbyOptions {
    /** A match began: reset local game state, read d.color, and show the game screen. */
    onStart: (d: OnlineStartData) => void;
    /** An opponent move arrived (the `move` payload of the `<game>:move` event). */
    onMove?: (move: unknown) => void;
    /** Both sides finished setup: the match is live and `turn` says who moves first. */
    onBegin?: (d: { turn: string; you: string }) => void;
    /** The opponent finished their setup; we may still be placing. */
    onOppReady?: () => void;
    /** The opponent resigned or left mid-match. */
    onEnded: (reason: string) => void;
    /** Return-to-lobby succeeded: clear match state and show the lobby screen. */
    onReset?: () => void;
    /** Navigate back to the game's home screen (hook state is already cleared). */
    onHome: () => void;
    /** Fresh stats after the hook records a forfeit loss. */
    onStats?: (stats: GameStats) => void;
    /** True while the Play Online screen (hub or room) is visible; gates the poll and kick timer. */
    inLobbyScreen: boolean;
    /** True once the current match has finished; suppresses forfeit on leave/unmount. */
    matchOver: boolean;
}

export interface OnlineLobby {
    lobby: LobbyState | null;
    lobbies: LobbyListItem[];
    incoming: PendingInvite | null;
    hubError: string | null;
    inviteError: string | null;
    lobbyGone: boolean;
    onlineGame: OnlineGameInfo | null;
    create: (isPublic: boolean, side: Side, wager: number) => void;
    join: (id: string) => void;
    accept: () => void;
    decline: () => void;
    invite: (target: string) => void;
    start: () => void;
    leave: () => void;
    kick: () => void;
    setWager: (wager: number) => void;
    ready: (ready: boolean) => void;
    refresh: () => void;
    returnToLobby: () => void;
    goHome: () => void;
}

// useNuiEvent types its action against the NuiMessage union; lobby event names are
// built from the game id at runtime, so subscribe with an equivalent raw listener.
function useGameEvent<T>(action: string, handler: (data: T) => void): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    useEffect(() => {
        function listener(event: MessageEvent) {
            const msg = event.data as { action?: string; data?: unknown } | undefined;
            if (!msg || msg.action !== action) return;
            handlerRef.current(msg.data as T);
        }
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, [action]);
}

export function useOnlineLobby(game: string, options: UseOnlineLobbyOptions): OnlineLobby {
    // While this game is backgrounded, quiet the hub list poll and the kick timer.
    // A LIVE match stays mounted and keeps its :move/:ended listeners, so the frozen
    // card always shows the true current board; only the browsing-the-hub refresh and
    // the missing-member countdown pause, and both re-arm instantly on foreground.
    const active = useDeckActive();
    const [lobby,       setLobby]       = useState<LobbyState | null>(null);
    const [lobbies,     setLobbies]     = useState<LobbyListItem[]>([]);
    const [incoming,    setIncoming]    = useState<PendingInvite | null>(null);
    const [hubError,    setHubError]    = useState<string | null>(null);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [lobbyGone,   setLobbyGone]   = useState(false);
    const [onlineGame,  setOnlineGame]  = useState<OnlineGameInfo | null>(null);

    const opts = useRef(options);
    opts.current = options;
    const lobbyRef    = useRef(lobby);      lobbyRef.current = lobby;
    const onlineRef   = useRef(onlineGame); onlineRef.current = onlineGame;
    const incomingRef = useRef(incoming);   incomingRef.current = incoming;
    const inProgressRef = useRef(false);
    inProgressRef.current = !!onlineGame && !options.matchOver;

    useGameEvent<OnlineStartData>(`${game}:start`, d => {
        setOnlineGame({ gameId: d.gameId, opponent: d.opponent, pot: d.pot || 0 });
        setLobby(null); setInviteError(null); setIncoming(null); setLobbyGone(false);
        opts.current.onStart(d);
    });
    useGameEvent<{ move?: unknown }>(`${game}:move`, d => {
        if (d?.move != null) opts.current.onMove?.(d.move);
    });
    useGameEvent<{ turn?: string; you?: string }>(`${game}:begin`, d => {
        if (d?.turn && d?.you) opts.current.onBegin?.({ turn: d.turn, you: d.you });
    });
    useGameEvent<unknown>(`${game}:oppReady`, () => { opts.current.onOppReady?.(); });
    useGameEvent<{ reason?: string }>(`${game}:ended`, d => {
        opts.current.onEnded(d?.reason || 'left');
    });
    useGameEvent<{ fromName: string; lobbyId: string }>(`${game}:invited`, d => {
        setIncoming({ fromName: d.fromName, lobbyId: d.lobbyId });
    });
    useGameEvent<LobbyState>(`${game}:lobby`, d => { setLobby(d); });
    useGameEvent<unknown>(`${game}:lobbyClosed`, () => { setLobby(null); setLobbyGone(true); });

    useEffect(() => { void checkPendingApi(game).then(inv => { if (inv) setIncoming(inv); }); }, [game]);

    const inHub = options.inLobbyScreen && !lobby && active;
    useEffect(() => {
        if (!inHub) return;
        void lobbiesApi(game).then(setLobbies);
        const timer = setInterval(() => { void lobbiesApi(game).then(setLobbies); }, 3000);
        return () => clearInterval(timer);
    }, [inHub, game]);

    const forfeitIfLive = useCallback(() => {
        const og = onlineRef.current;
        if (!og || !inProgressRef.current) return;
        resignApi(og.gameId);
        inProgressRef.current = false;
        void recordResultApi(game, 'online', 'loss').then(s => { if (s) opts.current.onStats?.(s); });
    }, [game]);

    const goHome = useCallback(() => {
        forfeitIfLive();
        if (lobbyRef.current || onlineRef.current) leaveLobbyApi();
        setOnlineGame(null); setLobby(null); setInviteError(null); setHubError(null); setLobbyGone(false);
        opts.current.onHome();
    }, [forfeitIfLive]);

    useEffect(() => {
        if (lobbyGone && options.inLobbyScreen) goHome();
    }, [lobbyGone, options.inLobbyScreen, goHome]);

    const kick = useCallback(() => {
        setLobby(lb => (lb ? { ...lb, members: lb.members.filter(m => m.host) } : lb));
        kickMemberApi();
    }, []);

    useEffect(() => {
        if (!options.inLobbyScreen || !lobby || !active) return;
        const missing = lobby.members.find(m => !m.you && !m.returned);
        if (!missing) return;
        const timer = setTimeout(() => { if (missing.host) goHome(); else kick(); }, 20000);
        return () => clearTimeout(timer);
    }, [options.inLobbyScreen, lobby, active, goHome, kick]);

    useEffect(() => () => {
        if (onlineRef.current) resignApi(onlineRef.current.gameId);
        if (inProgressRef.current) void recordResultApi(game, 'online', 'loss');
        if (onlineRef.current || lobbyRef.current) leaveLobbyApi();
    }, [game]);

    const create = useCallback((isPublic: boolean, side: Side, wager: number) => {
        setHubError(null);
        void createLobbyApi(game, isPublic, side, wager).then(r => {
            if (r.lobby) setLobby(r.lobby);
            else setHubError(r.message || t('games.couldNotCreateLobby', 'Could not create lobby'));
        });
    }, [game]);

    const join = useCallback((id: string) => {
        setHubError(null);
        void joinLobbyApi(game, id).then(r => {
            if (r.lobby) setLobby(r.lobby);
            else setHubError(r.message || t('games.couldNotJoin', 'Could not join'));
        });
    }, [game]);

    const accept = useCallback(() => {
        const inv = incomingRef.current;
        setIncoming(null);
        if (inv) join(inv.lobbyId);
    }, [join]);

    const decline = useCallback(() => {
        if (incomingRef.current) declineInviteApi();
        setIncoming(null);
    }, []);

    const invite = useCallback((target: string) => {
        setInviteError(null);
        void inviteLobbyApi(target).then(r => {
            if (!r.ok) setInviteError(r.message || t('games.couldNotInvite', 'Could not invite'));
        });
    }, []);

    const start = useCallback(() => {
        const lb = lobbyRef.current;
        if (lb) void startLobbyApi(lb.id).then(r => {
            if (!r.ok) setInviteError(r.message || t('games.couldNotStart', 'Could not start'));
        });
    }, []);

    const leave = useCallback(() => {
        leaveLobbyApi();
        setLobby(null);
        setInviteError(null);
    }, []);

    const setWager = useCallback((wager: number) => {
        setLobby(lb => (lb && lb.isHost ? { ...lb, wager } : lb));
        setWagerApi(wager);
    }, []);

    const ready = useCallback((r: boolean) => {
        setLobby(lb => (lb ? { ...lb, members: lb.members.map(m => (m.you ? { ...m, ready: r } : m)) } : lb));
        setReadyApi(r);
    }, []);

    const refresh = useCallback(() => { void lobbiesApi(game).then(setLobbies); }, [game]);

    const returnToLobby = useCallback(() => {
        void returnToLobbyApi(game).then(r => {
            if (!r.lobby) return;
            setOnlineGame(null); setInviteError(null); setLobbyGone(false);
            setLobby(r.lobby);
            opts.current.onReset?.();
        });
    }, [game]);

    return {
        lobby, lobbies, incoming, hubError, inviteError, lobbyGone, onlineGame,
        create, join, accept, decline, invite, start, leave, kick, setWager, ready,
        refresh, returnToLobby, goHome,
    };
}
