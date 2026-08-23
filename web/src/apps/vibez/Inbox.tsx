import { useState } from 'react';
import { AtSign, Bell, Heart, MessageCircle, UserPlus, Video } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { EmptyState } from '@/ui/EmptyState';
import { ACCENT, GRAD_FROM, GRAD_TO, HEART, type VNotif, type VNotifKind } from './data';
import { apiActivity, apiToggleFollow } from './vibezApi';
import { Avatar, FadeImg, ListSkeleton, VerifiedBadge } from './ui';

const SB_H = 58;

export function Inbox({ onOpenPostId, onOpenProfile, onSeen, refreshKey }: {
    onOpenPostId:  (postId: string) => void;
    onOpenProfile: (handle: string) => void;
    onSeen:        () => void;
    refreshKey:    number;
}) {
    const [notifs,   setNotifs]   = useState<VNotif[]>([]);
    const [followed, setFollowed] = useState<Set<string>>(new Set());

    const { loading } = useAsyncData<VNotif[]>(
        () => apiActivity(),
        [refreshKey],
        { onData: d => { setNotifs(d); onSeen(); } },
    );

    function followBack(handle: string) {
        setFollowed(prev => {
            const next = new Set(prev);
            if (next.has(handle)) next.delete(handle); else next.add(handle);
            return next;
        });
        void apiToggleFollow(handle);
    }

    return (
        <div className="flex h-full flex-col bg-black text-white">
            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="shrink-0 px-4 pb-2">
                <h1 className="text-[22px] font-extrabold tracking-tight">{t('vibez.inbox', 'Inbox')}</h1>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-4">
                {loading && notifs.length === 0 ? (
                    <ListSkeleton />
                ) : notifs.length === 0 ? (
                    <div className="dark">
                        <EmptyState
                            icon={Bell}
                            title={t('vibez.noActivityTitle', 'No activity yet')}
                            subtitle={t('vibez.noActivity', 'Post a clip to get noticed.')}
                            circleClassName="bg-white/10"
                        />
                    </div>
                ) : notifs.map(n => (
                    <div
                        key={n.id}
                        className="flex w-full gap-3.5 border-b border-white/10 px-4 py-4 text-left transition-colors active:bg-white/[0.04]"
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (n.postId) onOpenPostId(n.postId); else onOpenProfile(n.user.handle); }}
                        onKeyDown={e => { if (e.key === 'Enter') { if (n.postId) onOpenPostId(n.postId); else onOpenProfile(n.user.handle); } }}
                    >
                        <div className="flex w-8 shrink-0 justify-center pt-2">
                            <KindGlyph kind={n.kind} />
                        </div>

                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={e => { e.stopPropagation(); onOpenProfile(n.user.handle); }}
                                    className="shrink-0 active:opacity-80"
                                >
                                    <Avatar size={44} src={n.user.avatar} />
                                </button>
                                <p className="min-w-0 flex-1 text-[17px] leading-snug">
                                    <span className="inline-flex items-center gap-1 font-bold">
                                        {n.user.handle}
                                        {n.user.verified && (
                                            <VerifiedBadge size={15} />
                                        )}
                                    </span>{' '}
                                    <span className="text-white/80">{n.text}</span>{' '}
                                    <span className="text-white/40">{n.time}</span>
                                </p>
                            </div>
                        </div>

                        {n.kind === 'follow' ? (
                            <button
                                type="button"
                                onClick={e => { e.stopPropagation(); followBack(n.user.handle); }}
                                className="shrink-0 self-center rounded-[8px] px-3.5 py-1.5 text-[14px] font-semibold text-white active:opacity-80"
                                style={followed.has(n.user.handle)
                                    ? { background: 'rgba(255,255,255,0.12)' }
                                    : { background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})` }}
                            >
                                {followed.has(n.user.handle) ? t('vibez.followingBtn', 'Following') : t('vibez.follow', 'Follow')}
                            </button>
                        ) : n.thumb ? (
                            <FadeImg src={n.thumb} className="h-12 w-10 shrink-0 rounded object-cover" />
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
}

function KindGlyph({ kind }: { kind: VNotifKind }) {
    if (kind === 'like')    return <Heart className="h-7 w-7" fill={HEART} color={HEART} />;
    if (kind === 'comment') return <MessageCircle className="h-7 w-7" color={ACCENT} />;
    if (kind === 'mention') return <AtSign className="h-7 w-7" color={ACCENT} strokeWidth={2.2} />;
    if (kind === 'follow')  return <UserPlus className="h-7 w-7" color={ACCENT} strokeWidth={2.2} />;
    return <Video className="h-7 w-7" color={ACCENT} strokeWidth={2.2} />;
}
