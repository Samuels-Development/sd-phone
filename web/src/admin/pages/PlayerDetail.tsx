import { useCallback, useEffect, useState } from 'react';
import {
    ArrowLeft, AtSign, BadgeCheck, Bird, Bomb, Grid3x3, KeyRound, LockOpen,
    LogOut, MessageSquare, Phone, PhoneCall, ShieldAlert, User,
} from 'lucide-react';
import clsx from 'clsx';

import {
    adminBirdyPosts, adminBirdySetVerified, adminCalls, adminForceLogout,
    adminMessages, adminBirdyDeletePost, adminOverview, adminResetAccountPassword,
    adminResetPasscode, adminSetApp, adminSetNumber, adminUnmute, adminWipePhone,
} from '../adminApi';
import {
    fmtPhone, fmtTime, scopeLabel,
    type AdminBirdyPost, type AdminCall, type AdminMessage, type AdminMute, type AdminOverview,
} from '../types';
import { Badge, Btn, Card, CenterNote, ConfirmModal, LoadMore, OnlineDot, PromptModal, Spinner } from '../ui';
import { usePaged } from '../usePaged';
import { PostCard } from './BirdyPage';
import { MuteForm } from './MutesPage';

type Tab = 'overview' | 'apps' | 'accounts' | 'birdy' | 'messages' | 'calls' | 'moderation';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',   label: 'Overview',   icon: <User size={13} /> },
    { id: 'apps',       label: 'Apps',       icon: <Grid3x3 size={13} /> },
    { id: 'accounts',   label: 'Accounts',   icon: <AtSign size={13} /> },
    { id: 'birdy',      label: 'Birdy',      icon: <Bird size={13} /> },
    { id: 'messages',   label: 'Messages',   icon: <MessageSquare size={13} /> },
    { id: 'calls',      label: 'Calls',      icon: <PhoneCall size={13} /> },
    { id: 'moderation', label: 'Moderation', icon: <ShieldAlert size={13} /> },
];

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4 border-t border-white/[0.05] px-4 py-2.5 text-[13px] first:border-t-0">
            <div className="text-zinc-500">{label}</div>
            <div className="text-right text-zinc-200">{children}</div>
        </div>
    );
}

export function PlayerDetail({ cid, onBack, toast }: {
    cid: string;
    onBack: () => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const [ov, setOv] = useState<AdminOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('overview');
    const [modal, setModal] = useState<null | 'number' | 'wipe' | { password: { id: number; label: string } }>(null);

    const reload = useCallback(() => {
        void adminOverview(cid).then(res => {
            setOv(res.success ? res.data ?? null : null);
            setLoading(false);
        });
    }, [cid]);

    useEffect(() => { setLoading(true); setTab('overview'); reload(); }, [reload]);

    if (loading) return <CenterNote><Spinner /></CenterNote>;
    if (!ov) {
        return (
            <div className="space-y-4">
                <Btn variant="subtle" onClick={onBack}><ArrowLeft size={14} /> Back</Btn>
                <CenterNote>No phone data found for <span className="font-mono">{cid}</span>.</CenterNote>
            </div>
        );
    }

    const s = ov.settings;

    const resetPasscode = async () => {
        const res = await adminResetPasscode(cid);
        if (res.success) { toast('Passcode cleared'); reload(); }
        else toast(res.message ?? 'Failed', true);
    };

    const setMutes = (mutes: AdminMute[]) => setOv(prev => prev ? { ...prev, mutes } : prev);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Btn variant="subtle" onClick={onBack} title="Back"><ArrowLeft size={15} /></Btn>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <OnlineDot online={ov.online} />
                            <span className="text-[17px] font-bold text-zinc-100">{ov.name ?? 'Unknown player'}</span>
                            {ov.mutes.length > 0 && <Badge tone="amber">{ov.mutes.length} active mute{ov.mutes.length > 1 ? 's' : ''}</Badge>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-[12px] text-zinc-500">
                            <span className="font-mono">{ov.citizenid}</span>
                            <span className="inline-flex items-center gap-1"><Phone size={11} /> {fmtPhone(s?.phoneNumber)}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-1.5">
                    <Btn variant="ghost" onClick={() => void resetPasscode()} title="Clear passcode + Face ID">
                        <LockOpen size={14} /> Reset passcode
                    </Btn>
                    <Btn variant="ghost" onClick={() => setModal('number')}>
                        <Phone size={14} /> Change number
                    </Btn>
                    <Btn variant="danger" onClick={() => setModal('wipe')}>
                        <Bomb size={14} /> Wipe phone
                    </Btn>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-white/[0.07] pb-0">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={clsx(
                            'inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-[12.5px] font-semibold transition-colors',
                            tab === t.id
                                ? 'border-ios-blue text-zinc-100'
                                : 'border-transparent text-zinc-500 hover:text-zinc-300',
                        )}
                    >
                        {t.icon}{t.label}
                        {t.id === 'moderation' && ov.mutes.length > 0 && (
                            <span className="rounded-full bg-ios-orange/20 px-1.5 text-[10px] text-ios-orange">{ov.mutes.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {tab === 'overview' && <OverviewTab ov={ov} />}
            {tab === 'apps' && <AppsTab ov={ov} onChanged={reload} toast={toast} />}
            {tab === 'accounts' && (
                <AccountsTab
                    ov={ov}
                    toast={toast}
                    onReset={(id, label) => setModal({ password: { id, label } })}
                />
            )}
            {tab === 'birdy' && <BirdyTab ov={ov} onChanged={reload} toast={toast} />}
            {tab === 'messages' && <MessagesTab cid={cid} />}
            {tab === 'calls' && <CallsTab cid={cid} />}
            {tab === 'moderation' && <ModerationTab ov={ov} setMutes={setMutes} toast={toast} />}

            {/* Modals */}
            {modal === 'number' && (
                <PromptModal
                    title="Change phone number"
                    body={<>New 10-digit number for <b>{ov.name}</b>. The old number stops working immediately.</>}
                    placeholder="e.g. 2085551234"
                    mono
                    submitLabel="Assign number"
                    validate={v => v.replace(/\D/g, '').length === 10 ? null : 'Enter exactly 10 digits'}
                    onSubmit={async v => {
                        const res = await adminSetNumber(cid, v);
                        if (res.success) { toast('Number updated'); reload(); }
                        else toast(res.message ?? 'Failed', true);
                    }}
                    onClose={() => setModal(null)}
                />
            )}
            {modal === 'wipe' && (
                <ConfirmModal
                    title="Wipe phone"
                    danger
                    confirmLabel="Wipe everything"
                    requireText={ov.citizenid}
                    body={<>Deletes <b>{ov.name}</b>&apos;s entire phone footprint: settings, number, messages, photos, Birdy profile
                        and posts, all app accounts and content. If they are online their phone resets instantly. <b>This cannot be undone.</b></>}
                    onConfirm={async () => {
                        const res = await adminWipePhone(cid, cid);
                        if (res.success) { toast(`Phone wiped (${res.data?.rows ?? 0} rows)`); reload(); }
                        else toast(res.message ?? 'Wipe failed', true);
                    }}
                    onClose={() => setModal(null)}
                />
            )}
            {modal !== null && typeof modal === 'object' && (
                <PromptModal
                    title="Set new password"
                    body={<>New password for <span className="font-mono text-zinc-200">{modal.password.label}</span>. Tell the player their
                        temporary password and ask them to change it.</>}
                    placeholder="Temporary password"
                    submitLabel="Set password"
                    validate={v => v.length >= 4 && v.length <= 64 ? null : 'Password must be 4-64 characters'}
                    onSubmit={async v => {
                        const res = await adminResetAccountPassword(modal.password.id, v);
                        if (res.success) toast('Password updated');
                        else toast(res.message ?? 'Failed', true);
                    }}
                    onClose={() => setModal(null)}
                />
            )}
        </div>
    );
}

function OverviewTab({ ov }: { ov: AdminOverview }) {
    const s = ov.settings;
    const c = ov.counts;
    return (
        <div className="grid grid-cols-2 gap-4">
            <Card title="Phone settings">
                <InfoRow label="Phone number">{fmtPhone(s?.phoneNumber)}</InfoRow>
                <InfoRow label="Passcode">{s?.hasPasscode ? <Badge tone="amber">Set</Badge> : <Badge tone="green">None</Badge>}</InfoRow>
                <InfoRow label="Face ID">{s?.faceId ? 'Enabled' : 'Off'}</InfoRow>
                <InfoRow label="Airplane mode">{s?.airplane ? <Badge tone="amber">On</Badge> : 'Off'}</InfoRow>
                <InfoRow label="Theme">{s?.theme ?? 'default'}{s?.darkTheme ? ` / ${s.darkTheme}` : ''}</InfoRow>
                <InfoRow label="Locale">{s?.locale ?? 'default'}</InfoRow>
                <InfoRow label="Card name">{s?.cardName ?? '—'}</InfoRow>
                <InfoRow label="Card email">{s?.cardEmail ?? '—'}</InfoRow>
                <InfoRow label="Last activity">{fmtTime(s?.updatedAt)}</InfoRow>
            </Card>
            <div className="space-y-4">
                <Card title="Content">
                    <InfoRow label="Birdy posts">{c?.birdyPosts ?? 0}</InfoRow>
                    <InfoRow label="Text messages">{c?.messages ?? 0}</InfoRow>
                    <InfoRow label="Calls">{c?.calls ?? 0}</InfoRow>
                    <InfoRow label="Photos">{c?.photos ?? 0}</InfoRow>
                    <InfoRow label="Contacts">{c?.contacts ?? 0}</InfoRow>
                </Card>
                <Card title="Birdy profile">
                    {ov.birdy ? (
                        <>
                            <InfoRow label="Handle">
                                <span className="inline-flex items-center gap-1">
                                    @{ov.birdy.handle}
                                    {ov.birdy.verified && <BadgeCheck size={14} className="text-ios-blue" />}
                                </span>
                            </InfoRow>
                            <InfoRow label="Display name">{ov.birdy.displayName}</InfoRow>
                            <InfoRow label="Signed in">{ov.birdy.loggedIn ? 'Yes' : 'No'}</InfoRow>
                            <InfoRow label="Created">{fmtTime(ov.birdy.createdAt)}</InfoRow>
                        </>
                    ) : (
                        <div className="px-4 py-3 text-[13px] text-zinc-500">No Birdy profile.</div>
                    )}
                </Card>
            </div>
        </div>
    );
}

function AppsTab({ ov, onChanged, toast }: {
    ov: AdminOverview;
    onChanged: () => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const installed = new Set(ov.settings?.installedApps ?? []);
    const [busyId, setBusyId] = useState<string | null>(null);

    const flip = async (id: string, install: boolean) => {
        setBusyId(id);
        const res = await adminSetApp(ov.citizenid, id, install);
        setBusyId(null);
        if (res.success) { toast(install ? 'App installed' : 'App removed'); onChanged(); }
        else toast(res.message ?? 'Failed', true);
    };

    return (
        <Card title="Downloadable apps" actions={<span className="text-[11.5px] text-zinc-600">Base apps are always installed and can’t be managed</span>}>
            <div className="grid grid-cols-2">
                {ov.downloadable.map(app => {
                    const has = installed.has(app.id);
                    return (
                        <div key={app.id} className="flex items-center justify-between gap-3 border-t border-white/[0.05] px-4 py-2.5 text-[13px] odd:border-r">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-zinc-200">{app.label}</span>
                                {has && <Badge tone="green">Installed</Badge>}
                            </div>
                            <Btn
                                variant={has ? 'danger' : 'primary'}
                                busy={busyId === app.id}
                                onClick={() => void flip(app.id, !has)}
                            >
                                {has ? 'Remove' : 'Install'}
                            </Btn>
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}

function AccountsTab({ ov, toast, onReset }: {
    ov: AdminOverview;
    toast: (text: string, error?: boolean) => void;
    onReset: (accountId: number, label: string) => void;
}) {
    const logout = async (app?: string) => {
        const res = await adminForceLogout(ov.citizenid, app);
        if (res.success) toast(app ? `Signed out of ${app}` : 'Signed out of all apps');
        else toast(res.message ?? 'Failed', true);
    };

    return (
        <Card
            title="App accounts"
            actions={<Btn variant="ghost" onClick={() => void logout()}><LogOut size={13} /> Log out of all apps</Btn>}
        >
            {ov.accounts.length === 0 && <div className="px-4 py-4 text-[13px] text-zinc-500">Not signed into any app accounts.</div>}
            {ov.accounts.map(a => (
                <div key={a.id} className="flex items-center justify-between gap-3 border-t border-white/[0.05] px-4 py-2.5 text-[13px] first:border-t-0">
                    <div className="flex min-w-0 items-center gap-3">
                        <Badge tone="blue" className="capitalize">{a.app}</Badge>
                        <div className="min-w-0">
                            <div className="truncate font-semibold text-zinc-100">{a.username}</div>
                            <div className="truncate text-[11.5px] text-zinc-500">
                                {a.displayName}{a.email ? ` · ${a.email}` : ''}{a.createdAt ? ` · created ${fmtTime(a.createdAt)}` : ''}
                            </div>
                        </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                        <Btn variant="ghost" onClick={() => onReset(a.id, `${a.app} / ${a.username}`)}>
                            <KeyRound size={13} /> Set password
                        </Btn>
                        <Btn variant="subtle" onClick={() => void logout(a.app)}>
                            <LogOut size={13} /> Log out
                        </Btn>
                    </div>
                </div>
            ))}
        </Card>
    );
}

function BirdyTab({ ov, onChanged, toast }: {
    ov: AdminOverview;
    onChanged: () => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const cid = ov.citizenid;
    const [doomed, setDoomed] = useState<string | null>(null);

    const fetchPage = useCallback(async (cursor: string | null) => {
        const res = await adminBirdyPosts({ cursor, cid });
        if (!res.success || !res.data) return null;
        return { items: res.data.posts, nextCursor: res.data.nextCursor };
    }, [cid]);

    const { items, loading, hasMore, loadMore, setItems } = usePaged<AdminBirdyPost, string>(fetchPage, `birdy-player:${cid}`);

    const toggleVerified = async () => {
        if (!ov.birdy) return;
        const res = await adminBirdySetVerified(cid, !ov.birdy.verified);
        if (res.success) { toast(ov.birdy.verified ? 'Verification removed' : 'Profile verified'); onChanged(); }
        else toast(res.message ?? 'Failed', true);
    };

    const remove = async (id: string) => {
        const res = await adminBirdyDeletePost(id);
        if (res.success) { setItems(prev => prev.filter(p => p.id !== id)); toast('Post deleted'); }
        else toast(res.message ?? 'Delete failed', true);
    };

    if (!ov.birdy) return <CenterNote>This player has no Birdy profile.</CenterNote>;

    return (
        <div className="space-y-4">
            <Card className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 text-[13px]">
                    <span className="font-bold text-zinc-100">{ov.birdy.displayName}</span>
                    {ov.birdy.verified && <BadgeCheck size={14} className="text-ios-blue" />}
                    <span className="text-zinc-500">@{ov.birdy.handle}</span>
                </div>
                <Btn variant={ov.birdy.verified ? 'ghost' : 'primary'} onClick={() => void toggleVerified()}>
                    <BadgeCheck size={14} /> {ov.birdy.verified ? 'Remove verification' : 'Verify profile'}
                </Btn>
            </Card>

            <Card title={`Posts (${ov.counts?.birdyPosts ?? items.length})`}>
                {items.map(p => (
                    <PostCard key={p.id} post={p} onDelete={setDoomed} showAuthorIdentity={false} />
                ))}
                {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
                {!loading && items.length === 0 && <CenterNote>No posts.</CenterNote>}
                <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
            </Card>

            {doomed && (
                <ConfirmModal
                    title="Delete Birdy post"
                    body="The post, its replies and their likes are permanently removed."
                    confirmLabel="Delete post"
                    danger
                    onConfirm={() => remove(doomed)}
                    onClose={() => setDoomed(null)}
                />
            )}
        </div>
    );
}

function MessagesTab({ cid }: { cid: string }) {
    const fetchPage = useCallback(async (cursor: string | null) => {
        const res = await adminMessages(cid, cursor);
        if (!res.success || !res.data) return null;
        return { items: res.data.messages, nextCursor: res.data.nextCursor };
    }, [cid]);

    const { items, loading, hasMore, loadMore } = usePaged<AdminMessage, string>(fetchPage, `messages:${cid}`);

    return (
        <Card title="Messages (read-only)">
            <table className="w-full text-left text-[13px]">
                <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                        <th className="px-4 py-2.5 font-semibold">When</th>
                        <th className="px-4 py-2.5 font-semibold">Conversation</th>
                        <th className="px-4 py-2.5 font-semibold">Dir</th>
                        <th className="px-4 py-2.5 font-semibold">Kind</th>
                        <th className="px-4 py-2.5 font-semibold">Body</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(m => (
                        <tr key={m.id} className="border-t border-white/[0.05]">
                            <td className="whitespace-nowrap px-4 py-2 text-zinc-500">{fmtTime(m.createdAt)}</td>
                            <td className="px-4 py-2 font-mono text-[12px] text-zinc-400">
                                {m.conversation.startsWith('g-') ? m.conversation : fmtPhone(m.conversation)}
                            </td>
                            <td className="px-4 py-2">
                                <Badge tone={m.direction === 'outgoing' ? 'blue' : 'neutral'}>{m.direction}</Badge>
                            </td>
                            <td className="px-4 py-2 text-zinc-500">{m.kind}</td>
                            <td className="max-w-[340px] truncate px-4 py-2 text-zinc-300" title={m.body ?? ''}>
                                {m.body || <span className="italic text-zinc-600">({m.kind})</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
            {!loading && items.length === 0 && <CenterNote>No messages.</CenterNote>}
            <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
        </Card>
    );
}

function CallsTab({ cid }: { cid: string }) {
    const fetchPage = useCallback(async (cursor: string | null) => {
        const res = await adminCalls(cid, cursor);
        if (!res.success || !res.data) return null;
        return { items: res.data.calls, nextCursor: res.data.nextCursor };
    }, [cid]);

    const { items, loading, hasMore, loadMore } = usePaged<AdminCall, string>(fetchPage, `calls:${cid}`);

    const fmtDur = (secs: number) => secs <= 0 ? '—' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

    return (
        <Card title="Call log (read-only)">
            <table className="w-full text-left text-[13px]">
                <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                        <th className="px-4 py-2.5 font-semibold">When</th>
                        <th className="px-4 py-2.5 font-semibold">Number</th>
                        <th className="px-4 py-2.5 font-semibold">Saved as</th>
                        <th className="px-4 py-2.5 font-semibold">Direction</th>
                        <th className="px-4 py-2.5 font-semibold">Duration</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(call => (
                        <tr key={call.id} className="border-t border-white/[0.05]">
                            <td className="whitespace-nowrap px-4 py-2 text-zinc-500">{fmtTime(call.calledAt)}</td>
                            <td className="px-4 py-2 text-zinc-300">{fmtPhone(call.number)}</td>
                            <td className="px-4 py-2 text-zinc-400">{call.name ?? '—'}</td>
                            <td className="px-4 py-2">
                                <Badge tone={call.direction === 'missed' ? 'red' : call.direction === 'outgoing' ? 'blue' : 'neutral'}>
                                    {call.direction}
                                </Badge>
                            </td>
                            <td className="px-4 py-2 text-zinc-400">{fmtDur(call.duration)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
            {!loading && items.length === 0 && <CenterNote>No calls.</CenterNote>}
            <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
        </Card>
    );
}

function ModerationTab({ ov, setMutes, toast }: {
    ov: AdminOverview;
    setMutes: (mutes: AdminMute[]) => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const lift = async (scope: string) => {
        const res = await adminUnmute(ov.citizenid, scope);
        if (res.success) { setMutes(res.data?.mutes ?? []); toast('Mute lifted'); }
        else toast(res.message ?? 'Failed', true);
    };

    return (
        <div className="grid grid-cols-2 gap-4">
            <Card title="Active mutes">
                {ov.mutes.length === 0 && <div className="px-4 py-4 text-[13px] text-zinc-500">No active mutes.</div>}
                {ov.mutes.map(m => (
                    <div key={m.scope} className="flex items-center justify-between gap-3 border-t border-white/[0.05] px-4 py-2.5 text-[13px] first:border-t-0">
                        <div>
                            <div className="flex items-center gap-2">
                                <Badge tone="amber">{scopeLabel(m.scope)}</Badge>
                                {m.expiresAt
                                    ? <span className="text-[11.5px] text-zinc-500">until {fmtTime(m.expiresAt)}</span>
                                    : <Badge tone="red">Permanent</Badge>}
                            </div>
                            <div className="mt-0.5 text-[11.5px] text-zinc-500">
                                {m.reason || 'No reason'} · by {m.adminName}
                            </div>
                        </div>
                        <Btn variant="ghost" onClick={() => void lift(m.scope)}>Unmute</Btn>
                    </div>
                ))}
            </Card>
            <Card title="Mute this player">
                <div className="p-4">
                    <MuteForm cid={ov.citizenid} onDone={setMutes} toast={toast} />
                </div>
            </Card>
        </div>
    );
}
