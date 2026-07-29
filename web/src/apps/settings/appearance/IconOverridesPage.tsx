import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { PushLayer } from '@/shell/PushLayer';
import { customAccent, useCustomApps } from '@/stores/customAppsStore';
import { MAX_ICON_OVERRIDES, resolveDraftAppearance } from '@/stores/iconThemeStore';
import type { IconThemeDraft, IconThemeOverride } from '@/stores/iconThemeStore';
import { NavBar } from '@/ui/NavBar';
import { SearchBar } from '@/ui/SearchBar';
import { APP_ID_PATTERN, glyphLabel, THEME_APPS } from './iconThemeCatalog';
import type { ThemeApp } from './iconThemeCatalog';
import { ActionRow, Section, SectionAction } from './IconThemeControls';
import { ThemeTile } from './IconThemePreview';
import { IconOverrideEditorPage } from './IconOverrideEditorPage';

type Overrides = Record<string, IconThemeOverride>;

function summarise(override: IconThemeOverride): string {
    const parts: string[] = [];
    if (override.background) parts.push(t('settings.iconOverridePartTile', 'Tile'));
    if (override.glyph) parts.push(t('settings.iconOverridePartGlyph', 'Symbol colour'));
    if (override.icon) parts.push(glyphLabel(override.icon));
    return parts.join(', ');
}

export function IconOverridesPage({ draft, wallpaper, showAppNames, pinned, onTogglePin, onChange, onBack }: {
    draft:        IconThemeDraft;
    wallpaper:    string;
    showAppNames: boolean;
    pinned:       boolean;
    onTogglePin:  () => void;
    onChange:     (next: Overrides | undefined) => void;
    onBack:       () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const customApps = useCustomApps();
    const [query,   setQuery]   = useState('');
    const [openApp, setOpenApp] = useState<string | null>(null);

    const overrides = draft.overrides ?? {};
    const used  = Object.keys(overrides).length;
    const atCap = used >= MAX_ICON_OVERRIDES;

    const extra: ThemeApp[] = customApps
        .filter(app => APP_ID_PATTERN.test(app.id) && !THEME_APPS.some(known => known.id === app.id))
        .map(app => ({ id: app.id, label: app.name, icon: app.id, accent: customAccent(app.id) }));

    const apps = [...THEME_APPS, ...extra].sort((a, b) => a.label.localeCompare(b.label));

    const needle  = query.trim().toLowerCase();
    const visible = needle === '' ? apps : apps.filter(app => app.label.toLowerCase().includes(needle));
    const custom  = visible.filter(app => overrides[app.id] !== undefined);
    const plain   = visible.filter(app => overrides[app.id] === undefined);

    function write(next: Overrides) {
        onChange(Object.keys(next).length === 0 ? undefined : next);
    }

    function setOverride(id: string, value: IconThemeOverride | undefined) {
        const next = { ...overrides };
        if (value === undefined) delete next[id];
        else next[id] = value;
        write(next);
    }

    const target = openApp === null ? null : apps.find(app => app.id === openApp) ?? null;

    return (
        <PushLayer
            pageStyle={pageStyle}
            className="z-30"
            sub={target && (
                <IconOverrideEditorPage
                    key={target.id}
                    app={target}
                    draft={draft}
                    override={overrides[target.id]}
                    wallpaper={wallpaper}
                    showAppNames={showAppNames}
                    pinned={pinned}
                    onTogglePin={onTogglePin}
                    onChange={value => setOverride(target.id, value)}
                    onBack={() => setOpenApp(null)}
                />
            )}
        >
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar
                backLabel={t('settings.iconThemeEditBack', 'Theme')}
                onBack={goBack}
                title={t('settings.iconOverrides', 'App Icons')}
                hairline
            />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-4 flex flex-col gap-6 pb-12">

                    <div className="px-4">
                        <SearchBar
                            value={query}
                            onChange={setQuery}
                            placeholder={t('settings.iconOverridesSearch', 'Search apps')}
                        />
                    </div>

                    {custom.length > 0 && (
                        <Section
                            header={t('settings.iconOverridesCustomised', 'Customised')}
                            footer={t('settings.iconOverridesCount', '{used} of {max} apps customised', { used, max: MAX_ICON_OVERRIDES })}
                            action={(
                                <SectionAction
                                    label={t('settings.iconOverridesResetAll', 'Reset All')}
                                    onPress={() => write({})}
                                />
                            )}
                        >
                            {custom.map((app, i) => (
                                <AppRow
                                    key={app.id}
                                    app={app}
                                    draft={draft}
                                    override={overrides[app.id]}
                                    divider={i < custom.length - 1}
                                    onPress={() => setOpenApp(app.id)}
                                />
                            ))}
                        </Section>
                    )}

                    {atCap && (
                        <Section footer={t('settings.iconOverridesFullHint', 'Reset an app above to make room for another one.')}>
                            <ActionRow
                                label={t('settings.iconOverridesFull', 'All {max} slots are used', { max: MAX_ICON_OVERRIDES })}
                                disabled
                                onPress={() => {}}
                            />
                        </Section>
                    )}

                    <Section
                        header={t('settings.iconOverridesAll', 'All Apps')}
                        footer={custom.length === 0
                            ? t('settings.iconOverridesEmptyHint', 'Give one app its own tile colour, symbol colour or symbol. Up to {max} apps.', { max: MAX_ICON_OVERRIDES })
                            : undefined}
                    >
                        {plain.length === 0 ? (
                            <div className="px-4 py-6 text-center text-[15px] text-ios-gray">
                                {needle === ''
                                    ? t('settings.iconOverridesAllDone', 'Every app has its own look.')
                                    : t('settings.iconOverridesNoMatch', 'No apps match that search.')}
                            </div>
                        ) : plain.map((app, i) => (
                            <AppRow
                                key={app.id}
                                app={app}
                                draft={draft}
                                override={undefined}
                                divider={i < plain.length - 1}
                                disabled={atCap}
                                onPress={() => setOpenApp(app.id)}
                            />
                        ))}
                    </Section>

                </div>
            </div>
        </PushLayer>
    );
}

function AppRow({ app, draft, override, divider, disabled = false, onPress }: {
    app:       ThemeApp;
    draft:     IconThemeDraft;
    override:  IconThemeOverride | undefined;
    divider:   boolean;
    disabled?: boolean;
    onPress:   () => void;
}) {
    const look = resolveDraftAppearance(draft, app.id, app.accent);
    return (
        <button
            type="button"
            onClick={() => { if (!disabled) onPress(); }}
            className={`relative flex w-full items-center px-4 py-2.5 text-left ${disabled ? 'opacity-40' : 'active:bg-black/5 dark:active:bg-white/5'}`}
        >
            <span className="mr-3 flex shrink-0 items-center">
                <ThemeTile look={look} icon={look.icon ?? app.icon} label={app.label} size={32} />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-normal text-black dark:text-white">{app.label}</span>
                {override && (
                    <span className="block truncate text-[13px] text-ios-blue">{summarise(override)}</span>
                )}
            </span>
            <ChevronRight className="h-[17px] w-[17px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
            {divider && (
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-ios-gray4 dark:bg-control"
                    style={{ height: '0.5px' }}
                />
            )}
        </button>
    );
}
