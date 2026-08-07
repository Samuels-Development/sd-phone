import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { t } from '@/i18n';
import type { HudMarker, HudSettings, HudState } from '@/apps/racing/data';
import { hudAnchor, HUD_EDGE_PX } from './anchor';
import { CheckpointMarkers } from './CheckpointMarkers';
import { RaceHud } from './RaceHud';

const REFERENCE_W = 1100;
const SAMPLE_ELAPSED_MS = 96_400;
const SAMPLE_LAP_START_MS = 64_220;

const SAMPLE_STATE: HudState = {
    lap:               2,
    totalLaps:         3,
    cp:                7,
    cpTotal:           14,
    progress:          46,
    bestLapMs:         64_220,
    lapStartElapsedMs: SAMPLE_LAP_START_MS,
    sectors: [
        { ms: 15_980, done: true },
        { ms: 17_240, done: true },
        { ms: 0,      done: false },
        { ms: 0,      done: false },
    ],
    racers: [
        { pos: 1, name: 'Dana Kovač',    deltaMs: null,  you: false },
        { pos: 2, name: 'M. Reyes',      deltaMs: 1_840, you: false },
        { pos: 3, name: 'You',           deltaMs: 3_120, you: true  },
        { pos: 4, name: 'T. Okafor',     deltaMs: 5_460, you: false },
        { pos: 5, name: 'J. Lindqvist',  deltaMs: 9_210, you: false },
    ],
    pos:         3,
    totalRacers: 8,
};

function sampleMarkers(scale: number): HudMarker[] {
    return [
        { label: 8, dist: 212, x: 0.30, y: 0.30, stem: 0, scale, on: true, primary: false },
        { label: 7, dist: 74,  x: 0.64, y: 0.24, stem: 0, scale, on: true, primary: true  },
    ];
}

function Scene() {
    return (
        <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 320 180"
            preserveAspectRatio="none"
            aria-hidden
        >
            <defs>
                <linearGradient id="racingPreviewSky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#1b2735" />
                    <stop offset="55%"  stopColor="#2b3a4d" />
                    <stop offset="100%" stopColor="#39485c" />
                </linearGradient>
                <linearGradient id="racingPreviewGround" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#2a2f38" />
                    <stop offset="100%" stopColor="#14171c" />
                </linearGradient>
                <linearGradient id="racingPreviewRoad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#3a4049" />
                    <stop offset="100%" stopColor="#22262c" />
                </linearGradient>
                <radialGradient id="racingPreviewVignette" cx="0.5" cy="0.45" r="0.75">
                    <stop offset="55%"  stopColor="rgba(0,0,0,0)" />
                    <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
                </radialGradient>
            </defs>
            <rect x="0" y="0" width="320" height="104" fill="url(#racingPreviewSky)" />
            <rect x="0" y="104" width="320" height="76" fill="url(#racingPreviewGround)" />
            <polygon points="148,104 172,104 246,180 74,180" fill="url(#racingPreviewRoad)" />
            <polygon points="159,104 161,104 168,180 152,180" fill="rgba(255,255,255,0.10)" />
            <rect x="0" y="0" width="320" height="180" fill="url(#racingPreviewVignette)" />
        </svg>
    );
}

export function HudPreview({ settings, youName }: { settings: HudSettings; youName?: string }) {
    const hostRef  = useRef<HTMLDivElement | null>(null);
    const startRef = useRef(performance.now() - SAMPLE_ELAPSED_MS);

    const [width, setWidth] = useState(0);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const observer = new ResizeObserver(entries => {
            const next = entries[0]?.contentRect.width ?? 0;
            setWidth(prev => (Math.abs(prev - next) > 0.5 ? next : prev));
        });
        observer.observe(host);
        return () => observer.disconnect();
    }, []);

    const shrink = width > 0 ? width / REFERENCE_W : 0;
    const anchor = hudAnchor(settings.position, 'absolute', HUD_EDGE_PX * shrink);

    const state = youName
        ? { ...SAMPLE_STATE, racers: SAMPLE_STATE.racers.map(r => (r.you ? { ...r, name: youName } : r)) }
        : SAMPLE_STATE;

    return (
        <div
            ref={hostRef}
            className="relative aspect-video w-full select-none overflow-hidden bg-[#14171c]"
        >
            <Scene />
            {shrink > 0 && (
                <div className="pointer-events-none absolute inset-0">
                    {settings.inAirWaypoints && (
                        <CheckpointMarkers
                            markers={sampleMarkers(shrink * 1.45)}
                            color={settings.checkpointColor}
                            colorClosest={settings.closestColor}
                        />
                    )}
                    <div style={anchor.frame}>
                        <div
                            className="inline-flex items-stretch gap-2"
                            style={{
                                flexDirection:   anchor.stackUp ? 'column-reverse' : 'column',
                                transform:       `scale(${settings.scale * shrink})`,
                                transformOrigin: anchor.origin,
                                '--racing-hud-scale': String(settings.scale * shrink),
                            } as CSSProperties}
                        >
                            <RaceHud style={settings.style} state={state} startedAt={startRef.current} />
                        </div>
                    </div>
                </div>
            )}
            <div className="pointer-events-none absolute bottom-1.5 right-2 text-[10px] font-medium uppercase tracking-wider text-white/35">
                {t('racing.hudPreviewTag', 'Preview')}
            </div>
        </div>
    );
}
