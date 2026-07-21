
import { fetchNui, isFiveM } from '@/core/nui';
import { colorFor, digits, initialsFor } from '@/lib/format';
import { formatPhone } from '@/apps/phone/data';
import { CONTACTS, CONVERSATIONS, ME, type Contact, type Conversation, type Message, type Reaction } from './data';
import { apiCall, apiData } from '@/core/api';

export interface MessagesState {
    conversations: Conversation[];
    contacts:      Contact[];
    myNumber:      string;
    myName:        string;
}

export interface SendInput {
    conversation: string;
    body:         string;
    kind:         Message['kind'];
    gifUrl?:      string;
    amount?:      number;
    duration?:    number;
    wpCode?:      string;
    wpSub?:       string;
    replyTo?:     { name: string; body: string };
    requested?:   boolean;
    audioUrl?:    string;
    waveform?:    number[];
}

export function contactFromNumber(number: string): Contact {
    const d = number.replace(/\D/g, '');
    const name = formatPhone(d);
    return { id: d, name, initials: initialsFor(name), color: colorFor(d || name), phone: d };
}

// Re-resolves a 1:1 conversation's display identity against the live contacts book, so a
// contact rename/delete/add is reflected without a refetch. Groups keep their server-supplied
// participants. Short numeric ids (service short codes) keep their server label, since those
// senders are never saved contacts and carry a meaningful name (e.g. an app verification code).
export function resolveConvParticipant(conv: Conversation, cardByNumber: Map<string, Contact>): Conversation {
    if (conv.groupName) return conv;
    const p   = conv.participants[0];
    const key = digits(p?.phone ?? p?.id ?? conv.id ?? '');
    if (!key) return conv;

    const resolved = cardByNumber.get(key) ?? (key.length >= 7 ? contactFromNumber(key) : undefined);
    if (!resolved) return conv;
    if (p && p.name === resolved.name && p.avatar === resolved.avatar
        && p.color === resolved.color && p.initials === resolved.initials) {
        return conv;
    }
    return { ...conv, participants: [resolved] };
}

function cloneConv(c: Conversation): Conversation {
    return { ...c, participants: c.participants.map(p => ({ ...p })), messages: c.messages.map(m => ({ ...m })) };
}

export async function loadMessages(): Promise<MessagesState> {
    if (!isFiveM) {
        return {
            conversations: CONVERSATIONS.map(cloneConv),
            contacts:      Object.values(CONTACTS),
            myNumber:      '2051189847',
            myName:        ME.name,
        };
    }
    const res = await apiData<MessagesState>('sd-phone:messages:list');
    if (res) {
        return {
            conversations: res.conversations ?? [],
            contacts:      res.contacts ?? [],
            myNumber:      res.myNumber ?? '',
            myName:        res.myName ?? '',
        };
    }
    return { conversations: [], contacts: [], myNumber: '', myName: '' };
}

export interface SendResult { data: Message | null; error?: string }

export async function sendMessageApi(input: SendInput): Promise<SendResult> {
    if (!isFiveM) {
        return { data: {
            id: `m-${Date.now()}`, from: 'me', body: input.body, kind: input.kind,
            ts: Date.now(), read: true,
            gifUrl: input.gifUrl, amount: input.amount, duration: input.duration,
            wpCode: input.wpCode, wpSub: input.wpSub, requested: input.requested,
            audioUrl: input.audioUrl, waveform: input.waveform,
        } };
    }
    const res = await apiCall<Message>('sd-phone:messages:send', input);
    if (res.success && res.data) return { data: res.data };
    return { data: null, error: res.message };
}

export async function uploadVoiceMessage(audio: string): Promise<string | null> {
    if (!isFiveM) return audio;
    return (await apiData<{ url: string }>('sd-phone:messages:uploadVoice', { audio }))?.url ?? null;
}

export async function reactMessageApi(messageId: string, emoji: string): Promise<Reaction[] | null> {
    if (!isFiveM) return null;
    const r = await apiData<{ id: string; reactions: Reaction[] }>('sd-phone:messages:react', { id: messageId, emoji });
    if (!r) return null;
    return Array.isArray(r.reactions) ? r.reactions : [];
}

export async function createGroupApi(name: string, members: string[]): Promise<Conversation | null> {
    if (!isFiveM) return null;
    return await apiData<Conversation>('sd-phone:messages:createGroup', { name, members });
}

export async function addGroupMemberApi(conversation: string, members: string[]): Promise<Conversation | null> {
    if (!isFiveM) return null;
    return await apiData<Conversation>('sd-phone:messages:addGroupMember', { conversation, members });
}

export async function updateGroupApi(conversation: string, patch: { name?: string; avatar?: string }): Promise<Conversation | null> {
    if (!isFiveM) return null;
    return await apiData<Conversation>('sd-phone:messages:updateGroup', { conversation, ...patch });
}

export async function removeGroupMemberApi(conversation: string, member: string): Promise<Conversation | null> {
    if (!isFiveM) return null;
    return await apiData<Conversation>('sd-phone:messages:removeGroupMember', { conversation, member });
}

export function markReadApi(conversation: string): void {
    if (!isFiveM) return;
    void fetchNui('sd-phone:messages:markRead', { conversation });
}

export function deleteConversationApi(conversation: string): void {
    if (!isFiveM) return;
    void fetchNui('sd-phone:messages:delete', { conversation });
}


function mergeMessages(existing: Message[], incoming: Message[]): Message[] {
    const seen = new Set(existing.map(m => m.id));
    const merged = [...existing];
    for (const m of incoming) {
        if (!seen.has(m.id)) { seen.add(m.id); merged.push(m); }
    }
    return merged.sort((a, b) => a.ts - b.ts);
}

export function upsertConversation(list: Conversation[], incoming: Conversation): Conversation[] {
    const idx = list.findIndex(c => c.id === incoming.id);
    if (idx === -1) return [incoming, ...list];

    const current = list[idx];
    const merged: Conversation = {
        ...current,
        groupName:    incoming.groupName ?? current.groupName,
        groupAvatar:  incoming.groupAvatar ?? current.groupAvatar,
        groupOwner:   incoming.groupOwner ?? current.groupOwner,
        participants: incoming.participants.length ? incoming.participants : current.participants,
        messages:     mergeMessages(current.messages, incoming.messages),
    };
    return [merged, ...list.filter((_, i) => i !== idx)];
}

export function appendMessage(list: Conversation[], conversationId: string, msg: Message): Conversation[] {
    return appendThreadMessage(list, conversationId, msg);
}

export function replaceMessage(list: Conversation[], conversationId: string, tempId: string, real: Message): Conversation[] {
    return list.map(c => (
        c.id === conversationId
            ? { ...c, messages: c.messages.map(m => (m.id === tempId ? real : m)) }
            : c
    ));
}

export function toggleReactionLocal(reactions: Reaction[] | undefined, emoji: string): Reaction[] {
    const list = (reactions ?? []).map(r => ({ ...r }));
    const target = list.find(r => r.emoji === emoji);
    if (target?.mine) {
        target.count -= 1; target.mine = false;
    } else if (target) {
        target.count += 1; target.mine = true;
    } else {
        list.push({ emoji, count: 1, mine: true });
    }
    return list.filter(r => r.count > 0);
}

export function applyReaction(list: Conversation[], conversationId: string, messageId: string, reactions: Reaction[]): Conversation[] {
    const next = (Array.isArray(reactions) ? reactions : []).filter(r => r.count > 0);
    return list.map(c => (
        c.id === conversationId
            ? { ...c, messages: c.messages.map(m => (m.id === messageId ? { ...m, reactions: next.length ? next : undefined } : m)) }
            : c
    ));
}

export function appendThreadMessage<M extends { id: string }, T extends { id: string; messages: M[] }>(
    threads: T[], threadId: string, msg: M,
): T[] {
    const idx = threads.findIndex(t => t.id === threadId);
    if (idx === -1) return threads;
    const thread = threads[idx];
    if (thread.messages.some(m => m.id === msg.id)) return threads;
    const updated = { ...thread, messages: [...thread.messages, msg] };
    return [updated, ...threads.filter((_, i) => i !== idx)];
}

export function patchThreadMessage<M extends { id: string }, T extends { id: string; messages: M[] }>(
    threads: T[], threadId: string, msgId: string, fn: (m: M) => M,
): T[] {
    return threads.map(t => (
        t.id === threadId ? { ...t, messages: t.messages.map(m => (m.id === msgId ? fn(m) : m)) } : t
    ));
}

export function markConversationRead(list: Conversation[], conversationId: string): Conversation[] {
    return list.map(c => (
        c.id === conversationId
            ? { ...c, messages: c.messages.map(m => (m.from === 'me' || m.read ? m : { ...m, read: true })) }
            : c
    ));
}
