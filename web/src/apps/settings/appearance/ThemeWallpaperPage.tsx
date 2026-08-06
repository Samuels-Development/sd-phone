import { Check } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { PHOTO_SOURCES } from '@/apps/photos/data';
import { resolveWallpaper, wallpaperKey } from '@/shell/wallpapers';
import { useTheme } from '@/stores/themeStore';
import type { IconThemeDraft } from '@/stores/iconThemeStore';
import { NavBar } from '@/ui/NavBar';
import { ListRow } from '@/ui/ListGroup';
import { Section } from './IconThemeControls';
import { ThemePreviewGrid, ThemeStage } from './IconThemePreview';

const BUILT_IN = ['homescreen.jpg', 'lockscreen.jpg', ...PHOTO_SOURCES.map((_, i) => `background${i + 3}.jpg`)];

export function ThemeWallpaperPage({ draft, showAppNames, wallpaper, pinned, onTogglePin, onChange, onBack }: {
    draft:        IconThemeDraft;
    showAppNames: boolean;
    wallpaper:    string | undefined;
    pinned:       boolean;
    onTogglePin:  () => void;
    onChange:     (next: string | undefined) => void;
    onBack:       () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const { wallpaperHome, customWallpapers } = useTheme('wallpaperHome', 'customWallpapers');

    const shown = wallpaper ?? wallpaperHome;

    function isOn(src: string): boolean {
        return wallpaper !== undefined && resolveWallpaper(wallpaper) === src;
    }

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-base text-black dark:text-white" style={pageStyle}>
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar
                backLabel={t('settings.iconThemeEditBack', 'Theme')}
                onBack={goBack}
                title={t('settings.iconThemeWallpaper', 'Wallpaper')}
                hairline
            />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-6 pb-12">

                    <ThemeStage
                        wallpaper={shown}
                        pinned={pinned}
                        onTogglePin={onTogglePin}
                        hint={wallpaper === undefined
                            ? t('settings.iconThemeWallpaperNoneHint', 'Shown over your current wallpaper.')
                            : t('settings.iconThemeWallpaperPairHint', 'Offered whenever this theme is applied.')}
                    >
                        <ThemePreviewGrid draft={draft} showAppNames={showAppNames} pinned={pinned} />
                    </ThemeStage>

                    <Section footer={t('settings.iconThemeWallpaperFooter', 'A paired wallpaper is never forced. Applying the theme asks first.')}>
                        <ListRow
                            label={t('settings.iconThemeWallpaperNone', 'No Paired Wallpaper')}
                            selected={wallpaper === undefined}
                            onPress={() => onChange(undefined)}
                        />
                    </Section>

                    {customWallpapers.length > 0 && (
                        <Section header={t('settings.wallpaperMine', 'My Wallpapers')}>
                            <WallGrid
                                sources={customWallpapers}
                                isOn={isOn}
                                onPick={src => onChange(wallpaperKey(src))}
                            />
                        </Section>
                    )}

                    <Section header={t('settings.wallpaperSuggested', 'Suggested Wallpapers')}>
                        <WallGrid
                            sources={BUILT_IN.map(resolveWallpaper)}
                            isOn={isOn}
                            onPick={src => onChange(wallpaperKey(src))}
                        />
                    </Section>

                </div>
            </div>
        </div>
    );
}

function WallGrid({ sources, isOn, onPick }: {
    sources: readonly string[];
    isOn:    (src: string) => boolean;
    onPick:  (src: string) => void;
}) {
    return (
        <div className="grid grid-cols-3 gap-2 px-4 py-4">
            {sources.map(src => {
                const on = isOn(src);
                return (
                    <button
                        key={src}
                        type="button"
                        onClick={() => onPick(src)}
                        className="relative block w-full overflow-hidden rounded-[10px] active:opacity-80"
                        style={{ boxShadow: on ? '0 0 0 3px #0a84ff' : '0 1px 4px rgba(0,0,0,0.18)' }}
                    >
                        <img src={src} alt="" draggable={false} className="block aspect-[9/16] w-full object-cover" />
                        {on && (
                            <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ios-blue">
                                <Check className="h-[11px] w-[11px] text-white" strokeWidth={3} />
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
