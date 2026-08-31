import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import type { WidgetAlign, WidgetSize, WidgetTheme } from '@/apps/appstore/appsApi';
import { t } from '@/i18n';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Sheet } from '@/ui/Sheet';
import { resolveWallpaper } from '../wallpapers';
import { spanOf, widgetPx } from './geometry';
import { useWidgetCatalog } from './registry';

const SIZE_LABEL: Record<WidgetSize, string> = { sm: 'Small', md: 'Medium', lg: 'Large' };
const ALIGN_LABEL: Record<WidgetAlign, string> = { left: 'Left', center: 'Centre', right: 'Right' };
const ALIGNS: WidgetAlign[] = ['left', 'center', 'right'];
const THEME_LABEL: Record<WidgetTheme, string> = { dark: 'Dark', light: 'Light', glass: 'Glass' };
const THEMES: WidgetTheme[] = ['dark', 'light', 'glass'];

const PREVIEW_SCALE = 0.62;
const STAGE_PAD = 16;
const STAGE_H = widgetPx('lg', PREVIEW_SCALE).height + STAGE_PAD * 2;

export function WidgetGallery({
    onAdd, onClose, wallpaper, lockSize,
}: {
    onAdd: (kind: string, size: WidgetSize, align: WidgetAlign, theme: WidgetTheme) => boolean;
    onClose: () => void;
    wallpaper: string;
    lockSize?: WidgetSize;
}) {
    const all = useWidgetCatalog();
    const catalog = lockSize ? all.filter(d => d.sizes.includes(lockSize)) : all;
    const [pick, setPick] = useState<Record<string, WidgetSize>>({});
    const [alignPick, setAlignPick] = useState<Record<string, WidgetAlign>>({});
    const [themePick, setThemePick] = useState<Record<string, WidgetTheme>>({});
    const [full, setFull] = useState<string | null>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const [stageW, setStageW] = useState(340);
    useLayoutEffect(() => {
        const w = stageRef.current?.getBoundingClientRect().width;
        if (w && Math.abs(w - stageW) > 1) setStageW(w);
    }, [stageW]);

    return (
        <Sheet
            onClose={onClose}
            title={t('widgets.title', 'Add Widget')}
            className="font-sf bg-base text-black dark:text-white"
        >
            {() => (
            <div className="flex min-h-0 flex-1 flex-col">
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-6">
                <p className="mb-4 text-[13px] leading-snug text-ios-gray">
                    {t('widgets.blurb', 'Widgets show information from your apps at a glance. Pick a size, then add it to your Home Screen.')}
                </p>

                {catalog.map(def => {
                    const picked = pick[def.kind];
                    const size = lockSize ?? (picked && def.sizes.includes(picked) ? picked : def.sizes[0]);
                    const { width: fullW,    height: fullH }    = widgetPx(size);
                    const { width: previewW, height: previewH } = widgetPx(size, PREVIEW_SCALE);
                    const align = alignPick[def.kind] ?? 'left';
                    const alignActive = !!def.aligns?.includes(size);
                    const theme = themePick[def.kind] ?? 'dark';
                    const failed = full === def.kind;

                    return (
                        <div key={def.kind} className="mb-6">
                            <div className="mb-2 flex items-baseline justify-between">
                                <span className="text-[17px] font-semibold text-black dark:text-white">{def.label()}</span>
                                {!lockSize && def.sizes.length > 1 && (
                                    <SegmentedControl
                                        fit
                                        value={size}
                                        onChange={s => { setPick(p => ({ ...p, [def.kind]: s })); setFull(null); }}
                                        options={def.sizes.map(s => ({ value: s, label: t(`widgets.size.${s}`, SIZE_LABEL[s]) }))}
                                    />
                                )}
                            </div>

                            <div className="flex flex-col items-center rounded-[20px] bg-black/[0.04] p-4 dark:bg-white/[0.06]">
                                <div
                                    ref={stageRef}
                                    className="flex w-full items-center justify-center overflow-hidden rounded-[16px] bg-cover bg-center"
                                    style={{ height: STAGE_H, padding: STAGE_PAD, backgroundImage: `url(${resolveWallpaper(wallpaper)})` }}
                                >
                                    <div style={{ width: previewW, height: previewH }}>
                                        <div
                                            style={{
                                                width: fullW,
                                                height: fullH,
                                                transform: `scale(${PREVIEW_SCALE})`,
                                                transformOrigin: 'top left',
                                                '--glass-img': `url(${resolveWallpaper(wallpaper)})`,
                                                '--glass-w': `${stageW / PREVIEW_SCALE}px`,
                                                '--glass-h': `${STAGE_H / PREVIEW_SCALE}px`,
                                                '--glass-x': `${-(stageW / PREVIEW_SCALE - fullW) / 2}px`,
                                                '--glass-y': `${-(STAGE_H / PREVIEW_SCALE - fullH) / 2}px`,
                                            } as CSSProperties}
                                        >
                                            {def.render({ size, width: fullW, height: fullH, align, theme })}
                                        </div>
                                    </div>
                                </div>
                                {(!!def.aligns?.length || def.themes) && (
                                    <div className="mt-3 flex w-full items-stretch gap-2">
                                        {!!def.aligns?.length && (
                                            <SegmentedControl
                                                className="min-w-0 flex-1"
                                                disabled={!alignActive}
                                                value={align}
                                                onChange={a => setAlignPick(p => ({ ...p, [def.kind]: a }))}
                                                options={ALIGNS.map(a => ({ value: a, label: t(`widgets.align.${a}`, ALIGN_LABEL[a]) }))}
                                            />
                                        )}
                                        {def.themes && (
                                            <SegmentedControl
                                                className="min-w-0 flex-1"
                                                value={theme}
                                                onChange={th => setThemePick(p => ({ ...p, [def.kind]: th }))}
                                                options={THEMES.map(th => ({ value: th, label: t(`widgets.theme.${th}`, THEME_LABEL[th]) }))}
                                            />
                                        )}
                                    </div>
                                )}
                                <span className="mt-2.5 text-[14px] font-medium tabular-nums tracking-[0.02em] text-ios-gray">
                                    {t('widgets.grid', '{cols} x {rows} grid', { cols: spanOf(size).w, rows: spanOf(size).h })}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => { if (!onAdd(def.kind, size, align, theme)) setFull(def.kind); }}
                                    className="mt-3 rounded-full bg-ios-blue px-5 py-2 text-[15px] font-semibold text-white active:opacity-70"
                                >
                                    {t('widgets.addWidget', 'Add Widget')}
                                </button>
                                {failed && (
                                    <span className="mt-2 text-[12px] text-[#ff9f0a]">
                                        {t('widgets.noRoom', 'No room on this page. Free some space and try again.')}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            </div>
            )}
        </Sheet>
    );
}
