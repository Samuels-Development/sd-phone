import { useState } from 'react';
import { ArrowUp, Heart, X } from 'lucide-react';

import { Sheet } from '@/ui/Sheet';
import { GifPickerSheet } from '@/shared/chat/GifPickerSheet';
import { EmptyState } from '@/ui/EmptyState';
import { MessageCircle } from 'lucide-react';
import { t } from '@/i18n';
import { Avatar, FadeImg, ListSkeleton, VerifiedBadge } from './ui';
import { useAsyncData } from '@/hooks/useAsyncData';
import { HEART, fmt, type VComment, type VPost } from './data';
import { apiAddComment, apiComments, apiToggleCommentLike } from './vibezApi';

export function CommentsSheet({ post, onClose, onCountChange }: {
    post:          VPost;
    onClose:       () => void;
    onCountChange: (postId: string, count: number) => void;
}) {
    const [comments, setComments] = useState<VComment[]>([]);
    const [draft,    setDraft]    = useState('');
    const [sending,  setSending]  = useState(false);
    const [gif,      setGif]      = useState<string | null>(null);
    const [gifOpen,  setGifOpen]  = useState(false);

    const { loading } = useAsyncData<VComment[]>(
        () => apiComments(post.id),
        [post.id],
        { onData: setComments },
    );

    function toggleLike(id: string) {
        setComments(prev => prev.map(c => c.id === id
            ? { ...c, liked: !c.liked, likes: c.likes + (c.liked ? -1 : 1) }
            : c));
        void apiToggleCommentLike(id);
    }

    async function send() {
        const text = draft.trim();
        if ((!text && !gif) || sending) return;
        setSending(true);
        const r = await apiAddComment(post.id, text, gif ?? undefined);
        setSending(false);
        if (!r) return;
        setDraft('');
        setGif(null);
        setComments(prev => [...prev, r.comment]);
        onCountChange(post.id, r.count);
    }

    return (
        <Sheet
            onClose={onClose}
            forceDark
            top="28%"
            title={t('vibez.commentCount', '{count} comments', { count: fmt(comments.length || post.comments) })}
            className="font-sf bg-[#141416]"
        >
            {() => (
                <>
                    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-2">
                        {loading && comments.length === 0 ? (
                            <ListSkeleton count={5} />
                        ) : comments.length === 0 ? (
                            <div className="dark">
                                <EmptyState
                                    icon={MessageCircle}
                                    title={t('vibez.noCommentsTitle', 'No comments yet')}
                                    subtitle={t('vibez.noComments', 'Say something nice.')}
                                    circleClassName="bg-white/10"
                                />
                            </div>
                        ) : comments.map(c => (
                            <div key={c.id} className="flex items-start gap-3 py-3">
                                <div className="mt-0.5 shrink-0">
                                    <Avatar size={38} src={c.user.avatar} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1 text-[13px] font-semibold text-white/55">
                                        {c.user.handle}
                                        {c.user.verified && (
                                            <VerifiedBadge size={14} />
                                        )}
                                    </div>
                                    {c.text !== '' && (
                                        <p className="mt-0.5 text-[15px] leading-snug text-white">{c.text}</p>
                                    )}
                                    {c.gifUrl && (
                                        <FadeImg
                                            src={c.gifUrl}
                                            className="mt-2 max-h-[168px] w-auto max-w-full rounded-[14px] object-cover"
                                        />
                                    )}
                                    <span className="mt-1 block text-[12.5px] text-white/40">{c.time}</span>
                                </div>
                                <button
                                    type="button"
                                    aria-label={t('vibez.like', 'Like')}
                                    onClick={() => toggleLike(c.id)}
                                    className="flex w-9 shrink-0 flex-col items-center gap-1 pt-1.5 active:scale-90"
                                >
                                    <Heart
                                        className="h-[25px] w-[25px]"
                                        style={c.liked ? { color: HEART, fill: HEART } : { color: 'rgba(255,255,255,0.45)' }}
                                        strokeWidth={c.liked ? 0 : 1.9}
                                    />
                                    {c.likes > 0 && <span className="text-[12.5px] font-medium text-white/50">{fmt(c.likes)}</span>}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="shrink-0 border-t border-white/10 px-4 pb-[26px] pt-2.5">
                        {gif && (
                            <div className="relative mb-2.5 inline-block">
                                <img src={gif} alt="" draggable={false} className="h-[96px] rounded-[14px] object-cover" />
                                <button
                                    type="button"
                                    aria-label={t('vibez.removeGif', 'Remove GIF')}
                                    onClick={() => setGif(null)}
                                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/80 text-white ring-1 ring-white/20 active:opacity-70"
                                >
                                    <X className="h-3.5 w-3.5" strokeWidth={2.6} />
                                </button>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <input
                                value={draft}
                                onChange={e => setDraft(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') void send(); }}
                                placeholder={t('vibez.addComment', 'Add a comment…')}
                                spellCheck={false}
                                className="h-[42px] min-w-0 flex-1 rounded-full bg-white/10 px-4 text-[15px] text-white outline-none placeholder:text-white/40"
                            />
                            <button
                                type="button"
                                aria-label={t('vibez.addGif', 'Add GIF')}
                                onClick={() => setGifOpen(true)}
                                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-white/10 active:opacity-70"
                            >
                                <span
                                    className="rounded-[6px] border-2 border-white/70 px-[4px] py-[2px] text-[11px] font-extrabold leading-none text-white/70"
                                >
                                    GIF
                                </span>
                            </button>
                            <button
                                type="button"
                                aria-label={t('vibez.send', 'Send')}
                                onClick={() => void send()}
                                disabled={(!draft.trim() && !gif) || sending}
                                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-white text-black transition-opacity active:scale-90 disabled:bg-white/15 disabled:text-white/40"
                            >
                                <ArrowUp className="h-5 w-5" strokeWidth={2.6} />
                            </button>
                        </div>
                    </div>

                    {gifOpen && (
                        <GifPickerSheet
                            onSelect={url => { setGif(url); setGifOpen(false); }}
                            onClose={() => setGifOpen(false)}
                        />
                    )}
                </>
            )}
        </Sheet>
    );
}
