
import { fetchNui, isFiveM } from '@/core/nui';
import type { Message, Reaction } from '@/shared/chat/data';
import { MATCHES, MY_PROFILE, PROFILES, type Match, type MyProfile, type SwipeProfile } from './data';
import { apiCall, apiData } from '@/core/api';

export interface RawCherryMessage {
    id:        string;
    sender:    string;
    body:      string;
    kind:      Message['kind'];
    ts:        number;
    gifUrl?:   string;
    amount?:   number;
    requested?: boolean;
    duration?: number;
    audioUrl?: string;
    waveform?: number[];
    wpCode?:   string;
    wpSub?:    string;
    reactions?: Reaction[];
}

export interface CherryState {
    me:      string;
    profile: MyProfile;
    deck:    SwipeProfile[];
    matches: Match[];
    canReset: boolean;
}

interface RawMatch {
    id:           string;
    createdAt?:   number;
    partner:      Match['partner'];
    lastMessage?: RawCherryMessage;
}

export function toMessage(raw: RawCherryMessage, me: string): Message {
    return {
        id:   raw.id,
        from: raw.sender === me ? 'me' : raw.sender,
        body: raw.body,
        kind: raw.kind,
        ts:   raw.ts,
        read: true,
        gifUrl: raw.gifUrl, amount: raw.amount, requested: raw.requested,
        duration: raw.duration, audioUrl: raw.audioUrl, waveform: raw.waveform,
        wpCode: raw.wpCode, wpSub: raw.wpSub, reactions: raw.reactions,
    };
}

export function toMatch(raw: RawMatch, me: string): Match {
    return {
        id:        raw.id,
        createdAt: raw.createdAt,
        partner:   raw.partner,
        messages:  raw.lastMessage ? [toMessage(raw.lastMessage, me)] : [],
        loaded:    false,
    };
}

export async function cherryState(): Promise<CherryState | null> {
    if (!isFiveM) {
        return {
            me:      'me',
            profile: { ...MY_PROFILE },
            deck:    PROFILES.map(p => ({ ...p })),
            matches: MATCHES.map(m => ({ ...m, messages: m.messages.map(x => ({ ...x })) })),
            canReset: true,
        };
    }
    const r = await apiData<{ me: string; profile: MyProfile; deck: SwipeProfile[]; matches: RawMatch[]; canReset?: boolean }>('sd-phone:cherry:state');
    if (!r) return null;
    return {
        me:      r.me,
        profile: r.profile,
        deck:    r.deck ?? [],
        matches: (r.matches ?? []).map(m => toMatch(m, r.me)),
        canReset: r.canReset !== false,
    };
}

export async function cherrySaveProfile(profile: MyProfile): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:cherry:saveProfile', profile);
}

export async function cherrySwipe(target: SwipeProfile, liked: boolean, me: string): Promise<Match | null> {
    if (!isFiveM) {
        return liked && target.likesYou
            ? { id: 'match-' + target.id, partner: { username: target.id, name: target.name, age: target.age, photo: target.photos[0] }, messages: [], loaded: true }
            : null;
    }
    const r = await apiData<{ matched: boolean; match?: RawMatch }>('sd-phone:cherry:swipe', { target: target.id, liked });
    if (r?.matched && r.match) return toMatch(r.match, me);
    return null;
}

export function cherryRewind(target: string): void {
    if (isFiveM) void fetchNui('sd-phone:cherry:rewind', { target });
}

export async function cherryResetDeck(): Promise<void> {
    if (!isFiveM) return;
    await fetchNui('sd-phone:cherry:resetDeck');
}

export async function cherryThread(matchId: string, me: string): Promise<Message[] | null> {
    if (!isFiveM) return null;
    const r = await apiData<{ messages: RawCherryMessage[] }>('sd-phone:cherry:thread', { matchId });
    if (!r) return null;
    return (r.messages ?? []).map(m => toMessage(m, me));
}

export interface CherrySendResult { message: Message | null; error?: string }

export async function cherrySend(matchId: string, draft: Record<string, unknown>, me: string): Promise<CherrySendResult> {
    if (!isFiveM) {
        return { message: {
            id: `m-${Date.now()}`, from: 'me', ts: Date.now(), read: true,
            body: String(draft.body ?? ''), kind: draft.kind as Message['kind'],
            gifUrl: draft.gifUrl as string | undefined, amount: draft.amount as number | undefined,
            requested: draft.requested as boolean | undefined, duration: draft.duration as number | undefined,
            audioUrl: draft.audioUrl as string | undefined, waveform: draft.waveform as number[] | undefined,
            wpCode: draft.wpCode as string | undefined, wpSub: draft.wpSub as string | undefined,
        } };
    }
    const r = await apiCall<RawCherryMessage>('sd-phone:cherry:send', { matchId, ...draft });
    if (r.success && r.data) return { message: toMessage(r.data, me) };
    return { message: null, error: r.message };
}

export async function cherryReact(messageId: string, emoji: string): Promise<Reaction[] | null> {
    if (!isFiveM) return null;
    const r = await apiData<{ id: string; reactions: Reaction[] }>('sd-phone:cherry:react', { id: messageId, emoji });
    if (!r) return null;
    return Array.isArray(r.reactions) ? r.reactions : [];
}

export async function cherryUnmatch(matchId: string): Promise<boolean> {
    if (!isFiveM) return true;
    const r = await apiCall<void>('sd-phone:cherry:unmatch', { matchId });
    return r.success;
}

export async function cherryBlock(matchId: string): Promise<boolean> {
    if (!isFiveM) return true;
    const r = await apiCall<void>('sd-phone:cherry:block', { matchId });
    return r.success;
}

export interface BlockedEntry { username: string; name: string; age: number; photo?: string }

export async function cherryBlockedList(): Promise<BlockedEntry[]> {
    if (!isFiveM) {
        const sloane = PROFILES.find(p => p.name === 'Sloane');
        return [{ username: 'sloane', name: 'Sloane', age: 26, photo: sloane?.photos[0] }];
    }
    const r = await apiData<BlockedEntry[]>('sd-phone:cherry:blockedList');
    return Array.isArray(r) ? r : [];
}

export async function cherryUnblock(username: string): Promise<boolean> {
    if (!isFiveM) return true;
    const r = await apiCall<void>('sd-phone:cherry:unblock', { username });
    return r.success;
}

export function cherryWatch(on: boolean): void {
    if (isFiveM) void fetchNui('sd-phone:cherry:watch', { on });
}

export async function cherryDeleteAccount(): Promise<boolean> {
    if (!isFiveM) return true;
    const r = await apiCall<void>('sd-phone:cherry:deleteAccount');
    return r.success;
}
