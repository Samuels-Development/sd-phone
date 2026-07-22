import { useMemo, useState } from 'react';
import { ChevronRight, MessageCircle, SearchX, SquarePen } from 'lucide-react';

import { EmptyState } from '@/ui/EmptyState';

import {
    convName, convPreview, fmtConvTime, hasUnread,
    type Contact, type Conversation,
} from '@/shared/chat/data';
import { ContactAvatar, GroupAvatar } from '@/shared/ContactAvatar';
import { useSessionState } from '@/hooks/useSessionState';
import { SearchBar } from '@/ui/SearchBar';
import { AlertDialog } from '@/ui/AlertDialog';
import { PromptDialog } from '@/ui/PromptDialog';
import { t } from '@/i18n';

interface ConversationListProps {
    conversations: Conversation[];
    onOpen:        (id: string) => void;
    onCompose:     () => void;
    onMarkRead:    (ids: string[]) => void;
    onDelete:      (ids: string[]) => void;
    onCreateGroup: (members: Contact[], name: string) => void;
}

export function ConversationList({ conversations, onOpen, onCompose, onMarkRead, onDelete, onCreateGroup }: ConversationListProps) {
    const [query,    setQuery]    = useSessionState('messages:listQuery', '');
    const [editing,  setEditing]  = useState(false);
    const [barExiting, setBarExiting] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [naming, setNaming] = useState(false);

    const groupMembers = useMemo(() => {
        const byKey = new Map<string, Contact>();
        for (const c of conversations) {
            if (!selected.has(c.id) || c.groupName) continue;
            for (const p of c.participants) {
                if (p.id === 'me') continue;
                const key = (p.phone ?? p.id).replace(/\D/g, '') || p.id;
                if (!byKey.has(key)) byKey.set(key, p);
            }
        }
        return [...byKey.values()];
    }, [conversations, selected]);

    const canGroup = groupMembers.length >= 2;

    const filtered = conversations
        .filter(c => c.groupName || c.messages.length > 0)
        .filter(c => !query || convName(c).toLowerCase().includes(query.toLowerCase()));

    function leaveEditing() {
        setSelected(new Set());
        setEditing(false);
        setBarExiting(true);
    }

    function toggleEditing() {
        if (editing) { leaveEditing(); return; }
        setSelected(new Set());
        setBarExiting(false);
        setEditing(true);
    }

    function toggleSelect(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function applyMarkRead() {
        if (selected.size === 0) return;
        onMarkRead([...selected]);
        setSelected(new Set());
    }

    function applyDelete() {
        if (selected.size === 0) return;
        setConfirmDelete(true);
    }

    function confirmDeleteNow() {
        onDelete([...selected]);
        setSelected(new Set());
        setConfirmDelete(false);
    }

    return (
        <div className="flex flex-1 flex-col bg-[#d4d4d4] dark:bg-base overflow-hidden">
            <div className="h-[54px] shrink-0" aria-hidden />

            <div className="flex items-center justify-between px-5 pb-0.5">
                <button type="button" onClick={toggleEditing} className="text-[17px] text-ios-blue active:opacity-60">
                    {editing ? t('messages.done', 'Done') : t('messages.edit', 'Edit')}
                </button>
                <button type="button" onClick={onCompose} className="text-ios-blue active:opacity-60">
                    <SquarePen className="h-[22px] w-[22px]" strokeWidth={2} />
                </button>
            </div>

            <div className="px-5 pb-2 pt-0.5 text-[34px] font-bold tracking-tight text-black dark:text-white">
                {t('messages.title', 'Messages')}
            </div>

            <SearchBar value={query} onChange={setQuery} className="mx-4 mb-4" />

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10">
                {filtered.length === 0 ? (
                    query
                        ? <EmptyState icon={SearchX} title={t('messages.noResults', 'No Results')} subtitle={t('messages.noResultsSubtitle', 'No conversations match your search.')} />
                        : <EmptyState icon={MessageCircle} title={t('messages.noConversations', 'No Conversations')} subtitle={t('messages.noConversationsSubtitle', 'Tap the compose button to start a new message.')} />
                ) : (
                    <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                        {filtered.map((c, i) => (
                            <div key={c.id}>
                                <ConvRow
                                    conv={c}
                                    editing={editing}
                                    selected={selected.has(c.id)}
                                    onOpen={onOpen}
                                    onToggleSelect={toggleSelect}
                                />
                                {i < filtered.length - 1 && (
                                    <div className="pointer-events-none mx-[6%] h-[0.5px] bg-black/15 dark:bg-white/15" />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {(editing || barExiting) && (
                <div
                    onAnimationEnd={e => { if (e.animationName === 'ios-sheet-down') setBarExiting(false); }}
                    className="flex shrink-0 items-center justify-between border-t border-black/10 bg-[#d4d4d4] px-7 pb-9 pt-3.5 dark:border-white/10 dark:bg-base"
                    style={{ animation: barExiting
                        ? 'ios-sheet-down 0.26s cubic-bezier(0.32,0,0.68,1) forwards'
                        : 'ios-sheet-up 0.3s cubic-bezier(0.32,0.72,0,1)' }}
                >
                    <button
                        type="button"
                        onClick={applyMarkRead}
                        className="text-[17px] text-black/60 active:opacity-60 dark:text-white/60"
                    >
                        {t('messages.markRead', 'Read')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setNaming(true)}
                        disabled={!canGroup}
                        className={`text-[17px] font-medium active:opacity-60 ${
                            canGroup ? 'text-ios-blue' : 'text-black/30 dark:text-white/30'
                        }`}
                    >
                        {t('messages.newGroup', 'New Group')}
                    </button>
                    <button
                        type="button"
                        onClick={applyDelete}
                        className="text-[17px] text-ios-blue active:opacity-60"
                    >
                        {t('common.delete', 'Delete')}
                    </button>
                </div>
            )}

            {naming && (
                <PromptDialog
                    title={t('messages.newGroup', 'New Group')}
                    message={t('messages.newGroupMessage', 'Choose a name for this group.')}
                    placeholder={t('messages.groupNamePlaceholder', 'Group Name')}
                    initialValue={groupMembers.map(c => c.name.split(' ')[0]).join(', ')}
                    confirmLabel={t('messages.create', 'Create')}
                    maxLength={40}
                    onCancel={() => setNaming(false)}
                    onConfirm={name => {
                        onCreateGroup(groupMembers, name);
                        setNaming(false);
                        leaveEditing();
                    }}
                />
            )}

            {confirmDelete && (
                <AlertDialog
                    title={selected.size === 1
                        ? t('messages.deleteConversationTitle', 'Delete Conversation')
                        : t('messages.deleteConversationsTitle', 'Delete Conversations')}
                    message={selected.size === 1
                        ? t('messages.deleteConversationConfirm', 'Do you want to delete this conversation?')
                        : t('messages.deleteConversationsConfirm', 'Do you want to delete these {count} conversations?', { count: selected.size })}
                    confirmLabel={t('common.delete', 'Delete')}
                    destructive
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={confirmDeleteNow}
                />
            )}
        </div>
    );
}

function ConvRow({ conv, editing, selected, onOpen, onToggleSelect }: {
    conv:           Conversation;
    editing:        boolean;
    selected:       boolean;
    onOpen:         (id: string) => void;
    onToggleSelect: (id: string) => void;
}) {
    const name    = convName(conv);
    const preview = convPreview(conv);
    const last    = conv.messages[conv.messages.length - 1];
    const time    = last ? fmtConvTime(last.ts) : '';
    const unread  = hasUnread(conv);

    return (
        <button
            type="button"
            onClick={() => (editing ? onToggleSelect(conv.id) : onOpen(conv.id))}
            className="flex w-full items-center px-4 py-[16px] text-left active:bg-black/5 dark:active:bg-white/5"
        >
            <div
                className="flex shrink-0 items-center overflow-hidden"
                style={{
                    width:      editing ? 34 : 0,
                    opacity:    editing ? 1 : 0,
                    transition: 'width 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.3s cubic-bezier(0.32,0.72,0,1)',
                }}
                aria-hidden={!editing}
            >
                <div
                    style={{
                        transform:  editing ? 'translateX(0)' : 'translateX(-16px)',
                        transition: 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
                    }}
                >
                    <div
                        className={`flex h-[24px] w-[24px] items-center justify-center rounded-full border-[1.5px] transition-colors duration-200 ${
                            selected
                                ? 'border-ios-blue bg-ios-blue'
                                : 'border-black/25 bg-transparent dark:border-white/30'
                        }`}
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="h-[24px] w-[24px]"
                            fill="none"
                            aria-hidden
                            style={{
                                transform:  selected ? 'scale(1)' : 'scale(0)',
                                transition: 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)',
                            }}
                        >
                            <path d="M6.2 12.5l3.6 3.6L17.8 7.8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                </div>
            </div>

            <div className="w-[14px] shrink-0 flex items-center justify-center mr-1">
                {unread && <span className="h-[11px] w-[11px] rounded-full bg-ios-blue" />}
            </div>

            {conv.groupName
                ? <GroupAvatar contacts={conv.participants} size={56} avatar={conv.groupAvatar} />
                : <ContactAvatar contact={conv.participants[0]} size={56} />
            }

            <div className="ml-3 min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                    <span className={`truncate text-[19px] text-black dark:text-white ${unread ? 'font-semibold' : 'font-normal'}`}>
                        {name}
                    </span>
                    <div className="flex items-center gap-[3px] shrink-0">
                        <span className="text-[15px] text-black/45 dark:text-white/45">{time}</span>
                        <ChevronRight className="h-[18px] w-[18px] text-black/28 dark:text-white/28" strokeWidth={2.5} />
                    </div>
                </div>
                <span className={`line-clamp-2 text-[17px] leading-snug mt-[1px] ${unread ? 'text-black/75 dark:text-white/80' : 'text-black/60 dark:text-white/65'}`}>
                    {preview}
                </span>
            </div>
        </button>
    );
}
