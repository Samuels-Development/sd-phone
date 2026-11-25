import { useCallback, useEffect, useRef, useState } from 'react';

import { useDeckActive } from '@/shell/deckActive';
import { isHostMessage } from '@/core/messageSource';
import { t } from '@/i18n';
import {
    checkPendingApi, createLobbyApi, declineInviteApi, finishApi, inviteLobbyApi, joinLobbyApi,
    kickMemberApi, leaveLobbyApi, lobbiesApi, resignApi, returnToLobbyApi,
    setReadyApi, setWagerApi, startLobbyApi,
    type LobbyListItem, type LobbyState, type PendingInvite, type Side,
} from './onlineApi';
import type { GameStats } from './statsApi';

interface OnlineGameInfo { gameId: string; opponent: string; pot: number; side: string; turnSeconds: number; setupSeconds: number; timeLimit: number }
interface OnlineStartData { gameId: string; color: string; opponent: string; pot: number; turnSeconds?: number; setupSeconds?: number; timeLimit?: number }
export interface OnlineResult { winner?: string; reason: string; reveal?: unknown }

export interface UseOnlineLobbyOptions {
    onStart: (d: OnlineStartData) => void;
    onMove?: (move: unknown) => void;
    onBegin?: (d: { turn: string; you: string }) => void;
    onOppReady?: () => void;
    onResult?: (r: OnlineResult) => void;
    onDrawOffer?: () => void;
    onEnded: (reason: string, reveal?: unknown) => void;
    onReset?: () => void;
    onHome: () => void;
    onStats?: (stats: GameStats) => void;
    inLobbyScreen: boolean;
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

export function useGameEvent<T>(action: string, handler: (data: T) => void): void {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    useEffect(() => {
        function listener(event: MessageEvent) {
            if (!isHostMessage(event)) return;
            const msg = event.data as { action?: string; data?: unknown } | undefined;
            if (!msg || msg.action !== action) return;
            handlerRef.current(msg.data as T);
        }
        window.addEventListener('message', listener);
        return () => window.removeEventListener('message', listener);
    }, [action]);
}

export function useOnlineLobby(game: string, options: UseOnlineLobbyOptions): OnlineLobby {
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
        setOnlineGame({ gameId: d.gameId, opponent: d.opponent, pot: d.pot || 0, side: d.color, turnSeconds: d.turnSeconds || 0, setupSeconds: d.setupSeconds || 0, timeLimit: d.timeLimit || 0 });
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
    useGameEvent<{ gameId?: string; winner?: string; reason?: string; reveal?: unknown; stats?: GameStats }>(`${game}:result`, d => {
        if (d?.stats) opts.current.onStats?.(d.stats);
        opts.current.onResult?.({ winner: d?.winner, reason: d?.reason || 'win', reveal: d?.reveal });
        if (d?.gameId) finishApi(d.gameId);
    });
    useGameEvent<{ stats?: GameStats }>(`${game}:stats`, d => {
        if (d?.stats) opts.current.onStats?.(d.stats);
    });
    useGameEvent<unknown>(`${game}:drawOffer`, () => { opts.current.onDrawOffer?.(); });
    useGameEvent<{ reason?: string; reveal?: unknown; stats?: GameStats }>(`${game}:ended`, d => {
        if (d?.stats) opts.current.onStats?.(d.stats);
        opts.current.onEnded(d?.reason || 'left', d?.reveal);
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
        void lobbiesApi(game).then(setLobbies).catch(() => {});
        const timer = setInterval(() => { void lobbiesApi(game).then(setLobbies).catch(() => {}); }, 3000);
        return () => clearInterval(timer);
    }, [inHub, game]);

    const forfeitIfLive = useCallback(() => {
        const og = onlineRef.current;
        if (!og || !inProgressRef.current) return;
        resignApi(og.gameId);
        inProgressRef.current = false;
    }, []);

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
        if (onlineRef.current || lobbyRef.current) leaveLobbyApi();
    }, []);

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
        setInviteError(null);
        setLobby(lb => (lb ? { ...lb, members: lb.members.map(m => (m.you ? { ...m, ready: r } : m)) } : lb));
        void setReadyApi(r, lobbyRef.current?.wager ?? 0).then(res => {
            if (!res.ok) setInviteError(res.message || t('games.couldNotReady', 'Could not ready up'));
        });
    }, []);

    const refresh = useCallback(() => { void lobbiesApi(game).then(setLobbies).catch(() => {}); }, [game]);

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
