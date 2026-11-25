import { useEffect, useState } from 'react';

import { isFiveM } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import type { RecorderProfile } from './bodycamRecorder';

export interface CctvActive {
    cameraId: string;
    label:    string;
    category: string;
}

export interface BodycamActive {
    cameraId:  string;
    kind:      string;
    officer:   string;
    callsign:  string | null;
    plate:     string | null;
    model:     string | null;
    unit:      string | null;
    rank:      string | null;
    canRecord: boolean;
    auto:      boolean;
    profile:   RecorderProfile;
}

const FALLBACK_PROFILE: RecorderProfile = {
    fps: 30, width: 1280, bitrate: 2500000, maxSeconds: 300, minSeconds: 4,
};

export function useCctvActive(): CctvActive | null {
    const [active, setActive] = useState<CctvActive | null>(null);

    useNuiEvent('sd-phone:cctv:enter', (data: CctvActive | undefined) => {
        if (!data || typeof data.cameraId !== 'string') return;
        setActive({
            cameraId: data.cameraId,
            label:    data.label ?? data.cameraId,
            category: data.category ?? '',
        });
    });

    useNuiEvent('sd-phone:cctv:exit', () => setActive(null));

    return active;
}

const DEV_PREVIEW: BodycamActive = {
    cameraId:  'bodycam:OKF10233',
    kind:      'bodycam',
    officer:   'Miles Okafor',
    callsign:  'LS-207',
    plate:     null,
    model:     null,
    unit:      'LSPD',
    rank:      'Officer II',
    canRecord: true,
    auto:      false,
    profile:   FALLBACK_PROFILE,
};

export function useBodycamActive(): BodycamActive | null {
    const [active, setActive] = useState<BodycamActive | null>(null);

    useNuiEvent('sd-phone:mdt:bodycam:enter', (data: BodycamActive | undefined) => {
        if (!data || typeof data.cameraId !== 'string') return;
        setActive({
            cameraId:  data.cameraId,
            kind:      data.kind === 'dashcam' ? 'dashcam' : 'bodycam',
            officer:   data.officer ?? '',
            callsign:  data.callsign ?? null,
            plate:     data.plate ?? null,
            model:     data.model ?? null,
            unit:      data.unit ?? null,
            rank:      data.rank ?? null,
            canRecord: data.canRecord === true,
            auto:      data.auto === true,
            profile:   { ...FALLBACK_PROFILE, ...(data.profile ?? {}) },
        });
    });

    useNuiEvent('sd-phone:mdt:bodycam:exit', () => setActive(null));

    useEffect(() => {
        if (isFiveM) return;
        let recording = false;
        function onKey(e: KeyboardEvent) {
            const field = document.activeElement?.tagName;
            if (field === 'INPUT' || field === 'TEXTAREA') return;

            if (e.key === 'b' || e.key === 'B') {
                recording = false;
                void import('./bodycamRecorder').then(m => m.devPreviewState({ recording: false, uploading: false, startedAt: null, error: null }));
                setActive(prev => (prev ? null : DEV_PREVIEW));
                return;
            }
            if (e.key === 'n' || e.key === 'N') {
                recording = !recording;
                const next = { recording, uploading: false, error: null, startedAt: recording ? Date.now() : null };
                void import('./bodycamRecorder').then(m => m.devPreviewState(next));
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return active;
}
