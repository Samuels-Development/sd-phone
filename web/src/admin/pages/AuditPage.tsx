import { useCallback } from 'react';

import { adminAudit } from '../adminApi';
import { fmtTime, type AdminAuditEntry } from '../types';
import { Badge, Card, CenterNote, LoadMore, Spinner } from '../ui';
import { usePaged } from '../usePaged';

const ACTION_TONE: Record<string, 'red' | 'amber' | 'blue' | 'green' | 'neutral'> = {
    'wipe-phone':        'red',
    'delete-birdy-post': 'red',
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

export function AuditPage({ onOpenPlayer }: { onOpenPlayer: (cid: string) => void }) {
    const fetchPage = useCallback(async (cursor: number | null) => {
        const res = await adminAudit(cursor);
        if (!res.success || !res.data) return null;
        return { items: res.data.entries, nextCursor: res.data.nextCursor };
    }, []);

    const { items, loading, hasMore, loadMore } = usePaged<AdminAuditEntry, number>(fetchPage, 'audit');

    return (
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
            {!loading && items.length === 0 && <CenterNote>Nothing logged yet.</CenterNote>}
            <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
        </Card>
    );
}
