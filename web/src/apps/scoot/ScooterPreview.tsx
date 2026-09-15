import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Rotate3D, RotateCcw } from 'lucide-react';

import { t } from '@/i18n';
import { useDeckActive } from '@/shell/deckActive';
import poster from './assets/scooter-poster.png';
import { EXTRAS } from './customization';
import type { Customization } from './customization';
import type { createPreview } from './previewScene';

const ROUND_BUTTON = 'flex h-[34px] w-[34px] items-center justify-center rounded-full bg-elevated text-black shadow-sm ring-1 ring-black/[0.04] transition-transform active:scale-95 disabled:opacity-40 dark:text-white dark:ring-white/[0.06]';

export function ScooterPreview({ colour, name, customization = EXTRAS.defaults, full = false, onExpand, onCollapse }: {
    customization?: Customization;
    colour:      string;
    name:        string;
    full?:       boolean;
    onExpand?:   () => void;
    onCollapse?: () => void;
}) {
    const host = useRef<HTMLDivElement>(null);
    const api = useRef<Awaited<ReturnType<typeof createPreview>> | null>(null);
    const extras = useRef(customization); extras.current = customization;
    const selected = useRef(colour); selected.current = colour;
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

    useEffect(() => {
        let alive = true;
        void import('./previewScene').then(async ({ createPreview }) => {
            if (!alive || !host.current) return;
            const scene = await createPreview(host.current, selected.current, () => alive && setStatus('ready'), () => alive && setStatus('error'));
            if (!alive) scene.dispose(); else { api.current = scene; scene.colour(selected.current); scene.extras(extras.current); }
        }).catch(() => { if (alive) setStatus('error'); });
        return () => { alive = false; api.current?.dispose(); api.current = null; };
    }, []);
    useEffect(() => { api.current?.colour(colour); }, [colour]);

    useEffect(() => { api.current?.extras(customization); }, [customization]);

    const active = useDeckActive();
    useEffect(() => {
        if (!active) return;
        api.current?.refresh();
        const settle = window.setTimeout(() => api.current?.refresh(), 450);
        return () => window.clearTimeout(settle);
    }, [active]);

    const caption = status === 'loading' ? t('scoot.loadingModel', 'Loading your scooter…')
        : status === 'error' ? t('scoot.previewFallback', 'Model photo · 3D unavailable')
        : t('scoot.dragRotate', 'Drag to explore');

    return (
        <div className={`relative isolate overflow-hidden bg-surface ${full ? 'min-h-0 flex-1' : 'h-[236px] rounded-[22px] ring-1 ring-black/[0.04] dark:ring-white/[0.06]'}`}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_55%_85%,rgba(20,184,166,0.22),transparent_65%)] dark:bg-[radial-gradient(ellipse_at_55%_85%,rgba(20,184,166,0.28),transparent_65%)]" />
            <div
                className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgba(0,0,0,0.16),transparent_70%)] dark:bg-[radial-gradient(ellipse,rgba(0,0,0,0.5),transparent_70%)]"
                style={full ? { bottom: '22%', width: 300, height: 100 } : { bottom: 30, width: 210, height: 66 }}
            />
            <div
                ref={host}
                role="img"
                tabIndex={0}
                aria-label={t('scoot.previewLabel', '{colour} scooter. Drag or use arrow keys to rotate.', { colour: name })}
                className="absolute inset-0 cursor-grab touch-none outline-none active:cursor-grabbing [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full"
                onKeyDown={e => {
                    if (e.key === 'Escape') onCollapse?.();
                    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); api.current?.rotate(e.key === 'ArrowLeft' ? -0.25 : 0.25); }
                    if (e.key === '+' || e.key === '=' || e.key === '-') { e.preventDefault(); api.current?.zoom(e.key === '-' ? 1.15 : 0.87); }
                }}
            />
            {status !== 'ready' && (
                <img className="pointer-events-none absolute inset-0 h-full w-full object-contain" src={poster} alt={t('scoot.previewPoster', 'Scooter model')} />
            )}
            <div className="pointer-events-none absolute inset-x-3 flex items-center justify-between" style={{ top: full ? 8 : 12 }}>
                <span className="flex items-center gap-1.5 rounded-full bg-black/[0.06] px-2.5 py-1 text-[13px] font-semibold text-black/60 dark:bg-white/10 dark:text-white/70">
                    <Rotate3D className="h-[14px] w-[14px]" strokeWidth={2.2} /> {t('scoot.preview360', '360° preview')}
                </span>
                {full ? (
                    <button type="button" aria-label={t('scoot.closePreview', 'Close full preview')} onClick={onCollapse} className={`pointer-events-auto ${ROUND_BUTTON}`}>
                        <Minimize2 className="h-[16px] w-[16px]" strokeWidth={2.2} />
                    </button>
                ) : (
                    <button type="button" aria-label={t('scoot.expandPreview', 'Expand model preview')} onClick={onExpand} className={`pointer-events-auto ${ROUND_BUTTON}`}>
                        <Maximize2 className="h-[16px] w-[16px]" strokeWidth={2.2} />
                    </button>
                )}
            </div>
            <div className="pointer-events-none absolute inset-x-3 flex items-center justify-between" style={{ bottom: full ? 'calc(var(--safe-bottom) + 12px)' : 12 }}>
                <span className="text-[13px] font-medium text-ios-gray">{caption}</span>
                <button type="button" aria-label={t('scoot.resetView', 'Reset view')} disabled={status !== 'ready'} onClick={() => api.current?.reset()} className={`pointer-events-auto ${ROUND_BUTTON}`}>
                    <RotateCcw className="h-[16px] w-[16px]" strokeWidth={2.2} />
                </button>
            </div>
        </div>
    );
}
