import { useState } from 'react';

import { t } from '@/i18n';

export function Avatar({ size = 40, src }: { size?: number; src?: string }) {
    return (
        <div
            className="shrink-0 overflow-hidden rounded-full bg-[#ccd6dd]"
            style={{ width: size, height: size }}
        >
            {src ? (
                <img src={src} alt="" draggable={false} className="h-full w-full object-cover" />
            ) : (
                <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden>
                    <circle cx="20" cy="15.5" r="7.5" fill="#8b98a5" />
                    <path d="M3,40 C3,28 9.5,23 20,23 C30.5,23 37,28 37,40 Z" fill="#8b98a5" />
                </svg>
            )}
        </div>
    );
}

export function VerifiedBadge({ size = 16 }: { size?: number }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} aria-label={t('birdy.verified', 'Verified')} className="shrink-0">
            <circle cx="12" cy="12" r="11" fill="#1d9bf0" />
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


export function PersonGlyph({ className, color }: { className?: string; color?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill={color ?? 'currentColor'} aria-hidden>
            <circle cx="12" cy="8" r="4" />
            <path d="M4,21 C4,15.8 7.6,13.2 12,13.2 C16.4,13.2 20,15.8 20,21 Z" />
        </svg>
    );
}

export function RichText({ text }: { text: string }) {
    const nodes: React.ReactNode[] = [];
    const re = /[@#][A-Za-z0-9_]+/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) nodes.push(text.slice(last, m.index));
        nodes.push(<span key={m.index} style={{ color: '#1d9bf0' }}>{m[0]}</span>);
        last = m.index + m[0].length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return <>{nodes}</>;
}

/** Post media that keeps its box while loading (no layout shift) and fades the pixels in when
 *  they arrive, over the same placeholder grey the skeletons use. */
function FadeImg({ src, height }: { src: string; height: number }) {
    const [loaded, setLoaded] = useState(false);
    return (
        <div className="w-full bg-black/[0.06]" style={{ height }}>
            <img
                src={src}
                alt=""
                draggable={false}
                onLoad={() => setLoaded(true)}
                className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
        </div>
    );
}

export function PostImages({ images }: { images?: string[] }) {
    if (!images || images.length === 0) return null;
    const n = images.length;
    const h = n === 1 ? 300 : n === 2 ? 220 : 150;
    return (
        <div
            className="mt-3 grid gap-0.5 overflow-hidden rounded-[16px] border border-black/10"
            style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
        >
            {images.map((src, i) => <FadeImg key={`${src}-${i}`} src={src} height={h} />)}
        </div>
    );
}
