import { useCallback, useEffect, useState, type RefObject, type WheelEvent } from 'react';

import { t } from '@/i18n';
import { fetchNui } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import type { GameRender } from '@/render';
import { HINT_DEFAULTS, type HintConfig, type KeyHint } from '@/ui/KeyHints';
import { clampZoom, nextZoomPreset, ZOOM_KEY_STEP, ZOOM_WHEEL_RATE } from '@/shared/lens';

export interface CameraOpenResult {
    walkable?: boolean;
    hints?:    Partial<HintConfig>;
}

export function useLiveCameraControls(
    canvasRef: RefObject<HTMLCanvasElement | null>,
    renderRef: RefObject<GameRender | null>,
    feedReady: boolean,
) {
    const [selfie,      setSelfie]      = useState(false);
    const [flash,       setFlash]       = useState(false);
    const [zoom,        setZoom]        = useState(1);
    const [nativeCam,   setNativeCam]   = useState(false);
    const [hintCfg,     setHintCfg]     = useState<HintConfig>(HINT_DEFAULTS);
    const [angleLocked, setAngleLocked] = useState(false);
    const [facingCam,   setFacingCam]   = useState(false);

    const applyOpen = useCallback((res: CameraOpenResult | null | undefined) => {
        setNativeCam(res?.walkable === false);
        setHintCfg({ ...HINT_DEFAULTS, ...(res?.hints ?? {}) });
    }, []);

    function toggleSelfie() {
        setSelfie(prev => {
            const next = !prev;
            void fetchNui('sd-phone:camera:selfie', { on: next });
            return next;
        });
    }

    const toggleFlash = () => setFlash(f => !f);
    const cycleZoom   = () => setZoom(z => nextZoomPreset(z));
    const onWheel     = (e: WheelEvent) => setZoom(z => clampZoom(z * Math.exp(-e.deltaY * ZOOM_WHEEL_RATE)));

    useEffect(() => {
        setAngleLocked(false);
        setFacingCam(false);
    }, [selfie]);

    useEffect(() => {
        void fetchNui('sd-phone:camera:flash', { on: flash });
    }, [flash]);

    useEffect(() => {
        if (!feedReady) return;
        renderRef.current?.setZoom(nativeCam ? zoom : 1);
        void fetchNui('sd-phone:camera:zoom', { zoom });
    }, [zoom, nativeCam, feedReady, renderRef]);

    useEffect(() => {
        if (!feedReady) return;
        renderRef.current?.setSelfie(selfie && nativeCam);
    }, [selfie, nativeCam, feedReady, renderRef]);

    useEffect(() => {
        const el = canvasRef.current;
        if (!feedReady || !el) return;
        const ro = new ResizeObserver((entries) => {
            const r = entries[0]?.contentRect;
            if (r && r.width > 0 && r.height > 0) renderRef.current?.setAspect(r.width / r.height);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [feedReady, canvasRef, renderRef]);

    useNuiEvent('sd-phone:camera:key', (data) => {
        switch (data?.key) {
            case 'flip':    toggleSelfie(); break;
            case 'flash':   toggleFlash(); break;
            case 'zoomIn':  setZoom(z => clampZoom(z * ZOOM_KEY_STEP)); break;
            case 'zoomOut': setZoom(z => clampZoom(z / ZOOM_KEY_STEP)); break;
        }
    });

    useNuiEvent('sd-phone:camera:lock',    (data) => setAngleLocked(!!data?.on));
    useNuiEvent('sd-phone:camera:faceCam', (data) => setFacingCam(!!data?.on));

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code !== 'AltLeft' && e.key !== 'Alt') return;
            e.preventDefault();
            void fetchNui('sd-phone:camera:cursor', { on: false });
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const hints: KeyHint[] = [
        { keys: ['↑'],       label: t('camera.hintFlipCamera', 'Flip Camera') },
        { keys: ['E'],       label: t('camera.hintFlash', 'Flash') },
        { keys: ['Wheel'],   label: t('phone.hintZoom', 'Zoom') },
        { keys: ['Alt'],     label: t('camera.hintToggleCursor', 'Toggle Cursor') },
        { keys: ['↓'],       label: angleLocked
            ? t('camera.hintMoveYourself', 'Move Yourself')
            : t('camera.hintMoveCamera', 'Move Camera'), shown: selfie },
        { keys: ['R Shift'], label: facingCam
            ? t('camera.hintLookAhead', 'Look Ahead')
            : t('camera.hintFaceCamera', 'Face Camera'), shown: selfie },
    ];

    return { selfie, toggleSelfie, flash, toggleFlash, zoom, cycleZoom, onWheel, hints, hintCfg, applyOpen };
}
