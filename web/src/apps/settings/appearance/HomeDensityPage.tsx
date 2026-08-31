import { Check } from 'lucide-react';

import { device } from '@device';
import { DENSITIES, DOCK_BOTTOM, DOCK_PAD_Y, gridFor, gridPreview, ICON_SCALE_MAX, ICON_SCALE_MIN, ICON_SCALE_STEP } from '@/device/grid';
import type { Density } from '@/device/types';
import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useTheme } from '@/stores/themeStore';
import { resolveWallpaper } from '@/shell/wallpapers';
import { DOCK_STYLES, type DockStyle } from '@/shell/shellLook';
import { NavBar } from '@/ui/NavBar';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';

const PREVIEW_MAX_H = 150;
const PREVIEW_MAX_W = 150;
const SCALE = Math.min(PREVIEW_MAX_H / device.screen.h, PREVIEW_MAX_W / device.screen.w);
const PREVIEW_W = Math.round(device.screen.w * SCALE);
const PREVIEW_H = Math.round(device.screen.h * SCALE);
const DOCK_ICONS = 4;

function label(d: Density): string {
    if (d === 'compact') return t('settings.homeDensityCompact', 'More');
    if (d === 'large')   return t('settings.homeDensityLarge', 'Bigger');
    return t('settings.homeDensityDefault', 'Default');
}

function describe(d: Density): string {
    const g = gridFor(d);
    const vars = { cols: g.cols, rows: g.rows, count: g.cols * g.rows };
    if (d === 'compact') return t('settings.homeDensityCompactHint', '{cols} x {rows}, so {count} apps fit a page. The smallest icons.', vars);
    if (d === 'large')   return t('settings.homeDensityLargeHint', '{cols} x {rows}, so {count} apps fit a page. The largest icons, and the easiest to tap.', vars);
    return t('settings.homeDensityDefaultHint', '{cols} x {rows}, so {count} apps fit a page. The size the phone ships with.', vars);
}

function DensityPreview({ density, wallpaper, scale }: { density: Density; wallpaper: string; scale: number }) {
    const g = gridPreview(density, scale);
    const tile = g.icon * SCALE;
    const dockH = (g.icon + DOCK_PAD_Y) * SCALE;

    return (
        <div
            className="relative shrink-0 overflow-hidden"
            style={{
                width:              PREVIEW_W,
                height:             PREVIEW_H,
                borderRadius:       Math.max(6, (device.screen.radius - device.screen.bezel) * SCALE * 2),
                backgroundImage:    `url(${resolveWallpaper(wallpaper)})`,
                backgroundSize:     'cover',
                backgroundPosition: 'center',
                boxShadow:          'inset 0 0 0 0.5px rgba(255,255,255,0.22), 0 1px 4px rgba(0,0,0,0.3)',
            }}
        >
            {Array.from({ length: g.cols * g.rows }, (_, i) => (
                <div
                    key={i}
                    className="absolute bg-white/85"
                    style={{
                        left:         (g.padX + (i % g.cols) * g.colStride) * SCALE,
                        top:          (g.stripTop + g.rowY0 + Math.floor(i / g.cols) * g.rowStride) * SCALE,
                        width:        tile,
                        height:       tile,
                        borderRadius: '27.6%',
                    }}
                />
            ))}

            <div
                className="absolute flex items-center justify-around"
                style={{
                    left:            g.padX * SCALE,
                    right:           g.padX * SCALE,
                    bottom:          DOCK_BOTTOM * SCALE,
                    height:          dockH,
                    borderRadius:    dockH / 2.8,
                    background:      'rgba(255,255,255,0.22)',
                }}
            >
                {Array.from({ length: DOCK_ICONS }, (_, i) => (
                    <div
                        key={i}
                        className="bg-white/85"
                        style={{ width: tile, height: tile, borderRadius: '27.6%' }}
                    />
                ))}
            </div>
        </div>
    );
}

function DockPreview({ style, wallpaper }: { style: DockStyle; wallpaper: string }) {
    const tray =
        style === 'glass'   ? { background: 'rgba(255,255,255,0.3)',    border: '0.5px solid rgba(255,255,255,0.5)' }
      : style === 'tinted'  ? { background: 'rgb(var(--ios-blue) / 0.5)', border: '0.5px solid rgba(255,255,255,0.45)' }
      : style === 'solid'   ? { background: 'rgba(0,0,0,0.5)',          border: '0.5px solid rgba(255,255,255,0.2)' }
      : style === 'outline' ? { background: 'transparent',              border: '0.5px solid rgba(255,255,255,0.7)' }
      : {};

    return (
        <div
            className="relative shrink-0 overflow-hidden"
            style={{
                width:              54,
                height:             40,
                borderRadius:       7,
                backgroundImage:    `url(${resolveWallpaper(wallpaper)})`,
                backgroundSize:     'cover',
                backgroundPosition: 'center',
                boxShadow:          'inset 0 0 0 0.5px rgba(255,255,255,0.22)',
            }}
        >
            {style !== 'hidden' && (
                <div
                    className="absolute bottom-[5px] left-[5px] right-[5px] flex items-center justify-around"
                    style={{ height: 13, borderRadius: 5, ...tray }}
                >
                    {Array.from({ length: DOCK_ICONS }, (_, i) => (
                        <div key={i} className="bg-white/85" style={{ width: 7, height: 7, borderRadius: 2 }} />
                    ))}
                </div>
            )}
        </div>
    );
}

export function HomeDensityPage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const {
        homeDensity, setHomeDensity, homeIconScale, setHomeIconScale, wallpaperHome,
        dockStyle, setDockStyle,
        wallpaperParallax, setWallpaperParallax,
    } = useTheme('homeDensity', 'setHomeDensity', 'homeIconScale', 'setHomeIconScale', 'wallpaperHome', 'dockStyle', 'setDockStyle', 'wallpaperParallax', 'setWallpaperParallax');

    const DOCK_LABEL: Record<DockStyle, string> = {
        glass:   t('settings.dockGlass', 'Glass'),
        tinted:  t('settings.dockTinted', 'Tinted'),
        solid:   t('settings.dockSolid', 'Solid'),
        outline: t('settings.dockOutline', 'Outline'),
        clear:   t('settings.dockClear', 'Clear'),
        hidden:  t('settings.dockHidden', 'Hidden'),
    };

    const DOCK_HINT: Record<DockStyle, string> = {
        glass:   t('settings.dockGlassHint', 'A frosted tray. The default.'),
        tinted:  t('settings.dockTintedHint', 'Frosted in your accent colour.'),
        solid:   t('settings.dockSolidHint', 'A flat dark tray, no frosting.'),
        outline: t('settings.dockOutlineHint', 'A thin outline, nothing inside.'),
        clear:   t('settings.dockClearHint', 'Icons only, no tray.'),
        hidden:  t('settings.dockHiddenHint', 'No dock at all.'),
    };

    return (
        <div
            className="absolute inset-0 z-20 flex flex-col bg-base text-black dark:text-white"
            style={pageStyle}
        >
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar
                backLabel={t('settings.settings', 'Settings')}
                onBack={goBack}
                title={t('settings.homeDensity', 'Home Screen')}
                hairline
            />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-3 px-4 pb-12">
                    {DENSITIES.map(d => {
                        const selected = d === homeDensity;
                        return (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setHomeDensity(d)}
                                className={`relative flex items-center gap-4 rounded-[14px] bg-surface px-4 py-4 text-left active:opacity-70 ${selected ? 'ring-2 ring-ios-blue' : ''}`}
                            >
                                <DensityPreview density={d} wallpaper={wallpaperHome} scale={homeIconScale} />
                                <span className="flex min-w-0 flex-1 flex-col gap-1.5 pr-7">
                                    <span className="text-[20px] font-semibold leading-tight">{label(d)}</span>
                                    <span className="text-[15px] leading-snug text-ios-gray">{describe(d)}</span>
                                </span>
                                {selected && (
                                    <span className="absolute right-3 top-3 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ios-blue">
                                        <Check className="h-[14px] w-[14px] text-white" strokeWidth={3} />
                                    </span>
                                )}
                            </button>
                        );
                    })}

                    <p className="mt-1 px-1 text-[13px] leading-snug text-ios-gray">
                        {t('settings.homeDensityHint', 'Your apps rearrange to suit the new grid. Widgets keep their size and move to the nearest free space, and nothing is removed.')}
                    </p>

                    <p className="mb-1 mt-5 px-1 text-[12px] uppercase tracking-widest text-ios-gray">
                        {t('settings.iconSize', 'Icon size')}
                    </p>
                    <div className="rounded-[14px] bg-surface px-4 py-4">
                        <div className="mb-3 flex items-baseline justify-between">
                            <span className="text-[16px] font-medium">{t('settings.iconSizeLabel', 'Fine tune')}</span>
                            <span className="text-[15px] tabular-nums text-ios-gray">
                                {Math.round(homeIconScale * 100)}%
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="shrink-0 text-[13px] font-semibold text-ios-gray">A</span>
                            <Slider
                                value={homeIconScale}
                                min={ICON_SCALE_MIN}
                                max={ICON_SCALE_MAX}
                                step={ICON_SCALE_STEP}
                                onChange={setHomeIconScale}
                                ariaLabel={t('settings.iconSize', 'Icon size')}
                                className="flex-1"
                            />
                            <span className="shrink-0 text-[19px] font-semibold text-ios-gray">A</span>
                        </div>
                        {homeIconScale !== 1 && (
                            <button
                                type="button"
                                onClick={() => setHomeIconScale(1)}
                                className="mt-3 text-[15px] font-medium text-ios-blue active:opacity-60"
                            >
                                {t('settings.iconSizeReset', 'Reset to default')}
                            </button>
                        )}
                    </div>
                    <p className="mt-1 px-1 text-[13px] leading-snug text-ios-gray">
                        {t('settings.iconSizeHint', 'Adjusts the icons within the grid you picked above, without changing how many fit on a page.')}
                    </p>

                    <p className="mb-1 mt-5 px-1 text-[12px] uppercase tracking-widest text-ios-gray">
                        {t('settings.dock', 'Dock')}
                    </p>
                    <div className="overflow-hidden rounded-[14px] bg-surface">
                        {DOCK_STYLES.map((d, i) => (
                            <div key={d}>
                                {i > 0 && <div className="h-[0.5px] bg-ios-gray4 dark:bg-control" />}
                                <button
                                    type="button"
                                    onClick={() => setDockStyle(d)}
                                    className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                                >
                                    <DockPreview style={d} wallpaper={wallpaperHome} />
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="text-[17px] font-normal text-black dark:text-white">{DOCK_LABEL[d]}</span>
                                        <span className="text-[13px] leading-snug text-ios-gray">{DOCK_HINT[d]}</span>
                                    </span>
                                    {dockStyle === d && (
                                        <Check className="ml-1 h-[18px] w-[18px] shrink-0 text-ios-blue" strokeWidth={3} />
                                    )}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="mt-5 overflow-hidden rounded-[14px] bg-surface">
                        <button
                            type="button"
                            onClick={() => setWallpaperParallax(!wallpaperParallax)}
                            className="flex w-full items-center px-4 py-3 active:bg-black/5 dark:active:bg-white/5"
                        >
                            <span className="flex-1 text-left text-[17px] font-normal text-black dark:text-white">
                                {t('settings.wallpaperParallax', 'Wallpaper Parallax')}
                            </span>
                            <div className="pointer-events-none">
                                <Toggle on={wallpaperParallax} />
                            </div>
                        </button>
                    </div>
                    <p className="mt-1 px-1 text-[13px] leading-snug text-ios-gray">
                        {t('settings.wallpaperParallaxHint', 'The wallpaper drifts behind your icons as you swipe between pages, so it reads as depth rather than a flat backdrop.')}
                    </p>
                </div>
            </div>
        </div>
    );
}
