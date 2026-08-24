import { useCallback, useState } from 'react';
import clsx from 'clsx';

import { adminAudit } from '../adminApi';
import { fmtTime, type AdminAuditEntry } from '../types';
import { Badge, Btn, Card, CenterNote, Input, LoadMore, Spinner } from '../ui';
import { usePaged } from '../usePaged';

const ACTION_TONE: Record<string, 'red' | 'amber' | 'blue' | 'green' | 'neutral'> = {
    'wipe-phone':        'red',
    'delete-birdy-post': 'red',
    'delete-content':    'red',
    'delete-comment':    'red',
    'restore-content':   'green',
    'flag-actioned':     'green',
    'flag-dismissed':    'neutral',
    'flags-scan':        'blue',
    'mute':              'amber',
    'unmute':            'green',
    'reset-password':    'blue',
    'reset-passcode':    'blue',
    'set-number':        'blue',
    'force-logout':      'blue',
    'install-app':       'neutral',
    'remove-app':        'neutral',
    'birdy-verify':      'green',
    'birdy-unverify':    'neutral',
};

const KINDS: { id: string; label: string }[] = [
    { id: '',                label: 'Everything' },
    { id: 'delete-content',  label: 'Deletions' },
    { id: 'restore-content', label: 'Restores' },
    { id: 'mute',            label: 'Mutes' },
    { id: 'wipe-phone',      label: 'Wipes' },
];

export function AuditPage({ onOpenPlayer }: { onOpenPlayer: (cid: string) => void }) {
    const [q, setQ] = useState('');
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState('');

    const submit = () => {
        const text = q.trim();
        if (text.length === 0 || text.length >= 2) setQuery(text);
    };

    const fetchPage = useCallback(async (cursor: number | null) => {
        const res = await adminAudit(cursor, query || undefined, kind || undefined);
        if (!res.success || !res.data) return null;
        return { items: res.data.entries, nextCursor: res.data.nextCursor };
    }, [query, kind]);

    const { items, loading, hasMore, loadMore } = usePaged<AdminAuditEntry, number>(fetchPage, `audit:${kind}:${query}`);

    return (
        <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
            <div className="flex min-w-[280px] flex-1 gap-2">
                <Input value={q} onChange={setQ} onEnter={submit} placeholder="Filter by admin, citizen ID or detail — press Enter" />
                <Btn variant="primary" onClick={submit} disabled={q.trim().length === 1}>Search</Btn>
            </div>
            <div className="flex gap-2">
                {KINDS.map(k => (
                    <button
                        key={k.id}
                        type="button"
                        onClick={() => setKind(k.id)}
                        className={clsx(
                            'rounded-lg px-3 py-1.5 text-[12px] font-semibold ring-1 transition-colors',
                            kind === k.id
                                ? 'bg-white/[0.12] text-zinc-100 ring-white/[0.14]'
                                : 'bg-white/[0.035] text-zinc-400 ring-white/[0.06] hover:bg-white/[0.06]',
                        )}
                    >
                        {k.label}
                    </button>
                ))}
            </div>
        </div>

        <Card>
            <table className="w-full text-left text-[13px]">
                <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                        <th className="px-4 py-2.5 font-semibold">When</th>
                        <th className="px-4 py-2.5 font-semibold">Admin</th>
                        <th className="px-4 py-2.5 font-semibold">Action</th>
                        <th className="px-4 py-2.5 font-semibold">Target</th>
                        <th className="px-4 py-2.5 font-semibold">Detail</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(e => (
                        <tr key={e.id} className="border-t border-white/[0.05]">
                            <td className="whitespace-nowrap px-4 py-2.5 text-zinc-400">{fmtTime(e.createdAt)}</td>
                            <td className="px-4 py-2.5 font-semibold text-zinc-200">{e.adminName || e.adminCid}</td>
                            <td className="px-4 py-2.5"><Badge tone={ACTION_TONE[e.action] ?? 'neutral'}>{e.action}</Badge></td>
                            <td className="px-4 py-2.5">
                                {e.targetCid ? (
                                    <button
                                        type="button"
                                        onClick={() => onOpenPlayer(e.targetCid!)}
                                        className="font-mono text-[12px] text-[#6db4ff] hover:underline"
                                    >
                                        {e.targetCid}
                                    </button>
                                ) : <span className="text-zinc-600">—</span>}
                            </td>
                            <td className="max-w-[260px] truncate px-4 py-2.5 text-zinc-500" title={e.detail}>{e.detail || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
            {!loading && items.length === 0 && (
                <CenterNote>{query || kind ? 'Nothing matched that filter.' : 'Nothing logged yet.'}</CenterNote>
            )}
            <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
        </Card>
        </div>
    );
}
