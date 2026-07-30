import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Grid3x3, Lock } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { IG, type Post, type User } from '../data';
import { MediaThumb } from '../create/Media';
import { apiProfile, apiProfilePosts, apiToggleFollow, type FollowStatus, type ProfileView } from '../photogramApi';
import { EmptyGrid, fmtCount } from './Profile';
import { VerifiedCheck } from '../ui';

export function UserProfile({ handle, me: _me, onBack, onOpenProfile: _onOpenProfile, onOpenPost, onOpenFollows, onChanged, animateIn = true }: {
    handle:        string;
    me:            User;
    onBack:        () => void;
    onOpenProfile: (handle: string) => void;
    onOpenPost:    (p: Post) => void;
    onOpenFollows: (handle: string, kind: 'followers' | 'following') => void;
    onChanged?:    () => void;
    animateIn?:    boolean;
}) {
    const { goBack, pageStyle } = useIosPush(onBack, animateIn);
    const [profile, setProfile] = useState<ProfileView | null>(null);
    const [posts,   setPosts]   = useState<Post[]>([]);
    const [busy,    setBusy]    = useState(false);

    useEffect(() => {
        let alive = true;
        setProfile(null); setPosts([]);
        void apiProfile(handle).then(p => { if (alive) setProfile(p); });
        void apiProfilePosts(handle).then(ps => { if (alive) setPosts(ps); });
        return () => { alive = false; };
    }, [handle]);

    useNuiEvent('sd-phone:photogram:followChanged', useCallback((data: { target?: string; status?: FollowStatus }) => {
        if (!data || data.target !== handle || !data.status) return;
        const status = data.status;
        setProfile(prev => {
            if (!prev) return prev;
            const wasAccepted = prev.followStatus === 'accepted';
            const nowAccepted = status === 'accepted';
            const delta = (nowAccepted && !wasAccepted) ? 1 : (wasAccepted && !nowAccepted ? -1 : 0);
            return { ...prev, followStatus: status, followers: prev.followers + delta, locked: prev.isPrivate && !nowAccepted };
        });
        if (status === 'accepted') void apiProfilePosts(handle).then(setPosts);
        onChanged?.();
    }, [handle, onChanged]));

    async function toggleFollow() {
        if (!profile || busy) return;
        setBusy(true);
        const wasAccepted = profile.followStatus === 'accepted';
        const status = await apiToggleFollow(handle);
        const delta = (status === 'accepted' && !wasAccepted) ? 1 : (wasAccepted && status !== 'accepted' ? -1 : 0);
        setProfile(prev => prev ? { ...prev, followStatus: status, followers: prev.followers + delta, locked: prev.isPrivate && status !== 'accepted' } : prev);
        if (status === 'accepted' && profile.locked) void apiProfilePosts(handle).then(setPosts);
        setBusy(false);
        onChanged?.();
    }

    const btn = (() => {
        if (!profile || profile.isMe) return null;
        if (profile.followStatus === 'accepted') return { label: t('photogram.following', 'Following'), cls: 'bg-black/[0.06] text-black' };
        if (profile.followStatus === 'pending')  return { label: t('photogram.requested', 'Requested'), cls: 'bg-black/[0.06] text-black' };
        return { label: t('photogram.follow', 'Follow'), cls: 'text-white', style: { background: IG.blue } as const };
    })();

    return (
        <div className="absolute inset-0 z-40 flex flex-col bg-[#f2f2f2] font-sf" style={pageStyle}>
            <div className="h-[58px] shrink-0" aria-hidden />
            <div className="relative flex shrink-0 items-center px-2 pb-2">
                <button type="button" onClick={goBack} aria-label={t('photogram.back', 'Back')} className="text-black active:opacity-50">
                    <ChevronLeft className="h-[36px] w-[36px]" strokeWidth={2.2} />
                </button>
                <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5">
                    <span className="text-[22px] font-bold text-black">{profile?.username ?? handle}</span>
                    {profile?.verified && <VerifiedCheck size={22} />}
                </div>
            </div>

            {!profile ? (
                <div className="flex-1" />
            ) : (
                <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                    <div className="flex items-center gap-6 px-4 py-3">
                        <img src={profile.avatar} alt="" draggable={false} className="h-[108px] w-[108px] rounded-full object-cover" />
                        <div className="flex flex-1 justify-around text-center">
                            <Stat n={profile.posts} label={t('photogram.posts', 'Posts')} />
                            <Stat n={fmtCount(profile.followers)} label={t('photogram.followers', 'Followers')} onClick={profile.locked ? undefined : () => onOpenFollows(profile.username, 'followers')} />
                            <Stat n={fmtCount(profile.following)} label={t('photogram.following', 'Following')} onClick={profile.locked ? undefined : () => onOpenFollows(profile.username, 'following')} />
                        </div>
                    </div>

                    <div className="px-4 pb-3">
                        <div className="text-[21px] font-semibold text-black">{profile.name}</div>
                        {profile.bio !== '' && <div className="mt-1 whitespace-pre-line text-[20px] leading-snug text-black">{profile.bio}</div>}
                        {profile.followsMe && <div className="mt-1 text-[15px]" style={{ color: IG.sub }}>{t('photogram.followsYou', 'Follows you')}</div>}
                    </div>

                    {btn && (
                        <div className="px-4 pb-3">
                            <button type="button" onClick={toggleFollow} disabled={busy} className={`w-full rounded-[12px] py-3 text-[19px] font-semibold active:opacity-70 ${btn.cls}`} style={btn.style}>
                                {btn.label}
                            </button>
                        </div>
                    )}

                    <div className="flex items-center justify-center border-t border-black/[0.08] py-3 text-black">
                        <Grid3x3 className="h-[30px] w-[30px]" strokeWidth={2.2} />
                    </div>

                    {profile.locked ? (
                        <div className="flex flex-col items-center justify-center gap-2 px-10 py-14 text-center">
                            <div className="flex h-[68px] w-[68px] items-center justify-center rounded-full border-[2.5px] border-black">
                                <Lock className="h-[32px] w-[32px] text-black" strokeWidth={2} />
                            </div>
                            <div className="text-[21px] font-bold text-black">{t('photogram.accountIsPrivate', 'Private Account')}</div>
                            <div className="text-[16px]" style={{ color: IG.sub }}>{t('photogram.followToSeePhotos', 'Follow to see their photos and videos.')}</div>
                        </div>
                    ) : posts.length === 0 ? (
                        <EmptyGrid />
                    ) : (
                        <div className="grid grid-cols-3 gap-[2px]">
                            {posts.map(p => (
                                <button key={p.id} type="button" onClick={() => onOpenPost(p)} className="aspect-square active:opacity-80">
                                    <MediaThumb url={p.images[0]} className="h-full w-full" />
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="h-2" />
                </div>
            )}
        </div>
    );
}

function Stat({ n, label, onClick }: { n: number | string; label: string; onClick?: () => void }) {
    const inner = (
        <>
            <div className="text-[27px] font-bold leading-tight text-black">{n}</div>
            <div className="text-[18px] text-black">{label}</div>
        </>
    );
    return onClick
        ? <button type="button" onClick={onClick} className="active:opacity-50">{inner}</button>
        : <div>{inner}</div>;
}
