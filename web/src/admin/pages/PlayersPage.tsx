import { useCallback, useState } from 'react';
import { ChevronRight, Radar, Search } from 'lucide-react';

import { adminSearch, adminSimLookup } from '../adminApi';
import { fmtPhone, type AdminPlayerHit, type AdminSimLookup } from '../types';
import { Badge, Btn, Card, CenterNote, ConfirmModal, Input, LoadMore, OnlineDot, PromptModal, Spinner } from '../ui';
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

    // SIM trace tool (unique phones): number -> profile, first activator, current holder.
    const [tracing, setTracing] = useState(false);
    const [trace, setTrace] = useState<{ number: string; result?: AdminSimLookup; error?: string } | null>(null);

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
                <Btn variant="ghost" onClick={() => setTracing(true)} title="Trace a SIM number (unique phones)">
                    <Radar size={14} /> Trace number
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

            {tracing && (
                <PromptModal
                    title="Trace a SIM number"
                    body="Looks a number up in the SIM registry: which phone profile it belongs to, who first activated it, and who is carrying it right now."
                    placeholder="e.g. 2085551234"
                    mono
                    submitLabel="Trace"
                    validate={v => v.replace(/\D/g, '').length >= 3 ? null : 'Enter a phone number'}
                    onSubmit={async v => {
                        const res = await adminSimLookup(v);
                        setTrace(res.success && res.data
                            ? { number: v, result: res.data }
                            : { number: v, error: res.message ?? 'Lookup failed' });
                        setTracing(false);
                    }}
                    onClose={() => setTracing(false)}
                />
            )}

            {trace && (
                <ConfirmModal
                    title={`SIM ${fmtPhone(trace.result?.number ?? trace.number)}`}
                    confirmLabel={trace.result?.ownerCid ? 'Open activator' : 'OK'}
                    body={trace.error ? <span className="text-ios-red">{trace.error}</span> : (
                        <div className="space-y-1.5 text-[13px]">
                            <div>Profile: {trace.result!.boundProfile
                                ? <><Badge tone="green">character-bound</Badge> <span className="font-mono text-[12px]">{trace.result!.identity}</span></>
                                : <span className="font-mono text-[12px]">{trace.result!.identity}</span>}
                            </div>
                            <div>First activated by: {trace.result!.ownerName
                                ? <>{trace.result!.ownerName} <span className="font-mono text-[11.5px] text-zinc-500">{trace.result!.ownerCid}</span></>
                                : (trace.result!.ownerCid ?? 'never activated')}
                            </div>
                            <div>Currently carried by: {trace.result!.holder
                                ? <>{trace.result!.holder.name ?? 'Unknown'}{trace.result!.holder.active && <> <Badge tone="green">active phone</Badge></>}</>
                                : 'nobody online'}
                            </div>
                        </div>
                    )}
                    onConfirm={() => {
                        const cid = trace.result?.ownerCid;
                        setTrace(null);
                        if (cid) onOpenPlayer(cid);
                    }}
                    onClose={() => setTrace(null)}
                />
            )}
        </div>
    );
}
