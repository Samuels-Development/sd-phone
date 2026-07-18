import { useEffect, useRef, useState } from 'react';
import {
    BatteryLow, Camera, Contrast, Flashlight, Moon, Music, Pause, Plane, Play,
    SkipBack, SkipForward, Smartphone, Sun, Video, Volume2, VolumeX,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { fetchNui, isFiveM } from '@/core/nui';
import { setLaunchIntent } from '@/shell/launchIntent';
import { trackFraction } from '@/lib/zoom';
import { useTheme } from '@/stores/themeStore';
import { useMusic, useMusicProgress } from '@/apps/music/MusicContext';
import { coverGradient, youtubeId } from '@/apps/music/data';
import { t } from '@/i18n';

export function ControlCenter({ open, onClose, onOpenApp, onWifi }: {
    open: boolean;
    onClose: () => void;
    onOpenApp: (id: string) => void;
    onWifi?: (on: boolean) => void;
}) {
    const { theme, setTheme, brightness, setBrightness, ringtoneVol, setRingtoneVol, airplaneMode, setAirplaneMode } = useTheme('theme', 'setTheme', 'brightness', 'setBrightness', 'ringtoneVol', 'setRingtoneVol', 'airplaneMode', 'setAirplaneMode');
    const music = useMusic();

    const [flash, setFlash]       = useState(false);
    const [rotation, setRotation] = useState(false);
    const [focus, setFocus]       = useState(false);
    const [lowPower, setLowPower] = useState(false);

    useEffect(() => {
        if (open && isFiveM) void fetchNui<{ on: boolean }>('sd-phone:flashlight:state').then(r => setFlash(!!r?.on));
    }, [open]);

    function toggleAirplane() {
        const next = !airplaneMode;
        setAirplaneMode(next);
        onWifi?.(!next);
    }
    function toggleFlash() {
        setFlash(v => !v);
        void fetchNui<{ on: boolean }>('sd-phone:flashlight:toggle').then(r => {
            if (r && typeof r.on === 'boolean') setFlash(r.on);
        });
    }
    function launch(id: string, intent?: unknown) {
        if (intent !== undefined) setLaunchIntent(id, intent);
        onOpenApp(id);
        onClose();
    }

    const mediaMode = !!music.current;
    const volValue  = mediaMode ? Math.round(music.volume * 100) : ringtoneVol;
    const onVol     = mediaMode ? (v: number) => music.setVolume(v / 100) : setRingtoneVol;

    const EASE = 'cubic-bezier(0.32,0.72,0,1)';
    return (
        <div className={'absolute inset-0 z-[700] ' + (open ? '' : 'pointer-events-none')}>
            <div
                className="absolute inset-0"
                style={{
                    backdropFilter: open ? 'blur(30px)' : 'blur(0px)',
                    WebkitBackdropFilter: open ? 'blur(30px)' : 'blur(0px)',
                    transition: `backdrop-filter 420ms ${EASE}, -webkit-backdrop-filter 420ms ${EASE}`,
                }}
            />
            <div
                className="absolute inset-0 bg-black/45"
                style={{ opacity: open ? 1 : 0, transition: `opacity 420ms ${EASE}` }}
                onClick={onClose}
            />

            <div
                className="absolute inset-0 overflow-y-auto px-3"
                style={{
                    paddingTop: 'calc(var(--safe-top) + 30px)',
                    paddingBottom: 'calc(var(--safe-bottom) + 16px)',
                    transform: open ? 'translateY(0)' : 'translateY(-10px)',
                    opacity: open ? 1 : 0,
                    transition: `transform 420ms ${EASE}, opacity 380ms ${EASE}`,
                }}
                onClick={onClose}
            >
                <div className="mx-auto flex max-w-[392px] flex-col gap-[18px]" onClick={e => e.stopPropagation()}>
                    <NowPlaying music={music} />

                    <HSlider value={volValue} onChange={onVol} icon={volValue <= 0 ? VolumeX : Volume2} label={t('shell.volume','Volume')} />
                    <HSlider value={brightness} onChange={setBrightness} icon={Sun} label={t('shell.brightness','Brightness')} />

                    <div className="rounded-[36px] bg-white/[0.10] p-[22px]">
                        <div className="grid grid-cols-4 justify-items-center gap-y-[22px]">
                            <Circle icon={Plane}      on={airplaneMode}    onClick={toggleAirplane}                color="#ff9f0a"                 label={t('shell.airplaneMode','Airplane Mode')} />
                            <Circle icon={Video}                            onClick={() => launch('camera', { mode: 'VIDEO' })}                    label={t('shell.record','Record')} />
                            <Circle icon={Flashlight} on={flash}           onClick={toggleFlash}                   color="#ffffff" glyph="#1c1c1e" label={t('shell.flashlight','Flashlight')} />
                            <Circle icon={Moon}       on={focus}           onClick={() => setFocus(v => !v)}       color="#5e5ce6"                 label={t('shell.focus','Focus')} />
                            <Circle icon={Camera}                           onClick={() => launch('camera', { mode: 'PHOTO' })}                    label={t('shell.camera','Camera')} />
                            <Circle icon={BatteryLow} on={lowPower}        onClick={() => setLowPower(v => !v)}    color="#ffd60a" glyph="#1c1c1e" label={t('shell.lowPowerMode','Low Power Mode')} />
                            <Circle icon={Contrast}   on={theme === 'dark'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} color="#5e5ce6" label={t('shell.darkMode','Dark Mode')} />
                            <Circle icon={Smartphone} on={rotation}        onClick={() => setRotation(v => !v)}    color="#ff453a"                 label={t('shell.rotationLock','Rotation Lock')} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function NowPlaying({ music }: { music: ReturnType<typeof useMusic> }) {
    const { time, duration } = useMusicProgress();
    const track = music.current;
    const pct = track && duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
    const vid = track ? youtubeId(track.url) : null;
    const img = vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : null;
    return (
        <div className="rounded-[28px] bg-white/[0.14] px-5 py-[26px]">
            <div className="flex items-center gap-4">
                <div className="grid h-[64px] w-[64px] shrink-0 place-items-center overflow-hidden rounded-[14px] bg-white/15"
                    style={track ? { backgroundImage: img ? `url("${img}")` : coverGradient(track.id), backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
                    {track
                        ? (img
                            ? <img src={img} alt="" draggable={false} className="h-full w-full object-cover" />
                            : <Music className="h-7 w-7 text-white/85" />)
                        : <Music className="h-8 w-8 text-white/85" />}
                </div>
                <div className="min-w-0">
                    <p className="truncate text-[18px] font-semibold leading-tight text-white">{track?.title ?? t('shell.notPlaying','Not Playing')}</p>
                    <p className="truncate text-[15px] leading-tight text-white/55">{track?.artist ?? t('shell.notPlaying','Not Playing')}</p>
                </div>
            </div>

            <div className="mt-[22px]">
                <div className="relative h-[6px] w-full rounded-full bg-white/20">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-white/45" style={{ width: `${pct}%` }} />
                    <div className="absolute top-1/2 h-[13px] w-[13px] -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `calc(${pct}% - 6.5px)` }} />
                </div>
                <div className="mt-2 flex justify-between text-[13px] font-medium text-white/55">
                    <span>{fmtTime(time)}</span>
                    <span>{fmtTime(duration)}</span>
                </div>
            </div>

            <div className="mt-[18px] flex items-center justify-center gap-12 text-white">
                <button aria-label={t('shell.previous','Previous')} onClick={music.prev}><SkipBack className="h-[27px] w-[27px] fill-white" /></button>
                <button aria-label={music.playing ? t('shell.pause','Pause') : t('shell.play','Play')} onClick={music.toggle}>
                    {music.playing
                        ? <Pause className="h-[34px] w-[34px] fill-white" />
                        : <Play  className="h-[34px] w-[34px] fill-white" />}
                </button>
                <button aria-label={t('shell.next','Next')} onClick={music.next}><SkipForward className="h-[27px] w-[27px] fill-white" /></button>
            </div>
        </div>
    );
}

function Circle({ icon: Icon, on = false, onClick, color = '#ffffff', glyph = '#ffffff', label }: {
    icon: LucideIcon; on?: boolean; onClick?: () => void; color?: string; glyph?: string; label: string;
}) {
    return (
        <button
            onClick={onClick}
            aria-label={label}
            aria-pressed={on}
            className="flex h-[74px] w-[74px] items-center justify-center rounded-full transition-colors active:opacity-80"
            style={{ background: on ? color : 'rgba(255,255,255,0.15)' }}
        >
            <Icon className="h-[30px] w-[30px]" style={{ color: on ? glyph : '#ffffff' }} />
        </button>
    );
}

function HSlider({ value, onChange, icon: Icon, label }: { value: number; onChange: (v: number) => void; icon: LucideIcon; label: string }) {
    const ref = useRef<HTMLDivElement | null>(null);
    const dragging = useRef(false);
    const [drag, setDrag] = useState<number | null>(null);
    const shown = drag ?? value;

    function posFrom(e: React.PointerEvent): number | null {
        const el = ref.current;
        if (!el) return null;
        const f = trackFraction(el, e.clientX);
        return f === null ? null : Math.round(f * 100);
    }
    return (
        <div
            ref={ref}
            role="slider"
            aria-label={label}
            aria-valuenow={shown}
            className="relative h-[50px] w-full cursor-pointer touch-none select-none overflow-hidden rounded-[19px] bg-white/[0.16]"
            onPointerDown={e => { const p = posFrom(e); if (p === null) return; dragging.current = true; ref.current?.setPointerCapture?.(e.pointerId); setDrag(p); onChange(p); }}
            onPointerMove={e => { if (!dragging.current) return; const p = posFrom(e); if (p !== null) { setDrag(p); onChange(p); } }}
            onPointerUp={() => { dragging.current = false; setDrag(null); }}
            onPointerCancel={() => { dragging.current = false; setDrag(null); }}
        >
            <div className="pointer-events-none absolute inset-y-0 left-0 bg-white" style={{ width: `${shown}%` }} />
            <div className="pointer-events-none absolute inset-y-0 left-[18px] flex items-center">
                <Icon className="h-[22px] w-[22px]" style={{ color: shown > 10 ? '#3a3a3c' : '#ffffff' }} />
            </div>
        </div>
    );
}

function fmtTime(s: number): string {
    if (!isFinite(s) || s <= 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function ControlCenterHotzone({ onOpen }: { onOpen: () => void }) {
    const start = useRef<{ x: number; y: number } | null>(null);
    return (
        <div
            className="absolute right-0 top-0 z-[400]"
            style={{ width: '46%', height: 'calc(var(--safe-top) + 6px)' }}
            onPointerDown={e => { start.current = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
            onPointerMove={e => {
                if (!start.current) return;
                if (e.clientY - start.current.y > 14) { start.current = null; onOpen(); }
            }}
            onPointerUp={e => {
                if (!start.current) return;
                const moved = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y);
                start.current = null;
                if (moved < 10) onOpen();
            }}
        />
    );
}
