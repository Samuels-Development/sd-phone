import { useEffect, useRef, useState } from 'react';

import { fetchNui, isFiveM } from '@/core/nui';
import { t } from '@/i18n';
import { useDeckActive } from '@/shell/deckActive';
import { useTheme } from '@/stores/themeStore';

const SB_H = 54;
const C = 160;
const IOS_RED = '#FF453A';

const TICKS = Array.from({ length: 72 }, (_, i) => {
    const b = i * 5;
    const cardinal = b % 90 === 0;
    const major = b % 30 === 0;
    const inner = cardinal ? 129 : major ? 133 : 143;
    return { b, inner, cardinal, major };
});

const CARD = ['N', 'E', 'S', 'W'];
const LABELS = Array.from({ length: 12 }, (_, i) => {
    const b = i * 30;
    const cardinal = b % 90 === 0;
    return { b, text: cardinal ? CARD[b / 90] : String(b), cardinal, north: b === 0 };
});

const INTERCARD = [
    { b: 45, t: 'NE' }, { b: 135, t: 'SE' }, { b: 225, t: 'SW' }, { b: 315, t: 'NW' },
];

const COMPASS_DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const cardinalOf = (deg: number) => COMPASS_DIRS[Math.round((deg % 360) / 45) % 8];

function pt(b: number, r: number) {
    const rad = (b * Math.PI) / 180;
    return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) };
}

function toDMS(dec: number, pos: string, neg: string) {
    const dir = dec >= 0 ? pos : neg;
    const a = Math.abs(dec);
    let d = Math.floor(a);
    let m = Math.floor((a - d) * 60);
    let s = Math.round((((a - d) * 60) - m) * 60);
    if (s === 60) { s = 0; m += 1; }
    if (m === 60) { m = 0; d += 1; }
    return `${d}°${m}′${s}″ ${dir}`;
}

interface Geo { lat: number; lon: number; alt: number; }

export function Compass({ onClose: _onClose }: { onClose: () => void }) {
    const [rot, setRot] = useState(-34);
    const [geo, setGeo] = useState<Geo | null>(null);
    const dragging = useRef(false);

    const { theme } = useTheme('theme');
    const dark = theme === 'dark';

    // Compass is retained in the app switcher, so without this gate its 250ms poll kept running
    // (4 NUI round-trips a second) while the app sat suspended in the hidden deck layer.
    const deckActive = useDeckActive();

    useEffect(() => {
        if (!deckActive) return;
        if (!isFiveM) {
            const t = window.setInterval(() => {
                if (!dragging.current) setRot(r => r + (Math.random() - 0.5) * 0.5);
            }, 120);
            return () => window.clearInterval(t);
        }
        let alive = true;
        const poll = () => {
            void fetchNui<{ heading?: number; lat?: number; lon?: number; alt?: number }>('sd-phone:compass:get')
                .then(d => {
                    if (!alive || !d || typeof d.heading !== 'number') return;
                    const h = d.heading;
                    setRot(prev => {
                        const curr = ((-prev % 360) + 360) % 360;
                        let delta = h - curr;
                        if (delta > 180) delta -= 360;
                        else if (delta < -180) delta += 360;
                        return prev - delta;
                    });
                    if (typeof d.lat === 'number' && typeof d.lon === 'number') {
                        setGeo({ lat: d.lat, lon: d.lon, alt: d.alt ?? 0 });
                    }
                })
                .catch(() => {});
        };
        poll();
        const t = window.setInterval(poll, 250);
        return () => { alive = false; window.clearInterval(t); };
    }, [deckActive]);

    const heading = ((-rot % 360) + 360) % 360;

    const bg     = dark ? '#000000' : 'rgb(var(--base))';
    const ink    = dark ? '#ffffff' : '#1c1c1e';
    const ringA  = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)';
    const ringB  = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    const numCol = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.72)';
    const intCol = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.62)';
    const subCol = dark ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.90)';
    const dimCol = dark ? 'rgba(255,255,255,0.82)' : 'rgba(0,0,0,0.82)';
    const tickOp = (b: number, cardinal: boolean, major: boolean) =>
        b === 0 ? 1 : cardinal ? (dark ? 0.95 : 0.9) : major ? (dark ? 0.7 : 0.8) : (dark ? 0.32 : 0.45);

    function onPointerDown(e: React.PointerEvent) {
        if (isFiveM) return;
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    function onPointerMove(e: React.PointerEvent) {
        if (dragging.current) setRot(r => r - e.movementX * 0.6);
    }
    const endDrag = () => { dragging.current = false; };

    const coordLine = geo
        ? `${toDMS(geo.lat, 'N', 'S')}  ${toDMS(geo.lon, 'E', 'W')}`
        : '34°3′12″ N  118°14′24″ W';
    const elevation = geo ? `${Math.round(geo.alt)} m` : '28 m';

    return (
        <div
            className="absolute inset-0 z-10 flex select-none flex-col overflow-hidden font-sf"
            style={{ background: bg, color: ink }}
        >
            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="flex flex-1 items-center justify-center px-6">
                <div
                    className="relative aspect-square w-full max-w-[340px]"
                    style={{ touchAction: 'none' }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onPointerLeave={endDrag}
                >
                    <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full">
                        <polygon points="160,16 152,2 168,2" fill={IOS_RED} />
                    </svg>

                    <svg
                        viewBox="0 0 320 320"
                        className="absolute inset-0 h-full w-full"
                        style={{
                            transform: `rotate(${rot}deg)`,
                            transformOrigin: '50% 50%',
                            transition: 'transform 0.1s linear',
                        }}
                    >
                        <circle cx={C} cy={C} r="150" fill="none" stroke={ringA} strokeWidth="1" />
                        <circle cx={C} cy={C} r="92" fill="none" stroke={ringB} strokeWidth="1" />

                        {TICKS.map(({ b, inner, cardinal, major }) => {
                            const a = pt(b, 150);
                            const c = pt(b, inner);
                            return (
                                <line
                                    key={b}
                                    x1={a.x} y1={a.y} x2={c.x} y2={c.y}
                                    stroke={b === 0 ? IOS_RED : ink}
                                    strokeWidth={cardinal ? 2.4 : major ? 1.6 : 1}
                                    strokeLinecap="round"
                                    opacity={tickOp(b, cardinal, major)}
                                />
                            );
                        })}

                        {INTERCARD.map(({ b, t }) => (
                            <text
                                key={t}
                                x={C} y={C - 86}
                                transform={`rotate(${b} ${C} ${C})`}
                                textAnchor="middle" dominantBaseline="middle"
                                fontSize="12" fontWeight="600" letterSpacing="0.5"
                                fill={intCol}
                            >
                                {t}
                            </text>
                        ))}

                        {LABELS.map(({ b, text, cardinal, north }) => (
                            <text
                                key={b}
                                x={C} y={C - 116}
                                transform={`rotate(${b} ${C} ${C})`}
                                textAnchor="middle" dominantBaseline="middle"
                                fontSize={cardinal ? 26 : 15}
                                fontWeight={cardinal ? 700 : 500}
                                fill={north ? IOS_RED : cardinal ? ink : numCol}
                            >
                                {text}
                            </text>
                        ))}
                    </svg>

                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <div className="text-[68px] font-thin leading-none tabular-nums">
                            {Math.round(heading)}<span className="align-top text-[34px] font-thin">°</span>
                        </div>
                        <div className="mt-1 text-[20px] font-medium tracking-wide">{cardinalOf(heading)}</div>
                    </div>
                </div>
            </div>

            <div className="shrink-0 px-6 pb-16 text-center">
                <div className="text-[27px] font-semibold">{t('compass.losSantos', 'Los Santos')}</div>
                <div className="mt-2 text-[18px] tabular-nums" style={{ color: subCol }}>
                    {coordLine}
                </div>
                <div className="mt-1.5 text-[21px]" style={{ color: dimCol }}>{t('compass.elevation', 'Elevation: {elevation}', { elevation })}</div>
            </div>
        </div>
    );
}
