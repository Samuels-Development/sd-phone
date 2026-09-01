import { useState } from 'react';
import { ChevronLeft, Heart, Smile, X } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { EmojiPanel } from '@/shared/chat/EmojiPanel';
import { GifPickerSheet } from '@/shared/chat/GifPickerSheet';
import { IG, type Comment as IGComment, type Post, type User } from '../data';
import { VerifiedCheck } from '../ui';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export function Comments({ post, me, comments, onBack, onSubmit, onToggleLike, onOpenProfile, animateIn = true }: {
    post:         Post;
    me:           User;
    comments:     IGComment[];
    onBack:       () => void;
    onSubmit:     (c: { text?: string; gifUrl?: string }) => void;
    onToggleLike: (commentId: string) => void;
    onOpenProfile: (handle: string) => void;
    animateIn?:   boolean;
}) {
    const { goBack, pageStyle } = useIosPush(onBack, animateIn);
    const [draft, setDraft] = useState('');
    const [gif,   setGif]   = useState<string | null>(null);
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [gifOpen,   setGifOpen]   = useState(false);

    function submit() {
        const text = draft.trim();
        if (!text && !gif) return;
        onSubmit({ text: text || undefined, gifUrl: gif || undefined });
        setDraft('');
        setGif(null);
    }

    return (
        <div className="absolute inset-0 z-40 flex flex-col bg-[#f2f2f2] font-sf" style={pageStyle}>
            <StatusBarSpacer />

            <div className="relative flex shrink-0 items-center px-2 pb-2">
                <button type="button" onClick={goBack} aria-label={t('photogram.back', 'Back')} className="text-black active:opacity-50">
                    <ChevronLeft className="h-[36px] w-[36px]" strokeWidth={2.2} />
                </button>
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[22px] font-bold text-black">{t('photogram.comments', 'Comments')}</div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                {post.caption && <Row user={post.user} text={post.caption} time={post.time} onOpenProfile={onOpenProfile} />}
                <div className="mx-4 h-px bg-black/[0.08]" />
                {comments.map(c => (
                    <Row key={c.id} user={c.user} text={c.text} time={c.time} gifUrl={c.gifUrl} likes={c.likes} liked={c.liked} onLike={() => onToggleLike(c.id)} onOpenProfile={onOpenProfile} />
                ))}
            </div>

            <div className="relative shrink-0 border-t border-black/[0.08]">
                {emojiOpen && (
                    <div className="absolute inset-x-0 bottom-full z-20">
                        <EmojiPanel isDark={false} onSelect={e => setDraft(d => d + e)} />
                    </div>
                )}
                {gif && (
                    <div className="px-4 pt-3">
                        <div className="relative inline-block">
                            <img src={gif} alt="" draggable={false} className="h-[96px] rounded-xl object-cover" />
                            <button type="button" onClick={() => setGif(null)} aria-label={t('photogram.removeGif', 'Remove GIF')} className="absolute -right-2 -top-2 flex h-[24px] w-[24px] items-center justify-center rounded-full bg-black/60 active:opacity-70">
                                <X className="h-[14px] w-[14px] text-white" strokeWidth={2.75} />
                            </button>
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-3 px-4 py-3 pb-9">
                    <img src={me.avatar} alt="" draggable={false} className="h-[48px] w-[48px] shrink-0 rounded-full object-cover" />
                    <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-black/15 py-2 pl-3.5 pr-4">
                        <button type="button" aria-label={t('photogram.emoji', 'Emoji')} onClick={() => setEmojiOpen(o => !o)} className="shrink-0 active:opacity-50" style={{ color: emojiOpen ? IG.blue : '#555555' }}>
                            <Smile className="h-[24px] w-[24px]" strokeWidth={1.9} />
                        </button>
                        <button type="button" aria-label={t('photogram.addGif', 'Add a GIF')} onClick={() => { setGifOpen(true); setEmojiOpen(false); }} className="shrink-0 rounded-md border px-1.5 py-[1px] text-[13px] font-bold active:opacity-50" style={{ color: gif ? IG.blue : '#555555', borderColor: gif ? IG.blue : 'rgba(0,0,0,0.3)' }}>
                            GIF
                        </button>
                        <input
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                            onFocus={() => setEmojiOpen(false)}
                            placeholder={gif ? t('photogram.addCaption', 'Add a caption…') : t('photogram.addCommentAs', 'Add a comment as {handle}…', { handle: me.handle })}
                            className="min-w-0 flex-1 bg-transparent text-[18px] text-black outline-none placeholder:text-[#9b9b9b]"
                        />
                        <button type="button" onClick={submit} disabled={!draft.trim() && !gif} className="shrink-0 text-[18px] font-semibold disabled:opacity-40" style={{ color: IG.blue }}>
                            {t('photogram.post', 'Post')}
                        </button>
                    </div>
                </div>
            </div>

            {gifOpen && (
                <GifPickerSheet
                    onSelect={url => { setGif(url); setGifOpen(false); }}
                    onClose={() => setGifOpen(false)}
                />
            )}
        </div>
    );
}

function Row({ user, text, time, gifUrl, likes, liked, onLike, onOpenProfile }: {
    user: User; text?: string; time: string; gifUrl?: string;
    likes?: number; liked?: boolean; onLike?: () => void; onOpenProfile: (handle: string) => void;
}) {
    return (
        <div className="flex gap-3.5 px-4 py-4">
            <button type="button" onClick={() => onOpenProfile(user.handle)} className="shrink-0 active:opacity-60">
                <img src={user.avatar} alt="" draggable={false} className="h-[56px] w-[56px] rounded-full object-cover" />
            </button>
            <div className="min-w-0 flex-1 leading-snug">
                <button type="button" onClick={() => onOpenProfile(user.handle)} className="flex items-center gap-1.5 active:opacity-60">
                    <span className="text-[20px] font-semibold text-black">{user.handle}</span>
                    {user.verified && <VerifiedCheck size={24} />}
                </button>
                {text && <div className="break-words text-[20px] text-black">{text}</div>}
                {gifUrl && <img src={gifUrl} alt="" draggable={false} className="mt-1.5 max-h-[200px] rounded-xl object-cover" />}
                <div className="mt-[4px] flex items-center gap-4 text-[16px] font-medium" style={{ color: '#555555' }}>
                    <span>{time}</span>
                    {!!likes && likes > 0 && <span>{likes} {likes === 1 ? t('photogram.likeSingular', 'like') : t('photogram.likesPlural', 'likes')}</span>}
                </div>
            </div>
            {onLike && (
                <button type="button" onClick={onLike} aria-label={t('photogram.likeComment', 'Like comment')} className="shrink-0 self-start pt-1.5 active:opacity-50">
                    <Heart className="h-[22px] w-[22px]" strokeWidth={2} fill={liked ? IG.red : 'none'} style={{ color: liked ? IG.red : '#8e8e8e' }} />
                </button>
            )}
        </div>
    );
}
