import { useState } from 'react';

import { t } from '@/i18n';
import { ACCENT } from './data';

export function Avatar({ size = 40, src }: { size?: number; src?: string }) {
    return (
        <div
            className="shrink-0 overflow-hidden rounded-full bg-white/10"
            style={{ width: size, height: size }}
        >
            {src ? (
                <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : (
                <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>
                    <circle cx="20" cy="15.5" r="7.5" fill="#6b6478" />
                    <path d="M3,40 C3,28 9.5,23 20,23 C30.5,23 37,28 37,40 Z" fill="#6b6478" />
                </svg>
            )}
        </div>
    );
}

export function VerifiedBadge({ size = 14 }: { size?: number }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-label={t('vibez.verified', 'Verified')} className="shrink-0">
            <circle cx="12" cy="12" r="11" fill={ACCENT} />
            <path
                d="M6.8 12.4 L10.2 15.7 L17.2 8.4"
                fill="none"
                stroke="#fff"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function FadeImg({ src, className }: { src: string; className?: string }) {
    const [loaded, setLoaded] = useState(false);
    return (
        <img
            src={src}
            alt=""
            draggable={false}
            onLoad={() => setLoaded(true)}
            className={`${className ?? ''} transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
    );
}

export function Shimmer({ className }: { className?: string }) {
    return (
        <div
            className={`animate-shimmer rounded-[10px] ${className ?? ''}`}
            style={{
                backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.13) 50%, rgba(255,255,255,0.05) 100%)',
                backgroundSize: '300% 100%',
            }}
            aria-hidden
        />
    );
}

export function GridSkeleton({ count = 9 }: { count?: number }) {
    return (
        <div className="grid grid-cols-3 gap-[3px]">
            {Array.from({ length: count }, (_, i) => (
                <Shimmer key={i} className="aspect-[9/14] rounded-none" />
            ))}
        </div>
    );
}

export function ListSkeleton({ count = 7 }: { count?: number }) {
    return (
        <div className="flex flex-col gap-4 px-4 pt-3">
            {Array.from({ length: count }, (_, i) => (
                <div key={i} className="flex items-center gap-3">
                    <Shimmer className="h-11 w-11 rounded-full" />
                    <div className="flex flex-1 flex-col gap-2">
                        <Shimmer className="h-3 w-1/3" />
                        <Shimmer className="h-2.5 w-2/3" />
                    </div>
                </div>
            ))}
        </div>
    );
}
