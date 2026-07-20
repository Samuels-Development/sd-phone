import { useState } from 'react';
import { ArrowUp, BadgeCheck, Heart } from 'lucide-react';

import { Sheet } from '@/ui/Sheet';
import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { GRAD_FROM, HEART, fmt, type VComment, type VPost } from './data';
import { apiAddComment, apiComments, apiToggleCommentLike } from './vibezApi';

export function CommentsSheet({ post, onClose, onCountChange }: {
    post:          VPost;
    onClose:       () => void;
    onCountChange: (postId: string, count: number) => void;
}) {
    const [comments, setComments] = useState<VComment[]>([]);
    const [draft,    setDraft]    = useState('');
    const [sending,  setSending]  = useState(false);

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
        if (!text || sending) return;
        setSending(true);
        const r = await apiAddComment(post.id, text);
        setSending(false);
        if (!r) return;
        setDraft('');
        setComments(prev => [...prev, r.comment]);
        onCountChange(post.id, r.count);
    }

    return (
        <Sheet onClose={onClose} forceDark top="28%" className="font-sf bg-[#161022]">
            {() => (
                <>
                    <div className="relative flex h-11 shrink-0 items-center justify-center">
                        <span className="text-[14px] font-semibold text-white">
                            {t('vibez.commentCount', '{count} comments', { count: fmt(comments.length || post.comments) })}
                        </span>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-2">
                        {loading && comments.length === 0 ? (
                            <p className="pt-10 text-center text-[14px] text-white/45">{t('vibez.loading', 'Loading…')}</p>
                        ) : comments.length === 0 ? (
                            <p className="pt-10 text-center text-[14px] text-white/45">{t('vibez.noComments', 'No comments yet — say something nice.')}</p>
                        ) : comments.map(c => (
                            <div key={c.id} className="flex items-start gap-2.5 py-2.5">
                                <img src={c.user.avatar} alt="" draggable={false} className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover" />
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1 text-[12px] font-semibold text-white/55">
                                        {c.user.handle}
                                        {c.user.verified && (
                                            <BadgeCheck className="h-[13px] w-[13px]" style={{ color: GRAD_FROM, fill: GRAD_FROM }} stroke="#161022" strokeWidth={1.6} />
                                        )}
                                    </div>
                                    <p className="text-[14px] leading-snug text-white">{c.text}</p>
                                    <span className="text-[12px] text-white/40">{c.time}</span>
                                </div>
                                <button
                                    type="button"
                                    aria-label={t('vibez.like', 'Like')}
                                    onClick={() => toggleLike(c.id)}
                                    className="flex shrink-0 flex-col items-center gap-0.5 pt-1 active:scale-90"
                                >
                                    <Heart
                                        className="h-[17px] w-[17px]"
                                        style={c.liked ? { color: HEART, fill: HEART } : { color: 'rgba(255,255,255,0.45)' }}
                                        strokeWidth={c.liked ? 0 : 2}
                                    />
                                    {c.likes > 0 && <span className="text-[11px] text-white/45">{fmt(c.likes)}</span>}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex shrink-0 items-center gap-2 border-t border-white/10 px-4 pb-[26px] pt-2.5">
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
                            aria-label={t('vibez.send', 'Send')}
                            onClick={() => void send()}
                            disabled={!draft.trim() || sending}
                            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white transition-opacity active:scale-90 disabled:opacity-35"
                            style={{ background: `linear-gradient(135deg, ${GRAD_FROM}, #EC4899)` }}
                        >
                            <ArrowUp className="h-5 w-5" strokeWidth={2.6} />
                        </button>
                    </div>
                </>
            )}
        </Sheet>
    );
}
