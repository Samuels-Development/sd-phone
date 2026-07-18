import { useState } from 'react';
import { Bell, Heart, Repeat2 } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { EmptyState } from '@/ui/EmptyState';
import { apiNotifications } from '../birdyApi';
import { BG, BLUE, LIKE, META, REPOST, type BirdyAuthor, type BirdyNotification } from '../data';
import { PostCard } from '../feed/PostCard';
import { Avatar, PersonGlyph } from '../ui';

export function Notifications({ onOpenProfile }: { onOpenProfile: () => void }) {
    const [items, setItems] = useState<BirdyNotification[]>([]);

    const { loading } = useAsyncData(apiNotifications, [], { onData: setItems });

    function toggleReplyLike(id: string) {
        setItems(prev => prev.map(n =>
            n.kind === 'reply' && n.id === id
                ? { ...n, post: { ...n.post, liked: !n.post.liked, likes: n.post.likes + (n.post.liked ? -1 : 1) } }
                : n,
        ));
    }

    return (
        <div className="flex h-full flex-col" style={{ background: BG }}>
            <header className="flex shrink-0 items-center px-4 py-2">
                <button type="button" onClick={onOpenProfile} aria-label={t('birdy.yourProfile', 'Your profile')}><Avatar size={44} /></button>
                <h1 className="flex-1 text-center text-[22px] font-extrabold text-black">{t('birdy.notifications', 'Notifications')}</h1>
                <div className="w-11" aria-hidden />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {!loading && items.length === 0 && (
                    <EmptyState
                        center
                        icon={<Bell className="h-7 w-7" strokeWidth={1.8} />}
                        circleClassName="bg-black/[0.06] text-black/35"
                        title={t('birdy.noNotificationsYet', 'No notifications yet')}
                        subtitle={t('birdy.notificationsEmptySubtitle', "When people reply, like, or follow you, you'll see it here.")}
                        subtitleClassName="text-[#536471]"
                    />
                )}
                {items.map(n => {
                    if (n.kind === 'reply') {
                        return <PostCard key={n.id} post={n.post} isOwn={false} onToggleLike={() => toggleReplyLike(n.id)} />;
                    }
                    const icon = n.kind === 'like'
                        ? <Heart className="h-7 w-7" fill={LIKE} color={LIKE} />
                        : n.kind === 'repost'
                            ? <Repeat2 className="h-7 w-7" color={REPOST} />
                            : <PersonGlyph className="h-8 w-8" color={BLUE} />;
                    const text = n.kind === 'follow' ? t('birdy.followedYou', 'followed you') : n.text;
                    const preview = n.kind === 'follow' ? undefined : n.post?.body;
                    return <NotifRow key={n.id} icon={icon} user={n.user} text={text} preview={preview} />;
                })}
            </div>
        </div>
    );
}

function NotifRow({ icon, user, text, preview }: { icon: React.ReactNode; user: BirdyAuthor; text: string; preview?: string }) {
    return (
        <div className="flex gap-3.5 border-b border-black/10 px-4 py-4">
            <div className="flex w-8 shrink-0 justify-center pt-1">{icon}</div>
            <div className="min-w-0 flex-1">
                <Avatar size={48} />
                <div className="mt-2 text-[18px] text-black">
                    <span className="font-bold">{user.name}</span> {text}
                </div>
                {preview && (
                    <div className="mt-1 line-clamp-2 text-[16px] leading-snug" style={{ color: META }}>{preview}</div>
                )}
            </div>
        </div>
    );
}
