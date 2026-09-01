import { useCallback, useState } from 'react';
import { ChevronLeft } from 'lucide-react';

import { t } from '@/i18n';
import { useAsyncData } from '@/hooks/useAsyncData';
import { useIosPush } from '@/hooks/useIosPush';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { IG } from '../data';
import { apiFollowList, apiToggleFollow, type FollowStatus, type FollowUser } from '../photogramApi';
import { VerifiedCheck } from '../ui';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

type Kind = 'followers' | 'following';

export function FollowList({ username, initial, onBack, onOpenProfile, onChanged, animateIn = true }: {
    username:      string;
    initial:       Kind;
    onBack:        () => void;
    onOpenProfile: (handle: string) => void;
    onChanged?:    () => void;
    animateIn?:    boolean;
}) {
    const { goBack, pageStyle } = useIosPush(onBack, animateIn);
    const [seg, setSeg] = useState<Kind>(initial);
    const { data: users, loading } = useAsyncData(() => apiFollowList(seg, username), [seg, username]);

    return (
        <div className="absolute inset-0 z-50 flex flex-col bg-[#f2f2f2] font-sf" style={pageStyle}>
            <StatusBarSpacer />
            <div className="relative flex shrink-0 items-center px-2 pb-2">
                <button type="button" onClick={goBack} aria-label={t('photogram.back', 'Back')} className="text-black active:opacity-50">
                    <ChevronLeft className="h-[36px] w-[36px]" strokeWidth={2.2} />
                </button>
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[22px] font-semibold text-black">{username}</div>
            </div>

            <div className="flex shrink-0 border-b border-black/[0.08]">
                <Seg label={t('photogram.followers', 'Followers')} active={seg === 'followers'} onClick={() => setSeg('followers')} />
                <Seg label={t('photogram.following', 'Following')} active={seg === 'following'} onClick={() => setSeg('following')} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
                {loading ? null : (
                    <div key={seg} className="animate-swipe-in-left">
                        {(users ?? []).length === 0 ? (
                            <div className="flex flex-col items-center px-8 pt-20 text-center">
                                <div className="text-[20px] font-semibold text-black">{seg === 'followers' ? t('photogram.noFollowersYet', 'No followers yet') : t('photogram.notFollowingAnyone', 'Not following anyone')}</div>
                                <div className="mt-1.5 text-[16px] leading-snug text-black/55">
                                    {seg === 'followers' ? t('photogram.noFollowersDesc', 'When people follow this account, they show up here.') : t('photogram.notFollowingDesc', 'Accounts this person follows show up here.')}
                                </div>
                            </div>
                        ) : (users ?? []).map(u => <Row key={u.handle} u={u} onOpenProfile={onOpenProfile} onChanged={onChanged} />)}
                    </div>
                )}
            </div>
        </div>
    );
}

function Seg({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex-1 py-3 text-[17px] font-semibold ${active ? 'border-b-[1.5px] border-black text-black' : 'text-black/35'}`}
        >
            {label}
        </button>
    );
}

function Row({ u, onOpenProfile, onChanged }: { u: FollowUser; onOpenProfile: (handle: string) => void; onChanged?: () => void }) {
    const [status, setStatus] = useState<FollowStatus>(u.followStatus);
    const [busy,   setBusy]   = useState(false);

    useNuiEvent('sd-phone:photogram:followChanged', useCallback((data: { target?: string; status?: FollowStatus }) => {
        if (data && data.target === u.handle && data.status) setStatus(data.status);
    }, [u.handle]));

    async function toggle() {
        if (busy) return;
        setBusy(true);
        setStatus(await apiToggleFollow(u.handle));
        setBusy(false);
        onChanged?.();
    }

    const btn = status === 'accepted' ? { label: t('photogram.following', 'Following'), cls: 'bg-black/[0.06] text-black' }
        : status === 'pending'       ? { label: t('photogram.requested', 'Requested'), cls: 'bg-black/[0.06] text-black' }
        :                              { label: t('photogram.follow', 'Follow'), cls: 'text-white', style: { background: IG.blue } as const };

    return (
        <div className="flex items-center gap-4 px-4 py-3.5">
            <button type="button" onClick={() => onOpenProfile(u.handle)} className="flex min-w-0 flex-1 items-center gap-4 text-left active:opacity-70">
                <img src={u.avatar} alt="" draggable={false} className="h-[70px] w-[70px] shrink-0 rounded-full object-cover" />
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-[22px] font-semibold text-black">{u.handle}</span>
                        {u.verified && <VerifiedCheck size={22} />}
                    </div>
                    {u.name && <div className="truncate text-[18px]" style={{ color: IG.sub }}>{u.name}</div>}
                </div>
            </button>
            {status !== 'self' && (
                <button
                    type="button"
                    onClick={toggle}
                    disabled={busy}
                    className={`shrink-0 rounded-[10px] px-5 py-3 text-[18px] font-semibold active:opacity-70 ${btn.cls}`}
                    style={btn.style}
                >
                    {btn.label}
                </button>
            )}
        </div>
    );
}
