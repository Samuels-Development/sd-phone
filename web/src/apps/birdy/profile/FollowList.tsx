import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import { t } from '@/i18n';
import { AlertDialog } from '@/ui/AlertDialog';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useIosPush } from '@/hooks/useIosPush';
import { apiFollowList, apiToggleFollow } from '../birdyApi';
import { BG, BLUE, LINE_STRONG, META, PILL, TEXT, type BirdyFollowUser } from '../data';
import { Avatar, RichText, VerifiedBadge } from '../ui';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

export function FollowList({ kind, handle, onBack }: {
    kind:    'followers' | 'following';
    handle?: string;
    onBack:  () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const { data: users } = useAsyncData<BirdyFollowUser[]>(() => apiFollowList(kind, handle), [kind, handle]);

    return (
        <div className="absolute inset-0 z-20 flex flex-col" style={{ background: BG, ...pageStyle }}>
            <StatusBarSpacer />
            <header className="flex shrink-0 items-center border-b border-hairline/10 px-2 pb-2.5 pt-2">
                <button type="button" onClick={goBack} aria-label={t('squawk.back', 'Back')} className="flex h-9 w-9 items-center justify-center text-label active:opacity-60">
                    <ArrowLeft className="h-6 w-6" strokeWidth={2.2} />
                </button>
                <div className="flex-1 text-center text-[19px] font-bold text-label">
                    {kind === 'following' ? t('squawk.following', 'Following') : t('squawk.followers', 'Followers')}
                </div>
                <div className="w-9" aria-hidden />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                {(users ?? []).map(u => <FollowRow key={u.handle} user={u} />)}
            </div>
        </div>
    );
}

function FollowRow({ user }: { user: BirdyFollowUser }) {
    const [following, setFollowing] = useState(user.isFollowing);
    const [confirmUnfollow, setConfirmUnfollow] = useState(false);

    function onButton() {
        if (following) { setConfirmUnfollow(true); return; }
        setFollowing(true);
        void apiToggleFollow(user.handle);
    }
    function unfollow() {
        setConfirmUnfollow(false);
        setFollowing(false);
        void apiToggleFollow(user.handle);
    }

    return (
        <>
        <div className="flex items-start gap-4 border-b border-hairline/10 px-4 py-4">
            <Avatar size={64} src={user.avatar} />

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-[19px] font-bold text-label">{user.name}</span>
                    {user.verified && <VerifiedBadge size={19} type={user.verifiedType} />}
                    {user.followsYou && (
                        <span className="shrink-0 rounded-md border px-2 py-[3px] text-[14px] font-semibold leading-none" style={{ background: PILL, borderColor: LINE_STRONG, color: TEXT }}>
                            {t('squawk.followsYou', 'Follows you')}
                        </span>
                    )}
                </div>
                <div className="truncate text-[17px]" style={{ color: BLUE }}>@{user.handle}</div>
                {user.bio && (
                    <div className="mt-0.5 truncate text-[17px]" style={{ color: META }}>
                        <RichText text={user.bio} />
                    </div>
                )}
            </div>

            <button
                type="button"
                onClick={onButton}
                className="mt-1 shrink-0 rounded-full px-5 py-2 text-[16px] font-bold transition-colors active:opacity-80"
                style={following
                    ? { border: `1px solid ${LINE_STRONG}`, color: TEXT }
                    : { background: BLUE, color: '#fff' }}
            >
                {following ? t('squawk.following', 'Following') : t('squawk.follow', 'Follow')}
            </button>
        </div>

        {confirmUnfollow && (
            <AlertDialog
                title={t('squawk.unfollowTitle', 'Unfollow @{handle}?', { handle: user.handle })}
                message={t('squawk.unfollowMessage', 'Their posts will no longer show up in your home timeline.')}
                confirmLabel={t('squawk.unfollow', 'Unfollow')}
                onCancel={() => setConfirmUnfollow(false)}
                onConfirm={unfollow}
            />
        )}
        </>
    );
}
