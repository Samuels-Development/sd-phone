import { useCallback, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';

import { adminSearch } from '../adminApi';
import { fmtPhone, type AdminPlayerHit } from '../types';
import { Badge, Btn, Card, CenterNote, Input, LoadMore, OnlineDot, Spinner } from '../ui';
import { usePaged } from '../usePaged';

export function PlayersPage({ initialQuery, onOpenPlayer }: {
    initialQuery: string;
    onOpenPlayer: (cid: string) => void;
}) {
    const [q, setQ] = useState(initialQuery);
    // Only an Enter press (or the button) hits the database; typing alone never queries.
    const [submitted, setSubmitted] = useState(initialQuery.trim().length >= 2 ? initialQuery.trim() : '');

    const submit = () => {
        const text = q.trim();
        if (text.length === 0 || text.length >= 2) setSubmitted(text);
    };

    const fetchPage = useCallback(async (cursor: string | number | null) => {
        const res = await adminSearch(submitted, cursor);
        if (!res.success || !res.data) return null;
        return { items: res.data.players, nextCursor: res.data.nextCursor };
    }, [submitted]);

    const { items, loading, hasMore, loadMore } = usePaged<AdminPlayerHit, string | number>(fetchPage, `players:${submitted}`);

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Input
                    value={q}
                    onChange={setQ}
                    autoFocus
                    onEnter={submit}
                    placeholder="Search by name, citizen ID, phone number, Birdy handle or account username — press Enter"
                />
                <Btn variant="primary" onClick={submit} disabled={q.trim().length === 1}>
                    <Search size={14} /> Search
                </Btn>
            </div>

            <Card
                title={submitted ? `Results for “${submitted}”` : 'Recently active phones'}
                actions={submitted
                    ? <Btn variant="subtle" onClick={() => { setQ(''); setSubmitted(''); }}>Clear</Btn>
                    : undefined}
            >
                <table className="w-full text-left text-[13px]">
                    <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-zinc-500">
                            <th className="px-4 py-2.5 font-semibold">Player</th>
                            <th className="px-4 py-2.5 font-semibold">Citizen ID</th>
                            <th className="px-4 py-2.5 font-semibold">Phone number</th>
                            <th className="px-4 py-2.5 font-semibold">Matched on</th>
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(h => (
                            <tr
                                key={h.citizenid}
                                onClick={() => onOpenPlayer(h.citizenid)}
                                className="cursor-pointer border-t border-white/[0.05] transition-colors hover:bg-white/[0.04]"
                            >
                                <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2.5">
                                        <OnlineDot online={h.online} />
                                        <span className="font-semibold text-zinc-100">{h.name ?? 'Unknown'}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-2.5 font-mono text-[12px] text-zinc-400">{h.citizenid}</td>
                                <td className="px-4 py-2.5 text-zinc-300">{fmtPhone(h.phoneNumber)}</td>
                                <td className="px-4 py-2.5">{h.matchedOn && <Badge>{h.matchedOn}</Badge>}</td>
                                <td className="pr-3 text-zinc-600"><ChevronRight size={15} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
                {!loading && items.length === 0 && (
                    <CenterNote>{submitted ? `No players matched “${submitted}”.` : 'No phones registered yet.'}</CenterNote>
                )}
                <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
            </Card>
        </div>
    );
}
