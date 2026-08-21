import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { captureThumb } from './cctvThumbs';

export interface CctvActive {
    cameraId: string;
    label:    string;
    category: string;
}

const CLOCK_MS = 1000;

function stamp(now: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}  ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
}

export function CctvOverlay({ active }: { active: CctvActive }) {
    const [now, setNow] = useState(() => new Date());
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(new Date());
            setElapsed(s => s + 1);
        }, CLOCK_MS);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => { setElapsed(0); }, [active.cameraId]);

    useEffect(() => {
        let alive = true;
        const timer = window.setTimeout(() => {
            if (alive) void captureThumb(active.cameraId);
        }, 1200);
        return () => { alive = false; window.clearTimeout(timer); };
    }, [active.cameraId]);

    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');

    return (
        <div className="pointer-events-none fixed inset-0 z-[999] select-none font-mono">
            <div
                className="absolute inset-0"
                style={{
                    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 42%, rgba(0,0,0,0.55) 100%)',
                }}
            />
            <div
                className="absolute inset-0 opacity-[0.16]"
                style={{
                    backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 1px, transparent 1px, transparent 3px)',
                }}
            />
            <div
                className="absolute inset-0 opacity-[0.05]"
                style={{ background: 'linear-gradient(180deg, #9dffc4 0%, transparent 30%, transparent 70%, #9dffc4 100%)' }}
            />
            <div className="absolute inset-0 animate-[cctv-drift_7s_linear_infinite] opacity-[0.045]"
                style={{
                    backgroundImage: 'repeating-linear-gradient(to bottom, rgba(255,255,255,0.9) 0px, rgba(255,255,255,0.9) 2px, transparent 2px, transparent 9px)',
                }}
            />

            <div className="absolute left-0 right-0 top-0 flex items-start justify-between px-8 pt-7 text-[15px] tracking-[0.06em] text-white/85">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-[9px] w-[9px] animate-pulse rounded-full bg-[#ff4b4b]" />
                        <span className="font-bold text-[#ff6b6b]">{t('mdt.cctvRec', 'REC')}</span>
                        <span className="tabular-nums text-white/70">{mins}:{secs}</span>
                    </div>
                    <div className="text-[19px] font-bold tracking-[0.04em] text-white">{active.label}</div>
                    <div className="text-[13px] uppercase tracking-[0.18em] text-white/55">{active.category}</div>
                </div>

                <div className="flex flex-col items-end gap-1 text-right">
                    <div className="text-[13px] uppercase tracking-[0.18em] text-white/55">{t('mdt.cctvChannel', 'CH')} {active.cameraId.slice(0, 12).toUpperCase()}</div>
                    <div className="tabular-nums text-white/85">{stamp(now)}</div>
                </div>
            </div>

            <div className="absolute left-8 right-8 bottom-7 flex items-end justify-between text-[13px] tracking-[0.08em] text-white/55">
                <div className="flex flex-col gap-1">
                    <span>{t('mdt.cctvHintLook', 'Move the mouse to pan and tilt')}</span>
                    <span>{t('mdt.cctvHintZoom', 'Scroll to zoom')}</span>
                </div>
                <div className="rounded-[4px] border border-white/25 px-3 py-1.5 text-white/70">
                    {t('mdt.cctvHintExit', 'Backspace to leave the camera')}
                </div>
            </div>

            <div className="absolute left-7 top-1/2 h-9 w-[2px] -translate-y-1/2 bg-white/25" />
            <div className="absolute right-7 top-1/2 h-9 w-[2px] -translate-y-1/2 bg-white/25" />
            <div className="absolute left-1/2 top-6 h-[2px] w-9 -translate-x-1/2 bg-white/25" />
            <div className="absolute left-1/2 bottom-6 h-[2px] w-9 -translate-x-1/2 bg-white/25" />
        </div>
    );
}

export function useCctvActive(): CctvActive | null {
    const [active, setActive] = useState<CctvActive | null>(null);

    useNuiEvent('sd-phone:cctv:enter', (data: CctvActive | undefined) => {
        if (!data || typeof data.cameraId !== 'string') return;
        setActive({
            cameraId: data.cameraId,
            label:    data.label ?? data.cameraId,
            category: data.category ?? '',
        });
    });

    useNuiEvent('sd-phone:cctv:exit', () => setActive(null));

    return active;
}
