import { useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { ChevronRight, MessageCircle, Phone, Star } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useTheme } from '@/stores/themeStore';
import type { CustomPalette, CustomPaletteId } from '@/stores/themeStore';
import { AlertDialog } from '@/ui/AlertDialog';
import { NavBar } from '@/ui/NavBar';
import { SliderRow } from '@/ui/SliderRow';
import { Toggle } from '@/ui/Toggle';
import { ActionRow, Section } from './IconThemeControls';
import { cssColor, DEFAULT_RECIPE, newPaletteId, PALETTE_NAME_MAX, rampFor, rampVars } from './paletteRamp';
import type { PaletteMode } from './paletteRamp';

export function PaletteEditorPage({ mode, editing, onBack }: {
    mode:     PaletteMode;
    editing?: CustomPalette;
    onBack:   () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const {
        customPalettes, saveCustomPalette, deleteCustomPalette,
        darkTheme, setDarkTheme, lightTheme, setLightTheme,
    } = useTheme(
        'customPalettes', 'saveCustomPalette', 'deleteCustomPalette',
        'darkTheme', 'setDarkTheme', 'lightTheme', 'setLightTheme',
    );

    const [name,  setName]  = useState(editing?.name ?? '');
    const [hue,   setHue]   = useState(editing?.hue ?? DEFAULT_RECIPE[mode].hue);
    const [tint,  setTint]  = useState(editing?.tint ?? DEFAULT_RECIPE[mode].tint);
    const [depth, setDepth] = useState(editing?.depth ?? DEFAULT_RECIPE[mode].depth);
    const [error, setError] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const ramp = useMemo(() => rampFor(mode, { hue, tint, depth }), [mode, hue, tint, depth]);
    const previewVars = rampVars(ramp) as CSSProperties;

    const trimmed = name.trim();
    const isDark  = mode === 'dark';
    const applied = (isDark ? darkTheme : lightTheme) === editing?.id;

    async function save() {
        const id = editing?.id ?? newPaletteId(customPalettes.map(p => p.id)) as CustomPaletteId;
        const message = await saveCustomPalette({ id, name: trimmed, mode, hue, tint, depth });
        if (message !== null) {
            setError(message || t('settings.paletteSaveFailed', 'That palette could not be saved.'));
            return;
        }
        if (isDark) setDarkTheme(id); else setLightTheme(id);
        goBack();
    }

    return (
        <div className="absolute inset-0 z-40 flex flex-col bg-base text-black dark:text-white" style={pageStyle}>
            <div className="h-11 shrink-0" aria-hidden />
            <NavBar
                backLabel={t('common.cancel', 'Cancel')}
                onBack={goBack}
                title={editing
                    ? t('settings.paletteEdit', 'Edit Palette')
                    : t('settings.paletteNew', 'New Palette')}
                right={(
                    <button
                        type="button"
                        disabled={!trimmed}
                        onClick={() => void save()}
                        className="text-[17px] font-semibold text-ios-blue disabled:opacity-40 enabled:active:opacity-60"
                    >
                        {t('common.save', 'Save')}
                    </button>
                )}
                hairline
            />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="flex flex-col gap-7 pb-12 pt-6">
                    <div className="px-4">
                        <PalettePreview vars={previewVars} dark={isDark} />
                    </div>

                    <Section header={t('settings.paletteNameHeader', 'Name')}>
                        <div className="px-4 py-3">
                            <input
                                value={name}
                                maxLength={PALETTE_NAME_MAX}
                                onChange={e => { setName(e.target.value); setError(null); }}
                                placeholder={t('settings.paletteNamePlaceholder', 'My Palette')}
                                aria-label={t('settings.paletteNameHeader', 'Name')}
                                className="w-full bg-transparent text-[17px] font-normal text-black outline-none placeholder:text-ios-gray dark:text-white"
                            />
                        </div>
                    </Section>

                    <Section
                        header={t('settings.paletteColourHeader', 'Colour')}
                        footer={isDark
                            ? t('settings.paletteColourHintDark', 'Depth sets how far the background sits from black. Tint decides how much of the hue reaches it.')
                            : t('settings.paletteColourHintLight', 'Depth sets how close the background sits to white. Tint decides how much of the hue reaches it.')}
                    >
                        <SliderRow
                            label={t('settings.paletteHue', 'Hue')}
                            value={hue}
                            min={0}
                            max={359}
                            display={`${hue}°`}
                            accessory={<HueDot hue={hue} />}
                            divider
                            onChange={setHue}
                        />
                        <SliderRow
                            label={t('settings.paletteTint', 'Tint')}
                            value={tint}
                            display={`${tint}%`}
                            divider
                            onChange={setTint}
                        />
                        <SliderRow
                            label={t('settings.paletteDepth', 'Depth')}
                            value={depth}
                            display={`${depth}%`}
                            onChange={setDepth}
                        />
                    </Section>

                    {editing && (
                        <Section footer={applied
                            ? t('settings.paletteDeleteHintApplied', 'This palette is in use. Deleting it returns the phone to the default shade.')
                            : undefined}>
                            <ActionRow
                                label={t('settings.paletteDelete', 'Delete Palette')}
                                destructive
                                onPress={() => setConfirmDelete(true)}
                            />
                        </Section>
                    )}

                    {error && (
                        <p className="px-7 text-[13px] font-normal text-ios-red">{error}</p>
                    )}
                </div>
            </div>

            {confirmDelete && editing && (
                <AlertDialog
                    title={t('settings.paletteDeleteTitle', 'Delete Palette?')}
                    message={t('settings.paletteDeleteBody', '"{name}" will be removed from this phone.', { name: editing.name })}
                    confirmLabel={t('common.delete', 'Delete')}
                    destructive
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={() => {
                        deleteCustomPalette(editing.id);
                        setConfirmDelete(false);
                        goBack();
                    }}
                />
            )}
        </div>
    );
}

function HueDot({ hue }: { hue: number }) {
    return (
        <span
            className="block h-[14px] w-[14px] shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
            style={{ background: `hsl(${hue} 90% 50%)` }}
        />
    );
}

function PalettePreview({ vars, dark }: { vars: CSSProperties; dark: boolean }) {
    return (
        <div
            className={`overflow-hidden rounded-[18px] ring-1 ring-black/10 dark:ring-white/10 ${dark ? 'dark' : ''}`}
            style={vars}
        >
            <div className="bg-base px-4 pb-4 pt-3.5">
                <div className={`pb-3 text-[15px] font-semibold ${dark ? 'text-white' : 'text-black'}`}>
                    {t('settings.palettePreview', 'Preview')}
                </div>

                <div className="overflow-hidden rounded-[12px] bg-surface">
                    <PreviewRow icon={<Phone className="h-[15px] w-[15px]" strokeWidth={2.5} />} tint="#34C759" label={t('settings.display', 'Display')} dark={dark} divider />
                    <PreviewRow icon={<MessageCircle className="h-[15px] w-[15px]" strokeWidth={2.5} />} tint="#0A84FF" label={t('settings.notifications', 'Notifications')} dark={dark} divider />
                    <PreviewRow icon={<Star className="h-[15px] w-[15px]" strokeWidth={2.5} />} tint="#FF9500" label={t('settings.wallpaper', 'Wallpaper')} dark={dark} toggle />
                </div>

                <div className="mt-3 flex items-center gap-2">
                    <Chip label="base" channels={cssColorOf(vars, '--base')} dark={dark} />
                    <Chip label="surface" channels={cssColorOf(vars, '--surface')} dark={dark} />
                    <Chip label="elevated" channels={cssColorOf(vars, '--elevated')} dark={dark} />
                    <Chip label="control" channels={cssColorOf(vars, '--control')} dark={dark} />
                </div>
            </div>
        </div>
    );
}

function PreviewRow({ icon, tint, label, dark, divider = false, toggle = false }: {
    icon:     ReactNode;
    tint:     string;
    label:    string;
    dark:     boolean;
    divider?: boolean;
    toggle?:  boolean;
}) {
    return (
        <div className="relative flex items-center gap-3 px-3 py-2">
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-white" style={{ background: tint }}>
                {icon}
            </span>
            <span className={`flex-1 truncate text-[15px] font-normal ${dark ? 'text-white' : 'text-black'}`}>{label}</span>
            {toggle
                ? <Toggle on scale={0.8} />
                : <ChevronRight className="h-[15px] w-[15px] shrink-0 text-ios-gray3" strokeWidth={2.5} />}
            {divider && <div className="pointer-events-none absolute inset-x-3 bottom-0 h-[0.5px] bg-control" />}
        </div>
    );
}

function Chip({ label, channels, dark }: { label: string; channels: string; dark: boolean }) {
    return (
        <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="block h-[18px] w-full rounded-[5px] ring-1 ring-black/10 dark:ring-white/10" style={{ background: channels }} />
            <span className={`w-full truncate text-center text-[10px] ${dark ? 'text-ios-gray' : 'text-ios-gray'}`}>{label}</span>
        </div>
    );
}

function cssColorOf(vars: CSSProperties, key: string): string {
    return cssColor((vars as unknown as Record<string, string>)[key] ?? '0 0 0');
}
