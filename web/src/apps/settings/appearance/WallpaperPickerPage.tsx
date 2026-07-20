import { useEffect, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';

import { t } from '@/i18n';
import { PHOTO_SOURCES } from '@/apps/photos/data';
import { apiListPhotos, getCanImportPhotos } from '@/core/photosApi';
import { useIosPush } from '@/hooks/useIosPush';
import { MAX_CUSTOM_WALLPAPERS, useTheme } from '@/stores/themeStore';
import { resolveWallpaper } from '@/shell/wallpapers';
import { NavBar } from '@/ui/NavBar';
import { PromptDialog } from '@/ui/PromptDialog';

const WALLPAPER_LABELS = [
    'Daybreak',          // bg3
    'Cotton Candy',      // bg4
    'Marble',            // bg5
    'Prism',             // bg6
    'Tidal',             // bg7
    'Spectrum',          // bg8
    'Halo',              // bg9
    'Deep Current',      // bg10
    'Eclipse',           // bg11
    'Ink Bloom',         // bg12
    'Lavender Mist',     // bg13
    'Seafoam',           // bg14
    'Tide Pool',         // bg15
    'Loop',              // bg16
    'Carnival',          // bg17
    'Oil Slick',         // bg18
    'Meadow',            // bg19
    'Onyx',              // bg20
    'Neon Loop',         // bg21
    'Ember',             // bg22
];

export function WallpaperPickerPage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const {
        wallpaper, setWallpaper, customWallpapers, addCustomWallpaper, removeCustomWallpaper,
    } = useTheme('wallpaper', 'setWallpaper', 'customWallpapers', 'addCustomWallpaper', 'removeCustomWallpaper');
    const [selected, setSelected] = useState<string>(wallpaper);
    const [canImport, setCanImport] = useState(false);
    const [importOpen, setImportOpen] = useState(false);

    // The server's URL-import flag only resolves after a photos list round-trip.
    useEffect(() => {
        let cancelled = false;
        void apiListPhotos().then(() => {
            if (!cancelled) setCanImport(getCanImportPhotos());
        });
        return () => { cancelled = true; };
    }, []);

    function apply(src: string) {
        setSelected(src);
        setWallpaper(src);
    }

    const isSelected = (src: string) => resolveWallpaper(selected) === src;

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#d4d4d4] dark:bg-base" style={pageStyle}>
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar
                backLabel={t('settings.wallpaper', 'Wallpaper')}
                onBack={goBack}
                title={t('settings.chooseWallpaper', 'Choose a Wallpaper')}
                hairline
            />

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-5">
                {canImport && (
                    <button
                        type="button"
                        onClick={() => setImportOpen(true)}
                        className="mb-6 flex w-full items-center justify-center gap-1.5 rounded-[12px] bg-ios-blue py-3 text-[16px] font-semibold text-white shadow-sm active:opacity-80"
                    >
                        <Plus className="h-[19px] w-[19px]" strokeWidth={2.4} />
                        {t('settings.addWallpaperFromLink', 'Add Wallpaper from Link')}
                    </button>
                )}

                {customWallpapers.length > 0 && (
                    <section className="mb-6">
                        <p className="mb-3 text-[13px] uppercase tracking-wider text-ios-gray">
                            {t('settings.myWallpapers', 'My Wallpapers')}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            {customWallpapers.map(url => (
                                <WallTile
                                    key={url}
                                    src={url}
                                    selected={isSelected(url)}
                                    onSelect={() => apply(url)}
                                    onRemove={() => removeCustomWallpaper(url)}
                                />
                            ))}
                        </div>
                    </section>
                )}

                <section>
                    <p className="mb-3 text-[13px] uppercase tracking-wider text-ios-gray">
                        {t('settings.suggestedWallpapers', 'Suggested Wallpapers')}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                        {PHOTO_SOURCES.map((src, i) => (
                            <WallTile
                                key={i}
                                src={src}
                                label={WALLPAPER_LABELS[i] ?? t('settings.wallpaperNumbered', 'Wallpaper {n}', { n: i + 1 })}
                                selected={isSelected(src)}
                                onSelect={() => apply(src)}
                            />
                        ))}
                    </div>
                </section>

                <p className="mt-5 text-center text-[13px] text-ios-gray">
                    {t('settings.tapWallpaperHint', 'Tap a wallpaper to apply it to both Lock Screen and Home Screen.')}
                </p>

                <div className="h-8" />
            </div>

            {importOpen && (
                <PromptDialog
                    title={t('settings.addWallpaperTitle', 'Add Wallpaper')}
                    message={t('settings.addWallpaperMessage', 'Paste a direct link to an image.')}
                    placeholder="https://"
                    inputMode="url"
                    maxLength={512}
                    confirmLabel={t('settings.addWallpaperConfirm', 'Add')}
                    onCancel={() => setImportOpen(false)}
                    onConfirm={async raw => {
                        const url = raw.trim();
                        if (!/^https?:\/\/./.test(url)) return t('settings.wallpaperLinkInvalid', 'Enter a full image URL');
                        if (customWallpapers.length >= MAX_CUSTOM_WALLPAPERS) {
                            return t('settings.wallpaperLimit', 'You can save up to {n} wallpapers.', { n: MAX_CUSTOM_WALLPAPERS });
                        }
                        const err = await addCustomWallpaper(url);
                        if (err !== null) return err || t('settings.wallpaperImportFailed', 'Could not save that wallpaper');
                        return null;
                    }}
                />
            )}
        </div>
    );
}


function WallTile({ src, label, selected, onSelect, onRemove }: {
    src:       string;
    label?:    string;
    selected:  boolean;
    onSelect:  () => void;
    onRemove?: () => void;
}) {
    return (
        <div className="relative">
            <button
                type="button"
                onClick={onSelect}
                className="relative block w-full overflow-hidden rounded-[14px] active:opacity-80"
                style={{
                    boxShadow: selected
                        ? '0 0 0 3px #0A84FF'
                        : '0 2px 8px rgba(0,0,0,0.18)',
                }}
            >
                <img
                    src={src}
                    className="block aspect-[9/16] w-full object-cover"
                    alt={label ?? ''}
                    draggable={false}
                />

                {label && (
                    <>
                        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/60 to-transparent" />
                        <span className="absolute bottom-2.5 left-3 text-[12px] font-semibold text-white drop-shadow">
                            {label}
                        </span>
                    </>
                )}

                {selected && (
                    <div className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-ios-blue shadow">
                        <Check className="h-[13px] w-[13px] text-white" strokeWidth={3} />
                    </div>
                )}
            </button>

            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    aria-label={t('settings.removeWallpaper', 'Remove wallpaper')}
                    className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white shadow"
                >
                    <X className="h-[13px] w-[13px]" strokeWidth={2.6} />
                </button>
            )}
        </div>
    );
}
