import { useState } from 'react';
import { Plus } from 'lucide-react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { AppIconSVG } from '@/shell/AppIconSVG';
import { resolveWallpaper } from '@/shell/wallpapers';
import { useTheme } from '@/stores/themeStore';
import {
    ICON_THEMES, iconThemeWallpaper, MAX_CUSTOM_ICON_THEMES, resolveIconAppearance,
    useCustomIconThemes, useIconTheme, useIconThemeStore, useShowAppNames,
} from '@/stores/iconThemeStore';
import type { CustomIconTheme, IconThemeDef, IconThemeId } from '@/stores/iconThemeStore';
import { AlertDialog } from '@/ui/AlertDialog';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Toggle } from '@/ui/Toggle';
import { SubPage } from '../SettingsSubPage';
import { PREVIEW_APPS, SWATCH_PREVIEW_APPS } from './iconThemeCatalog';
import type { ThemeApp } from './iconThemeCatalog';
import type { DraftState } from './iconThemeDraft';
import { ThemeTile, ThemeTileLabel } from './IconThemePreview';
import { IconThemeEditorPage } from './IconThemeEditorPage';
import { IconThemeStartPage } from './IconThemeStartPage';

const STRIP_APPS = PREVIEW_APPS.slice(0, 4);

export function AppIconsPage({ onBack }: { onBack: () => void }) {
    const theme           = useIconTheme();
    const showAppNames    = useShowAppNames();
    const custom          = useCustomIconThemes();
    const setIconTheme    = useIconThemeStore(s => s.setIconTheme);
    const setShowAppNames = useIconThemeStore(s => s.setShowAppNames);
    const { wallpaperHome, setWallpaper } = useTheme('wallpaperHome', 'setWallpaper');

    const [editing, setEditing] = useSessionState<string | null>('settings:iconThemeEditor', null);
    const [seed,    setSeed]    = useSessionState<DraftState | null>('settings:iconThemeSeed', null);
    const [pairing, setPairing] = useState<string | null>(null);

    const editTarget = editing === null ? null : custom.find(c => c.id === editing) ?? null;

    function choose(id: IconThemeId) {
        setIconTheme(id);
        const paired = iconThemeWallpaper(id);
        if (paired && resolveWallpaper(paired) !== resolveWallpaper(wallpaperHome)) setPairing(paired);
    }

    function closeEditor() {
        setSeed(null);
        setEditing(null);
    }

    const sub =
        seed !== null ? (
            <IconThemeEditorPage existing={null} seed={seed} onBack={closeEditor} />
        ) : editing === 'new' ? (
            <IconThemeStartPage onStart={setSeed} onBack={() => setEditing(null)} />
        ) : editing !== null ? (
            <IconThemeEditorPage
                key={editing}
                existing={editTarget}
                seed={null}
                onBack={() => setEditing(null)}
            />
        ) : null;

    return (
        <SubPage
            title={t('settings.appIcons', 'App Icons')}
            backLabel={t('settings.settings', 'Settings')}
            onBack={onBack}
            sub={sub}
        >

            <div className="mx-4">
                <div
                    className="overflow-hidden rounded-[12px] px-4 py-5"
                    style={{ background: 'linear-gradient(165deg, #40404a 0%, #17171a 100%)' }}
                >
                    <div className="flex items-start justify-between">
                        {STRIP_APPS.map(app => (
                            <div key={app.id} className="flex flex-col items-center gap-[6px]" style={{ width: 62 }}>
                                <Tile theme={theme} app={app} size={62} />
                                <StripLabel theme={theme} app={app} showAppNames={showAppNames} />
                            </div>
                        ))}
                    </div>
                </div>
                <p className="px-3 pt-2 text-[13px] font-normal text-ios-gray">
                    {t('settings.appIconsPreviewHint', 'A preview of your Home Screen icons.')}
                </p>
            </div>

            <ListGroup header={t('settings.iconTheme', 'Icon Theme')}>
                {ICON_THEMES.map((def, i) => (
                    <ThemeRow
                        key={def.id}
                        def={def}
                        selected={def.id === theme}
                        divider={i < ICON_THEMES.length - 1}
                        onSelect={() => choose(def.id)}
                    />
                ))}
            </ListGroup>

            <ListGroup
                header={t('settings.iconThemeMine', 'My Themes')}
                footer={t('settings.iconThemeMineHint', 'Build a theme from a starting point, a built-in theme or a code someone shared.')}
            >
                {custom.map(def => (
                    <CustomRow
                        key={def.id}
                        def={def}
                        selected={def.id === theme}
                        onSelect={() => choose(def.id)}
                        onEdit={() => setEditing(def.id)}
                    />
                ))}
                <ListRow
                    label={t('settings.iconThemeCreate', 'Create Icon Theme')}
                    sub={t('settings.iconThemeCount', '{used} of {max} used', { used: custom.length, max: MAX_CUSTOM_ICON_THEMES })}
                    left={(
                        <span className="flex h-[24px] w-[24px] items-center justify-center rounded-[7px] bg-ios-blue">
                            <Plus className="h-[15px] w-[15px] text-white" strokeWidth={3} />
                        </span>
                    )}
                    onPress={() => { if (custom.length < MAX_CUSTOM_ICON_THEMES) setEditing('new'); }}
                />
            </ListGroup>

            <ListGroup>
                <ListRow
                    label={t('settings.appNames', 'App Names')}
                    sub={t('settings.appNamesSub', 'Show names on the Home Screen')}
                    chevron={false}
                    right={<div className="pointer-events-none -my-1"><Toggle on={showAppNames} /></div>}
                    onPress={() => setShowAppNames(!showAppNames)}
                />
            </ListGroup>

            {pairing !== null && (
                <AlertDialog
                    title={t('settings.iconThemePairTitle', 'Use the Paired Wallpaper?')}
                    message={t('settings.iconThemePairBody', 'This theme comes with a wallpaper. Your Home Screen can change to match it.')}
                    confirmLabel={t('settings.iconThemePairConfirm', 'Use It')}
                    cancelLabel={t('settings.iconThemePairSkip', 'Keep Mine')}
                    onCancel={() => setPairing(null)}
                    onConfirm={() => {
                        const paired = pairing;
                        setPairing(null);
                        if (paired) setWallpaper(resolveWallpaper(paired), 'home');
                    }}
                />
            )}

        </SubPage>
    );
}

function ThemeRow({ def, selected, divider, onSelect }: {
    def:      IconThemeDef;
    selected: boolean;
    divider:  boolean;
    onSelect: () => void;
}) {
    return (
        <ListRow
            label={def.label()}
            sub={def.hint()}
            selected={selected}
            divider={divider}
            left={(
                <span className="flex gap-[3px]">
                    {SWATCH_PREVIEW_APPS.map(app => <Tile key={app.id} theme={def.id} app={app} size={24} />)}
                </span>
            )}
            onPress={onSelect}
        />
    );
}

function CustomRow({ def, selected, onSelect, onEdit }: {
    def:      CustomIconTheme;
    selected: boolean;
    onSelect: () => void;
    onEdit:   () => void;
}) {
    const notes: string[] = [];
    if (def.dark) notes.push(t('settings.iconThemeHasDark', 'Dark design'));
    if (def.wallpaper) notes.push(t('settings.iconThemeHasWallpaper', 'Wallpaper'));
    if (def.overrides) notes.push(t('settings.iconThemeHasOverrides', 'Custom app icons'));

    const sub = notes.length > 0
        ? notes.join(', ')
        : selected
            ? t('settings.iconThemeInUse', 'In use')
            : t('settings.iconThemeTapToUse', 'Tap to use');

    return (
        <div className="relative flex items-center pr-4">
            <div className="min-w-0 flex-1">
                <ListRow
                    label={def.name}
                    sub={sub}
                    selected={selected}
                    left={(
                        <span className="flex gap-[3px]">
                            {SWATCH_PREVIEW_APPS.map(app => <Tile key={app.id} theme={def.id} app={app} size={24} />)}
                        </span>
                    )}
                    onPress={onSelect}
                />
            </div>
            <button
                type="button"
                onClick={onEdit}
                className="shrink-0 pl-3 text-[15px] font-normal text-ios-blue active:opacity-60"
            >
                {t('common.edit', 'Edit')}
            </button>
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-ios-gray4 dark:bg-control"
                style={{ height: '0.5px' }}
            />
        </div>
    );
}

function Tile({ theme, app, size }: { theme: IconThemeId; app: ThemeApp; size: number }) {
    const look = resolveIconAppearance(theme, app.id, app.accent);
    if (look.art === 'native') {
        return (
            <span
                className="relative block shrink-0 overflow-hidden"
                style={{
                    width:        size,
                    height:       size,
                    borderRadius: `${look.radius * 100}%`,
                    boxShadow:    '0 1px 4px rgba(0,0,0,0.28), inset 0 0 0 0.5px rgba(255,255,255,0.12)',
                }}
            >
                <AppIconSVG icon={app.icon} size={size} />
            </span>
        );
    }
    return <ThemeTile look={look} icon={look.icon ?? app.icon} label={app.label} size={size} />;
}

function StripLabel({ theme, app, showAppNames }: { theme: IconThemeId; app: ThemeApp; showAppNames: boolean }) {
    const look = resolveIconAppearance(theme, app.id, app.accent);
    return <ThemeTileLabel look={look} label={app.label} fallbackShow={showAppNames} />;
}
