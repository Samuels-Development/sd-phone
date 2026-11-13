import { useCallback, useEffect, useState } from 'react';

import { useNuiEvent } from '@/hooks/useNuiEvent';
import { fetchNui, isFiveM } from '@/core/nui';
import { useDeckActive } from '@/shell/deckActive';
import { usePinStyle } from './MapView';

export interface SelfLocation { x: number; y: number; h: number }

let selfWatchers = 0;

export function useSelfLocation(dev: SelfLocation = { x: -1037, y: -2738, h: 0 }): SelfLocation | null {
    const active = useDeckActive();
    const [me, setMe] = useState<SelfLocation | null>(isFiveM ? null : dev);
    useNuiEvent('sd-phone:maps:location', useCallback((d) => {
        if (d) setMe({ x: d.x, y: d.y, h: d.h });
    }, []));
    useEffect(() => {
        if (!isFiveM || !active) return;
        selfWatchers += 1;
        if (selfWatchers === 1) void fetchNui('sd-phone:maps:watch', { on: true });
        return () => {
            selfWatchers -= 1;
            if (selfWatchers === 0) void fetchNui('sd-phone:maps:watch', { on: false });
        };
    }, [active]);
    return me;
}

export function LiveDot({ x, y, heading }: { x: number; y: number; heading: number }) {
    const style = usePinStyle(x, y);
    return (
        <div style={{ ...style, width: 0, height: 0, pointerEvents: 'none', zIndex: 26 }}>
            <span style={{
                position: 'absolute', left: -22, top: -22, width: 44, height: 44, borderRadius: 9999,
                background: 'radial-gradient(circle, rgba(10,132,255,0.28) 0%, rgba(10,132,255,0.10) 55%, rgba(10,132,255,0) 72%)',
                animation: 'sdmap-locpulse 2.6s ease-out infinite',
            }} />
            <span style={{ position: 'absolute', left: 0, top: 0, transform: `rotate(${-heading}deg)` }}>
                <svg width="64" height="64" viewBox="-32 -32 64 64" style={{ position: 'absolute', left: -32, top: -32, display: 'block' }}>
                    <defs>
                        <radialGradient id="sdloc-beam" cx="0.5" cy="0.5" r="0.5">
                            <stop offset="0" stopColor="#0a84ff" stopOpacity="0.5" />
                            <stop offset="0.65" stopColor="#0a84ff" stopOpacity="0.16" />
                            <stop offset="1" stopColor="#0a84ff" stopOpacity="0" />
                        </radialGradient>
                    </defs>
                    <path d="M0 0 L-13.5 -28 A31 31 0 0 1 13.5 -28 Z" fill="url(#sdloc-beam)" />
                </svg>
            </span>
            <span style={{
                position: 'absolute', left: -10, top: -10, width: 20, height: 20, borderRadius: 9999,
                background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.35), 0 0 0 0.5px rgba(0,0,0,0.08)',
            }}>
                <span style={{
                    position: 'absolute', left: 3, top: 3, width: 14, height: 14, borderRadius: 9999,
                    background: 'linear-gradient(180deg, #41a0ff 0%, #0a84ff 100%)',
                }} />
            </span>
            <style>{`@keyframes sdmap-locpulse {
                0%   { transform: scale(0.7);  opacity: 0.9; }
                70%  { transform: scale(1.35); opacity: 0.25; }
                100% { transform: scale(1.6);  opacity: 0; }
            }`}</style>
        </div>
    );
}
