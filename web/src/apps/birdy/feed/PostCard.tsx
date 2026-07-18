import { useState } from 'react';
import { Heart, MessageCircle, MoreHorizontal, Repeat2 } from 'lucide-react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { LIKE, META, REPOST, relativeTime, type BirdyPost } from '../data';
import { Avatar, PostImages, RichText, VerifiedBadge } from '../ui';

export function PostCard({ post, isOwn, onToggleLike, onToggleRepost, onOpen, onOpenAuthor }: {
    post:          BirdyPost;
    isOwn:         boolean;
    onToggleLike:  () => void;
    onToggleRepost?: () => void;
    onOpen?:       () => void;
    onOpenAuthor?: (handle: string) => void;
}) {
    const openAuthor = (e: React.MouseEvent) => {
        if (!onOpenAuthor) return;
        e.stopPropagation();
        onOpenAuthor(post.author.handle);
    };

    // Server truth; the parent applies the optimistic flip.
    const reposted = post.reposted === true;
    const [confirmRepost, setConfirmRepost] = useState(false);
    const repostCount = post.reposts;

    return (
        <>
        <article
            onClick={onOpen}
            className={`flex gap-3.5 border-b border-black/10 px-4 py-4 ${onOpen ? 'cursor-pointer transition-colors hover:bg-black/[0.04]' : ''}`}
        >
            <button type="button" onClick={openAuthor} className="h-fit shrink-0">
                <Avatar size={56} />
            </button>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 text-[18px] leading-tight">
                    <button type="button" onClick={openAuthor} className="flex min-w-0 items-center gap-1 text-left">
                        <span className="font-bold text-black">{post.author.name}</span>
                        {post.author.verified && <VerifiedBadge size={19} />}
                        <span className="truncate" style={{ color: META }}>@{post.author.handle}</span>
                    </button>
                    <span style={{ color: META }}>· {relativeTime(post.createdAt)}</span>
                    {isOwn && (
                        <button
                            type="button"
                            onClick={e => e.stopPropagation()}
                            className="ml-auto -mr-1 p-1"
                            aria-label={t('birdy.more', 'More')}
                            style={{ color: META }}
                        >
                            <MoreHorizontal className="h-[21px] w-[21px]" />
                        </button>
                    )}
                </div>

                {post.body && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-[18px] leading-snug text-black">
                        <RichText text={post.body} />
                    </p>
                )}

                <PostImages images={post.images} />

                <div className="mt-3.5 flex max-w-[20rem] items-center justify-between">
                    <ActionButton
                        tone="comment"
                        icon={<MessageCircle className="h-[25px] w-[25px]" strokeWidth={1.9} />}
                        count={post.replies}
                        onClick={onOpen}
                    />
                    <ActionButton
                        tone="repost"
                        icon={<Repeat2 className="h-[27px] w-[27px]" strokeWidth={1.9} />}
                        count={repostCount}
                        color={reposted ? REPOST : undefined}
                        onClick={() => setConfirmRepost(true)}
                    />
                    <ActionButton
                        tone="like"
                        icon={
                            <Heart
                                className="h-[25px] w-[25px]"
                                strokeWidth={1.9}
                                fill={post.liked ? LIKE : 'none'}
                                color={post.liked ? LIKE : 'currentColor'}
                            />
                        }
                        count={post.likes}
                        color={post.liked ? LIKE : undefined}
                        onClick={onToggleLike}
                    />
                </div>
            </div>
        </article>

        {confirmRepost && (
            <AlertDialog
                title={reposted ? t('birdy.undoRetweet', 'Undo Retweet') : t('birdy.retweet', 'Retweet')}
                message={reposted
                    ? t('birdy.removeRetweetMessage', "Remove your retweet of {name}'s post?", { name: post.author.name })
                    : t('birdy.retweetMessage', "Are you sure you want to retweet {name}'s post?", { name: post.author.name })}
                confirmLabel={reposted ? t('birdy.undo', 'Undo') : t('birdy.retweet', 'Retweet')}
                onCancel={() => setConfirmRepost(false)}
                onConfirm={() => { onToggleRepost?.(); setConfirmRepost(false); }}
            />
        )}
        </>
    );
}

const TONE: Record<'comment' | 'repost' | 'like', { text: string; bg: string }> = {
    comment: { text: 'group-hover:text-[#1d9bf0]', bg: 'group-hover:bg-[#1d9bf0]/10' },
    repost:  { text: 'group-hover:text-[#00ba7c]', bg: 'group-hover:bg-[#00ba7c]/10' },
    like:    { text: 'group-hover:text-[#f91880]', bg: 'group-hover:bg-[#f91880]/10' },
};

function ActionButton({ icon, count, color, tone, onClick }: {
    icon:     React.ReactNode;
    count:    number;
    color?:   string;
    tone:     'comment' | 'repost' | 'like';
    onClick?: () => void;
}) {
    const t = TONE[tone];
    const active = color != null;
    return (
        <button
            type="button"
            onClick={e => { e.stopPropagation(); onClick?.(); }}
            className={`group flex items-center gap-1 transition-transform active:scale-90 ${active ? '' : `text-[#657786] ${t.text}`}`}
            style={active ? { color } : undefined}
        >
            <span className={`-m-1.5 flex h-9 w-9 items-center justify-center rounded-full transition-colors ${t.bg}`}>
                {icon}
            </span>
            <span className="min-w-[1.5rem] text-left text-[15px] tabular-nums">{count}</span>
        </button>
    );
}
