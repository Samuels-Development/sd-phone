import { useCallback, useEffect, useState } from 'react';
import { Eye, Heart, MessageCircle, Trash2, UserSearch, X } from 'lucide-react';
import clsx from 'clsx';

import { adminContentThread, adminContentThreadDelete } from '../../adminApi';
import { fmtTime, type AdminContentItem, type AdminContentMedia, type AdminThreadItem } from '../../types';
import { Badge, Btn, CenterNote, ConfirmModal, OnlineDot, Spinner } from '../../ui';
import { MediaLightbox, MediaStrip } from './Media';

function Stat({ icon, value }: { icon: React.ReactNode; value?: number | null }) {
    if (typeof value !== 'number' || value === 0) return null;
    return (
        <span className="inline-flex items-center gap-1 tabular-nums">
            {icon}
            {value.toLocaleString()}
        </span>
    );
}

function ThreadRow({ item, deletable, onOpenPlayer, onOpenMedia, onDelete }: {
    item: AdminThreadItem;
    deletable: boolean;
    onOpenPlayer: (cid: string) => void;
    onOpenMedia: (media: AdminContentMedia[], index: number) => void;
    onDelete: (id: string) => void;
}) {
    const who = item.authorName ?? item.handle ?? 'Unknown';
    return (
        <div
            className={clsx(
                'group border-t border-white/[0.05] px-3 py-2 first:border-t-0',
                item.anchor && 'bg-ios-blue/[0.09]',
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px]">
                        <OnlineDot online={item.authorOnline} />
                        <button
                            type="button"
                            disabled={!item.authorCid}
                            onClick={() => item.authorCid && onOpenPlayer(item.authorCid)}
                            className="font-bold text-zinc-200 enabled:hover:underline disabled:cursor-default"
                        >
                            {who}
                        </button>
                        {item.handle && item.authorName && <span className="text-zinc-600">@{item.handle}</span>}
                        {item.direction === 'incoming' && <Badge tone="blue">in</Badge>}
                        {item.anchor && <Badge tone="amber">this one</Badge>}
                        <span className="text-zinc-600">{fmtTime(item.createdAt)}</span>
                    </div>
                    {item.body && (
                        <div className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] leading-snug text-zinc-300">
                            {item.body}
                        </div>
                    )}
                    <MediaStrip media={item.media} size={52} max={4} className="mt-1.5" onOpen={i => onOpenMedia(item.media ?? [], i)} />
                    {typeof item.likes === 'number' && item.likes > 0 && (
                        <div className="mt-1 text-[11px] text-zinc-600">
                            <Stat icon={<Heart size={11} />} value={item.likes} />
                        </div>
                    )}
                </div>
                {deletable && (
                    <Btn variant="danger" className="opacity-0 transition-opacity group-hover:opacity-100" title="Delete" onClick={() => onDelete(item.id)}>
                        <Trash2 size={12} />
                    </Btn>
                )}
            </div>
        </div>
    );
}

export function ContentDetail({ app, item, threaded, deletable, threadLabel, onOpenPlayer, onDelete, onClose, toast }: {
    app: string;
    item: AdminContentItem;
    threaded: boolean;
    deletable: boolean;
    threadLabel: string;
    onOpenPlayer: (cid: string) => void;
    onDelete: (id: string) => void;
    onClose: () => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const [thread, setThread] = useState<AdminThreadItem[] | null>(null);
    const [threadDeletable, setThreadDeletable] = useState(false);
    const [loading, setLoading] = useState(false);
    const [lightbox, setLightbox] = useState<{ media: AdminContentMedia[]; index: number } | null>(null);
    const [doomed, setDoomed] = useState<string | null>(null);

    useEffect(() => {
        if (!threaded) { setThread(null); return; }
        let live = true;
        setLoading(true);
        setThread(null);
        void adminContentThread(app, item.id).then(res => {
            if (!live) return;
            setThread(res.success ? res.data?.items ?? [] : []);
            setThreadDeletable(res.success && res.data?.deletable === true);
            setLoading(false);
        });
        return () => { live = false; };
    }, [app, item.id, threaded]);

    const removeThreadItem = useCallback(async (id: string) => {
        const res = await adminContentThreadDelete(app, id);
        if (res.success) {
            setThread(prev => prev?.filter(t => t.id !== id) ?? prev);
            toast('Deleted');
        } else {
            toast(res.message ?? 'Delete failed', true);
        }
    }, [app, toast]);

    const media = item.media ?? [];
    const who = item.authorName ?? item.authorCid ?? 'Unknown author';

    return (
        <div className="sticky top-0 w-[350px] shrink-0 overflow-hidden rounded-xl bg-white/[0.035] ring-1 ring-white/[0.06]">
            <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3.5 py-2.5">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <OnlineDot online={item.authorOnline} />
                        <button
                            type="button"
                            disabled={!item.authorCid}
                            onClick={() => item.authorCid && onOpenPlayer(item.authorCid)}
                            className="truncate text-[13px] font-bold text-zinc-100 enabled:hover:underline disabled:cursor-default"
                        >
                            {who}
                        </button>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                        {item.authorCid && <span className="font-mono">{item.authorCid}</span>}
                        <span>{fmtTime(item.createdAt)}</span>
                    </div>
                </div>
                <button type="button" onClick={onClose} title="Close" className="shrink-0 rounded-lg p-1 text-zinc-500 transition-colors hover:bg-white/10 hover:text-zinc-200">
                    <X size={15} />
                </button>
            </div>

            <div className="admin-scroll max-h-[calc(92vh-190px)] overflow-y-auto">
                {media.length > 0 && (
                    <div className="border-b border-white/[0.06] p-3">
                        <MediaStrip media={media} size={98} max={9} onOpen={i => setLightbox({ media, index: i })} />
                    </div>
                )}

                <div className="space-y-2 px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {item.label && <Badge>{item.label}</Badge>}
                        {item.kind && item.kind !== 'text' && <Badge tone="blue">{item.kind}</Badge>}
                        {typeof item.price === 'number' && <Badge tone="green">${item.price.toLocaleString()}</Badge>}
                    </div>
                    {item.title && <div className="text-[13.5px] font-bold text-zinc-100">{item.title}</div>}
                    <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-200">
                        {item.body || <span className="italic text-zinc-500">(no text)</span>}
                    </div>
                    <div className="flex items-center gap-4 pt-0.5 text-[11.5px] text-zinc-500">
                        <Stat icon={<Heart size={12} />} value={item.likes} />
                        <Stat icon={<MessageCircle size={12} />} value={item.comments} />
                        <Stat icon={<Eye size={12} />} value={item.views} />
                    </div>
                </div>

                {threaded && (
                    <div className="border-t border-white/[0.06]">
                        <div className="px-3.5 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-widest text-zinc-600">
                            {threadLabel}
                        </div>
                        {loading && <CenterNote><Spinner /></CenterNote>}
                        {!loading && thread?.length === 0 && <CenterNote>Nothing to show.</CenterNote>}
                        {!loading && !!thread?.length && (
                            <div>
                                {thread.map(t => (
                                    <ThreadRow
                                        key={t.id}
                                        item={t}
                                        deletable={threadDeletable}
                                        onOpenPlayer={onOpenPlayer}
                                        onOpenMedia={(m, i) => setLightbox({ media: m, index: i })}
                                        onDelete={setDoomed}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] px-3 py-2.5">
                {item.authorCid ? (
                    <Btn variant="subtle" onClick={() => onOpenPlayer(item.authorCid!)}>
                        <UserSearch size={13} /> Open player
                    </Btn>
                ) : <span />}
                {deletable && (
                    <Btn variant="danger" onClick={() => onDelete(item.id)}>
                        <Trash2 size={13} /> Delete
                    </Btn>
                )}
            </div>

            {lightbox && (
                <MediaLightbox
                    media={lightbox.media}
                    index={lightbox.index}
                    onIndex={i => setLightbox(prev => prev && { ...prev, index: i })}
                    onClose={() => setLightbox(null)}
                    caption={<span className="font-semibold text-zinc-200">{who}</span>}
                />
            )}

            {doomed && (
                <ConfirmModal
                    title="Delete"
                    body="This row is permanently removed."
                    confirmLabel="Delete"
                    danger
                    onConfirm={() => removeThreadItem(doomed)}
                    onClose={() => setDoomed(null)}
                />
            )}
        </div>
    );
}
