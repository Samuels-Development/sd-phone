import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import {
    abandonRecording,
    onRecorder,
    startRecording,
    stopRecording,
    type RecorderProfile,
    type RecorderState,
} from './bodycamRecorder';

export interface BodycamActive {
    cameraId: string;
    kind:     string;
    officer:  string;
    callsign: string | null;
    plate:    string | null;
    model:    string | null;
    unit:     string | null;
    rank:     string | null;
    canRecord: boolean;
    auto:      boolean;
    profile:   RecorderProfile;
}

const FALLBACK_PROFILE: RecorderProfile = {
    fps: 30, width: 1280, bitrate: 2500000, maxSeconds: 300, minSeconds: 4,
};

const CLOCK_MS = 1000;

const PLATE = 'rounded-[10px] bg-black/72 px-3.5 py-2 ring-1 ring-white/15';
const KEY = 'rounded-[7px] bg-white/95 px-2 py-[3px] text-[15px] font-black tracking-wide text-black';
const SHADOW = '0 2px 10px rgba(0,0,0,0.85)';

function stamp(now: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(now.getDate())}.${p(now.getMonth() + 1)}.${now.getFullYear()}  ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
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

function clock(seconds: number): string {
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
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

    const subtitle = [active.rank, active.unit, active.model, active.plate].filter(Boolean).join(' · ');

    return (
        <div className="pointer-events-none fixed inset-0 z-[999] select-none font-mono">
            <div
                className="absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 38%, rgba(0,0,0,0.62) 100%)' }}
            />
            <div
                className="absolute inset-0 opacity-[0.10]"
                style={{ background: 'linear-gradient(180deg, rgba(150,170,200,0.55) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0) 60%, rgba(120,130,150,0.45) 100%)' }}
            />
            <div
                className="absolute inset-0 opacity-[0.13]"
                style={{
                    backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.28) 0px, rgba(255,255,255,0.28) 1px, transparent 1px, transparent 3px)',
                }}
            />
            <div
                className="absolute inset-0 animate-[cctv-drift_9s_linear_infinite] opacity-[0.05]"
                style={{
                    backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.9) 0px, rgba(255,255,255,0.9) 2px, transparent 2px, transparent 11px)',
                }}
            />

            <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-black/75 via-black/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />

            <div className="absolute left-0 right-0 top-0 flex items-start justify-between px-10 pt-9">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                        {rec.recording ? (
                            <span className={`${PLATE} flex items-center gap-2.5 bg-[#c0231f]/90`}>
                                <span className="flex h-[11px] w-[11px] animate-pulse rounded-full bg-white" />
                                <span className="text-[19px] font-black tracking-[0.14em] text-white">
                                    {t('mdt.bodycamRec', 'REC')}
                                </span>
                                <span className="text-[19px] font-bold tabular-nums text-white">{clock(recSeconds)}</span>
                            </span>
                        ) : (
                            <span className={`${PLATE} flex items-center gap-2.5`}>
                                <span className="flex h-[11px] w-[11px] rounded-full bg-white/90" />
                                <span className="text-[19px] font-black tracking-[0.14em] text-white">
                                    {t('mdt.bodycamLive', 'LIVE')}
                                </span>
                                <span className="text-[19px] font-bold tabular-nums text-white/90">{clock(elapsed)}</span>
                            </span>
                        )}
                    </div>
                    <div className="text-[30px] font-black leading-tight tracking-[0.02em] text-white" style={{ textShadow: SHADOW }}>
                        {active.officer}
                    </div>
                    {subtitle && (
                        <div className="text-[16px] font-bold uppercase tracking-[0.2em] text-white/90" style={{ textShadow: SHADOW }}>
                            {subtitle}
                        </div>
                    )}
                </div>

                <div className="flex flex-col items-end gap-2 text-right">
                    <span className={`${PLATE} text-[17px] font-black uppercase tracking-[0.2em] text-white`}>
                        {active.kind === 'dashcam' ? t('mdt.dashcam', 'Dashcam') : t('mdt.bodycam', 'Bodycam')}
                        {active.callsign ? ` ${active.callsign}` : ''}
                    </span>
                    <span className="text-[20px] font-bold tabular-nums text-white" style={{ textShadow: SHADOW }}>
                        {stamp(now)}
                    </span>
                </div>
            </div>

            <div className="absolute left-10 right-10 bottom-9 flex items-end justify-between gap-6">
                <div className="flex flex-col items-start gap-2">
                    {rec.uploading && (
                        <span className={`${PLATE} text-[17px] font-bold text-white`}>
                            {t('mdt.bodycamSaving', 'Saving the recording')}
                        </span>
                    )}
                    {rec.error && (
                        <span className={`${PLATE} bg-[#c0231f]/90 text-[17px] font-bold text-white`}>
                            {rec.error}
                        </span>
                    )}
                    {active.canRecord && !rec.uploading && (
                        <span className={`${PLATE} flex items-center gap-2.5 text-[17px] font-bold text-white`}>
                            <kbd className={KEY}>R</kbd>
                            {rec.recording
                                ? t('mdt.bodycamHintStop', 'Stop recording')
                                : t('mdt.bodycamHintRec', 'Start recording')}
                        </span>
                    )}
                </div>

                <span className={`${PLATE} flex shrink-0 items-center gap-2.5 text-[17px] font-bold text-white`}>
                    <kbd className={KEY}>{t('mdt.bodycamKeyBackspace', 'Backspace')}</kbd>
                    {t('mdt.bodycamHintExit', 'Leave the camera')}
                </span>
            </div>

            <div className="absolute left-8 top-1/2 h-11 w-[3px] -translate-y-1/2 rounded-full bg-white/45" />
            <div className="absolute right-8 top-1/2 h-11 w-[3px] -translate-y-1/2 rounded-full bg-white/45" />
            <div className="absolute left-1/2 top-7 h-[3px] w-11 -translate-x-1/2 rounded-full bg-white/45" />
            <div className="absolute left-1/2 bottom-7 h-[3px] w-11 -translate-x-1/2 rounded-full bg-white/45" />
        </div>
    );
}

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

    return active;
}
