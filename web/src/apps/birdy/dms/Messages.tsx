import { useState } from 'react';
import { ArrowLeft, Mail, PenSquare, Search as SearchIcon } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { SearchBar } from '@/ui/SearchBar';
import { EmptyState } from '@/ui/EmptyState';
import { apiSearch } from '../birdyApi';
import { BG, BLUE, META, PILL, type BirdyAuthor, type BirdyConversation, type BirdyMessage } from '../data';
import { Avatar, VerifiedBadge } from '../ui';

function previewText(m?: BirdyMessage): string {
    if (!m) return '';
    switch (m.kind) {
        case 'image':    return t('birdy.photoPreview', '📷 Photo');
        case 'gif':      return t('birdy.gif', 'GIF');
        case 'money':    return `$${m.amount ?? 0}`;
        case 'voice':    return t('birdy.voiceMessagePreview', '🎤 Voice message');
        case 'location': return t('birdy.locationPreview', '📍 Location');
        default:         return m.body;
    }
}

export function MessagesList({ conversations, onOpen, onOpenProfile, onCompose }: {
    conversations: BirdyConversation[];
    onOpen:        (id: string) => void;
    onOpenProfile: () => void;
    onCompose?:    (handle: string) => void;
}) {
    const [query, setQuery] = useState('');
    const [composing, setComposing] = useState(false);
    const q = query.trim().toLowerCase();
    const filtered = q
        ? conversations.filter(c => c.user.name.toLowerCase().includes(q) || c.user.handle.toLowerCase().includes(q))
        : conversations;

    if (composing && onCompose) {
        return <NewDm onSelect={h => { setComposing(false); onCompose(h); }} onBack={() => setComposing(false)} />;
    }

    return (
        <div className="flex h-full flex-col" style={{ background: BG }}>
            <header className="flex shrink-0 items-center px-4 py-2">
                <button type="button" onClick={onOpenProfile} aria-label={t('birdy.yourProfile', 'Your profile')}><Avatar size={44} /></button>
                <h1 className="flex-1 text-center text-[22px] font-extrabold text-black">{t('birdy.messages', 'Messages')}</h1>
                {onCompose ? (
                    <button type="button" onClick={() => setComposing(true)} aria-label={t('birdy.newMessage', 'New message')} className="flex h-11 w-11 items-center justify-center" style={{ color: BLUE }}>
                        <PenSquare className="h-[24px] w-[24px]" strokeWidth={2} />
                    </button>
                ) : (
                    <div className="w-11" aria-hidden />
                )}
            </header>

            <div className="shrink-0 px-4 pb-2 pt-1">
                <SearchBar
                    value={query}
                    onChange={setQuery}
                    placeholder={t('birdy.searchDirectMessages', 'Search direct messages')}
                    pillClassName="min-w-0 flex-1 gap-2 rounded-[12px] px-3.5 py-[10px]"
                    pillStyle={{ background: PILL }}
                    textClassName="text-[17px] font-medium text-black placeholder:text-black/55"
                    caretColor={BLUE}
                />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {conversations.length === 0 ? (
                    <EmptyState
                        center
                        icon={<Mail className="h-7 w-7" strokeWidth={1.8} />}
                        circleClassName="bg-black/[0.06] text-black/35"
                        title={t('birdy.noMessagesYet', 'No messages yet')}
                        subtitle={t('birdy.messagesEmptySubtitle', 'Your direct messages will show up here.')}
                        subtitleClassName="text-[#536471]"
                    />
                ) : filtered.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-12 text-center">
                        <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-black/[0.06] text-black/35">
                            <SearchIcon className="h-12 w-12" strokeWidth={1.8} />
                        </div>
                        <div className="text-[24px] font-bold text-black">{t('birdy.noResults', 'No results')}</div>
                        <div className="mt-2 text-[17px] leading-snug" style={{ color: '#536471' }}>{t('birdy.noConversationsMatch', 'No conversations match "{query}".', { query: query.trim() })}</div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2 pt-1">
                        {filtered.map(c => {
                            const last   = c.messages[c.messages.length - 1];
                            const unread = (c.unread ?? 0) > 0;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => onOpen(c.id)}
                                    className="flex w-full items-center gap-3.5 px-4 py-[14px] text-left active:bg-black/5"
                                >
                                    <Avatar size={64} src={c.user.avatar} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="truncate text-[21px] font-bold text-black">{c.user.name}</span>
                                            {c.user.verified && <VerifiedBadge size={18} />}
                                            <span className="truncate text-[16px]" style={{ color: META }}>@{c.user.handle}</span>
                                            <span className="ml-auto shrink-0 text-[15px]" style={{ color: META }}>{c.updated}</span>
                                        </div>
                                        <div
                                            className={`mt-0.5 truncate text-[19px] ${unread ? 'font-semibold' : ''}`}
                                            style={{ color: unread ? '#0f1419' : META }}
                                        >
                                            {previewText(last)}
                                        </div>
                                    </div>
                                    {unread && <span className="ml-1 shrink-0 h-[11px] w-[11px] rounded-full" style={{ background: BLUE }} aria-label={t('birdy.unread', 'Unread')} />}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function NewDm({ onSelect, onBack }: { onSelect: (handle: string) => void; onBack: () => void }) {
    const [query, setQuery] = useState('');
    const { data } = useAsyncData<BirdyAuthor[]>(() => apiSearch(query), [query]);
    const users = data ?? [];

    return (
        <div className="flex h-full flex-col" style={{ background: BG }}>
            <header className="flex shrink-0 items-center px-2 py-2">
                <button type="button" onClick={onBack} aria-label={t('birdy.back', 'Back')} className="flex h-11 w-11 items-center justify-center text-black active:opacity-60">
                    <ArrowLeft className="h-6 w-6" strokeWidth={2.2} />
                </button>
                <h1 className="flex-1 text-center text-[22px] font-extrabold text-black">{t('birdy.newMessage', 'New message')}</h1>
                <div className="w-11" aria-hidden />
            </header>

            <div className="shrink-0 px-4 pb-2 pt-1">
                <SearchBar
                    value={query}
                    onChange={setQuery}
                    placeholder={t('birdy.searchPeople', 'Search people')}
                    pillClassName="min-w-0 flex-1 gap-2 rounded-[12px] px-3.5 py-[10px]"
                    pillStyle={{ background: PILL }}
                    textClassName="text-[17px] font-medium text-black placeholder:text-black/55"
                    caretColor={BLUE}
                />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {users.map(u => (
                    <button key={u.handle} type="button" onClick={() => onSelect(u.handle)} className="flex w-full items-center gap-3.5 px-4 py-3 text-left active:bg-black/5">
                        <Avatar size={48} src={u.avatar} />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                                <span className="truncate text-[18px] font-bold text-black">{u.name}</span>
                                {u.verified && <VerifiedBadge size={16} />}
                            </div>
                            <div className="truncate text-[15px]" style={{ color: META }}>@{u.handle}</div>
                        </div>
                    </button>
                ))}
                {query.trim() !== '' && users.length === 0 && (
                    <div className="px-4 pt-10 text-center text-[15px]" style={{ color: META }}>{t('birdy.noResults', 'No results')}</div>
                )}
            </div>
        </div>
    );
}
