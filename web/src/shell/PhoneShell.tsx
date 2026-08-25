import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlarmClock, Music2, Pause, Phone, Play, Radio, SkipBack, SkipForward } from 'lucide-react';

import { device } from '@device';
import { useTheme } from '@/stores/themeStore';
import type { PhoneAlign } from '@/stores/themeStore';
import { useCallStore } from '@/stores/callStore';
import { useBatteryStore } from '@/stores/batteryStore';
import { IslandPet } from './IslandPet';
import { fetchNui } from '@/core/nui';
import { useMusic } from '@/apps/music/MusicContext';
import { coverGradient, coverUrl } from '@/apps/music/data';
import type { Track } from '@/apps/music/data';
import { RingDuration } from '@/apps/clock/AlarmRinging';
import { playShutter } from '@/media/shutter';
import { SWITCHER_SCALE } from './AppSwitcher';
import { DEFAULT_FRAME_COLOR, frameHex, frameStops } from './frameColors';
import { BootSplash } from './BootSplash';
import { chassisMetrics, rrect } from './chassis';
import { tiltTransform } from './phoneTilt';
import type { OpenAnim } from './shellLook';
import type { ChassisMetrics, FacePart, RailButton } from './chassis';
import { shellFor } from './shells';
import { t } from '@/i18n';


const MI_MORPH =
    'left 0.42s cubic-bezier(0.32,0.72,0,1), width 0.42s cubic-bezier(0.32,0.72,0,1), ' +
    'height 0.42s cubic-bezier(0.32,0.72,0,1), border-radius 0.42s cubic-bezier(0.32,0.72,0,1)';

const GID = 'ip17-pm-bt';


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

function enterKeyframe(align: PhoneAlign, anim: OpenAnim): string {
    if (anim !== 'slide')           return `phone-in-${anim}`;
    if (align.startsWith('bottom')) return 'phone-in-bottom';
    if (align.startsWith('top'))    return 'phone-in-top';
    if (align === 'middle-left')    return 'phone-in-left';
    if (align === 'middle-right')   return 'phone-in-right';
    return 'phone-in-center';
}

function exitKeyframe(align: PhoneAlign, anim: OpenAnim): string {
    if (anim !== 'slide')           return `phone-out-${anim}`;
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
    hidden?: boolean;
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

function IslandPill({ m, active, onClick, compactX, compactW, expandedX, expandedW, children }: {
    m:         ChassisMetrics;
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
                top: m.DI_Y,
                width: open ? expandedW : compactW,
                height: m.DI_H, borderRadius: m.DI_R, background: '#000',
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

function MusicIsland({ m, track, playing, expanded, closing, onToggle, onPlayPause, onNext, onPrev, onOpenApp }: {
    m:           ChassisMetrics;
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
    const thumb = coverUrl(track);
    const artBg = coverGradient(track.id + track.title);
    const stop  = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

    const [appeared, setAppeared] = useState(false);
    useEffect(() => {
        const t = window.setTimeout(() => setAppeared(true), 20);
        return () => window.clearTimeout(t);
    }, []);

    const phase = closing ? 'di' : expanded ? 'card' : appeared ? 'pill' : 'di';
    const box =
        phase === 'card' ? { left: m.MI_X,  width: m.MI_W,  height: m.MI_H,  radius: 38 }
      : phase === 'pill' ? { left: m.MIP_X, width: m.MIP_W, height: m.DI_H,  radius: m.DI_R }
      :                    { left: m.DI_X,  width: m.DI_W,  height: m.DI_H,  radius: m.DI_R };

    return (
        <div
            onClick={onToggle}
            className="absolute z-[300] cursor-pointer overflow-hidden"
            style={{
                left: box.left, top: m.DI_Y, width: box.width, height: box.height,
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

function Lens({ cx, cy, r }: { cx: number; cy: number; r: number }) {
    return (
        <>
            <circle cx={cx} cy={cy} r={r}        fill="#0c0c14" />
            <circle cx={cx} cy={cy} r={r * 0.57} fill="#07070f" />
            <circle cx={cx - r * 0.21} cy={cy - r * 0.29} r={r * 0.21} fill="rgba(255,255,255,0.18)" />
        </>
    );
}

function FaceShape({ part, index, m }: { part: FacePart; index: number; m: ChassisMetrics }) {
    if (part.t === 'slot') {
        if (part.style === 'slits') {
            const run = (part.w - part.bars * part.pitchX) / 2;
            return (
                <g>
                    {Array.from({ length: part.bars }, (_, i) => (
                        <rect
                            key={i}
                            x={part.x + run + i * part.pitchX + (part.pitchX - part.barW) / 2}
                            y={part.y}
                            width={part.barW}
                            height={part.h}
                            rx={part.barW / 2}
                            fill={part.color}
                        />
                    ))}
                </g>
            );
        }
        if (part.style === 'dots') {
            return (
                <rect
                    x={part.x}
                    y={part.y + (part.h - part.rows * part.pitchY) / 2}
                    width={part.cols * part.pitchX}
                    height={part.rows * part.pitchY}
                    fill={`url(#${GID}-perf-${index})`}
                />
            );
        }
        return <rect x={part.x} y={part.y} width={part.w} height={part.h} rx={part.r} fill={part.color} />;
    }

    if (part.t === 'dot') {
        if (part.kind === 'lens') return <Lens cx={part.cx} cy={part.cy} r={part.r} />;
        if (part.kind === 'led') {
            return (
                <>
                    <circle cx={part.cx} cy={part.cy} r={part.r * 1.6} fill={part.color} opacity={0.18} />
                    <circle cx={part.cx} cy={part.cy} r={part.r} fill={part.color} />
                </>
            );
        }
        if (part.kind === 'screw') {
            return (
                <>
                    <circle cx={part.cx} cy={part.cy} r={part.r} fill={`url(#${GID})`} stroke="rgba(0,0,0,0.45)" strokeWidth={0.75} />
                    <rect x={part.cx - part.r * 0.62} y={part.cy - 0.5} width={part.r * 1.24} height={1} fill="rgba(0,0,0,0.5)" />
                    <rect x={part.cx - 0.5} y={part.cy - part.r * 0.62} width={1} height={part.r * 1.24} fill="rgba(0,0,0,0.5)" />
                </>
            );
        }
        return (
            <>
                <circle cx={part.cx} cy={part.cy} r={part.r}        fill={part.color} />
                <circle cx={part.cx} cy={part.cy} r={part.r * 0.57} fill="#07070f" />
            </>
        );
    }

    const gx = part.x + part.w / 2;
    const gy = part.y + part.h / 2;
    const gs = Math.min(part.w, part.h) * 0.45;
    return (
        <>
            <rect x={part.x} y={part.y} width={part.w} height={part.h} rx={part.r} fill={`url(#${GID})`} />
            <rect x={part.x} y={part.y} width={part.w} height={part.h} rx={part.r} fill="rgba(0,0,0,0.35)" />
            {part.ring > 0 && (
                <rect
                    x={part.x + part.ring / 2}
                    y={part.y + part.ring / 2}
                    width={part.w - part.ring}
                    height={part.h - part.ring}
                    rx={Math.max(0, part.r - part.ring / 2)}
                    fill="none"
                    stroke={`url(#${GID})`}
                    strokeWidth={part.ring}
                />
            )}
            <rect
                x={part.x + part.w * 0.2}
                y={part.y + part.h * 0.14}
                width={part.w * 0.6}
                height={1.5}
                rx={0.75}
                fill={`rgba(255,255,255,${m.FACE_LIGHT})`}
            />
            {part.glyph === 'square' && (
                <rect x={gx - gs / 2} y={gy - gs / 2} width={gs} height={gs} rx={gs * 0.22} fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth={2} />
            )}
            {part.glyph === 'dot' && <circle cx={gx} cy={gy} r={gs * 0.28} fill="rgba(255,255,255,0.32)" />}
        </>
    );
}

function RailKey({ btn, m }: { btn: RailButton; m: ChassisMetrics }) {
    const { x, y, h, w } = btn;
    const rx = w / 2;
    const fill = btn.accent ?? `url(#${GID})`;
    const cap  = `rgba(255,255,255,${m.FACE_LIGHT})`;
    const base = `rgba(0,0,0,${m.FACE_DARK})`;

    if (btn.style === 'inset') {
        return (
            <>
                <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} />
                <rect x={x} y={y} width={w} height={h} rx={rx} fill="rgba(0,0,0,0.35)" />
                <rect x={x} y={y} width={w} height={1} rx={0.5} fill={cap} />
                <rect x={x} y={y + h - 1} width={w} height={1} rx={0.5} fill="rgba(0,0,0,0.45)" />
            </>
        );
    }

    if (btn.style === 'ringed') {
        return (
            <>
                <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} />
                <rect
                    x={x + 0.75} y={y + 0.75}
                    width={Math.max(0, w - 1.5)} height={Math.max(0, h - 1.5)}
                    rx={Math.max(0, rx - 0.75)}
                    fill="none"
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth={1.5}
                />
                <rect x={x + w * 0.36} y={y + 2} width={Math.max(0.6, w * 0.28)} height={Math.max(0, h - 4)} rx={0.5} fill="rgba(255,255,255,0.35)" />
            </>
        );
    }

    if (btn.style === 'switch') {
        const nub = h * 0.34;
        const detent = btn.detent ?? 1;
        const ny = detent === 0 ? y : detent === 2 ? y + h - nub : y + (h - nub) / 2;
        return (
            <>
                <rect x={x} y={y} width={w} height={h} rx={rx} fill="rgba(0,0,0,0.5)" />
                {btn.accent && detent === 0 && (
                    <rect x={x} y={ny + nub} width={w} height={Math.max(0, h - nub)} rx={rx} fill={btn.accent} />
                )}
                <rect x={x} y={ny} width={w} height={nub} rx={rx} fill={`url(#${GID})`} />
                <rect x={x} y={ny} width={w} height={1.5} rx={0.75} fill={cap} />
            </>
        );
    }

    return (
        <>
            <rect x={x} y={y} width={w} height={h}     rx={rx} fill={fill} />
            <rect x={x} y={y} width={w} height={4}     rx={rx} fill={cap} />
            <rect x={x} y={y + h - 4} width={w} height={4} rx={rx} fill={base} />
            {btn.style === 'ridged' && [0.34, 0.5, 0.66].map(f => (
                <rect key={f} x={x} y={y + h * f} width={w} height={1} fill="rgba(0,0,0,0.30)" />
            ))}
        </>
    );
}

export function PhoneShell({ children, hidden = false, cameraActive = false, entering = false, leaving = false, landscape = false, peek, onClose, radioIsland, alarmIsland, frameColor = DEFAULT_FRAME_COLOR }: PhoneShellProps) {
    const { brightness, phoneScale, phoneAlign, phoneTilt, openAnim, ringtoneVol, setRingtoneVol, islandPet, shell } = useTheme('brightness', 'phoneScale', 'phoneAlign', 'phoneTilt', 'openAnim', 'ringtoneVol', 'setRingtoneVol', 'islandPet', 'shell');
    const m = useMemo(() => chassisMetrics(shellFor(shell, device.id)), [shell]);
    const {
        SW, SH, W, H, SX, SY, BR, SR, SCREEN_MASK, BEZEL, hostsIsland, hasCutout, pillInCutout,
        SCREEN_RRECT, OUTER_RRECT, softPatch,
        CUT_W, CUT_H, CUT_X, CUT_Y, CUT_R, CUT_PATH, CUT_LENS_X, CUT_COLLAR, CUT_OPTICS,
        DI_W, DI_H, DI_X, DI_Y, DI_R, MIP_X, PET_H, PET_TOP, petStage,
        CALL_W, CALL_X,
        FINISH, SHEEN_TOP, SHEEN_MID, EDGE_LIGHT,
        PLATE, RAIL_BAND, RIM_W, RIM_PATH, RIM_COLOR,
        FACE, AUTO_FOREHEAD, GLASS, GLASS_STRENGTH, MARKS, GRIPS, CAPS, CAP_COLOR,
        BUTTONS, VOL_UP_BTN, VOL_DOWN_BTN, POWER_BTN, SCREENSHOT_BTN,
    } = m;
    const rail = frameStops(frameColor, FINISH);
    const batteryLevel = useBatteryStore(s => s.level);
    const { current: nowPlaying, playing: musicPlaying, volume: musicVolume, setVolume: setMusicVolume, requestOpen: openMusic, toggle: toggleMusic, next: nextMusic, prev: prevMusic } = useMusic();

    const [musicExpanded, setMusicExpanded] = useState(false);

    const callActive    = useCallStore(s => s.phase !== null);
    const callRinging   = useCallStore(s => s.phase === 'incoming' || s.phase === 'outgoing');
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

    const petStageNow =
        callActive || radioOn || radioStandby || alarmRinging ? petStage(CALL_X + 76)
        : islandTrack ? (musicExpanded || islandClosing ? null : petStage(MIP_X + 41))
        : petStage(DI_X + 9);

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
        ? `${exitKeyframe(phoneAlign, openAnim)} 0.42s cubic-bezier(0.4, 0, 0.7, 1) both`
        : entering
        ? `${enterKeyframe(phoneAlign, openAnim)} 0.52s cubic-bezier(0.16, 1, 0.3, 1) both`
        : undefined;

    const dimOpacity = (1 - brightness / 100) * 0.85;

    const scale = 0.4 + (phoneScale / 100) * 0.6;
    const tilt  = tiltTransform(phoneTilt, H);

    const stageH = Math.round(H);
    const effectiveAlign = peek ? peekAlign(phoneAlign) : phoneAlign;
    const flexClasses = ALIGN_MAP[effectiveAlign] ?? ALIGN_MAP['bottom-right'];

    const align = phoneAlign ?? 'bottom-right';
    const reanchor = (H - W) / 2;
    const shiftX = align.includes('right') ? -reanchor : align.includes('left') ? reanchor : 0;
    const shiftY = align.includes('bottom') ? reanchor : align.includes('top') ? -reanchor : 0;
    // A device that is already wider than it is tall has nothing to rotate into: turning it would
    // stand a landscape tablet on its end. The reanchor shifts would be backwards there too.
    const nativeLandscape = SW > SH;
    const landscapeTransform = nativeLandscape
        ? undefined
        : `translate(${shiftX}px, ${shiftY}px) rotate(-90deg)`;

    return (
        <div
            className={`flex h-screen w-full ${flexClasses}`}
            style={{ padding: EDGE_PADDING, display: hidden ? 'none' : undefined }}
        >
            <div
                className="shrink-0"
                style={{
                    transform:       tilt,
                    transformOrigin: 'center',
                    transition:      'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                <div
                    className="relative shrink-0"
                    style={{
                        width:  W,
                        height: stageH,
                        zoom: scale,
                        ...({ '--hairline-w': `${1 / scale}px` } as React.CSSProperties),
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
                            overflow: 'clip',
                            borderRadius: SR,
                            clipPath: `inset(0 round ${SR}px)`,
                            WebkitClipPath: `inset(0 round ${SR}px)`,
                            WebkitMaskImage: SCREEN_MASK,
                            maskImage: SCREEN_MASK,
                            WebkitMaskSize: '100% 100%',
                            maskSize: '100% 100%',
                            WebkitMaskRepeat: 'no-repeat',
                            maskRepeat: 'no-repeat',
                            // The switcher's card scale, for index.css's ios-app-expand. The deck
                            // re-parents the opening app's host into this screen, so the value
                            // inherits down to it - and unlike the switcher, this element stays.
                            ...({ '--switcher-scale': String(SWITCHER_SCALE) } as React.CSSProperties),
                        }}
                    >
                        {!cameraActive && (
                            <div className="absolute inset-0" style={{ background: '#000', borderRadius: SR }} />
                        )}

                        {children}

                        <BootSplash radius={SR} tint={frameHex(frameColor)} />

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
                                <stop offset="0%"   stopColor={`rgba(255,255,255,${SHEEN_TOP})`} />
                                <stop offset="40%"  stopColor={`rgba(255,255,255,${SHEEN_MID})`} />
                                <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
                            </linearGradient>

                            <clipPath id={`${GID}-screen`}>
                                <path d={SCREEN_RRECT} />
                            </clipPath>

                            {CAPS.length > 0 && (
                                <clipPath id={`${GID}-outer`}>
                                    <path d={OUTER_RRECT} />
                                </clipPath>
                            )}

                            {RIM_PATH && (
                                <linearGradient id={`${GID}-rim`} x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%"   stopColor="rgba(255,255,255,0.35)" />
                                    <stop offset="100%" stopColor="rgba(0,0,0,0.35)" />
                                </linearGradient>
                            )}

                            {GLASS.map(band => (
                                <linearGradient
                                    key={band.dir}
                                    id={`${GID}-glass-${band.dir}`}
                                    x1={band.dir === 'r' ? '100%' : '0%'}
                                    y1={band.dir === 'b' ? '100%' : '0%'}
                                    x2={band.dir === 'l' ? '100%' : '0%'}
                                    y2={band.dir === 't' ? '100%' : '0%'}
                                >
                                    <stop offset="0%"   stopColor="rgba(0,0,0,0.50)" />
                                    <stop offset="14%"  stopColor={`rgba(255,255,255,${GLASS_STRENGTH})`} />
                                    <stop offset="52%"  stopColor={`rgba(255,255,255,${GLASS_STRENGTH * 0.18})`} />
                                    <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                                </linearGradient>
                            ))}

                            {softPatch && (
                                <pattern id={`${GID}-udc`} width={3} height={3} patternUnits="userSpaceOnUse">
                                    <circle cx={1.5} cy={1.5} r={0.5} fill="rgba(255,255,255,0.05)" />
                                </pattern>
                            )}

                            {FACE.map((part, i) => part.t === 'slot' && part.style === 'dots' ? (
                                <pattern
                                    key={i}
                                    id={`${GID}-perf-${i}`}
                                    x={part.x}
                                    y={part.y + (part.h - part.rows * part.pitchY) / 2}
                                    width={part.pitchX}
                                    height={part.pitchY}
                                    patternUnits="userSpaceOnUse"
                                >
                                    <circle cx={part.pitchX / 2} cy={part.pitchY / 2} r={part.dotR} fill={part.color} />
                                </pattern>
                            ) : null)}
                        </defs>

                        <path d={BEZEL} fill={PLATE ?? `url(#${GID})`} fillRule="evenodd" />
                        {RAIL_BAND && <path d={RAIL_BAND} fill={`url(#${GID})`} fillRule="evenodd" />}
                        <path d={RAIL_BAND ?? BEZEL} fill={`url(#${GID}-sheen)`} fillRule="evenodd" />

                        {CAPS.length > 0 && CAP_COLOR && (
                            <g clipPath={`url(#${GID}-outer)`}>
                                {CAPS.map((cap, i) => (
                                    <g key={i}>
                                        <rect x={cap.x} y={cap.y} width={cap.run} height={cap.run} fill={CAP_COLOR} />
                                        <rect
                                            x={cap.x === 0 ? cap.run - 0.75 : cap.x}
                                            y={cap.y}
                                            width={0.75}
                                            height={cap.run}
                                            fill="rgba(0,0,0,0.35)"
                                        />
                                        <rect
                                            x={cap.x}
                                            y={cap.y === 0 ? cap.run - 0.75 : cap.y}
                                            width={cap.run}
                                            height={0.75}
                                            fill="rgba(0,0,0,0.35)"
                                        />
                                    </g>
                                ))}
                            </g>
                        )}

                        {MARKS.map((mark, i) => (
                            <g key={i}>
                                <rect x={mark.x} y={mark.y} width={mark.w} height={mark.h} fill="rgba(255,255,255,0.10)" />
                                <rect x={mark.x} y={mark.y} width={mark.w < mark.h ? 0.5 : mark.w} height={mark.w < mark.h ? mark.h : 0.5} fill="rgba(0,0,0,0.25)" />
                            </g>
                        ))}

                        {GRIPS.map((grip, i) => (
                            <g key={i}>
                                {Array.from({ length: grip.ticks }, (_, k) => {
                                    const ty = grip.y + (k + 0.5) * (grip.h / grip.ticks);
                                    return grip.style === 'hatch'
                                        ? <path key={k} d={`M${grip.x},${ty + 2} L${grip.x + grip.w},${ty - 2}`} stroke="rgba(0,0,0,0.22)" strokeWidth={1} />
                                        : <rect key={k} x={grip.x} y={ty - 1.5} width={grip.w} height={3} fill="rgba(0,0,0,0.22)" />;
                                })}
                            </g>
                        ))}

                        <path
                            d={rrect(0.5, 0.5, W - 1, stageH - 1, BR)}
                            fill="none"
                            stroke={`rgba(255,255,255,${EDGE_LIGHT})`}
                            strokeWidth="0.75"
                        />

                        {RIM_PATH && (
                            <path
                                d={RIM_PATH}
                                fill="none"
                                stroke={RIM_COLOR ?? `url(#${GID}-rim)`}
                                strokeWidth={RIM_W}
                            />
                        )}

                        {FACE.map((part, i) => <FaceShape key={i} part={part} index={i} m={m} />)}

                        <path
                            d={rrect(SX - 0.5, SY - 0.5, SW + 1, SH + 1, SR + 0.5)}
                            fill="none"
                            stroke="rgba(0,0,0,0.70)"
                            strokeWidth="1.5"
                        />

                        {hostsIsland && hasCutout && (() => {
                            const lensR = Math.min(7, CUT_H / 2 - 3);
                            const lensY = CUT_Y + CUT_H / 2;
                            const irS = Math.max(6, Math.min(22, CUT_H - 8));
                            return (
                                <>
                                    {CUT_COLLAR > 0 && (
                                        <>
                                            <rect
                                                x={CUT_X - CUT_COLLAR * 1.6} y={CUT_Y - CUT_COLLAR * 1.6}
                                                width={CUT_W + CUT_COLLAR * 3.2} height={CUT_H + CUT_COLLAR * 3.2}
                                                rx={CUT_R + CUT_COLLAR * 1.6}
                                                fill="rgba(0,0,0,0.55)"
                                            />
                                            <rect
                                                x={CUT_X - CUT_COLLAR / 2} y={CUT_Y - CUT_COLLAR / 2}
                                                width={CUT_W + CUT_COLLAR} height={CUT_H + CUT_COLLAR}
                                                rx={CUT_R + CUT_COLLAR / 2}
                                                fill="none"
                                                stroke={`url(#${GID})`}
                                                strokeWidth={CUT_COLLAR}
                                            />
                                            <path
                                                d={`M${CUT_X + CUT_R * 0.4},${CUT_Y - CUT_COLLAR / 2} A${CUT_R + CUT_COLLAR / 2},${CUT_R + CUT_COLLAR / 2} 0 0 0 ${CUT_X - CUT_COLLAR / 2 - CUT_R * 0.1},${CUT_Y + CUT_H * 0.45}`}
                                                fill="none"
                                                stroke="rgba(255,255,255,0.45)"
                                                strokeWidth={1}
                                            />
                                        </>
                                    )}

                                    {CUT_PATH
                                        ? <path d={CUT_PATH} fill="#000" />
                                        : (
                                            <rect
                                                x={CUT_X} y={CUT_Y}
                                                width={CUT_W} height={CUT_H}
                                                rx={CUT_R}
                                                fill="#000"
                                            />
                                        )}

                                    {CUT_OPTICS === 'lens' && <Lens cx={CUT_LENS_X} cy={lensY} r={lensR} />}

                                    {CUT_OPTICS === 'twin' && (
                                        <>
                                            <Lens cx={CUT_X + CUT_W / 3}     cy={lensY} r={lensR} />
                                            <Lens cx={CUT_X + CUT_W * 2 / 3} cy={lensY} r={lensR} />
                                        </>
                                    )}

                                    {CUT_OPTICS === 'lensIr' && (
                                        <>
                                            <Lens cx={CUT_X + CUT_W / 6} cy={lensY} r={lensR} />
                                            <rect
                                                x={CUT_X + CUT_W * 5 / 6 - irS / 2} y={lensY - irS / 2}
                                                width={irS} height={irS}
                                                rx={irS * 0.3}
                                                fill="#0a0a12"
                                            />
                                            <rect
                                                x={CUT_X + CUT_W * 5 / 6 - irS / 4} y={lensY - irS / 4}
                                                width={irS / 2} height={irS / 2}
                                                rx={irS * 0.16}
                                                fill="#12121c"
                                            />
                                        </>
                                    )}

                                    {cameraActive && (() => {
                                        const dotCx = Math.max(CUT_X - 14, CUT_X + CUT_W - CUT_R * 2.5);
                                        return (
                                            <>
                                                <circle cx={dotCx} cy={lensY} r={7}   fill="rgba(48,209,88,0.18)" />
                                                <circle cx={dotCx} cy={lensY} r={3.6} fill="#30D158" />
                                            </>
                                        );
                                    })()}
                                </>
                            );
                        })()}

                        {AUTO_FOREHEAD && (() => {
                            const camX = W / 2 - 70;
                            const camY = SY / 2;
                            const camR = Math.min(7, (SY - 6) / 2);
                            return (
                                <>
                                    <rect x={W / 2 - 42} y={camY - 2.5} width={84} height={5} rx={2.5} fill="rgba(0,0,0,0.55)" />
                                    <circle cx={camX} cy={camY} r={camR}        fill="#0c0c14" />
                                    <circle cx={camX} cy={camY} r={camR * 0.57} fill="#07070f" />
                                    <circle cx={camX - camR * 0.21} cy={camY - camR * 0.29} r={camR * 0.21} fill="rgba(255,255,255,0.18)" />
                                    <circle cx={W / 2 + 70} cy={camY} r={2.5} fill="rgba(0,0,0,0.6)" />

                                    {cameraActive && (
                                        <>
                                            <circle cx={camX - camR - 13} cy={camY} r={6}   fill="rgba(48,209,88,0.18)" />
                                            <circle cx={camX - camR - 13} cy={camY} r={3.2} fill="#30D158" />
                                        </>
                                    )}
                                </>
                            );
                        })()}

                        {softPatch && (
                            <>
                                <rect
                                    x={CUT_X} y={CUT_Y}
                                    width={CUT_W} height={CUT_H}
                                    rx={CUT_R}
                                    fill="rgba(255,255,255,0.045)"
                                    stroke="rgba(255,255,255,0.06)"
                                    strokeWidth={1}
                                />
                                <rect
                                    x={CUT_X} y={CUT_Y}
                                    width={CUT_W} height={CUT_H}
                                    rx={CUT_R}
                                    fill={`url(#${GID}-udc)`}
                                />
                            </>
                        )}

                        {GLASS.length > 0 && (
                            <g clipPath={`url(#${GID}-screen)`}>
                                {GLASS.map(band => (
                                    <rect
                                        key={band.dir}
                                        x={band.x} y={band.y}
                                        width={band.w} height={band.h}
                                        fill={`url(#${GID}-glass-${band.dir})`}
                                    />
                                ))}
                            </g>
                        )}

                        {BUTTONS.map((btn, i) => (
                            <g key={i}>
                                <RailKey btn={btn} m={m} />
                            </g>
                        ))}
                    </svg>

                    {VOL_UP_BTN && (
                        <button
                            type="button"
                            aria-label={t('shell.volumeUp','Volume up')}
                            onClick={() => bumpVolume(1)}
                            className="absolute z-[300] cursor-pointer bg-transparent"
                            style={{ left: VOL_UP_BTN.x - 6, top: VOL_UP_BTN.y, width: VOL_UP_BTN.w + 12, height: VOL_UP_BTN.h }}
                        />
                    )}
                    {VOL_DOWN_BTN && (
                        <button
                            type="button"
                            aria-label={t('shell.volumeDown','Volume down')}
                            onClick={() => bumpVolume(-1)}
                            className="absolute z-[300] cursor-pointer bg-transparent"
                            style={{ left: VOL_DOWN_BTN.x - 6, top: VOL_DOWN_BTN.y, width: VOL_DOWN_BTN.w + 12, height: VOL_DOWN_BTN.h }}
                        />
                    )}

                    {POWER_BTN && onClose && (
                        <button
                            type="button"
                            aria-label={t('shell.power','Power')}
                            onClick={onClose}
                            className="absolute z-[300] cursor-pointer bg-transparent"
                            style={{ left: POWER_BTN.x - 6, top: POWER_BTN.y, width: POWER_BTN.w + 12, height: POWER_BTN.h }}
                        />
                    )}

                    {SCREENSHOT_BTN && (
                        <button
                            type="button"
                            aria-label={t('shell.screenshot','Screenshot (double-click the Action button)')}
                            onDoubleClick={() => void takeScreenshot()}
                            className="absolute z-[300] cursor-pointer bg-transparent"
                            style={{ left: SCREENSHOT_BTN.x - 6, top: SCREENSHOT_BTN.y, width: SCREENSHOT_BTN.w + 12, height: SCREENSHOT_BTN.h }}
                        />
                    )}

                    {pillInCutout && islandPet !== 'none' && (
                        <IslandPet
                            id={islandPet}
                            stage={petStageNow}
                            top={PET_TOP}
                            height={PET_H}
                            battery={batteryLevel}
                            playing={musicPlaying && !musicExpanded}
                            ringing={callRinging || alarmRinging}
                        />
                    )}

                    {hostsIsland && islandTrack && !callActive && !radioOn && !radioStandby && !alarmRinging && (
                        <MusicIsland m={m}
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

                    {hostsIsland && device.calls && (
                        <IslandPill m={m}
                            active={callActive}
                            onClick={() => { useCallStore.getState().setMinimised(false); void fetchNui('sd-phone:requestOpen'); }}
                            compactX={DI_X} compactW={DI_W} expandedX={CALL_X} expandedW={CALL_W}
                        >
                            <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                                <Phone className="h-[14px] w-[14px]" style={{ color: '#30D158' }} fill="currentColor" strokeWidth={0} />
                                <span className="text-[13px] font-semibold tabular-nums" style={{ color: '#30D158' }}>
                                    {callStartedAt ? <RingDuration since={callStartedAt} /> : t('shell.mobile','Mobile')}
                                </span>
                            </span>
                        </IslandPill>
                    )}

                    {hostsIsland && (
                        <IslandPill m={m}
                            active={(radioOn || radioStandby) && !callActive && !alarmRinging}
                            onClick={() => { if (radioOn) void fetchNui('sd-phone:radio:leave'); else void fetchNui('sd-phone:radio:set', { on: true }); }}
                            compactX={DI_X} compactW={DI_W} expandedX={CALL_X} expandedW={CALL_W}
                        >
                            <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                                <Radio className={`h-[16px] w-[16px] ${radioOnAir ? 'animate-pulse' : ''}`} style={{ color: radioOn ? '#30D158' : '#FF453A', transition: 'color 0.2s ease' }} strokeWidth={2.4} />
                                <span className="text-[13px] font-semibold tabular-nums" style={{ color: radioOn ? '#30D158' : '#FF453A', transition: 'color 0.2s ease' }}>{radioFreq.toFixed(1)}</span>
                            </span>
                        </IslandPill>
                    )}

                    {hostsIsland && (
                        <IslandPill m={m}
                            active={alarmRinging && !callActive}
                            compactX={DI_X} compactW={DI_W} expandedX={CALL_X} expandedW={CALL_W}
                        >
                            <span className="absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                                <AlarmClock className="h-[15px] w-[15px]" style={{ color: '#FF9F0A' }} strokeWidth={2.5} />
                                <span className="text-[13px] font-semibold tabular-nums" style={{ color: '#FF9F0A' }}><RingDuration since={alarmSince} /></span>
                            </span>
                        </IslandPill>
                    )}

                    {hostsIsland && pillInCutout && (
                        <span
                            className="pointer-events-none absolute z-[320] rounded-full"
                            style={{ left: DI_X + DI_W - DI_R * 1.12 - 7, top: DI_Y + DI_H / 2 - 7, width: 14, height: 14, background: '#0c0c14' }}
                        >
                            <span className="absolute rounded-full" style={{ left: 3, top: 3, width: 8, height: 8, background: '#07070f' }} />
                            <span className="absolute rounded-full" style={{ left: 2.5, top: 1.5, width: 3, height: 3, background: 'rgba(255,255,255,0.18)' }} />
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
