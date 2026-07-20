import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid, Play, RotateCw, X, Zap, ZapOff } from 'lucide-react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { fetchNui } from '@/core/nui';
import { apiCall, apiData } from '@/core/api';
import { useTheme } from '@/stores/themeStore';
import { LiveAudioMixer, pickRecorderMime } from '@/media/audioMixer';
import { NearbyVoiceCapture, registerGatedMic, unregisterGatedMic, gateAcquire, gateRelease } from '@/media/nearbyVoice';
import { isVideoUrl } from '@/core/photosApi';
import { getGameRender, type GameRender } from '@/render';
import { useDeckActive } from '@/shell/deckActive';
import { useLaunchIntent } from '@/shell/launchIntent';
import { t } from '@/i18n';
import { formatDuration } from '@/lib/time';
import shutterSfx from '@/assets/camera/shutter.mp3';

function playShutter() {
    try {
        const a = new Audio(shutterSfx);
        a.volume = 0.55;
        void a.play().catch(() => {});
    } catch { /* audio unavailable — silent */ }
}

const CONTROL_HINTS: { keys: string[]; label: string }[] = [
    { keys: ['Enter'],     label: 'Take Photo' },
    { keys: ['↑'],         label: 'Flip Camera' },
    { keys: ['E'],         label: 'Flash' },
    { keys: ['←', '→'],    label: 'Change Mode' },
    { keys: ['Alt'],       label: 'Toggle Cursor' },
];

function hintLabel(label: string): string {
    switch (label) {
        case 'Take Photo':    return t('camera.hintTakePhoto', 'Take Photo');
        case 'Flip Camera':   return t('camera.hintFlipCamera', 'Flip Camera');
        case 'Flash':         return t('camera.hintFlash', 'Flash');
        case 'Change Mode':   return t('camera.hintChangeMode', 'Change Mode');
        case 'Toggle Cursor': return t('camera.hintToggleCursor', 'Toggle Cursor');
        default:              return label;
    }
}

interface Photo {
    id:        string;
    url:       string;
    createdAt: string;
}

const ZOOM_OPTIONS = ['0.5', '1×', '2', '5'] as const;
const MODE_OPTIONS = ['VIDEO', 'PHOTO', 'LANDSCAPE'] as const;

const CAPTURE_TIMEOUT_MS = 8000;
const VIDEO_TIMEOUT_MS   = 45000;

const MAX_REC_MS         = 60000;
const VIDEO_BITRATE      = 1_200_000;

function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

export function Camera({ onClose, onLandscapeChange, onOpenApp, photoOnly = false }: {
    onClose: () => void;
    onLandscapeChange?: (v: boolean) => void;
    onOpenApp?: (id: string) => void;
    photoOnly?: boolean;
}) {
    const [photos,  setPhotos]  = useState<Photo[]>([]);
    const [pending, setPending] = useState(false);
    const [zoom,    setZoom]    = useState<typeof ZOOM_OPTIONS[number]>('1×');
    const [mode,    setMode]    = useState<typeof MODE_OPTIONS[number]>('PHOTO');
    const [feedReady, setFeedReady] = useState(false);
    const [showGrid,  setShowGrid]  = useState(false);
    const [vp, setVp] = useState({ w: 0, h: 0 });
    const [recording, setRecording] = useState(false);
    const [recSecs,   setRecSecs]   = useState(0);
    const [flash,     setFlash]     = useState(false);
    const [selfie,    setSelfie]    = useState(false);

    const { setHideHomeIndicator } = useTheme('setHideHomeIndicator');

    // Camera cannot be a live re-parented card (GTA-native cell-cam + a singleton
    // three.js GameRender bound to one canvas), so its switcher card stays the app
    // icon. But we still release the native cam + WebGL readback the instant it is
    // backgrounded (switcher open / pool) so nothing burns behind the blur, and
    // re-acquire on foreground.
    const deckActive = useDeckActive();

    const landscape = mode === 'LANDSCAPE';

    useEffect(() => {
        if (!photoOnly) return;
        setHideHomeIndicator(true);
        return () => setHideHomeIndicator(false);
    }, [photoOnly, setHideHomeIndicator]);

    // Control Center has separate Photo and Record buttons that both open this app, so
    // the mode has to come from the launch itself. photoOnly callers stay pinned to
    // PHOTO. Switching out of VIDEO already stops any in-flight recording below.
    useLaunchIntent<{ mode?: string }>('camera', ({ mode: wanted }) => {
        if (photoOnly || !wanted) return;
        if ((MODE_OPTIONS as readonly string[]).includes(wanted)) {
            setMode(wanted as typeof MODE_OPTIONS[number]);
        }
    });

    const canvasRef    = useRef<HTMLCanvasElement>(null);
    const viewportRef  = useRef<HTMLDivElement>(null);
    const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const renderRef    = useRef<GameRender | null>(null);

    const recorderRef  = useRef<MediaRecorder | null>(null);
    const chunksRef    = useRef<Blob[]>([]);
    const recCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const recRafRef    = useRef<number | null>(null);
    const recTickRef   = useRef<ReturnType<typeof setInterval> | null>(null);
    const recStopRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
    const recActiveRef = useRef(false);
    const mountedRef    = useRef(true);
    const mixerRef      = useRef<LiveAudioMixer | null>(null);
    const camGatedMicRef = useRef<MediaStream | null>(null);
    const nearbyVoiceRef = useRef<NearbyVoiceCapture | null>(null);
    const recStartingRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            const result = await apiData<{ photos: Photo[] }>('sd-phone:photos:list');
            if (!cancelled && result) {
                setPhotos(result.photos);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, []);

    // Mount lifecycle: guarantee a full teardown of recording resources when the app
    // is genuinely closed (not merely backgrounded).
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            recStartingRef.current = false;
            teardownRecording();
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
                recorderRef.current.onstop = null;
                recorderRef.current.stop();
            }
            recorderRef.current = null;
            nearbyVoiceRef.current?.stop();
            nearbyVoiceRef.current = null;
            if (camGatedMicRef.current) { unregisterGatedMic(camGatedMicRef.current); gateRelease(); camGatedMicRef.current = null; }
            mixerRef.current?.destroy();
            mixerRef.current = null;
            if (captureTimer.current) clearTimeout(captureTimer.current);
        };
    }, []);

    // Hold the native cam + GameRender only while this is the interactive foreground
    // instance; release both on background and re-acquire on foreground.
    useEffect(() => {
        if (!deckActive) return;
        let stopped = false;
        void fetchNui('sd-phone:camera:open');

        void getGameRender().then((render) => {
            if (stopped || !render || !canvasRef.current) return;
            renderRef.current = render;
            render.renderToTarget(canvasRef.current);
            setFeedReady(true);
        });

        return () => {
            stopped = true;
            // Backgrounding mid-record: stop cleanly (finalize saves what was captured).
            if (recActiveRef.current) stopRecording();
            renderRef.current?.stop();
            renderRef.current = null;
            setFeedReady(false);
            void fetchNui('sd-phone:camera:close');
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deckActive]);

    useEffect(() => {
        if (mode !== 'VIDEO' && recording) stopRecording();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    useEffect(() => {
        if (!feedReady) return;
        renderRef.current?.setZoom(parseFloat(zoom));
    }, [zoom, feedReady]);

    useEffect(() => {
        onLandscapeChange?.(landscape);
    }, [landscape, onLandscapeChange]);

    useEffect(() => {
        if (!feedReady) return;
        renderRef.current?.setOrientation(landscape ? 'landscape' : 'portrait');
    }, [landscape, feedReady]);

    // Front camera frames the ped off-centre; bias the viewfinder crop to re-centre them.
    useEffect(() => {
        if (!feedReady) return;
        renderRef.current?.setSelfie(selfie);
    }, [selfie, feedReady]);

    useEffect(() => () => onLandscapeChange?.(false), [onLandscapeChange]);

    useEffect(() => {
        void fetchNui('sd-phone:camera:flash', { on: recording && flash });
    }, [recording, flash]);

    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (r) setVp({ w: Math.round(r.width), h: Math.round(r.height) });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useNuiEvent('sd-phone:camera:key', (data) => {
        switch (data?.key) {
            case 'shutter':  handleShutter(); break;
            case 'flip': {
                const next = !selfie;
                setSelfie(next);
                void fetchNui('sd-phone:camera:selfie', { on: next });
                break;
            }
            case 'flash':    setFlash(f => !f); break;
            case 'modePrev': if (!photoOnly) setMode(m => MODE_OPTIONS[(MODE_OPTIONS.indexOf(m) + MODE_OPTIONS.length - 1) % MODE_OPTIONS.length]); break;
            case 'modeNext': if (!photoOnly) setMode(m => MODE_OPTIONS[(MODE_OPTIONS.indexOf(m) + 1) % MODE_OPTIONS.length]); break;
        }
    });

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'AltLeft' || e.key === 'Alt') {
                e.preventDefault();
                void fetchNui('sd-phone:camera:cursor', { on: false });
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    useNuiEvent('sd-phone:photos:added', useCallback((photo) => {
        if (!photo || typeof photo !== 'object') return;
        const p = photo as Photo;
        if (!p.id) return;
        setPhotos(prev => (prev.some(x => x.id === p.id) ? prev : [p, ...prev]));
        setPending(false);
        if (captureTimer.current) { clearTimeout(captureTimer.current); captureTimer.current = null; }
    }, []));

    function grabFrame(): string | null {
        const src = canvasRef.current;
        if (!src || !src.width || !src.height) return null;

        let outW: number;
        let outH: number;
        if (landscape) {
            outW = 1280;
            outH = Math.max(1, Math.round(outW * (vp.w / vp.h || 9 / 16)));
        } else {
            const box = src.getBoundingClientRect();
            outW = 720;
            outH = Math.max(1, Math.round(outW * (box.height / box.width || 16 / 9)));
        }

        const out = document.createElement('canvas');
        out.width = outW;
        out.height = outH;
        const ctx = out.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(src, 0, 0, outW, outH);
        return out.toDataURL('image/jpeg', 0.9);
    }

    async function takeShot() {
        if (pending) return;
        setPending(true);
        playShutter();

        try {
            if (flash) {
                await fetchNui('sd-phone:camera:flash', { on: true });
                await new Promise(r => setTimeout(r, 140));
            }

            const image = grabFrame();
            if (flash) void fetchNui('sd-phone:camera:flash', { on: false });
            if (!image) { setPending(false); return; }

            const res = await apiCall<void>('sd-phone:camera:capture', { image });
            if (!res.success) { setPending(false); return; }

            captureTimer.current = setTimeout(() => setPending(false), CAPTURE_TIMEOUT_MS);
        } catch {
            if (flash) void fetchNui('sd-phone:camera:flash', { on: false });
            setPending(false);
        }
    }

    function teardownRecording() {
        recActiveRef.current = false;
        if (recRafRef.current != null)  { cancelAnimationFrame(recRafRef.current); recRafRef.current = null; }
        if (recTickRef.current)  { clearInterval(recTickRef.current);  recTickRef.current = null; }
        if (recStopRef.current)  { clearTimeout(recStopRef.current);   recStopRef.current = null; }
    }

    async function startRecording() {
        const src = canvasRef.current;
        if (!src || recording || recorderRef.current || recStartingRef.current) return;
        recStartingRef.current = true;

        const box = src.getBoundingClientRect();
        const outW = 720;
        const outH = Math.max(1, Math.round(outW * (box.height / box.width || 16 / 9)));
        const rec = document.createElement('canvas');
        rec.width = outW;
        rec.height = outH;
        const rctx = rec.getContext('2d');
        if (!rctx) { recStartingRef.current = false; return; }
        recCanvasRef.current = rec;

        let stream: MediaStream;
        try { stream = rec.captureStream(30); } catch { recStartingRef.current = false; return; }

        const mixer = new LiveAudioMixer();
        mixerRef.current = mixer;
        const micStream = await mixer.addMicrophone();
        const audioTrack = mixer.ensureTrack();
        if (audioTrack) stream.addTrack(audioTrack);

        if (!mountedRef.current || !recStartingRef.current) {
            mixer.destroy();
            mixerRef.current = null;
            recStartingRef.current = false;
            return;
        }

        const mime = pickRecorderMime(!!audioTrack);
        let recorder: MediaRecorder;
        try {
            recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: VIDEO_BITRATE });
        } catch {
            try { recorder = new MediaRecorder(stream); } catch { mixer.destroy(); mixerRef.current = null; recStartingRef.current = false; return; }
        }

        chunksRef.current = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
        recorder.onstop = () => { void finalizeRecording(); };
        recorderRef.current = recorder;

        recActiveRef.current = true;
        const pump = () => {
            if (!recActiveRef.current) return;
            const live = canvasRef.current;
            if (live && live.width) rctx.drawImage(live, 0, 0, outW, outH);
            recRafRef.current = requestAnimationFrame(pump);
        };
        pump();

        recorder.start();
        recStartingRef.current = false;
        setRecording(true);
        setRecSecs(0);
        recTickRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
        recStopRef.current = setTimeout(() => stopRecording(), MAX_REC_MS);

        if (micStream) {
            camGatedMicRef.current = micStream;
            registerGatedMic(micStream);
            gateAcquire();
        }

        const nearby = new NearbyVoiceCapture(mixer);
        nearbyVoiceRef.current = nearby;
        void nearby.start();
    }

    function stopRecording() {
        recStartingRef.current = false;
        teardownRecording();
        setRecording(false);
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
    }

    async function finalizeRecording() {
        const recorder = recorderRef.current;
        recorderRef.current = null;
        nearbyVoiceRef.current?.stop();
        nearbyVoiceRef.current = null;
        if (camGatedMicRef.current) { unregisterGatedMic(camGatedMicRef.current); gateRelease(); camGatedMicRef.current = null; }
        mixerRef.current?.destroy();
        mixerRef.current = null;
        const chunks = chunksRef.current;
        chunksRef.current = [];
        recCanvasRef.current = null;
        if (!mountedRef.current || !chunks.length) return;

        const rawType = recorder?.mimeType || chunks[0]?.type || 'video/webm';
        const type = rawType.split(';')[0] || 'video/webm';
        const blob = new Blob(chunks, { type });
        setPending(true);
        try {
            const dataUrl = await blobToDataURL(blob);
            const res = await apiCall<void>('sd-phone:camera:capture', { image: dataUrl, kind: 'video' });
            if (!res.success) { setPending(false); return; }
            captureTimer.current = setTimeout(() => setPending(false), VIDEO_TIMEOUT_MS);
        } catch {
            setPending(false);
        }
    }

    function handleShutter() {
        if (mode === 'VIDEO') {
            if (recording) stopRecording(); else void startRecording();
        } else {
            void takeShot();
        }
    }

    const latestPhoto = photos[0];
    const latestIsVideo = latestPhoto ? isVideoUrl(latestPhoto.url) : false;

    const hints = photoOnly ? CONTROL_HINTS.filter(h => h.label !== 'Change Mode') : CONTROL_HINTS;

    return (
        <div className="absolute inset-0 z-10 flex flex-col text-white">
            {createPortal(
                <div
                    className="pointer-events-none fixed right-4 top-4 z-[2147483647] flex flex-col items-end gap-1.5"
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                >
                    {hints.map(hint => (
                        <div key={hint.label} className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-white">{hintLabel(hint.label)}</span>
                            <span className="flex gap-1">
                                {hint.keys.map(k => (
                                    <kbd
                                        key={k}
                                        className="flex h-6 min-w-[26px] items-center justify-center rounded-[6px] border border-white/25 bg-black/55 px-1.5 text-[12px] font-semibold text-white backdrop-blur-sm"
                                    >
                                        {k}
                                    </kbd>
                                ))}
                            </span>
                        </div>
                    ))}
                </div>,
                document.body,
            )}

            <div className="relative min-h-[128px] shrink-0 bg-black">
                <div className="flex items-center justify-between px-5 pb-2 pt-[58px]">
                    <button
                        type="button"
                        aria-label={t('camera.flash', 'Flash')}
                        aria-pressed={flash}
                        onClick={() => setFlash(f => !f)}
                        className={[
                            'flex h-9 w-9 items-center justify-center rounded-full active:bg-white/10',
                            flash ? 'text-[#FFD60A]' : 'text-white/90',
                        ].join(' ')}
                    >
                        {flash
                            ? <Zap className="h-[18px] w-[18px] fill-[#FFD60A]" strokeWidth={2.1} />
                            : <ZapOff className="h-[18px] w-[18px]" strokeWidth={2.1} />}
                    </button>
                    <button
                        type="button"
                        aria-label={t('camera.grid', 'Grid')}
                        aria-pressed={showGrid}
                        onClick={() => setShowGrid(g => !g)}
                        className={[
                            'flex h-9 w-9 items-center justify-center rounded-full active:bg-white/10',
                            showGrid ? 'text-[#FFD60A]' : 'text-white/90',
                        ].join(' ')}
                    >
                        <LayoutGrid className="h-[20px] w-[20px]" strokeWidth={2} />
                    </button>
                </div>
            </div>

            <div ref={viewportRef} className="relative flex-1 min-h-0 overflow-hidden bg-black">
                <canvas
                    ref={canvasRef}
                    className="absolute"
                    style={
                        landscape && vp.w > 0
                            ? {
                                  display: 'block',
                                  top: '50%',
                                  left: '50%',
                                  width: vp.h,
                                  height: vp.w,
                                  transform: 'translate(-50%, -50%) rotate(90deg)',
                              }
                            : { display: 'block', inset: 0, width: '100%', height: '100%' }
                    }
                />

                {showGrid && (
                    <div className="pointer-events-none absolute inset-0 z-[15]">
                        <div className="absolute inset-y-0 left-1/3  w-px bg-white/40" />
                        <div className="absolute inset-y-0 left-2/3  w-px bg-white/40" />
                        <div className="absolute inset-x-0 top-1/3   h-px bg-white/40" />
                        <div className="absolute inset-x-0 top-2/3   h-px bg-white/40" />
                    </div>
                )}

                <div
                    className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-500"
                    style={{ opacity: feedReady ? 0 : 1 }}
                />

                {recording && (
                    <div className="absolute left-1/2 top-3 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 backdrop-blur">
                        <span className="h-2 w-2 rounded-full bg-[#ff3b30] motion-safe:animate-pulse" />
                        <span className="text-[12px] font-semibold tabular-nums text-white">{formatDuration(recSecs)}</span>
                    </div>
                )}

                {pending && (
                    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/25">
                        <div className="text-[14px] font-medium text-white/90">
                            {t('camera.saving', 'Saving…')}
                        </div>
                    </div>
                )}

                <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2 py-1.5 backdrop-blur">
                    {ZOOM_OPTIONS.map(z => {
                        const isActive = z === zoom;
                        return (
                            <button
                                key={z}
                                type="button"
                                onClick={() => setZoom(z)}
                                className={[
                                    'flex h-[33px] min-w-[33px] items-center justify-center rounded-full px-1.5 text-[12px] font-semibold transition-colors',
                                    isActive
                                        ? 'bg-white/15 text-[#FFD60A]'
                                        : 'text-white/85 hover:text-white',
                                ].join(' ')}
                            >
                                {z}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="relative shrink-0 bg-black">
                {!photoOnly && (
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-7 px-4 pb-2 pt-3 text-[15px] font-semibold tracking-[0.16em]">
                        {MODE_OPTIONS.map((m, i) => {
                            const isActive = m === mode;
                            return (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMode(m)}
                                    className={[
                                        'transition-colors whitespace-nowrap',
                                        i === 0 ? 'justify-self-end' : i === 2 ? 'justify-self-start' : 'justify-self-center',
                                        isActive ? 'text-[#FFD60A]' : 'text-white/55 hover:text-white/85',
                                    ].join(' ')}
                                >
                                    {m}
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className={`flex items-center justify-center gap-10 px-6 pb-7 ${photoOnly ? 'pt-4' : 'pt-1'}`}>
                    {photoOnly ? (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={t('camera.cancel', 'Cancel')}
                            className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-white/15 text-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] backdrop-blur-md transition-transform active:scale-95"
                        >
                            <X className="h-[27px] w-[27px]" strokeWidth={2.2} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => { if (onOpenApp) onOpenApp('photos'); else onClose(); }}
                            aria-label={t('camera.openGallery', 'Open gallery')}
                            className="relative h-[58px] w-[58px] overflow-hidden rounded-full border border-white/30 bg-white/5 shadow-[0_1px_3px_rgba(0,0,0,0.4)] active:opacity-70"
                        >
                            {latestPhoto && (latestIsVideo ? (
                                <>
                                    <video src={latestPhoto.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                        <Play className="h-4 w-4 fill-white text-white drop-shadow" />
                                    </span>
                                </>
                            ) : (
                                <img
                                    src={latestPhoto.url}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    draggable={false}
                                />
                            ))}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={handleShutter}
                        disabled={pending && !recording}
                        aria-label={mode === 'VIDEO' ? (recording ? t('camera.stopRecording', 'Stop recording') : t('camera.startRecording', 'Start recording')) : t('camera.takePhoto', 'Take photo')}
                        className="group relative flex h-[74px] w-[74px] items-center justify-center rounded-full ring-[3px] ring-white active:opacity-90 disabled:opacity-60"
                    >
                        {mode === 'VIDEO' ? (
                            <span
                                className={
                                    recording
                                        ? 'block h-[26px] w-[26px] rounded-[7px] bg-[#ff3b30] transition-all duration-150'
                                        : 'block h-[61px] w-[61px] rounded-full bg-[#ff3b30] transition-all duration-150 group-active:scale-90'
                                }
                            />
                        ) : (
                            <span className="block h-[61px] w-[61px] rounded-full bg-white transition-transform duration-100 group-active:scale-90" />
                        )}
                    </button>

                    <button
                        type="button"
                        aria-label={t('camera.flipCamera', 'Flip camera')}
                        aria-pressed={selfie}
                        onClick={() => {
                            const next = !selfie;
                            setSelfie(next);
                            void fetchNui('sd-phone:camera:selfie', { on: next });
                        }}
                        className={[
                            'flex h-[58px] w-[58px] items-center justify-center rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.4)] backdrop-blur-md transition-transform active:scale-95',
                            selfie ? 'bg-[#FFD60A] text-black' : 'bg-white/15 text-white active:bg-white/25',
                        ].join(' ')}
                    >
                        <RotateCw className="h-[27px] w-[27px]" strokeWidth={2.2} />
                    </button>
                </div>
            </div>
        </div>
    );
}
