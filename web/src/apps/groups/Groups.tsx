import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useDidEnter } from '@/hooks/useDidEnter';
import { NavContext } from '@/hooks/useIosPush';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { t } from '@/i18n';
import {
    acceptInvite, createGroup, declineInvite, disbandGroup,
    leaveGroup, listGroups,
} from './data';
import type { Group, GroupsState, Invite } from './data';
import { PromptDialog } from '@/ui/PromptDialog';
import { GroupDetail } from './GroupDetail';
import { GroupsList } from './GroupsList';

const EMPTY_STATE: GroupsState = { groups: [], invites: [], activeGroupId: null };

export function Groups({ onClose }: { onClose: () => void }) {
    const [state,      setState]      = useState<GroupsState>(EMPTY_STATE);
    const [detail,     setDetail]     = useSessionState<Group | null>('groups:detail', null);
    const [returning,  setReturning]  = useState(false);
    const [showCreate, setShowCreate] = useSessionState('groups:showCreate', false);

    const refresh = useCallback(async () => {
        const next = await listGroups();
        setState(next);
        setDetail(prev => {
            if (!prev) return prev;
            const fresh = next.groups.find(g => g.id === prev.id);
            return fresh ?? null;
        });
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);


    useNuiEvent('sd-phone:groups:inviteReceived', useCallback((invite) => {
        if (!invite) return;
        setState(prev => {
            if (prev.invites.some(i => i.id === invite.id)) return prev;
            return { ...prev, invites: [invite as Invite, ...prev.invites] };
        });
    }, []));

    useNuiEvent('sd-phone:groups:memberJoined', useCallback(() => {
        void refresh();
    }, [refresh]));

    useNuiEvent('sd-phone:groups:memberLeft', useCallback(() => {
        void refresh();
    }, [refresh]));

    useNuiEvent('sd-phone:groups:updated', useCallback(() => {
        void refresh();
    }, [refresh]));

    useNuiEvent('sd-phone:groups:disbanded', useCallback((data) => {
        if (!data) return;
        setState(prev => ({
            ...prev,
            groups:        prev.groups.filter(g => g.id !== data.groupId),
            activeGroupId: prev.activeGroupId === data.groupId ? null : prev.activeGroupId,
        }));
        setDetail(prev => prev && prev.id === data.groupId ? null : prev);
    }, []));

    useNuiEvent('sd-phone:groups:kicked', useCallback((data) => {
        if (!data) return;
        setState(prev => ({
            ...prev,
            groups:        prev.groups.filter(g => g.id !== data.groupId),
            activeGroupId: prev.activeGroupId === data.groupId ? null : prev.activeGroupId,
        }));
        setDetail(prev => prev && prev.id === data.groupId ? null : prev);
    }, []));


    const navValue = useMemo(() => ({ onWillBack: () => setReturning(true) }), []);
    function handleBack()     { setDetail(null); setReturning(false); }

    // No-arg: the ref flips true right after mount, so the first navigation
    // animates. Gating on `detail !== null` broke that - the flag only went true
    // *after* the first detail render, so the first push never animated. A
    // synchronously-restored detail still mounts on the initial render (flag
    // false), so reopening straight into a group correctly does not animate.
    const animateNav = useDidEnter();

    const behind = detail !== null && !returning;
    const parentStyle: CSSProperties = {
        transform:  behind ? 'translateX(-28%)' : 'translateX(0)',
        transition: `transform ${behind ? '0.34s' : '0.28s'} cubic-bezier(0.32,0.72,0,1)`,
    };
    const dimStyle: CSSProperties = {
        opacity:       behind ? 0.14 : 0,
        transition:    `opacity ${behind ? '0.34s' : '0.28s'} cubic-bezier(0.32,0.72,0,1)`,
        pointerEvents: 'none',
    };


    async function handleCreate(name: string) {
        const result = await createGroup(name);
        if (typeof result === 'string') {
            console.warn('[sd-phone:groups] create failed:', result);
            return;
        }
        setState(prev => ({ ...prev, groups: [result, ...prev.groups] }));
        setShowCreate(false);
    }

    async function handleAccept(inv: Invite) {
        const result = await acceptInvite(inv.id);
        if (typeof result === 'string') {
            console.warn('[sd-phone:groups] accept failed:', result);
            return;
        }
        setState(prev => ({
            ...prev,
            groups:  [...prev.groups, result],
            invites: prev.invites.filter(i => i.id !== inv.id),
        }));
    }

    async function handleDecline(id: string) {
        setState(prev => ({ ...prev, invites: prev.invites.filter(i => i.id !== id) }));
        await declineInvite(id);
    }

    async function handleLeave(id: string) {
        const result = await leaveGroup(id);
        if (typeof result === 'string') {
            console.warn('[sd-phone:groups] leave failed:', result);
            return;
        }
        setState(prev => ({
            ...prev,
            groups:        prev.groups.filter(g => g.id !== id),
            activeGroupId: prev.activeGroupId === id ? null : prev.activeGroupId,
        }));
        setDetail(null);
        setReturning(false);
    }

    async function handleDisband(id: string) {
        const result = await disbandGroup(id);
        if (typeof result === 'string') {
            console.warn('[sd-phone:groups] disband failed:', result);
            return;
        }
        setState(prev => ({
            ...prev,
            groups:        prev.groups.filter(g => g.id !== id),
            activeGroupId: prev.activeGroupId === id ? null : prev.activeGroupId,
        }));
        setDetail(null);
        setReturning(false);
    }

    return (
        <div className="absolute inset-0 z-10 overflow-hidden">

            <div className="absolute inset-0" style={parentStyle}>
                <GroupsList
                    groups={state.groups}
                    invites={state.invites}
                    activeGroupId={state.activeGroupId}
                    onSelectGroup={setDetail}
                    onAcceptInvite={handleAccept}
                    onDeclineInvite={handleDecline}
                    onNewGroup={() => setShowCreate(true)}
                />
                <div className="absolute inset-0 bg-black" style={dimStyle} />
            </div>

            {detail && (
                <NavContext.Provider value={navValue}>
                    <GroupDetail
                        group={detail}
                        isActive={state.activeGroupId === detail.id}
                        onBack={handleBack}
                        onLeave={handleLeave}
                        onDisband={handleDisband}
                        onChange={refresh}
                        animateIn={animateNav}
                    />
                </NavContext.Provider>
            )}

            {showCreate && (
                <PromptDialog
                    title={t('groups.newGroupTitle', 'New Group')}
                    message={t('groups.newGroupMessage', 'You can invite members after the group is created.')}
                    label={t('groups.groupName', 'Group Name')}
                    placeholder={t('groups.groupNamePlaceholder', 'Name your group…')}
                    maxLength={40}
                    confirmLabel={t('groups.create', 'Create')}
                    onCancel={() => setShowCreate(false)}
                    onConfirm={name => void handleCreate(name)}
                />
            )}

            <button
                type="button"
                onClick={onClose}
                aria-label={t('groups.closeGroups', 'Close Groups')}
                className="absolute inset-x-0 bottom-0 z-50 h-7 cursor-default"
            />
        </div>
    );
}
