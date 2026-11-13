import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Heart, Image as ImageIcon, Lock, Mail, MessageCircle } from 'lucide-react';

import { BirdyBird } from '../BirdyBird';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { EmptyState } from '@/ui/EmptyState';
import { apiProfilePosts } from '../birdyApi';
import { BG, BLUE, META, postKey, type BirdyAuthor, type BirdyProfile} from '../data';
import { compactCount } from '../polish/format';
import { FeedSkeleton } from '../polish/Skeleton';
import { FollowList } from './FollowList';
import { PostCard } from '../feed/PostCard';
import { Avatar, VerifiedBadge } from '../ui';

type Tab = 'posts' | 'replies' | 'media' | 'likes';

const TABS: Tab[] = ['posts', 'replies', 'media', 'likes'];

function tabLabels(): Record<Tab, string> {
    return { posts: t('squawk.posts', 'Posts'), replies: t('squawk.replies', 'Replies'), media: t('squawk.media', 'Media'), likes: t('squawk.likes', 'Likes') };
}

function tabEmptyStates(): Record<Tab, { icon: React.ReactNode; title: string; subtitle: string }> {
    return {
        posts:   { icon: <BirdyBird className="h-7 w-7" />,       title: t('squawk.noPostsYet', 'No posts yet'),   subtitle: t('squawk.postsEmptySubtitle', 'Posts will show up here.') },
        replies: { icon: <MessageCircle className="h-7 w-7" strokeWidth={1.8} />, title: t('squawk.noRepliesYet', 'No replies yet'), subtitle: t('squawk.repliesEmptySubtitle', 'Replies will show up here.') },
        media:   { icon: <ImageIcon className="h-7 w-7" strokeWidth={1.8} />,     title: t('squawk.noMediaYet', 'No media yet'),   subtitle: t('squawk.mediaEmptySubtitle', 'Photos and videos will show up here.') },
        likes:   { icon: <Heart className="h-7 w-7" strokeWidth={1.8} />,         title: t('squawk.noLikesYet', 'No likes yet'),   subtitle: t('squawk.likesEmptySubtitle', 'Liked posts will show up here.') },
    };
}

export function Profile({ profile, me, handle, onBack, onEdit, onOpenPost, onToggleLike, onToggleRepost, onToggleFollow, onOpenAuthor, onMessage }: {
    profile:         BirdyProfile | null;
    me:              BirdyAuthor;
    handle?:         string;
    onBack:          () => void;
    onEdit:          () => void;
    onOpenPost:      (id: string) => void;
    onToggleLike:    (id: string) => void;
    onToggleRepost:  (id: string) => void;
    onToggleFollow?: (handle: string) => void;
    onOpenAuthor?:   (handle: string) => void;
    onMessage?:      (handle: string) => void;
}) {
    const isOther = !!handle
        && handle.toLowerCase() !== me.handle.toLowerCase()
        && profile?.isMe !== true;
    const label = tabLabels();
    const empty = tabEmptyStates();
    const [tab, setTab] = useState<Tab>('posts');
    const { data: postsData } = useAsyncData(() => apiProfilePosts(tab, handle), [tab, handle]);
    const postsLoading = postsData === undefined;
    const posts = postsData ?? [];
    const [following, setFollowing] = useState(false);
    const [followHover, setFollowHover] = useState(false);
    const headerLoading = isOther && profile === null;

    useEffect(() => { setFollowing(!!profile?.isFollowing); }, [profile?.isFollowing]);

    const [followView, setFollowView] = useState<'followers' | 'following' | null>(null);

    function toggleFollow() {
        if (!handle) return;
        setFollowing(f => !f);
        onToggleFollow?.(handle);
    }

    const locked        = !!profile?.protected && isOther && !following;
    const name          = profile?.name ?? me.name;
    const displayHandle = profile?.handle ?? handle ?? me.handle;
    const verified      = profile?.verified ?? me.verified;
    const verifiedType  = profile?.verifiedType ?? me.verifiedType;
    const banner        = profile?.banner;

    return (
        <div className="relative flex h-full flex-col" style={{ background: BG }}>
            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                <div className="relative h-[132px] w-full overflow-hidden" style={{ background: BLUE }}>
                    {banner && (
                        <img src={banner} alt="" draggable={false} className="h-full w-full object-cover" />
                    )}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-[64px] bg-gradient-to-b from-black/35 to-transparent" />
                </div>

                <div className="px-4">
                    <div className="flex items-start justify-between">
                        <div className="relative z-10 -mt-[44px] w-fit rounded-full" style={{ background: BG, padding: 4 }}>
                            <Avatar size={80} src={profile?.avatar} />
                        </div>
                        {isOther ? (
                            <div className="mt-2 flex items-center gap-2">
                                {onMessage && (
                                    <button
                                        type="button"
                                        onClick={() => onMessage(displayHandle)}
                                        aria-label={t('squawk.message', 'Message')}
                                        className="flex h-[38px] w-[38px] items-center justify-center rounded-full active:opacity-80"
                                        style={{ border: `1.5px solid ${BLUE}`, color: BLUE }}
                                    >
                                        <Mail className="h-[18px] w-[18px]" strokeWidth={2} />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={toggleFollow}
                                    onMouseEnter={() => setFollowHover(true)}
                                    onMouseLeave={() => setFollowHover(false)}
                                    className="min-w-[108px] rounded-full px-5 py-2 text-[15px] font-bold transition-colors active:opacity-80"
                                    style={following
                                        ? (followHover
                                            ? { border: '1.5px solid rgba(244,33,46,0.45)', color: '#f4212e', background: 'rgba(244,33,46,0.08)' }
                                            : { border: `1.5px solid ${BLUE}`, color: BLUE })
                                        : { background: BLUE, color: '#fff' }}
                                >
                                    {following
                                        ? (followHover ? t('squawk.unfollow', 'Unfollow') : t('squawk.following', 'Following'))
                                        : t('squawk.follow', 'Follow')}
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={onEdit}
                                className="mt-2 rounded-full px-5 py-2 text-[15px] font-bold transition-colors hover:bg-ios-blue/10 active:bg-ios-blue/15"
                                style={{ border: `1.5px solid ${BLUE}`, color: BLUE }}
                            >
                                {t('squawk.editProfileButton', 'Edit Profile')}
                            </button>
                        )}
                    </div>

                    {headerLoading ? (
                        <div className="mt-3 flex flex-col gap-2" aria-hidden>
                            <div className="h-6 w-40 animate-shimmer rounded-full bg-hairline/[0.07]"
                                style={{ backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0) 35%, rgba(255,255,255,0.55) 50%, rgba(0,0,0,0) 65%)', backgroundSize: '200% 100%' }} />
                            <div className="h-4 w-28 animate-shimmer rounded-full bg-hairline/[0.07]"
                                style={{ backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0) 35%, rgba(255,255,255,0.55) 50%, rgba(0,0,0,0) 65%)', backgroundSize: '200% 100%' }} />
                        </div>
                    ) : (
                        <>
                            <div className="mt-2 flex items-center gap-1.5">
                                <span dir="auto" className="text-[22px] font-extrabold text-label">{name}</span>
                                {verified && <VerifiedBadge size={20} type={verifiedType} />}
                            </div>
                            <div className="text-[16px]" style={{ color: META }}><span dir="ltr">@{displayHandle}</span></div>
                        </>
                    )}

                    {profile?.bio ? (
                        <p dir="auto" className="mt-2 whitespace-pre-wrap text-[16px] leading-snug text-label">{profile.bio}</p>
                    ) : null}

                    {profile?.joined ? (
                        <div className="mt-2 flex items-center gap-1.5 text-[15px]" style={{ color: META }}>
                            <CalendarDays className="h-[18px] w-[18px]" strokeWidth={2} />
                            {t('squawk.joined', 'Member since {date}', { date: profile.joined })}
                        </div>
                    ) : null}

                    <div className="mt-2 flex gap-4 text-[16px]" style={{ color: META }}>
                        <button type="button" onClick={() => setFollowView('following')} className="hover:underline">
                            <span className="font-bold tabular-nums text-label">{compactCount(profile?.following ?? 0)}</span> {t('squawk.following', 'Following')}
                        </button>
                        <button type="button" onClick={() => setFollowView('followers')} className="hover:underline">
                            <span className="font-bold tabular-nums text-label">{compactCount(profile?.followers ?? 0)}</span> {t('squawk.followers', 'Followers')}
                        </button>
                    </div>
                </div>

                <div className="relative mt-3 flex border-b border-hairline/10">
                    {TABS.map(tabId => (
                        <ProfileTab key={tabId} label={label[tabId]} active={tab === tabId} onClick={() => setTab(tabId)} />
                    ))}
                    <span
                        aria-hidden
                        className="absolute bottom-0 start-0 flex w-1/4 justify-center transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                        style={{ transform: `translateX(calc(var(--dir-x, 1) * ${TABS.indexOf(tab) * 100}%))` }}
                    >
                        <span className="h-[3px] w-12 rounded-full" style={{ background: BLUE }} />
                    </span>
                </div>

                {postsLoading && !locked ? (
                    <FeedSkeleton />
                ) : locked ? (
                    <EmptyState
                        icon={<Lock className="h-7 w-7" strokeWidth={1.8} />}
                        circleClassName="bg-hairline/[0.06] text-label/35"
                        title={t('squawk.postsArePrivate', 'This account keeps its posts private')}
                        subtitle={t('squawk.protectedSubtitle', 'Only followers can see {name}’s posts.', { name })}
                        subtitleClassName="text-ios-gray"
                    />
                ) : posts.length === 0 ? (
                    <EmptyState
                        icon={empty[tab].icon}
                        circleClassName="bg-hairline/[0.06] text-label/35"
                        title={empty[tab].title}
                        subtitle={empty[tab].subtitle}
                        subtitleClassName="text-ios-gray"
                    />
                ) : (
                    posts.map(post => (
                        <PostCard
                            key={postKey(post)}
                            post={post}
                            isOwn={post.author.handle === me.handle}
                            onToggleLike={() => onToggleLike(post.id)}
                            onToggleRepost={() => onToggleRepost(post.id)}
                            onOpen={() => onOpenPost(post.id)}
                            onOpenAuthor={onOpenAuthor}
                        />
                    ))
                )}
            </div>

            <button
                type="button"
                onClick={onBack}
                aria-label={t('squawk.back', 'Back')}
                className="absolute start-3 top-[62px] z-10 flex h-9 w-9 items-center justify-center rounded-full text-white"
                style={{ background: 'rgba(0,0,0,0.55)' }}
            >
                <ArrowLeft className="h-5 w-5" strokeWidth={2.2} />
            </button>

            {followView && (
                <FollowList kind={followView} handle={handle} onBack={() => setFollowView(null)} />
            )}
        </div>
    );
}

function ProfileTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="relative flex-1 py-3.5 text-[16px]">
            <span className={`transition-colors duration-200 ${active ? 'font-bold text-label' : 'font-medium'}`} style={active ? undefined : { color: META }}>
                {label}
            </span>
        </button>
    );
}
