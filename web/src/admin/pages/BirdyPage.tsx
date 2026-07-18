import { useCallback, useState } from 'react';
import { BadgeCheck, Eye, Heart, ImageIcon, MessageCircle, Trash2, UserSearch } from 'lucide-react';

import { adminBirdyDeletePost, adminBirdyPosts } from '../adminApi';
import { fmtTime, type AdminBirdyPost } from '../types';
import { Badge, Btn, Card, CenterNote, ConfirmModal, Input, LoadMore, OnlineDot, Spinner } from '../ui';
import { usePaged } from '../usePaged';

export function PostCard({ post, onOpenPlayer, onDelete, showAuthorIdentity = true }: {
    post: AdminBirdyPost;
    onOpenPlayer?: (cid: string) => void;
    onDelete: (id: string) => void;
    showAuthorIdentity?: boolean;
}) {
    return (
        <div className="border-t border-white/[0.05] px-4 py-3 first:border-t-0">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px]">
                        <span className="font-bold text-zinc-100">{post.display ?? 'Deleted profile'}</span>
                        {post.verified && <BadgeCheck size={14} className="text-ios-blue" />}
                        {post.handle && <span className="text-zinc-500">@{post.handle}</span>}
                        {post.parentId && <Badge tone="neutral">reply</Badge>}
                        <span className="text-zinc-600">·</span>
                        <span className="text-[12px] text-zinc-500">{fmtTime(post.createdAt)}</span>
                    </div>
                    {showAuthorIdentity && (
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-zinc-500">
                            <OnlineDot online={post.authorOnline} />
                            <span className="font-semibold text-zinc-400">{post.authorName ?? 'Unknown player'}</span>
                            <span className="font-mono">{post.authorCid}</span>
                        </div>
                    )}
                    <div className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-snug text-zinc-200">
                        {post.body || <span className="italic text-zinc-500">(no text)</span>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 text-[11.5px] text-zinc-500">
                        <span className="inline-flex items-center gap-1"><Heart size={12} /> {post.likes}</span>
                        <span className="inline-flex items-center gap-1"><MessageCircle size={12} /> {post.replies}</span>
                        <span className="inline-flex items-center gap-1"><Eye size={12} /> {post.views}</span>
                        {!!post.images?.length && (
                            <span className="inline-flex items-center gap-1"><ImageIcon size={12} /> {post.images.length} image{post.images.length > 1 ? 's' : ''}</span>
                        )}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {onOpenPlayer && (
                        <Btn variant="subtle" title="Open player" onClick={() => onOpenPlayer(post.authorCid)}>
                            <UserSearch size={14} />
                        </Btn>
                    )}
                    <Btn variant="danger" title="Delete post" onClick={() => onDelete(post.id)}>
                        <Trash2 size={14} />
                    </Btn>
                </div>
            </div>
        </div>
    );
}

export function BirdyPage({ onOpenPlayer, toast }: {
    onOpenPlayer: (cid: string) => void;
    toast: (text: string, error?: boolean) => void;
}) {
    const [q, setQ] = useState('');
    // Only an Enter press hits the database; typing alone never queries.
    const [query, setQuery] = useState('');
    const [doomed, setDoomed] = useState<string | null>(null);
    const submit = () => {
        const text = q.trim();
        if (text.length === 0 || text.length >= 2) setQuery(text);
    };

    const fetchPage = useCallback(async (cursor: string | null) => {
        const res = await adminBirdyPosts({ cursor, q: query });
        if (!res.success || !res.data) return null;
        return { items: res.data.posts, nextCursor: res.data.nextCursor };
    }, [query]);

    const { items, loading, hasMore, loadMore, setItems } = usePaged<AdminBirdyPost, string>(fetchPage, `birdy:${query}`);

    const remove = async (id: string) => {
        const res = await adminBirdyDeletePost(id);
        if (res.success) {
            setItems(prev => prev.filter(p => p.id !== id));
            toast('Post deleted');
        } else {
            toast(res.message ?? 'Delete failed', true);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <Input value={q} onChange={setQ} onEnter={submit} placeholder="Filter posts by content or handle — press Enter" />
                <Btn variant="primary" onClick={submit} disabled={q.trim().length === 1}>Search</Btn>
            </div>

            <Card>
                {items.map(p => (
                    <PostCard key={p.id} post={p} onOpenPlayer={onOpenPlayer} onDelete={setDoomed} />
                ))}
                {loading && items.length === 0 && <CenterNote><Spinner /></CenterNote>}
                {!loading && items.length === 0 && <CenterNote>No posts{query ? ` matching “${query}”` : ' yet'}.</CenterNote>}
                <LoadMore onClick={loadMore} loading={loading} hasMore={hasMore} />
            </Card>

            {doomed && (
                <ConfirmModal
                    title="Delete Birdy post"
                    body="The post, its replies and their likes are permanently removed. This cannot be undone."
                    confirmLabel="Delete post"
                    danger
                    onConfirm={() => remove(doomed)}
                    onClose={() => setDoomed(null)}
                />
            )}
        </div>
    );
}
