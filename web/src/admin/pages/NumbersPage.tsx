import { useCallback, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';

import { adminNumbers } from '../adminApi';
import { fmtPhone, fmtTime, type AdminNumberRow } from '../types';
import { Badge, Btn, Card, CenterNote, Input, LoadMore, Spinner } from '../ui';
import { usePaged } from '../usePaged';

// Full SIM registry: which number opens which profile, who activated it, who carries it live.
export function NumbersPage({ onOpenPlayer }: { onOpenPlayer: (cid: string) => void }) {
    const [q, setQ] = useState('');
    const [submitted, setSubmitted] = useState('');

    const submit = () => setSubmitted(q.trim());

    const fetchPage = useCallback(async (cursor: number | null) => {
        const res = await adminNumbers(submitted, cursor);
        if (!res.success || !res.data) return null;
        return { items: res.data.numbers, nextCursor: res.data.nextCursor };
    }, [submitted]);

    const { items, loading, hasMore, loadMore } = usePaged<AdminNumberRow, number>(fetchPage, `numbers:${submitted}`);

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Input
                    value={q}
                    onChange={setQ}
                    autoFocus
                    onEnter={submit}
                    placeholder="Search by number, profile id or activator citizen ID — press Enter"
                />
                <Btn variant="primary" onClick={submit}>
                    <Search size={14} /> Search
                </Btn>
            </div>

            <Card
                title={submitted ? `Numbers matching “${submitted}”` : 'All registered numbers'}
                actions={submitted
                    ? <Btn variant="subtle" onClick={() => { setQ(''); setSubmitted(''); }}>Clear</Btn>
                    : undefined}
            >
                <table className="w-full text-left text-[13px]">
                    <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                            <th className="px-4 py-2.5 font-semibold">Number</th>
                            <th className="px-4 py-2.5 font-semibold">Profile</th>
                            <th className="px-4 py-2.5 font-semibold">First activated by</th>
                            <th className="px-4 py-2.5 font-semibold">Carried by (live)</th>
                            <th className="px-4 py-2.5 font-semibold">Registered</th>
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(row => (
                            <tr
                                key={row.number}
                                onClick={() => { if (row.ownerCid) onOpenPlayer(row.ownerCid); }}
                                className={row.ownerCid
                                    ? 'cursor-pointer border-t border-white/[0.05] transition-colors hover:bg-white/[0.04]'
                                    : 'border-t border-white/[0.05]'}
                            >
                                <td className="px-4 py-2.5 font-mono text-zinc-100">{fmtPhone(row.number)}</td>
                                <td className="px-4 py-2.5">
                                    {row.boundProfile
                                        ? <span className="inline-flex items-center gap-1.5"><Badge tone="green">bound</Badge>
                                            <span className="font-mono text-[11.5px] text-zinc-400">{row.identity}</span></span>
                                        : <Badge>blank</Badge>}
                                </td>
                                <td className="px-4 py-2.5">
                                    {row.ownerName
                                        ? <span>{row.ownerName} <span className="font-mono text-[11px] text-zinc-500">{row.ownerCid}</span></span>
                                        : (row.ownerCid ?? <span className="text-zinc-600">never activated</span>)}
                                </td>
                                <td className="px-4 py-2.5">
                                    {row.holder
                                        ? <span className="text-zinc-200">{row.holder.name ?? row.holder.cid ?? 'Unknown'}</span>
                                        : <span className="text-zinc-600">—</span>}
                                </td>
                                <td className="px-4 py-2.5 text-zinc-400">{fmtTime(row.createdAt)}</td>
                                <td className="pr-3 text-zinc-600">{row.ownerCid && <ChevronRight size={15} />}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
                {!loading && items.length === 0 && (
                    <CenterNote>{submitted ? `No numbers matched “${submitted}”.` : 'No SIMs registered yet.'}</CenterNote>
                )}
                <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
            </Card>
        </div>
    );
}
