import { type ReactNode } from 'react';
import { ChevronRight, KeyRound, Lock, Plus, UserRound, Users } from 'lucide-react';

import { useSessionState } from '@/hooks/useSessionState';
import { t } from '@/i18n';
import { SearchBar } from '@/ui/SearchBar';
import { type Room } from './data';

export function RoomsList({ publicRooms, privateRooms, nickname, onOpenRoom, onCreate, onJoin, onEditNickname }: {
    publicRooms:    Room[];
    privateRooms:   Room[];
    nickname:       string;
    onOpenRoom:     (id: string) => void;
    onCreate:       () => void;
    onJoin:         () => void;
    onEditNickname: () => void;
}) {
    const [query, setQuery] = useSessionState('darkchat:roomsQuery', '');
    const q = query.trim().toLowerCase();
    const match = (r: Room) => !q || r.name.toLowerCase().includes(q) || r.topic.toLowerCase().includes(q);
    const filteredPrivate = privateRooms.filter(match);
    const filteredPublic  = publicRooms.filter(match);
    const noMatches = q.length > 0 && filteredPrivate.length === 0 && filteredPublic.length === 0;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-5 pb-1 pt-1">
                <h1 className="text-[28px] font-bold tracking-tight text-white">{t('darkchat.title', 'Dark Chat')}</h1>
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        aria-label={nickname ? t('darkchat.nicknameAria', 'Nickname: {nickname}', { nickname }) : t('darkchat.setNickname', 'Set nickname')}
                        onClick={onEditNickname}
                        className="text-ios-blue active:opacity-60"
                    >
                        <UserRound className="h-[23px] w-[23px]" strokeWidth={2} />
                    </button>
                    <button type="button" aria-label={t('darkchat.joinWithCode', 'Join with code')} onClick={onJoin} className="text-ios-blue active:opacity-60">
                        <KeyRound className="h-[22px] w-[22px]" strokeWidth={2} />
                    </button>
                    <button type="button" aria-label={t('darkchat.createRoom', 'Create room')} onClick={onCreate} className="text-ios-blue active:opacity-60">
                        <Plus className="h-[27px] w-[27px]" strokeWidth={2.2} />
                    </button>
                </div>
            </div>

            <SearchBar forceDark value={query} onChange={setQuery} placeholder={t('darkchat.searchRooms', 'Search rooms')} className="mx-4 mb-2 mt-2" />

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-6 pt-2">
                {filteredPrivate.length > 0 && (
                    <>
                        <SectionLabel>{t('darkchat.yourRooms', 'Your Rooms')}</SectionLabel>
                        <div className="mb-5 flex flex-col gap-2.5">
                            {filteredPrivate.map(r => <RoomRow key={r.id} room={r} onOpen={() => onOpenRoom(r.id)} />)}
                        </div>
                    </>
                )}

                {(filteredPublic.length > 0 || !q) && (
                    <>
                        <SectionLabel>{t('darkchat.publicRooms', 'Public Rooms')}</SectionLabel>
                        <div className="flex flex-col gap-2.5">
                            {filteredPublic.map(r => <RoomRow key={r.id} room={r} onOpen={() => onOpenRoom(r.id)} />)}
                        </div>
                    </>
                )}

                {noMatches && (
                    <div className="px-1 pt-10 text-center text-[15px] text-white/35">{t('darkchat.noRoomsFound', 'No rooms found')}</div>
                )}
            </div>
        </div>
    );
}

function SectionLabel({ children }: { children: ReactNode }) {
    return <div className="px-1 pb-2 text-[13px] font-semibold uppercase tracking-wider text-white/35">{children}</div>;
}

function RoomRow({ room, onOpen }: { room: Room; onOpen: () => void }) {
    return (
        <button type="button" onClick={onOpen} className="flex items-center gap-3.5 rounded-[14px] bg-[#1c1c1e] px-3.5 py-3 text-left active:bg-[#262629]">
            <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[#2c2c2e]">
                {room.isPrivate
                    ? <Lock  className="h-[22px] w-[22px] text-white/70" strokeWidth={2} />
                    : <Users className="h-[24px] w-[24px] text-white/70" strokeWidth={2} />}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-[19px] font-semibold text-white">{room.name}</span>
                    {room.isPrivate && room.code && (
                        <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-[4px] text-[11px] font-semibold leading-none tracking-wider text-white/55">{room.code}</span>
                    )}
                </div>
                <p className="truncate text-[15px] text-white/45">{room.topic}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 text-white/35">
                <Users className="h-[14px] w-[14px]" strokeWidth={2.2} />
                <span className="text-[13px]">{room.members}</span>
                <ChevronRight className="ml-0.5 h-[20px] w-[20px] text-white/25" strokeWidth={2} />
            </div>
        </button>
    );
}
