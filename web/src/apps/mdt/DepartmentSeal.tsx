import { useId, type JSX } from 'react';

import { MDT_ACCENT } from './mdtTheme';

function starPath(cx: number, cy: number, points: number, outer: number, inner: number): string {
    const seg: string[] = [];
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (Math.PI / points) * i - Math.PI / 2;
        seg.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
    }
    return `M${seg.join('L')}Z`;
}

const SHIELD = 'M24 11.5 L34.5 15 V25.2 C34.5 31 29.8 34.9 24 37 C18.2 34.9 13.5 31 13.5 25.2 V15 Z';

function ShieldCore() {
    return (
        <>
            <path d={SHIELD} fill="#fff" fillOpacity="0.94" />
            <path d={starPath(24, 24, 5, 6.4, 2.7)} fill="currentColor" />
            <path d="M16.6 17.4 H31.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.55" />
        </>
    );
}

function StarCore() {
    return (
        <>
            <path d={starPath(24, 24, 7, 12.2, 5.6)} fill="#fff" fillOpacity="0.94" />
            <circle cx="24" cy="24" r="4.4" fill="currentColor" />
        </>
    );
}

function WingCore() {
    return (
        <>
            <path d={SHIELD} fill="#fff" fillOpacity="0.94" />
            <path
                d="M17 21.5 L24 18.5 L31 21.5 M17 26 L24 23 L31 26 M17 30.5 L24 27.5 L31 30.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </>
    );
}

function ScalesCore() {
    return (
        <>
            <circle cx="24" cy="24" r="13" fill="#fff" fillOpacity="0.94" />
            <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none">
                <path d="M24 15.5 V32.5 M17 32.5 H31 M15.5 19.5 H32.5" />
                <path d="M15.5 19.5 L12.6 25.4 H18.4 Z" fill="currentColor" stroke="none" />
                <path d="M32.5 19.5 L29.6 25.4 H35.4 Z" fill="currentColor" stroke="none" />
            </g>
        </>
    );
}

function CrossCore() {
    return (
        <>
            <circle cx="24" cy="24" r="13" fill="#fff" fillOpacity="0.94" />
            <path
                d="M21.4 15.6 H26.6 V21.4 H32.4 V26.6 H26.6 V32.4 H21.4 V26.6 H15.6 V21.4 H21.4 Z"
                fill="currentColor"
            />
        </>
    );
}

function CrestCore() {
    return (
        <>
            <path d={SHIELD} fill="#fff" fillOpacity="0.94" />
            <path d={starPath(24, 20.6, 5, 4.6, 1.9)} fill="currentColor" />
            <g fill="currentColor" opacity="0.75">
                <rect x="18.4" y="26.4" width="2.4" height="7.4" rx="1.2" />
                <rect x="22.8" y="26.4" width="2.4" height="8.6" rx="1.2" />
                <rect x="27.2" y="26.4" width="2.4" height="7.4" rx="1.2" />
            </g>
        </>
    );
}

const CORES: Record<string, () => JSX.Element> = {
    shield: ShieldCore,
    star:   StarCore,
    wing:   WingCore,
    scales: ScalesCore,
    cross:  CrossCore,
    crest:  CrestCore,
    lspd:   ShieldCore,
    lssd:   StarCore,
    bcso:   StarCore,
    sheriff: StarCore,
    sasp:   WingCore,
    sahp:   WingCore,
    police: ShieldCore,
    doj:    ScalesCore,
    court:  ScalesCore,
    ems:    CrossCore,
    medical: CrossCore,
    fib:    CrestCore,
};

export function DepartmentSeal({ seal, accent = MDT_ACCENT, size = 42, className = '' }: {
    seal?:      string;
    accent?:    string;
    size?:      number;
    className?: string;
}) {
    const uid = useId().replace(/:/g, '');
    const Core = CORES[(seal ?? '').toLowerCase()] ?? ShieldCore;

    return (
        <svg
            viewBox="0 0 48 48"
            width={size}
            height={size}
            className={`shrink-0 ${className}`}
            style={{ color: accent }}
            aria-hidden
        >
            <defs>
                <linearGradient id={`sheen-${uid}`} x1="0" y1="0" x2="0.35" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity="0.34" />
                    <stop offset="55%" stopColor="#fff" stopOpacity="0.06" />
                    <stop offset="100%" stopColor="#000" stopOpacity="0.16" />
                </linearGradient>
            </defs>

            <circle cx="24" cy="24" r="23" fill={accent} />
            <circle cx="24" cy="24" r="23" fill={`url(#sheen-${uid})`} />
            <circle cx="24" cy="24" r="22.4" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.2" />
            <circle cx="24" cy="24" r="19.2" fill="none" stroke="#fff" strokeOpacity="0.26" strokeWidth="0.9" />
            <Core />
        </svg>
    );
}
