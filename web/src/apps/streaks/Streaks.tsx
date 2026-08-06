import { useCallback, useEffect, useRef, useState } from 'react';

import { isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { useTheme } from '@/stores/themeStore';
import { Camera } from '@/apps/camera/Camera';
import type { StreakConfig, StreakPost, StreakState, StreakTab } from './data';
import { captureStreakPhoto, streaksGallery, streaksLike, streaksPost, streaksSync, streaksWatch } from './streaksApi';
import { GalleryTab } from './GalleryTab';
import { LeaderboardTab } from './LeaderboardTab';
import { MeTab } from './MeTab';
import { RewardsView } from './RewardsView';
import { StreaksTabBar } from './StreaksTabBar';

const SB_H = 61;
const PAGE = 30;
const TAB_ORDER: Record<StreakTab, number> = { me: 0, gallery: 1, board: 2 };

export function Streaks({ onClose: _onClose }: { onClose: () => void }) {
    const { theme } = useTheme('theme');
    const dark = theme === 'dark';

    const [tab, setTab] = useSessionState<StreakTab>('streaks:tab', 'me');
    const [tabDir, setTabDir] = useState<'left' | 'right'>('right');
    const changeTab = useCallback((next: StreakTab) => {
        setTabDir(TAB_ORDER[next] >= TAB_ORDER[tab] ? 'right' : 'left');
        setTab(next);
    }, [tab, setTab]);

    const [state, setState]     = useState<StreakState | null>(null);
    const [config, setConfig]   = useState<StreakConfig | null>(null);
    const [gallery, setGallery] = useState<StreakPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [posting, setPosting] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);

    const [capturing, setCapturing] = useState(false);
    const [showRewards, setShowRewards] = useState(false);
    const capturingRef = useRef(false);
    const pendingCaption = useRef<string | undefined>(undefined);
    capturingRef.current = capturing;

    useEffect(() => {
        streaksWatch(true);
        return () => streaksWatch(false);
    }, []);

    useEffect(() => {
        let alive = true;
        void streaksSync().then(data => {
            if (!alive) return;
            setState(data.state);
            setConfig(data.config);
            setGallery(data.gallery);
            setHasMore(data.gallery.length >= PAGE);
            setLoading(false);
        });
        return () => { alive = false; };
    }, []);

    const submitPost = useCallback(async (url: string, caption: string | undefined) => {
        setPosting(true);
        try {
            const res = await streaksPost({ imageUrl: url, caption });
            if (res.ok && res.state) {
                setState(res.state);
                if (res.post) {
                    const newPost = res.post;
                    setGallery(prev => (prev.some(p => p.id === newPost.id) ? prev : [newPost, ...prev]));
                }
            }
        } finally {
            setPosting(false);
        }
    }, []);

    const onPost = useCallback(async (caption: string | undefined) => {
        if (!isFiveM) {
            const url = await captureStreakPhoto();
            if (url) await submitPost(url, caption);
            return;
        }
        pendingCaption.current = caption;
        setPosting(true);
        setCapturing(true);
    }, [submitPost]);

    const cancelCapture = useCallback(() => {
        setCapturing(false);
        setPosting(false);
        pendingCaption.current = undefined;
    }, []);

    useNuiEvent('sd-phone:photos:added', useCallback((photo: { url?: string } | undefined) => {
        if (!capturingRef.current) return;
        setCapturing(false);
        const caption = pendingCaption.current;
        pendingCaption.current = undefined;
        if (photo && photo.url) void submitPost(photo.url, caption);
        else setPosting(false);
    }, [submitPost]));

    const onLike = useCallback((postId: number) => {
        setGallery(prev => prev.map(p => p.id === postId
            ? { ...p, likedByMe: !p.likedByMe, likeCount: p.likeCount + (p.likedByMe ? -1 : 1) }
            : p));
        void streaksLike(postId).then(res => {
            if (!res) return;
            setGallery(prev => prev.map(p => p.id === postId
                ? { ...p, likeCount: res.likeCount, likedByMe: res.likedByMe }
                : p));
        });
    }, []);

    const onLoadMore = useCallback(async () => {
        setLoadingMore(true);
        try {
            const last = gallery[gallery.length - 1];
            const more = await streaksGallery(last?.createdAt);
            if (more.length) {
                setGallery(prev => {
                    const seen = new Set(prev.map(p => p.id));
                    return [...prev, ...more.filter(p => !seen.has(p.id))];
                });
            }
            setHasMore(more.length > 0);
        } finally {
            setLoadingMore(false);
        }
    }, [gallery]);

    useNuiEvent('sd-phone:streaks:newPost', useCallback((data) => {
        if (!data) return;
        const post: StreakPost = {
            id: data.id,
            author: data.author,
            imageUrl: data.imageUrl,
            caption: data.caption,
            dayStreak: data.dayStreak,
            postDate: data.postDate,
            createdAt: data.createdAt,
            likeCount: data.likeCount,
            likedByMe: false,
            isMine: false,
        };
        setGallery(prev => (prev.some(p => p.id === post.id) ? prev : [post, ...prev]));
    }, []));

    useNuiEvent('sd-phone:streaks:postChanged', useCallback((data) => {
        if (!data) return;
        setGallery(prev => prev.map(p => (p.id === data.postId ? { ...p, likeCount: data.likeCount } : p)));
    }, []));

    useNuiEvent('sd-phone:streaks:refresh', useCallback(() => {
        void streaksSync().then(data => {
            setState(data.state);
            setConfig(data.config);
            setGallery(data.gallery);
            setHasMore(data.gallery.length >= PAGE);
        });
    }, []));

    return (
        <div className={`absolute inset-0 z-10 flex flex-col select-none ${dark ? 'bg-black text-white' : 'bg-[#d4d4d4] text-black'}`}>
            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="shrink-0 px-5 pb-1 pt-1" style={{ background: dark ? '#000000' : 'rgb(var(--base))' }}>
                <h1 className="text-[34px] font-bold tracking-tight">{t('streaks.streaks', 'Streaks')}</h1>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {loading || !state || !config ? (
                    <div className="flex flex-1 items-center justify-center">
                        <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-black/15 border-t-black/50 dark:border-white/15 dark:border-t-white/60" />
                    </div>
                ) : (
                    <div
                        key={tab}
                        className={`flex min-h-0 flex-1 flex-col ${tabDir === 'right' ? 'animate-tab-in-right' : 'animate-tab-in-left'}`}
                    >
                        {tab === 'me' ? (
                            <MeTab state={state} config={config} dark={dark} posting={posting} onPost={onPost} onOpenRewards={() => setShowRewards(true)} />
                        ) : tab === 'gallery' ? (
                            <GalleryTab
                                posts={gallery}
                                dark={dark}
                                onLike={onLike}
                                onLoadMore={onLoadMore}
                                loadingMore={loadingMore}
                                hasMore={hasMore}
                            />
                        ) : (
                            <LeaderboardTab dark={dark} />
                        )}
                    </div>
                )}
            </div>

            <StreaksTabBar tab={tab} onTab={changeTab} />

            {showRewards && state && config && (
                <RewardsView state={state} config={config} dark={dark} onBack={() => setShowRewards(false)} />
            )}

            {capturing && (
                <div className="absolute inset-0 z-50 animate-slide-up-fade">
                    <Camera onClose={cancelCapture} photoOnly />
                </div>
            )}
        </div>
    );
}
