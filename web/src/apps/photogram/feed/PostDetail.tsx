import { ChevronLeft } from 'lucide-react';

import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import { type Post, type User } from '../data';
import { PostCard } from './PostCard';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export function PostDetail({ post, me, onBack, onLike, onDoubleLike, onSave, onComment, onOpenProfile, onShare, onDelete, animateIn = true }: {
    post:         Post;
    me:           User | null;
    onBack:       () => void;
    onLike:       (id: string) => void;
    onDoubleLike: (id: string) => void;
    onSave:       (id: string) => void;
    onComment:    (id: string) => void;
    onOpenProfile: (handle: string) => void;
    onShare:      (post: Post) => void;
    onDelete:     (post: Post) => void;
    animateIn?:   boolean;
}) {
    const { goBack, pageStyle } = useIosPush(onBack, animateIn);

    return (
        <div className="absolute inset-0 z-40 flex flex-col bg-[#f2f2f2] font-sf" style={pageStyle}>
            <StatusBarSpacer />

            <div className="relative flex shrink-0 items-center px-2 pb-2">
                <button type="button" onClick={goBack} aria-label={t('photogram.back', 'Back')} className="text-black active:opacity-50">
                    <ChevronLeft className="h-[36px] w-[36px]" strokeWidth={2.2} />
                </button>
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[22px] font-bold text-black">{t('photogram.post', 'Post')}</div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                <PostCard
                    post={post}
                    onLike={() => onLike(post.id)}
                    onDoubleLike={() => onDoubleLike(post.id)}
                    onSave={() => onSave(post.id)}
                    onComment={() => onComment(post.id)}
                    onOpenProfile={onOpenProfile}
                    onShare={() => onShare(post)}
                    onDelete={me && me.handle === post.user.handle ? () => onDelete(post) : undefined}
                />
            </div>
        </div>
    );
}
