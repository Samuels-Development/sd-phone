import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { isFiveM } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import {
    abandonRecording,
    onRecorder,
    startRecording,
    devPreviewState,
    stopRecording,
    type RecorderProfile,
    type RecorderState,
} from './bodycamRecorder';

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

const CLOCK_MS = 1000;

const FALLBACK_PROFILE: RecorderProfile = {
    fps: 30, width: 1280, bitrate: 2500000, maxSeconds: 300, minSeconds: 4,
};

const BURN = {
    textShadow: '1px 1px 0 #000, -1px 1px 0 #000, 1px -1px 0 #000, -1px -1px 0 #000, 0 0 6px rgba(0,0,0,0.85)',
} as const;

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function burnStamp(now: Date): string {
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}  ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function clock(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function beginFor(active: BodycamActive): Promise<boolean> {
    return startRecording({
        cameraId: active.cameraId,
        kind:     active.kind,
        officer:  active.officer,
        callsign: active.callsign,
        plate:    active.plate,
        model:    active.model,
    }, active.profile);
}

function Key({ label }: { label: string }) {
    return (
        <span className="border border-white/45 px-1.5 py-[1px] text-[13px] font-bold leading-none tracking-[0.1em] text-white/90">
            {label}
        </span>
    );
}

export function BodycamOverlay({ active }: { active: BodycamActive }) {
    const [now, setNow] = useState(() => new Date());
    const [elapsed, setElapsed] = useState(0);
    const [rec, setRec] = useState<RecorderState>({ recording: false, uploading: false, startedAt: null, error: null });
    const [recSeconds, setRecSeconds] = useState(0);
    const activeRef = useRef(active);

    activeRef.current = active;

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(new Date());
            setElapsed(s => s + 1);
        }, CLOCK_MS);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => { setElapsed(0); }, [active.cameraId]);

    useEffect(() => onRecorder(setRec), []);

    useEffect(() => {
        if (!rec.recording || rec.startedAt === null) {
            setRecSeconds(0);
            return;
        }
        const started = rec.startedAt;
        setRecSeconds(Math.max(0, Math.round((Date.now() - started) / 1000)));
        const timer = window.setInterval(() => {
            setRecSeconds(Math.max(0, Math.round((Date.now() - started) / 1000)));
        }, CLOCK_MS);
        return () => window.clearInterval(timer);
    }, [rec.recording, rec.startedAt]);

    useNuiEvent('sd-phone:mdt:bodycam:record', () => {
        if (!activeRef.current.canRecord) return;
        if (rec.recording) {
            stopRecording();
            return;
        }
        if (rec.uploading) return;
        void beginFor(activeRef.current);
    });

    useEffect(() => {
        if (!active.canRecord || !active.auto) return;
        void beginFor(active);
    }, [active]);

    useEffect(() => () => { abandonRecording(); }, []);

    const kindLabel = active.kind === 'dashcam'
        ? t('mdt.dashcamShort', 'DASHCAM')
        : t('mdt.bodycamShort', 'BWC');

    const identity = [active.rank, active.unit].filter(Boolean).join(' · ');
    const vehicle = [active.model, active.plate].filter(Boolean).join(' · ');

    return (
        <div className="pointer-events-none fixed inset-0 z-[999] select-none font-mono uppercase">
            {!isFiveM && (
                <div
                    className="absolute inset-0 -z-10"
                    style={{
                        background:
                            'linear-gradient(180deg, #b9d4ea 0%, #dbe7f0 26%, #8f979c 27%, #6e7570 44%, #cfd2cc 46%, #9aa09b 62%, #4c504d 63%, #2e312f 100%)',
                    }}
                />
            )}
            <div
                className="absolute inset-0"
                style={{ background: 'radial-gradient(ellipse 78% 78% at 50% 50%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.30) 74%, rgba(0,0,0,0.72) 100%)' }}
            />
            <div
                className="absolute inset-0 opacity-[0.09]"
                style={{ backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.5) 0px, rgba(255,255,255,0.5) 1px, transparent 1px, transparent 4px)' }}
            />
            <div
                className="absolute inset-0 opacity-[0.05] motion-reduce:hidden animate-[cctv-drift_11s_linear_infinite]"
                style={{ backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.85) 0px, rgba(255,255,255,0.85) 2px, transparent 2px, transparent 14px)' }}
            />
            <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/55 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/70 to-transparent" />

            <div className="absolute left-8 right-8 top-7 flex items-start justify-between gap-6">
                <div className="flex items-center gap-3">
                    {rec.recording ? (
                        <span className="flex items-center gap-2 bg-[#d51616] px-2.5 py-[5px]">
                            <span className="h-[10px] w-[10px] rounded-full bg-white animate-pulse motion-reduce:animate-none" />
                            <span className="text-[17px] font-bold leading-none tracking-[0.22em] text-white">
                                {t('mdt.bodycamRec', 'REC')}
                            </span>
                        </span>
                    ) : (
                        <span className="flex items-center gap-2 border border-white/55 px-2.5 py-[5px]">
                            <span className="h-[10px] w-[10px] rounded-full bg-white/85" />
                            <span className="text-[17px] font-bold leading-none tracking-[0.22em] text-white" style={BURN}>
                                {t('mdt.bodycamLive', 'LIVE')}
                            </span>
                        </span>
                    )}
                    <span className="text-[21px] font-bold leading-none tabular-nums text-white" style={BURN}>
                        {rec.recording ? clock(recSeconds) : clock(elapsed)}
                    </span>
                </div>

                <div className="flex flex-col items-end gap-1 text-right">
                    <span className="text-[17px] font-bold leading-none tracking-[0.2em] text-white" style={BURN}>
                        {kindLabel}
                        {active.callsign ? ` ${active.callsign}` : ''}
                    </span>
                    {rec.recording && (
                        <span className="text-[13px] font-bold leading-none tracking-[0.16em] text-white/80" style={BURN}>
                            {active.profile.width}W {active.profile.fps}FPS
                        </span>
                    )}
                </div>
            </div>

            <div className="absolute left-8 right-8 bottom-[76px] flex items-end justify-between gap-6">
                <div className="flex min-w-0 flex-col gap-1.5">
                    {rec.error && (
                        <span className="self-start bg-[#d51616] px-2.5 py-[5px] text-[15px] font-bold leading-none tracking-[0.08em] text-white">
                            {rec.error}
                        </span>
                    )}
                    {rec.uploading && (
                        <span className="self-start border border-white/45 px-2.5 py-[5px] text-[15px] font-bold leading-none tracking-[0.12em] text-white" style={BURN}>
                            {t('mdt.bodycamSaving', 'Saving')}
                        </span>
                    )}
                    <span className="truncate text-[28px] font-bold leading-none tracking-[0.05em] text-white" style={BURN}>
                        {active.officer}
                    </span>
                    {(identity || vehicle) && (
                        <span className="truncate text-[15px] font-bold leading-none tracking-[0.18em] text-white/85" style={BURN}>
                            {[identity, vehicle].filter(Boolean).join(' · ')}
                        </span>
                    )}
                </div>

                <span className="shrink-0 text-[22px] font-bold leading-none tabular-nums text-white" style={BURN}>
                    {burnStamp(now)}
                </span>
            </div>

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-6 border-t border-white/15 bg-black/55 px-8 py-3">
                <div className="flex shrink-0 items-center gap-5">
                    {active.canRecord && (
                        <span className="flex items-center gap-2 text-[13px] font-bold tracking-[0.16em] text-white/85">
                            <Key label="R" />
                            {rec.recording
                                ? t('mdt.bodycamHintStop', 'Stop recording')
                                : t('mdt.bodycamHintRec', 'Start recording')}
                        </span>
                    )}
                    <span className="flex items-center gap-2 text-[13px] font-bold tracking-[0.16em] text-white/85">
                        <Key label={t('mdt.bodycamKeyBackspace', 'Backspace')} />
                        {t('mdt.bodycamHintExit', 'Leave the camera')}
                    </span>
                </div>
            </div>
        </div>
    );
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
                devPreviewState({ recording: false, uploading: false, startedAt: null, error: null });
                setActive(prev => (prev ? null : DEV_PREVIEW));
                return;
            }
            if (e.key === 'n' || e.key === 'N') {
                recording = !recording;
                devPreviewState({
                    recording,
                    uploading: false,
                    error: null,
                    startedAt: recording ? Date.now() : null,
                });
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return active;
}
