import { Plus } from 'lucide-react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { AppGlyph } from '@/shell/AppGlyphs';
import { AppIconSVG } from '@/shell/AppIconSVG';
import {
    ICON_THEMES, MAX_CUSTOM_ICON_THEMES, resolveIconAppearance,
    useCustomIconThemes, useIconTheme, useIconThemeStore, useShowAppNames,
} from '@/stores/iconThemeStore';
import type { CustomIconTheme, IconThemeDef, IconThemeId } from '@/stores/iconThemeStore';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { Toggle } from '@/ui/Toggle';
import { SubPage } from '../SettingsSubPage';
import { IconThemeEditorPage } from './IconThemeEditorPage';

interface PreviewApp {
    id:     string;
    icon:   string;
    label:  string;
    accent: string;
}

const PREVIEW_APPS: PreviewApp[] = [
    { id: 'phone',   icon: 'phone',   label: 'Phone',   accent: '#34c759' },
    { id: 'maps',    icon: 'maps',    label: 'Maps',    accent: '#f0c43a' },
    { id: 'music',   icon: 'music',   label: 'Music',   accent: '#fa233b' },
    { id: 'weather', icon: 'weather', label: 'Weather', accent: '#5ac8fa' },
];

const SWATCH_APPS = PREVIEW_APPS.slice(0, 3);

export function AppIconsPage({ onBack }: { onBack: () => void }) {
    const theme           = useIconTheme();
    const showAppNames    = useShowAppNames();
    const custom          = useCustomIconThemes();
    const setIconTheme    = useIconThemeStore(s => s.setIconTheme);
    const setShowAppNames = useIconThemeStore(s => s.setShowAppNames);
    const [editing, setEditing] = useSessionState<string | null>('settings:iconThemeEditor', null);

    const editTarget = editing === null ? null : custom.find(c => c.id === editing) ?? null;

    return (
        <SubPage
            title={t('settings.appIcons', 'App Icons')}
            backLabel={t('settings.settings', 'Settings')}
            onBack={onBack}
            sub={editing !== null ? (
                <IconThemeEditorPage
                    key={editing}
                    existing={editTarget}
                    onBack={() => setEditing(null)}
                />
            ) : null}
        >

            <div className="mx-4">
                <div
                    className="overflow-hidden rounded-[12px] px-4 py-5"
                    style={{ background: 'linear-gradient(165deg, #40404a 0%, #17171a 100%)' }}
                >
                    <div className="flex items-start justify-between">
                        {PREVIEW_APPS.map(app => (
                            <div key={app.id} className="flex flex-col items-center gap-[6px]" style={{ width: 62 }}>
                                <Tile theme={theme} app={app} size={62} />
                                {showAppNames && (
                                    <span
                                        className="w-full truncate text-center font-sf text-[11px] font-semibold tracking-[0.01em] text-white"
                                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)' }}
                                    >
                                        {app.label}
                                    </span>
                                )}
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
                        onSelect={() => setIconTheme(def.id)}
                    />
                ))}
            </ListGroup>

            <ListGroup
                header={t('settings.iconThemeMine', 'My Themes')}
                footer={t('settings.iconThemeMineHint', 'Design your own tile and symbol colours.')}
            >
                {custom.map(def => (
                    <CustomRow
                        key={def.id}
                        def={def}
                        selected={def.id === theme}
                        onSelect={() => setIconTheme(def.id)}
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
                    {SWATCH_APPS.map(app => <Tile key={app.id} theme={def.id} app={app} size={24} />)}
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
    return (
        <div className="relative flex items-center pr-4">
            <ListRow
                label={def.name}
                sub={selected
                    ? t('settings.iconThemeInUse', 'In use')
                    : t('settings.iconThemeTapToUse', 'Tap to use')}
                selected={selected}
                left={(
                    <span className="flex gap-[3px]">
                        {SWATCH_APPS.map(app => <Tile key={app.id} theme={def.id} app={app} size={24} />)}
                    </span>
                )}
                onPress={onSelect}
            />
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

function Tile({ theme, app, size }: { theme: IconThemeId; app: PreviewApp; size: number }) {
    const { background, glyph, art } = resolveIconAppearance(theme, app.id, app.accent);
    return (
        <span
            className="relative block shrink-0 overflow-hidden"
            style={{
                width:        size,
                height:       size,
                borderRadius: '27.6%',
                boxShadow:    '0 1px 4px rgba(0,0,0,0.28), inset 0 0 0 0.5px rgba(255,255,255,0.12)',
            }}
        >
            {art === 'native' ? (
                <AppIconSVG icon={app.icon} size={size} />
            ) : (
                <span className="flex h-full w-full items-center justify-center" style={{ background }}>
                    <AppGlyph icon={app.icon} label={app.label} color={glyph} size={Math.round(size * 0.52)} />
                </span>
            )}
        </span>
    );
}
