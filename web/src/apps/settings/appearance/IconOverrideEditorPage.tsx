import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { resolveDraftAppearance } from '@/stores/iconThemeStore';
import type { ColorRecipe, IconThemeDraft, IconThemeOverride } from '@/stores/iconThemeStore';
import { NavBar } from '@/ui/NavBar';
import { glyphLabel } from './iconThemeCatalog';
import type { ThemeApp } from './iconThemeCatalog';
import { ActionRow, Hairline, RecipeEditor, Section, SwitchRow } from './IconThemeControls';
import { ThemeStage, ThemeTile, ThemeTileLabel } from './IconThemePreview';
import { GlyphPickerSheet } from './GlyphPickerSheet';
import { WHITE } from './iconThemeDraft';

export function IconOverrideEditorPage({ app, draft, override, wallpaper, showAppNames, pinned, onTogglePin, onChange, onBack }: {
    app:          ThemeApp;
    draft:        IconThemeDraft;
    override:     IconThemeOverride | undefined;
    wallpaper:    string;
    showAppNames: boolean;
    pinned:       boolean;
    onTogglePin:  () => void;
    onChange:     (next: IconThemeOverride | undefined) => void;
    onBack:       () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const [picking, setPicking] = useState(false);

    const look = resolveDraftAppearance(draft, app.id, app.accent);
    const icon = override?.icon ?? app.icon;

    function patch(next: IconThemeOverride) {
        const clean: IconThemeOverride = {};
        if (next.background) clean.background = next.background;
        if (next.glyph) clean.glyph = next.glyph;
        if (next.icon) clean.icon = next.icon;
        onChange(Object.keys(clean).length === 0 ? undefined : clean);
    }

    function setBackground(recipe: ColorRecipe | undefined) {
        patch({ ...override, background: recipe });
    }

    function setGlyph(recipe: ColorRecipe | undefined) {
        patch({ ...override, glyph: recipe });
    }

    function setIcon(name: string | undefined) {
        patch({ ...override, icon: name });
    }

    return (
        <div className="absolute inset-0 z-40 flex flex-col bg-[#d4d4d4] text-black dark:bg-base dark:text-white" style={pageStyle}>
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar
                backLabel={t('settings.iconOverrides', 'App Icons')}
                onBack={goBack}
                title={app.label}
                hairline
            />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-6 pb-12">

                    <ThemeStage
                        wallpaper={wallpaper}
                        pinned={pinned}
                        onTogglePin={onTogglePin}
                        hint={t('settings.iconOverridePreviewHint', 'How {app} looks with this theme.', { app: app.label })}
                    >
                        <div className={`flex flex-col items-center gap-[6px] ${pinned ? 'pb-3 pt-1' : 'pb-7 pt-4'}`}>
                            <ThemeTile look={look} icon={icon} label={app.label} size={pinned ? 48 : 92} />
                            <ThemeTileLabel look={look} label={app.label} fallbackShow={showAppNames} small={pinned} />
                        </div>
                    </ThemeStage>

                    <Section
                        header={t('settings.iconOverrideTile', 'Tile Colour')}
                        footer={override?.background
                            ? t('settings.iconOverrideTileOnHint', 'This app ignores the theme tile colour.')
                            : t('settings.iconOverrideTileOffHint', 'This app follows the theme tile colour.')}
                    >
                        <SwitchRow
                            label={t('settings.iconOverrideCustomTile', 'Custom Tile Colour')}
                            on={override?.background !== undefined}
                            divider={override?.background !== undefined}
                            onToggle={() => setBackground(
                                override?.background ? undefined : { from: 'fixed', color: '#26262a' },
                            )}
                        />
                        {override?.background && (
                            <RecipeEditor
                                recipe={override.background}
                                onChange={setBackground}
                                label={t('settings.iconOverrideTile', 'Tile Colour')}
                            />
                        )}
                    </Section>

                    <Section
                        header={t('settings.iconOverrideGlyph', 'Symbol Colour')}
                        footer={override?.glyph
                            ? undefined
                            : t('settings.iconOverrideGlyphOffHint', 'This app follows the theme symbol colour.')}
                    >
                        <SwitchRow
                            label={t('settings.iconOverrideCustomGlyph', 'Custom Symbol Colour')}
                            on={override?.glyph !== undefined}
                            divider={override?.glyph !== undefined}
                            onToggle={() => setGlyph(
                                override?.glyph ? undefined : { from: 'fixed', color: WHITE },
                            )}
                        />
                        {override?.glyph && (
                            <RecipeEditor
                                recipe={override.glyph}
                                onChange={setGlyph}
                                label={t('settings.iconOverrideGlyph', 'Symbol Colour')}
                                fallbackColour={WHITE}
                            />
                        )}
                    </Section>

                    <Section
                        header={t('settings.iconOverrideSymbol', 'Symbol')}
                        footer={t('settings.iconOverrideSymbolHint', 'Swap the drawing on this tile for any other app symbol.')}
                    >
                        <button
                            type="button"
                            onClick={() => setPicking(true)}
                            className="relative flex w-full items-center px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                        >
                            <span className="mr-3 flex shrink-0 items-center">
                                <ThemeTile look={look} icon={icon} label={app.label} size={30} />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[17px] font-normal text-black dark:text-white">
                                    {glyphLabel(icon)}
                                </span>
                                <span className="block truncate text-[13px] text-ios-gray">
                                    {override?.icon
                                        ? t('settings.iconOverrideSwapped', 'Swapped symbol')
                                        : t('settings.iconOverrideOwnSymbol', "App's Own Symbol")}
                                </span>
                            </span>
                            <ChevronRight className="h-[17px] w-[17px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                        </button>
                        {override?.icon && (
                            <>
                                <Hairline />
                                <ActionRow
                                    label={t('settings.iconOverrideResetSymbol', 'Use the App’s Own Symbol')}
                                    onPress={() => setIcon(undefined)}
                                />
                            </>
                        )}
                    </Section>

                    <Section>
                        <ActionRow
                            label={t('settings.iconOverrideClear', 'Reset This App')}
                            destructive
                            disabled={override === undefined}
                            onPress={() => { onChange(undefined); goBack(); }}
                        />
                    </Section>

                </div>
            </div>

            {picking && (
                <GlyphPickerSheet
                    draft={draft}
                    appId={app.id}
                    accent={app.accent}
                    ownIcon={app.icon}
                    current={override?.icon}
                    onSelect={name => setIcon(name === app.icon ? undefined : name)}
                    onClear={() => setIcon(undefined)}
                    onClose={() => setPicking(false)}
                />
            )}
        </div>
    );
}
