import { useEffect, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';

import { adminSearch } from '../adminApi';
import { fmtPhone, type AdminPlayerHit } from '../types';
import { Badge, Card, CenterNote, Input, OnlineDot, Spinner, useDebounced } from '../ui';

export function PlayersPage({ initialQuery, onOpenPlayer }: {
    initialQuery: string;
    onOpenPlayer: (cid: string) => void;
}) {
    const [q, setQ] = useState(initialQuery);
    const [hits, setHits] = useState<AdminPlayerHit[] | null>(null);
    const [loading, setLoading] = useState(false);
    const debounced = useDebounced(q.trim(), 400);

    useEffect(() => {
        if (debounced.length < 2) { setHits(null); return; }
        let cancelled = false;
        setLoading(true);
        void adminSearch(debounced).then(res => {
            if (cancelled) return;
            setLoading(false);
            setHits(res.success ? res.data?.players ?? [] : []);
        });
        return () => { cancelled = true; };
    }, [debounced]);

    return (
        <div className="space-y-4">
            <Input
                value={q}
                onChange={setQ}
                autoFocus
                placeholder="Search by name, citizen ID, phone number, Birdy handle or account username…"
            />

            {loading && <CenterNote><Spinner className="!text-zinc-600" /> Searching…</CenterNote>}

            {!loading && hits === null && (
                <CenterNote><Search size={14} /> Type at least 2 characters to search.</CenterNote>
            )}

            {!loading && hits !== null && hits.length === 0 && (
                <CenterNote>No players matched “{debounced}”.</CenterNote>
            )}

            {!loading && hits !== null && hits.length > 0 && (
                <Card>
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
                            {hits.map(h => (
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
                </Card>
            )}
        </div>
    );
}
