import { fetchNui, isFiveM } from '@/core/nui';
import { apiCall, apiData } from '@/core/api';

export type Side = string;

export interface LobbyMember { name: string; you: boolean; host: boolean; color: Side; canAfford: boolean; ready: boolean; returned: boolean }
export interface LobbyState { id: string; host: string; public: boolean; wager: number; isHost: boolean; canStart: boolean; members: LobbyMember[] }
export interface LobbyListItem { id: string; host: string; count: number; wager: number }
export interface PendingInvite { lobbyId: string; fromName: string }

const SIDES: Record<string, [Side, Side]> = {};
export function registerGameSides(game: string, sides: [Side, Side]) { SIDES[game] = sides; }
const sidesFor = (game: string): [Side, Side] => SIDES[game] ?? ['1', '2'];

const DEV_LOBBIES: LobbyListItem[] = [
    { id: 'dev-1', host: 'Ryan Carter', count: 1, wager: 5000 },
    { id: 'dev-2', host: 'Maya Lopez',  count: 1, wager: 0 },
];
const devLobby = (pub: boolean, side: Side, wager: number): LobbyState =>
    ({ id: 'dev-lobby', host: 'You', public: pub, wager, isHost: true, canStart: false, members: [{ name: 'You', you: true, host: true, color: side, canAfford: true, ready: true, returned: true }] });
const devJoin = (game: string, id: string): LobbyState => {
    const lb = DEV_LOBBIES.find(l => l.id === id);
    const [a, b] = sidesFor(game);
    return { id, host: lb?.host ?? 'Host', public: true, wager: lb?.wager ?? 0, isHost: false, canStart: false, members: [{ name: lb?.host ?? 'Host', you: false, host: true, color: a, canAfford: true, ready: true, returned: true }, { name: 'You', you: true, host: false, color: b, canAfford: true, ready: false, returned: true }] };
};

export async function createLobbyApi(game: string, isPublic: boolean, side: Side, wager: number): Promise<{ lobby?: LobbyState; message?: string }> {
    if (!isFiveM) return { lobby: devLobby(isPublic, side, wager) };
    const r = await apiCall<LobbyState>('sd-phone:games:createLobby', { game, public: isPublic, color: side, wager });
    return r.success && r.data ? { lobby: r.data } : { message: r.message };
}

export async function lobbiesApi(game: string): Promise<LobbyListItem[]> {
    if (!isFiveM) return DEV_LOBBIES;
    return (await apiData<LobbyListItem[]>('sd-phone:games:lobbies', { game })) ?? [];
}

export async function joinLobbyApi(game: string, id: string): Promise<{ lobby?: LobbyState; message?: string }> {
    if (!isFiveM) return { lobby: devJoin(game, id) };
    const r = await apiCall<LobbyState>('sd-phone:games:joinLobby', { id });
    return r.success && r.data ? { lobby: r.data } : { message: r.message };
}

export async function inviteLobbyApi(target: string): Promise<{ ok: boolean; message?: string }> {
    if (!isFiveM) return { ok: true };
    const r = await apiCall<unknown>('sd-phone:games:inviteLobby', { target });
    return { ok: r.success, message: r.message };
}

export async function startLobbyApi(id: string): Promise<{ ok: boolean; message?: string }> {
    if (!isFiveM) return { ok: true };
    const r = await apiCall<unknown>('sd-phone:games:startLobby', { id });
    return { ok: r.success, message: r.message };
}

export function declineInviteApi(): void { if (!isFiveM) return; void fetchNui('sd-phone:games:declineInvite'); }
export function leaveLobbyApi():   void { if (!isFiveM) return; void fetchNui('sd-phone:games:leaveLobby'); }

export function kickMemberApi(): void { if (!isFiveM) return; void fetchNui('sd-phone:games:kickMember'); }
export function setWagerApi(wager: number): void { if (!isFiveM) return; void fetchNui('sd-phone:games:setWager', { wager }); }
export function setReadyApi(ready: boolean): void { if (!isFiveM) return; void fetchNui('sd-phone:games:setReady', { ready }); }

export async function returnToLobbyApi(game: string): Promise<{ lobby?: LobbyState; message?: string }> {
    if (!isFiveM) return { lobby: devLobby(true, sidesFor(game)[0], 0) };
    const r = await apiCall<LobbyState>('sd-phone:games:returnToLobby');
    return r.success && r.data ? { lobby: r.data } : { message: r.message };
}

export async function checkPendingApi(game: string): Promise<PendingInvite | null> {
    if (!isFiveM) return null;
    return (await apiData<{ invite?: PendingInvite }>('sd-phone:games:pending', { game }))?.invite ?? null;
}

export function moveApi(gameId: string, move: unknown): void {
    if (!isFiveM) return;
    void fetchNui('sd-phone:games:move', { gameId, move });
}

/**
 * Reports that this player's pre-match setup is done (battleship: fleet placed). The server
 * holds every move until BOTH sides report, then pushes `<game>:begin` with whose turn it is.
 */
export function setupReadyApi(gameId: string): void {
    if (!isFiveM || !gameId) return;
    void fetchNui('sd-phone:games:setupReady', { gameId });
}

export function resignApi(gameId: string): void {
    if (!isFiveM || !gameId) return;
    void fetchNui('sd-phone:games:resign', { gameId });
}

export function finishApi(gameId: string): void {
    if (!isFiveM || !gameId) return;
    void fetchNui('sd-phone:games:finish', { gameId });
}

export function reportResultApi(gameId: string, result: 'win' | 'loss' | 'draw'): void {
    if (!isFiveM || !gameId) return;
    void fetchNui('sd-phone:games:report', { gameId, result });
}
