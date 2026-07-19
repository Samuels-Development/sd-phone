import { useCallback, useState } from 'react';
import { Clock, UserSearch, VolumeX } from 'lucide-react';
import clsx from 'clsx';

import { adminMute, adminMutes, adminUnmute } from '../adminApi';
import { fmtTime, MUTE_SCOPES, scopeLabel, type AdminMute } from '../types';
import { Badge, Btn, Card, CenterNote, Input, LoadMore, OnlineDot, Spinner } from '../ui';
import { usePaged } from '../usePaged';

const DURATIONS: { label: string; secs: number | null }[] = [
    { label: '1 hour',  secs: 3600 },
    { label: '6 hours', secs: 6 * 3600 },
    { label: '1 day',   secs: 86400 },
    { label: '7 days',  secs: 7 * 86400 },
    { label: '30 days', secs: 30 * 86400 },
    { label: 'Permanent', secs: null },
];

// Scope multi-select + duration + reason. Used by the player detail page; the
// target is always an already-resolved citizenid.
export function MuteForm({ cid, onDone, toast }: {
    cid: string;
    onDone: (mutes: AdminMute[]) => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const [scopes, setScopes]     = useState<Set<string>>(new Set());
    const [duration, setDuration] = useState<number | null>(86400);
    const [reason, setReason]     = useState('');
    const [busy, setBusy]         = useState(false);

    const toggle = (id: string) => setScopes(prev => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
    });
    const setAll = (ids: string[]) => setScopes(new Set(ids));

    const apply = async () => {
        if (scopes.size === 0) return;
        setBusy(true);
        const res = await adminMute(cid, Array.from(scopes), duration, reason.trim());
        setBusy(false);
        if (res.success) {
            toast('Mute applied');
            setScopes(new Set());
            setReason('');
            onDone(res.data?.mutes ?? []);
        } else {
            toast(res.message ?? 'Mute failed', true);
        }
    };

    const social = MUTE_SCOPES.filter(s => s.social).map(s => s.id);
    const all    = MUTE_SCOPES.map(s => s.id);

    return (
        <div className="space-y-3">
            <div>
                <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500">Scopes</div>
                    <div className="flex gap-1.5">
                        <Btn variant="subtle" onClick={() => setAll(social)}>All social</Btn>
                        <Btn variant="subtle" onClick={() => setAll(all)}>Everything</Btn>
                    </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {MUTE_SCOPES.map(s => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => toggle(s.id)}
                            className={clsx(
                                'rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ring-1 transition-colors',
                                scopes.has(s.id)
                                    ? 'bg-ios-blue/20 text-[#6db4ff] ring-ios-blue/50'
                                    : 'bg-white/[0.05] text-zinc-400 ring-white/[0.08] hover:bg-white/[0.1]',
                            )}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500">Duration</div>
                <div className="flex flex-wrap gap-1.5">
                    {DURATIONS.map(d => (
                        <button
                            key={d.label}
                            type="button"
                            onClick={() => setDuration(d.secs)}
                            className={clsx(
                                'rounded-lg px-2.5 py-1.5 text-[12px] font-semibold ring-1 transition-colors',
                                duration === d.secs
                                    ? 'bg-ios-orange/20 text-ios-orange ring-ios-orange/50'
                                    : 'bg-white/[0.05] text-zinc-400 ring-white/[0.08] hover:bg-white/[0.1]',
                            )}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>
            </div>

            <Input value={reason} onChange={setReason} placeholder="Reason (shown in the mute list and audit log)…" />

            <div className="flex justify-end">
                <Btn variant="primary" disabled={scopes.size === 0} busy={busy} onClick={() => void apply()}>
                    <VolumeX size={14} /> Apply mute
                </Btn>
            </div>
        </div>
    );
}

export function MutesPage({ onOpenPlayer, toast }: {
    onOpenPlayer: (cid: string) => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const fetchPage = useCallback(async (cursor: number | null) => {
        const res = await adminMutes(cursor);
        if (!res.success || !res.data) return null;
        return { items: res.data.mutes, nextCursor: res.data.nextCursor };
    }, []);

    const { items, loading, hasMore, loadMore, setItems } = usePaged<AdminMute, number>(fetchPage, 'mutes');

    const lift = async (m: AdminMute) => {
        if (!m.citizenid) return;
        const res = await adminUnmute(m.citizenid, m.scope);
        if (res.success) {
            setItems(prev => prev.filter(x => x.id !== m.id));
            toast('Mute lifted');
        } else {
            toast(res.message ?? 'Unmute failed', true);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <table className="w-full text-left text-[13px]">
                    <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                            <th className="px-4 py-2.5 font-semibold">Player</th>
                            <th className="px-4 py-2.5 font-semibold">Scope</th>
                            <th className="px-4 py-2.5 font-semibold">Reason</th>
                            <th className="px-4 py-2.5 font-semibold">Expires</th>
                            <th className="px-4 py-2.5 font-semibold">By</th>
                            <th className="w-24" />
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(m => (
                            <tr key={m.id} className="border-t border-white/[0.05]">
                                <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                        <OnlineDot online={m.online} />
                                        <div>
                                            <div className="font-semibold text-zinc-100">{m.name ?? 'Unknown'}</div>
                                            <div className="font-mono text-[11px] text-zinc-500">{m.citizenid}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-2.5"><Badge tone="amber">{scopeLabel(m.scope)}</Badge></td>
                                <td className="max-w-[220px] truncate px-4 py-2.5 text-zinc-400" title={m.reason}>{m.reason || '—'}</td>
                                <td className="px-4 py-2.5 text-zinc-400">
                                    {m.expiresAt
                                        ? <span className="inline-flex items-center gap-1"><Clock size={12} /> {fmtTime(m.expiresAt)}</span>
                                        : <Badge tone="red">Permanent</Badge>}
                                </td>
                                <td className="px-4 py-2.5 text-zinc-500">{m.adminName}</td>
                                <td className="px-3 py-2.5">
                                    <div className="flex justify-end gap-1.5">
                                        {m.citizenid && (
                                            <Btn variant="subtle" title="Open player" onClick={() => onOpenPlayer(m.citizenid!)}>
                                                <UserSearch size={14} />
                                            </Btn>
                                        )}
                                        <Btn variant="ghost" onClick={() => void lift(m)}>Unmute</Btn>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
                {!loading && items.length === 0 && <CenterNote>No active mutes. Mute a player from their detail page.</CenterNote>}
                <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
            </Card>
        </div>
    );
}
