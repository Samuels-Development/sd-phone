

import { useState } from 'react';

import { customAccent, useCustomAppsStore } from '@/stores/customAppsStore';

const S = 60;


function LinearGrad({ id, top, mid, bot, angle = 150 }: {
    id: string; top: string; mid?: string; bot: string; angle?: number;
}) {
    const rad = (angle * Math.PI) / 180;
    const x2 = `${+(50 + 50 * Math.sin(rad)).toFixed(1)}%`;
    const y2 = `${+(50 + 50 * Math.cos(rad)).toFixed(1)}%`;
    const x1 = `${+(50 - 50 * Math.sin(rad)).toFixed(1)}%`;
    const y1 = `${+(50 - 50 * Math.cos(rad)).toFixed(1)}%`;
    return (
        <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
            <stop offset="0%"   stopColor={top} />
            {mid && <stop offset="50%"  stopColor={mid} />}
            <stop offset="100%" stopColor={bot} />
        </linearGradient>
    );
}

function RadialGrad({ id, inner, outer, cx = '38%', cy = '32%' }: {
    id: string; inner: string; outer: string; cx?: string; cy?: string;
}) {
    return (
        <radialGradient id={id} cx={cx} cy={cy} r="70%">
            <stop offset="0%"   stopColor={inner} />
            <stop offset="100%" stopColor={outer} />
        </radialGradient>
    );
}

function PhoneIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="ph" top="#45E768" mid="#23D24E" bot="#0CBB3B" /></defs>
            <rect width={S} height={S} fill="url(#ph)" />
            <svg x="12.5" y="12.5" width="35" height="35" viewBox="0 0 24 24">
                <path
                    d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
                    fill="white"
                    stroke="white"
                    strokeWidth="0.5"
                    strokeLinejoin="round"
                />
            </svg>
        </svg>
    );
}

function MessagesIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="msg" top="#5BF675" bot="#0CBD2A" angle={0} /></defs>
            <rect width={S} height={S} fill="url(#msg)" />
            <g transform={`scale(${S / 66.145836}) translate(59.483067,-145.8456)`}>
                <path
                    fill="#fff"
                    d="m -26.410149,157.29606 a 24.278298,20.222157 0 0 0 -24.278105,20.22202 24.278298,20.222157 0 0 0 11.79463,17.31574 27.365264,20.222157 0 0 1 -4.245218,5.94228 23.85735,20.222157 0 0 0 9.86038,-3.87367 24.278298,20.222157 0 0 0 6.868313,0.83768 24.278298,20.222157 0 0 0 24.2781059,-20.22203 24.278298,20.222157 0 0 0 -24.2781059,-20.22202 z"
                />
            </g>
        </svg>
    );
}

function ServicesIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="srv" top="#34D9C4" mid="#16B8A6" bot="#0E9488" /></defs>
            <rect width={S} height={S} fill="url(#srv)" />
            <path
                d="M22.5,22 L22.5,18.5 Q22.5,15.5 25.5,15.5 L34.5,15.5 Q37.5,15.5 37.5,18.5 L37.5,22"
                fill="none" stroke="white" strokeWidth="3.4" strokeLinecap="round"
            />
            <path
                d="M25.8,21 V19.2 Q25.8,18.3 26.7,18.3 H33.3 Q34.2,18.3 34.2,19.2 V21"
                fill="none" stroke="url(#srv)" strokeWidth="1.4" strokeLinecap="round" opacity="0.65"
            />
            <rect x="11.5" y="21.5" width="37" height="26.5" rx="5" fill="white" />
            <rect x="11.5" y="31.6" width="37" height="2.6" fill="url(#srv)" opacity="0.9" />
            <rect x="26.2" y="29.8" width="7.6" height="6.2" rx="2" fill="url(#srv)" />
            <circle cx="30" cy="32.9" r="1.15" fill="#fff" />
            <rect x="16.4" y="24.5" width="1.5" height="20.5" rx="0.75" fill="url(#srv)" opacity="0.22" />
            <rect x="42.1" y="24.5" width="1.5" height="20.5" rx="0.75" fill="url(#srv)" opacity="0.22" />
            <circle cx="15.5" cy="26"   r="1.05" fill="url(#srv)" opacity="0.45" />
            <circle cx="44.5" cy="26"   r="1.05" fill="url(#srv)" opacity="0.45" />
            <circle cx="15.5" cy="43.5" r="1.05" fill="url(#srv)" opacity="0.45" />
            <circle cx="44.5" cy="43.5" r="1.05" fill="url(#srv)" opacity="0.45" />
        </svg>
    );
}

function PagesIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="pg" top="#FFE45C" mid="#FFD43B" bot="#FBC02D" /></defs>
            <rect width={S} height={S} fill="url(#pg)" />
            <path d="M30,46.8 C24,44 15.5,43.7 11.5,45 L11.5,46.4 C15.5,45.1 24,45.4 30,48.2 C36,45.4 44.5,45.1 48.5,46.4 L48.5,45 C44.5,43.7 36,44 30,46.8 Z" fill="rgba(0,0,0,0.20)" />
            <path d="M30,46.5 C24.5,43.8 16.5,43.5 13,44.6 L13,45.6 C16.5,44.5 24.5,44.8 30,47.5 C35.5,44.8 43.5,44.5 47,45.6 L47,44.6 C43.5,43.5 35.5,43.8 30,46.5 Z" fill="rgba(255,255,255,0.8)" />
            <path d="M30,17.5 C24.5,14.8 16.5,14.5 12,16 L12,42.5 C16.5,41 24.5,41.3 30,44 Z" fill="white" />
            <path d="M30,17.5 C35.5,14.8 43.5,14.5 48,16 L48,42.5 C43.5,41 35.5,41.3 30,44 Z" fill="white" />
            <path d="M30,17.5 C28,16.5 26,15.9 24,15.6 L24,41.6 C26,41.9 28,42.6 30,44 Z" fill="rgba(0,0,0,0.07)" />
            <path d="M30,17.5 C32,16.5 34,15.9 36,15.6 L36,41.6 C34,41.9 32,42.6 30,44 Z" fill="rgba(0,0,0,0.07)" />
            <rect x="29.3" y="17.6" width="1.4" height="26.2" rx="0.7" fill="rgba(0,0,0,0.28)" />
            <rect x="15.5" y="21.5" width="10.5" height="1.7" rx="0.85" fill="#9A9A9E" opacity="0.75" />
            <rect x="15.5" y="26"   width="9"    height="1.7" rx="0.85" fill="#9A9A9E" opacity="0.55" />
            <rect x="15.5" y="30.5" width="10"   height="1.7" rx="0.85" fill="#9A9A9E" opacity="0.55" />
            <rect x="15.5" y="35"   width="7.5"  height="1.7" rx="0.85" fill="#9A9A9E" opacity="0.42" />
            <rect x="34"   y="21.5" width="10.5" height="1.7" rx="0.85" fill="#9A9A9E" opacity="0.75" />
            <rect x="35.5" y="26"   width="9"    height="1.7" rx="0.85" fill="#9A9A9E" opacity="0.55" />
            <rect x="34.5" y="30.5" width="10"   height="1.7" rx="0.85" fill="#9A9A9E" opacity="0.55" />
            <rect x="37"   y="35"   width="7.5"  height="1.7" rx="0.85" fill="#9A9A9E" opacity="0.42" />
            <path d="M41,15.2 L41,23.5 L43.2,21.6 L45.4,23.3 L45.4,15.4 Z" fill="#E5533C" />
        </svg>
    );
}

function MarketplaceIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="mkt" top="#4FA9FF" mid="#1B8BF6" bot="#0A63E0" /></defs>
            <rect width={S} height={S} fill="url(#mkt)" />
            <svg x="12" y="12" width="36" height="36" viewBox="0 0 24 24"
                fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" />
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" />
                <path d="M2 7h20" />
                <path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />
            </svg>
        </svg>
    );
}

function MailIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="ml" top="#5BB8FF" mid="#2E9CF5" bot="#0E6FD8" /></defs>
            <rect width={S} height={S} fill="url(#ml)" />
            <rect x="8" y="16" width="44" height="30" rx="4" fill="white" />
            <path d="M8,17 L30,34 L52,17" fill="none" stroke="url(#ml)" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M8,46 L22,32" fill="none" stroke="rgba(0,80,200,0.18)" strokeWidth="1.5" />
            <path d="M52,46 L38,32" fill="none" stroke="rgba(0,80,200,0.18)" strokeWidth="1.5" />
        </svg>
    );
}

function SafariIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><RadialGrad id="saf" inner="#6EC8FF" outer="#0A70E0" cx="40%" cy="32%" /></defs>
            <rect width={S} height={S} fill="url(#saf)" />
            <circle cx="30" cy="30" r="21" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
            {Array.from({ length: 12 }).map((_, i) => {
                const a = (i * 30 - 90) * Math.PI / 180;
                const major = i % 3 === 0;
                const r1 = major ? 15.5 : 17;
                return (
                    <line key={i}
                        x1={30 + r1 * Math.cos(a)} y1={30 + r1 * Math.sin(a)}
                        x2={30 + 20 * Math.cos(a)} y2={30 + 20 * Math.sin(a)}
                        stroke="white" strokeWidth={major ? 2 : 1}
                        strokeLinecap="round" opacity={major ? 1 : 0.55}
                    />
                );
            })}
            <g transform="translate(30,30) rotate(-42)">
                <polygon points="0,-12 3,0 -3,0" fill="#FF3B30" />
                <polygon points="0,12  3,0 -3,0" fill="white" />
            </g>
            <circle cx="30" cy="30" r="2.2" fill="white" />
            <text x="30" y="7" textAnchor="middle" fontSize="5.5" fontWeight="700"
                fill="white" fontFamily="-apple-system,sans-serif">N</text>
        </svg>
    );
}

function CompassIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><RadialGrad id="cmp" inner="#48484a" outer="#0a0a0c" cx="42%" cy="34%" /></defs>
            <rect width={S} height={S} fill="url(#cmp)" />
            <circle cx="30" cy="30" r="22" fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />
            {Array.from({ length: 24 }).map((_, i) => {
                const b = i * 15;
                const a = (b - 90) * Math.PI / 180;
                const card = b % 90 === 0;
                const r1 = card ? 15.5 : 18.5;
                return (
                    <line key={i}
                        x1={30 + 21 * Math.cos(a)} y1={30 + 21 * Math.sin(a)}
                        x2={30 + r1 * Math.cos(a)} y2={30 + r1 * Math.sin(a)}
                        stroke={b === 0 ? '#FF453A' : 'white'} strokeWidth={card ? 1.8 : 1}
                        strokeLinecap="round" opacity={b === 0 ? 1 : card ? 0.9 : 0.4}
                    />
                );
            })}
            <g transform="translate(30,30) rotate(45)">
                <polygon points="0,-13 3.2,0 -3.2,0" fill="#FF453A" />
                <polygon points="0,13  3.2,0 -3.2,0" fill="#F2F2F7" />
            </g>
            <circle cx="30" cy="30" r="2.6" fill="white" />
            <circle cx="30" cy="30" r="1.1" fill="#1c1c1e" />
        </svg>
    );
}

function MapsIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <LinearGrad id="mland"  top="#F8F7F3" bot="#EDEBE3" angle={180} />
                <LinearGrad id="mwater" top="#B5DFF6" bot="#9FD2EF" angle={180} />
                <RadialGrad id="mpuck" inner="#4AA3FF" outer="#0A7AFF" cx="38%" cy="32%" />
            </defs>
            <rect width={S} height={S} fill="url(#mland)" />
            <path d="M46,-4 C43,6 50,14 51,24 C52,34 44,42 44,52 C44,56 45,60 47,64 L64,64 L64,-4 Z" fill="url(#mwater)" />
            <path d="M21,7 C28,5 31.5,11 29.5,16.5 C27.5,22 19,23 16,17.5 C13.5,13 15,9 21,7 Z" fill="#C3E5A9" />
            <g stroke="#E0DED5" strokeWidth="1.4" fill="none">
                <path d="M22,34 L22,62" />
                <path d="M31,52 L45,52" />
                <path d="M40,-2 L40,14" />
            </g>
            <g fill="none" strokeLinecap="round">
                <path d="M31,-2 L31,62" stroke="#E2E0D8" strokeWidth="5.6" />
                <path d="M31,-2 L31,62" stroke="#FFFFFF" strokeWidth="4.4" />
                <path d="M-2,38 C14,38 28,38 46,36" stroke="#E2E0D8" strokeWidth="5.6" />
                <path d="M-2,38 C14,38 28,38 46,36" stroke="#FFFFFF" strokeWidth="4.4" />
            </g>
            <g fill="none" strokeLinecap="round">
                <path d="M-4,60 C4,48 12,44 15,32 C18,20 14,8 6,-4" stroke="#E3B145" strokeWidth="7.4" />
                <path d="M-4,60 C4,48 12,44 15,32 C18,20 14,8 6,-4" stroke="#F9CD5A" strokeWidth="5.6" />
            </g>
            <circle cx="31" cy="25" r="9.5" fill="#0A7AFF" opacity="0.18" />
            <circle cx="31" cy="25" r="6" fill="#FFFFFF" />
            <circle cx="31" cy="25" r="4.4" fill="url(#mpuck)" />
        </svg>
    );
}

function FindFriendsIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <RadialGrad id="ffbg" inner="#5BE584" outer="#16B85A" cx="50%" cy="42%" />
            </defs>
            <rect width={S} height={S} fill="url(#ffbg)" />
            <circle cx="30" cy="30" r="19" fill="none" stroke="#FFFFFF" strokeOpacity="0.32" strokeWidth="2" />
            <circle cx="30" cy="30" r="11.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="2" />
            <circle cx="30" cy="28.5" r="6.5" fill="#FFFFFF" />
            <path d="M30,35 L30,42" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
            <circle cx="30" cy="28.5" r="2.6" fill="#16B85A" />
        </svg>
    );
}

function RydeIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <rect width={S} height={S} fill="#000000" />
            <text
                x="30" y="31"
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="Inter, -apple-system, 'SF Pro Display', sans-serif"
                fontSize="16"
                fontWeight="600"
                letterSpacing="-0.4"
                fill="#fff"
            >
                Ryde
            </text>
        </svg>
    );
}

function CameraIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <RadialGrad id="cbg"  inner="#6E6E78" outer="#2C2C31" cx="50%" cy="40%" />
                <RadialGrad id="clns" inner="#5E7188" outer="#141A26" cx="38%" cy="32%" />
            </defs>
            <rect width={S} height={S} fill="url(#cbg)" />
            <rect x="8" y="10" width="12" height="8" rx="3" fill="#55555C" />
            <rect x="9.5" y="11.5" width="9" height="5" rx="2" fill="#3A3A40" />
            <circle cx="46" cy="14" r="3.5" fill="#55555C" />
            <circle cx="30" cy="32" r="18.5" fill="#3A3A40" />
            <circle cx="30" cy="32" r="17.5" fill="url(#clns)" />
            <circle cx="30" cy="32" r="13.5" fill="none" stroke="#6A6A78" strokeWidth="1.2" />
            <circle cx="30" cy="32" r="9.5"  fill="#10151F" />
            <ellipse cx="25" cy="26" rx="3.5" ry="2" fill="rgba(215,232,255,0.55)"
                transform="rotate(-25,25,26)" />
            <circle cx="30" cy="32" r="8.5" fill="none" stroke="rgba(150,185,255,0.38)" strokeWidth="1" />
        </svg>
    );
}

export function PhotosIcon() {
    const petals = [
        { a: 0,   c: '#FF3B30' },
        { a: 45,  c: '#FF9500' },
        { a: 90,  c: '#FFCC00' },
        { a: 135, c: '#34C759' },
        { a: 180, c: '#30B0C7' },
        { a: 225, c: '#007AFF' },
        { a: 270, c: '#5856D6' },
        { a: 315, c: '#FF2D55' },
    ];
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <rect width={S} height={S} fill="white" />
            <circle cx="30" cy="30" r="15" fill="rgba(0,0,0,0.04)" />
            {petals.map(p => (
                <ellipse key={p.a} cx="30" cy="30"
                    rx="6.5" ry="12.5"
                    fill={p.c} opacity="0.92"
                    transform={`rotate(${p.a},30,30) translate(0,-8.5)`}
                />
            ))}
            <circle cx="30" cy="30" r="7.5" fill="white" />
            <circle cx="30" cy="30" r="5" fill="rgba(0,0,0,0.04)" />
        </svg>
    );
}

function MusicIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="mus" top="#FB5C74" mid="#FA3D55" bot="#F8233B" angle={170} /></defs>
            <rect width={S} height={S} fill="url(#mus)" />
            <path d="M0,38 Q10,32 20,37 T40,37 T60,33 V60 H0 Z" fill="rgba(255,255,255,0.10)" />
            <path d="M0,45 Q12,39.5 24,44 T46,43.5 T60,41 V60 H0 Z" fill="rgba(255,255,255,0.12)" />
            <path d="M0,52 Q14,47.5 28,51 T60,49.5 V60 H0 Z" fill="rgba(255,255,255,0.14)" />
            <path d="M24.5,14.5 L44,11 L44,17.5 L24.5,21 Z" fill="#fff" />
            <rect x="21.6" y="14.5" width="3" height="25" rx="1.5" fill="#fff" />
            <rect x="41"   y="11"   width="3" height="25" rx="1.5" fill="#fff" />
            <ellipse cx="20.6" cy="40.5" rx="6.4" ry="4.7" fill="#fff" transform="rotate(-16 20.6 40.5)" />
            <ellipse cx="40"   cy="37"   rx="6.4" ry="4.7" fill="#fff" transform="rotate(-16 40 37)" />
        </svg>
    );
}

function WalletIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="wbg" top="#2C2C2E" bot="#0A0A0C" angle={160} /></defs>
            <rect width={S} height={S} fill="url(#wbg)" />
            <rect x="8" y="18" width="44" height="27" rx="4.5" fill="#C8A43C" opacity="0.9" />
            <rect x="8" y="14" width="44" height="27" rx="4.5" fill="#1B64C8" />
            <rect x="14" y="21" width="10" height="7.5" rx="1.5" fill="#E8C840" opacity="0.95" />
            <line x1="14" y1="24.5" x2="24" y2="24.5" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
            <line x1="19" y1="21"   x2="19" y2="28.5" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
            <rect x="8" y="10" width="44" height="27" rx="4.5" fill="#EBEBED" />
            <rect x="14" y="17" width="10" height="7.5" rx="1.5" fill="#C8A43C" />
            <line x1="14" y1="20.5" x2="24" y2="20.5" stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" />
            <line x1="19" y1="17"   x2="19" y2="24.5" stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" />
            <path d="M30,17 Q37,20 30,23" fill="none" stroke="#8E8E93" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M32,14 Q42,18.5 32,25" fill="none" stroke="#8E8E93" strokeWidth="1.4" strokeLinecap="round" />
            <rect x="6" y="39" width="48" height="14" rx="5" fill="#1C1C1E" />
        </svg>
    );
}

function WeatherIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <LinearGrad id="wxbg" top="#5CC8FF" mid="#2A9FF5" bot="#1460D4" angle={170} />
                <radialGradient id="wxsun" cx="42%" cy="40%" r="62%">
                    <stop offset="0" stopColor="#FFE873" />
                    <stop offset="1" stopColor="#FFC700" />
                </radialGradient>
                <linearGradient id="wxcloud" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#FFFFFF" />
                    <stop offset="1" stopColor="#E4EEFA" />
                </linearGradient>
            </defs>
            <rect width={S} height={S} fill="url(#wxbg)" />
            <circle cx="22" cy="20" r="15" fill="#FFE873" opacity="0.22" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map(a => (
                <line key={a}
                    x1="22" y1="6.5" x2="22" y2="10.5"
                    stroke="#FFD84D" strokeWidth="2.6" strokeLinecap="round"
                    transform={`rotate(${a},22,20)`}
                />
            ))}
            <circle cx="22" cy="20" r="9" fill="url(#wxsun)" />
            <ellipse cx="19" cy="16.5" rx="3.4" ry="2.1" fill="rgba(255,255,255,0.5)" transform="rotate(-28 19 16.5)" />
            <circle cx="42" cy="29" r="8.5" fill="#fff" opacity="0.55" />
            <g>
                <rect  x="12" y="36" width="38" height="13.5" rx="6.75" fill="url(#wxcloud)" />
                <circle cx="22"   cy="36"   r="8.6"  fill="url(#wxcloud)" />
                <circle cx="33.5" cy="32.5" r="11"   fill="url(#wxcloud)" />
                <circle cx="44"   cy="36.5" r="7.6"  fill="url(#wxcloud)" />
                <path d="M26,27.5 A10,10 0 0 1 39,26.5" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" />
                <path d="M14,46.5 Q30,50.5 48,46.2" fill="none" stroke="rgba(20,70,160,0.18)" strokeWidth="2.4" strokeLinecap="round" />
            </g>
        </svg>
    );
}

function ClockIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="clkbg" top="#3A3A3C" bot="#0A0A0C" angle={160} /></defs>
            <rect width={S} height={S} fill="url(#clkbg)" />
            <circle cx="30" cy="30" r="23" fill="#2C2C2E" />
            <circle cx="30" cy="30" r="22" fill="#1C1C1E" />
            {Array.from({ length: 12 }).map((_, i) => {
                const major = i % 3 === 0;
                const a = (i * 30 - 90) * Math.PI / 180;
                const r1 = major ? 15.5 : 17.5;
                return (
                    <line key={i}
                        x1={30 + r1 * Math.cos(a)} y1={30 + r1 * Math.sin(a)}
                        x2={30 + 21 * Math.cos(a)} y2={30 + 21 * Math.sin(a)}
                        stroke="white" strokeWidth={major ? 2.5 : 1.2}
                        strokeLinecap="round" opacity={major ? 1 : 0.6}
                    />
                );
            })}
            <line x1="30" y1="30" x2="20" y2="15"
                stroke="white" strokeWidth="3.2" strokeLinecap="round" />
            <line x1="30" y1="30" x2="43" y2="18"
                stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            <line x1="30" y1="34" x2="34" y2="10"
                stroke="#FF3B30" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="30" cy="30" r="2.5" fill="white" />
            <circle cx="30" cy="30" r="1.2" fill="#FF3B30" />
        </svg>
    );
}

function CalendarIcon() {
    const now = new Date();
    const day = now.getDate();
    const dayName = ['SUN','MON','TUE','WED','THU','FRI','SAT'][now.getDay()];
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <rect width={S} height={S} fill="white" />
            <rect x="5" y="5" width="50" height="18" rx="3.5" fill="#FF3B30" />
            <text x="30" y="17" textAnchor="middle" fontSize="7.5" fontWeight="700"
                fill="white" fontFamily="-apple-system,BlinkMacSystemFont,sans-serif">
                {dayName}
            </text>
            <rect x="5" y="21" width="50" height="34" rx="0" fill="white" />
            <rect x="5" y="21" width="50" height="34" rx="3.5"
                fill="none" stroke="#E0E0E5" strokeWidth="1" />
            <text x="30" y="47" textAnchor="middle" fontSize="24" fontWeight="200"
                fill="#1C1C1E" fontFamily="-apple-system,BlinkMacSystemFont,sans-serif">
                {day}
            </text>
            <circle cx="19" cy="6" r="2.5" fill="rgba(255,255,255,0.45)" />
            <circle cx="41" cy="6" r="2.5" fill="rgba(255,255,255,0.45)" />
            <line x1="5" y1="28" x2="55" y2="28" stroke="#F0F0F4" strokeWidth="0.8" />
        </svg>
    );
}

function NotesIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="ntbg" top="#FFE94D" mid="#FFCD3C" bot="#F0A800" angle={160} /></defs>
            <rect width={S} height={S} fill="url(#ntbg)" />
            <rect x="9" y="8" width="42" height="45" rx="4" fill="rgba(255,255,255,0.97)" />
            <line x1="19" y1="8" x2="19" y2="53" stroke="#FFAAAA" strokeWidth="1.5" opacity="0.7" />
            {[20, 27, 34, 41, 48].map(y => (
                <line key={y} x1="22" x2="47" y1={y} y2={y}
                    stroke="#D8D8DC" strokeWidth="1" />
            ))}
            <rect x="22" y="17.5" width="16" height="3" rx="1.5" fill="#C8C8CE" opacity="0.7" />
            <rect x="22" y="24.5" width="22" height="3" rx="1.5" fill="#C8C8CE" opacity="0.5" />
        </svg>
    );
}

function DocumentsIcon() {
    // Passwords-icon technique: one folder glyph repeated in yellow/green/blue, cascading
    // diagonally, each with a tile-coloured stroke pass behind it so the layers cut cleanly
    // out of each other.
    // Flat, not the family's graphite gradient: the folder layers cut out of each other with
    // TILE-coloured strokes, and only a flat tile keeps those cut lines invisible.
    const TILE = '#1C1C1E';
    const FOLDER = 'M -16 -9 h 9 a 2 2 0 0 1 1.6 0.9 l 1.8 2.3 h 16.2 a 3 3 0 0 1 3 3 v 11.8 a 3 3 0 0 1 -3 3 h -25.6 a 3 3 0 0 1 -3 -3 v -15 a 3 3 0 0 1 3 -3 z';
    const fold = (grad: string, tx: number, ty: number) => (
        <g transform={`translate(${tx} ${ty})`}>
            <g fill={grad} stroke={TILE} strokeWidth="2.6"><path d={FOLDER} /></g>
            <g fill={grad}><path d={FOLDER} /></g>
        </g>
    );
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <LinearGrad id="docy" top="#FFE03D" bot="#F5A623" angle={160} />
                <LinearGrad id="docg" top="#5BE372" bot="#1FAE43" angle={160} />
                <LinearGrad id="docb" top="#56C8FF" bot="#0A6CDE" angle={160} />
            </defs>
            <rect width={S} height={S} fill={TILE} />
            {fold('url(#docy)', 23.5, 23.5)}
            {fold('url(#docg)', 28.5, 29.5)}
            {fold('url(#docb)', 33.5, 35.5)}
        </svg>
    );
}

function SettingsIcon() {
    const teeth = (n: number, base: number, tip: number, bhw: number, thw: number, fill: string) =>
        Array.from({ length: n }).map((_, i) => (
            <polygon key={i}
                points={`${-bhw},${-base} ${bhw},${-base} ${thw},${-tip} ${-thw},${-tip}`}
                fill={fill} transform={`rotate(${(i * 360) / n})`} />
        ));
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <linearGradient id="setbg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#E6E5EC" />
                    <stop offset="0.5" stopColor="#C2C2C7" />
                    <stop offset="1" stopColor="#929296" />
                </linearGradient>
                <linearGradient id="setdk" x1="0" y1="-26" x2="0" y2="26" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#323236" />
                    <stop offset="1" stopColor="#242428" />
                </linearGradient>
                <linearGradient id="setsv" x1="0" y1="-26" x2="0" y2="26" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#E7E6EB" />
                    <stop offset="1" stopColor="#A0A0A5" />
                </linearGradient>
                <linearGradient id="setsvd" x1="0" y1="-26" x2="0" y2="26" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#BFBEC4" />
                    <stop offset="1" stopColor="#8E8D93" />
                </linearGradient>
            </defs>
            <rect width={S} height={S} fill="url(#setbg)" />
            <g transform="translate(30,30)">
                <circle r="25.9" fill="url(#setdk)" />
                <circle r="12.75" fill="none" stroke="url(#setsvd)" strokeWidth="2.5" />
                {teeth(54, 13.8, 16.1, 0.38, 0.15, 'url(#setsvd)')}
                {[0, 120, 240].map(a => (
                    <polygon key={a} points="1.2,-1.2 18.8,-2.2 18.8,2.2 1.2,1.2"
                        fill="url(#setsvd)" transform={`rotate(${a})`} />
                ))}
                <circle r="20" fill="none" stroke="url(#setsv)" strokeWidth="2.4" />
                {teeth(56, 21, 24.2, 0.5, 0.16, 'url(#setsv)')}
                <circle r="3" fill="url(#setsvd)" />
                <circle r="1.05" fill="#242428" />
            </g>
        </svg>
    );
}

function AppStoreIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <linearGradient id="asbg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#5BD8FF" />
                    <stop offset="0.5" stopColor="#1E8BFF" />
                    <stop offset="1" stopColor="#0B57C9" />
                </linearGradient>
                <radialGradient id="asgl" cx="50%" cy="-6%" r="80%">
                    <stop offset="0" stopColor="#fff" stopOpacity="0.42" />
                    <stop offset="0.55" stopColor="#fff" stopOpacity="0.06" />
                    <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </radialGradient>
            </defs>
            <rect width={S} height={S} fill="url(#asbg)" />
            <rect width={S} height={S} fill="url(#asgl)" />
            <g strokeWidth="4.4" strokeLinecap="round" fill="none">
                <line x1="16" y1="43" x2="34" y2="13" stroke="#fff" />
                <line x1="44" y1="43" x2="26" y2="13" stroke="#fff" strokeOpacity="0.6" />
                <line x1="22" y1="35" x2="38" y2="35" stroke="#fff" />
            </g>
        </svg>
    );
}

function BankIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="bnkbg" top="#5BBBF5" bot="#0064D2" angle={145} /></defs>
            <rect width={S} height={S} fill="url(#bnkbg)" />
            <polygon points="30,9 53,22 7,22" fill="white" opacity="0.96" />
            <rect x="6" y="22" width="48" height="5" fill="white" opacity="0.93" />
            <rect x="10"    y="27" width="5.5" height="19" rx="2.75" fill="white" opacity="0.93" />
            <rect x="27.25" y="27" width="5.5" height="19" rx="2.75" fill="white" opacity="0.93" />
            <rect x="44.5"  y="27" width="5.5" height="19" rx="2.75" fill="white" opacity="0.93" />
            <rect x="5"  y="46" width="50" height="4.5" rx="1" fill="white" opacity="0.88" />
            <rect x="3"  y="50.5" width="54" height="3.5" rx="1" fill="white" opacity="0.55" />
        </svg>
    );
}

function HealthIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <LinearGrad id="hlthbg" top="#FFFFFF" bot="#F2F2F4" angle={180} />
                <LinearGrad id="hlthhr" top="#FF5277" bot="#E5163E" angle={160} />
            </defs>
            <rect width={S} height={S} fill="url(#hlthbg)" />
            <path
                d="M30,49
                   C18,40 8,32 8,22
                   C8,15.5 13,11 18.5,11
                   C23,11 27,13.5 30,17.5
                   C33,13.5 37,11 41.5,11
                   C47,11 52,15.5 52,22
                   C52,32 42,40 30,49 Z"
                fill="url(#hlthhr)"
            />
            <path
                d="M22,14 C18.5,14 14,16.5 14,21 C14,24 16,27 19,30"
                fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2.2"
                strokeLinecap="round"
            />
        </svg>
    );
}

function GroupsIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <LinearGrad id="grpsbg" top="#C084FC" mid="#7C3AED" bot="#4C1D95" angle={148} />
                <radialGradient id="grpsgl" cx="62%" cy="22%" r="58%">
                    <stop offset="0%"   stopColor="rgba(255,255,255,0.24)" />
                    <stop offset="100%" stopColor="rgba(255,255,255,0)"    />
                </radialGradient>
                <radialGradient id="grpsvig" cx="50%" cy="110%" r="60%">
                    <stop offset="0%"   stopColor="rgba(40,0,90,0.38)" />
                    <stop offset="100%" stopColor="rgba(40,0,90,0)"    />
                </radialGradient>
            </defs>

            <rect width={S} height={S} fill="url(#grpsbg)" />
            <rect width={S} height={S} fill="url(#grpsgl)" />
            <rect width={S} height={S} fill="url(#grpsvig)" />

            <path
                d="M23,60 C23,45 30,36 37,36 C44,36 51,45 51,60 Z"
                fill="white" opacity="0.48"
            />
            <circle cx="37" cy="17" r="7.5" fill="white" opacity="0.48" />
            <path d="M31.5,13 Q31.5,10.5 34.5,10.5"
                fill="none" stroke="rgba(255,255,255,0.28)"
                strokeWidth="1.8" strokeLinecap="round" />

            <path
                d="M4,60 C4,44 12,35 22,35 C32,35 40,44 40,60 Z"
                fill="white"
            />
            <circle cx="22" cy="22" r="9.5" fill="white" />
            <path d="M15,17 Q15,13 19.5,13"
                fill="none" stroke="rgba(220,180,255,0.45)"
                strokeWidth="2" strokeLinecap="round" />
            <path d="M14,30 Q22,33 30,30"
                fill="none" stroke="rgba(80,0,160,0.18)"
                strokeWidth="1.5" strokeLinecap="round" />
        </svg>
    );
}

function CalculatorIcon() {
    const COLS = [21.4, 30, 38.6];
    const ROWS = [28.6, 36.8, 45];
    const R    = 3.4;
    const GREY = '#E3E3E1';
    const ORNG = '#FF9F0A';
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <rect width={S} height={S} fill="#D6D6D4" />
            <rect x="14" y="7" width="32" height="46" rx="7" fill="#222224" />
            <rect x="18" y="11" width="24" height="10.5" rx="2.5" fill="#555557" />
            {ROWS.slice(0, 2).map(y =>
                COLS.map((x, c) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r={R} fill={c === 2 ? ORNG : GREY} />
                )),
            )}
            <rect x={COLS[0] - R} y={ROWS[2] - R} width={COLS[1] - COLS[0] + 2 * R} height={2 * R} rx={R} fill={GREY} />
            <circle cx={COLS[2]} cy={ROWS[2]} r={R} fill={ORNG} />
        </svg>
    );
}

function BirdyIcon() {
    // The user-drawn Birdy bird on its own diagonal blue (Downloads/BirdyIcon.jsx); the bare
    // glyph twin lives in apps/birdy/BirdyBird for in-app branding.
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <linearGradient id="bdy" x1="0.15" y1="0" x2="0.85" y2="1">
                    <stop offset="0" stopColor="#4aa8e8" />
                    <stop offset="0.55" stopColor="#2f7fdc" />
                    <stop offset="1" stopColor="#2560c9" />
                </linearGradient>
            </defs>
            <rect width={S} height={S} fill="url(#bdy)" />
            <svg x="0" y="0" width={S} height={S} viewBox="0 0 512 512">
                <g transform="translate(102,102) scale(3.08)">
                    <path
                        d="M91 27 C87 31 82 33 78 35 C81 41 82 48 80 54 C76 76 60 94 37 95 C27 96 16 93 7 88 C16 86 24 83 31 78 C24 78 17 73 14 66 C18 67 22 67 26 65 C17 62 11 56 10 47 C13 49 17 51 21 51 C14 45 11 37 13 28 C20 38 30 43 41 44 C42 36 46 29 52 25 C57 20 65 19 70 22 C75 24 79 25 82 26 C85 26 88 26 91 27 Z"
                        fill="#fff"
                    />
                </g>
            </svg>
        </svg>
    );
}

function DarkChatIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <linearGradient id="dchat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#2B3040" />
                    <stop offset="1" stopColor="#101218" />
                </linearGradient>
            </defs>
            <rect width={S} height={S} fill="url(#dchat)" />
            <rect x="26" y="12" width="24" height="16" rx="6" fill="#7C6CFF" />
            <polygon points="44,26 44,33 36,27" fill="#7C6CFF" />
            <rect x="10" y="26" width="28" height="18" rx="6.5" fill="#fff" />
            <polygon points="16,42 16,50 25,43.5" fill="#fff" />
            <circle cx="19" cy="35" r="2" fill="url(#dchat)" />
            <circle cx="24" cy="35" r="2" fill="url(#dchat)" />
            <circle cx="29" cy="35" r="2" fill="url(#dchat)" />
        </svg>
    );
}

function CherryIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="chy" top="#FF5C7E" mid="#F0285A" bot="#D11241" /></defs>
            <rect width={S} height={S} fill="url(#chy)" />
            <svg x="12" y="12" width="36" height="36" viewBox="0 0 24 24"
                fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z" />
                <path d="M12 17a5 5 0 0 0 10 0c0-2.76-2.5-5-5-3-2.5-2-5 .24-5 3Z" />
                <path d="M7 14c3.22-2.91 4.29-8.75 5-12 1.66 2.38 4.94 9 5 12" />
                <path d="M22 9c-4.29 0-7.14-2.33-10-7 5.71 0 10 4.67 10 7Z" />
            </svg>
        </svg>
    );
}

function PhotogramIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <linearGradient id="pgram" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stopColor="#FCAF45" />
                    <stop offset="0.5" stopColor="#E1306C" />
                    <stop offset="1" stopColor="#7B2FF7" />
                </linearGradient>
                <radialGradient id="pgramLens" cx="40%" cy="34%" r="66%">
                    <stop offset="0" stopColor="#26262f" />
                    <stop offset="1" stopColor="#08080c" />
                </radialGradient>
            </defs>
            <rect width={S} height={S} fill="url(#pgram)" />
            <rect x="9" y="9.5" width="12" height="3" rx="1.5" fill="#fff" opacity="0.6" />
            <rect x="43" y="8" width="8" height="5.5" rx="2" fill="#fff" opacity="0.92" />
            <circle cx="30" cy="33" r="16.5" fill="#fff" opacity="0.22" />
            <circle cx="30" cy="33" r="14.5" fill="url(#pgramLens)" />
            <circle cx="30" cy="33" r="14.5" fill="none" stroke="#fff" strokeWidth="1.8" />
            <circle cx="30" cy="33" r="8" fill="none" stroke="#fff" strokeWidth="2" opacity="0.55" />
            <circle cx="30" cy="33" r="3.6" fill="#08080c" />
            <ellipse cx="24" cy="27" rx="3.7" ry="2.3" fill="#fff" opacity="0.4" transform="rotate(-30 24 27)" />
        </svg>
    );
}


function GaragesIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <linearGradient id="gar" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stopColor="#9D4EFF" />
                    <stop offset="1" stopColor="#2E6BFF" />
                </linearGradient>
            </defs>
            <rect width={S} height={S} fill="url(#gar)" />
            <path
                d="M30,11 L49,21.5 Q50,22 50,23 V44 Q50,46.5 47.5,46.5 H12.5 Q10,46.5 10,44 V23 Q10,22 11,21.5 Z"
                fill="#fff"
            />
            <circle cx="30" cy="19.5" r="2.1" fill="url(#gar)" />
            <rect x="16.5" y="26" width="27" height="20.5" rx="2" fill="url(#gar)" />
            <rect x="16.5" y="30.4" width="27" height="2" fill="#fff" opacity="0.9" />
            <rect x="16.5" y="35.2" width="27" height="2" fill="#fff" opacity="0.9" />
            <rect x="16.5" y="40"   width="27" height="2" fill="#fff" opacity="0.9" />
            <rect x="27.5" y="43.6" width="5" height="1.6" rx="0.8" fill="#fff" opacity="0.9" />
            <rect x="13" y="48.5" width="34" height="2.2" rx="1.1" fill="rgba(255,255,255,0.55)" />
        </svg>
    );
}

function HomesIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <linearGradient id="hom" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#4FE0A6" />
                    <stop offset="1" stopColor="#11936B" />
                </linearGradient>
            </defs>
            <rect width={S} height={S} fill="url(#hom)" />
            <circle cx="30" cy="31" r="20.5" fill="#fff" opacity="0.10" />
            <path
                d="M27.8,13.4
                   Q30,11.8 32.2,13.4
                   L47.2,25.2 Q48.4,26.2 47.6,27.4 Q46.8,28.4 45.4,27.6 L44.5,26.9
                   V42.5 A4.5,4.5 0 0 1 40,47 H20 A4.5,4.5 0 0 1 15.5,42.5
                   V26.9 L14.6,27.6 Q13.2,28.4 12.4,27.4 Q11.6,26.2 12.8,25.2 Z"
                fill="#fff"
            />
            <path d="M25.6,47 V36.5 A4.4,4.4 0 0 1 34.4,36.5 V47 Z" fill="url(#hom)" />
        </svg>
    );
}

function CookieIcon() {
    const chips = [
        [22, 22, 4], [40, 19, 4.4], [30, 36, 4], [44, 39, 3.6], [21, 42, 3.4],
    ] as const;
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <LinearGrad id="ckie-bg" top="#E7A856" mid="#C77D2E" bot="#9C5A1C" angle={150} />
                <RadialGrad id="ckie-b" inner="#EFC684" outer="#B9772F" cx="38%" cy="32%" />
            </defs>
            <rect width={S} height={S} fill="url(#ckie-bg)" />
            <circle cx="30" cy="30" r="20" fill="url(#ckie-b)" />
            <circle cx="30" cy="30" r="20" fill="none" stroke="rgba(80,46,20,0.30)" strokeWidth="1.4" />
            <path d="M16,21 A17,17 0 0 1 30,13" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" />
            {chips.map(([cx, cy, r], i) => (
                <g key={i}>
                    <circle cx={cx} cy={cy} r={r} fill="#5A3417" />
                    <circle cx={cx - r * 0.32} cy={cy - r * 0.34} r={r * 0.4} fill="#7A4A24" opacity="0.85" />
                </g>
            ))}
        </svg>
    );
}

export function FlappyIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="flpy" top="#7FE0EC" mid="#4EC0CA" bot="#2E9CA8" angle={170} /></defs>
            <rect width={S} height={S} fill="url(#flpy)" />
            <rect x="40" y="0"  width="12" height="20" rx="2" fill="#5BBA4A" />
            <rect x="40" y="34" width="12" height="26" rx="2" fill="#5BBA4A" />
            <rect x="38" y="16" width="16" height="6" rx="2" fill="#4C9E3E" />
            <rect x="38" y="30" width="16" height="6" rx="2" fill="#4C9E3E" />
            <ellipse cx="24" cy="31" rx="13" ry="11.5" fill="#FFD23E" />
            <ellipse cx="19" cy="34" rx="6.5" ry="4.5" fill="#F2B705" />
            <circle cx="29" cy="27" r="3.4" fill="#fff" />
            <circle cx="30.3" cy="27" r="1.6" fill="#1A1A1A" />
            <path d="M35,30 L43,28 L35,33 Z" fill="#F2860D" />
        </svg>
    );
}

function PasswordsIcon() {
    const BG = '#202022';
    const SHAFT = 'M -3.6 8 L -3.6 33 L 9 33 L 9 28 L 3.6 28 L 3.6 24.4 L 7.8 24.4 L 7.8 19.8 L 3.6 19.8 L 3.6 8 Z';
    const key = (grad: string, hole: boolean) => (
        <>
            <g fill={grad} stroke={BG} strokeWidth="2.4">
                <circle cx="0" cy="0" r="11.5" />
                <path d={SHAFT} />
            </g>
            <g fill={grad}>
                <circle cx="0" cy="0" r="11.5" />
                <path d={SHAFT} />
            </g>
            {hole && <circle cx="0" cy="-1" r="4.6" fill={BG} />}
        </>
    );
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <LinearGrad id="pwy" top="#FFE03D" bot="#F5A623" angle={160} />
                <LinearGrad id="pwg" top="#5BE372" bot="#1FAE43" angle={160} />
                <LinearGrad id="pwb" top="#56C8FF" bot="#0A6CDE" angle={160} />
            </defs>
            <rect width={S} height={S} fill={BG} />
            <g transform="translate(23 19.5)">{key('url(#pwy)', false)}</g>
            <g transform="translate(29.7 19)">{key('url(#pwg)', false)}</g>
            <g transform="translate(36.4 18.5)">{key('url(#pwb)', true)}</g>
        </svg>
    );
}

export function WordleIcon() {
    const g = '#6AAA64', y = '#C9B458', x = '#787C7E';
    const rows = [
        [x, y, x, x, g],
        [x, g, x, y, g],
        [y, g, x, x, g],
        [g, g, y, x, g],
        [g, g, g, g, g],
    ];
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <rect width={S} height={S} fill="#FFFFFF" />
            {rows.map((row, ri) => row.map((c, ci) => (
                <rect key={`${ri}-${ci}`} x={6 + ci * 10} y={6 + ri * 10} width="8" height="8" rx="1.6" fill={c} />
            )))}
        </svg>
    );
}

export function BlocksIcon() {
    const c = 11;
    const ox = 8, oy = 9;
    const cell = (cx: number, cy: number, fill: string) => (
        <rect key={`${cx}-${cy}`} x={ox + cx * c} y={oy + cy * c} width={c - 1.5} height={c - 1.5} rx="2" fill={fill} />
    );
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="blk" top="#3A3550" mid="#241F38" bot="#15111F" angle={150} /></defs>
            <rect width={S} height={S} fill="url(#blk)" />
            {cell(0, 0, '#A65CFF')}{cell(1, 0, '#A65CFF')}{cell(2, 0, '#A65CFF')}{cell(1, 1, '#A65CFF')}
            {cell(3, 2, '#F2C53D')}{cell(4, 2, '#F2C53D')}{cell(3, 3, '#F2C53D')}{cell(4, 3, '#F2C53D')}
            {cell(0, 2, '#36C9E0')}{cell(0, 3, '#36C9E0')}{cell(1, 3, '#36C9E0')}{cell(2, 3, '#36C9E0')}
        </svg>
    );
}

export function BlackjackIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="bjk" top="#22945A" mid="#16804A" bot="#0C5E36" angle={150} /></defs>
            <rect width={S} height={S} fill="url(#bjk)" />
            <g transform="rotate(-13 26 34)">
                <rect x="13" y="16" width="24" height="33" rx="4" fill="#F3F6F4" stroke="rgba(0,0,0,0.12)" strokeWidth="0.8" />
                <text x="25" y="36" textAnchor="middle" fontSize="15" fill="#E0233A" fontFamily="-apple-system,sans-serif">♥</text>
            </g>
            <g transform="rotate(9 34 32)">
                <rect x="25" y="13" width="24" height="34" rx="4" fill="#FFFFFF" stroke="rgba(0,0,0,0.12)" strokeWidth="0.8" />
                <text x="30" y="24" textAnchor="middle" fontSize="9" fontWeight="800" fill="#1A1A1A" fontFamily="-apple-system,sans-serif">A</text>
                <text x="37" y="38" textAnchor="middle" fontSize="16" fill="#1A1A1A" fontFamily="-apple-system,sans-serif">♠</text>
            </g>
        </svg>
    );
}

export function ClimberIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="clm" top="#9CCC52" mid="#7CB342" bot="#5C9A2A" angle={160} /></defs>
            <rect width={S} height={S} fill="url(#clm)" />
            <rect x="8"  y="46" width="18" height="5" rx="2.5" fill="#FFFFFF" opacity="0.92" />
            <rect x="34" y="36" width="18" height="5" rx="2.5" fill="#FFFFFF" opacity="0.92" />
            <rect x="13" y="24" width="18" height="5" rx="2.5" fill="#FFFFFF" opacity="0.92" />
            <g transform="translate(22 11)">
                <rect x="-7" y="0" width="14" height="13" rx="6" fill="#FFFFFF" />
                <circle cx="-2.5" cy="5" r="1.6" fill="#3A5A1E" />
                <circle cx="3" cy="5" r="1.6" fill="#3A5A1E" />
                <path d="M-3,9 Q0,11 3,9" fill="none" stroke="#3A5A1E" strokeWidth="1.2" strokeLinecap="round" />
            </g>
        </svg>
    );
}

function RailRunnerIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="rrn" top="#4A63A8" mid="#3C5290" bot="#2A3A66" angle={160} /></defs>
            <rect width={S} height={S} fill="url(#rrn)" />
            <path d="M22,52 L18,12 M30,52 L30,12 M38,52 L42,12" stroke="#FFFFFF" strokeOpacity="0.32" strokeWidth="2" strokeDasharray="4 5" strokeLinecap="round" />
            <circle cx="42" cy="22" r="5" fill="#FFC83A" stroke="#E0A000" strokeWidth="1.2" />
            <g transform="translate(30 36)">
                <rect x="-7" y="-6" width="14" height="16" rx="6" fill="#FF7A3C" />
                <circle cx="0" cy="-12" r="6.5" fill="#FFD9B0" />
                <path d="M-6.5,-12 A6.5,6.5 0 0 1 6.5,-12 Z" fill="#1E66D0" />
                <rect x="-5" y="10" width="4" height="8" rx="2" fill="#2E3550" />
                <rect x="1"  y="10" width="4" height="8" rx="2" fill="#2E3550" />
            </g>
        </svg>
    );
}

export function ConnectFourIcon() {
    const discs: Record<string, string> = {
        '0-2': '#F2C53D', '1-2': '#E0413B', '2-2': '#F2C53D',
        '2-1': '#E0413B', '1-1': '#F2C53D',
    };
    const cx = [16, 30, 44];
    const cy = [16, 30, 44];
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="c4" top="#2E78E8" mid="#1E66D0" bot="#1149A0" angle={150} /></defs>
            <rect width={S} height={S} fill="url(#c4)" />
            {cy.map((y, r) => cx.map((x, c) => (
                <circle key={`${c}-${r}`} cx={x} cy={y} r="6.2" fill={discs[`${c}-${r}`] ?? '#123E86'} />
            )))}
        </svg>
    );
}

export function BattleshipIcon() {
    const xs = [12, 24, 36, 48];
    const ys = [12, 24, 36, 48];
    const hit  = new Set(['1-1', '2-1', '0-3']);
    const miss = new Set(['3-0', '0-0']);
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="bship" top="#1E7C99" mid="#0E5070" bot="#06304A" angle={150} /></defs>
            <rect width={S} height={S} fill="url(#bship)" />
            {ys.map((y, r) => xs.map((x, c) => {
                const k = `${c}-${r}`;
                const fill = hit.has(k) ? '#FF5A5A' : miss.has(k) ? '#EAF2F8' : '#0A2A40';
                return <circle key={k} cx={x} cy={y} r="4.4" fill={fill} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />;
            }))}
        </svg>
    );
}

export function ChessIcon() {
    const strip = Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={i * 7.5} y={50} width={7.5} height={10} fill={i % 2 === 0 ? '#EBECD0' : '#769656'} />
    ));
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="chess" top="#54545A" mid="#3A3A40" bot="#222226" angle={150} /></defs>
            <rect width={S} height={S} fill="url(#chess)" />
            {strip}
            <text
                x="30" y="27" textAnchor="middle" dominantBaseline="central"
                fontSize="40" fill="#FAFAFA" stroke="#2B2B2B" strokeWidth="1.4"
                style={{ paintOrder: 'stroke' }}
            >
                ♞
            </text>
        </svg>
    );
}

function VibezIcon() {
    // Neon pulse wave on a twilight tile — the Vibez brand mark.
    const wave = 'M11,32 L19,32 L24,17 L31,45 L37,25 L41,32 L49,32';
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <radialGradient id="vbzBg" cx="28%" cy="18%" r="115%">
                    <stop offset="0%" stopColor="#2c1560" />
                    <stop offset="55%" stopColor="#180b36" />
                    <stop offset="100%" stopColor="#0a0518" />
                </radialGradient>
                <linearGradient id="vbzWave" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#8B5CF6" />
                    <stop offset="55%" stopColor="#C084FC" />
                    <stop offset="100%" stopColor="#F472B6" />
                </linearGradient>
            </defs>
            <rect width={S} height={S} fill="url(#vbzBg)" />
            <path d={wave} fill="none" stroke="url(#vbzWave)" strokeWidth="9.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
            <path d={wave} fill="none" stroke="url(#vbzWave)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function WeazelNewsIcon() {
    const NEWS_FONT = "Arial, 'Helvetica Neue', Inter, sans-serif";
    const bx = 5, by = 30.5, bw = 31, bh = 16.5;
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <linearGradient id="wzlbg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#E81F1F" />
                    <stop offset="0.55" stopColor="#C81616" />
                    <stop offset="1" stopColor="#8C0B0B" />
                </linearGradient>
                <mask id="wzlnews">
                    <rect x={bx} y={by} width={bw} height={bh} fill="#fff" />
                    <text
                        x={bx + bw / 2} y={by + bh / 2 + 6.1}
                        textAnchor="middle"
                        textLength="28.5"
                        lengthAdjust="spacingAndGlyphs"
                        fontFamily={NEWS_FONT}
                        fontSize="17"
                        fontWeight="900"
                        fill="#000"
                    >
                        NEWS
                    </text>
                </mask>
            </defs>
            <rect width={S} height={S} fill="url(#wzlbg)" />

            <text
                x="30" y="26.5"
                textAnchor="middle"
                textLength="53"
                lengthAdjust="spacingAndGlyphs"
                fontFamily={NEWS_FONT}
                fontSize="19"
                fontWeight="900"
                fill="#fff"
            >
                WEAZEL
            </text>

            <rect x={bx} y={by} width={bw} height={bh} fill="#fff" mask="url(#wzlnews)" />

            {[0, 1, 2, 3].map(i => (
                <rect key={i} x="39" y={by + 0.5 + i * 4.5} width="16" height="2.5" fill="#fff" />
            ))}
        </svg>
    );
}

type IconComponent = React.FC;

function VoiceMemosIcon() {
    const heights = [12, 24, 16, 38, 46, 32, 20, 28, 14];
    const bw = 3, gap = 3.2;
    const total = heights.length * bw + (heights.length - 1) * gap;
    const x0 = (S - total) / 2;
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <LinearGrad id="vmbg" top="#3A3A3C" bot="#161618" angle={160} />
            </defs>
            <rect width={S} height={S} fill="url(#vmbg)" />
            {heights.map((h, i) => (
                <rect key={i} x={x0 + i * (bw + gap)} y={(S - h) / 2} width={bw} height={h} rx={bw / 2} fill="#FFFFFF" />
            ))}
        </svg>
    );
}

function StocksIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="stkbg" top="#22D67F" mid="#16C784" bot="#0E9C63" angle={160} /></defs>
            <rect width={S} height={S} fill="url(#stkbg)" />
            <g opacity="0.30" fill="#FFFFFF">
                <rect x="13" y="40" width="4" height="9"  rx="1.4" />
                <rect x="22" y="36" width="4" height="13" rx="1.4" />
                <rect x="31" y="41" width="4" height="8"  rx="1.4" />
                <rect x="40" y="33" width="4" height="16" rx="1.4" />
            </g>
            <polyline points="11,41 22,32 31,37 47,17" fill="none" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M47 17 L39.5 17 M47 17 L47 24.5" fill="none" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="11" cy="41" r="2.3" fill="#FFFFFF" />
            <circle cx="22" cy="32" r="2.3" fill="#FFFFFF" />
            <circle cx="31" cy="37" r="2.3" fill="#FFFFFF" />
        </svg>
    );
}

function RadioIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <LinearGrad id="rdbg" top="#3C3C3E" mid="#262628" bot="#161618" angle={160} />
                <RadialGrad id="rdsh" inner="rgba(255,255,255,0.13)" outer="rgba(255,255,255,0)" cx="32%" cy="15%" />
            </defs>
            <rect width={S} height={S} fill="url(#rdbg)" />
            <rect width={S} height={S} fill="url(#rdsh)" />

            <rect x="24.5" y="7.5" width="3" height="10" rx="1.5" fill="#FFFFFF" />

            <rect x="22" y="16" width="16" height="32" rx="4.6" fill="#FFFFFF" />

            <g stroke="#262628" strokeWidth="1.6" strokeLinecap="round">
                <line x1="25.6" y1="21" x2="34.4" y2="21" />
                <line x1="25.6" y1="24" x2="34.4" y2="24" />
            </g>

            <rect x="25.3" y="28" width="9.4" height="9" rx="2" fill="#262628" />
            <circle cx="30" cy="42.6" r="2" fill="#262628" />
        </svg>
    );
}

function ReviewIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs><LinearGrad id="rv" top="#FF6B6B" mid="#F03E3E" bot="#C92A2A" /></defs>
            <rect width={S} height={S} fill="url(#rv)" />
            <path d="M11 13h38a4 4 0 0 1 4 4v18a4 4 0 0 1-4 4H26l-9 8 1.5-8H11a4 4 0 0 1-4-4V17a4 4 0 0 1 4-4z" fill="#FFFFFF" />
            <path
                transform="translate(18 12) scale(1)"
                d="M12 3.2l2.7 5.47 6.04.88-4.37 4.26 1.03 6.02L12 17.06l-5.4 2.84 1.03-6.02L3.26 9.55l6.04-.88z"
                fill="#FF9F0A"
            />
        </svg>
    );
}

const FLAME_D =
    'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z';

function StreaksIcon() {
    return (
        <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
            <defs>
                <LinearGrad id="strkbg" top="#F07E18" mid="#E84A0E" bot="#BC1906" angle={160} />
                <linearGradient id="strkflame" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0"   stopColor="#FFFFFF" />
                    <stop offset="1"   stopColor="#FFF1DE" />
                </linearGradient>
                <linearGradient id="strkcore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0"    stopColor="#FFE873" />
                    <stop offset="0.5"  stopColor="#FFC23B" />
                    <stop offset="1"    stopColor="#FF8A1E" />
                </linearGradient>
                <filter id="strksh" x="-35%" y="-35%" width="170%" height="170%">
                    <feDropShadow dx="0" dy="1" stdDeviation="1.3"
                        floodColor="#6E1300" floodOpacity="0.5" />
                </filter>
            </defs>
            <rect width={S} height={S} fill="url(#strkbg)" />
            <svg x="8" y="5.5" width="44" height="49" viewBox="0 0 24 24" filter="url(#strksh)">
                <path d={FLAME_D} fill="url(#strkflame)" />
            </svg>
            <svg x="15.5" y="15" width="29" height="34" viewBox="0 0 24 24">
                <path d={FLAME_D} fill="url(#strkcore)" />
            </svg>
            <path d={`M0 0 H${S} V19 Q${S / 2} 27 0 19 Z`} fill="rgba(255,255,255,0.13)" />
        </svg>
    );
}

const ICON_MAP: Record<string, IconComponent> = {
    phone:    PhoneIcon,
    messages: MessagesIcon,
    services: ServicesIcon,
    pages:    PagesIcon,
    review:     ReviewIcon,
    marketplace: MarketplaceIcon,
    radio:    RadioIcon,
    mail:     MailIcon,
    safari:    SafariIcon,
    compass:  CompassIcon,
    maps:     MapsIcon,
    findfriends: FindFriendsIcon,
    stocks:   StocksIcon,
    ryde:     RydeIcon,
    camera:   CameraIcon,
    photos:   PhotosIcon,
    music:    MusicIcon,
    wallet:   WalletIcon,
    weather:  WeatherIcon,
    clock:    ClockIcon,
    calendar: CalendarIcon,
    notes:    NotesIcon,
    documents: DocumentsIcon,
    voicememos: VoiceMemosIcon,
    bank:     BankIcon,
    settings: SettingsIcon,
    appstore: AppStoreIcon,
    health:      HealthIcon,
    groups:      GroupsIcon,
    calculator:  CalculatorIcon,
    birdy:       BirdyIcon,
    darkchat:    DarkChatIcon,
    cherry:      CherryIcon,
    photogram:   PhotogramIcon,
    garages:     GaragesIcon,
    homes:       HomesIcon,
    cookie:      CookieIcon,
    passwords:   PasswordsIcon,
    wordle:      WordleIcon,
    flappy:      FlappyIcon,
    blocks:      BlocksIcon,
    blackjack:   BlackjackIcon,
    climber:     ClimberIcon,
    railrunner:  RailRunnerIcon,
    connectfour: ConnectFourIcon,
    chess:       ChessIcon,
    battleship:  BattleshipIcon,
    vibez:       VibezIcon,
    weazelnews:  WeazelNewsIcon,
    streaks:     StreaksIcon,
};

export type IconId = string;

export function AppIconSVG({ icon, size }: { icon: IconId; size?: number }) {
    if (icon.startsWith('custom:')) return <CustomAppTile appId={icon.slice(7)} size={size} />;
    const Component = ICON_MAP[icon];
    if (!Component) return <CustomAppTile appId={icon} size={size} />;
    if (size == null) return <Component />;
    return (
        <div style={{ position: 'relative', width: size, height: size, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: S, height: S, transform: `scale(${size / S})`, transformOrigin: 'top left' }}>
                <Component />
            </div>
        </div>
    );
}

function CustomAppTile({ appId, size }: { appId: string; size?: number }) {
    const app = useCustomAppsStore(s => s.apps.find(a => a.id === appId));
    const [failed, setFailed] = useState(false);
    const dim = size ?? S;
    const url = app?.icon;
    const name = app?.name ?? appId;

    if (url && !failed) {
        return (
            <div style={{ width: dim, height: dim, overflow: 'hidden' }}>
                <img
                    src={url}
                    alt=""
                    draggable={false}
                    onError={() => setFailed(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
            </div>
        );
    }

    const letters = name.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?';
    return (
        <div
            style={{
                width: dim, height: dim,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(150deg, ${customAccent(appId)}, rgba(0,0,0,0.32))`,
                color: '#fff',
                fontFamily: 'var(--font-sf, system-ui, sans-serif)',
                fontWeight: 700,
                fontSize: dim * 0.42,
                letterSpacing: '-0.03em',
                lineHeight: 1,
            }}
        >
            {letters}
        </div>
    );
}

