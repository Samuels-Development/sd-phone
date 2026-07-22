import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, CSSProperties } from 'react';
import { Camera, Check, Delete, Flashlight, Lock, ScanFace } from 'lucide-react';

import { formatClockTime, formatLongDate, useClock } from '@/hooks/useClock';
import { useKeypadInput } from '@/hooks/useKeypadInput';
import { fetchNui, isFiveM } from '@/core/nui';
import { resolveWallpaper } from './wallpapers';
import { useTheme } from '@/stores/themeStore';
import { Clockface } from './lockClock';
import { LockClockEditor } from './LockClockEditor';
import { NotifIcon, type NotificationItem } from './Notifications';
import { t } from '@/i18n';

export interface LockscreenProps {
    use24h:        boolean;
    showDate:      boolean;
    wallpaper:     string;
    unlockTrigger: number;
    onUnlock:      () => void;
    launchTrigger: number;
    onLaunch:      () => void;
    notifications: NotificationItem[];
    onOpenNotif:   (item: NotificationItem) => void;
    onDismissNotif: (id: string) => void;
    flashlightOn:   boolean;
    onToggleFlashlight: () => void;
    onOpenCamera:   () => void;
}

export function Lockscreen({ use24h, showDate, wallpaper, unlockTrigger, onUnlock, launchTrigger, onLaunch, notifications, onOpenNotif, onDismissNotif, flashlightOn, onToggleFlashlight, onOpenCamera }: LockscreenProps) {
    const now  = useClock();
    const time = formatClockTime(now, use24h);
    const date = formatLongDate(now);
    const [exiting, setExiting] = useState(false);

    const { lockClock, setLockClock, passcode, faceId } = useTheme('lockClock', 'setLockClock', 'passcode', 'faceId');
    const [customizing, setCustomizing] = useState(false);
    const [authMode, setAuthMode] = useState<null | 'face' | 'passcode'>(null);

    const lpTimer = useRef<number | null>(null);
    const lpStart = useRef({ x: 0, y: 0 });
    const clearLp = () => { if (lpTimer.current) { window.clearTimeout(lpTimer.current); lpTimer.current = null; } };
    useEffect(() => () => clearLp(), []);
    function onClockDown(e: ReactPointerEvent) {
        if (customizing) return;
        lpStart.current = { x: e.clientX, y: e.clientY };
        clearLp();
        lpTimer.current = window.setTimeout(() => setCustomizing(true), 450);
    }
    function onClockMove(e: ReactPointerEvent) {
        if (lpTimer.current && (Math.abs(e.clientX - lpStart.current.x) > 10 || Math.abs(e.clientY - lpStart.current.y) > 10)) clearLp();
    }
    function onClockContext(e: ReactMouseEvent) {
        e.preventDefault();
        setCustomizing(true);
    }

    function forceUnlock() {
        if (exiting) return;
        setExiting(true);
        void fetchNui('sd-phone:unlock');
        window.setTimeout(onUnlock, 330);
    }

    const pendingSuccess = useRef<() => void>(() => {});
    function runPending() {
        const fn = pendingSuccess.current;
        pendingSuccess.current = () => {};
        fn();
    }

    function requestAuth(onSuccess: () => void) {
        if (exiting || authMode) return;
        if (!passcode) { onSuccess(); return; }
        pendingSuccess.current = onSuccess;
        if (faceId) {
            setAuthMode('face');
        } else {
            setAuthMode('passcode');
        }
    }

    function commitUnlock() { requestAuth(forceUnlock); }
    function requestCamera() { requestAuth(onOpenCamera); }
    function requestLaunch() { requestAuth(onLaunch); }
    function requestOpenNotif(item: NotificationItem) { requestAuth(() => onOpenNotif(item)); }

    const latest = useRef({ commitUnlock, forceUnlock, runPending, requestLaunch });
    latest.current = { commitUnlock, forceUnlock, runPending, requestLaunch };

    const seenTrigger = useRef(unlockTrigger);
    useEffect(() => {
        if (unlockTrigger !== seenTrigger.current) {
            seenTrigger.current = unlockTrigger;
            latest.current.commitUnlock();
        }
         
    }, [unlockTrigger]);

    const seenLaunch = useRef(launchTrigger);
    useEffect(() => {
        if (launchTrigger !== seenLaunch.current) {
            seenLaunch.current = launchTrigger;
            latest.current.requestLaunch();
        }
         
    }, [launchTrigger]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.key === 'h' || e.key === 'H') && !isFiveM) latest.current.forceUnlock();
            else if (e.key === 'Enter' || e.key === ' ') latest.current.commitUnlock();
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
         
    }, []);

    return (
        <div className="absolute inset-0 select-none">
            <div
                className="wallpaper absolute inset-0"
                style={{ backgroundImage: `url(${resolveWallpaper(wallpaper)})` }}
            />

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-black/55" />

            <div className={`absolute inset-0 ${exiting ? 'animate-unlock-pull' : ''}`}>
                <div className={`relative z-10 flex pt-28 ${lockClock.layout === 'left' ? 'justify-start pl-9' : lockClock.layout === 'right' ? 'justify-end pr-9' : 'justify-center'}`}>
                    <div
                        onPointerDown={onClockDown}
                        onPointerMove={onClockMove}
                        onPointerUp={clearLp}
                        onPointerLeave={clearLp}
                        onPointerCancel={clearLp}
                        onContextMenu={onClockContext}
                        className="relative cursor-pointer rounded-[26px] px-5 py-2 transition-all duration-200"
                        style={customizing ? { boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.07)' } : undefined}
                    >
                        <Clockface time={time} date={date} config={lockClock} size={94} showDate={showDate} />
                    </div>
                </div>

                {notifications.length > 0 && (
                    <div
                        className="absolute inset-x-0 z-10 overflow-y-auto no-scrollbar px-4"
                        style={{ top: 286, bottom: 130 }}
                    >
                        <div className="flex flex-col gap-2 pb-2">
                            {notifications.map(n => (
                                <LockNotifCard key={n.id} item={n} onOpen={() => requestOpenNotif(n)} onDismiss={() => onDismissNotif(n.id)} />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="absolute bottom-[46px] left-0 right-0 z-10 flex items-center justify-between px-10">
                <QuickAction label={t('shell.flashlight','Flashlight')} active={flashlightOn} onClick={(e) => { e.stopPropagation(); onToggleFlashlight(); }}>
                    <Flashlight
                        className={`h-[29px] w-[29px] ${flashlightOn ? 'text-black' : 'text-white'}`}
                        fill={flashlightOn ? 'currentColor' : 'none'}
                        strokeWidth={2.2}
                    />
                </QuickAction>
                <QuickAction label={t('shell.camera','Camera')} onClick={(e) => { e.stopPropagation(); requestCamera(); }}>
                    <Camera className="h-[29px] w-[29px] text-white" strokeWidth={2.2} />
                </QuickAction>
            </div>

            {customizing && (
                <LockClockEditor
                    config={lockClock}
                    time={time}
                    date={date}
                    wallpaper={wallpaper}
                    onChange={setLockClock}
                    onClose={() => setCustomizing(false)}
                />
            )}

            {authMode && (
                <div className={`absolute inset-0 z-[80] ${exiting ? 'animate-faceid-veil-out' : ''}`}>
                    {authMode === 'face' && <FaceScan exiting={exiting} onSuccess={() => latest.current.runPending()} />}
                    {authMode === 'passcode' && passcode && (
                        <PasscodeEntry
                            wallpaper={wallpaper}
                            expected={passcode}
                            onSuccess={() => latest.current.runPending()}
                            onCancel={() => setAuthMode(null)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}


function FaceScan({ exiting, onSuccess }: { exiting: boolean; onSuccess: () => void }) {
    const [done, setDone] = useState(false);
    const cb = useRef(onSuccess);
    cb.current = onSuccess;

    useEffect(() => {
        const toDone   = window.setTimeout(() => setDone(true), 740);
        const toUnlock = window.setTimeout(() => cb.current(), 1240);
        return () => { window.clearTimeout(toDone); window.clearTimeout(toUnlock); };
    }, []);

    return (
        <div className="absolute inset-0 z-[80] flex flex-col items-center justify-center">
            <div className="absolute inset-0 bg-black/40 animate-faceid-dim-in" />
            {!exiting && <div className="absolute inset-0 animate-faceid-blur-in" />}

            <div className="relative z-10 flex flex-col items-center animate-faceid-in">
                <div className="relative flex h-[150px] w-[150px] items-center justify-center">
                    <div className="absolute h-[122px] w-[122px] rounded-full bg-white/10 blur-2xl" />

                    {done && (
                        <>
                            <div
                                className="absolute h-[150px] w-[150px] rounded-full animate-faceid-flash"
                                style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.85), rgba(255,255,255,0) 64%)' }}
                            />
                            <div className="absolute h-[112px] w-[112px] rounded-full border-2 border-white/70 animate-faceid-ripple" />
                        </>
                    )}

                    <div className="relative h-[108px] w-[108px]">
                        <div className={`absolute inset-0 transition-opacity duration-150 ${done ? 'opacity-0' : 'opacity-100'}`}>
                            <ScanFace className="h-[108px] w-[108px] text-white" strokeWidth={1.4} />
                            <div className="absolute inset-[16px] overflow-hidden">
                                <div
                                    className="absolute inset-x-0 top-0 h-[2px] animate-faceid-scanline"
                                    style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.95) 50%, transparent)', boxShadow: '0 0 12px 1px rgba(255,255,255,0.7)' }}
                                />
                            </div>
                        </div>
                        {done && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <Check className="h-[94px] w-[94px] text-white animate-faceid-pop" strokeWidth={2.4} />
                            </div>
                        )}
                    </div>
                </div>

                <p className={`mt-2 text-[15px] font-medium text-white/90 transition-opacity duration-200 ${done ? 'opacity-0' : 'opacity-100'}`}>
                    {t('shell.faceUnlock','Face Unlock')}
                </p>
            </div>
        </div>
    );
}


const PASSCODE_KEYS: { d: string; l: string }[] = [
    { d: '1', l: '' },     { d: '2', l: 'A B C' }, { d: '3', l: 'D E F' },
    { d: '4', l: 'G H I' }, { d: '5', l: 'J K L' }, { d: '6', l: 'M N O' },
    { d: '7', l: 'P Q R S' }, { d: '8', l: 'T U V' }, { d: '9', l: 'W X Y Z' },
];

function PasscodeEntry({ wallpaper, expected, onSuccess, onCancel }: {
    wallpaper: string; expected: string; onSuccess: () => void; onCancel: () => void;
}) {
    const [pin, setPin]     = useState('');
    const [shake, setShake] = useState(false);
    const [exiting, setExiting] = useState(false);
    const len = expected.length || 4;

    function cancel() {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(onCancel, 300);
    }

    function press(d: string) {
        if (pin.length >= len || shake || exiting) return;
        const next = pin + d;
        setPin(next);
        if (next.length === len) {
            window.setTimeout(() => {
                if (next === expected) {
                    onSuccess();
                } else {
                    setShake(true);
                    window.setTimeout(() => { setPin(''); setShake(false); }, 520);
                }
            }, 130);
        }
    }
    function del() { setPin(p => p.slice(0, -1)); }

    useKeypadInput({
        onPress: press,
        onDelete: del,
        canDelete: pin.length > 0 && !shake && !exiting,
        enabled: !exiting,
    });

    return (
        <div className={`absolute inset-0 z-[80] ${exiting ? 'animate-passcode-out' : 'animate-passcode-in'}`}>
            <div
                className="absolute inset-0"
                style={{ backgroundImage: `url(${resolveWallpaper(wallpaper)})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(34px)', transform: 'scale(1.16)' }}
            />
            <div className="absolute inset-0 bg-black/45" />

            <div className={`absolute inset-0 z-10 flex flex-col items-center px-8 ${exiting ? 'animate-passcode-slide-out' : 'animate-passcode-slide-in'}`}>
                <div className="mt-[128px] flex flex-col items-center">
                    <Lock className="h-[37px] w-[37px] text-white" strokeWidth={2.1} />
                    <p className="mt-[18px] text-[25px] font-semibold tracking-tight text-white">{t('shell.enterPasscode','Enter Passcode')}</p>
                </div>

                <div className={`mt-8 flex gap-[26px] ${shake ? 'animate-pin-shake' : ''}`}>
                    {Array.from({ length: len }).map((_, i) => (
                        <div
                            key={i}
                            className="h-[16px] w-[16px] rounded-full border border-white/75 transition-colors"
                            style={{ background: i < pin.length ? '#ffffff' : 'transparent' }}
                        />
                    ))}
                </div>

                <div className="flex-1" />

                <div className="grid grid-cols-3 gap-x-[24px] gap-y-[24px]" style={{ width: 330 }}>
                    {PASSCODE_KEYS.map(k => <Key key={k.d} digit={k.d} letters={k.l} onPress={() => press(k.d)} />)}
                    <div />
                    <Key digit="0" letters="" onPress={() => press('0')} />
                    <div className="flex h-[94px] items-center justify-center">
                        {pin.length > 0 ? (
                            <button type="button" onClick={del} aria-label={t('shell.delete','Delete')} className="flex h-[94px] w-[94px] items-center justify-center text-white/90 active:opacity-60">
                                <Delete className="h-[31px] w-[31px]" strokeWidth={1.7} />
                            </button>
                        ) : (
                            <button type="button" onClick={cancel} className="text-[19px] font-normal text-white/90 active:opacity-60">
                                {t('shell.cancel','Cancel')}
                            </button>
                        )}
                    </div>
                </div>
                <div className="h-[84px] shrink-0" />
            </div>
        </div>
    );
}

function Key({ digit, letters, onPress }: { digit: string; letters: string; onPress: () => void }) {
    return (
        <button
            type="button"
            onClick={onPress}
            aria-label={digit}
            className="flex h-[94px] w-[94px] flex-col items-center justify-center rounded-full bg-white/[0.18] transition-colors active:bg-white/40"
        >
            <span className="text-[41px] font-light leading-none text-white">{digit}</span>
            {letters && <span className="mt-[3px] text-[11px] font-semibold tracking-[0.16em] text-white/85">{letters}</span>}
        </button>
    );
}

function ancestorZoom(el: HTMLElement | null): number {
    let z = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const cz = parseFloat(getComputedStyle(n).getPropertyValue('zoom'));
        if (cz > 0 && cz !== 1) z *= cz;
    }
    return z || 1;
}

function LockNotifCard({ item, onOpen, onDismiss }: { item: NotificationItem; onOpen: () => void; onDismiss: () => void }) {
    const [dx, setDx] = useState(0);
    const [exiting, setExiting] = useState(false);
    const start    = useRef({ x: 0, y: 0 });
    const zoom     = useRef(1);
    const dragging = useRef(false);
    const axis     = useRef<'h' | 'v' | null>(null);

    function onDown(e: ReactPointerEvent) {
        start.current = { x: e.clientX, y: e.clientY };
        zoom.current = ancestorZoom(e.currentTarget as HTMLElement);
        dragging.current = true; axis.current = null;
    }
    function onMove(e: ReactPointerEvent) {
        if (!dragging.current) return;
        const rdx = e.clientX - start.current.x;
        const rdy = e.clientY - start.current.y;
        if (!axis.current && (Math.abs(rdx) > 6 || Math.abs(rdy) > 6)) {
            axis.current = Math.abs(rdx) > Math.abs(rdy) ? 'h' : 'v';
            if (axis.current === 'h') { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
        }
        if (axis.current !== 'h') return;
        setDx(Math.min(0, rdx) / zoom.current);
    }
    function onUp(e: ReactPointerEvent) {
        if (!dragging.current) return;
        dragging.current = false;
        const rdx = e.clientX - start.current.x;
        if (axis.current === 'h' && rdx < -90) {
            setExiting(true);
            window.setTimeout(onDismiss, 230);
        } else if (axis.current === null) {
            onOpen();
        } else {
            setDx(0);
        }
    }

    const dragStyle: CSSProperties = exiting
        ? { transform: 'translateX(-115%)', opacity: 0, transition: 'transform 0.24s cubic-bezier(0.4,0,1,1), opacity 0.24s ease-in' }
        : dx
        ? { transform: `translateX(${dx}px)`, opacity: Math.max(0.2, 1 + dx / 280), transition: dragging.current ? 'none' : 'transform 0.24s cubic-bezier(0.2,0.8,0.3,1), opacity 0.2s' }
        : {};

    return (
        <button
            type="button"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            style={{ touchAction: 'pan-y', ...dragStyle }}
            className="flex w-full animate-notif-drop touch-pan-y select-none items-start gap-3 rounded-[27px] bg-white/55 px-[18px] py-4 text-left shadow-[0_6px_24px_rgba(0,0,0,0.16)] ring-1 ring-black/[0.04] backdrop-blur-2xl backdrop-saturate-150"
        >
            <NotifIcon item={item} size={47} />
            <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[17px] font-semibold text-black/90">{item.title}</span>
                    <span className="shrink-0 text-[13.5px] text-black/45">{item.time ?? t('shell.now','now')}</span>
                </div>
                {item.body && (
                    <p className="mt-[3px] line-clamp-4 text-[15.5px] leading-snug text-black/[0.72]">{item.body}</p>
                )}
            </div>
        </button>
    );
}

function QuickAction({ children, label, active = false, onClick }: { children: React.ReactNode; label: string; active?: boolean; onClick?: (e: React.MouseEvent) => void }) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={`flex h-[70px] w-[70px] items-center justify-center rounded-full ring-1 ring-inset backdrop-blur-2xl backdrop-saturate-150 transition-all active:scale-90 ${
                active ? 'bg-white/90 ring-black/[0.06]' : 'bg-black/30 ring-white/[0.12]'
            }`}
            style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.28)' }}
        >
            {children}
        </button>
    );
}

