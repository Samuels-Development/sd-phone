import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { ChatView } from '@/shared/chat/ChatView';
import { ConversationList } from './ConversationList';
import { NewMessage } from './NewMessage';
import { AlertDialog } from '@/ui/AlertDialog';
import { isFiveM } from '@/core/nui';
import { apiCall } from '@/core/api';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState, seedSessionState, clearSessionState } from '@/hooks/useSessionState';
import { useDidEnter } from '@/hooks/useDidEnter';
import type { MessagesIncomingPush } from '@/core/types';
import { unreadCount, type Contact, type Conversation, type Message } from '@/shared/chat/data';
import {
    loadMessages, sendMessageApi, createGroupApi, addGroupMemberApi, updateGroupApi,
    removeGroupMemberApi, markReadApi,
    upsertConversation, appendMessage, replaceMessage, markConversationRead,
    deleteConversationApi, contactFromNumber, reactMessageApi, toggleReactionLocal,
    applyReaction, resolveConvParticipant, type SendInput,
} from '@/shared/chat/messagesApi';
import type { Reaction } from '@/shared/chat/data';
import { useContacts, useContactsStore } from '@/stores/contactsStore';
import { digits } from '@/lib/format';
import { peekMessagesTarget, clearMessagesTarget } from '@/shell/deeplink';
import { saveNewContact } from '@/stores/contactsStore';
import type { Contact as PhoneContact } from '@/apps/phone/data';

type Draft = Omit<SendInput, 'conversation'>;

export function Messages({ onClose }: { onClose: () => void }) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [contacts,      setContacts]      = useState<Contact[]>([]);
    const [openId,        setOpenId]        = useSessionState<string | null>('messages:openConvoId', null);
    const [composing,     setComposing]     = useSessionState('messages:composing', false);
    const [sendError,     setSendError]     = useState<string | null>(null);

    const [pending]        = useState(() => peekMessagesTarget());
    const [resolved, setResolved] = useState(!pending);

    // The saved-contacts book, shared with the Phone app and kept live there (optimistic
    // add/edit/delete + push events). Names are resolved against it at render so a contact
    // change reflects in the conversation list / thread header without a Messages refetch.
    // myNumber rides along for the same reason: the store refetches on live SIM swaps, so the
    // own-number guards here never hold a pre-swap number.
    const { contacts: liveCards, myNumber } = useContacts('contacts', 'myNumber');
    useEffect(() => { void useContactsStore.getState().load(); }, []);

    useEffect(() => {
        clearMessagesTarget();
        let active = true;
        void loadMessages().then(state => {
            if (!active) return;
            setConversations(state.conversations);
            setContacts(state.contacts);

            if (!pending) return;
            const digits = pending.number.replace(/\D/g, '');
            if (!digits) { setResolved(true); return; }

            const existing  = state.conversations.find(c => c.id === digits);
            const knownCard  = state.contacts.find(c => (c.phone ?? '').replace(/\D/g, '') === digits);

            if (existing || knownCard) {
                if (!existing) {
                    setConversations(prev => prev.some(c => c.id === digits)
                        ? prev
                        : [{ id: digits, participants: [knownCard ?? contactFromNumber(digits)], messages: [], pinned: false, muted: false }, ...prev]);
                }
                setComposing(false);
                setOpenId(digits);
                markReadApi(digits);
            } else {
                clearSessionState('messages:new');
                seedSessionState('messages:newRecipients', [contactFromNumber(digits)]);
                setOpenId(null);
                setComposing(true);
            }
            setResolved(true);
        });
        return () => { active = false; };
    }, []);

    const openIdRef = useRef(openId);
    useEffect(() => { openIdRef.current = openId; }, [openId]);

    useNuiEvent('sd-phone:messages:incoming', useCallback((data: MessagesIncomingPush) => {
        if (!data) return;
        const incoming = data as unknown as Conversation;
        setConversations(prev => {
            const merged = upsertConversation(prev, incoming);
            return openIdRef.current === incoming.id ? markConversationRead(merged, incoming.id) : merged;
        });
        if (openIdRef.current === incoming.id) markReadApi(incoming.id);
    }, []));

    const cardByNumber = useMemo(() => {
        const m = new Map<string, Contact>();
        for (const c of liveCards) {
            const key = digits(c.phone ?? '');
            if (key) m.set(key, { id: key, name: c.name, initials: c.initials, color: c.color, avatar: c.avatar, phone: key });
        }
        return m;
    }, [liveCards]);

    const resolvedConversations = useMemo(
        () => conversations.map(c => resolveConvParticipant(c, cardByNumber)),
        [conversations, cardByNumber],
    );

    // Recipient book for compose / add-member: the live shared book in-game, the fetched mock in dev.
    const composeContacts = useMemo<Contact[]>(() => {
        if (!isFiveM) return contacts;
        return [...cardByNumber.values()].sort((a, b) => a.name.localeCompare(b.name));
    }, [contacts, cardByNumber]);

    const conv = openId ? resolvedConversations.find(c => c.id === openId) ?? null : null;
    const totalUnread = resolvedConversations.reduce((n, c) => n + unreadCount(c), 0);
    const animateNav = useDidEnter(conversations.length > 0);

    const openConversation = useCallback((id: string) => {
        setOpenId(id);
        markReadApi(id);
        setConversations(prev => markConversationRead(prev, id));
    }, []);

    const sendMessage = useCallback(async (conversationId: string, draft: Draft) => {
        const optimistic: Message = {
            id:   `tmp-${Date.now()}`,
            from: 'me',
            body: draft.body,
            kind: draft.kind,
            ts:   Date.now(),
            read: true,
            gifUrl: draft.gifUrl, amount: draft.amount, duration: draft.duration,
            wpCode: draft.wpCode, wpSub: draft.wpSub, replyTo: draft.replyTo,
            requested: draft.requested, audioUrl: draft.audioUrl, waveform: draft.waveform,
        };
        setConversations(prev => appendMessage(prev, conversationId, optimistic));

        const res = await sendMessageApi({ conversation: conversationId, ...draft });
        if (res.data) {
            setConversations(prev => replaceMessage(prev, conversationId, optimistic.id, { ...res.data!, replyTo: draft.replyTo }));
        } else {
            setConversations(prev => prev.map(c => (
                c.id === conversationId
                    ? { ...c, messages: c.messages.filter(m => m.id !== optimistic.id) }
                    : c
            )));
            if (res.error) setSendError(res.error);
        }
        return !!res.data;
    }, []);

    const reactToMessage = useCallback((conversationId: string, messageId: string, emoji: string) => {
        setConversations(prev => prev.map(c => (
            c.id === conversationId
                ? { ...c, messages: c.messages.map(m => {
                    if (m.id !== messageId) return m;
                    const next = toggleReactionLocal(m.reactions, emoji);
                    return { ...m, reactions: next.length ? next : undefined };
                  }) }
                : c
        )));
        void reactMessageApi(messageId, emoji).then(server => {
            if (server) setConversations(prev => applyReaction(prev, conversationId, messageId, server));
        });
    }, []);

    useNuiEvent('sd-phone:messages:reaction', useCallback((data: { conversation: string; id: string; reactions: Reaction[] }) => {
        if (!data) return;
        setConversations(prev => applyReaction(prev, data.conversation, data.id, data.reactions));
    }, []));

    const payRequest = useCallback((conversationId: string, messageId: string, amount: number) => {
        void sendMessage(conversationId, { kind: 'money', amount, body: `$${amount}` }).then(sent => {
            if (!sent) return;
            setConversations(prev => prev.map(c => (
                c.id === conversationId
                    ? { ...c, messages: c.messages.map(m => (m.id === messageId ? { ...m, requestStatus: 'paid' as const } : m)) }
                    : c
            )));
        });
    }, [sendMessage]);

    const respondLocationRequest = useCallback(async (conversationId: string, messageId: string, accept: boolean) => {
        if (isFiveM) {
            const r = await apiCall<void>(
                'sd-phone:friends:respond', { id: messageId, phone: conversationId, accept });
            if (!r.success) {
                setSendError(r.message ?? t('messages.requestNoLongerActive', 'This request is no longer active.'));
                return;
            }
        }
        setConversations(prev => prev.map(c => (
            c.id === conversationId
                ? { ...c, messages: c.messages.map(m => (m.id === messageId ? { ...m, requestStatus: accept ? 'accepted' as const : 'declined' as const } : m)) }
                : c
        )));
    }, []);

    useNuiEvent('sd-phone:messages:meta', useCallback((data: { conversation: string; id: string; requestStatus?: Message['requestStatus'] }) => {
        if (!data?.conversation || !data.id) return;
        setConversations(prev => prev.map(c => (
            c.id === data.conversation
                ? { ...c, messages: c.messages.map(m => (m.id === data.id ? { ...m, requestStatus: data.requestStatus } : m)) }
                : c
        )));
    }, []));

    const startConversation = useCallback((recipients: Contact[], body: string) => {
        const text = body.trim();
        if (recipients.length === 0 || !text) return;
        const draft: Draft = { kind: 'text', body: text };

        if (recipients.length === 1) {
            const id = (recipients[0].phone ?? recipients[0].id).replace(/\D/g, '');
            if (!id) return;
            setConversations(prev => (
                prev.some(c => c.id === id)
                    ? prev
                    : [{ id, participants: [recipients[0]], messages: [], pinned: false, muted: false }, ...prev]
            ));
            setComposing(false);
            setOpenId(id);
            void sendMessage(id, draft);
            return;
        }

        const numbers  = recipients.map(c => c.phone ?? c.id);
        const fallback = recipients.map(c => c.name.split(' ')[0]).join(', ');
        setComposing(false);
        void (async () => {
            const created = await createGroupApi(fallback, numbers) ?? {
                id: `g-${Date.now()}`,
                groupName: fallback,
                participants: recipients,
                messages: [],
                pinned: false,
                muted: false,
            };
            setConversations(prev => upsertConversation(prev, created));
            setOpenId(created.id);
            void sendMessage(created.id, draft);
        })();
    }, [sendMessage]);

    const createGroup = useCallback((members: Contact[], name: string) => {
        const groupName = name.trim();
        if (members.length < 2 || !groupName) return;
        const numbers = members.map(c => c.phone ?? c.id);
        void (async () => {
            const created = await createGroupApi(groupName, numbers) ?? {
                id: `g-${Date.now()}`,
                groupName,
                participants: members,
                messages: [],
                pinned: false,
                muted: false,
            };
            setConversations(prev => upsertConversation(prev, created));
            setOpenId(created.id);
        })();
    }, []);

    const addGroupMembers = useCallback((conversationId: string, members: Contact[]) => {
        if (members.length === 0) return;
        const numbers = members.map(c => c.phone ?? c.id);
        void (async () => {
            const updated = await addGroupMemberApi(conversationId, numbers);
            if (updated) {
                setConversations(prev => upsertConversation(prev, updated));
                return;
            }
            const keyOf = (c: Contact) => (c.phone ?? c.id).replace(/\D/g, '') || c.id;
            setConversations(prev => prev.map(c => {
                if (c.id !== conversationId) return c;
                const seen = new Set(c.participants.map(keyOf));
                const additions = members.filter(m => !seen.has(keyOf(m)));
                return additions.length ? { ...c, participants: [...c.participants, ...additions] } : c;
            }));
        })();
    }, []);

    const updateGroup = useCallback((conversationId: string, name: string, avatar?: string) => {
        const groupName = name.trim();
        if (!groupName) return;
        void (async () => {
            const patch: { name?: string; avatar?: string } = { name: groupName };
            if (avatar !== undefined) patch.avatar = avatar;
            const updated = await updateGroupApi(conversationId, patch);
            if (updated) {
                setConversations(prev => upsertConversation(prev, updated));
                return;
            }
            setConversations(prev => prev.map(c => (
                c.id === conversationId
                    ? { ...c, groupName, ...(avatar !== undefined ? { groupAvatar: avatar } : {}) }
                    : c
            )));
        })();
    }, []);

    const removeGroupMember = useCallback((conversationId: string, member: Contact) => {
        const number = member.phone ?? member.id;
        const keyOf = (c: Contact) => (c.phone ?? c.id).replace(/\D/g, '') || c.id;
        const targetKey = keyOf(member);
        void (async () => {
            const updated = await removeGroupMemberApi(conversationId, number);
            if (updated) {
                setConversations(prev => upsertConversation(prev, updated));
                return;
            }
            setConversations(prev => prev.map(c => (
                c.id === conversationId
                    ? { ...c, participants: c.participants.filter(p => keyOf(p) !== targetKey) }
                    : c
            )));
        })();
    }, []);

    useNuiEvent('sd-phone:messages:removed', useCallback((data: { conversation: string }) => {
        if (!data?.conversation) return;
        setConversations(prev => prev.filter(c => c.id !== data.conversation));
        setOpenId(prev => (prev === data.conversation ? null : prev));
    }, []));

    const saveContactForThread = useCallback(async (conversationId: string, c: PhoneContact): Promise<string | null> => {
        const res = await saveNewContact(c);
        if (res.error || !res.contact) return res.error ?? t('phone.failedToAddContact', 'Failed to add contact.');
        const created = res.contact;
        const digits  = created.phone.replace(/\D/g, '');
        const card: Contact = {
            id: created.id, name: created.name, initials: created.initials,
            color: created.color, avatar: created.avatar, phone: created.phone,
        };
        setContacts(prev => (prev.some(x => (x.phone ?? '').replace(/\D/g, '') === digits) ? prev : [...prev, card]));
        setConversations(prev => prev.map(cv => (
            cv.id === conversationId
                ? { ...cv, participants: cv.participants.map(p => ((p.phone ?? p.id).replace(/\D/g, '') === digits ? card : p)) }
                : cv
        )));
        return null;
    }, []);

    const markRead = useCallback((ids: string[]) => {
        ids.forEach(id => markReadApi(id));
        setConversations(prev => ids.reduce((acc, id) => markConversationRead(acc, id), prev));
    }, []);

    const deleteConversations = useCallback((ids: string[]) => {
        ids.forEach(id => deleteConversationApi(id));
        setConversations(prev => prev.filter(c => !ids.includes(c.id)));
        setOpenId(prev => (prev && ids.includes(prev) ? null : prev));
    }, []);

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-[#d4d4d4] dark:bg-base text-black dark:text-white overflow-hidden">
            {resolved && (
                <ConversationList
                    conversations={resolvedConversations}
                    onOpen={openConversation}
                    onCompose={() => setComposing(true)}
                    onMarkRead={markRead}
                    onDelete={deleteConversations}
                    onCreateGroup={createGroup}
                />
            )}

            {resolved && conv && (
                <ChatView
                    conv={conv}
                    animateIn={animateNav}
                    totalUnread={totalUnread}
                    contacts={composeContacts}
                    myNumber={myNumber}
                    onBack={() => setOpenId(null)}
                    onSend={draft => void sendMessage(conv.id, draft)}
                    onReact={(messageId, emoji) => reactToMessage(conv.id, messageId, emoji)}
                    onPayRequest={(messageId, amount) => payRequest(conv.id, messageId, amount)}
                    onLocationRespond={(messageId, accept) => void respondLocationRequest(conv.id, messageId, accept)}
                    onAddMembers={members => addGroupMembers(conv.id, members)}
                    onUpdateGroup={(name, avatar) => updateGroup(conv.id, name, avatar)}
                    onRemoveMember={member => removeGroupMember(conv.id, member)}
                    onSaveContact={c => saveContactForThread(conv.id, c)}
                />
            )}

            {resolved && composing && (
                <NewMessage
                    contacts={composeContacts}
                    myNumber={myNumber}
                    onCancel={() => setComposing(false)}
                    onSend={startConversation}
                />
            )}

            {sendError && (
                <AlertDialog
                    title={t('messages.couldntSend', "Couldn't Send")}
                    message={sendError}
                    confirmLabel={t('common.ok', 'OK')}
                    hideCancel
                    onCancel={() => setSendError(null)}
                    onConfirm={() => setSendError(null)}
                />
            )}

            <button
                type="button"
                onClick={onClose}
                aria-label={t('messages.closeMessages', 'Close Messages')}
                className="absolute inset-x-0 bottom-0 z-50 h-7 cursor-default"
            />
        </div>
    );
}
