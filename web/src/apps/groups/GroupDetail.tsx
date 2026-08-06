import { useEffect, useState } from 'react';
import { Camera, ChevronLeft, UserPlus } from 'lucide-react';

import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { PromptDialog } from '@/ui/PromptDialog';
import { Toggle } from '@/ui/Toggle';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import {
    colorFor, initialsFor, inviteMember, kickMember as kickMemberApi, setActiveGroup,
    setGroupAvatar,
} from './data';
import type { Group } from './data';

interface Props {
    group:         Group;
    isActive:      boolean;
    onBack:        () => void;
    onLeave:       (id: string) => void;
    onDisband:     (id: string) => void;
    onChange:      () => void;
    animateIn?:    boolean;
}

export function GroupDetail({
    group, isActive, onBack, onLeave, onDisband, onChange, animateIn = true,
}: Props) {
    const { goBack, pageStyle } = useIosPush(onBack, animateIn);

    const isLeader = group.leaderId === 'local';
    const members  = group.members;
    const [showInvite,         setShowInvite]         = useState(false);
    const [pickingPhoto,       setPickingPhoto]       = useState(false);
    const [confirmDisband,     setConfirmDisband]     = useState(false);
    const [confirmLeave,       setConfirmLeave]       = useState(false);
    const [confirmKick,        setConfirmKick]        = useState<{ id: string; name: string } | null>(null);
    const [busy,               setBusy]               = useState(false);

    async function handleKick(id: string) {
        setBusy(true);
        const result = await kickMemberApi(group.id, id);
        setBusy(false);
        if (result !== true) {
            console.warn('[sd-phone:groups] kick failed:', result);
            return;
        }
        onChange();
    }

    async function handlePickPhoto(url: string) {
        setPickingPhoto(false);
        setBusy(true);
        const result = await setGroupAvatar(group.id, url);
        setBusy(false);
        if (result !== true) {
            console.warn('[sd-phone:groups] setAvatar failed:', result);
            return;
        }
        onChange();
    }

    const [pendingActive, setPendingActive] = useState<boolean | null>(null);
    const shownActive = pendingActive ?? isActive;

    useEffect(() => { setPendingActive(null); }, [isActive]);

    async function handleToggleActive() {
        const next = !shownActive;
        setPendingActive(next);
        setBusy(true);
        const result = await setActiveGroup(next ? group.id : null);
        setBusy(false);
        if (result !== true) {
            setPendingActive(null);
            console.warn('[sd-phone:groups] setActive failed:', result);
            return;
        }
        onChange();
    }

    return (
        <div
            className="absolute inset-0 z-10 flex flex-col bg-base text-black dark:text-white"
            style={pageStyle}
        >
            <div className="h-11 shrink-0" aria-hidden />

            <div className="flex items-center justify-between px-3 py-2">
                <button
                    type="button"
                    onClick={goBack}
                    className="flex items-center text-ios-blue active:opacity-60"
                >
                    <ChevronLeft className="h-[28px] w-[28px]" strokeWidth={2.4} />
                    <span className="-ml-0.5 text-[18px]">{t('groups.groups', 'Groups')}</span>
                </button>

                {isLeader && (
                    <button
                        type="button"
                        onClick={() => setShowInvite(true)}
                        aria-label={t('groups.inviteMember', 'Invite member')}
                        className="px-1 text-ios-blue active:opacity-60"
                    >
                        <UserPlus className="h-[24px] w-[24px]" strokeWidth={2} />
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-10">

                <div className="flex flex-col items-center gap-2 px-6 pb-2 pt-7">
                    <button
                        type="button"
                        onClick={() => isLeader && setPickingPhoto(true)}
                        disabled={!isLeader || busy}
                        aria-label={isLeader ? t('groups.changeGroupPhoto', 'Change group photo') : undefined}
                        className={`relative ${isLeader ? 'active:opacity-80' : 'cursor-default'}`}
                    >
                        {group.avatar ? (
                            <img
                                src={group.avatar}
                                alt=""
                                draggable={false}
                                className="h-[100px] w-[100px] rounded-[24px] object-cover"
                                style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.22)' }}
                            />
                        ) : (
                            <div
                                className="flex h-[100px] w-[100px] items-center justify-center rounded-[24px] text-[34px] font-bold text-white"
                                style={{
                                    background:  group.color,
                                    boxShadow:   '0 4px 16px rgba(0,0,0,0.22)',
                                }}
                            >
                                {initialsFor(group.name)}
                            </div>
                        )}
                        {isLeader && (
                            <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-base bg-ios-blue">
                                <Camera className="h-[17px] w-[17px] text-white" strokeWidth={2} />
                            </span>
                        )}
                    </button>
                    <div className="mt-1 text-[22px] font-bold tracking-tight text-center">
                        {group.name}
                    </div>
                    <div className="text-[17px] text-ios-gray">
                        {isLeader ? t('groups.you', 'You') : group.leaderName}
                        {' · '}
                        {members.length} {t('groups.member', 'member')}{members.length !== 1 ? 's' : ''}
                        {group.onlineCount > 0 && (
                            <>
                                {' · '}
                                <span className="text-[#34c759] font-medium">
                                    {group.onlineCount} {t('groups.online', 'online')}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                <div className="px-4 pt-6">
                    <p className="mb-1.5 px-1 text-[13px] font-normal uppercase tracking-wider text-ios-gray">
                        {t('groups.activeGroup', 'Active Group')}
                    </p>
                    <div className="overflow-hidden rounded-[10px] bg-surface">
                        <button
                            type="button"
                            onClick={() => void handleToggleActive()}
                            disabled={busy}
                            className="flex w-full items-center px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                        >
                            <span className="flex-1 text-[18px] font-normal">
                                {shownActive ? t('groups.currentlyActive', 'Currently Active') : t('groups.setAsActive', 'Set as Active')}
                            </span>
                            <div className="pointer-events-none">
                                <Toggle on={shownActive} scale={0.9} />
                            </div>
                        </button>
                    </div>
                    <p className="mt-2 px-1 text-[14px] font-medium text-ios-gray">
                        {t('groups.activeGroupHint', "Other scripts use your active group to know which crew you're currently running with.")}
                    </p>
                </div>

                <div className="px-4 pt-6">
                    <p className="mb-1.5 px-1 text-[13px] font-normal uppercase tracking-wider text-ios-gray">
                        {t('groups.members', 'Members')}
                    </p>
                    <div className="overflow-hidden rounded-[10px] bg-surface">
                        {members.map((m, i) => {
                            const isMe     = m.id === 'local';
                            const isRowLdr = m.id === group.leaderId;
                            const canKick  = isLeader && !isMe && !isRowLdr;

                            return (
                                <div key={m.id}>
                                    <div className="relative flex items-center gap-3.5 px-4 py-3">
                                        <div className="relative shrink-0">
                                            <div
                                                className="flex h-12 w-12 items-center justify-center rounded-full text-[17px] font-semibold text-white"
                                                style={{ background: colorFor(m.id) }}
                                            >
                                                {initialsFor(isMe ? 'Me' : m.name)}
                                            </div>
                                            {m.online && (
                                                <span
                                                    className="absolute -bottom-[1px] -right-[1px] h-[12px] w-[12px] rounded-full border-[2px] border-surface"
                                                    style={{ background: '#34c759' }}
                                                />
                                            )}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="truncate text-[19px] font-normal leading-snug">
                                                {isMe ? t('groups.nameYou', '{name} (You)', { name: m.name }) : m.name}
                                            </div>
                                            <div className="mt-[2px] flex items-center gap-1.5 text-[14px] font-semibold uppercase tracking-wider">
                                                {isRowLdr && (
                                                    <span className="text-ios-gray">{t('groups.leader', 'Leader')}</span>
                                                )}
                                                {isRowLdr && <span className="text-ios-gray3">·</span>}
                                                <span className={m.online ? 'text-[#34c759]' : 'text-ios-gray'}>
                                                    {m.online ? t('groups.statusOnline', 'Online') : t('groups.statusOffline', 'Offline')}
                                                </span>
                                            </div>
                                        </div>

                                        {canKick && (
                                            <button
                                                type="button"
                                                onClick={() => setConfirmKick({ id: m.id, name: m.name })}
                                                disabled={busy}
                                                className="text-[16px] font-semibold text-ios-red active:opacity-60 disabled:opacity-40"
                                            >
                                                {t('groups.remove', 'Remove')}
                                            </button>
                                        )}
                                    </div>

                                    {i < members.length - 1 && (
                                        <div
                                            className="pointer-events-none bg-ios-gray4 dark:bg-control"
                                            style={{ height: '0.5px' }}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="px-4 pt-6">
                    <p className="mb-1.5 px-1 text-[13px] font-normal uppercase tracking-wider text-ios-gray">
                        {t('groups.actions', 'Actions')}
                    </p>
                    <div className="overflow-hidden rounded-[10px] bg-surface">
                        <button
                            type="button"
                            onClick={() =>
                                isLeader ? setConfirmDisband(true) : setConfirmLeave(true)
                            }
                            className="flex w-full items-center justify-center px-4 py-3.5 text-[18px] font-normal text-ios-red active:bg-black/5 dark:active:bg-white/5"
                        >
                            {isLeader ? t('groups.disbandGroup', 'Disband Group') : t('groups.leaveGroup', 'Leave Group')}
                        </button>
                    </div>
                    <p className="mt-2 px-1 text-[14px] font-medium text-ios-gray">
                        {isLeader
                            ? t('groups.disbandHint', 'Disbanding will remove this group for all members.')
                            : t('groups.rejoinHint', 'You can rejoin if invited again.')}
                    </p>
                </div>

            </div>


            {pickingPhoto && (
                <MediaPickerSheet
                    onSelect={p => void handlePickPhoto(p.url)}
                    onClose={() => setPickingPhoto(false)}
                />
            )}

            {showInvite && (
                <PromptDialog
                    title={t('groups.addMember', 'Add Member')}
                    message={t('groups.addMemberHint', "Find a player's ID in the server's player list.")}
                    label={t('groups.playerId', 'Player ID')}
                    placeholder={t('groups.playerIdPlaceholder', 'Enter a player ID…')}
                    inputMode="numeric"
                    maxLength={5}
                    sanitize={v => v.replace(/\D/g, '')}
                    confirmLabel={t('groups.invite', 'Invite')}
                    cancelLabel={t('groups.cancel', 'Cancel')}
                    validate={v => (Number.isFinite(Number.parseInt(v, 10)) ? null : t('groups.enterNumericId', 'Enter a numeric player ID.'))}
                    onCancel={() => setShowInvite(false)}
                    onConfirm={async v => {
                        const parsed = Number.parseInt(v, 10);
                        const result = await inviteMember(group.id, parsed);
                        if (result !== true) return result;
                        onChange();
                        return null;
                    }}
                />
            )}

            {confirmDisband && (
                <AlertDialog
                    title={t('groups.disbandGroupTitle', 'Disband Group?')}
                    message={t('groups.disbandGroupMessage', 'This will permanently remove "{name}" for every member. This can\'t be undone.', { name: group.name })}
                    confirmLabel={t('groups.disband', 'Disband')}
                    destructive
                    onCancel={() => setConfirmDisband(false)}
                    onConfirm={() => { setConfirmDisband(false); onDisband(group.id); }}
                />
            )}

            {confirmLeave && (
                <AlertDialog
                    title={t('groups.leaveGroupTitle', 'Leave Group?')}
                    message={t('groups.leaveGroupMessage', 'Leave "{name}"? You can rejoin if you\'re invited again.', { name: group.name })}
                    confirmLabel={t('groups.leave', 'Leave')}
                    destructive
                    onCancel={() => setConfirmLeave(false)}
                    onConfirm={() => { setConfirmLeave(false); onLeave(group.id); }}
                />
            )}

            {confirmKick && (
                <AlertDialog
                    title={t('groups.removeMemberTitle', 'Remove Member?')}
                    message={t('groups.removeMemberMessage', 'Remove {name} from the group?', { name: confirmKick.name })}
                    confirmLabel={t('groups.remove', 'Remove')}
                    destructive
                    onCancel={() => setConfirmKick(null)}
                    onConfirm={() => {
                        const id = confirmKick.id;
                        setConfirmKick(null);
                        void handleKick(id);
                    }}
                />
            )}
        </div>
    );
}
