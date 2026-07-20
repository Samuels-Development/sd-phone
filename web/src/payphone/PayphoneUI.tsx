import { useCallback, useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff, RotateCcw, X } from 'lucide-react';

import { t } from '@/i18n';
import { fetchNui } from '@/core/nui';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { playDtmf } from '@/apps/phone/keypad/dtmf';
import { formatPhone } from '@/lib/phone';

type Phase = 'idle' | 'calling' | 'connected' | 'ended';

interface Favorite { name: string; phone: string }

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

function fmtClock(secs: number): string {
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

export function PayphoneUI() {
    const [open,      setOpen]      = useState(false);
    const [digits,    setDigits]    = useState('');
    const [phase,     setPhase]     = useState<Phase>('idle');
    const [lcdNote,   setLcdNote]   = useState<string | null>(null);
    const [elapsed,   setElapsed]   = useState(0);
    const [booth,     setBooth]     = useState<{ number: string; anonymous: boolean }>({ number: '', anonymous: false });
    const [myNumber,  setMyNumber]  = useState<string | null>(null);
    const [favorites, setFavorites] = useState<Favorite[]>([]);
    const channelRef = useRef<number | null>(null);
    const phaseRef   = useRef(phase);
    phaseRef.current = phase;

    useNuiEvent('sd-phone:payphone:open', useCallback((data) => {
        setBooth({ number: data.number, anonymous: data.anonymous });
        setMyNumber(data.myNumber ?? null);
        setFavorites(Array.isArray(data.favorites) ? data.favorites : []);
        setDigits('');
        setPhase(data.connected ? 'connected' : 'idle');
        setLcdNote(data.connected && data.callerName ? data.callerName.toUpperCase() : null);
        setElapsed(0);
        channelRef.current = null;
        setOpen(true);
    }, []));

    useNuiEvent('sd-phone:call:connected', useCallback((data) => {
        if (channelRef.current !== null && data.channel === channelRef.current) {
            setPhase('connected');
            setElapsed(0);
        }
    }, []));

    useNuiEvent('sd-phone:payphone:ended', useCallback(() => {
        channelRef.current = null;
        setPhase('ended');
        setLcdNote(null);
    }, []));

    // Call timer; the caller-name note clears once it starts counting.
    useEffect(() => {
        if (phase !== 'connected') return;
        const timer = window.setInterval(() => { setElapsed(n => n + 1); setLcdNote(null); }, 1000);
        return () => window.clearInterval(timer);
    }, [phase]);

    // Ended flashes briefly, then the display resets for the next call.
    useEffect(() => {
        if (phase !== 'ended') return;
        const timer = window.setTimeout(() => { setPhase('idle'); setDigits(''); }, 2200);
        return () => window.clearTimeout(timer);
    }, [phase]);

    const close = useCallback(() => {
        setOpen(false);
        void fetchNui('sd-phone:payphone:close');
    }, []);

    // Capture-phase Escape so the phone underneath never sees it (same trick as the admin panel).
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.stopImmediatePropagation();
            e.preventDefault();
            close();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, close]);

    if (!open) return null;

    function press(k: string) {
        if (phaseRef.current !== 'idle') return;
        setLcdNote(null);
        setDigits(prev => (prev.length >= 15 ? prev : prev + k));
        playDtmf(k);
    }

    async function call() {
        const number = digits.replace(/\D/g, '');
        if (!number || phaseRef.current !== 'idle') return;
        setPhase('calling');
        const r = await fetchNui<{ success: boolean; data?: { channel: number }; message?: string }>('sd-phone:payphone:dial', { number });
        if (r?.success && r.data) {
            channelRef.current = r.data.channel;
        } else {
            setPhase('idle');
            setLcdNote(r?.message ?? t('payphone.callFailed', 'CALL FAILED'));
        }
    }

    function hangup() {
        if (phaseRef.current === 'calling' || phaseRef.current === 'connected') {
            void fetchNui('sd-phone:payphone:hangup');
            channelRef.current = null;
            setPhase('ended');
        }
    }

    const lcd = lcdNote ? lcdNote.toUpperCase()
        : phase === 'calling'   ? t('payphone.calling', 'CALLING…')
        : phase === 'connected' ? fmtClock(elapsed)
        : phase === 'ended'     ? t('payphone.callEnded', 'CALL ENDED')
        : digits ? (digits.length === 10 ? formatPhone(digits) : digits)
        : booth.anonymous ? t('payphone.withheld', 'NO CALLER ID') : formatPhone(booth.number);

    const inCall = phase === 'calling' || phase === 'connected';

    return (
        <div
            className="fixed inset-0 z-[400] flex items-center justify-center font-sf"
            onMouseDown={() => { if (!inCall) close(); }}
        >
            <div
                className="relative flex gap-4 rounded-[22px] border border-black/60 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
                style={{ background: 'linear-gradient(160deg, #3a3d42 0%, #26282c 55%, #1b1c1f 100%)' }}
                onMouseDown={e => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={close}
                    aria-label={t('payphone.leave', 'Leave payphone')}
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-white/40 hover:text-white/70 active:opacity-60"
                >
                    <X className="h-5 w-5" strokeWidth={2.4} />
                </button>

                {/* Left: display + keypad */}
                <div className="flex w-[300px] flex-col gap-5">
                    <div
                        className="rounded-[10px] border border-black/70 px-5 py-4 text-center shadow-[inset_0_2px_10px_rgba(0,0,0,0.7)]"
                        style={{ background: 'linear-gradient(180deg, #0d1f10, #10290f)' }}
                    >
                        <span className="font-mono text-[26px] font-semibold tracking-[0.14em] text-[#57e389]" style={{ textShadow: '0 0 8px rgba(87,227,137,0.55)' }}>
                            {lcd}
                        </span>
                    </div>

                    <div className="flex items-start gap-4">
                        <div className="grid flex-1 grid-cols-3 justify-items-center gap-3 rounded-[14px] bg-black/25 p-4">
                            {KEYS.map(k => (
                                <button
                                    key={k}
                                    type="button"
                                    onClick={() => press(k)}
                                    className="flex h-[54px] w-[54px] items-center justify-center rounded-full border border-black/60 text-[22px] font-semibold text-white/90 shadow-[0_3px_6px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.18)] transition-transform active:scale-95 active:brightness-75"
                                    style={{ background: 'radial-gradient(circle at 35% 30%, #6a6e75, #43464c 70%)' }}
                                >
                                    {k}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-col items-center gap-3 pt-4">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/45">{t('payphone.clear', 'Clear')}</span>
                            <button
                                type="button"
                                onClick={() => { if (phase === 'idle') setDigits(prev => prev.slice(0, -1)); }}
                                aria-label={t('payphone.clear', 'Clear')}
                                className="flex h-[46px] w-[46px] items-center justify-center rounded-[10px] border border-black/60 text-white/85 shadow-[0_3px_6px_rgba(0,0,0,0.5)] active:scale-95 active:brightness-75"
                                style={{ background: 'radial-gradient(circle at 35% 30%, #6a6e75, #43464c 70%)' }}
                            >
                                <X className="h-5 w-5" strokeWidth={2.6} />
                            </button>
                            <span className="pt-1 text-[10px] font-semibold uppercase tracking-widest text-white/45">{t('payphone.reenter', 'Re-enter')}</span>
                            <button
                                type="button"
                                onClick={() => { if (phase === 'idle') { setDigits(''); setLcdNote(null); } }}
                                aria-label={t('payphone.reenter', 'Re-enter number')}
                                className="flex h-[46px] w-[46px] items-center justify-center rounded-[10px] border border-black/60 text-white/85 shadow-[0_3px_6px_rgba(0,0,0,0.5)] active:scale-95 active:brightness-75"
                                style={{ background: 'radial-gradient(circle at 35% 30%, #6a6e75, #43464c 70%)' }}
                            >
                                <RotateCcw className="h-5 w-5" strokeWidth={2.4} />
                            </button>
                        </div>
                    </div>

                    <div className="mx-auto h-[14px] w-[150px] rounded-[7px] border border-black/70 bg-black/80 shadow-[inset_0_2px_6px_rgba(0,0,0,0.9)]" aria-hidden />
                </div>

                {/* Right: call controls + notepad */}
                <div className="flex w-[170px] flex-col items-center gap-4">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-white/45">{t('payphone.call', 'Call')}</span>
                    <button
                        type="button"
                        onClick={() => void call()}
                        disabled={phase !== 'idle' || !digits}
                        aria-label={t('payphone.call', 'Call')}
                        className="flex h-[60px] w-[60px] items-center justify-center rounded-full border border-black/60 shadow-[0_4px_10px_rgba(0,0,0,0.55)] transition-transform active:scale-95 disabled:opacity-40"
                        style={{ background: 'radial-gradient(circle at 35% 30%, #43c465, #1f7d38 70%)' }}
                    >
                        <Phone className="h-6 w-6 text-white" fill="currentColor" strokeWidth={0} />
                    </button>

                    <span className="pt-1 text-[10px] font-semibold uppercase tracking-widest text-white/45">{t('payphone.hangUp', 'Hang up')}</span>
                    <button
                        type="button"
                        onClick={hangup}
                        disabled={!inCall}
                        aria-label={t('payphone.hangUp', 'Hang up')}
                        className="flex h-[60px] w-[60px] items-center justify-center rounded-full border border-black/60 shadow-[0_4px_10px_rgba(0,0,0,0.55)] transition-transform active:scale-95 disabled:opacity-40"
                        style={{ background: 'radial-gradient(circle at 35% 30%, #e0564a, #97281f 70%)' }}
                    >
                        <PhoneOff className="h-6 w-6 text-white" strokeWidth={2.2} />
                    </button>

                    <div
                        className="mt-2 w-full flex-1 rounded-[6px] p-3 shadow-[0_4px_10px_rgba(0,0,0,0.45)]"
                        style={{ background: 'linear-gradient(175deg, #e8dcbc, #d9cca6)', transform: 'rotate(-1deg)' }}
                    >
                        <div className="mx-auto mb-2 h-[10px] w-[52px] rounded-b-[4px] bg-[#8e8e93] shadow-sm" aria-hidden />
                        {myNumber && (
                            <button
                                type="button"
                                onClick={() => { if (phase === 'idle') setDigits(myNumber.replace(/\D/g, '')); }}
                                className="mb-1 w-full text-left active:opacity-60"
                            >
                                <span className="block text-[10px] font-bold uppercase tracking-wide text-[#6b5d3f]">{t('payphone.myNumber', 'My number')}</span>
                                <span className="block font-mono text-[13px] font-semibold text-[#2b3a8c]">{formatPhone(myNumber)}</span>
                            </button>
                        )}
                        {favorites.map(f => (
                            <button
                                key={f.phone}
                                type="button"
                                onClick={() => { if (phase === 'idle') setDigits(f.phone); }}
                                className="mt-1 w-full text-left active:opacity-60"
                            >
                                <span className="block truncate text-[11px] font-semibold text-[#4a3f28]">{f.name}</span>
                                <span className="block font-mono text-[12px] text-[#2b3a8c]">{formatPhone(f.phone)}</span>
                            </button>
                        ))}
                        {!myNumber && favorites.length === 0 && (
                            <span className="block pt-1 text-[11px] italic text-[#8a7a55]">{t('payphone.emptyNotepad', 'No numbers scribbled here yet.')}</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
