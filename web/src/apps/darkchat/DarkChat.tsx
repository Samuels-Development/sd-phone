import { useCallback, useEffect, useState } from 'react';

import { fetchNui, isFiveM } from '@/core/nui';
import { apiCall, apiData } from '@/core/api';
import { t } from '@/i18n';
import { useDidEnter } from '@/hooks/useDidEnter';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { toggleReactionLocal } from '@/shared/chat/messagesApi';
import { AlertDialog } from '@/ui/AlertDialog';
import { PUBLIC_ROOMS, nowTime, type ChatMessage, type DarkChatDraft, type Reaction, type Room } from './data';
import { RoomsList } from './RoomsList';
import { RoomView } from './RoomView';
import { CreateRoomSheet } from './CreateRoomSheet';
import { JoinCodeSheet } from './JoinCodeSheet';
import { NicknameSheet } from './NicknameSheet';

type SheetKind = 'create' | 'join' | 'nickname' | null;

export function DarkChat({ onClose: _onClose }: { onClose: () => void }) {

    useEffect(() => {
        if (!isFiveM) return;
        return () => { void fetchNui('sd-phone:darkchat:exit'); };
    }, []);

    const [publicRooms,  setPublicRooms]  = useState<Room[]>(isFiveM ? [] : PUBLIC_ROOMS);
    const [privateRooms, setPrivateRooms] = useState<Room[]>([]);
    const [openId,       setOpenId]       = useSessionState<string | null>('darkchat:openRoomId', null);
    const [nickname,     setNickname]     = useState('');
    const [sheet,        setSheet]        = useState<SheetKind>(null);
    const [pendingOpen,  setPendingOpen]  = useState<string | null>(null);
    const [joinError,    setJoinError]    = useState('');
    const [leaveId,      setLeaveId]      = useState<string | null>(null);

    useEffect(() => {
        if (!isFiveM) return;
        let alive = true;
        apiData<{ public: Room[]; private: Room[]; nickname: string }>('sd-phone:darkchat:rooms')
            .then(r => {
                if (!alive || !r) return;
                setPublicRooms(r.public);
                setPrivateRooms(r.private);
                setNickname(r.nickname || '');
            })
            .catch(() => {});
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (!isFiveM || !openId) return;
        const id = openId;
        apiData<{ messages: ChatMessage[]; active?: number }>('sd-phone:darkchat:open', { roomId: id })
            .then(r => {
                if (!r) return;
                const { messages, active } = r;
                patchRoom(id, room => ({ ...room, messages, members: active ?? room.members }));
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openRoom = openId
        ? [...privateRooms, ...publicRooms].find(r => r.id === openId) ?? null
        : null;

    // No-arg so the first room open animates; gating on `!!openRoom` meant the
    // flag only went true after the first room already rendered (no push). See
    // the same fix in Groups.
    const animateNav = useDidEnter();

    function patchRoom(id: string, fn: (r: Room) => Room) {
        const apply = (list: Room[]) => list.map(r => (r.id === id ? fn(r) : r));
        setPublicRooms(apply);
        setPrivateRooms(apply);
    }

    const appendMessage = useCallback((roomId: string, msg: ChatMessage) => {
        const apply = (list: Room[]) => list.map(r => (r.id === roomId ? { ...r, messages: [...r.messages, msg] } : r));
        setPublicRooms(apply);
        setPrivateRooms(apply);
    }, []);

    useNuiEvent('sd-phone:darkchat:message', useCallback((data) => {
        if (!data) return;
        appendMessage(data.roomId, { ...data.message, mine: false } as ChatMessage);
    }, [appendMessage]));

    useNuiEvent('sd-phone:darkchat:active', useCallback((data) => {
        if (!data) return;
        setPublicRooms(list => list.map(r => (r.id === data.roomId ? { ...r, members: data.active } : r)));
    }, []));

    useNuiEvent('sd-phone:darkchat:reaction', useCallback((data) => {
        if (!data) return;
        mergeBroadcastReactions(data.roomId, data.messageId, data.reactions ?? []);
    }, []));

    useNuiEvent('sd-phone:darkchat:kicked', useCallback((data) => {
        if (!data) return;
        setPrivateRooms(prev => prev.filter(r => r.id !== data.roomId));
        setOpenId(cur => (cur === data.roomId ? null : cur));
    }, [setOpenId]));

    const decrementMembers = useCallback((roomId: string) => {
        const apply = (list: Room[]) => list.map(r => (r.id === roomId ? { ...r, members: Math.max(1, r.members - 1) } : r));
        setPublicRooms(apply);
        setPrivateRooms(apply);
    }, []);

    function doOpen(id: string) {
        if (!isFiveM) { setOpenId(id); return; }

        const cached = [...privateRooms, ...publicRooms].find(r => r.id === id);
        const hasHistory = !!cached && cached.messages.length > 0;
        if (hasHistory) setOpenId(id);

        apiData<{ messages: ChatMessage[]; active?: number }>('sd-phone:darkchat:open', { roomId: id })
            .then(r => {
                if (r) {
                    const { messages, active } = r;
                    patchRoom(id, room => ({ ...room, messages, members: active ?? room.members }));
                }
                if (!hasHistory) setOpenId(id);
            })
            .catch(() => { if (!hasHistory) setOpenId(id); });
    }

    function closeRoom() {
        if (isFiveM && openId) void fetchNui('sd-phone:darkchat:close', { roomId: openId });
        setOpenId(null);
    }

    function requestOpen(id: string) {
        if (!nickname) { setPendingOpen(id); setSheet('nickname'); return; }
        doOpen(id);
    }

    function pickNickname(name: string) {
        setNickname(name);
        setSheet(null);
        if (isFiveM) void fetchNui('sd-phone:darkchat:nickname', { nickname: name });
        if (pendingOpen) { doOpen(pendingOpen); setPendingOpen(null); }
    }

    function leaveRoom(id: string) {
        if (isFiveM) void fetchNui('sd-phone:darkchat:leave', { roomId: id });
        setPrivateRooms(prev => prev.filter(r => r.id !== id));
        setLeaveId(null);
        if (openId === id) setOpenId(null);
    }

    function addPrivate(room: Room) {
        setPrivateRooms(prev => (prev.some(r => r.id === room.id) ? prev : [room, ...prev]));
    }

    function createRoom(name: string, code: string) {
        if (!isFiveM) {
            const room: Room = { id: 'p-' + code, name, topic: 'Private room', members: 1, isPrivate: true, code, messages: [] };
            addPrivate(room);
            setSheet(null);
            requestOpen(room.id);
            return;
        }
        apiCall<{ room: Room }>('sd-phone:darkchat:create', { name, code })
            .then(r => {
                if (r.success && r.data) { addPrivate(r.data.room); setSheet(null); requestOpen(r.data.room.id); }
            })
            .catch(() => {});
    }

    function joinByCode(code: string) {
        if (!isFiveM) {
            setSheet(null);
            const existing = [...privateRooms, ...publicRooms].find(r => r.code === code);
            if (existing) { requestOpen(existing.id); return; }
            const room: Room = { id: 'p-' + code, name: `Room ${code}`, topic: 'Private room', members: 2, isPrivate: true, code, messages: [] };
            addPrivate(room);
            requestOpen(room.id);
            return;
        }
        setJoinError('');
        apiCall<{ room: Room }>('sd-phone:darkchat:join', { code })
            .then(r => {
                if (r.success && r.data) { addPrivate(r.data.room); setSheet(null); requestOpen(r.data.room.id); }
                else setJoinError(r.message || t('darkchat.couldNotJoin', 'Could not join that room'));
            })
            .catch(() => setJoinError(t('darkchat.couldNotJoin', 'Could not join that room')));
    }

    function sendMessage(draft: DarkChatDraft) {
        if (!openId) return;
        const roomId = openId;
        const tempId = 'me-' + Date.now();
        const msg: ChatMessage = {
            id: tempId, author: nickname, at: nowTime(), mine: true,
            kind: draft.kind, body: draft.body,
            mediaUrl: draft.mediaUrl, audioUrl: draft.audioUrl, duration: draft.duration, waveform: draft.waveform,
            wpCode: draft.wpCode, wpSub: draft.wpSub, replyTo: draft.replyTo,
        };
        appendMessage(roomId, msg);
        if (!isFiveM) return;
        void apiData<{ message: ChatMessage }>('sd-phone:darkchat:send', {
            roomId, kind: draft.kind, body: draft.body,
            meta: {
                mediaUrl: draft.mediaUrl, audioUrl: draft.audioUrl, duration: draft.duration, waveform: draft.waveform,
                wpCode: draft.wpCode, wpSub: draft.wpSub, replyTo: draft.replyTo,
            },
        }).then(r => {
            if (r?.message) {
                patchRoom(roomId, room => ({
                    ...room,
                    messages: room.messages.map(mm => (mm.id === tempId ? { ...r.message, mine: true } : mm)),
                }));
            }
        }).catch(() => {});
    }

    function applyReactions(roomId: string, messageId: string, reactions: Reaction[]) {
        patchRoom(roomId, room => ({
            ...room,
            messages: room.messages.map(m => (m.id === messageId ? { ...m, reactions: reactions.length ? reactions : undefined } : m)),
        }));
    }

    function mergeBroadcastReactions(roomId: string, messageId: string, incoming: Reaction[]) {
        patchRoom(roomId, room => ({
            ...room,
            messages: room.messages.map(m => {
                if (m.id !== messageId) return m;
                const cur  = m.reactions ?? [];
                const next = incoming.map(r => ({
                    emoji: r.emoji,
                    count: r.count,
                    mine:  cur.find(c => c.emoji === r.emoji)?.mine ?? false,
                }));
                return { ...m, reactions: next.length ? next : undefined };
            }),
        }));
    }

    function reactToMessage(messageId: string, emoji: string) {
        if (!openId) return;
        const roomId = openId;
        patchRoom(roomId, room => ({
            ...room,
            messages: room.messages.map(m => {
                if (m.id !== messageId) return m;
                const next = toggleReactionLocal(m.reactions, emoji);
                return { ...m, reactions: next.length ? next : undefined };
            }),
        }));
        if (!isFiveM) return;
        void apiData<{ reactions: Reaction[] }>('sd-phone:darkchat:react', { roomId, messageId, emoji })
            .then(r => { if (r) applyReactions(roomId, messageId, r.reactions); })
            .catch(() => {});
    }

    return (
        <div className="absolute inset-0 flex flex-col bg-[#0b0b0c] font-sf">
            <div className="h-[58px] shrink-0" aria-hidden />

            <RoomsList
                publicRooms={publicRooms}
                privateRooms={privateRooms}
                nickname={nickname}
                onOpenRoom={requestOpen}
                onCreate={() => setSheet('create')}
                onJoin={() => { setJoinError(''); setSheet('join'); }}
                onEditNickname={() => setSheet('nickname')}
            />

            {openRoom && (
                <RoomView
                    room={openRoom}
                    nickname={nickname}
                    onBack={closeRoom}
                    onSend={sendMessage}
                    onReact={reactToMessage}
                    onLeave={() => setLeaveId(openRoom.id)}
                    onMemberRemoved={() => decrementMembers(openRoom.id)}
                    animateIn={animateNav}
                />
            )}

            {sheet === 'create'   && <CreateRoomSheet onClose={() => setSheet(null)} onCreate={createRoom} />}
            {sheet === 'join'     && <JoinCodeSheet   onClose={() => setSheet(null)} onJoin={joinByCode} error={joinError} />}
            {sheet === 'nickname' && <NicknameSheet   initial={nickname} onClose={() => { setSheet(null); setPendingOpen(null); }} onPick={pickNickname} />}

            {leaveId && (
                <AlertDialog
                    title={t('darkchat.leaveRoomTitle', 'Leave Room?')}
                    message={t('darkchat.leaveRoomMessage', 'You\'ll be removed from "{name}". You can rejoin later with its code.', { name: privateRooms.find(r => r.id === leaveId)?.name ?? t('darkchat.thisRoom', 'this room') })}
                    confirmLabel={t('darkchat.leave', 'Leave')}
                    cancelLabel={t('darkchat.cancel', 'Cancel')}
                    destructive
                    forceDark
                    onCancel={() => setLeaveId(null)}
                    onConfirm={() => leaveRoom(leaveId)}
                />
            )}
        </div>
    );
}
