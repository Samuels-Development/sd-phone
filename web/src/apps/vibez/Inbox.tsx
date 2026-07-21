import { useState } from 'react';
import { BadgeCheck, UserPlus } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { GRAD_FROM, GRAD_TO, type VNotif } from './data';
import { apiActivity, apiToggleFollow } from './vibezApi';

const SB_H = 54;

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
                <h1 className="text-[22px] font-bold tracking-tight">{t('vibez.inbox', 'Inbox')}</h1>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar pb-24">
                {loading && notifs.length === 0 ? (
                    <p className="px-4 pt-10 text-center text-[14px] text-white/45">{t('vibez.loading', 'Loading…')}</p>
                ) : notifs.length === 0 ? (
                    <p className="px-4 pt-10 text-center text-[14px] text-white/45">{t('vibez.noActivity', 'Nothing yet — post a vibe to get noticed.')}</p>
                ) : notifs.map(n => (
                    <div
                        key={n.id}
                        className="flex w-full items-center gap-3 px-4 py-3 active:bg-white/5"
                        role="button"
                        tabIndex={0}
                        onClick={() => { if (n.postId) onOpenPostId(n.postId); else onOpenProfile(n.user.handle); }}
                        onKeyDown={e => { if (e.key === 'Enter') { if (n.postId) onOpenPostId(n.postId); else onOpenProfile(n.user.handle); } }}
                    >
                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); onOpenProfile(n.user.handle); }}
                            className="shrink-0 active:opacity-80"
                        >
                            <img src={n.user.avatar} alt="" draggable={false} className="h-11 w-11 rounded-full object-cover" />
                        </button>

                        <div className="min-w-0 flex-1 text-left">
                            <p className="text-[14px] leading-snug">
                                <span className="inline-flex items-center gap-1 font-semibold">
                                    {n.user.handle}
                                    {n.user.verified && (
                                        <BadgeCheck className="h-[13px] w-[13px]" style={{ color: GRAD_FROM, fill: GRAD_FROM }} stroke="#000" strokeWidth={1.6} />
                                    )}
                                </span>{' '}
                                <span className="text-white/80">{n.text}</span>
                            </p>
                            <span className="text-[12px] text-white/45">{n.time}</span>
                        </div>

                        {n.kind === 'follow' ? (
                            <button
                                type="button"
                                onClick={e => { e.stopPropagation(); followBack(n.user.handle); }}
                                className="shrink-0 rounded-md px-4 py-1.5 text-[13px] font-semibold text-white active:opacity-80"
                                style={followed.has(n.user.handle)
                                    ? { background: 'rgba(255,255,255,0.12)' }
                                    : { background: `linear-gradient(135deg, ${GRAD_FROM}, ${GRAD_TO})` }}
                            >
                                <span className="flex items-center gap-1">
                                    <UserPlus className="h-3.5 w-3.5" strokeWidth={2.6} />
                                    {followed.has(n.user.handle) ? t('vibez.followingBtn', 'Following') : t('vibez.follow', 'Follow')}
                                </span>
                            </button>
                        ) : n.thumb ? (
                            <img src={n.thumb} alt="" draggable={false} className="h-12 w-10 shrink-0 rounded object-cover" />
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
}
