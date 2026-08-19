import {
    createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import type { ReactNode } from 'react';

import { fetchNui } from '@/core/nui';
import type { ExternalNowPlayingTrack } from '@/core/types';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { isSourceAllowed, youtubeId, youtubePlaybackPossible } from './data';
import type { Track } from './data';

declare global {
    interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (!youtubePlaybackPossible()) return Promise.resolve();
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (!ytApiPromise) {
        ytApiPromise = new Promise<void>(resolve => {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(); };
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        });
    }
    return ytApiPromise;
}

interface MusicCtx {
    current:  Track | null;
    playing:  boolean;
    volume:   number;
    shuffle:  boolean;
    repeat:   boolean;
    play:      (track: Track, queue?: Track[]) => void;
    stop:      () => void;
    toggle:    () => void;
    next:      () => void;
    prev:      () => void;
    seek:      (t: number) => void;
    setVolume: (v: number) => void;
    setShuffle: (v: boolean) => void;
    setRepeat:  (v: boolean) => void;
    requestOpen: () => void;
    openSignal:  number;
}

interface MusicProgress {
    time:     number;
    duration: number;
}

const Ctx = createContext<MusicCtx | null>(null);
export function useMusic(): MusicCtx {
    const c = useContext(Ctx);
    if (!c) throw new Error('useMusic must be used within MusicProvider');
    return c;
}

const ProgressCtx = createContext<MusicProgress | null>(null);
export function useMusicProgress(): MusicProgress {
    const c = useContext(ProgressCtx);
    if (!c) throw new Error('useMusicProgress must be used within MusicProvider');
    return c;
}

const isYt = (t: Track | null) => !!t && youtubeId(t.url) !== null;

export function MusicProvider({ children }: { children: ReactNode }) {
    const audioRef  = useRef<HTMLAudioElement>(null);
    const ytHostRef = useRef<HTMLDivElement>(null);
    const ytRef     = useRef<any>(null);
    const ytReady   = useRef(false);
    const ytPlayerPromise = useRef<Promise<void> | null>(null);
    const handlers  = useRef<{ ended: () => void }>({ ended: () => {} });
    const wantPlay  = useRef(false);
    const timeRef   = useRef(0);

    const [current, setCurrent]   = useState<Track | null>(null);
    const [queue, setQueue]       = useState<Track[]>([]);
    const [playing, setPlaying]   = useState(false);
    const [time, setTime]         = useState(0);
    const [duration, setDuration] = useState(0);
    const [shuffle, setShuffle]   = useState(false);
    const [repeat, setRepeat]     = useState(false);
    const [openSignal, setOpenSignal] = useState(0);
    const [volume, setVolumeState] = useState(() => {
        const v = Number(window.localStorage.getItem('sd-phone:music:vol'));
        return isFinite(v) && v > 0 ? Math.min(1, v) : 1;
    });

    // A third-party resource's own audio engine reporting itself as Now Playing (see
    // ExternalNowPlayingTrack). While set, it replaces the built-in player everywhere this
    // context is read (Control Center, the dynamic island, the Now Playing widget) without any
    // of those call sites knowing the difference. It never touches the <audio>/YouTube engine
    // above — that stays exclusively the built-in Music app's, so a provider going away hands
    // control back to whatever the built-in player was already doing.
    const [external, setExternal] = useState<{ appId: string; track: ExternalNowPlayingTrack } | null>(null);

    useNuiEvent('sd-phone:nowPlaying:set', useCallback((data: { appId: string; track: ExternalNowPlayingTrack }) => {
        setExternal({ appId: data.appId, track: data.track });
    }, []));
    useNuiEvent('sd-phone:nowPlaying:clear', useCallback((data: { appId: string }) => {
        // A stale clear from a provider that already lost the slot to a newer one must not
        // wipe that newer provider's card.
        setExternal(cur => (cur?.appId === data.appId ? null : cur));
    }, []));

    // Two audio sources must never play at once: if the built-in player was already going when
    // an external provider takes the Now Playing slot, pause it (its own <audio>/YT element, via
    // the normal `playing` state below — the effects that own actual playback react to this).
    useEffect(() => {
        if (external) setPlaying(false);
    }, [external]);

    const externalTrack = useMemo<Track | null>(() => {
        if (!external) return null;
        return {
            id: `external:${external.appId}`,
            title:  external.track.title,
            artist: external.track.artist ?? '',
            url:    '',
            thumb:  external.track.thumb,
            addedAt: 0,
        };
    }, [external]);

    const volumeRef = useRef(volume);
    useEffect(() => { volumeRef.current = volume; }, [volume]);

    const ensureYtPlayer = useCallback((): Promise<void> => {
        if (ytPlayerPromise.current) return ytPlayerPromise.current;
        const attempt = (async () => {
            await loadYouTubeApi();
            if (ytRef.current || !ytHostRef.current || !window.YT?.Player) {
                ytPlayerPromise.current = null;
                return;
            }
            await new Promise<void>(resolve => {
                const done = () => { window.clearTimeout(guard); resolve(); };
                const guard = window.setTimeout(resolve, 3000);
                ytRef.current = new window.YT.Player(ytHostRef.current, {
                    height: '1', width: '1',
                    playerVars: { controls: 0, disablekb: 1, playsinline: 1 },
                    events: {
                        onReady: (e: any) => {
                            ytReady.current = true;
                            e.target?.setVolume?.(Math.round(volumeRef.current * 100));
                            done();
                        },
                        onStateChange: (e: any) => {
                            if (e.data === 0) handlers.current.ended();
                            else if (e.data === 1) setPlaying(true);
                            // Only honour a pause the user actually asked for — ignore the
                            // spurious "paused" the player emits mid-track-switch.
                            else if (e.data === 2 && !wantPlay.current) setPlaying(false);
                        },
                    },
                });
            });
        })();
        ytPlayerPromise.current = attempt;
        return attempt;
    }, []);

    useEffect(() => {
        if (!isYt(current)) return;
        const id = window.setInterval(() => {
            const p = ytRef.current;
            if (p && ytReady.current && p.getCurrentTime) {
                setTime(p.getCurrentTime() || 0);
                setDuration(p.getDuration() || 0);
            }
        }, 300);
        return () => window.clearInterval(id);
         
    }, [current]);

    useEffect(() => {
        const a = audioRef.current;
        if (!current) { a?.pause(); try { ytRef.current?.stopVideo?.(); } catch { /* */ } return; }
        if (youtubeId(current.url) && !isSourceAllowed(current.url)) { a?.pause(); setPlaying(false); return; }
        const vid = youtubeId(current.url);
        if (vid) {
            a?.pause();
            const start = () => {
                ytRef.current?.loadVideoById?.(vid);
                if (!playing) window.setTimeout(() => ytRef.current?.pauseVideo?.(), 250);
            };
            if (ytReady.current) start();
            else void ensureYtPlayer().then(start);
        } else {
            try { ytRef.current?.stopVideo?.(); } catch { /* */ }
            if (a) {
                if (a.src !== current.url) { a.src = current.url; a.load(); }
                a.volume = volume;
                if (playing) a.play().catch(() => setPlaying(false));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [current]);

    useEffect(() => {
        if (!current) return;
        if (isYt(current)) {
            const p = ytRef.current;
            if (p && ytReady.current) { if (playing) p.playVideo?.(); else p.pauseVideo?.(); }
        } else {
            const a = audioRef.current;
            if (a) { if (playing) a.play().catch(() => setPlaying(false)); else a.pause(); }
        }
         
    }, [playing, current]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume;
        if (ytRef.current && ytReady.current) ytRef.current.setVolume?.(Math.round(volume * 100));
        try { window.localStorage.setItem('sd-phone:music:vol', String(volume)); } catch { /* */ }
    }, [volume]);

    useEffect(() => { timeRef.current = time; }, [time]);

    const play = useCallback((track: Track, q?: Track[]) => {
        wantPlay.current = true;
        setQueue(q && q.length ? q : [track]);
        setCurrent(track);
        setPlaying(true);
    }, []);
    const toggle = useCallback(() => {
        if (current) setPlaying(p => { wantPlay.current = !p; return !p; });
    }, [current]);
    const stop = useCallback(() => {
        wantPlay.current = false;
        setPlaying(false);
        setCurrent(null);
        setQueue([]);
        setTime(0);
        setDuration(0);
    }, []);
    const seek = useCallback((t: number) => {
        if (isYt(current)) ytRef.current?.seekTo?.(t, true);
        else if (audioRef.current) audioRef.current.currentTime = t;
        setTime(t);
    }, [current]);
    const step = useCallback((dir: 1 | -1) => {
        if (dir === -1 && timeRef.current > 3) { seek(0); return; }
        setCurrent(cur => {
            if (!cur) return cur;
            const list = queue.length ? queue : [cur];
            const idx = list.findIndex(t => t.id === cur.id);
            if (idx < 0) return cur;
            let n: number;
            if (shuffle && list.length > 1) { do { n = Math.floor(Math.random() * list.length); } while (n === idx); }
            else n = (idx + dir + list.length) % list.length;
            wantPlay.current = true;
            setPlaying(true);
            return list[n];
        });
    }, [queue, shuffle, seek]);
    const next = useCallback(() => step(1), [step]);
    const prev = useCallback(() => step(-1), [step]);
    const setVolume = useCallback((v: number) => setVolumeState(Math.max(0, Math.min(1, v))), []);
    const requestOpen = useCallback(() => setOpenSignal(n => n + 1), []);

    handlers.current.ended = () => {
        if (repeat) { wantPlay.current = true; seek(0); setPlaying(true); }
        else next();
    };

    // Transport exposed to the rest of the app: routes to the active external provider (its own
    // audio engine, over NUI) when one holds the Now Playing slot, otherwise falls through to the
    // built-in player's own toggle/next/prev/seek above unchanged.
    const externalAction = useCallback((action: 'toggle' | 'next' | 'prev' | 'seek', value?: number) => {
        if (!external) return false;
        void fetchNui('sd-phone:nowPlaying:action', { appId: external.appId, action, value });
        return true;
    }, [external]);
    const exposedToggle = useCallback(() => { if (!externalAction('toggle')) toggle(); }, [externalAction, toggle]);
    const exposedNext   = useCallback(() => { if (!externalAction('next'))   next(); },   [externalAction, next]);
    const exposedPrev   = useCallback(() => { if (!externalAction('prev'))   prev(); },   [externalAction, prev]);
    const exposedSeek   = useCallback((t: number) => { if (!externalAction('seek', t)) seek(t); }, [externalAction, seek]);

    const value = useMemo<MusicCtx>(() => ({
        current: external ? externalTrack : current,
        playing: external ? external.track.playing : playing,
        volume, shuffle, repeat,
        play, stop,
        toggle: exposedToggle, next: exposedNext, prev: exposedPrev, seek: exposedSeek,
        setVolume, setShuffle, setRepeat,
        requestOpen, openSignal,
    }), [
        external, externalTrack, current, playing, volume, shuffle, repeat,
        play, stop, exposedToggle, exposedNext, exposedPrev, exposedSeek,
        setVolume, setShuffle, setRepeat,
        requestOpen, openSignal,
    ]);

    const progress = useMemo<MusicProgress>(() => (
        external
            ? { time: external.track.position, duration: external.track.duration }
            : { time, duration }
    ), [external, time, duration]);

    return (
        <Ctx.Provider value={value}>
            <ProgressCtx.Provider value={progress}>
                <audio
                    ref={audioRef}
                    onTimeUpdate={e => setTime(e.currentTarget.currentTime)}
                    onLoadedMetadata={e => setDuration(e.currentTarget.duration)}
                    onEnded={() => handlers.current.ended()}
                    onPlay={() => setPlaying(true)}
                    onPause={() => { if (!wantPlay.current) setPlaying(false); }}
                />
                <div style={{ position: 'fixed', width: 1, height: 1, left: -9999, top: -9999, opacity: 0, pointerEvents: 'none' }}>
                    <div ref={ytHostRef} />
                </div>
                {children}
            </ProgressCtx.Provider>
        </Ctx.Provider>
    );
}
