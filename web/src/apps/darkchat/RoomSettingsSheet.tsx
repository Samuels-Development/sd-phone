import { useEffect, useState } from 'react';
import { Bell, UserMinus } from 'lucide-react';

import { apiCall, apiData } from '@/core/api';
import { isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { hashColor } from '@/lib/format';
import { AlertDialog } from '@/ui/AlertDialog';
import { Sheet } from '@/ui/Sheet';
import { Toggle } from '@/ui/Toggle';
import type { Room, RoomMember } from './data';

const PALETTE = ['#5ac8fa', '#34c759', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a', '#ff453a'];

function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    const a = words[0]?.[0] ?? '';
    const b = words[1]?.[0] ?? '';
    return (a + b).toUpperCase() || '#';
}

export function RoomSettingsSheet({ room, nickname, onClose, onLeave, onMemberRemoved }: {
    room:            Room;
    nickname:        string;
    onClose:         () => void;
    onLeave:         () => void;
    onMemberRemoved: () => void;
}) {
    const [loaded,        setLoaded]        = useState(false);
    const [notifications, setNotifications] = useState(false);
    const [isCreator,     setIsCreator]     = useState(false);
    const [members,       setMembers]       = useState<RoomMember[] | null>(null);
    const [confirm,       setConfirm]       = useState<RoomMember | null>(null);

    useEffect(() => {
        if (!isFiveM) {
            setNotifications(false);
            setIsCreator(true);
            setMembers([
                { id: 'me', name: nickname || t('darkchat.you', 'You'), creator: true },
                { id: 'mock-1', name: 'Ghost' },
                { id: 'mock-2', name: 'Raven' },
            ]);
            setLoaded(true);
            return;
        }
        let alive = true;
        apiData<{ notifications: boolean; isCreator: boolean; members?: RoomMember[] }>('sd-phone:darkchat:roomInfo', { roomId: room.id })
            .then(r => {
                if (!alive || !r) return;
                setNotifications(r.notifications);
                setIsCreator(r.isCreator);
                setMembers(r.members ?? null);
                setLoaded(true);
            })
            .catch(() => {});
        return () => { alive = false; };
    }, [room.id, nickname]);

    function toggleNotifications(next: boolean) {
        setNotifications(next);
        if (isFiveM) void apiCall('sd-phone:darkchat:notifications', { roomId: room.id, enabled: next });
    }

    async function removeMember(m: RoomMember) {
        setConfirm(null);
        if (!isFiveM) {
            setMembers(prev => prev?.filter(x => x.id !== m.id) ?? null);
            onMemberRemoved();
            return;
        }
        const res = await apiCall('sd-phone:darkchat:kick', { roomId: room.id, memberId: m.id });
        if (res.success) {
            setMembers(prev => prev?.filter(x => x.id !== m.id) ?? null);
            onMemberRemoved();
        }
    }

    return (
        <Sheet onClose={onClose} fit="content" forceDark durationMs={240} title={t('darkchat.roomSettings', 'Room Settings')} className="bg-[#1c1c1e] text-white">
            {({ close }) => (
                <div className="flex flex-col gap-4 px-4 pt-1">
                    <div className="flex items-center justify-between rounded-[12px] bg-[#2c2c2e] px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <Bell className="h-[20px] w-[20px] shrink-0 text-white/70" strokeWidth={2} />
                            <div className="min-w-0">
                                <p className="text-[16px] font-medium text-white">{t('darkchat.notifications', 'Notifications')}</p>
                                <p className="truncate text-[13px] text-white/45">{t('darkchat.notificationsHint', 'Get a banner for new messages')}</p>
                            </div>
                        </div>
                        <Toggle on={notifications} onChange={toggleNotifications} disabled={!loaded} ariaLabel={t('darkchat.notifications', 'Notifications')} />
                    </div>

                    {isCreator && members && members.length > 0 && (
                        <div>
                            <p className="mb-2 px-1 text-[12px] uppercase tracking-widest text-white/40">{t('darkchat.members', 'Members')}</p>
                            <div className="overflow-hidden rounded-[12px] bg-[#2c2c2e]">
                                {members.map((m, i) => {
                                    const label = m.name || t('darkchat.anonymousMember', 'Anonymous');
                                    return (
                                        <div key={m.id} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                                            <div
                                                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[14px] font-semibold text-white"
                                                style={{ backgroundColor: hashColor(label, PALETTE) }}
                                            >
                                                {initials(label)}
                                            </div>
                                            <span className="min-w-0 flex-1 truncate text-[16px] text-white">{label}</span>
                                            {m.creator ? (
                                                <span className="shrink-0 rounded-md bg-white/10 px-2 py-[3px] text-[11px] font-semibold uppercase tracking-wide text-white/55">{t('darkchat.creatorTag', 'Creator')}</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirm(m)}
                                                    aria-label={t('darkchat.removeMemberAria', 'Remove {name}', { name: label })}
                                                    className="shrink-0 text-ios-red active:opacity-60"
                                                >
                                                    <UserMinus className="h-[22px] w-[22px]" strokeWidth={2} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => { close(); onLeave(); }}
                        className="w-full rounded-[12px] bg-[#2c2c2e] px-4 py-3 text-center text-[17px] font-medium text-ios-red active:opacity-70"
                    >
                        {t('darkchat.leaveRoom', 'Leave Room')}
                    </button>

                    {confirm && (
                        <AlertDialog
                            title={t('darkchat.removeMemberTitle', 'Remove Member?')}
                            message={t('darkchat.removeMemberMessage', '"{name}" will be removed from the room. They can rejoin later with its code.', { name: confirm.name || t('darkchat.anonymousMember', 'Anonymous') })}
                            confirmLabel={t('darkchat.remove', 'Remove')}
                            cancelLabel={t('darkchat.cancel', 'Cancel')}
                            destructive
                            forceDark
                            onCancel={() => setConfirm(null)}
                            onConfirm={() => void removeMember(confirm)}
                        />
                    )}
                </div>
            )}
        </Sheet>
    );
}
