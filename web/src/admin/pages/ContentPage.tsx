import { useCallback, useState } from 'react';
import { ImageIcon, Trash2, UserSearch } from 'lucide-react';

import { adminContent, adminContentDelete } from '../adminApi';
import { fmtTime, type AdminContentItem } from '../types';
import { Badge, Btn, Card, CenterNote, ConfirmModal, Input, LoadMore, OnlineDot, Spinner } from '../ui';
import { usePaged } from '../usePaged';

// One generic moderation browser per app: newest-first content with author
// identity, Enter-to-search filter, pagination, and delete where the server
// allows it (darkchat / photogram / gallery / marketplace / pages). `grid`
// renders items as image tiles (Gallery) instead of text rows.
export function ContentPage({ app, searchPlaceholder, emptyLabel, deleteBody, grid, onOpenPlayer, toast }: {
    app: string;
    searchPlaceholder: string;
    emptyLabel: string;
    deleteBody: string;
    grid?: boolean;
    onOpenPlayer: (cid: string) => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const [q, setQ] = useState('');
    // Only an Enter press hits the database; typing alone never queries.
    const [query, setQuery] = useState('');
    const [deletable, setDeletable] = useState(false);
    const [doomed, setDoomed] = useState<string | null>(null);
    const [viewing, setViewing] = useState<AdminContentItem | null>(null);

    const submit = () => {
        const text = q.trim();
        if (text.length === 0 || text.length >= 2) setQuery(text);
    };

    const fetchPage = useCallback(async (cursor: string | null) => {
        const res = await adminContent(app, cursor, query || undefined);
        if (!res.success || !res.data) return null;
        setDeletable(res.data.deletable);
        return { items: res.data.items, nextCursor: res.data.nextCursor };
    }, [app, query]);

    const { items, loading, hasMore, loadMore, setItems } = usePaged<AdminContentItem, string>(fetchPage, `content:${app}:${query}`);

    const remove = async (id: string) => {
        const res = await adminContentDelete(app, id);
        if (res.success) {
            setItems(prev => prev.filter(i => i.id !== id));
            toast('Deleted');
        } else {
            toast(res.message ?? 'Delete failed', true);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Input value={q} onChange={setQ} onEnter={submit} placeholder={`${searchPlaceholder} — press Enter`} />
                <Btn variant="primary" onClick={submit} disabled={q.trim().length === 1}>Search</Btn>
            </div>

            {grid ? (
                <>
                    <div className="grid grid-cols-4 gap-3">
                        {items.map(item => (
                            <div key={item.id} className="overflow-hidden rounded-xl bg-white/[0.035] ring-1 ring-white/[0.06]">
                                <button
                                    type="button"
                                    onClick={() => setViewing(item)}
                                    className="block aspect-square w-full overflow-hidden bg-black/40"
                                    title="View full size"
                                >
                                    {item.imageUrl && (
                                        <img src={item.imageUrl} loading="lazy" className="h-full w-full object-cover transition-transform hover:scale-105" />
                                    )}
                                </button>
                                <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                                    <button
                                        type="button"
                                        onClick={() => item.authorCid && onOpenPlayer(item.authorCid)}
                                        disabled={!item.authorCid}
                                        className="min-w-0 text-left disabled:cursor-default"
                                        title={item.authorCid ? 'Open player' : undefined}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <OnlineDot online={item.authorOnline} />
                                            <span className="truncate text-[12px] font-semibold text-zinc-200 hover:underline">
                                                {item.authorName ?? item.authorCid ?? 'Unknown'}
                                            </span>
                                        </div>
                                        <div className="text-[10.5px] text-zinc-500">{fmtTime(item.createdAt)}</div>
                                    </button>
                                    {deletable && (
                                        <Btn variant="danger" title="Delete photo" onClick={() => setDoomed(item.id)}>
                                            <Trash2 size={13} />
                                        </Btn>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
                    {!loading && items.length === 0 && (
                        <CenterNote>{query ? `Nothing matched “${query}”.` : emptyLabel}</CenterNote>
                    )}
                    <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
                </>
            ) : (
            <Card>
                {items.map(item => (
                    <div key={item.id} className="border-t border-white/[0.05] px-4 py-3 first:border-t-0">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
                                    {item.authorCid ? (
                                        <span className="inline-flex items-center gap-1.5">
                                            <OnlineDot online={item.authorOnline} />
                                            <span className="font-bold text-zinc-100">{item.authorName ?? 'Unknown player'}</span>
                                            <span className="font-mono text-[11px] text-zinc-500">{item.authorCid}</span>
                                        </span>
                                    ) : (
                                        <span className="font-semibold text-zinc-400">Unknown author</span>
                                    )}
                                    {item.label && <Badge>{item.label}</Badge>}
                                    {item.kind && item.kind !== 'text' && <Badge tone="blue">{item.kind}</Badge>}
                                    <span className="text-zinc-600">·</span>
                                    <span className="text-zinc-500">{fmtTime(item.createdAt)}</span>
                                </div>
                                {item.title && <div className="mt-1 text-[13px] font-bold text-zinc-100">{item.title}</div>}
                                <div className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-snug text-zinc-200">
                                    {item.body || <span className="italic text-zinc-500">(no text)</span>}
                                </div>
                                <div className="mt-1 flex items-center gap-4 text-[11.5px] text-zinc-500">
                                    {typeof item.price === 'number' && <span>${item.price.toLocaleString()}</span>}
                                    {!!item.images && (
                                        <span className="inline-flex items-center gap-1">
                                            <ImageIcon size={12} /> {item.images} image{item.images > 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                                {item.authorCid && (
                                    <Btn variant="subtle" title="Open player" onClick={() => onOpenPlayer(item.authorCid!)}>
                                        <UserSearch size={14} />
                                    </Btn>
                                )}
                                {deletable && (
                                    <Btn variant="danger" title="Delete" onClick={() => setDoomed(item.id)}>
                                        <Trash2 size={14} />
                                    </Btn>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
                {!loading && items.length === 0 && (
                    <CenterNote>{query ? `Nothing matched “${query}”.` : emptyLabel}</CenterNote>
                )}
                <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
            </Card>
            )}

            {viewing?.imageUrl && (
                <div
                    className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/80 p-8"
                    onMouseDown={() => setViewing(null)}
                >
                    <img src={viewing.imageUrl} className="max-h-[85%] max-w-full rounded-lg object-contain" onMouseDown={e => e.stopPropagation()} />
                    <div className="flex items-center gap-3 text-[12.5px] text-zinc-300" onMouseDown={e => e.stopPropagation()}>
                        <span className="font-semibold">{viewing.authorName ?? 'Unknown'}</span>
                        <span className="font-mono text-[11px] text-zinc-500">{viewing.authorCid}</span>
                        <span className="text-zinc-500">{fmtTime(viewing.createdAt)}</span>
                        {viewing.authorCid && (
                            <Btn variant="ghost" onClick={() => { setViewing(null); onOpenPlayer(viewing.authorCid!); }}>
                                <UserSearch size={13} /> Open player
                            </Btn>
                        )}
                        <Btn variant="subtle" onClick={() => setViewing(null)}>Close</Btn>
                    </div>
                </div>
            )}

            {doomed && (
                <ConfirmModal
                    title="Delete content"
                    body={deleteBody}
                    confirmLabel="Delete"
                    danger
                    onConfirm={() => remove(doomed)}
                    onClose={() => setDoomed(null)}
                />
            )}
        </div>
    );
}
