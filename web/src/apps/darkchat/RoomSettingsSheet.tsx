import { useEffect, useRef, useState } from 'react';
import { Ban, Bell, Check, Copy, KeyRound, RefreshCw, UserMinus } from 'lucide-react';

import { apiCall, apiData } from '@/core/api';
import { isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { copyToClipboard } from '@/lib/clipboard';
import { hashColor } from '@/lib/format';
import { AlertDialog } from '@/ui/AlertDialog';
import { Sheet } from '@/ui/Sheet';
import { Toggle } from '@/ui/Toggle';
import { genCode, type Room, type RoomInfo, type RoomMember } from './data';

const PALETTE = ['#5ac8fa', '#34c759', '#ff9f0a', '#ff375f', '#bf5af2', '#64d2ff', '#ffd60a', '#ff453a'];

function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    const a = words[0]?.[0] ?? '';
    const b = words[1]?.[0] ?? '';
    return (a + b).toUpperCase() || '#';
}

export function RoomSettingsSheet({ room, nickname, onClose, onLeave, onMemberRemoved, onCodeChanged }: {
    room:            Room;
    nickname:        string;
    onClose:         () => void;
    onLeave:         () => void;
    onMemberRemoved: () => void;
    onCodeChanged:   (code: string) => void;
}) {
    const [loaded,        setLoaded]        = useState(false);
    const [notifications, setNotifications] = useState(false);
    const [isCreator,     setIsCreator]     = useState(false);
    const [members,       setMembers]       = useState<RoomMember[] | null>(null);
    const [bans,          setBans]          = useState<RoomMember[]>([]);
    const [code,          setCode]          = useState(room.code ?? '');
    const [cooldown,      setCooldown]      = useState(0);
    const [confirm,       setConfirm]       = useState<{ kind: 'kick' | 'ban'; member: RoomMember } | null>(null);
    const [confirmRegen,  setConfirmRegen]  = useState(false);
    const [codeCopied,    setCodeCopied]    = useState(false);
    const copiedTimer = useRef<number | undefined>(undefined);

    function copyCode() {
        if (!code || !copyToClipboard(code)) return;
        setCodeCopied(true);
        if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
        copiedTimer.current = window.setTimeout(() => setCodeCopied(false), 1400);
    }
    useEffect(() => () => { if (copiedTimer.current) window.clearTimeout(copiedTimer.current); }, []);

    useEffect(() => {
        if (!isFiveM) {
            setNotifications(false);
            setIsCreator(true);
            setMembers([
                { id: 'me', name: nickname || t('darkchat.you', 'You'), creator: true },
                { id: 'mock-1', name: 'Ghost' },
                { id: 'mock-2', name: 'Raven' },
            ]);
            setBans([{ id: 'mock-ban', name: 'Cipher' }]);
            setLoaded(true);
            return;
        }
        let alive = true;
        apiData<RoomInfo>('sd-phone:darkchat:roomInfo', { roomId: room.id })
            .then(r => {
                if (!alive || !r) return;
                setNotifications(r.notifications);
                setIsCreator(r.isCreator);
                setMembers(r.members ?? null);
                setBans(r.bans ?? []);
                if (r.code) setCode(r.code);
                setCooldown(r.codeCooldown ?? 0);
                setLoaded(true);
            })
            .catch(() => {});
        return () => { alive = false; };
    }, [room.id, nickname]);

    // The regen cooldown ticks down locally; the server stays authoritative on the action.
    useEffect(() => {
        if (cooldown <= 0) return;
        const id = window.setInterval(() => setCooldown(c => (c > 0 ? c - 1 : 0)), 1000);
        return () => window.clearInterval(id);
    }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

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

    async function banMember(m: RoomMember) {
        setConfirm(null);
        if (!isFiveM) {
            setMembers(prev => prev?.filter(x => x.id !== m.id) ?? null);
            setBans(prev => [...prev, m]);
            onMemberRemoved();
            return;
        }
        const res = await apiCall('sd-phone:darkchat:ban', { roomId: room.id, memberId: m.id });
        if (res.success) {
            setMembers(prev => prev?.filter(x => x.id !== m.id) ?? null);
            setBans(prev => (prev.some(b => b.id === m.id) ? prev : [...prev, m]));
            onMemberRemoved();
        }
    }

    async function unbanMember(m: RoomMember) {
        if (!isFiveM) {
            setBans(prev => prev.filter(x => x.id !== m.id));
            return;
        }
        const res = await apiCall('sd-phone:darkchat:unban', { roomId: room.id, memberId: m.id });
        if (res.success) setBans(prev => prev.filter(x => x.id !== m.id));
    }

    async function regenerateCode() {
        setConfirmRegen(false);
        if (!isFiveM) {
            const next = genCode();
            setCode(next);
            setCooldown(300);
            onCodeChanged(next);
            return;
        }
        const res = await apiCall<{ code: string; cooldown: number }>('sd-phone:darkchat:regenCode', { roomId: room.id });
        if (res.success && res.data) {
            setCode(res.data.code);
            setCooldown(res.data.cooldown);
            onCodeChanged(res.data.code);
        } else if (typeof res.message === 'string') {
            const secs = res.message.match(/\d+/);
            if (secs) setCooldown(parseInt(secs[0], 10));
        }
    }

    const cooldownLabel = cooldown >= 60
        ? t('darkchat.newCodeInMins', 'New code in {n}m', { n: Math.ceil(cooldown / 60) })
        : t('darkchat.newCodeInSecs', 'New code in {n}s', { n: cooldown });

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

                    <div className="flex items-center justify-between gap-2 rounded-[12px] bg-[#2c2c2e] px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                            <KeyRound className="h-[20px] w-[20px] shrink-0 text-white/70" strokeWidth={2} />
                            <div className="min-w-0">
                                <p className="text-[16px] font-medium text-white">{t('darkchat.roomCode', 'Room Code')}</p>
                                <p className="truncate font-mono text-[15px] tracking-[0.2em] text-white/70">{code || '—'}</p>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={copyCode}
                                disabled={!code}
                                aria-label={t('darkchat.copyCode', 'Copy room code')}
                                className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/10 text-white active:opacity-70"
                            >
                                {codeCopied
                                    ? <Check className="h-[15px] w-[15px] text-[#34c759]" strokeWidth={2.6} />
                                    : <Copy className="h-[15px] w-[15px]" strokeWidth={2.2} />}
                            </button>
                            {isCreator && (
                                <button
                                    type="button"
                                    onClick={() => setConfirmRegen(true)}
                                    disabled={!loaded || cooldown > 0}
                                    className={`flex items-center gap-1.5 rounded-full px-3 py-[7px] text-[13px] font-semibold ${cooldown > 0 ? 'bg-white/5 text-white/30' : 'bg-white/10 text-white active:opacity-70'}`}
                                >
                                    <RefreshCw className="h-[14px] w-[14px]" strokeWidth={2.4} />
                                    {cooldown > 0 ? cooldownLabel : t('darkchat.newCode', 'New Code')}
                                </button>
                            )}
                        </div>
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
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirm({ kind: 'kick', member: m })}
                                                        aria-label={t('darkchat.removeMemberAria', 'Remove {name}', { name: label })}
                                                        className="shrink-0 text-ios-red active:opacity-60"
                                                    >
                                                        <UserMinus className="h-[22px] w-[22px]" strokeWidth={2} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setConfirm({ kind: 'ban', member: m })}
                                                        aria-label={t('darkchat.banMemberAria', 'Ban {name}', { name: label })}
                                                        className="shrink-0 text-ios-red active:opacity-60"
                                                    >
                                                        <Ban className="h-[21px] w-[21px]" strokeWidth={2} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {isCreator && bans.length > 0 && (
                        <div>
                            <p className="mb-2 px-1 text-[12px] uppercase tracking-widest text-white/40">{t('darkchat.banned', 'Banned')}</p>
                            <div className="overflow-hidden rounded-[12px] bg-[#2c2c2e]">
                                {bans.map((b, i) => {
                                    const label = b.name || t('darkchat.anonymousMember', 'Anonymous');
                                    return (
                                        <div key={b.id} className={`flex items-center gap-3 px-3 py-2.5 ${i > 0 ? 'border-t border-white/5' : ''}`}>
                                            <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-white/10 text-white/50">
                                                <Ban className="h-[18px] w-[18px]" strokeWidth={2} />
                                            </div>
                                            <span className="min-w-0 flex-1 truncate text-[16px] text-white/70">{label}</span>
                                            <button
                                                type="button"
                                                onClick={() => void unbanMember(b)}
                                                className="shrink-0 rounded-full bg-white/10 px-3 py-[7px] text-[13px] font-semibold text-white active:opacity-70"
                                            >
                                                {t('darkchat.unban', 'Unban')}
                                            </button>
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

                    {confirm && confirm.kind === 'kick' && (
                        <AlertDialog
                            title={t('darkchat.removeMemberTitle', 'Remove Member?')}
                            message={t('darkchat.removeMemberMessage', '"{name}" will be removed from the room. They can rejoin later with its code.', { name: confirm.member.name || t('darkchat.anonymousMember', 'Anonymous') })}
                            confirmLabel={t('darkchat.remove', 'Remove')}
                            cancelLabel={t('darkchat.cancel', 'Cancel')}
                            destructive
                            forceDark
                            onCancel={() => setConfirm(null)}
                            onConfirm={() => void removeMember(confirm.member)}
                        />
                    )}

                    {confirm && confirm.kind === 'ban' && (
                        <AlertDialog
                            title={t('darkchat.banMemberTitle', 'Ban Member?')}
                            message={t('darkchat.banMemberMessage', '"{name}" will be removed and can\'t rejoin, even with the code, until you unban them.', { name: confirm.member.name || t('darkchat.anonymousMember', 'Anonymous') })}
                            confirmLabel={t('darkchat.ban', 'Ban')}
                            cancelLabel={t('darkchat.cancel', 'Cancel')}
                            destructive
                            forceDark
                            onCancel={() => setConfirm(null)}
                            onConfirm={() => void banMember(confirm.member)}
                        />
                    )}

                    {confirmRegen && (
                        <AlertDialog
                            title={t('darkchat.newCodeTitle', 'Generate New Code?')}
                            message={t('darkchat.newCodeMessage', 'The current code stops working immediately. Members keep their access - only new joins need the new code.')}
                            confirmLabel={t('darkchat.newCode', 'New Code')}
                            cancelLabel={t('darkchat.cancel', 'Cancel')}
                            forceDark
                            onCancel={() => setConfirmRegen(false)}
                            onConfirm={() => void regenerateCode()}
                        />
                    )}
                </div>
            )}
        </Sheet>
    );
}
