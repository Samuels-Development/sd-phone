import { useState } from 'react';
import { Heart, MessageCircle, Repeat2 } from 'lucide-react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { LIKE, META, REPOST, relativeTime, type BirdyPoll, type BirdyPost } from '../data';
import { compactCount } from '../polish/format';
import { HeartBurst } from '../polish/HeartBurst';
import { PollBlock } from './PollBlock';
import { Avatar, PostImages, RichText, VerifiedBadge } from '../ui';

export function PostCard({ post, isOwn, onToggleLike, onToggleRepost, onOpen, onOpenAuthor, onPollVoted }: {
    post:          BirdyPost;
    isOwn:         boolean;
    onToggleLike:  () => void;
    onToggleRepost?: () => void;
    onOpen?:       () => void;
    onOpenAuthor?: (handle: string) => void;
    onPollVoted?:  (poll: BirdyPoll) => void;
}) {
    const openAuthor = (e: React.MouseEvent) => {
        if (!onOpenAuthor) return;
        e.stopPropagation();
        onOpenAuthor(post.author.handle);
    };

    const openReposter = (e: React.MouseEvent) => {
        if (!onOpenAuthor || !post.repostedBy) return;
        e.stopPropagation();
        onOpenAuthor(post.repostedBy.handle);
    };

    const reposted = post.reposted === true;
    const [confirmRepost, setConfirmRepost] = useState(false);
    const repostCount = post.reposts;

    return (
        <>
        <article
            onClick={onOpen}
            className={`relative border-b border-hairline/10 px-4 py-[18px] ${onOpen ? 'cursor-pointer transition-colors hover:bg-hairline/[0.04]' : ''}`}
        >
            {post.repostedBy && (
                <div className="mb-2 flex items-center gap-4 text-[14px] font-semibold" style={{ color: META }}>
                    <span className="flex w-[60px] shrink-0 justify-end"><Repeat2 className="h-[18px] w-[18px]" strokeWidth={2.4} /></span>
                    <button
                        type="button"
                        onClick={openReposter}
                        className="flex min-w-0 items-center gap-1.5 text-start active:opacity-60"
                    >
                        <Avatar size={20} src={post.repostedBy.avatar} />
                        <span className="truncate">{t('squawk.userReposted', '{name} reposted', { name: post.repostedBy.name })}</span>
                    </button>
                </div>
            )}

            <div className="flex gap-4">
            <button type="button" onClick={openAuthor} className="h-fit shrink-0">
                <Avatar size={60} src={post.author.avatar} />
            </button>

            <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1 leading-tight">
                    <button type="button" onClick={openAuthor} className="flex min-w-0 items-baseline gap-1 text-start">
                        <span dir="auto" className="min-w-0 truncate text-[19px] font-bold text-label">{post.author.name}</span>
                        {post.author.verified && (
                            <span className="shrink-0 self-center"><VerifiedBadge size={18} type={post.author.verifiedType} /></span>
                        )}
                        <span dir="ltr" className="max-w-[16ch] shrink-0 truncate text-[15px]" style={{ color: META }}>@{post.author.handle}</span>
                    </button>
                    <span className="ms-auto shrink-0 ps-2 text-[15px]" style={{ color: META }}>{relativeTime(post.createdAt)}</span>
                </div>

                {post.body && (
                    <p dir="auto" className="mt-1 whitespace-pre-wrap break-words text-[19px] leading-snug text-label">
                        <RichText text={post.body} />
                    </p>
                )}

                <PostImages images={post.images} />

                {post.poll && <PollBlock postId={post.id} poll={post.poll} onVoted={onPollVoted} />}

                <div className="mt-4 flex max-w-[21rem] items-center justify-between">
                    <ActionButton
                        tone="comment"
                        icon={<MessageCircle className="h-[27px] w-[27px]" strokeWidth={1.9} />}
                        count={post.replies}
                        onClick={onOpen}
                    />
                    <ActionButton
                        tone="repost"
                        icon={<Repeat2 className="h-[29px] w-[29px]" strokeWidth={1.9} />}
                        count={repostCount}
                        color={reposted ? REPOST : undefined}
                        disabled={isOwn}
                        label={isOwn
                            ? t('squawk.cannotRepostOwn', 'You cannot repost your own post')
                            : t('squawk.repost', 'Repost')}
                        onClick={() => setConfirmRepost(true)}
                    />
                    <ActionButton
                        tone="like"
                        icon={
                            <HeartBurst liked={post.liked === true}>
                                <Heart
                                    className="h-[27px] w-[27px]"
                                    strokeWidth={1.9}
                                    fill={post.liked ? LIKE : 'none'}
                                    color={post.liked ? LIKE : 'currentColor'}
                                />
                            </HeartBurst>
                        }
                        count={post.likes}
                        color={post.liked ? LIKE : undefined}
                        onClick={onToggleLike}
                    />
                </div>
            </div>
            </div>
        </article>

        {confirmRepost && (
            <AlertDialog
                title={reposted ? t('squawk.undoRetweet', 'Undo Retweet') : t('squawk.retweet', 'Retweet')}
                message={reposted
                    ? t('squawk.removeRetweetMessage', "Remove your retweet of {name}'s post?", { name: post.author.name })
                    : t('squawk.retweetMessage', "Are you sure you want to retweet {name}'s post?", { name: post.author.name })}
                confirmLabel={reposted ? t('squawk.undo', 'Undo') : t('squawk.retweet', 'Retweet')}
                onCancel={() => setConfirmRepost(false)}
                onConfirm={() => { onToggleRepost?.(); setConfirmRepost(false); }}
            />
        )}
        </>
    );
}

const TONE: Record<'comment' | 'repost' | 'like', { text: string; bg: string }> = {
    comment: { text: 'group-hover:text-ios-blue', bg: 'group-hover:bg-ios-blue/10' },
    repost:  { text: 'group-hover:text-[#00ba7c]', bg: 'group-hover:bg-[#00ba7c]/10' },
    like:    { text: 'group-hover:text-[#f91880]', bg: 'group-hover:bg-[#f91880]/10' },
};

function ActionButton({ icon, count, color, tone, disabled, label, onClick }: {
    icon:      React.ReactNode;
    count:     number;
    color?:    string;
    tone:      'comment' | 'repost' | 'like';
    disabled?: boolean;
    label?:    string;
    onClick?:  () => void;
}) {
    const t = TONE[tone];
    const active = color != null;
    return (
        <button
            type="button"
            disabled={disabled}
            aria-label={label}
            onClick={e => { e.stopPropagation(); onClick?.(); }}
            className={`group flex items-center gap-1 transition-transform ${disabled ? 'cursor-default opacity-40' : 'active:scale-90'} ${active ? '' : `text-ios-gray ${disabled ? '' : t.text}`}`}
            style={active ? { color } : undefined}
        >
            <span className={`-m-1.5 flex h-10 w-10 items-center justify-center rounded-full transition-colors ${t.bg}`}>
                {icon}
            </span>
            <span className="min-w-[1.5rem] text-start text-[16px] tabular-nums">{compactCount(count)}</span>
        </button>
    );
}
