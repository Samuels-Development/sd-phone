import { useEffect, useRef, useState } from 'react';
import { Phone, Volume, Volume1, Volume2, VolumeX } from 'lucide-react';

import { useTheme } from '@/stores/themeStore';
import { useMusic } from '@/apps/music/MusicContext';
import { trackFractionY } from '@/lib/zoom';

const CAP_W = 54;
const CAP_H = 164;

export function VolumeHUD({ suppressed = false }: { suppressed?: boolean }) {
    const { ringtoneVol, callVol, setRingtoneVol, setCallVol, theme } = useTheme('ringtoneVol', 'callVol', 'setRingtoneVol', 'setCallVol', 'theme');
    const music = useMusic();

    const mediaMode = !!music.current;
    const mediaVol  = Math.round(music.volume * 100);

    const [mounted,   setMounted]   = useState(false);
    const [visible,   setVisible]   = useState(false);
    const [activeVol, setActiveVol] = useState(50);
    const [source,    setSource]    = useState<'media' | 'ringtone' | 'call'>('ringtone');

    const prevRingtone  = useRef<number | null>(null);
    const prevCall      = useRef<number | null>(null);
    const prevMedia     = useRef<number | null>(null);
    const dismissTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const unmountTimer  = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const trackRef      = useRef<HTMLDivElement>(null);
    const dragging      = useRef(false);

    function scheduleDismiss() {
        clearTimeout(dismissTimer.current);
        clearTimeout(unmountTimer.current);
        dismissTimer.current = setTimeout(() => {
            setVisible(false);
            unmountTimer.current = setTimeout(() => setMounted(false), 280);
        }, 2000);
    }

    useEffect(() => {
        if (prevRingtone.current === null) {
            prevRingtone.current = ringtoneVol;
            prevCall.current     = callVol;
            prevMedia.current    = mediaMode ? mediaVol : null;
            return;
        }

        let vol: number | null = null;
        let src: 'media' | 'ringtone' | 'call' = 'ringtone';
        if (mediaMode && prevMedia.current !== null && mediaVol !== prevMedia.current) {
            vol = mediaVol;
            src = 'media';
        } else if (ringtoneVol !== prevRingtone.current) {
            vol = ringtoneVol;
            src = 'ringtone';
        } else if (callVol !== prevCall.current) {
            vol = callVol;
            src = 'call';
        }
        prevRingtone.current = ringtoneVol;
        prevCall.current     = callVol;
        prevMedia.current    = mediaMode ? mediaVol : null;
        if (vol === null) return;

        if (suppressed) return;

        setActiveVol(vol);
        setSource(src);
        setMounted(true);
        requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));

        if (!dragging.current) scheduleDismiss();
    }, [mediaMode, mediaVol, ringtoneVol, callVol, suppressed]);

    if (!mounted) return null;

    const isDark = theme === 'dark';

    const Icon =
        source === 'call' ? Phone   :
        activeVol === 0   ? VolumeX :
        activeVol <= 33   ? Volume  :
        activeVol <= 66   ? Volume1 :
                            Volume2;

    function setFromPointer(clientY: number) {
        const el = trackRef.current;
        if (!el) return;
        const fTop = trackFractionY(el, clientY);
        if (fTop === null) return;
        const level = 1 - fTop;
        const pct = Math.round(level * 100);
        setActiveVol(pct);
        if (source === 'call') setCallVol(pct);
        else if (mediaMode) music.setVolume(level);
        else setRingtoneVol(pct);
    }

    function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        dragging.current = true;
        clearTimeout(dismissTimer.current);
        clearTimeout(unmountTimer.current);
        e.currentTarget.setPointerCapture(e.pointerId);
        setFromPointer(e.clientY);
    }
    function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (dragging.current) setFromPointer(e.clientY);
    }
    function endDrag(e: React.PointerEvent<HTMLDivElement>) {
        if (!dragging.current) return;
        dragging.current = false;
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
        scheduleDismiss();
    }

    return (
        <div
            className="absolute left-[12px] z-[500] flex flex-col items-center"
            style={{
                top:        233,
                opacity:    visible ? 1 : 0,
                transform:  visible ? 'scale(1)' : 'scale(0.92)',
                transformOrigin: 'left center',
                transition: 'opacity 0.22s ease, transform 0.22s ease',
            }}
        >
            <div
                ref={trackRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="relative cursor-pointer touch-none overflow-hidden rounded-full backdrop-blur-xl"
                style={{
                    width:  CAP_W,
                    height: CAP_H,
                    background: isDark ? 'rgba(255,255,255,0.20)' : 'rgba(120,120,128,0.22)',
                    boxShadow: isDark
                        ? '0 6px 24px rgba(0,0,0,0.45)'
                        : '0 6px 24px rgba(0,0,0,0.16)',
                }}
            >
                <div
                    className="absolute inset-x-0 bottom-0 bg-white"
                    style={{
                        height:     `${activeVol}%`,
                        transition: dragging.current ? 'none' : 'height 0.16s cubic-bezier(0.33, 1, 0.68, 1)',
                    }}
                />

                <Icon
                    className="pointer-events-none absolute left-1/2 bottom-[12px] -translate-x-1/2 text-black/55"
                    style={{ width: 19, height: 19 }}
                    strokeWidth={2.25}
                />
            </div>
        </div>
    );
}
