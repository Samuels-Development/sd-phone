import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

import { t } from '@/i18n';
import { apiCall } from '@/core/api';
import { isFiveM } from '@/core/nui';
import { useIosPush } from '@/hooks/useIosPush';
import { useSessionState } from '@/hooks/useSessionState';
import { encodeThemeCode } from '@/lib/themeCode';
import { PushLayer } from '@/shell/PushLayer';
import { resolveWallpaper } from '@/shell/wallpapers';
import { ShareAction, ShareSheet } from '@/shared/ShareSheet';
import { useTheme } from '@/stores/themeStore';
import {
    iconThemeWallpaper, MAX_ICON_OVERRIDES, newCustomIconThemeId, resolveDraftAppearance,
    sanitizeCustomIconTheme, useIconTheme, useIconThemeStore, useShowAppNames,
} from '@/stores/iconThemeStore';
import type {
    CustomIconTheme, CustomIconThemeId, IconThemeLabel, IconThemeVariant,
} from '@/stores/iconThemeStore';
import { AlertDialog } from '@/ui/AlertDialog';
import { ListRow } from '@/ui/ListGroup';
import { NavBar } from '@/ui/NavBar';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { SliderRow } from '@/ui/SliderRow';
import {
    PREVIEW_APPS, RADIUS_SQUIRCLE, radiusChoices, textureChoices, themePresets,
} from './iconThemeCatalog';
import {
    activeLook, DARKEN, draftFromTheme, dropTraits, hasOwnTraits, isLockedInDark, previewDraft,
    seedDraft, toTheme, writeTrait, WHITE,
} from './iconThemeDraft';
import type { DraftState, TraitKey, VariantKey } from './iconThemeDraft';
import {
    ActionRow, Hairline, RecipeEditor, Section, SectionAction, SwitchRow, TilePicker,
} from './IconThemeControls';
import { StageBadge, ThemePreviewGrid, ThemeStage } from './IconThemePreview';
import { IconOverridesPage } from './IconOverridesPage';
import { ThemeWallpaperPage } from './ThemeWallpaperPage';
import { ThemeCodeSheet } from './ThemeCodeSheet';

const DEFAULT_ANGLE  = 166;
const DEFAULT_WEIGHT = 600;
const SHAPE_SAMPLE   = PREVIEW_APPS[0];
const TEXTURE_SAMPLE = PREVIEW_APPS[1];

async function shareTheme(target: number, name: string, code: string): Promise<boolean> {
    if (!isFiveM) return true;
    const body = [
        t('settings.iconThemeShareTitle', 'Icon theme: {name}', { name }),
        code,
        t('settings.iconThemeShareFooter', 'Paste this code into Settings, App Icons, New Theme.'),
    ].join('\n\n');
    const r = await apiCall<void>('sd-phone:notes:share', { target, body, sketches: [], images: [] });
    return r.success;
}

export function IconThemeEditorPage({ existing, seed, onBack }: {
    existing: CustomIconTheme | null;
    seed:     DraftState | null;
    onBack:   () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const applied      = useIconTheme();
    const showAppNames = useShowAppNames();
    const { wallpaperHome, setWallpaper } = useTheme('wallpaperHome', 'setWallpaper');
    const setIconTheme          = useIconThemeStore(s => s.setIconTheme);
    const saveCustomIconTheme   = useIconThemeStore(s => s.saveCustomIconTheme);
    const deleteCustomIconTheme = useIconThemeStore(s => s.deleteCustomIconTheme);

    const [origin] = useState(existing);
    const [id] = useState<CustomIconThemeId>(() => origin?.id ?? newCustomIconThemeId());
    const [state, setState] = useState<DraftState>(() => {
        if (origin) return draftFromTheme(origin);
        if (seed) return seed;
        const first = themePresets()[0];
        return seedDraft(t('settings.iconThemeNewName', 'My Theme'), first.seed);
    });

    const [pinned, setPinned] = useSessionState<boolean>('settings:iconThemePinned', false);
    const [variant, setVariant] = useState<VariantKey>('base');
    const [sub,     setSub]     = useState<'overrides' | 'wallpaper' | null>(null);
    const [sheet,   setSheet]   = useState<'code' | 'share' | null>(null);
    const [pairing, setPairing] = useState<string | null>(null);
    const [failure, setFailure] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [busy, setBusy] = useState(false);

    const look  = activeLook(state, variant);
    const draft = previewDraft(state, variant);
    const dark  = variant === 'dark';

    function set<K extends TraitKey>(key: K, value: NonNullable<IconThemeVariant[K]>) {
        setState(s => writeTrait(s, variant, key, value));
    }

    function drop(...keys: TraitKey[]) {
        setState(s => dropTraits(s, variant, keys));
    }

    function darkAction(keys: TraitKey[]) {
        if (!hasOwnTraits(state, variant, keys)) return undefined;
        return (
            <SectionAction
                label={t('settings.iconThemeFollowBase', 'Follow Base')}
                onPress={() => drop(...keys)}
            />
        );
    }

    function footerFor(keys: TraitKey[], base?: string): string | undefined {
        if (!dark) return base;
        return hasOwnTraits(state, variant, keys)
            ? t('settings.iconThemeDarkOwn', 'Set for Dark Mode only.')
            : t('settings.iconThemeDarkFollows', 'Following your base design. Change anything here to set it for Dark Mode only.');
    }

    function setLabelStyle(patch: Partial<IconThemeLabel>) {
        const merged: IconThemeLabel = { ...(look.label ?? {}), ...patch };
        const clean: IconThemeLabel = {};
        if (merged.color) clean.color = merged.color;
        if (merged.weight !== undefined) clean.weight = merged.weight;
        if (merged.show !== undefined) clean.show = merged.show;
        if (Object.keys(clean).length === 0) drop('label');
        else set('label', clean);
    }

    function setBorderWidth(width: number) {
        if (width <= 0) { drop('border'); return; }
        set('border', { color: look.border?.color ?? { from: 'fixed', color: WHITE }, width });
    }

    const trimmed  = state.name.trim();
    const theme    = toTheme(id, state);
    const valid    = trimmed.length > 0 && sanitizeCustomIconTheme(theme) !== null;
    const code     = valid ? encodeThemeCode(theme) : '';
    const overrides = Object.keys(look.overrides ?? {}).length;

    const gloss   = Math.round((look.gloss ?? (look.depth === true ? 1 : 0)) * 100);
    const shapes  = radiusChoices();
    const radius  = look.radius ?? RADIUS_SQUIRCLE;
    const texture = look.texture ?? 'none';

    async function persist(): Promise<boolean> {
        if (!valid || busy) return false;
        setBusy(true);
        const message = await saveCustomIconTheme(theme);
        setBusy(false);
        if (message) { setFailure(message); return false; }
        return true;
    }

    async function save() {
        if (await persist()) goBack();
    }

    async function apply() {
        if (!await persist()) return;
        setIconTheme(id);
        const paired = iconThemeWallpaper(id);
        if (paired && resolveWallpaper(paired) !== resolveWallpaper(wallpaperHome)) {
            setPairing(paired);
            return;
        }
        goBack();
    }

    function finishPairing(accept: boolean) {
        const paired = pairing;
        setPairing(null);
        if (accept && paired) setWallpaper(resolveWallpaper(paired), 'home');
        goBack();
    }

    function remove() {
        setConfirmDelete(false);
        deleteCustomIconTheme(id);
        goBack();
    }

    const subNode =
        sub === 'overrides' ? (
            <IconOverridesPage
                draft={draft}
                wallpaper={look.wallpaper ?? wallpaperHome}
                showAppNames={showAppNames}
                pinned={pinned}
                onTogglePin={() => setPinned(!pinned)}
                onChange={next => { if (next) set('overrides', next); else drop('overrides'); }}
                onBack={() => setSub(null)}
            />
        ) : sub === 'wallpaper' ? (
            <ThemeWallpaperPage
                draft={draft}
                showAppNames={showAppNames}
                wallpaper={look.wallpaper}
                pinned={pinned}
                onTogglePin={() => setPinned(!pinned)}
                onChange={next => { if (next) set('wallpaper', next); else drop('wallpaper'); }}
                onBack={() => setSub(null)}
            />
        ) : null;

    return (
        <PushLayer pageStyle={pageStyle} className="z-30" sub={subNode}>
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar
                backLabel={t('settings.appIcons', 'App Icons')}
                onBack={goBack}
                title={origin ? t('settings.iconThemeEdit', 'Edit Theme') : t('settings.iconThemeNew', 'New Theme')}
                hairline
                right={(
                    <button
                        type="button"
                        onClick={() => { void save(); }}
                        disabled={!valid || busy}
                        className="text-[17px] font-semibold text-ios-blue active:opacity-60 disabled:opacity-40"
                    >
                        {t('common.save', 'Save')}
                    </button>
                )}
            />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-6 pb-12">

                    <ThemeStage
                        wallpaper={look.wallpaper ?? wallpaperHome}
                        badge={dark ? <StageBadge label={t('settings.iconThemeDarkBadge', 'Dark Mode')} /> : undefined}
                        pinned={pinned}
                        onTogglePin={() => setPinned(!pinned)}
                        hint={dark
                            ? t('settings.iconThemeDarkPreviewHint', 'Your Dark Mode design, shown here whatever your phone is set to.')
                            : t('settings.iconThemePreviewHint', 'Your theme on the Home Screen, updating as you go.')}
                    >
                        <ThemePreviewGrid draft={draft} showAppNames={showAppNames} pinned={pinned} />
                    </ThemeStage>

                    <Section
                        footer={dark
                            ? t('settings.iconThemeVariantDarkHint', 'A Dark Mode design only replaces the parts you change here.')
                            : state.dark !== null
                                ? t('settings.iconThemeVariantHasDark', 'This theme also has a Dark Mode design.')
                                : t('settings.iconThemeVariantBaseHint', 'Your base design is used everywhere, including Dark Mode until you add one.')}
                    >
                        <div className="px-4 py-3">
                            <SegmentedControl
                                value={variant}
                                onChange={setVariant}
                                options={[
                                    { value: 'base', label: t('settings.iconThemeVariantBase', 'Base') },
                                    { value: 'dark', label: t('settings.iconThemeVariantDark', 'Dark Mode') },
                                ]}
                            />
                        </div>
                        {dark && state.dark !== null && (
                            <>
                                <Hairline />
                                <ActionRow
                                    label={t('settings.iconThemeDarkClear', 'Remove Dark Design')}
                                    destructive
                                    onPress={() => setState(s => ({ ...s, dark: null }))}
                                />
                            </>
                        )}
                    </Section>

                    {!dark && (
                        <Section header={t('settings.iconThemeNameHeader', 'Name')}>
                            <div className="px-4 py-3">
                                <input
                                    value={state.name}
                                    maxLength={24}
                                    onChange={e => setState(s => ({ ...s, name: e.target.value }))}
                                    placeholder={t('settings.iconThemeNewName', 'My Theme')}
                                    aria-label={t('settings.iconThemeNameHeader', 'Name')}
                                    className="w-full bg-transparent text-[17px] font-normal text-black outline-none placeholder:text-ios-gray dark:text-white"
                                />
                            </div>
                        </Section>
                    )}

                    <Section
                        header={t('settings.iconThemeShape', 'Shape')}
                        action={darkAction(['radius'])}
                        footer={footerFor(['radius'])}
                    >
                        <TilePicker
                            value={radius}
                            label={t('settings.iconThemeShape', 'Shape')}
                            options={shapes.map(choice => ({
                                value: choice.value,
                                label: choice.label,
                                icon:  SHAPE_SAMPLE.icon,
                                look:  resolveDraftAppearance({ ...draft, radius: choice.value }, SHAPE_SAMPLE.id, SHAPE_SAMPLE.accent),
                            }))}
                            onChange={value => set('radius', value)}
                        />
                    </Section>

                    <Section
                        header={t('settings.iconThemeTile', 'Tile Colour')}
                        action={darkAction(['background'])}
                        footer={footerFor(['background'], look.background.from === 'accent'
                            ? t('settings.iconThemeTileAppHint', 'Every tile keeps its own app colour.')
                            : t('settings.iconThemeTileFixedHint', 'One colour for every app.'))}
                    >
                        <RecipeEditor
                            recipe={look.background}
                            onChange={recipe => set('background', recipe)}
                            label={t('settings.iconThemeTile', 'Tile Colour')}
                        />
                    </Section>

                    <Section
                        header={t('settings.iconThemeGradient', 'Gradient')}
                        action={darkAction(['background2', 'angle'])}
                        footer={footerFor(['background2', 'angle'], t('settings.iconThemeGradientHint', 'A second colour the tile fades into. The angle also turns the depth shading.'))}
                    >
                        <SwitchRow
                            label={t('settings.iconThemeSecondColour', 'Second Colour')}
                            on={look.background2 !== undefined}
                            disabled={isLockedInDark(state, variant, 'background2')}
                            divider
                            onToggle={() => {
                                if (look.background2) drop('background2');
                                else set('background2', { from: 'accent', toward: DARKEN, amount: 0.55 });
                            }}
                        />
                        {look.background2 && (
                            <>
                                <RecipeEditor
                                    recipe={look.background2}
                                    onChange={recipe => set('background2', recipe)}
                                    label={t('settings.iconThemeSecondColour', 'Second Colour')}
                                    title={t('settings.iconThemeColour', 'Colour')}
                                />
                                <Hairline />
                            </>
                        )}
                        {(look.background2 !== undefined || look.depth === true) && (
                            <SliderRow
                                label={t('settings.iconThemeAngle', 'Angle')}
                                value={look.angle ?? DEFAULT_ANGLE}
                                display={`${Math.round(look.angle ?? DEFAULT_ANGLE)}°`}
                                max={360}
                                onChange={value => set('angle', value)}
                            />
                        )}
                    </Section>

                    <Section
                        header={t('settings.iconThemeTexture', 'Texture')}
                        action={darkAction(['texture'])}
                        footer={footerFor(['texture'], t('settings.iconThemeTextureHint', 'A fine pattern printed over the tile.'))}
                    >
                        <TilePicker
                            value={texture}
                            label={t('settings.iconThemeTexture', 'Texture')}
                            options={textureChoices().map(choice => ({
                                value: choice.value,
                                label: choice.label,
                                icon:  TEXTURE_SAMPLE.icon,
                                look:  resolveDraftAppearance({ ...draft, texture: choice.value }, TEXTURE_SAMPLE.id, TEXTURE_SAMPLE.accent),
                            }))}
                            onChange={value => set('texture', value)}
                        />
                    </Section>

                    <Section
                        header={t('settings.iconThemeSymbol', 'Symbol')}
                        action={darkAction(['glyph', 'glyphScale', 'glyphWeight'])}
                        footer={footerFor(['glyph', 'glyphScale', 'glyphWeight'])}
                    >
                        <RecipeEditor
                            recipe={look.glyph}
                            onChange={recipe => set('glyph', recipe)}
                            label={t('settings.iconThemeSymbol', 'Symbol')}
                            title={t('settings.iconThemeColour', 'Colour')}
                            fallbackColour={WHITE}
                        />
                        <Hairline />
                        <SliderRow
                            label={t('settings.iconThemeSymbolSize', 'Size')}
                            value={Math.round((look.glyphScale ?? 1) * 100)}
                            display={`${Math.round((look.glyphScale ?? 1) * 100)}%`}
                            min={60}
                            max={140}
                            step={2}
                            divider
                            onChange={value => set('glyphScale', value / 100)}
                        />
                        <SliderRow
                            label={t('settings.iconThemeSymbolWeight', 'Thickness')}
                            value={Math.round((look.glyphWeight ?? 1.9) * 10)}
                            display={(Math.round((look.glyphWeight ?? 1.9) * 10) / 10).toFixed(1)}
                            min={10}
                            max={30}
                            onChange={value => set('glyphWeight', value / 10)}
                        />
                    </Section>

                    <Section
                        header={t('settings.iconThemeDepth', 'Depth and Shine')}
                        action={darkAction(['depth', 'gloss', 'bevel', 'glow'])}
                        footer={footerFor(['depth', 'gloss', 'bevel', 'glow'], t('settings.iconThemeDepthHint', 'Depth lights the tile from the top. Gloss is the sheen over it.'))}
                    >
                        <SwitchRow
                            label={t('settings.iconThemeDepthOn', 'Depth')}
                            on={look.depth === true}
                            disabled={isLockedInDark(state, variant, 'depth')}
                            divider
                            onToggle={() => { if (look.depth === true) drop('depth'); else set('depth', true); }}
                        />
                        <SliderRow
                            label={t('settings.iconThemeGloss', 'Gloss')}
                            value={gloss}
                            display={gloss === 0 ? t('settings.iconThemeMixNone', 'None') : `${gloss}%`}
                            divider
                            onChange={value => set('gloss', value / 100)}
                        />
                        <SwitchRow
                            label={t('settings.iconThemeBevel', 'Bevel')}
                            sub={t('settings.iconThemeBevelSub', 'A lit top edge and a shaded bottom one')}
                            on={look.bevel === true}
                            disabled={isLockedInDark(state, variant, 'bevel')}
                            divider
                            onToggle={() => { if (look.bevel === true) drop('bevel'); else set('bevel', true); }}
                        />
                        <SliderRow
                            label={t('settings.iconThemeGlow', 'Glow')}
                            value={Math.round((look.glow ?? 0) * 100)}
                            display={(look.glow ?? 0) === 0 ? t('settings.iconThemeMixNone', 'None') : `${Math.round((look.glow ?? 0) * 100)}%`}
                            onChange={value => { if (value === 0) drop('glow'); else set('glow', value / 100); }}
                        />
                    </Section>

                    <Section
                        header={t('settings.iconThemeOutline', 'Outline')}
                        action={darkAction(['border'])}
                        footer={footerFor(['border'], t('settings.iconThemeOutlineHint', 'A line drawn just inside the tile edge.'))}
                    >
                        <SliderRow
                            label={t('settings.iconThemeOutlineWidth', 'Thickness')}
                            value={look.border?.width ?? 0}
                            display={(look.border?.width ?? 0) === 0
                                ? t('settings.iconThemeMixNone', 'None')
                                : `${look.border?.width ?? 0}px`}
                            max={4}
                            step={0.5}
                            divider={look.border !== undefined && look.border.width > 0}
                            onChange={setBorderWidth}
                        />
                        {look.border && look.border.width > 0 && (
                            <RecipeEditor
                                recipe={look.border.color}
                                onChange={recipe => set('border', { color: recipe, width: look.border?.width ?? 1 })}
                                label={t('settings.iconThemeOutline', 'Outline')}
                                title={t('settings.iconThemeColour', 'Colour')}
                                fallbackColour={WHITE}
                            />
                        )}
                    </Section>

                    <Section
                        header={t('settings.iconThemeShift', 'App Colours')}
                        action={darkAction(['hue', 'saturation'])}
                        footer={footerFor(['hue', 'saturation'], t('settings.iconThemeShiftHint', 'Turns and drains every app colour before the tile is drawn.'))}
                    >
                        <SliderRow
                            label={t('settings.iconThemeHue', 'Hue')}
                            value={look.hue ?? 0}
                            display={`${look.hue ?? 0}°`}
                            min={-180}
                            max={180}
                            divider
                            onChange={value => { if (value === 0) drop('hue'); else set('hue', value); }}
                        />
                        <SliderRow
                            label={t('settings.iconThemeSaturation', 'Saturation')}
                            value={Math.round((look.saturation ?? 1) * 100)}
                            display={`${Math.round((look.saturation ?? 1) * 100)}%`}
                            max={200}
                            step={5}
                            divider={look.hue !== undefined || look.saturation !== undefined}
                            onChange={value => { if (value === 100) drop('saturation'); else set('saturation', value / 100); }}
                        />
                        {(look.hue !== undefined || look.saturation !== undefined) && (
                            <ActionRow
                                label={t('settings.iconThemeShiftReset', 'Keep the Original Colours')}
                                onPress={() => drop('hue', 'saturation')}
                            />
                        )}
                    </Section>

                    <Section
                        header={t('settings.iconThemeLabels', 'Names')}
                        action={darkAction(['label'])}
                        footer={footerFor(['label'], t('settings.iconThemeLabelsHint', 'How this theme draws the app name under each icon.'))}
                    >
                        <SwitchRow
                            label={t('settings.appNames', 'App Names')}
                            sub={look.label?.show === undefined
                                ? t('settings.iconThemeLabelFollow', 'Following the Home Screen setting')
                                : undefined}
                            on={look.label?.show ?? showAppNames}
                            divider
                            onToggle={() => setLabelStyle({ show: !(look.label?.show ?? showAppNames) })}
                        />
                        <SliderRow
                            label={t('settings.iconThemeLabelWeight', 'Weight')}
                            value={look.label?.weight ?? DEFAULT_WEIGHT}
                            display={String(look.label?.weight ?? DEFAULT_WEIGHT)}
                            min={100}
                            max={900}
                            step={100}
                            divider
                            onChange={value => setLabelStyle({ weight: value })}
                        />
                        <RecipeEditor
                            recipe={look.label?.color ?? { from: 'fixed', color: WHITE }}
                            onChange={recipe => setLabelStyle({ color: recipe })}
                            label={t('settings.iconThemeLabelColour', 'Name Colour')}
                            title={t('settings.iconThemeColour', 'Colour')}
                            fallbackColour={WHITE}
                        />
                        {look.label !== undefined && (
                            <>
                                <Hairline />
                                <ActionRow
                                    label={t('settings.iconThemeLabelReset', 'Use the Standard Names')}
                                    onPress={() => drop('label')}
                                />
                            </>
                        )}
                    </Section>

                    <Section
                        header={t('settings.iconThemeExtras', 'This Theme')}
                        action={darkAction(['overrides', 'wallpaper'])}
                        footer={footerFor(['overrides', 'wallpaper'])}
                    >
                        <ListRow
                            label={t('settings.iconOverrides', 'App Icons')}
                            sub={overrides === 0
                                ? t('settings.iconOverridesNone', 'Every app follows the theme')
                                : t('settings.iconOverridesCount', '{used} of {max} apps customised', { used: overrides, max: MAX_ICON_OVERRIDES })}
                            divider
                            onPress={() => setSub('overrides')}
                        />
                        <ListRow
                            label={t('settings.iconThemeWallpaper', 'Paired Wallpaper')}
                            sub={look.wallpaper
                                ? t('settings.iconThemeWallpaperSet', 'Offered when this theme is applied')
                                : t('settings.iconThemeWallpaperNone', 'No Paired Wallpaper')}
                            chevron
                            right={look.wallpaper ? (
                                <img
                                    src={resolveWallpaper(look.wallpaper)}
                                    alt=""
                                    draggable={false}
                                    className="h-[34px] w-[20px] rounded-[4px] object-cover"
                                />
                            ) : undefined}
                            onPress={() => setSub('wallpaper')}
                        />
                    </Section>

                    <Section
                        header={t('settings.iconThemeShare', 'Share')}
                        footer={t('settings.iconThemeShareHint', 'A theme code carries the whole design, both variants included.')}
                    >
                        <ActionRow
                            label={t('settings.iconThemeCode', 'Theme Code')}
                            disabled={!valid}
                            divider
                            onPress={() => setSheet('code')}
                        />
                        <ActionRow
                            label={t('settings.iconThemeAirShare', 'Send to a Nearby Phone')}
                            disabled={!valid}
                            onPress={() => setSheet('share')}
                        />
                    </Section>

                    <Section>
                        <ActionRow
                            label={t('settings.iconThemeApply', 'Save and Use')}
                            disabled={!valid || busy}
                            divider
                            right={applied === id ? <Check className="h-[17px] w-[17px] text-ios-blue" strokeWidth={2.5} /> : undefined}
                            onPress={() => { void apply(); }}
                        />
                        <ActionRow
                            label={t('settings.iconThemeDelete', 'Delete Theme')}
                            destructive
                            disabled={!origin}
                            onPress={() => setConfirmDelete(true)}
                        />
                    </Section>

                </div>
            </div>

            {sheet === 'code' && (
                <ThemeCodeSheet code={code} onClose={() => setSheet(null)} />
            )}

            {sheet === 'share' && (
                <ShareSheet
                    onClose={() => setSheet(null)}
                    onShare={target => shareTheme(target.id, trimmed, code)}
                >
                    <ShareAction
                        icon={<Copy className="h-[19px] w-[19px]" strokeWidth={2.2} />}
                        label={t('settings.iconThemeCopyCode', 'Copy Code')}
                        onClick={() => setSheet('code')}
                    />
                </ShareSheet>
            )}

            {pairing !== null && (
                <AlertDialog
                    title={t('settings.iconThemePairTitle', 'Use the Paired Wallpaper?')}
                    message={t('settings.iconThemePairBody', 'This theme comes with a wallpaper. Your Home Screen can change to match it.')}
                    confirmLabel={t('settings.iconThemePairConfirm', 'Use It')}
                    cancelLabel={t('settings.iconThemePairSkip', 'Keep Mine')}
                    onCancel={() => finishPairing(false)}
                    onConfirm={() => finishPairing(true)}
                />
            )}

            {confirmDelete && (
                <AlertDialog
                    title={t('settings.iconThemeDeleteTitle', 'Delete “{name}”?', { name: origin?.name ?? trimmed })}
                    message={t('settings.iconThemeDeleteBody', 'This theme is removed from your phone. If it is the one in use, your icons go back to Default.')}
                    confirmLabel={t('common.delete', 'Delete')}
                    destructive
                    onCancel={() => setConfirmDelete(false)}
                    onConfirm={remove}
                />
            )}

            {failure && (
                <AlertDialog
                    title={t('settings.iconThemeSaveTitle', 'Not Saved')}
                    message={failure}
                    confirmLabel={t('common.ok', 'OK')}
                    hideCancel
                    onCancel={() => setFailure(null)}
                    onConfirm={() => setFailure(null)}
                />
            )}
        </PushLayer>
    );
}
