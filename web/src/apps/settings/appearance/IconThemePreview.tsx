import { useEffect, useRef, useState } from 'react';
import { Pin } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import { t } from '@/i18n';
import { AppGlyph } from '@/shell/AppGlyphs';
import { resolveWallpaper } from '@/shell/wallpapers';
import { resolveDraftAppearance } from '@/stores/iconThemeStore';
import type { IconAppearance, IconThemeDraft } from '@/stores/iconThemeStore';
import { PREVIEW_APPS } from './iconThemeCatalog';
import type { ThemeApp } from './iconThemeCatalog';

const REFERENCE_TILE = 78;

export function ThemeTile({ look, icon, label, size }: {
    look:  IconAppearance;
    icon:  string;
    label: string;
    size:  number;
}) {
    const shadow = look.boxShadow
        ? `${look.boxShadow}, 0 2px 8px rgba(0,0,0,0.34)`
        : '0 2px 8px rgba(0,0,0,0.34), inset 0 0 0 0.5px rgba(255,255,255,0.12)';

    const style = {
        width:        size,
        height:       size,
        borderRadius: `${look.radius * 100}%`,
        boxShadow:    shadow,
        '--sd-glyph-weight': String(look.glyphWeight),
    } as CSSProperties;

    return (
        <span
            className="relative block shrink-0 overflow-hidden [&_svg]:[stroke-width:var(--sd-glyph-weight)]"
            style={style}
        >
            <span className="flex h-full w-full items-center justify-center" style={{ background: look.background }}>
                <AppGlyph
                    icon={icon}
                    label={label}
                    color={look.glyph}
                    size={Math.max(8, Math.round(look.glyphSize * (size / REFERENCE_TILE)))}
                />
            </span>
        </span>
    );
}

function StagePin({ pinned, onToggle }: { pinned: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            aria-pressed={pinned}
            aria-label={pinned
                ? t('settings.iconThemeUnpin', 'Unpin the preview')
                : t('settings.iconThemePin', 'Pin the preview')}
            onClick={onToggle}
            className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition-colors active:scale-90 ${
                pinned ? 'bg-white/90 ring-black/[0.06]' : 'bg-black/35 ring-white/[0.16]'
            }`}
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.28)' }}
        >
            <Pin
                className={`h-[15px] w-[15px] ${pinned ? 'text-ios-blue' : 'text-white'}`}
                fill="none"
                strokeWidth={2.2}
            />
        </button>
    );
}

export function ThemeStage({ wallpaper, badge, hint, pinned = false, onTogglePin, children }: {
    wallpaper:    string;
    badge?:       ReactNode;
    hint?:        string;
    pinned?:      boolean;
    onTogglePin?: () => void;
    children:     ReactNode;
}) {
    const inner = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState<number>();

    useEffect(() => {
        const el = inner.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return (
        <div className={pinned ? 'sticky top-0 z-20 bg-[#d4d4d4] dark:bg-base' : ''}>
            <div className="mx-4">
                <div
                    className="relative overflow-hidden rounded-[14px]"
                    style={{
                        backgroundImage:    `url(${resolveWallpaper(wallpaper)})`,
                        backgroundSize:     'cover',
                        backgroundPosition: 'center',
                        height,
                        transition:         'height 240ms cubic-bezier(0.32,0.72,0,1)',
                    }}
                >
                    <div ref={inner} className="bg-black/25">
                        <div className="flex items-center justify-between gap-2 px-2.5 pt-2.5">
                            <span className="min-w-0">{badge}</span>
                            {onTogglePin && <StagePin pinned={pinned} onToggle={onTogglePin} />}
                        </div>
                        {children}
                    </div>
                </div>
                {hint && !pinned && (
                    <p className="px-3 pt-2 text-[13px] font-normal text-ios-gray">{hint}</p>
                )}
            </div>
            {pinned && <div className="mt-2 h-[0.5px] bg-ios-gray4 dark:bg-control" />}
        </div>
    );
}

export function StageBadge({ label }: { label: string }) {
    return (
        <span className="block truncate rounded-full bg-black/55 px-2.5 py-[3px] text-[11px] font-semibold uppercase tracking-wider text-white">
            {label}
        </span>
    );
}

export function ThemeTileLabel({ look, label, fallbackShow, small = false }: {
    look:         IconAppearance;
    label:        string;
    fallbackShow: boolean;
    small?:       boolean;
}) {
    if (!(look.labelShow ?? fallbackShow)) return null;
    return (
        <span
            className={`w-full truncate px-0.5 text-center font-sf tracking-[0.01em] ${small ? 'text-[10px]' : 'text-[11px]'}`}
            style={{
                color:      look.labelColor ?? '#ffffff',
                fontWeight: look.labelWeight ?? 600,
                textShadow: '0 1px 3px rgba(0,0,0,0.95)',
            }}
        >
            {label}
        </span>
    );
}

export function ThemePreviewGrid({ draft, showAppNames, pinned = false, apps = PREVIEW_APPS }: {
    draft:        IconThemeDraft;
    showAppNames: boolean;
    pinned?:      boolean;
    apps?:        ThemeApp[];
}) {
    const shown = pinned ? apps.slice(0, 5) : apps;
    const size  = pinned ? 44 : 66;

    return (
        <div className={pinned
            ? 'flex items-start justify-around px-3 pb-3 pt-2'
            : 'grid grid-cols-4 gap-y-5 px-3 pb-6 pt-3'}
        >
            {shown.map(app => {
                const look = resolveDraftAppearance(draft, app.id, app.accent);
                return (
                    <div
                        key={app.id}
                        className="flex flex-col items-center gap-[5px]"
                        style={pinned ? { width: 62 } : undefined}
                    >
                        <ThemeTile look={look} icon={look.icon ?? app.icon} label={app.label} size={size} />
                        <ThemeTileLabel look={look} label={app.label} fallbackShow={showAppNames} small={pinned} />
                    </div>
                );
            })}
        </div>
    );
}
