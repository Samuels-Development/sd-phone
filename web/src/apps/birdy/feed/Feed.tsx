import { t } from '@/i18n';
import { EmptyState } from '@/ui/EmptyState';
import { BLUE, META, type BirdyAuthor, type BirdyPost } from '../data';
import { PostCard } from './PostCard';
import { Avatar, BirdMark } from '../ui';

type FeedKind = 'all' | 'following';

export function Feed({ posts, me, feed, onFeedChange, onToggleLike, onOpenPost, onOpenProfile, onOpenAuthor }: {
    posts:         BirdyPost[];
    me:            BirdyAuthor;
    feed:          FeedKind;
    onFeedChange:  (f: FeedKind) => void;
    onToggleLike:  (id: string) => void;
    onOpenPost:    (id: string) => void;
    onOpenProfile: () => void;
    onOpenAuthor?: (handle: string) => void;
}) {
    return (
        <div className="flex h-full flex-col">
            <header className="shrink-0">
                <div className="flex items-center px-4 py-2">
                    <button type="button" onClick={onOpenProfile} aria-label={t('birdy.yourProfile', 'Your profile')}><Avatar size={44} /></button>
                    <div className="flex flex-1 justify-center">
                        <BirdMark className="h-11 w-11 text-[#1d9bf0]" />
                    </div>
                    <div className="w-11" aria-hidden />
                </div>
                <div className="flex border-b border-black/10">
                    <FeedTab label={t('birdy.all', 'All')}       active={feed === 'all'}       onClick={() => onFeedChange('all')} />
                    <FeedTab label={t('birdy.following', 'Following')} active={feed === 'following'} onClick={() => onFeedChange('following')} />
                </div>
            </header>

            <div key={feed} className="min-h-0 flex-1 animate-swipe-in-left overflow-y-auto">
                {posts.length === 0 ? (
                    <EmptyState
                        center
                        icon={<BirdMark className="h-8 w-8" />}
                        circleClassName="bg-black/[0.06] text-black/35"
                        title={feed === 'following'
                            ? t('birdy.nothingHereYet', 'Nothing here yet')
                            : t('birdy.noPostsYet', 'No posts yet')}
                        subtitle={feed === 'following'
                            ? t('birdy.followingEmptySubtitle', 'When you follow people, their latest posts will show up here.')
                            : t('birdy.feedEmptySubtitle', 'Posts from you and people you follow will show up here.')}
                        subtitleClassName="text-[#536471]"
                    />
                ) : (
                    posts.map(p => (
                        <PostCard
                            key={p.id}
                            post={p}
                            isOwn={p.author.handle === me.handle}
                            onToggleLike={() => onToggleLike(p.id)}
                            onOpen={() => onOpenPost(p.id)}
                            onOpenAuthor={onOpenAuthor}
                        />
                    ))
                )}
            </div>
        </div>
    );
}

function FeedTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="relative flex-1 py-3.5 text-[17px]">
            <span className={active ? 'font-bold text-black' : 'font-medium'} style={active ? undefined : { color: META }}>
                {label}
            </span>
            {active && (
                <span className="absolute bottom-0 left-1/2 h-[3.5px] w-14 -translate-x-1/2 rounded-full" style={{ background: BLUE }} />
            )}
        </button>
    );
}
