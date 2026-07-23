import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Mic, MicOff, Phone, Plus, User, Video, Volume2 } from 'lucide-react';

import { resolveWallpaper } from '@/shell/wallpapers';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { fetchNui } from '@/core/nui';
import { useContacts } from '@/stores/contactsStore';
import { acceptCall, declineCall, getCurrentCall, hangupCall } from './callsApi';
import { formatPhone } from './data';
import { playDtmf } from './keypad/dtmf';
import { startRing } from './calls/ringtone';
import { startRingtone } from '@/apps/settings/tonePlayer';
import { resolveTone } from '@/apps/settings/tones';
import { useTheme } from '@/stores/themeStore';
import { VideoCall } from './calls/VideoCall';
import { acceptVideo, consumePendingVideo, requestVideo, stopVideo } from './calls/webrtc';
import { useCallStore } from '@/stores/callStore';
import { t } from '@/i18n';
import { formatDuration } from '@/lib/time';

function fmtElapsed(seconds: number): string {
    return formatDuration(seconds);
}

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export function CallLayer({ wallpaper }: { wallpaper?: string }) {
    const phase     = useCallStore(s => s.phase);
    const channel   = useCallStore(s => s.channel);
    const name      = useCallStore(s => s.name);
    const number    = useCallStore(s => s.number);
    const startedAt = useCallStore(s => s.startedAt);
    const [muted, setMuted]     = useState(false);
    const [speaker, setSpeaker] = useState(false);
    const [keypadOpen, setKeypadOpen]     = useState(false);
    const [contactsOpen, setContactsOpen] = useState(false);
    const [dtmfDialed, setDtmfDialed]     = useState('');
    const [now, setNow]         = useState(() => Date.now());
    const [videoPhase, setVideoPhase]         = useState<'off' | 'requesting' | 'incoming' | 'active'>('off');
    const [videoInitiator, setVideoInitiator] = useState(false);
    const { ringtone, ringtoneVol, customRingtones } = useTheme('ringtone', 'ringtoneVol', 'customRingtones');
    const { contacts: contactList, load: loadContacts } = useContacts('contacts', 'load');

    const resetControls = useCallback(() => {
        setMuted(false); setSpeaker(false); setVideoPhase('off');
        setKeypadOpen(false); setContactsOpen(false); setDtmfDialed('');
    }, []);

    useNuiEvent('sd-phone:call:incoming', useCallback((data) => {
        resetControls();
        useCallStore.getState().incoming(data);
    }, [resetControls]));

    useNuiEvent('sd-phone:call:outgoing', useCallback((data) => {
        resetControls();
        useCallStore.getState().outgoing(data);
    }, [resetControls]));

    useNuiEvent('sd-phone:call:connected', useCallback((data) => {
        useCallStore.getState().connected(data);
        if (consumePendingVideo()) { requestVideo(); setVideoPhase('requesting'); }
    }, []));

    useNuiEvent('sd-phone:call:ended', useCallback(() => {
        consumePendingVideo();
        useCallStore.getState().ended();
        resetControls();
    }, [resetControls]));

    useNuiEvent('sd-phone:video:request', useCallback(() => setVideoPhase('incoming'), []));
    useNuiEvent('sd-phone:video:accept',  useCallback(() => { setVideoInitiator(true); setVideoPhase('active'); }, []));
    useNuiEvent('sd-phone:video:stop',    useCallback(() => setVideoPhase('off'), []));

    useEffect(() => {
        let active = true;
        void getCurrentCall().then(cur => {
            if (!active || !cur) return;
            useCallStore.getState().hydrate(cur);
        });
        return () => { active = false; };
    }, []);

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

    if (!phase) return null;

    const title    = name || formatPhone(number) || t('phone.unknown','Unknown');
    const elapsed  = startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
    const subtitle = phase === 'outgoing' ? t('phone.calling','Calling…') : phase === 'incoming' ? t('phone.incomingCallStatus','Incoming call') : fmtElapsed(elapsed);

    return (
        <div className="absolute inset-0 z-[60] overflow-hidden font-sf">
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
                <div className="flex shrink-0 flex-col items-center pt-[120px]">
                    <div className="text-[34px] font-semibold leading-tight text-white">{title}</div>
                    <div className="mt-1 text-[18px] font-light tabular-nums text-white/60">{subtitle}</div>
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
                            icon={<Phone className="h-[30px] w-[30px]" fill="currentColor" strokeWidth={0} />}
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
                                    <ControlButton
                                        label={t('phone.mute','Mute')}
                                        active={muted}
                                        onClick={() => { const on = !muted; setMuted(on); void fetchNui('sd-phone:call:mute', { on }); }}
                                        icon={muted ? <MicOff className="h-[31px] w-[31px]" strokeWidth={2} /> : <Mic className="h-[31px] w-[31px]" strokeWidth={2} />}
                                    />
                                    <ControlButton
                                        label={t('phone.video','Video')}
                                        active={videoPhase === 'requesting'}
                                        onClick={() => { if (phase === 'active' && videoPhase === 'off') { requestVideo(); setVideoPhase('requesting'); } }}
                                        icon={<Video className="h-[31px] w-[31px]" strokeWidth={2} />}
                                    />
                                    <ControlButton label={t('phone.addCall','Add call')} icon={<Plus className="h-[34px] w-[34px]" strokeWidth={2} />} />
                                    <ControlButton label={t('phone.keypad','Keypad')} active={keypadOpen} onClick={() => setKeypadOpen(true)} icon={<KeypadDots />} />
                                    <ControlButton label={t('phone.contacts','Contacts')} active={contactsOpen} onClick={() => { setContactsOpen(true); void loadContacts(); }} icon={<User className="h-[31px] w-[31px]" strokeWidth={2} />} />
                                </div>
                            </div>
                        </div>

                        <div className="flex shrink-0 justify-center pb-[120px]">
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
                <div className="absolute inset-0 z-[66] flex flex-col items-center justify-end bg-black/60 pb-[120px] backdrop-blur-xl">
                    <div className="mb-5 flex h-[40px] items-center text-[30px] font-light tracking-wider text-white tabular-nums">
                        {dtmfDialed.slice(-12) || <span className="text-[17px] font-normal text-white/40">{t('phone.keypad','Keypad')}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                        {KEYPAD_KEYS.map(k => (
                            <button
                                key={k}
                                type="button"
                                onClick={() => { playDtmf(k); setDtmfDialed(d => (d + k).slice(-24)); }}
                                className="flex h-[70px] w-[70px] items-center justify-center rounded-full bg-white/[0.14] text-[30px] font-light text-white active:bg-white/35"
                            >
                                {k}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setKeypadOpen(false)}
                        className="mt-7 text-[17px] font-semibold text-white/85 active:opacity-60"
                    >
                        {t('phone.hideKeypad','Hide')}
                    </button>
                </div>
            )}

            {contactsOpen && (
                <div className="absolute inset-0 z-[66] flex flex-col bg-black/75 backdrop-blur-2xl">
                    <div className="flex items-center justify-between px-6 pb-2 pt-[70px]">
                        <span className="text-[22px] font-bold text-white">{t('phone.contacts','Contacts')}</span>
                        <button
                            type="button"
                            onClick={() => setContactsOpen(false)}
                            className="text-[17px] font-semibold text-ios-blue active:opacity-60"
                        >
                            {t('phone.done','Done')}
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-10">
                        {contactList.length === 0 && (
                            <p className="pt-8 text-center text-[15px] text-white/50">{t('phone.noContacts','No contacts yet')}</p>
                        )}
                        {contactList.map(c => (
                            <div key={c.id} className="border-b border-white/[0.08] py-3">
                                <div className="text-[17px] font-medium text-white">{c.name}</div>
                                <div className="text-[14px] tabular-nums text-white/55">{formatPhone(c.phone)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {videoPhase === 'incoming' && phase === 'active' && (
                <div className="absolute inset-x-0 bottom-[150px] z-[65] flex flex-col items-center gap-3 px-8">
                    <div className="text-[15px] text-white/85">{t('phone.wantsToSwitchToVideo','{name} wants to switch to video',{ name: title })}</div>
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

            {videoPhase === 'active' && (
                <VideoCall
                    peerName={title}
                    initiator={videoInitiator}
                    onEndVideo={() => { stopVideo(); setVideoPhase('off'); }}
                    onHangup={() => void hangupCall(channel!)}
                />
            )}
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

function ControlButton({ icon, label, active, onClick }: {
    icon:     ReactNode;
    label:    string;
    active?:  boolean;
    onClick?: () => void;
}) {
    return (
        <button type="button" onClick={onClick} className="flex flex-col items-center gap-2 active:opacity-70">
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
