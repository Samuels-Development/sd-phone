import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LayoutGrid, Play, RotateCw, Sparkles, X, Zap, ZapOff } from 'lucide-react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { fetchNui } from '@/core/nui';
import { apiCall, apiData } from '@/core/api';
import { useTheme } from '@/stores/themeStore';
import { LiveAudioMixer, pickRecorderMime } from '@/media/audioMixer';
import { NearbyVoiceCapture, registerGatedMic, unregisterGatedMic, gateAcquire, gateRelease } from '@/media/nearbyVoice';
import { isVideoUrl } from '@/core/photosApi';
import { getGameRender, type GameRender } from '@/render';
import { useDeckActive } from '@/shell/deckActive';
import { useStatusBarLight } from '@/shell/useStatusBarLight';
import { useLaunchIntent } from '@/shell/launchIntent';
import { t } from '@/i18n';
import { formatDuration } from '@/lib/time';
import shutterSfx from '@/assets/camera/shutter.mp3';
import { useSessionState } from '@/hooks/useSessionState';
import { CAMERA_FILTERS, filterCss, filterLabel } from './filters';
import { FilterDefs } from './FilterDefs';

function PickerItem({ active, label, onClick, children }: {
    active:   boolean;
    label:    string;
    onClick:  () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className="flex shrink-0 flex-col items-center gap-1.5"
        >
            <span
                className={[
                    'flex h-[58px] w-[58px] items-center justify-center overflow-hidden rounded-[9px] bg-white/10 transition-all duration-150',
                    active ? 'ring-[2.5px] ring-[#FFD60A]' : 'ring-1 ring-white/25',
                ].join(' ')}
            >
                {children}
            </span>
            <span
                className={[
                    'max-w-[70px] truncate text-[10.5px] font-medium',
                    active ? 'text-[#FFD60A]' : 'text-white/85',
                ].join(' ')}
            >
                {label}
            </span>
        </button>
    );
}

function playShutter() {
    try {
        const a = new Audio(shutterSfx);
        a.volume = 0.55;
        void a.play().catch(() => {});
    } catch { /* audio unavailable — silent */ }
}

type HintCorner = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

interface HintConfig {
    enabled: boolean;
    corner:  HintCorner;
    columns: number;
}

// Matches configs/phone.lua CameraHints, and stands in until Lua answers so the list does not
// jump from one corner to another on open.
const HINT_DEFAULTS: HintConfig = { enabled: true, corner: 'top-right', columns: 2 };

const HINT_CORNER_CLASS: Record<HintCorner, string> = {
    'top-right':    'right-4 top-4',
    'top-left':     'left-4 top-4',
    'bottom-right': 'right-4 bottom-4',
    'bottom-left':  'left-4 bottom-4',
};

// `selfieOnly` hints stay mounted and collapse instead of unmounting, so they can animate out.
const CONTROL_HINTS: { keys: string[]; label: string; selfieOnly?: boolean }[] = [
    { keys: ['Enter'],     label: 'Take Photo' },
    { keys: ['↑'],         label: 'Flip Camera' },
    { keys: ['E'],         label: 'Flash' },
    { keys: ['←', '→'],    label: 'Change Mode' },
    { keys: ['Alt'],       label: 'Toggle Cursor' },
    { keys: ['↓'],         label: 'Angle', selfieOnly: true },
    { keys: ['R Shift'],   label: 'Face', selfieOnly: true },
];

function hintLabel(label: string, angleLocked: boolean, facingCam: boolean): string {
    switch (label) {
        case 'Take Photo':    return t('camera.hintTakePhoto', 'Take Photo');
        case 'Flip Camera':   return t('camera.hintFlipCamera', 'Flip Camera');
        case 'Flash':         return t('camera.hintFlash', 'Flash');
        case 'Change Mode':   return t('camera.hintChangeMode', 'Change Mode');
        case 'Toggle Cursor': return t('camera.hintToggleCursor', 'Toggle Cursor');
        // Labels what the mouse will control after the press, not the state it is in: "Lock Angle"
        // read equally well as "the angle is locked", which is what made it feel inverted.
        case 'Angle':         return angleLocked
            ? t('camera.hintMoveYourself', 'Move Yourself')
            : t('camera.hintMoveCamera', 'Move Camera');
        case 'Face':          return facingCam
            ? t('camera.hintLookAhead', 'Look Ahead')
            : t('camera.hintFaceCamera', 'Face Camera');
        default:              return label;
    }
}

interface Photo {
    id:        string;
    url:       string;
    createdAt: string;
}

const ZOOM_PRESETS = [1, 2, 5] as const;
const ZOOM_MIN = ZOOM_PRESETS[0];
const ZOOM_MAX = ZOOM_PRESETS[ZOOM_PRESETS.length - 1];
// Wheel zoom is multiplicative so a notch changes the framing by the same proportion at every
// magnification; a fixed step crawls at 5× and lurches at 0.5×.
const ZOOM_WHEEL_RATE = 0.0015;
const ZOOM_KEY_STEP   = 1.15;

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

// Labels drop the trailing zero the way iOS does: 1× not 1.0×, but 1.5× keeps its decimal.
const zoomLabel = (z: number) => `${Number.isInteger(z) ? z : z.toFixed(1)}×`;
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
    const [zoom,    setZoom]    = useState<number>(1);
    const [mode,    setMode]    = useState<typeof MODE_OPTIONS[number]>('PHOTO');
    const [feedReady, setFeedReady] = useState(false);
    const [showGrid,  setShowGrid]  = useState(false);
    const [vp, setVp] = useState({ w: 0, h: 0 });
    const [recording, setRecording] = useState(false);
    const [recSecs,   setRecSecs]   = useState(0);
    const [flash,     setFlash]     = useState(false);
    const [filterId,  setFilterId]  = useSessionState('camera:filter', 'original');
    const [pickerOpen, setPickerOpen] = useState(false);
    const [swatch,    setSwatch]    = useState<string | null>(null);
    const filterStyle = filterCss(filterId);
    const filterRef = useRef(filterStyle);
    filterRef.current = filterStyle;
    const [selfie,    setSelfie]    = useState(false);
    // Mirror the selfie state held in Lua so the hints can describe what pressing each key does now.
    const [angleLocked, setAngleLocked] = useState(false);
    const [facingCam,   setFacingCam]   = useState(false);
    // True only when the native cell cam took the view, i.e. the server froze the player while
    // framing. Decides whether the selfie crop bias applies.
    const [nativeCam, setNativeCam] = useState(false);
    const [hintCfg,   setHintCfg]   = useState<HintConfig>(HINT_DEFAULTS);

    const { setHideHomeIndicator } = useTheme('setHideHomeIndicator');

    // Camera cannot be a live re-parented card (GTA-native cell-cam + a singleton
    // three.js GameRender bound to one canvas), so its switcher card stays the app
    // icon. But we still release the native cam + WebGL readback the instant it is
    // backgrounded (switcher open / pool) so nothing burns behind the blur, and
    // re-acquire on foreground.
    const deckActive = useDeckActive();

    // The viewfinder is a live canvas, so nothing in the DOM tells auto-contrast how dark it is and
    // the home pill renders dark against the game view. The other canvas apps declare this the same
    // way; the hook scopes itself to the active deck entry, so it cannot leak under keep-alive.
    useStatusBarLight(true);

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
        void fetchNui<{ walkable?: boolean; hints?: Partial<HintConfig> }>('sd-phone:camera:open').then((res) => {
            if (stopped) return;
            setNativeCam(res?.walkable === false);
            // Dev has no Lua behind it, so an absent payload keeps the defaults rather than blanking
            // the list.
            setHintCfg({ ...HINT_DEFAULTS, ...(res?.hints ?? {}) });
        });

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
        // The scripted cam zooms optically, so the game renders the tighter view at full resolution
        // and the crop stays at its base framing. The native cell cam has no FOV we can set, so
        // that path still magnifies the rendered frame and softens as it goes.
        renderRef.current?.setZoom(nativeCam ? zoom : 1);
        void fetchNui('sd-phone:camera:zoom', { zoom });
    }, [zoom, nativeCam, feedReady]);

    useEffect(() => {
        onLandscapeChange?.(landscape);
        void fetchNui('sd-phone:camera:landscape', { on: landscape });
    }, [landscape, onLandscapeChange]);

    useEffect(() => {
        if (!feedReady) return;
        renderRef.current?.setOrientation(landscape ? 'landscape' : 'portrait');
    }, [landscape, feedReady]);

    // Only the NATIVE front camera frames the ped off-centre, so only it needs the re-centring
    // crop bias. The scripted cam points itself at the head, and biasing that pushes the player
    // off to the right by the same amount it was meant to correct.
    useEffect(() => {
        if (!feedReady) return;
        renderRef.current?.setSelfie(selfie && nativeCam);
    }, [selfie, nativeCam, feedReady]);

    useEffect(() => () => {
        onLandscapeChange?.(false);
        void fetchNui('sd-phone:camera:landscape', { on: false });
    }, [onLandscapeChange]);

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

    useNuiEvent('sd-phone:camera:lock', (data) => {
        setAngleLocked(!!data?.on);
    });

    useNuiEvent('sd-phone:camera:faceCam', (data) => {
        setFacingCam(!!data?.on);
    });

    // Lua clears both on every lens flip, so drop them here on the same event rather than waiting to
    // be told; otherwise a hint would describe behaviour the lens is no longer doing.
    useEffect(() => {
        setAngleLocked(false);
        setFacingCam(false);
    }, [selfie]);

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
            // Relayed from Lua only while the viewfinder has handed the mouse to the game, where
            // the page sees no wheel events of its own.
            case 'zoomIn':   setZoom(z => clampZoom(z * ZOOM_KEY_STEP)); break;
            case 'zoomOut':  setZoom(z => clampZoom(z / ZOOM_KEY_STEP)); break;
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

    function togglePicker() {
        if (!pickerOpen) setSwatch(grabSwatch());
        setPickerOpen(open => !open);
    }

    function grabSwatch(): string | null {
        const src = canvasRef.current;
        if (!src || !src.width || !src.height) return null;
        const shownW = src.offsetWidth;
        const shownH = src.offsetHeight;
        if (!shownW || !shownH) return null;
        const out = document.createElement('canvas');
        out.width = 96;
        out.height = 96;
        const ctx = out.getContext('2d');
        if (!ctx) return null;
        const side = Math.min(shownW, shownH);
        const sw = src.width  * (side / shownW);
        const sh = src.height * (side / shownH);
        ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, 96, 96);
        return out.toDataURL('image/jpeg', 0.7);
    }

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
        if (filterStyle !== 'none') ctx.filter = filterStyle;
        ctx.drawImage(src, 0, 0, outW, outH);
        ctx.filter = 'none';
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
            if (live && live.width) {
                rctx.filter = filterRef.current === 'none' ? 'none' : filterRef.current;
                rctx.drawImage(live, 0, 0, outW, outH);
                rctx.filter = 'none';
            }
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

    // The column nearest the chosen edge fills first and the overflow sits inboard of it, so the
    // list reads outward-in. Rendering order is left-to-right, hence the flip when anchored right.
    const hintEdgeRight = hintCfg.corner.endsWith('right');
    const hintColumns: typeof hints[] = (() => {
        if (hintCfg.columns < 2) return [hints];
        const split = Math.ceil(hints.length / 2);
        const edge  = hints.slice(0, split);
        const inner = hints.slice(split);
        return hintEdgeRight ? [inner, edge] : [edge, inner];
    })();

    return (
        <div className="absolute inset-0 z-10 flex flex-col text-white">
            {hintCfg.enabled && createPortal(
                <div
                    // Row spacing lives on the rows, not as a gap here: a collapsed row would keep
                    // its gap and leave a hole where the hidden hint used to be.
                    className={`pointer-events-none fixed z-[2147483647] flex items-start gap-x-5 ${HINT_CORNER_CLASS[hintCfg.corner]}`}
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
                >
                    {hintColumns.map((column, columnIndex) => (
                        <div
                            key={columnIndex}
                            className={`flex flex-col ${hintEdgeRight ? 'items-end' : 'items-start'}`}
                        >
                            {column.map(hint => {
                                // Selfie-only hints stay mounted and collapse their own height, so
                                // they slide and fade both ways instead of appearing from nothing.
                                const shown = !hint.selfieOnly || selfie;
                                return (
                                    <div
                                        key={hint.label}
                                        className="flex items-center gap-2 overflow-hidden transition-all duration-200 ease-out"
                                        style={{
                                            opacity: shown ? 1 : 0,
                                            maxHeight: shown ? 24 : 0,
                                            marginBottom: shown ? 6 : 0,
                                            // Slides in from whichever edge it is anchored to.
                                            transform: shown
                                                ? 'translateX(0)'
                                                : `translateX(${hintEdgeRight ? 8 : -8}px)`,
                                        }}
                                        aria-hidden={!shown}
                                    >
                                        <span className="whitespace-nowrap text-[13px] font-medium text-white">
                                            {hintLabel(hint.label, angleLocked, facingCam)}
                                        </span>
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
                                );
                            })}
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
                    <button
                        type="button"
                        aria-label={t('camera.filters', 'Filters')}
                        aria-pressed={pickerOpen}
                        onClick={() => togglePicker()}
                        className={[
                            'flex h-9 w-9 items-center justify-center rounded-full active:bg-white/10',
                            pickerOpen || filterId !== 'original' ? 'text-[#FFD60A]' : 'text-white/90',
                        ].join(' ')}
                    >
                        <Sparkles className="h-[19px] w-[19px]" strokeWidth={2} />
                    </button>
                </div>
            </div>

            <div
                ref={viewportRef}
                className="relative flex-1 min-h-0 overflow-hidden bg-black"
                onWheel={(e) => {
                    // deltaY is negative scrolling up, which reads as zooming in. Exponential so a
                    // notch is the same proportional change at 0.5× as at 5×.
                    setZoom(z => clampZoom(z * Math.exp(-e.deltaY * ZOOM_WHEEL_RATE)));
                }}
            >
                <FilterDefs />

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
                                  filter: filterStyle,
                              }
                            : { display: 'block', inset: 0, width: '100%', height: '100%', filter: filterStyle }
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

                {/* Stays mounted so it fades both ways. The scrim ramps its blur radius and its own
                    background alpha rather than the element's opacity: a backdrop-filter under an
                    opacity transition flickers in CEF. */}
                <div
                    className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3.5 transition-all duration-200 ease-out"
                    style={{
                        backgroundColor:        pending ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0)',
                        backdropFilter:         pending ? 'blur(6px)' : 'blur(0px)',
                        WebkitBackdropFilter:   pending ? 'blur(6px)' : 'blur(0px)',
                        pointerEvents:          pending ? 'auto' : 'none',
                    }}
                    aria-hidden={!pending}
                    aria-busy={pending}
                >
                    <div
                        className="flex flex-col items-center gap-3.5 transition-opacity duration-200 ease-out"
                        style={{ opacity: pending ? 1 : 0 }}
                    >
                        {/* Upload progress is not reported back, so the ring spins rather than
                            claiming a percentage it cannot know. */}
                        <svg className="h-11 w-11 animate-spin" viewBox="0 0 44 44" fill="none">
                            <circle cx="22" cy="22" r="19" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
                            <circle
                                cx="22" cy="22" r="19"
                                stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round"
                                strokeDasharray="119.4" strokeDashoffset="90"
                            />
                        </svg>
                        <span className="text-[14px] font-medium text-white/90">
                            {t('camera.uploading', 'Uploading…')}
                        </span>
                    </div>
                </div>

                <div
                    className="absolute bottom-[68px] left-3 right-3 z-30 overflow-hidden rounded-[20px] border transition-all ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{
                        transform:            pickerOpen ? 'translateY(0)' : 'translateY(14px)',
                        backgroundColor:      pickerOpen ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0)',
                        borderColor:          pickerOpen ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0)',
                        backdropFilter:       pickerOpen ? 'blur(20px)' : 'blur(0px)',
                        WebkitBackdropFilter: pickerOpen ? 'blur(20px)' : 'blur(0px)',
                        boxShadow:            pickerOpen ? '0 8px 28px rgba(0,0,0,0.45)' : '0 8px 28px rgba(0,0,0,0)',
                        transitionDuration:   pickerOpen ? '300ms' : '260ms',
                        visibility:           pickerOpen ? 'visible' : 'hidden',
                        pointerEvents:        pickerOpen ? 'auto' : 'none',
                    }}
                    aria-hidden={!pickerOpen}
                >
                    <div
                        className="no-scrollbar flex gap-3 overflow-x-auto overscroll-x-contain px-3 py-3 transition-opacity duration-200 ease-out"
                        onWheel={e => {
                            e.stopPropagation();
                            if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY;
                        }}
                        style={{
                            opacity:         pickerOpen ? 1 : 0,
                            transitionDelay: pickerOpen ? '80ms' : '0ms',
                        }}
                    >
                        {CAMERA_FILTERS.map(f => (
                            <PickerItem
                                key={f.id}
                                active={f.id === filterId}
                                label={filterLabel(f.id)}
                                onClick={() => setFilterId(f.id)}
                            >
                                {swatch
                                    ? <img src={swatch} alt="" className="h-full w-full object-cover" style={{ filter: f.css }} />
                                    : <span className="h-full w-full" style={{ background: 'linear-gradient(140deg,#6a8ec9,#c9a06a)', filter: f.css }} />}
                            </PickerItem>
                        ))}
                    </div>
                </div>

                <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2 py-1.5 backdrop-blur">
                    {ZOOM_PRESETS.map(z => {
                        // Scrolling lands between presets, so the nearest one carries the highlight
                        // and shows the live figure; that pill is the readout as well as the button.
                        const isActive = ZOOM_PRESETS.reduce(
                            (best, p) => (Math.abs(p - zoom) < Math.abs(best - zoom) ? p : best),
                        ) === z;
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
                                {isActive ? zoomLabel(zoom) : zoomLabel(z)}
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

                {/* pb clears the home indicator: its pill sits 5-10px off the bottom inside a 21px
                    hit area, so pb-7 left the shutter ring almost against it. */}
                <div className={`flex items-center justify-center gap-10 px-6 pb-11 ${photoOnly ? 'pt-4' : 'pt-1'}`}>
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
