import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SyntheticEvent } from 'react';
import { createPortal } from 'react-dom';

import logoUrl from '@/assets/logo.png';
import { t } from '@/i18n';
import { isFiveM } from '@/core/nui';
import { isDemo } from '@/core/demo';
import { useThemeStore } from '@/stores/themeStore';

let played = false;
let enabled = !isDemo;
let replays = 0;
const listeners = new Set<() => void>();

function subscribeReplay(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
function replaySnapshot(): number {
    return replays;
}

// The website preview never boots. A visitor arrives mid-session rather than switching a phone on,
// so a splash there reads as the page stalling. Both entry points are closed rather than just the
// default, because a server setting push and the replay hook could each switch it back on.
export function setBootScreenEnabled(v: boolean): void {
    if (isDemo) return;
    enabled = v;
}

export function replayBootSplash(): void {
    if (isDemo) return;
    played = false;
    replays += 1;
    listeners.forEach(fn => fn());
}

export function BootReplayButton() {
    if (isFiveM || !import.meta.env.DEV || typeof document === 'undefined') return null;
    return createPortal(
        <button
            type="button"
            onClick={replayBootSplash}
            style={{
                position: 'fixed', left: 12, top: 12, zIndex: 2147483647,
                padding: '9px 16px', borderRadius: 999, background: '#0a84ff', color: '#fff',
                fontSize: 13, fontWeight: 700, border: '1px solid rgba(255,255,255,0.35)',
                boxShadow: '0 6px 22px rgba(0,0,0,0.55)', cursor: 'pointer',
            }}
        >
            Replay boot
        </button>,
        document.body,
    );
}

const HOLD_MS = 2300;
const FADE_MS = 620;
const LOGO_H = 156;

const LOGO_MASK = {
    WebkitMaskImage: `url(${logoUrl})`,
    maskImage: `url(${logoUrl})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
} as const;

function swallow(e: SyntheticEvent): void {
    e.preventDefault();
    e.stopPropagation();
}

export function BootSplash({ radius, tint }: { radius: number; tint: string }) {
    const motion = useThemeStore(s => s.motion);
    const replayCount = useSyncExternalStore(subscribeReplay, replaySnapshot, replaySnapshot);
    const seenReplay = useRef(replayCount);
    const [phase, setPhase] = useState<'showing' | 'fading' | 'done'>(
        () => (played || !enabled || motion === 'off' ? 'done' : 'showing'),
    );

    useEffect(() => {
        if (replayCount === seenReplay.current) return;
        seenReplay.current = replayCount;
        setPhase('showing');
    }, [replayCount]);

    useEffect(() => {
        if (phase !== 'showing') return;
        played = true;
        const hold = window.setTimeout(() => setPhase('fading'), HOLD_MS);
        return () => window.clearTimeout(hold);
    }, [phase]);

    useEffect(() => {
        if (phase !== 'fading') return;
        const fade = window.setTimeout(() => setPhase('done'), FADE_MS);
        return () => window.clearTimeout(fade);
    }, [phase]);

    if (phase === 'done') return null;

    return (
        <div
            key={replayCount}
            className="boot-root absolute inset-0 z-[900] overflow-hidden"
            onPointerDown={swallow}
            onPointerUp={swallow}
            onClick={swallow}
            onContextMenu={swallow}
            onWheel={swallow}
            onTouchStart={swallow}
            style={{
                borderRadius: radius,
                touchAction: 'none',
                opacity: phase === 'fading' ? 0 : 1,
                transform: phase === 'fading' ? 'scale(1.06)' : 'scale(1)',
                transition: `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms cubic-bezier(0.32,0.72,0,1)`,
            }}
        >
            <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(180deg, #080a12 0%, #04050a 55%, #010204 100%)' }}
            />

            <div className="relative flex h-full flex-col items-center justify-center">
                <div className="relative" style={{ height: LOGO_H }}>
                    <div
                        className="boot-rays pointer-events-none absolute left-1/2 top-1/2 h-[760px] w-[760px] -translate-x-1/2 -translate-y-1/2"
                        style={{
                            background: `repeating-conic-gradient(from 0deg, ${tint}00 0deg, ${tint}2e 5deg, ${tint}00 13deg, ${tint}00 30deg)`,
                            WebkitMaskImage: 'radial-gradient(circle, #000 6%, rgba(0,0,0,0.5) 30%, transparent 64%)',
                            maskImage: 'radial-gradient(circle, #000 6%, rgba(0,0,0,0.5) 30%, transparent 64%)',
                        }}
                    />
                    <div
                        className="boot-backlight pointer-events-none absolute left-1/2 top-1/2 h-[360px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{ background: `radial-gradient(ellipse at center, ${tint}b0 0%, ${tint}4a 32%, transparent 66%)` }}
                    />
                    <div
                        className="boot-backlight-cool pointer-events-none absolute left-1/2 top-1/2 h-[260px] w-[260px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{ background: 'radial-gradient(circle, rgba(150,170,255,0.5) 0%, transparent 60%)' }}
                    />
                    <div
                        className="boot-pulse pointer-events-none absolute left-1/2 top-1/2 h-[200px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{ border: `1px solid ${tint}cc` }}
                    />

                    <img
                        src={logoUrl}
                        alt={t('setup.logoAlt', 'Logo')}
                        draggable={false}
                        className="boot-logo relative block h-full w-auto object-contain"
                        style={{ filter: `drop-shadow(0 0 12px ${tint}88) drop-shadow(0 0 40px ${tint}44) drop-shadow(0 12px 34px rgba(0,0,0,0.65))` }}
                    />
                    <div className="boot-rim pointer-events-none absolute inset-0" style={LOGO_MASK} />
                    <div className="boot-sheen pointer-events-none absolute inset-0" style={LOGO_MASK} />
                    <div
                        className="pointer-events-none absolute left-0 top-full h-full w-full"
                        style={{
                            ...LOGO_MASK,
                            backgroundImage: `linear-gradient(180deg, ${tint}55, transparent 46%)`,
                            transform: 'scaleY(-1)',
                            opacity: 0.5,
                        }}
                    />
                </div>

                <div className="boot-rise-late absolute bottom-[13%] flex flex-col items-center gap-3">
                    <div className="relative h-[2px] w-[118px] overflow-hidden rounded-full bg-white/8">
                        <div className="boot-bar h-full w-full rounded-full" style={{ backgroundImage: `linear-gradient(90deg, ${tint}00, ${tint}, #ffffff)` }} />
                    </div>
                </div>
            </div>

            <div
                className="pointer-events-none absolute inset-0"
                style={{ background: 'radial-gradient(ellipse at center, transparent 26%, rgba(0,0,0,0.5) 68%, rgba(0,0,0,0.88) 100%)' }}
            />
        </div>
    );
}
