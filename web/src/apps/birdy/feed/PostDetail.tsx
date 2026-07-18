import { useRef, useState } from 'react';
import { ArrowLeft, Heart, MessageCircle, Repeat2 } from 'lucide-react';

import { t } from '@/i18n';
import { absoluteTime, BG, BLUE, LIKE, META, PILL, REPOST, type BirdyAuthor, type BirdyPost } from '../data';
import { PostCard } from './PostCard';
import { Avatar, PostImages, RichText, VerifiedBadge } from '../ui';

export function PostDetail({ post, me, onBack, onToggleLike, onToggleRepost, onToggleReplyLike, onOpenAuthor, onReply }: {
    post:              BirdyPost;
    me:                BirdyAuthor;
    onBack:            () => void;
    onToggleLike:      () => void;
    onToggleRepost:    () => void;
    onToggleReplyLike: (replyId: string) => void;
    onOpenAuthor?:     (handle: string) => void;
    onReply?:          (body: string) => void;
}) {
    const [reply, setReply] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const openAuthor = () => onOpenAuthor?.(post.author.handle);

    function sendReply() {
        const body = reply.trim();
        if (!body || !onReply) return;
        onReply(body);
        setReply('');
    }

    return (
        <div className="flex h-full flex-col" style={{ background: BG }}>
            <header className="flex shrink-0 items-center border-b border-black/10 px-3 py-2.5">
                <button type="button" onClick={onBack} aria-label={t('birdy.back', 'Back')} style={{ color: BLUE }}>
                    <ArrowLeft className="h-6 w-6" strokeWidth={2.4} />
                </button>
                <div className="flex-1 text-center text-[17px] font-bold text-black">{t('birdy.postTitle', 'Post')}</div>
                <div className="w-6" aria-hidden />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="px-4 pt-3">
                    <button type="button" onClick={openAuthor} className="flex items-center gap-3 text-left">
                        <Avatar size={42} />
                        <div className="min-w-0 leading-tight">
                            <div className="flex items-center gap-1">
                                <span className="text-[15px] font-bold text-black">{post.author.name}</span>
                                {post.author.verified && <VerifiedBadge size={15} />}
                            </div>
                            <div className="text-[14px]" style={{ color: META }}>@{post.author.handle}</div>
                        </div>
                    </button>

                    {post.body && (
                        <p className="mt-3 whitespace-pre-wrap break-words text-[18px] leading-snug text-black">
                            <RichText text={post.body} />
                        </p>
                    )}

                    <PostImages images={post.images} />

                    <div className="mt-3 text-[14px]" style={{ color: META }}>
                        {absoluteTime(post.createdAt)} · {post.views ?? 0} {t('birdy.views', 'views')}
                    </div>
                </div>

                <div className="mx-4 mt-3 border-t border-black/10 py-3 text-[14px]" style={{ color: META }}>
                    <span className="font-bold text-black">{post.reposts}</span> {t('birdy.reposts', 'Reposts')}
                    <span className="ml-5 font-bold text-black">{post.likes}</span> {t('birdy.likes', 'Likes')}
                </div>

                <div className="mx-4 flex items-center justify-around border-y border-black/10 py-2.5" style={{ color: META }}>
                    <button type="button" aria-label={t('birdy.reply', 'Reply')} onClick={() => inputRef.current?.focus()}><MessageCircle className="h-[22px] w-[22px]" strokeWidth={1.8} /></button>
                    <button type="button" aria-label={t('birdy.repost', 'Repost')} onClick={onToggleRepost} style={post.reposted ? { color: REPOST } : undefined}><Repeat2 className="h-[22px] w-[22px]" strokeWidth={1.8} /></button>
                    <button type="button" aria-label={t('birdy.like', 'Like')} onClick={onToggleLike} style={post.liked ? { color: LIKE } : undefined}>
                        <Heart className="h-[22px] w-[22px]" strokeWidth={1.8} fill={post.liked ? LIKE : 'none'} color={post.liked ? LIKE : 'currentColor'} />
                    </button>
                </div>

                {post.thread?.map(r => (
                    <PostCard
                        key={r.id}
                        post={r}
                        isOwn={r.author.handle === me.handle}
                        onToggleLike={() => onToggleReplyLike(r.id)}
                        onOpenAuthor={onOpenAuthor}
                    />
                ))}
            </div>

            {onReply && (
                <div className="flex shrink-0 items-center gap-2 border-t border-black/10 px-3 py-2" style={{ background: BG }}>
                    <input
                        ref={inputRef}
                        value={reply}
                        onChange={e => setReply(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') sendReply(); }}
                        placeholder={t('birdy.postYourReply', 'Post your reply')}
                        className="min-w-0 flex-1 rounded-full px-4 py-2 text-[15px] text-black outline-none placeholder:text-[#657786]"
                        style={{ background: PILL, caretColor: BLUE }}
                    />
                    <button
                        type="button"
                        onClick={sendReply}
                        disabled={!reply.trim()}
                        className="shrink-0 rounded-full px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50"
                        style={{ background: BLUE }}
                    >
                        {t('birdy.reply', 'Reply')}
                    </button>
                </div>
            )}
        </div>
    );
}
