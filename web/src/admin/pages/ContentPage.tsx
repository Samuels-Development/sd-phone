import { useCallback, useState } from 'react';
import { Eye, Heart, MessageCircle, Trash2, UserSearch } from 'lucide-react';
import clsx from 'clsx';

import { adminContent, adminContentDelete } from '../adminApi';
import { fmtTime, type AdminContentItem, type AdminContentMedia } from '../types';
import { Badge, Btn, Card, CenterNote, ConfirmModal, Input, LoadMore, OnlineDot, Spinner } from '../ui';
import { usePaged } from '../usePaged';
import { ContentDetail } from './content/ContentDetail';
import { MediaLightbox, MediaStrip } from './content/Media';

function Stat({ icon, value }: { icon: React.ReactNode; value?: number | null }) {
    if (typeof value !== 'number') return null;
    return (
        <span className="inline-flex items-center gap-1 tabular-nums">
            {icon}
            {value.toLocaleString()}
        </span>
    );
}

export function ContentPage({ app, searchPlaceholder, emptyLabel, deleteBody, threadLabel, grid, initialQuery, onOpenPlayer, toast }: {
    app: string;
    searchPlaceholder: string;
    emptyLabel: string;
    deleteBody: string;
    threadLabel: string;
    grid?: boolean;
    initialQuery?: string;
    onOpenPlayer: (cid: string) => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const [q, setQ] = useState(initialQuery ?? '');
    const [query, setQuery] = useState(initialQuery ?? '');
    const [deletable, setDeletable] = useState(false);
    const [threaded, setThreaded] = useState(false);
    const [doomed, setDoomed] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [lightbox, setLightbox] = useState<{ media: AdminContentMedia[]; index: number; who: string } | null>(null);

    const submit = () => {
        const text = q.trim();
        if (text.length === 0 || text.length >= 2) { setQuery(text); setSelectedId(null); }
    };

    const fetchPage = useCallback(async (cursor: string | null) => {
        const res = await adminContent(app, cursor, query || undefined);
        if (!res.success || !res.data) return null;
        setDeletable(res.data.deletable);
        setThreaded(res.data.threaded === true);
        return { items: res.data.items, nextCursor: res.data.nextCursor };
    }, [app, query]);

    const { items, loading, hasMore, loadMore, setItems } = usePaged<AdminContentItem, string>(fetchPage, `content:${app}:${query}`);

    const remove = async (id: string) => {
        const res = await adminContentDelete(app, id);
        if (res.success) {
            setItems(prev => prev.filter(i => i.id !== id));
            if (selectedId === id) setSelectedId(null);
            toast('Deleted');
        } else {
            toast(res.message ?? 'Delete failed', true);
        }
    };

    const selected = items.find(i => i.id === selectedId) ?? null;
    const openMedia = (item: AdminContentItem, index: number) =>
        setLightbox({ media: item.media ?? [], index, who: item.authorName ?? item.authorCid ?? 'Unknown' });

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Input value={q} onChange={setQ} onEnter={submit} placeholder={`${searchPlaceholder} — press Enter`} />
                <Btn variant="primary" onClick={submit} disabled={q.trim().length === 1}>Search</Btn>
            </div>

            <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1 space-y-4">
                    {grid ? (
                        <div className="grid grid-cols-4 gap-3">
                            {items.map(item => (
                                <div
                                    key={item.id}
                                    className={clsx(
                                        'overflow-hidden rounded-xl bg-white/[0.035] ring-1 transition-colors',
                                        item.id === selectedId ? 'ring-ios-blue/60' : 'ring-white/[0.06]',
                                    )}
                                >
                                    <button
                                        type="button"
                                        onClick={() => openMedia(item, 0)}
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
                    ) : (
                        <Card>
                            {items.map(item => {
                                const active = item.id === selectedId;
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setSelectedId(active ? null : item.id)}
                                        className={clsx(
                                            'cursor-pointer border-t border-white/[0.05] px-4 py-3 transition-colors first:border-t-0',
                                            active ? 'bg-ios-blue/[0.10]' : 'hover:bg-white/[0.03]',
                                        )}
                                    >
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
                                                <MediaStrip media={item.media} className="mt-2" onOpen={i => openMedia(item, i)} />
                                                <div className="mt-1.5 flex items-center gap-4 text-[11.5px] text-zinc-500">
                                                    {typeof item.price === 'number' && <span>${item.price.toLocaleString()}</span>}
                                                    <Stat icon={<Heart size={12} />} value={item.likes} />
                                                    <Stat icon={<MessageCircle size={12} />} value={item.comments} />
                                                    <Stat icon={<Eye size={12} />} value={item.views} />
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
                                );
                            })}
                            {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
                            {!loading && items.length === 0 && (
                                <CenterNote>{query ? `Nothing matched “${query}”.` : emptyLabel}</CenterNote>
                            )}
                            <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
                        </Card>
                    )}

                    {grid && (
                        <>
                            {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
                            {!loading && items.length === 0 && (
                                <CenterNote>{query ? `Nothing matched “${query}”.` : emptyLabel}</CenterNote>
                            )}
                            <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
                        </>
                    )}
                </div>

                {selected && (
                    <ContentDetail
                        key={selected.id}
                        app={app}
                        item={selected}
                        threaded={threaded}
                        deletable={deletable}
                        threadLabel={threadLabel}
                        onOpenPlayer={onOpenPlayer}
                        onDelete={setDoomed}
                        onClose={() => setSelectedId(null)}
                        toast={toast}
                    />
                )}
            </div>

            {lightbox && lightbox.media.length > 0 && (
                <MediaLightbox
                    media={lightbox.media}
                    index={lightbox.index}
                    onIndex={i => setLightbox(prev => prev && { ...prev, index: i })}
                    onClose={() => setLightbox(null)}
                    caption={<span className="font-semibold text-zinc-200">{lightbox.who}</span>}
                />
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
