import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlarmClock, Music2, Pause, Phone, Play, Radio, SkipBack, SkipForward } from 'lucide-react';

import { useTheme } from '@/stores/themeStore';
import type { PhoneAlign } from '@/stores/themeStore';
import { useCallStore } from '@/stores/callStore';
import { fetchNui } from '@/core/nui';
import { useMusic } from '@/apps/music/MusicContext';
import { coverGradient, youtubeId } from '@/apps/music/data';
import type { Track } from '@/apps/music/data';
import { RingDuration } from '@/apps/clock/AlarmRinging';
import { playShutter } from '@/media/shutter';
import { DEFAULT_FRAME_COLOR, frameStops } from './frameColors';
import { t } from '@/i18n';


const B  = 9;

const SW = 440;
const SH = 956;
const W  = SW + B * 2;
const H  = SH + B * 2;
const SX = B;
const SY = B;
const BR = 55;
const SR = BR - B;

const SCREEN_MASK =
    `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='${SW}' height='${SH}'><rect width='${SW}' height='${SH}' rx='${SR}' ry='${SR}' fill='#fff'/></svg>`,
    )}")`;

const DI_W = 126;
const DI_H = 37;
const DI_X = (W - DI_W) / 2;
const DI_Y = SY + 11;
const DI_R = DI_H / 2;

const CALL_W = 188;
const CALL_X = (W - CALL_W) / 2;

const MI_W = 392;
const MI_X = (W - MI_W) / 2;
const MI_H = 152;
const MI_MORPH =
    'left 0.42s cubic-bezier(0.32,0.72,0,1), width 0.42s cubic-bezier(0.32,0.72,0,1), ' +
    'height 0.42s cubic-bezier(0.32,0.72,0,1), border-radius 0.42s cubic-bezier(0.32,0.72,0,1)';

const MIP_W = 180;
const MIP_X = (W - MIP_W) / 2;

const GID = 'ip17-pm-bt';


function rrect(x: number, y: number, w: number, h: number, r: number): string {
    const rc = Math.min(r, w / 2, h / 2);
    return (
        `M${x + rc},${y} ` +
        `H${x + w - rc} A${rc},${rc} 0 0 1 ${x + w},${y + rc} ` +
        `V${y + h - rc} A${rc},${rc} 0 0 1 ${x + w - rc},${y + h} ` +
        `H${x + rc} A${rc},${rc} 0 0 1 ${x},${y + h - rc} ` +
        `V${y + rc} A${rc},${rc} 0 0 1 ${x + rc},${y} Z`
    );
}

const CUTOUT_INSET = 2.5;
const BEZEL = rrect(0, 0, W, H, BR) + ' ' + rrect(
    SX + CUTOUT_INSET,
    SY + CUTOUT_INSET,
    SW - CUTOUT_INSET * 2,
    SH - CUTOUT_INSET * 2,
    SR - CUTOUT_INSET,
);

const BTN_W  = 3.5;
const BTN_RX = 1.75;

const BUTTONS = [
    { x: -BTN_W, y: 174, h: 38 },
    { x: -BTN_W, y: 252, h: 64 },
    { x: -BTN_W, y: 346, h: 64 },
    { x: W,      y: 217, h: 80 },
    { x: W,      y: 566, h: 60 },
] as const;


const ALIGN_MAP: Record<string, string> = {
    'top-left':      'items-start  justify-start',
    'top-center':    'items-start  justify-center',
    'top-right':     'items-start  justify-end',
    'middle-left':   'items-center justify-start',
    'middle-center': 'items-center justify-center',
    'middle-right':  'items-center justify-end',
    'bottom-left':   'items-end    justify-start',
    'bottom-center': 'items-end    justify-center',
    'bottom-right':  'items-end    justify-end',
};

const EDGE_PADDING = 24;

function enterKeyframe(align: PhoneAlign): string {
    if (align.startsWith('bottom')) return 'phone-in-bottom';
    if (align.startsWith('top'))    return 'phone-in-top';
    if (align === 'middle-left')    return 'phone-in-left';
    if (align === 'middle-right')   return 'phone-in-right';
    return 'phone-in-center';
}

function exitKeyframe(align: PhoneAlign): string {
    if (align.startsWith('bottom')) return 'phone-out-bottom';
    if (align.startsWith('top'))    return 'phone-out-top';
    if (align === 'middle-left')    return 'phone-out-left';
    if (align === 'middle-right')   return 'phone-out-right';
    return 'phone-out-center';
}

function peekAlign(align: PhoneAlign): PhoneAlign {
    return align === 'bottom-left' || align === 'bottom-center' || align === 'bottom-right'
        ? align : 'bottom-right';
}

export interface PhoneShellProps {
    children: ReactNode;
    cameraActive?: boolean;
    entering?: boolean;
    leaving?: boolean;
    landscape?: boolean;
    peek?: 'in' | 'out';
    onClose?: () => void;
    radioIsland?: { on: boolean; standby: boolean; freq: number; onAir: boolean };
    alarmIsland?: { ringing: boolean; since: number };
    frameColor?: string;
}

const VOL_STEP = 100 / 16;

function IslandPill({ active, onClick, compactX, compactW, expandedX, expandedW, children }: {
    active:    boolean;
    onClick?:  () => void;
    compactX:  number; compactW: number;
    expandedX: number; expandedW: number;
    children:  ReactNode;
}) {
    const [render, setRender] = useState(active);
    const [open,   setOpen]   = useState(active);

    useEffect(() => {
        if (active) {
            setRender(true);
            const t = window.setTimeout(() => setOpen(true), 20);
            return () => window.clearTimeout(t);
        }
        setOpen(false);
        const t = window.setTimeout(() => setRender(false), 440);
        return () => window.clearTimeout(t);
    }, [active]);

    if (!render) return null;
    return (
        <div
            onClick={onClick}
            className={`absolute z-[300] ${onClick ? 'cursor-pointer' : ''}`}
            style={{
                left: open ? expandedX : compactX,
                top: DI_Y,
                width: open ? expandedW : compactW,
                height: DI_H, borderRadius: DI_R, background: '#000',
                transition: 'left 0.42s cubic-bezier(0.32,0.72,0,1), width 0.42s cubic-bezier(0.32,0.72,0,1)',
            }}
        >
            <div
                className="absolute inset-0"
                style={{ opacity: open ? 1 : 0, transition: open ? 'opacity 0.22s ease 0.12s' : 'opacity 0.16s ease' }}
            >
                {children}
            </div>
        </div>
    );
}

function MusicIsland({ track, playing, expanded, closing, onToggle, onPlayPause, onNext, onPrev, onOpenApp }: {
    track:       Track;
    playing:     boolean;
    expanded:    boolean;
    closing:     boolean;
    onToggle:    () => void;
    onPlayPause: () => void;
    onNext:      () => void;
    onPrev:      () => void;
    onOpenApp:   () => void;
}) {
    const vid   = youtubeId(track.url);
    const thumb = vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : null;
    const artBg = coverGradient(track.id + track.title);
    const stop  = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

    const [appeared, setAppeared] = useState(false);
    useEffect(() => {
        const t = window.setTimeout(() => setAppeared(true), 20);
        return () => window.clearTimeout(t);
    }, []);

    const phase = closing ? 'di' : expanded ? 'card' : appeared ? 'pill' : 'di';
    const box =
        phase === 'card' ? { left: MI_X,  width: MI_W,  height: MI_H,  radius: 38 }
      : phase === 'pill' ? { left: MIP_X, width: MIP_W, height: DI_H,  radius: DI_R }
      :                    { left: DI_X,  width: DI_W,  height: DI_H,  radius: DI_R };

    return (
        <div
            onClick={onToggle}
            className="absolute z-[300] cursor-pointer overflow-hidden"
            style={{
                left: box.left, top: DI_Y, width: box.width, height: box.height,
                borderRadius: box.radius, background: '#000', transition: MI_MORPH,
            }}
        >
            <div
                className="absolute inset-0"
                style={{
                    opacity: phase === 'pill' ? 1 : 0,
                    transition: phase === 'pill' ? 'opacity 0.2s ease 0.1s' : 'opacity 0.12s ease',
                    pointerEvents: 'none',
                }}
            >
                <span
                    className="absolute flex items-center justify-center overflow-hidden"
                    style={{ left: 8, top: '50%', transform: 'translateY(-50%)', width: 27, height: 27, borderRadius: 7, background: artBg }}
                >
                    {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : null}
                </span>
                <span className="absolute flex items-end gap-[2.5px]" style={{ right: 14, top: '50%', transform: 'translateY(-50%)', height: 13 }}>
                    {[0, 1, 2, 3].map(i => (
                        <span
                            key={i}
                            style={{
                                width: 2.5, height: 13, borderRadius: 1.5, background: '#1DB954',
                                transformOrigin: 'bottom',
                                animation: playing ? `eq-bounce 0.62s ease-in-out ${i * 0.13}s infinite` : 'none',
                                transform: playing ? undefined : 'scaleY(0.35)',
                            }}
                        />
                    ))}
                </span>
            </div>

            <div
                className="absolute inset-0 flex flex-col px-5 pb-[30px] pt-[18px]"
                style={{
                    opacity: expanded ? 1 : 0,
                    transition: expanded ? 'opacity 0.22s ease 0.12s' : 'opacity 0.12s ease',
                    pointerEvents: expanded ? 'auto' : 'none',
                }}
            >
                <button type="button" onClick={stop(onOpenApp)} className="flex items-center gap-3 text-left">
                    <span
                        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[12px]"
                        style={{ background: artBg }}
                    >
                        {thumb
                            ? <img src={thumb} alt="" className="h-full w-full object-cover" />
                            : <Music2 className="h-6 w-6 text-white/85" strokeWidth={1.6} />}
                    </span>
                    <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-[17px] font-semibold text-white">{track.title}</span>
                        <span className="truncate text-[14px] text-white/55">{track.artist}</span>
                    </span>
                </button>

                <div className="mt-auto flex items-center justify-center gap-12 text-white">
                    <button type="button" aria-label={t('shell.previous','Previous')} onClick={stop(onPrev)} className="active:opacity-60">
                        <SkipBack className="h-[34px] w-[34px] fill-current" />
                    </button>
                    <button type="button" aria-label={t('shell.playPause','Play/Pause')} onClick={stop(onPlayPause)} className="active:opacity-60">
                        {playing
                            ? <Pause className="h-[42px] w-[42px] fill-current" />
                            : <Play  className="h-[42px] w-[42px] fill-current" />}
                    </button>
                    <button type="button" aria-label={t('shell.next','Next')} onClick={stop(onNext)} className="active:opacity-60">
                        <SkipForward className="h-[34px] w-[34px] fill-current" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export function PhoneShell({ children, cameraActive = false, entering = false, leaving = false, landscape = false, peek, onClose, radioIsland, alarmIsland, frameColor = DEFAULT_FRAME_COLOR }: PhoneShellProps) {
    const rail = frameStops(frameColor);
    const { brightness, phoneScale, phoneAlign, ringtoneVol, setRingtoneVol } = useTheme('brightness', 'phoneScale', 'phoneAlign', 'ringtoneVol', 'setRingtoneVol');
    const { current: nowPlaying, playing: musicPlaying, volume: musicVolume, setVolume: setMusicVolume, requestOpen: openMusic, toggle: toggleMusic, next: nextMusic, prev: prevMusic } = useMusic();

    const [musicExpanded, setMusicExpanded] = useState(false);

    const callActive    = useCallStore(s => s.phase !== null);
    const callStartedAt = useCallStore(s => s.startedAt);

    const radioOn      = radioIsland?.on      ?? false;
    const radioStandby = radioIsland?.standby ?? false;
    const radioFreq    = radioIsland?.freq    ?? 0;
    const radioOnAir   = radioIsland?.onAir   ?? false;

    const alarmRinging = alarmIsland?.ringing ?? false;

    const [flashing, setFlashing] = useState(false);
    const capturingRef = useRef(false);
    const takeScreenshot = useCallback(async () => {
        if (capturingRef.current) return;
        const el = document.querySelector('[data-phone-screen]') as HTMLElement | null;
        if (!el) return;
        capturingRef.current = true;
        setFlashing(true);
        playShutter(ringtoneVol);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const canvas = await html2canvas(el, {
                backgroundColor: '#000',
                scale: 2,
                useCORS: true,
                logging: false,
                ignoreElements: (n) => (n as HTMLElement).dataset?.screenshotFlash === '1',
            });
            const image = canvas.toDataURL('image/jpeg', 0.92);
            await fetchNui('sd-phone:camera:capture', { image });
        } catch {
            /* capture failed — silently ignore */
        } finally {
            window.setTimeout(() => setFlashing(false), 460);
            capturingRef.current = false;
        }
    }, [ringtoneVol]);
    const alarmSince   = alarmIsland?.since   ?? 0;

    useEffect(() => {
        if (!nowPlaying || callActive || radioOn || radioStandby || alarmRinging) setMusicExpanded(false);
    }, [nowPlaying, callActive, radioOn, radioStandby, alarmRinging]);

    const [rendered, setRendered]         = useState<Track | null>(nowPlaying);
    const [islandClosing, setIslandClosing] = useState(false);
    useEffect(() => {
        if (nowPlaying) { setRendered(nowPlaying); setIslandClosing(false); return; }
        if (rendered) {
            setIslandClosing(true);
            const t = window.setTimeout(() => { setRendered(null); setIslandClosing(false); }, 460);
            return () => window.clearTimeout(t);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nowPlaying]);
    const islandTrack = rendered;

    const bumpVolume = (dir: 1 | -1) => {
        if (nowPlaying) {
            setMusicVolume(Math.max(0, Math.min(1, musicVolume + dir * (VOL_STEP / 100))));
        } else {
            setRingtoneVol(Math.max(0, Math.min(100, Math.round(ringtoneVol + dir * VOL_STEP))));
        }
    };

    const motionAnimation = peek === 'out'
        ? 'phone-peek-out 0.42s cubic-bezier(0.4, 0, 0.7, 1) forwards'
        : peek === 'in'
        ? 'phone-peek-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        : leaving
        ? `${exitKeyframe(phoneAlign)} 0.42s cubic-bezier(0.4, 0, 0.7, 1) both`
        : entering
        ? `${enterKeyframe(phoneAlign)} 0.52s cubic-bezier(0.16, 1, 0.3, 1) both`
        : undefined;

    const dimOpacity = (1 - brightness / 100) * 0.85;

    const scale = 0.4 + (phoneScale / 100) * 0.6;

    const stageH = Math.round(H);
    const effectiveAlign = peek ? peekAlign(phoneAlign) : phoneAlign;
    const flexClasses = ALIGN_MAP[effectiveAlign] ?? ALIGN_MAP['bottom-right'];

    const align = phoneAlign ?? 'bottom-right';
    const reanchor = (H - W) / 2;
    const shiftX = align.includes('right') ? -reanchor : align.includes('left') ? reanchor : 0;
    const shiftY = align.includes('bottom') ? reanchor : align.includes('top') ? -reanchor : 0;
    const landscapeTransform = `translate(${shiftX}px, ${shiftY}px) rotate(-90deg)`;

    return (
        <div
            className={`flex h-screen w-full ${flexClasses}`}
            style={{ padding: EDGE_PADDING }}
        >
            <div
                className="relative shrink-0"
                style={{
                    width:  W,
                    height: stageH,
                    zoom: scale,
                    animation: motionAnimation,
                    transform: !motionAnimation && landscape ? landscapeTransform : undefined,
                    transformOrigin: 'center',
                    transition: motionAnimation ? undefined : 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                <div
                    data-phone-screen
                    className="absolute overflow-hidden"
                    style={{
                        left: SX, top: SY, width: SW, height: SH,
                        borderRadius: SR,
                        clipPath: `inset(0 round ${SR}px)`,
                        WebkitClipPath: `inset(0 round ${SR}px)`,
                        WebkitMaskImage: SCREEN_MASK,
                        maskImage: SCREEN_MASK,
                        WebkitMaskSize: '100% 100%',
                        maskSize: '100% 100%',
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                    }}
                >
                    {!cameraActive && (
                        <div className="absolute inset-0" style={{ background: '#000', borderRadius: SR }} />
                    )}

                    {children}

                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{ background: '#000', opacity: dimOpacity, zIndex: 9999, borderRadius: SR }}
                    />

                    {flashing && (
                        <div
                            data-screenshot-flash="1"
                            className="pointer-events-none absolute inset-0 animate-screenshot-flash"
                            style={{ background: '#fff', zIndex: 10000, borderRadius: SR }}
                        />
                    )}
                </div>

                <svg
                    width={W}
                    height={stageH}
                    viewBox={`0 0 ${W} ${stageH}`}
                    aria-hidden
                    className="pointer-events-none absolute inset-0 select-none"
                    style={{ overflow: 'visible', zIndex: 200 }}
                >
                    <defs>
                        <linearGradient id={GID} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%"    stopColor={rail.s0} />
                            <stop offset="20%"   stopColor={rail.s20} />
                            <stop offset="45%"   stopColor={rail.s45} />
                            <stop offset="68%"   stopColor={rail.s68} />
                            <stop offset="100%"  stopColor={rail.s100} />
                        </linearGradient>

                        <linearGradient id={`${GID}-sheen`} x1="0%" y1="0%" x2="60%" y2="100%">
                            <stop offset="0%"   stopColor="rgba(255,255,255,0.10)" />
                            <stop offset="40%"  stopColor="rgba(255,255,255,0.03)" />
                            <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
                        </linearGradient>
                    </defs>

                    <path d={BEZEL} fill={`url(#${GID})`}      fillRule="evenodd" />
                    <path d={BEZEL} fill={`url(#${GID}-sheen)`} fillRule="evenodd" />

                    <path
                        d={rrect(0.5, 0.5, W - 1, stageH - 1, BR)}
                        fill="none"
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="0.75"
                    />

                    <path
                        d={rrect(SX - 0.5, SY - 0.5, SW + 1, SH + 1, SR + 0.5)}
                        fill="none"
                        stroke="rgba(0,0,0,0.70)"
                        strokeWidth="1.5"
                    />

                    <rect
                        x={DI_X} y={DI_Y}
                        width={DI_W} height={DI_H}
                        rx={DI_R}
                        fill="#000"
                    />
                    <circle cx={DI_X + DI_W - DI_R * 1.12} cy={DI_Y + DI_H / 2} r={7}   fill="#0c0c14" />
                    <circle cx={DI_X + DI_W - DI_R * 1.12} cy={DI_Y + DI_H / 2} r={4}   fill="#07070f" />
                    <circle cx={DI_X + DI_W - DI_R * 1.12 - 1.5} cy={DI_Y + DI_H / 2 - 2} r={1.5} fill="rgba(255,255,255,0.18)" />

                    {cameraActive && (() => {
                        const dotCx = DI_X + DI_W - DI_R * 2.5;
                        const dotCy = DI_Y + DI_H / 2;
                        return (
                            <>
                                <circle cx={dotCx} cy={dotCy} r={7}   fill="rgba(48,209,88,0.18)" />
                                <circle cx={dotCx} cy={dotCy} r={3.6} fill="#30D158" />
                            </>
                        );
                    })()}

                    {BUTTONS.map((btn, i) => (
                        <g key={i}>
                            <rect
                                x={btn.x} y={btn.y}
                                width={BTN_W} height={btn.h}
                                rx={BTN_RX}
                                fill={`url(#${GID})`}
                            />
                            <rect
                                x={btn.x} y={btn.y}
                                width={BTN_W} height={4}
                                rx={BTN_RX}
                                fill="rgba(255,255,255,0.22)"
                            />
                            <rect
                                x={btn.x} y={btn.y + btn.h - 4}
                                width={BTN_W} height={4}
                                rx={BTN_RX}
                                fill="rgba(0,0,0,0.30)"
                            />
                        </g>
                    ))}
                </svg>

                <button
                    type="button"
                    aria-label={t('shell.volumeUp','Volume up')}
                    onClick={() => bumpVolume(1)}
                    className="absolute z-[300] cursor-pointer bg-transparent"
                    style={{ left: BUTTONS[1].x - 6, top: BUTTONS[1].y, width: 16, height: BUTTONS[1].h }}
                />
                <button
                    type="button"
                    aria-label={t('shell.volumeDown','Volume down')}
                    onClick={() => bumpVolume(-1)}
                    className="absolute z-[300] cursor-pointer bg-transparent"
                    style={{ left: BUTTONS[2].x - 6, top: BUTTONS[2].y, width: 16, height: BUTTONS[2].h }}
                />

                {onClose && (
                    <button
                        type="button"
                        aria-label={t('shell.power','Power')}
                        onClick={onClose}
                        className="absolute z-[300] cursor-pointer bg-transparent"
                        style={{ left: BUTTONS[3].x - 8, top: BUTTONS[3].y, width: 16, height: BUTTONS[3].h }}
                    />
                )}

                <button
                    type="button"
                    aria-label={t('shell.screenshot','Screenshot (double-click the Action button)')}
                    onDoubleClick={() => void takeScreenshot()}
                    className="absolute z-[300] cursor-pointer bg-transparent"
                    style={{ left: BUTTONS[0].x - 6, top: BUTTONS[0].y, width: 16, height: BUTTONS[0].h }}
                />

                {islandTrack && !callActive && !radioOn && !radioStandby && !alarmRinging && (
                    <MusicIsland
                        track={islandTrack}
                        playing={musicPlaying}
                        expanded={musicExpanded}
                        closing={islandClosing}
                        onToggle={() => setMusicExpanded(v => !v)}
                        onPlayPause={toggleMusic}
                        onNext={nextMusic}
                        onPrev={prevMusic}
                        onOpenApp={() => { setMusicExpanded(false); openMusic(); }}
                    />
                )}

                <IslandPill
                    active={callActive}
                    onClick={() => void fetchNui('sd-phone:requestOpen')}
                    compactX={DI_X} compactW={DI_W} expandedX={CALL_X} expandedW={CALL_W}
                >
                    <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                        <Phone className="h-[14px] w-[14px]" style={{ color: '#30D158' }} fill="currentColor" strokeWidth={0} />
                        <span className="text-[13px] font-semibold tabular-nums" style={{ color: '#30D158' }}>
                            {callStartedAt ? <RingDuration since={callStartedAt} /> : t('shell.mobile','Mobile')}
                        </span>
                    </span>
                </IslandPill>

                <IslandPill
                    active={(radioOn || radioStandby) && !callActive && !alarmRinging}
                    onClick={() => { if (radioOn) void fetchNui('sd-phone:radio:leave'); else void fetchNui('sd-phone:radio:set', { on: true }); }}
                    compactX={DI_X} compactW={DI_W} expandedX={CALL_X} expandedW={CALL_W}
                >
                    <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                        <Radio className={`h-[16px] w-[16px] ${radioOnAir ? 'animate-pulse' : ''}`} style={{ color: radioOn ? '#30D158' : '#FF453A', transition: 'color 0.2s ease' }} strokeWidth={2.4} />
                        <span className="text-[13px] font-semibold tabular-nums" style={{ color: radioOn ? '#30D158' : '#FF453A', transition: 'color 0.2s ease' }}>{radioFreq.toFixed(1)}</span>
                    </span>
                </IslandPill>

                <IslandPill
                    active={alarmRinging && !callActive}
                    compactX={DI_X} compactW={DI_W} expandedX={CALL_X} expandedW={CALL_W}
                >
                    <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                        <AlarmClock className="h-[15px] w-[15px]" style={{ color: '#FF9F0A' }} strokeWidth={2.5} />
                        <span className="text-[13px] font-semibold tabular-nums" style={{ color: '#FF9F0A' }}><RingDuration since={alarmSince} /></span>
                    </span>
                </IslandPill>

                <span
                    className="pointer-events-none absolute z-[320] rounded-full"
                    style={{ left: DI_X + DI_W - DI_R * 1.12 - 7, top: DI_Y + DI_H / 2 - 7, width: 14, height: 14, background: '#0c0c14' }}
                >
                    <span className="absolute rounded-full" style={{ left: 3, top: 3, width: 8, height: 8, background: '#07070f' }} />
                    <span className="absolute rounded-full" style={{ left: 2.5, top: 1.5, width: 3, height: 3, background: 'rgba(255,255,255,0.18)' }} />
                </span>
            </div>
        </div>
    );
}
