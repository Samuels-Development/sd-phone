import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { decodeThemeCode } from '@/lib/themeCode';
import {
    ICON_THEMES, resolveDraftAppearance, resolveIconAppearance, useCustomIconThemes,
} from '@/stores/iconThemeStore';
import type { IconThemeDraft, IconThemeId } from '@/stores/iconThemeStore';
import { NavBar } from '@/ui/NavBar';
import { PromptDialog } from '@/ui/PromptDialog';
import { SWATCH_PREVIEW_APPS, themePresets } from './iconThemeCatalog';
import { draftFromBuiltin, draftFromTheme, seedDraft } from './iconThemeDraft';
import type { DraftState } from './iconThemeDraft';
import { Section } from './IconThemeControls';
import { ThemeTile } from './IconThemePreview';

const NAME_MAX = 24;

function copyName(name: string): string {
    const suffix = t('settings.iconThemeCopySuffix', 'Copy');
    const joined = `${name} ${suffix}`;
    if (joined.length <= NAME_MAX) return joined;
    return `${name.slice(0, Math.max(1, NAME_MAX - suffix.length - 1)).trimEnd()} ${suffix}`;
}

export function IconThemeStartPage({ onStart, onBack }: {
    onStart: (seed: DraftState) => void;
    onBack:  () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const custom = useCustomIconThemes();
    const [importing, setImporting] = useState(false);

    const presets  = themePresets();
    const builtins = ICON_THEMES.filter(def => def.art === 'glyph');

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#d4d4d4] text-black dark:bg-base dark:text-white" style={pageStyle}>
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar
                backLabel={t('settings.appIcons', 'App Icons')}
                onBack={goBack}
                title={t('settings.iconThemeNew', 'New Theme')}
                hairline
            />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-6 pb-12">

                    <Section
                        header={t('settings.iconThemeStartPresets', 'Start With')}
                        footer={t('settings.iconThemeStartPresetsHint', 'Every part of a starting point can be changed afterwards.')}
                    >
                        {presets.map((preset, i) => (
                            <SeedRow
                                key={preset.id}
                                label={preset.label}
                                hint={preset.hint}
                                draft={preset.seed}
                                divider={i < presets.length - 1}
                                onPress={() => onStart(seedDraft(preset.label, preset.seed))}
                            />
                        ))}
                    </Section>

                    <Section
                        header={t('settings.iconThemeStartBuiltin', 'From a Built-in Theme')}
                        footer={t('settings.iconThemeStartBuiltinHint', 'Takes a copy. The built-in theme itself is never changed.')}
                    >
                        {builtins.map((def, i) => (
                            <SeedRow
                                key={def.id}
                                label={def.label()}
                                hint={def.hint()}
                                theme={def.id}
                                divider={i < builtins.length - 1}
                                onPress={() => onStart(draftFromBuiltin(def))}
                            />
                        ))}
                    </Section>

                    {custom.length > 0 && (
                        <Section header={t('settings.iconThemeStartMine', 'Duplicate One of Mine')}>
                            {custom.map((def, i) => (
                                <SeedRow
                                    key={def.id}
                                    label={def.name}
                                    hint={t('settings.iconThemeStartDuplicate', 'Start from a copy of this theme')}
                                    theme={def.id}
                                    divider={i < custom.length - 1}
                                    onPress={() => {
                                        const seed = draftFromTheme(def);
                                        onStart({ ...seed, name: copyName(def.name) });
                                    }}
                                />
                            ))}
                        </Section>
                    )}

                    <Section footer={t('settings.iconThemeImportHint', 'A theme code starts with SDTHEME1. Importing always adds a new theme.')}>
                        <button
                            type="button"
                            onClick={() => setImporting(true)}
                            className="relative flex w-full items-center px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                        >
                            <span className="flex-1 text-[17px] font-normal text-ios-blue">
                                {t('settings.iconThemePasteCode', 'Paste a Theme Code')}
                            </span>
                            <ChevronRight className="h-[17px] w-[17px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                        </button>
                    </Section>

                </div>
            </div>

            {importing && (
                <PromptDialog
                    title={t('settings.iconThemeImport', 'Import a Theme')}
                    message={t('settings.iconThemeImportBody', 'Paste the code someone shared with you.')}
                    placeholder="SDTHEME1:"
                    confirmLabel={t('settings.iconThemeImportAction', 'Import')}
                    onCancel={() => setImporting(false)}
                    onConfirm={value => {
                        const theme = decodeThemeCode(value);
                        if (!theme) return t('settings.iconThemeImportBad', 'That code could not be read. Check it was copied in full.');
                        setImporting(false);
                        onStart(draftFromTheme(theme));
                        return undefined;
                    }}
                />
            )}
        </div>
    );
}

function SeedRow({ label, hint, draft, theme, divider, onPress }: {
    label:   string;
    hint:    string;
    draft?:  IconThemeDraft;
    theme?:  IconThemeId;
    divider: boolean;
    onPress: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            className="relative flex w-full items-center px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
        >
            <span className="mr-3 flex shrink-0 gap-[3px]">
                {SWATCH_PREVIEW_APPS.map(app => {
                    const look = draft
                        ? resolveDraftAppearance(draft, app.id, app.accent)
                        : resolveIconAppearance(theme ?? 'default', app.id, app.accent);
                    return (
                        <ThemeTile key={app.id} look={look} icon={look.icon ?? app.icon} label={app.label} size={26} />
                    );
                })}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-normal text-black dark:text-white">{label}</span>
                <span className="block truncate text-[13px] text-ios-gray">{hint}</span>
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
