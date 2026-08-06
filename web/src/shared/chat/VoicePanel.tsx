import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

import { uploadVoiceMessage } from './messagesApi';
import { Sheet } from '@/ui/Sheet';
import { t } from '@/i18n';

interface Props {
    onSend:  (duration: number, audioUrl: string, waveform: number[]) => void;
    onClose: () => void;
    forceDark?: boolean;
}

const MAX_SECONDS = 120;

const WAVE_BARS = 40;

function buildWaveform(samples: number[]): number[] {
    if (samples.length === 0) return [];
    const peaks: number[] = [];
    let max = 0;
    const per = samples.length / WAVE_BARS;
    for (let b = 0; b < WAVE_BARS; b++) {
        const start = Math.floor(b * per);
        const end   = Math.max(start + 1, Math.floor((b + 1) * per));
        let peak = 0;
        for (let i = start; i < end && i < samples.length; i++) {
            if (samples[i] > peak) peak = samples[i];
        }
        peaks.push(peak);
        if (peak > max) max = peak;
    }
    return peaks.map(v => Math.round(Math.max(0.06, max > 0 ? v / max : 0) * 100));
}

function pickMime(): string | undefined {
    const c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    const MR = window.MediaRecorder;
    return MR ? c.find(codec => MR.isTypeSupported?.(codec)) : undefined;
}

function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload  = () => resolve(fr.result as string);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
    });
}

export function VoicePanel({ onSend, onClose, forceDark = false }: Props) {
    const [recording, setRecording] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [seconds,   setSeconds]   = useState(0);
    const [error,     setError]     = useState<string | null>(null);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const streamRef   = useRef<MediaStream | null>(null);
    const chunksRef   = useRef<Blob[]>([]);
    const startRef    = useRef(0);
    const timerRef    = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const audioCtxRef    = useRef<AudioContext | null>(null);
    const sampleTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
    const samplesRef     = useRef<number[]>([]);

    function cleanup() {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = undefined; }
        if (sampleTimerRef.current) { clearInterval(sampleTimerRef.current); sampleTimerRef.current = undefined; }
        if (audioCtxRef.current) { void audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    }

    function startSampling(stream: MediaStream) {
        samplesRef.current = [];
        try {
            const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!Ctx) return;
            const ctx = new Ctx();
            audioCtxRef.current = ctx;
            void ctx.resume?.();
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 1024;
            ctx.createMediaStreamSource(stream).connect(analyser);
            const buf = new Float32Array(analyser.fftSize);
            sampleTimerRef.current = setInterval(() => {
                analyser.getFloatTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
                samplesRef.current.push(Math.sqrt(sum / buf.length));
            }, 50);
        } catch {
            // Web Audio unavailable — recording still works, just without bars.
        }
    }

    useEffect(() => () => cleanup(), []);

    async function start() {
        setError(null);
        if (!navigator.mediaDevices?.getUserMedia) { setError(t('messages.micUnavailable', 'Microphone unavailable on this server.')); return; }

        let stream: MediaStream;
        try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
        catch { setError(t('messages.micBlocked', 'Microphone access was blocked.')); return; }
        streamRef.current = stream;

        const mime = pickMime();
        let rec: MediaRecorder;
        try { rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
        catch { cleanup(); setError(t('messages.recordingUnsupported', 'Recording is not supported here.')); return; }

        chunksRef.current = [];
        rec.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data); };
        rec.onstop = () => void finalize(rec.mimeType);
        recorderRef.current = rec;

        startSampling(stream);

        rec.start();
        startRef.current = Date.now();
        setRecording(true);
        setSeconds(0);
        timerRef.current = setInterval(() => {
            const elapsed = Math.round((Date.now() - startRef.current) / 1000);
            setSeconds(elapsed);
            if (elapsed >= MAX_SECONDS) stop();
        }, 1000);
    }

    function stop() {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = undefined; }
        setRecording(false);
        recorderRef.current?.stop();
    }

    async function finalize(mimeType: string) {
        const waveform = buildWaveform(samplesRef.current);
        cleanup();
        const blob     = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        const duration = Math.max(1, Math.round((Date.now() - startRef.current) / 1000));
        if (!blob.size) { setError(t('messages.nothingRecorded', 'Nothing was recorded.')); return; }

        setUploading(true);
        try {
            const base64 = await blobToDataURL(blob);
            const url    = await uploadVoiceMessage(base64);
            if (!url) { setUploading(false); setError(t('messages.uploadFailedTryAgain', 'Upload failed. Try again.')); return; }
            onSend(duration, url, waveform);
        } catch {
            setUploading(false);
            setError(t('messages.uploadFailedTryAgain', 'Upload failed. Try again.'));
        }
    }

    const fmt = `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
    const prompt = error
        ? error
        : uploading ? t('common.sending', 'Sending…')
        : recording ? t('messages.tapToStopSend', 'Tap the button to stop & send')
        : t('messages.pressToStartRecording', 'Tap the button below to record');

    return (
        <Sheet
            onClose={onClose}
            fit="content"
            dim={false}
            dismissable={!recording && !uploading}
            durationMs={260}
            forceDark={forceDark}
            className="items-center gap-4 border-t border-black/10 bg-base dark:border-white/10 dark:bg-surface"
        >
            {() => (
                <>
                    <span
                        className={`rounded-full px-3 py-1 text-[15px] font-medium tabular-nums ${
                            recording
                                ? 'bg-[#FF453A]/15 text-[#FF453A]'
                                : 'bg-black/[0.06] text-black/65 dark:bg-white/10 dark:text-white/70'
                        }`}
                    >
                        {fmt}
                    </span>

                    <div
                        className={`w-[86%] rounded-[18px] px-5 py-3 text-center text-[15px] ${
                            error
                                ? 'bg-[#FF453A]/10 text-[#FF453A]'
                                : 'bg-black/[0.05] text-black/65 dark:bg-white/[0.07] dark:text-white/70'
                        }`}
                    >
                        {prompt}
                    </div>

                    <button
                        type="button"
                        onClick={recording ? stop : start}
                        disabled={uploading}
                        aria-label={recording ? t('messages.stopAndSend', 'Stop and send') : t('messages.startRecording', 'Start recording')}
                        className={`flex h-11 w-[76px] items-center justify-center rounded-full shadow transition-transform active:scale-95 ${
                            uploading ? 'bg-[#007AFF]/50' : recording ? 'bg-[#FF453A]' : 'bg-[#007AFF]'
                        }`}
                    >
                        {recording
                            ? <Square className="h-[18px] w-[18px] text-white" fill="white" strokeWidth={0} />
                            : <Mic className="h-[22px] w-[22px] text-white" strokeWidth={2} />}
                    </button>
                </>
            )}
        </Sheet>
    );
}
