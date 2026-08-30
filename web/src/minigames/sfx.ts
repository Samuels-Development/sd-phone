import { useThemeStore } from '@/stores/themeStore';

export type Voice = 'tick' | 'lock' | 'deny' | 'win' | 'fail' | 'reveal';

interface Note {
    freq:  number;
    to?:   number;
    at:    number;
    dur:   number;
    gain:  number;
    type?: OscillatorType;
}

const VOICES: Record<Voice, Note[]> = {
    tick: [
        { freq: 1180, at: 0, dur: 0.028, gain: 0.16, type: 'triangle' },
    ],
    lock: [
        { freq: 660, to: 990, at: 0, dur: 0.09, gain: 0.2 },
        { freq: 1320, at: 0.05, dur: 0.08, gain: 0.1, type: 'triangle' },
    ],
    deny: [
        { freq: 200, to: 120, at: 0, dur: 0.13, gain: 0.24, type: 'sawtooth' },
    ],
    win: [
        { freq: 523, at: 0,    dur: 0.12, gain: 0.2 },
        { freq: 659, at: 0.09, dur: 0.12, gain: 0.2 },
        { freq: 784, at: 0.18, dur: 0.26, gain: 0.22 },
        { freq: 1046, at: 0.18, dur: 0.3, gain: 0.09, type: 'triangle' },
    ],
    fail: [
        { freq: 240, to: 90, at: 0, dur: 0.42, gain: 0.26, type: 'sawtooth' },
        { freq: 120, to: 60, at: 0.05, dur: 0.4, gain: 0.14, type: 'square' },
    ],
    reveal: [
        { freq: 420, to: 880, at: 0, dur: 0.22, gain: 0.12, type: 'triangle' },
    ],
};

const MUTE_KEY = 'sd-phone:minigames:muted';

let ctx: AudioContext | null = null;
let broken = false;

function readMuted(): boolean {
    try { return window.localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

let muted = readMuted();

export function isMuted(): boolean {
    return muted;
}

export function setMuted(next: boolean): void {
    muted = next;
    try { window.localStorage.setItem(MUTE_KEY, next ? '1' : '0'); } catch { /* storage can be blocked */ }
}

function context(): AudioContext | null {
    if (broken || typeof window === 'undefined') return null;

    if (!ctx) {
        const Ctor = window.AudioContext
            ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) { broken = true; return null; }
        try { ctx = new Ctor(); } catch { broken = true; return null; }
    }

    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
}

function level(): number {
    try {
        const vol = useThemeStore.getState().ringtoneVol;
        return Math.min(1, Math.max(0, vol / 100));
    } catch {
        return 0.4;
    }
}

export function sfx(voice: Voice): void {
    if (muted) return;

    const audio = context();
    if (!audio) return;

    const loud = level();
    if (loud <= 0) return;

    const now = audio.currentTime;

    for (const note of VOICES[voice]) {
        try {
            const osc = audio.createOscillator();
            const amp = audio.createGain();

            osc.type = note.type ?? 'sine';
            osc.frequency.setValueAtTime(note.freq, now + note.at);
            if (note.to !== undefined) {
                osc.frequency.exponentialRampToValueAtTime(note.to, now + note.at + note.dur);
            }

            amp.gain.setValueAtTime(0.0001, now + note.at);
            amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, note.gain * loud), now + note.at + 0.012);
            amp.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.dur);

            osc.connect(amp);
            amp.connect(audio.destination);
            osc.start(now + note.at);
            osc.stop(now + note.at + note.dur + 0.02);
        } catch {
            broken = true;
            return;
        }
    }
}
