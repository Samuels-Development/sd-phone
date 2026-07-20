import { useState } from 'react';
import { BadgeCheck, Bookmark, ChevronLeft, Grid3x3, Heart, Play } from 'lucide-react';

import { ChangePasswordPage } from '@/shared/ChangePasswordPage';
import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { ACCENT, GRAD_FROM, GRAD_TO, fmt, type VPost, type VProfile } from './data';
import { apiLikedPosts, apiProfile, apiProfilePosts, apiSavedPosts, apiToggleFollow } from './vibezApi';
import { EditProfileSheet } from './EditProfileSheet';
import { Thumb } from './Discover';

const SB_H = 54;

type Grid = 'posts' | 'liked' | 'saved';

export function Profile({ handle, onBack, onOpenPost, onSignOut, refreshKey }: {
    handle?:    string;
    onBack?:    () => void;
    onOpenPost: (posts: VPost[], index: number) => void;
    onSignOut?: () => void;
    refreshKey: number;
}) {
    const [pwOpen,   setPwOpen]   = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [grid,     setGrid]     = useState<Grid>('posts');
    const [profile,  setProfile]  = useState<VProfile | null>(null);

    useAsyncData<VProfile | null>(
        () => apiProfile(handle),
        [handle, refreshKey, editOpen],
        { onData: setProfile },
    );

    const isMe = !handle || (profile?.isMe ?? false);
    const activeGrid: Grid = isMe ? grid : 'posts';

    const { data: posts } = useAsyncData<VPost[]>(
        () => activeGrid === 'liked' ? apiLikedPosts()
            : activeGrid === 'saved' ? apiSavedPosts()
            : apiProfilePosts(handle),
        [handle, activeGrid, refreshKey],
    );

    function toggleFollow() {
        if (!profile) return;
        setProfile({
            ...profile,
            following: !profile.following,
            followers: profile.followers + (profile.following ? -1 : 1),
        });
        void apiToggleFollow(profile.username);
    }

    return (
        <div className="flex h-full flex-col bg-black text-white">
            <div className="shrink-0" style={{ height: SB_H }} />

            {onBack && (
                <button
                    type="button"
                    onClick={onBack}
                    aria-label={t('vibez.back', 'Back')}
                    className="absolute left-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 active:opacity-70"
                    style={{ top: SB_H + 2 }}
                >
                    <ChevronLeft className="h-5 w-5" strokeWidth={2.6} />
                </button>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-24">
                <div className="flex flex-col items-center px-4 pt-2">
                    <div className="rounded-full p-[3px]" style={{ background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})` }}>
                        <img
                            src={profile?.avatar}
                            alt=""
                            draggable={false}
                            className="h-24 w-24 rounded-full border-[3px] border-black object-cover"
                        />
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                        <span className="text-[17px] font-semibold">@{profile?.username ?? handle ?? ''}</span>
                        {profile?.verified && (
                            <BadgeCheck className="h-[16px] w-[16px]" style={{ color: GRAD_FROM, fill: GRAD_FROM }} stroke="#000" strokeWidth={1.6} />
                        )}
                    </div>
                    {profile?.name && profile.name !== '' && profile.name !== profile.username && (
                        <span className="mt-0.5 text-[13px] text-white/55">{profile.name}</span>
                    )}

                    <div className="mt-4 flex items-center gap-7">
                        <Stat value={fmt(profile?.followingCount ?? 0)} label={t('vibez.followingCount', 'Following')} />
                        <Stat value={fmt(profile?.followers ?? 0)} label={t('vibez.followers', 'Followers')} />
                        <Stat value={fmt(profile?.likes ?? 0)} label={t('vibez.likes', 'Likes')} />
                    </div>

                    {isMe ? (
                        <button
                            type="button"
                            onClick={() => setEditOpen(true)}
                            className="mt-4 rounded-md border border-white/20 px-8 py-1.5 text-[14px] font-semibold active:opacity-70"
                        >
                            {t('vibez.editProfile', 'Edit profile')}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={toggleFollow}
                            className="mt-4 rounded-md px-10 py-1.5 text-[14px] font-semibold active:opacity-80"
                            style={profile?.following
                                ? { background: 'rgba(255,255,255,0.12)' }
                                : { background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})` }}
                        >
                            {profile?.following
                                ? t('vibez.followingBtn', 'Following')
                                : profile?.followsMe ? t('vibez.followBack', 'Follow back') : t('vibez.follow', 'Follow')}
                        </button>
                    )}

                    {profile?.bio && profile.bio !== '' && (
                        <p className="mt-3 text-center text-[13px] text-white/80">{profile.bio}</p>
                    )}
                </div>

                <div className="mt-5 flex border-b border-white/10">
                    <GridTab active={activeGrid === 'posts'} onClick={() => setGrid('posts')} label={t('vibez.postsTab', 'Vibes')}>
                        <Grid3x3 className="h-5 w-5" strokeWidth={2.2} />
                    </GridTab>
                    {isMe && (
                        <>
                            <GridTab active={activeGrid === 'liked'} onClick={() => setGrid('liked')} label={t('vibez.likedTab', 'Liked')}>
                                <Heart className="h-5 w-5" strokeWidth={2.2} />
                            </GridTab>
                            <GridTab active={activeGrid === 'saved'} onClick={() => setGrid('saved')} label={t('vibez.savedTab', 'Saved')}>
                                <Bookmark className="h-5 w-5" strokeWidth={2.2} />
                            </GridTab>
                        </>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-0.5 pt-0.5">
                    {(posts ?? []).map((p, i) => (
                        <button
                            key={p.id}
                            type="button"
                            onClick={() => onOpenPost(posts ?? [], i)}
                            className="relative aspect-[9/16] overflow-hidden bg-white/5 active:opacity-80"
                        >
                            <Thumb post={p} />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent" />
                            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-white drop-shadow">
                                <Play className="h-3 w-3" fill="#fff" strokeWidth={0} />
                                <span className="text-[11px] font-semibold">{fmt(p.views)}</span>
                            </div>
                        </button>
                    ))}
                    {(posts ?? []).length === 0 && (
                        <p className="col-span-3 px-4 pt-8 text-center text-[13px] text-white/45">
                            {activeGrid === 'posts' ? t('vibez.noPostsYet', 'No vibes posted yet.')
                                : activeGrid === 'liked' ? t('vibez.noLikedYet', 'No liked vibes yet.')
                                : t('vibez.noSavedYet', 'No saved vibes yet.')}
                        </p>
                    )}
                </div>

                {isMe && onSignOut && (
                    <div className="px-4 pt-6">
                        <button
                            type="button"
                            onClick={() => setPwOpen(true)}
                            className="w-full rounded-md border border-white/20 py-2.5 text-[14px] font-semibold text-white/90 active:opacity-70"
                        >
                            {t('vibez.changePassword', 'Change Password')}
                        </button>
                        <button
                            type="button"
                            onClick={onSignOut}
                            className="mt-3 w-full rounded-md border border-white/20 py-2.5 text-[14px] font-semibold text-white/90 active:opacity-70"
                        >
                            {t('vibez.logOut', 'Log out')}
                        </button>
                    </div>
                )}
            </div>

            {pwOpen && (
                <ChangePasswordPage
                    app="vibez"
                    appName="Vibez"
                    icon="vibez"
                    theme={{ accent: ACCENT, welcomeBg: '#0a0518', welcomeText: 'light' }}
                    onClose={() => setPwOpen(false)}
                />
            )}
            {editOpen && profile && (
                <EditProfileSheet profile={profile} onClose={() => setEditOpen(false)} onSaved={setProfile} />
            )}
        </div>
    );
}

function GridTab({ active, onClick, label, children }: {
    active:   boolean;
    onClick:  () => void;
    label:    string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={`flex flex-1 items-center justify-center pb-2.5 ${active ? 'border-b-2 border-white text-white' : 'text-white/40'}`}
        >
            {children}
        </button>
    );
}

function Stat({ value, label }: { value: string; label: string }) {
    return (
        <div className="flex flex-col items-center">
            <span className="text-[17px] font-bold">{value}</span>
            <span className="text-[12px] text-white/55">{label}</span>
        </div>
    );
}
