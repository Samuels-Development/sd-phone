import { useRef, useState } from 'react';
import { ArrowLeft, Heart, Image as ImageIcon, MessageCircle, Repeat2, X } from 'lucide-react';

import { t } from '@/i18n';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { GifPickerSheet } from '@/shared/chat/GifPickerSheet';
import { absoluteTime, BG, BLUE, LIKE, MAX_POST_LENGTH, META, PILL, REPOST, type BirdyAuthor, type BirdyPost } from '../data';
import { compactCount } from '../polish/format';
import { HeartBurst } from '../polish/HeartBurst';
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
    onReply?:          (body: string, images: string[]) => void;
}) {
    const [reply, setReply] = useState('');
    const [media, setMedia] = useState<string[]>([]);
    const [picking, setPicking] = useState<'photo' | 'gif' | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const openAuthor = () => onOpenAuthor?.(post.author.handle);
    const canSend = reply.trim().length > 0 || media.length > 0;

    function sendReply() {
        if (!canSend || !onReply) return;
        onReply(reply.trim(), media);
        setReply('');
        setMedia([]);
    }

    function addMedia(urls: string[]) {
        setMedia(prev => [...prev, ...urls].slice(0, MAX_REPLY_IMAGES));
        setPicking(null);
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

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                <div className="px-4 pt-3">
                    <button type="button" onClick={openAuthor} className="flex items-center gap-3 text-left">
                        <Avatar size={42} src={post.author.avatar} />
                        <div className="min-w-0 leading-tight">
                            <div className="flex items-center gap-1">
                                <span className="text-[15px] font-bold text-black">{post.author.name}</span>
                                {post.author.verified && <VerifiedBadge size={15} />}
                            </div>
                            <div className="text-[14px]" style={{ color: META }}>@{post.author.handle}</div>
                        </div>
                    </button>

                    {post.body && (
                        <p className="mt-3 whitespace-pre-wrap break-words text-[22px] leading-[1.35] text-black">
                            <RichText text={post.body} />
                        </p>
                    )}

                    <PostImages images={post.images} />

                    <div className="mt-3 text-[14px]" style={{ color: META }}>
                        {absoluteTime(post.createdAt)} · <span className="font-semibold text-black">{compactCount(post.views ?? 0)}</span> {t('birdy.views', 'views')}
                    </div>
                </div>

                <div className="mx-4 mt-3 border-t border-black/10 py-3 text-[14px]" style={{ color: META }}>
                    <span className="font-bold text-black">{compactCount(post.reposts)}</span> {t('birdy.reposts', 'Reposts')}
                    <span className="ml-5 font-bold text-black">{compactCount(post.likes)}</span> {t('birdy.likes', 'Likes')}
                </div>

                <div className="mx-4 flex items-center justify-around border-y border-black/10 py-2.5" style={{ color: META }}>
                    <button type="button" aria-label={t('birdy.reply', 'Reply')} onClick={() => inputRef.current?.focus()} className="transition-transform active:scale-90"><MessageCircle className="h-[22px] w-[22px]" strokeWidth={1.8} /></button>
                    <button type="button" aria-label={t('birdy.repost', 'Repost')} onClick={onToggleRepost} className="transition-transform active:scale-90" style={post.reposted ? { color: REPOST } : undefined}><Repeat2 className="h-[22px] w-[22px]" strokeWidth={1.8} /></button>
                    <button type="button" aria-label={t('birdy.like', 'Like')} onClick={onToggleLike} className="transition-transform active:scale-90" style={post.liked ? { color: LIKE } : undefined}>
                        <HeartBurst liked={post.liked === true}>
                            <Heart className="h-[22px] w-[22px]" strokeWidth={1.8} fill={post.liked ? LIKE : 'none'} color={post.liked ? LIKE : 'currentColor'} />
                        </HeartBurst>
                    </button>
                </div>

                {(post.thread?.length ?? 0) > 0 && (
                    <p className="px-4 pt-3 text-[13px] font-semibold uppercase tracking-wide" style={{ color: META }}>
                        {t('birdy.replies', 'Replies')}
                    </p>
                )}
                {post.thread?.map(r => (
                    <div key={r.id} className="relative">
                        {/* Thread rail: ties each reply back to the focal post, Twitter-style. */}
                        <span aria-hidden className="absolute bottom-0 left-[43px] top-0 w-[2px] rounded bg-black/[0.08]" />
                        <PostCard
                            post={r}
                            isOwn={r.author.handle === me.handle}
                            onToggleLike={() => onToggleReplyLike(r.id)}
                            onOpenAuthor={onOpenAuthor}
                        />
                    </div>
                ))}
            </div>

            {onReply && (
                <div className="shrink-0 border-t border-black/10" style={{ background: BG }}>
                    {media.length > 0 && (
                        <div className="flex gap-2 px-3 pt-2">
                            {media.map((url, i) => (
                                <div key={`${url}-${i}`} className="relative">
                                    <img src={url} alt="" draggable={false} className="h-14 w-14 rounded-[10px] object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => setMedia(prev => prev.filter((_, idx) => idx !== i))}
                                        aria-label={t('birdy.removeImage', 'Remove image')}
                                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 active:opacity-70"
                                    >
                                        <X className="h-[12px] w-[12px] text-white" strokeWidth={2.6} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex items-center gap-1 px-3 py-2">
                        <button
                            type="button"
                            aria-label={t('birdy.addImage', 'Add image')}
                            disabled={media.length >= MAX_REPLY_IMAGES}
                            onClick={() => setPicking('photo')}
                            className="flex h-9 w-8 shrink-0 items-center justify-center rounded-full active:bg-black/5 disabled:opacity-40"
                        >
                            <ImageIcon className="h-[21px] w-[21px]" style={{ color: BLUE }} strokeWidth={2} />
                        </button>
                        <button
                            type="button"
                            aria-label={t('birdy.addGif', 'Add GIF')}
                            disabled={media.length >= MAX_REPLY_IMAGES}
                            onClick={() => setPicking('gif')}
                            className="mr-1 flex h-9 w-8 shrink-0 items-center justify-center rounded-full active:bg-black/5 disabled:opacity-40"
                        >
                            <span className="rounded-[5px] border-[1.5px] px-[3px] py-[1.5px] text-[10px] font-extrabold leading-none" style={{ borderColor: BLUE, color: BLUE }}>GIF</span>
                        </button>
                        <input
                            ref={inputRef}
                            value={reply}
                            onChange={e => setReply(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') sendReply(); }}
                            maxLength={MAX_POST_LENGTH}
                            placeholder={t('birdy.postYourReply', 'Post your reply')}
                            className="min-w-0 flex-1 rounded-full px-4 py-2 text-[15px] text-black outline-none placeholder:text-[#657786]"
                            style={{ background: PILL, caretColor: BLUE }}
                        />
                        <button
                            type="button"
                            onClick={sendReply}
                            disabled={!canSend}
                            className="shrink-0 rounded-full px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50"
                            style={{ background: BLUE }}
                        >
                            {t('birdy.reply', 'Reply')}
                        </button>
                    </div>
                </div>
            )}

            {picking === 'photo' && (
                <MediaPickerSheet
                    multiple
                    onSelectMany={ps => addMedia(ps.map(p => p.url))}
                    onClose={() => setPicking(null)}
                />
            )}
            {picking === 'gif' && (
                <GifPickerSheet onSelect={url => addMedia([url])} onClose={() => setPicking(null)} />
            )}
        </div>
    );
}

const MAX_REPLY_IMAGES = 3;
