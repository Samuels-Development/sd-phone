import { useMemo, useState } from 'react';
import { ChevronRight, SquarePen, Users } from 'lucide-react';

import { EmptyState } from '@/ui/EmptyState';
import { SearchBar } from '@/ui/SearchBar';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { t } from '@/i18n';
import { initialsFor } from './data';
import type { Group, Invite } from './data';
import { Pill } from '@/ui/Pill';

interface Props {
    groups:          Group[];
    invites:         Invite[];
    activeGroupId:   string | null;
    onSelectGroup:   (g: Group) => void;
    onAcceptInvite:  (inv: Invite) => void;
    onDeclineInvite: (id: string) => void;
    onNewGroup:      () => void;
}

type Tab = 'groups' | 'invites';

export function GroupsList({
    groups, invites, activeGroupId,
    onSelectGroup, onAcceptInvite, onDeclineInvite, onNewGroup,
}: Props) {
    const [tab,   setTab]   = useState<Tab>('groups');
    const [query, setQuery] = useState('');

    const orderedGroups = useMemo(() => {
        if (!activeGroupId) return groups;
        const active = groups.find(g => g.id === activeGroupId);
        if (!active) return groups;
        return [active, ...groups.filter(g => g.id !== activeGroupId)];
    }, [groups, activeGroupId]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q ? orderedGroups.filter(g => g.name.toLowerCase().includes(q)) : orderedGroups;
    }, [orderedGroups, query]);

    return (
        <div className="absolute inset-0 flex flex-col bg-base text-black dark:text-white">

            <div className="h-[54px] shrink-0" aria-hidden />

            <div className="flex items-center justify-between px-5 pb-2 pt-0.5">
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">{t('groups.groups', 'Groups')}</h1>
                <button
                    type="button"
                    onClick={onNewGroup}
                    aria-label={t('groups.newGroup', 'New group')}
                    className="text-ios-blue active:opacity-60"
                >
                    <SquarePen className="h-[24px] w-[24px]" strokeWidth={2} />
                </button>
            </div>

            <div className="mx-4 mt-1 mb-2">
                <SegmentedControl
                    value={tab}
                    onChange={next => { setTab(next); if (next === 'groups') setQuery(''); }}
                    options={[
                        { value: 'groups',  label: t('groups.myGroups', 'My Groups') },
                        { value: 'invites', label: t('groups.invites', 'Invites'), badge: invites.length },
                    ]}
                />
            </div>

            {tab === 'groups' && (
                <SearchBar value={query} onChange={setQuery} className="mx-4 mb-2" />
            )}

            <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                <div key={tab} className="animate-swipe-in-left">
                {tab === 'groups' ? (
                    filtered.length === 0 ? (
                        <EmptyState
                            icon={Users}
                            title={query ? t('groups.noMatches', 'No Matches') : t('groups.noGroupsYet', 'No Groups Yet')}
                            subtitle={query
                                ? t('groups.noMatchesSub', 'Try a different search term.')
                                : t('groups.noGroupsSub', 'Tap the compose icon to create your first group.')}
                        />
                    ) : (
                        <div className="px-4">
                            <div className="px-1 pb-2 pt-5 text-[22px] font-bold tracking-tight text-black dark:text-white">
                                {query ? t('groups.resultsCount', 'Results — {count}', { count: filtered.length }) : t('groups.myGroupsCount', 'My Groups — {count}', { count: groups.length })}
                            </div>

                            <div className="overflow-hidden rounded-[10px] bg-surface">
                                {filtered.map((g, i) => (
                                    <div key={g.id}>
                                        <button
                                            type="button"
                                            onClick={() => onSelectGroup(g)}
                                            className="flex w-full items-center gap-3.5 px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                                        >
                                            {g.avatar ? (
                                                <img
                                                    src={g.avatar}
                                                    alt=""
                                                    draggable={false}
                                                    className="h-[58px] w-[58px] shrink-0 rounded-[15px] object-cover shadow-sm"
                                                />
                                            ) : (
                                                <div
                                                    className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[15px] text-[18px] font-bold text-white shadow-sm"
                                                    style={{ background: g.color }}
                                                >
                                                    {initialsFor(g.name)}
                                                </div>
                                            )}

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    <span className="truncate text-[20px] font-semibold leading-snug">
                                                        {g.name}
                                                    </span>
                                                    {g.id === activeGroupId && <Pill>{t('groups.active', 'Active')}</Pill>}
                                                </div>
                                                <div className="mt-0.5 text-[16px] leading-snug text-ios-gray">
                                                    {g.leaderId === 'local' ? t('groups.you', 'You') : g.leaderName}
                                                    {' · '}
                                                    {g.members.length === 1
                                                        ? t('groups.oneMember', '1 member')
                                                        : t('groups.memberCount', '{n} members', { n: g.members.length })}
                                                    {g.onlineCount > 0 && (
                                                        <>
                                                            {' · '}
                                                            <span className="text-[#34c759] font-medium">
                                                                {g.onlineCount} {t('groups.online', 'online')}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            <ChevronRight
                                                className="h-[19px] w-[19px] shrink-0 text-ios-gray3"
                                                strokeWidth={2.5}
                                            />
                                        </button>

                                        {i < filtered.length - 1 && (
                                            <div
                                                className="pointer-events-none bg-ios-gray4 dark:bg-control"
                                                style={{ height: '0.5px' }}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                ) : (
                    invites.length === 0 ? (
                        <EmptyState
                            icon={Users}
                            title={t('groups.noPendingInvites', 'No Pending Invites')}
                            subtitle={t('groups.noInvitesSub', 'When someone invites you to a group it will appear here.')}
                        />
                    ) : (
                        <div className="px-4">
                            <div className="px-1 pb-2 pt-5 text-[22px] font-bold tracking-tight text-black dark:text-white">
                                {t('groups.pendingCount', 'Pending — {count}', { count: invites.length })}
                            </div>

                            <div className="overflow-hidden rounded-[10px] bg-surface">
                                {invites.map((inv, i) => (
                                    <div key={inv.id}>
                                        <div className="flex items-start gap-3.5 px-4 py-4">
                                            {inv.avatar ? (
                                                <img
                                                    src={inv.avatar}
                                                    alt=""
                                                    draggable={false}
                                                    className="mt-0.5 h-[58px] w-[58px] shrink-0 rounded-[15px] object-cover shadow-sm"
                                                />
                                            ) : (
                                                <div
                                                    className="mt-0.5 flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[15px] text-[18px] font-bold text-white shadow-sm"
                                                    style={{ background: inv.color }}
                                                >
                                                    {initialsFor(inv.groupName)}
                                                </div>
                                            )}

                                            <div className="flex-1 min-w-0">
                                                <div className="truncate text-[20px] font-semibold leading-snug">
                                                    {inv.groupName}
                                                </div>
                                                <div className="mt-0.5 text-[16px] leading-snug text-ios-gray">
                                                    {t('groups.invitedBy', 'Invited by {name}', { name: inv.invitedBy })}
                                                    {' · '}
                                                    {inv.memberCount === 1
                                                        ? t('groups.oneMember', '1 member')
                                                        : t('groups.memberCount', '{n} members', { n: inv.memberCount })}
                                                </div>
                                                <div className="mt-3 flex gap-2.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => onAcceptInvite(inv)}
                                                        className="flex-1 rounded-[11px] bg-ios-blue px-4 py-[11px] text-center text-[16px] font-semibold text-white active:opacity-70"
                                                    >
                                                        {t('groups.accept', 'Accept')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => onDeclineInvite(inv.id)}
                                                        className="flex-1 rounded-[11px] bg-black/[0.07] dark:bg-white/[0.12] px-4 py-[11px] text-center text-[16px] font-semibold text-ios-blue active:opacity-70"
                                                    >
                                                        {t('groups.decline', 'Decline')}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {i < invites.length - 1 && (
                                            <div
                                                className="pointer-events-none bg-ios-gray4 dark:bg-control"
                                                style={{ height: '0.5px' }}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                )}
                </div>
            </div>
        </div>
    );
}
