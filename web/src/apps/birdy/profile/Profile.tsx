import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Heart, Image as ImageIcon, Lock, Mail, MessageCircle } from 'lucide-react';

import { BirdyBird } from '../BirdyBird';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useStatusBarLight } from '@/shell/useStatusBarLight';
import { EmptyState } from '@/ui/EmptyState';
import { apiProfilePosts } from '../birdyApi';
import { BG, BLUE, META, type BirdyAuthor, type BirdyProfile } from '../data';
import { compactCount } from '../polish/format';
import { FeedSkeleton } from '../polish/Skeleton';
import { FollowList } from './FollowList';
import { PostCard } from '../feed/PostCard';
import { Avatar, VerifiedBadge } from '../ui';

type Tab = 'posts' | 'replies' | 'media' | 'likes';

const TABS: Tab[] = ['posts', 'replies', 'media', 'likes'];

function tabLabels(): Record<Tab, string> {
    return { posts: t('birdy.posts', 'Posts'), replies: t('birdy.replies', 'Replies'), media: t('birdy.media', 'Media'), likes: t('birdy.likes', 'Likes') };
}

function tabEmptyStates(): Record<Tab, { icon: React.ReactNode; title: string; subtitle: string }> {
    return {
        posts:   { icon: <BirdyBird className="h-7 w-7" />,       title: t('birdy.noPostsYet', 'No posts yet'),   subtitle: t('birdy.postsEmptySubtitle', 'Posts will show up here.') },
        replies: { icon: <MessageCircle className="h-7 w-7" strokeWidth={1.8} />, title: t('birdy.noRepliesYet', 'No replies yet'), subtitle: t('birdy.repliesEmptySubtitle', 'Replies will show up here.') },
        media:   { icon: <ImageIcon className="h-7 w-7" strokeWidth={1.8} />,     title: t('birdy.noMediaYet', 'No media yet'),   subtitle: t('birdy.mediaEmptySubtitle', 'Photos and videos will show up here.') },
        likes:   { icon: <Heart className="h-7 w-7" strokeWidth={1.8} />,         title: t('birdy.noLikesYet', 'No likes yet'),   subtitle: t('birdy.likesEmptySubtitle', 'Liked posts will show up here.') },
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
    const isOther = !!handle;
    const label = tabLabels();
    const empty = tabEmptyStates();
    const [tab, setTab] = useState<Tab>('posts');
    const { data: postsData } = useAsyncData(() => apiProfilePosts(tab, handle), [tab, handle]);
    const postsLoading = postsData === undefined;
    const posts = postsData ?? [];
    const [following, setFollowing] = useState(false);
    const [followHover, setFollowHover] = useState(false);
    // Another player's profile hasn't answered yet: bones instead of flashing OUR name/handle.
    const headerLoading = isOther && profile === null;

    useEffect(() => { setFollowing(!!profile?.isFollowing); }, [profile?.isFollowing]);

    const [overBanner, setOverBanner] = useState(true);
    const [followView, setFollowView] = useState<'followers' | 'following' | null>(null);
    useStatusBarLight(followView ? false : overBanner);

    function toggleFollow() {
        if (!handle) return;
        setFollowing(f => !f);
        onToggleFollow?.(handle);
    }

    const locked        = !!profile?.protected && isOther && !following;
    const name          = profile?.name ?? me.name;
    const displayHandle = profile?.handle ?? handle ?? me.handle;
    const verified      = profile?.verified ?? me.verified;
    const banner        = profile?.banner;

    return (
        <div className="relative flex h-full flex-col" style={{ background: BG }}>
            <div
                className="min-h-0 flex-1 overflow-y-auto no-scrollbar"
                onScroll={e => setOverBanner(e.currentTarget.scrollTop < 72)}
            >
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
                                        aria-label={t('birdy.message', 'Message')}
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
                                        ? (followHover ? t('birdy.unfollow', 'Unfollow') : t('birdy.following', 'Following'))
                                        : t('birdy.follow', 'Follow')}
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={onEdit}
                                className="mt-2 rounded-full px-5 py-2 text-[15px] font-bold transition-colors hover:bg-[#1d9bf0]/10 active:bg-[#1d9bf0]/15"
                                style={{ border: `1.5px solid ${BLUE}`, color: BLUE }}
                            >
                                {t('birdy.editProfileButton', 'Edit Profile')}
                            </button>
                        )}
                    </div>

                    {headerLoading ? (
                        <div className="mt-3 flex flex-col gap-2" aria-hidden>
                            <div className="h-6 w-40 animate-shimmer rounded-full bg-black/[0.07]"
                                style={{ backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0) 35%, rgba(255,255,255,0.55) 50%, rgba(0,0,0,0) 65%)', backgroundSize: '200% 100%' }} />
                            <div className="h-4 w-28 animate-shimmer rounded-full bg-black/[0.07]"
                                style={{ backgroundImage: 'linear-gradient(90deg, rgba(0,0,0,0) 35%, rgba(255,255,255,0.55) 50%, rgba(0,0,0,0) 65%)', backgroundSize: '200% 100%' }} />
                        </div>
                    ) : (
                        <>
                            <div className="mt-2 flex items-center gap-1.5">
                                <span className="text-[22px] font-extrabold text-black">{name}</span>
                                {verified && <VerifiedBadge size={20} />}
                            </div>
                            <div className="text-[16px]" style={{ color: META }}>@{displayHandle}</div>
                        </>
                    )}

                    {profile?.bio ? (
                        <p className="mt-2 whitespace-pre-wrap text-[16px] leading-snug text-black">{profile.bio}</p>
                    ) : null}

                    {profile?.joined ? (
                        <div className="mt-2 flex items-center gap-1.5 text-[15px]" style={{ color: META }}>
                            <CalendarDays className="h-[18px] w-[18px]" strokeWidth={2} />
                            {t('birdy.joined', 'Joined {date}', { date: profile.joined })}
                        </div>
                    ) : null}

                    <div className="mt-2 flex gap-4 text-[16px]" style={{ color: META }}>
                        <button type="button" onClick={() => setFollowView('following')} className="hover:underline">
                            <span className="font-bold tabular-nums text-black">{compactCount(profile?.following ?? 0)}</span> {t('birdy.following', 'Following')}
                        </button>
                        <button type="button" onClick={() => setFollowView('followers')} className="hover:underline">
                            <span className="font-bold tabular-nums text-black">{compactCount(profile?.followers ?? 0)}</span> {t('birdy.followers', 'Followers')}
                        </button>
                    </div>
                </div>

                <div className="relative mt-3 flex border-b border-black/10">
                    {TABS.map(tabId => (
                        <ProfileTab key={tabId} label={label[tabId]} active={tab === tabId} onClick={() => setTab(tabId)} />
                    ))}
                    <span
                        aria-hidden
                        className="absolute bottom-0 left-0 flex w-1/4 justify-center transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                        style={{ transform: `translateX(${TABS.indexOf(tab) * 100}%)` }}
                    >
                        <span className="h-[3px] w-12 rounded-full" style={{ background: BLUE }} />
                    </span>
                </div>

                {postsLoading && !locked ? (
                    <FeedSkeleton />
                ) : locked ? (
                    <EmptyState
                        icon={<Lock className="h-7 w-7" strokeWidth={1.8} />}
                        circleClassName="bg-black/[0.06] text-black/35"
                        title={t('birdy.protectedTitle', 'These posts are protected')}
                        subtitle={t('birdy.protectedSubtitle', 'Only followers can see {name}’s posts.', { name })}
                        subtitleClassName="text-[#536471]"
                    />
                ) : posts.length === 0 ? (
                    <EmptyState
                        icon={empty[tab].icon}
                        circleClassName="bg-black/[0.06] text-black/35"
                        title={empty[tab].title}
                        subtitle={empty[tab].subtitle}
                        subtitleClassName="text-[#536471]"
                    />
                ) : (
                    posts.map(post => (
                        <PostCard
                            key={post.id}
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
                aria-label={t('birdy.back', 'Back')}
                className="absolute left-3 top-[62px] z-10 flex h-9 w-9 items-center justify-center rounded-full text-white"
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
            <span className={`transition-colors duration-200 ${active ? 'font-bold text-black' : 'font-medium'}`} style={active ? undefined : { color: META }}>
                {label}
            </span>
        </button>
    );
}
