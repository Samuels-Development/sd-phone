import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Disc, Mic, MicOff, Phone, Plus, Video, Volume2 } from 'lucide-react';

import { AlertDialog } from '@/ui/AlertDialog';
import { resolveWallpaper } from '@/shell/wallpapers';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { fetchNui } from '@/core/nui';
import { useContacts } from '@/stores/contactsStore';
import { acceptCall, addToCall, declineCall, getCurrentCall, hangupCall } from './callsApi';
import { useMaskedPhone } from '@/stores/themeStore';
import { playDtmf } from './keypad/dtmf';
import { Dialpad } from './keypad/Dialpad';
import { ContactPickerSheet } from '@/shared/ContactPickerSheet';
import { Sheet } from '@/ui/Sheet';
import { startRing } from './calls/ringtone';
import { callRecorder } from './calls/callRecorder';
import { recordingEnabled } from './callrecApi';
import { startRingtone } from '@/apps/settings/tonePlayer';
import { resolveTone } from '@/apps/settings/tones';
import { useTheme, useThemeStore } from '@/stores/themeStore';
import { VideoCall } from './calls/VideoCall';
import { acceptVideo, requestVideo, stopVideo } from './calls/webrtc';
import { useCallStore } from '@/stores/callStore';
import { t } from '@/i18n';
import { formatDuration } from '@/lib/time';

function fmtElapsed(seconds: number): string {
    return formatDuration(seconds);
}

const RECORD_MAX_MINUTES = 10;

export function CallLayer({ wallpaper }: { wallpaper?: string }) {
    const phoneFmt  = useMaskedPhone();
    const phase     = useCallStore(s => s.phase);
    const channel   = useCallStore(s => s.channel);
    const name      = useCallStore(s => s.name);
    const number    = useCallStore(s => s.number);
    const startedAt = useCallStore(s => s.startedAt);
    const others    = useCallStore(s => s.others);
    const pending   = useCallStore(s => s.pending);
    const isVideo   = useCallStore(s => s.video);
    const minimised = useCallStore(s => s.minimised);
    const [muted, setMuted]     = useState(false);
    const [speaker, setSpeaker] = useState(false);
    const [keypadOpen, setKeypadOpen]     = useState(false);
    const [contactsOpen, setContactsOpen] = useState(false);
    const [addOpen, setAddOpen]           = useState(false);
    const [addDigits, setAddDigits]       = useState('');
    const [addError, setAddError]         = useState<string | null>(null);
    const [dtmfDialed, setDtmfDialed]     = useState('');
    const [droppedLost, setDroppedLost]   = useState<boolean | null>(null);
    const [now, setNow]         = useState(() => Date.now());
    const [recording, setRecording]           = useState(false);
    const [canRecord, setCanRecord]           = useState(false);
    const [videoPhase, setVideoPhase]         = useState<'off' | 'requesting' | 'incoming' | 'active'>('off');
    const [videoInitiator, setVideoInitiator] = useState(false);
    const [canMute, setCanMute] = useState(true);
    const { ringtone, ringtoneVol, customRingtones } = useTheme('ringtone', 'ringtoneVol', 'customRingtones');
    const { load: loadContacts } = useContacts('load');

    useEffect(() => {
        void fetchNui<{ mute?: boolean }>('sd-phone:call:voiceCapabilities')
            .then(caps => { if (caps && typeof caps.mute === 'boolean') setCanMute(caps.mute); })
            .catch(() => {});
    }, []);

    useEffect(() => { void recordingEnabled().then(setCanRecord); }, []);

    const direction = useRef<'incoming' | 'outgoing'>('outgoing');
    const [recError, setRecError] = useState<string | null>(null);

    const motion = useThemeStore(s => s.motion);
    const [anim, setAnim] = useState<'' | 'call-minimise' | 'call-restore'>('');
    const [hidden, setHidden] = useState(minimised);
    const wasMinimised = useRef(minimised);

    useEffect(() => {
        if (minimised === wasMinimised.current) return;
        wasMinimised.current = minimised;

        if (motion === 'off') { setHidden(minimised); setAnim(''); return; }

        if (minimised) {
            setAnim('call-minimise');
            const id = window.setTimeout(() => { setHidden(true); setAnim(''); }, 300);
            return () => window.clearTimeout(id);
        }
        setHidden(false);
        setAnim('call-restore');
        const id = window.setTimeout(() => setAnim(''), 380);
        return () => window.clearTimeout(id);
    }, [minimised, motion]);

    const toggleRecording = useCallback(async () => {
        if (callRecorder.active) {
            const res = await callRecorder.stop();
            setRecording(false);
            if (!res.ok) setRecError(res.error ?? t('phone.recordFailed','Recording failed'));
            return;
        }
        const started = await callRecorder.start(
            { peerNumber: number ?? '', peerName: name ?? undefined, direction: direction.current },
            RECORD_MAX_MINUTES,
        );
        if (!started) {
            setRecError(t('phone.recordNoMic','Recording needs microphone access.'));
            return;
        }
        setRecording(true);
    }, [name, number]);

    const resetControls = useCallback(() => {
        setMuted(false); setSpeaker(false); setVideoPhase('off');
        setKeypadOpen(false); setContactsOpen(false); setDtmfDialed('');
        setAddOpen(false); setAddDigits(''); setAddError(null);
        if (callRecorder.active) void callRecorder.stop();
        else callRecorder.dropPeer();
        setRecording(false);
    }, []);

    useNuiEvent('sd-phone:call:incoming', useCallback((data) => {
        resetControls();
        direction.current = 'incoming';
        useCallStore.getState().incoming(data);
    }, [resetControls]));

    useNuiEvent('sd-phone:call:outgoing', useCallback((data) => {
        resetControls();
        direction.current = 'outgoing';
        useCallStore.getState().outgoing(data);
    }, [resetControls]));

    useNuiEvent('sd-phone:call:connected', useCallback((data) => {
        useCallStore.getState().connected(data);
    }, []));

    useNuiEvent('sd-phone:call:ended', useCallback(() => {
        useCallStore.getState().ended();
        resetControls();
    }, [resetControls]));

    useNuiEvent('sd-phone:call:dropped', useCallback((data) => {
        setDroppedLost(data?.lost === true);
    }, []));

    useNuiEvent('sd-phone:call:roster', useCallback((data) => {
        useCallStore.getState().roster(data ?? {});
    }, []));

    useNuiEvent('sd-phone:video:begin', useCallback((data) => {
        setVideoInitiator(data?.initiator === true);
        setVideoPhase('active');
    }, []));

    useNuiEvent('sd-phone:record:peerStart', useCallback(() => {
        void callRecorder.acceptPeer();
    }, []));
    useNuiEvent('sd-phone:record:peerStop', useCallback(() => {
        callRecorder.dropPeer();
    }, []));
    useNuiEvent('sd-phone:video:signal', useCallback((data) => {
        if (data?.slot === 'record') callRecorder.handleSignal(data);
    }, []));

    useNuiEvent('sd-phone:video:request', useCallback(() => setVideoPhase('incoming'), []));
    useNuiEvent('sd-phone:video:accept',  useCallback(() => { setVideoInitiator(true); setVideoPhase('active'); }, []));
    useNuiEvent('sd-phone:video:stop',    useCallback(() => setVideoPhase('off'), []));

    const reconcile = useCallback(() => {
        const before = useCallStore.getState().channel;
        void getCurrentCall().then(cur => {
            if (useCallStore.getState().channel !== before) return;
            useCallStore.getState().reconcile(cur);
        }).catch(() => {});
    }, []);

    useEffect(reconcile, [reconcile]);

    useNuiEvent('sd-phone:open', reconcile);

    useEffect(() => {
        if (!phase || phase === 'active') return;
        if (phase === 'incoming') {
            return startRingtone(resolveTone('ringtone', ringtone, customRingtones).url, ringtoneVol / 100);
        }
        return startRing('ringback');
    }, [channel, phase, ringtone, customRingtones]);

    useEffect(() => {
        if (phase !== 'active') return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [phase]);

    async function submitAdd(target: string) {
        const digits = target.replace(/\D/g, '');
        if (!digits) return;
        const res = await addToCall(digits);
        if (!res.success) { setAddError(res.message ?? t('phone.couldNotAdd','Could not add that number')); return; }
        setAddOpen(false); setAddDigits(''); setAddError(null);
    }

    const dropNotice = droppedLost === null ? null : (
        <AlertDialog
            title={t('phone.callDropped','Call Dropped')}
            message={droppedLost
                ? t('phone.youLostService','You lost service.')
                : t('phone.peerLostService','The other caller lost service.')}
            confirmLabel={t('phone.ok','OK')}
            hideCancel
            onCancel={() => setDroppedLost(null)}
            onConfirm={() => setDroppedLost(null)}
        />
    );

    const recNotice = recError === null ? null : (
        <AlertDialog
            title={t('phone.recording','Recording')}
            message={recError}
            confirmLabel={t('phone.ok','OK')}
            hideCancel
            onCancel={() => setRecError(null)}
            onConfirm={() => setRecError(null)}
        />
    );

    if (!phase || (hidden && phase === 'active')) return <>{dropNotice}{recNotice}</>;

    const title    = name || phoneFmt(number) || t('phone.unknown','Unknown');
    const elapsed  = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
    const subtitle = phase === 'active'
        ? fmtElapsed(elapsed)
        : phase === 'outgoing'
            ? (isVideo ? t('phone.videoCallCalling','Video call…') : t('phone.calling','Calling…'))
            : (isVideo ? t('phone.videoCallIncoming','Incoming video call') : t('phone.incomingCallStatus','Incoming call'));

    return (
        <div className={`absolute inset-0 z-[60] overflow-hidden font-sf ${anim} ${anim ? 'app-anim-flatten' : ''}`}>
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage:    wallpaper ? `url(${resolveWallpaper(wallpaper)})` : undefined,
                    backgroundSize:     'cover',
                    backgroundPosition: 'center',
                    filter:             'blur(28px) brightness(0.5)',
                    transform:          'scale(1.15)',
                }}
            />
            <div className="absolute inset-0 bg-black/35" />

            <div className="relative z-10 flex h-full flex-col items-center">
                <div className="flex shrink-0 flex-col items-center px-8 pt-[120px]">
                    {recording && (
                        <button
                            type="button"
                            onClick={() => void toggleRecording()}
                            className="mb-3 flex items-center gap-2 rounded-full bg-ios-red/85 px-3.5 py-1.5 backdrop-blur-md"
                        >
                            <span className="h-[9px] w-[9px] animate-pulse rounded-full bg-white" />
                            <span className="text-[13px] font-semibold tracking-wide text-white">
                                {t('phone.recordingTapToStop','Recording, tap to stop')}
                            </span>
                        </button>
                    )}
                    {isVideo && phase !== 'active' && (
                        <div className="mb-3 flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 backdrop-blur-md">
                            <Video className="h-[16px] w-[16px] text-white" strokeWidth={2.2} />
                            <span className="text-[13px] font-semibold tracking-wide text-white">{t('phone.videoCall','Video Call')}</span>
                        </div>
                    )}
                    <div className="text-center text-[34px] font-semibold leading-tight text-white">{title}</div>
                    <div className="mt-1 text-[18px] font-light tabular-nums text-white/60">{subtitle}</div>
                    {(others.length > 0 || pending) && (
                        <div className="mt-3 flex w-full flex-col items-center gap-1">
                            {others.map(p => (
                                <div key={p.number} className="text-[16px] font-medium text-white/85">
                                    {p.name || phoneFmt(p.number)}
                                </div>
                            ))}
                            {pending && (
                                <div className="text-[16px] font-light text-white/45">
                                    {t('phone.addingParty','Calling {name}…',{ name: pending.name || phoneFmt(pending.number) })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {phase === 'incoming' ? (
                    <div className="mt-auto flex w-full items-end justify-between px-14 pb-[110px]">
                        <RoundAction
                            label={t('phone.decline','Decline')}
                            tone="red"
                            icon={<Phone className="h-[30px] w-[30px] rotate-[135deg]" fill="currentColor" strokeWidth={0} />}
                            onClick={() => void declineCall(channel!)}
                        />
                        <RoundAction
                            label={t('phone.accept','Accept')}
                            tone="green"
                            icon={isVideo
                                ? <Video className="h-[30px] w-[30px]" fill="currentColor" strokeWidth={0} />
                                : <Phone className="h-[30px] w-[30px]" fill="currentColor" strokeWidth={0} />}
                            onClick={() => void acceptCall(channel!)}
                        />
                    </div>
                ) : (
                    <>
                        <div className="flex flex-1 items-center">
                            <div className="rounded-[38px] bg-white/[0.12] px-7 py-8 shadow-[0_8px_40px_rgba(0,0,0,0.35)] ring-1 ring-white/10 backdrop-blur-2xl">
                                <div className="grid grid-cols-3 justify-items-center gap-x-7 gap-y-6">
                                    <ControlButton
                                        label={t('phone.speaker','Speaker')}
                                        active={speaker}
                                        onClick={() => { const on = !speaker; setSpeaker(on); void fetchNui('sd-phone:call:speaker', { on }); }}
                                        icon={<Volume2 className="h-[31px] w-[31px]" strokeWidth={2} />}
                                    />
                                    {canMute && (
                                        <ControlButton
                                            label={t('phone.mute','Mute')}
                                            active={muted}
                                            onClick={() => { const on = !muted; setMuted(on); void fetchNui('sd-phone:call:mute', { on }); }}
                                            icon={muted ? <MicOff className="h-[31px] w-[31px]" strokeWidth={2} /> : <Mic className="h-[31px] w-[31px]" strokeWidth={2} />}
                                        />
                                    )}
                                    <ControlButton
                                        label={t('phone.video','Video')}
                                        active={videoPhase === 'requesting'}
                                        disabled={phase !== 'active' || others.length > 0}
                                        onClick={() => { if (phase === 'active' && videoPhase === 'off') { requestVideo(); setVideoPhase('requesting'); } }}
                                        icon={<Video className="h-[31px] w-[31px]" strokeWidth={2} />}
                                    />
                                    <ControlButton
                                        label={t('phone.addCall','Add call')}
                                        active={addOpen}
                                        disabled={phase !== 'active' || pending !== null || others.length > 0}
                                        onClick={() => { setAddError(null); setAddDigits(''); setContactsOpen(true); void loadContacts(); }}
                                        icon={<Plus className="h-[34px] w-[34px]" strokeWidth={2} />}
                                    />
                                    {canRecord && (
                                        <ControlButton
                                            label={t('phone.record','Record')}
                                            active={recording}
                                            disabled={phase !== 'active' || others.length > 0}
                                            onClick={() => void toggleRecording()}
                                            icon={<Disc className="h-[31px] w-[31px]" strokeWidth={2} />}
                                        />
                                    )}
                                    <ControlButton label={t('phone.keypad','Keypad')} active={keypadOpen} onClick={() => setKeypadOpen(true)} icon={<KeypadDots />} />
                                    <ControlButton
                                        label={t('phone.minimise','Minimise')}
                                        disabled={phase !== 'active'}
                                        onClick={() => useCallStore.getState().setMinimised(true)}
                                        icon={<ChevronDown className="h-[34px] w-[34px]" strokeWidth={2} />}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="relative flex w-full shrink-0 justify-center pb-[120px]">
                            {videoPhase === 'incoming' && phase === 'active' && (
                                <div className="absolute inset-x-0 bottom-full flex flex-col items-center gap-3 px-8 pb-5">
                                    <div className="rounded-full bg-black/45 px-4 py-1.5 text-center text-[15px] text-white/90 backdrop-blur-md">
                                        {t('phone.wantsToSwitchToVideo','{name} wants to switch to video',{ name: title })}
                                    </div>
                                    <div className="flex gap-4">
                                        <button
                                            type="button"
                                            onClick={() => { stopVideo(); setVideoPhase('off'); }}
                                            className="rounded-full bg-white/15 px-6 py-2.5 text-[15px] font-semibold text-white backdrop-blur-md active:opacity-70"
                                        >
                                            {t('phone.decline','Decline')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { acceptVideo(); setVideoInitiator(false); setVideoPhase('active'); }}
                                            className="rounded-full bg-ios-green px-6 py-2.5 text-[15px] font-semibold text-white active:opacity-80"
                                        >
                                            {t('phone.accept','Accept')}
                                        </button>
                                    </div>
                                </div>
                            )}
                            <button
                                type="button"
                                aria-label={t('phone.endCall','End call')}
                                onClick={() => void hangupCall(channel!)}
                                className="flex h-[80px] w-[80px] items-center justify-center rounded-full bg-ios-red shadow-[0_6px_24px_rgba(255,59,48,0.45)] active:opacity-80"
                            >
                                <Phone className="h-[33px] w-[33px] rotate-[135deg] text-white" fill="currentColor" strokeWidth={0} />
                            </button>
                        </div>
                    </>
                )}
            </div>

            {keypadOpen && (
                <Sheet onClose={() => setKeypadOpen(false)} fit="content" zIndex={68} className="font-sf bg-base">
                    {() => (
                        <div className="flex flex-col items-center px-6 pb-9 pt-2">
                            <div className="mb-5 flex h-[44px] items-center text-[32px] tracking-[0.02em] tabular-nums text-black dark:text-white">
                                {dtmfDialed.slice(-12) || (
                                    <span className="text-[17px] text-black/40 dark:text-white/40">{t('phone.keypad','Keypad')}</span>
                                )}
                            </div>
                            <Dialpad onPress={k => { playDtmf(k); setDtmfDialed(d => (d + k).slice(-24)); }} />
                        </div>
                    )}
                </Sheet>
            )}


            {addOpen && (
                <Sheet onClose={() => { setAddOpen(false); setAddDigits(''); setAddError(null); }} fit="content" zIndex={68} className="font-sf bg-base">
                    {() => (
                        <div className="flex flex-col items-center px-6 pb-9 pt-2">
                            <div className="text-[15px] font-semibold text-black/50 dark:text-white/50">
                                {t('phone.addCall','Add call')}
                            </div>
                            <div className="mb-4 mt-2 flex h-[44px] items-center text-[32px] tracking-[0.02em] tabular-nums text-black dark:text-white">
                                {addDigits || (
                                    <span className="text-[17px] text-black/40 dark:text-white/40">{t('phone.enterNumber','Enter a number')}</span>
                                )}
                            </div>

                            {addError && <p className="pb-2 text-center text-[14px] text-ios-red">{addError}</p>}

                            <Dialpad onPress={k => { playDtmf(k); setAddDigits(d => (d + k).slice(0, 15)); }} />

                            <button
                                type="button"
                                disabled={addDigits.length === 0}
                                onClick={() => void submitAdd(addDigits)}
                                className="mt-6 rounded-full bg-ios-green px-8 py-3 text-[16px] font-semibold text-white active:opacity-80 disabled:opacity-35"
                            >
                                {t('phone.add','Add')}
                            </button>
                        </div>
                    )}
                </Sheet>
            )}

            {contactsOpen && (
                <ContactPickerSheet
                    zIndex={68}
                    onPick={c => { setContactsOpen(false); void submitAdd(c.phone); }}
                    onClose={() => setContactsOpen(false)}
                    extra={
                        <button
                            type="button"
                            onClick={() => { setContactsOpen(false); setAddOpen(true); }}
                            className="mb-4 flex w-full items-center gap-4 rounded-[12px] bg-surface px-4 py-3.5 text-left shadow-sm active:bg-black/[0.06] dark:active:bg-white/[0.06]"
                        >
                            <span className="flex h-[56px] w-[56px] items-center justify-center rounded-full bg-ios-blue/15 text-ios-blue">
                                <KeypadDots />
                            </span>
                            <span className="text-[21px] font-semibold text-black dark:text-white">
                                {t('phone.dialNumber','Dial a number')}
                            </span>
                        </button>
                    }
                />
            )}

            {videoPhase === 'active' && (
                <VideoCall
                    peerName={title}
                    initiator={videoInitiator}
                    muted={muted}
                    canMute={canMute}
                    onToggleMute={() => { const on = !muted; setMuted(on); void fetchNui('sd-phone:call:mute', { on }); }}
                    onEndVideo={() => { stopVideo(); setVideoPhase('off'); }}
                    onHangup={() => void hangupCall(channel!)}
                />
            )}

            {recNotice}
        </div>
    );
}

function KeypadDots() {
    return (
        <span className="grid grid-cols-3 gap-[6px]">
            {Array.from({ length: 9 }).map((_, i) => (
                <span key={i} className="h-[6px] w-[6px] rounded-full bg-current" />
            ))}
        </span>
    );
}

function ControlButton({ icon, label, active, disabled, onClick }: {
    icon:      ReactNode;
    label:     string;
    active?:   boolean;
    disabled?: boolean;
    onClick?:  () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`flex flex-col items-center gap-2 ${disabled ? 'opacity-35' : 'active:opacity-70'}`}
        >
            <span
                className={`flex h-[78px] w-[78px] items-center justify-center rounded-full transition-colors ${
                    active ? 'bg-white text-black' : 'bg-white/15 text-white'
                }`}
            >
                {icon}
            </span>
            <span className="text-[13px] font-medium text-white">{label}</span>
        </button>
    );
}

function RoundAction({ icon, label, tone, onClick }: {
    icon:    ReactNode;
    label:   string;
    tone:    'red' | 'green';
    onClick: () => void;
}) {
    return (
        <div className="flex flex-col items-center gap-2.5">
            <button
                type="button"
                onClick={onClick}
                className={`flex h-[72px] w-[72px] items-center justify-center rounded-full text-white active:opacity-80 ${
                    tone === 'red' ? 'bg-ios-red' : 'bg-ios-green'
                }`}
            >
                {icon}
            </button>
            {label && <span className="text-[15px] font-medium text-white">{label}</span>}
        </div>
    );
}
