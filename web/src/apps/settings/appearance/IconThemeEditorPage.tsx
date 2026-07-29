import { useState } from 'react';
import { Check } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { AppGlyph } from '@/shell/AppGlyphs';
import { resolveWallpaper } from '@/shell/wallpapers';
import { useTheme } from '@/stores/themeStore';
import {
    newCustomIconThemeId, resolveDraftAppearance, sanitizeCustomIconTheme,
    useIconTheme, useIconThemeStore, useShowAppNames,
} from '@/stores/iconThemeStore';
import type { ColorRecipe, CustomIconTheme, CustomIconThemeId } from '@/stores/iconThemeStore';
import { AlertDialog } from '@/ui/AlertDialog';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { NavBar } from '@/ui/NavBar';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';

const LIGHTEN = '#ffffff';
const DARKEN  = '#0f0f12';

const WHITE = '#ffffff';
const BLACK = '#000000';

const SWATCHES = [
    '#ffffff', '#f4f4f6', '#d1d1d6', '#8e8e93', '#48484a', '#26262a', '#0a0a0c', '#000000',
    '#ff453a', '#ff6482', '#ff9f0a', '#ffd60a', '#e8dcc4', '#ac8e68', '#8b5e3c', '#5c3d2e',
    '#34c759', '#00c7be', '#5ac8fa', '#0a84ff', '#5e5ce6', '#bf5af2', '#39414f', '#1f3a5f',
];

const PREVIEW_APPS = [
    { id: 'phone',    icon: 'phone',    label: 'Phone',    accent: '#34c759' },
    { id: 'mail',     icon: 'mail',     label: 'Mail',     accent: '#0a84ff' },
    { id: 'maps',     icon: 'maps',     label: 'Maps',     accent: '#f0c43a' },
    { id: 'music',    icon: 'music',    label: 'Music',    accent: '#fa233b' },
    { id: 'weather',  icon: 'weather',  label: 'Weather',  accent: '#5ac8fa' },
    { id: 'notes',    icon: 'notes',    label: 'Notes',    accent: '#ffd60a' },
    { id: 'photos',   icon: 'photos',   label: 'Photos',   accent: '#bf5af2' },
    { id: 'settings', icon: 'settings', label: 'Settings', accent: '#8e8e93' },
];

type TileSource = 'accent' | 'fixed';
type BlendDir   = 'light' | 'dark';
type GlyphMode  = 'white' | 'black' | 'accent' | 'fixed';

function readBlend(recipe: ColorRecipe): { dir: BlendDir; amount: number } {
    if (recipe.toward === undefined || recipe.amount === undefined) return { dir: 'dark', amount: 0 };
    return {
        dir:    recipe.toward === LIGHTEN ? 'light' : 'dark',
        amount: Math.round(recipe.amount * 100),
    };
}

function readGlyphMode(recipe: ColorRecipe): GlyphMode {
    if (recipe.from === 'accent') return 'accent';
    if (recipe.color === WHITE) return 'white';
    if (recipe.color === BLACK) return 'black';
    return 'fixed';
}

export function IconThemeEditorPage({ existing, onBack }: {
    existing: CustomIconTheme | null;
    onBack:   () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const applied      = useIconTheme();
    const showAppNames = useShowAppNames();
    const { wallpaperHome }    = useTheme('wallpaperHome');
    const setIconTheme         = useIconThemeStore(s => s.setIconTheme);
    const saveCustomIconTheme  = useIconThemeStore(s => s.saveCustomIconTheme);
    const deleteCustomIconTheme = useIconThemeStore(s => s.deleteCustomIconTheme);

    const [origin] = useState(existing);
    const [id] = useState<CustomIconThemeId>(() => origin?.id ?? newCustomIconThemeId());
    const [name, setName] = useState(origin?.name ?? t('settings.iconThemeNewName', 'My Theme'));

    const startTile:  ColorRecipe = origin?.background ?? { from: 'accent' };
    const startGlyph: ColorRecipe = origin?.glyph ?? { from: 'fixed', color: WHITE };
    const startBlend = readBlend(startTile);

    const [tileSource, setTileSource] = useState<TileSource>(startTile.from);
    const [tileColor,  setTileColor]  = useState(startTile.color ?? '#26262a');
    const [blendDir,   setBlendDir]   = useState<BlendDir>(startBlend.dir);
    const [blend,      setBlend]      = useState(startBlend.amount);
    const [glyphMode,  setGlyphMode]  = useState<GlyphMode>(readGlyphMode(startGlyph));
    const [glyphColor, setGlyphColor] = useState(startGlyph.color ?? '#f4f4f6');
    const [gloss,      setGloss]      = useState(origin?.depth === true);

    const [failure,  setFailure]  = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [busy, setBusy] = useState(false);

    const background: ColorRecipe = {
        from: tileSource,
        ...(tileSource === 'fixed' ? { color: tileColor } : {}),
        ...(blend > 0 ? { toward: blendDir === 'light' ? LIGHTEN : DARKEN, amount: blend / 100 } : {}),
    };

    const glyph: ColorRecipe =
        glyphMode === 'accent' ? { from: 'accent' }
        : { from: 'fixed', color: glyphMode === 'white' ? WHITE : glyphMode === 'black' ? BLACK : glyphColor };

    const trimmed = name.trim();
    const draft: CustomIconTheme = { id, name: trimmed, background, glyph, ...(gloss ? { depth: true } : {}) };
    const valid = sanitizeCustomIconTheme(draft) !== null;

    async function persist(): Promise<boolean> {
        if (!valid || busy) return false;
        setBusy(true);
        const message = await saveCustomIconTheme(draft);
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
        goBack();
    }

    function remove() {
        setConfirmDelete(false);
        deleteCustomIconTheme(id);
        goBack();
    }

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-[#d4d4d4] text-black dark:bg-base dark:text-white" style={pageStyle}>
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

                    <div className="mx-4">
                        <div
                            className="overflow-hidden rounded-[14px]"
                            style={{
                                backgroundImage:    `url(${resolveWallpaper(wallpaperHome)})`,
                                backgroundSize:     'cover',
                                backgroundPosition: 'center',
                            }}
                        >
                            <div className="grid grid-cols-4 gap-y-5 bg-black/25 px-3 py-6">
                                {PREVIEW_APPS.map(app => (
                                    <div key={app.id} className="flex flex-col items-center gap-[6px]">
                                        <PreviewTile
                                            background={background}
                                            glyph={glyph}
                                            gloss={gloss}
                                            app={app}
                                            size={68}
                                        />
                                        {showAppNames && (
                                            <span
                                                className="w-full truncate px-0.5 text-center font-sf text-[11px] font-semibold tracking-[0.01em] text-white"
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
                            {t('settings.iconThemePreviewHint', 'Your theme on the Home Screen, updating as you go.')}
                        </p>
                    </div>

                    <ListGroup header={t('settings.iconThemeNameHeader', 'Name')}>
                        <div className="px-4 py-3">
                            <input
                                value={name}
                                maxLength={24}
                                onChange={e => setName(e.target.value)}
                                placeholder={t('settings.iconThemeNewName', 'My Theme')}
                                aria-label={t('settings.iconThemeNameHeader', 'Name')}
                                className="w-full bg-transparent text-[17px] font-normal text-black outline-none placeholder:text-ios-gray dark:text-white"
                            />
                        </div>
                    </ListGroup>

                    <ListGroup
                        header={t('settings.iconThemeTile', 'Tile')}
                        footer={tileSource === 'accent'
                            ? t('settings.iconThemeTileAppHint', 'Every tile keeps its own app colour.')
                            : t('settings.iconThemeTileFixedHint', 'One colour for every app.')}
                    >
                        <div className="px-4 py-3">
                            <SegmentedControl
                                value={tileSource}
                                onChange={setTileSource}
                                options={[
                                    { value: 'accent', label: t('settings.iconThemeAppColour', 'App Colour') },
                                    { value: 'fixed',  label: t('settings.iconThemeOneColour', 'One Colour') },
                                ]}
                            />
                        </div>
                        {tileSource === 'fixed' && (
                            <>
                                <Hairline />
                                <SwatchGrid value={tileColor} onChange={setTileColor} label={t('settings.iconThemeTile', 'Tile')} />
                            </>
                        )}
                    </ListGroup>

                    <ListGroup
                        header={t('settings.iconThemeBlend', 'Blend')}
                        footer={t('settings.iconThemeBlendHint', 'Pulls the tile toward a lighter or darker tone.')}
                    >
                        <div className="px-4 py-3">
                            <SegmentedControl
                                value={blendDir}
                                onChange={setBlendDir}
                                options={[
                                    { value: 'light', label: t('settings.iconThemeLighter', 'Lighter') },
                                    { value: 'dark',  label: t('settings.iconThemeDarker', 'Darker') },
                                ]}
                            />
                        </div>
                        <Hairline />
                        <div className="flex items-center gap-4 px-4 py-2">
                            <Slider
                                className="flex-1"
                                value={blend}
                                onChange={setBlend}
                                ariaLabel={t('settings.iconThemeBlend', 'Blend')}
                            />
                            <span className="w-9 shrink-0 text-right text-[15px] tabular-nums text-ios-gray">{blend}</span>
                        </div>
                    </ListGroup>

                    <ListGroup header={t('settings.iconThemeSymbol', 'Symbol')}>
                        <div className="px-4 py-3">
                            <SegmentedControl
                                value={glyphMode}
                                onChange={setGlyphMode}
                                options={[
                                    { value: 'white',  label: t('settings.iconThemeWhite', 'White') },
                                    { value: 'black',  label: t('settings.iconThemeBlack', 'Black') },
                                    { value: 'accent', label: t('settings.iconThemeApp', 'App') },
                                    { value: 'fixed',  label: t('settings.iconThemeColour', 'Colour') },
                                ]}
                            />
                        </div>
                        {glyphMode === 'fixed' && (
                            <>
                                <Hairline />
                                <SwatchGrid value={glyphColor} onChange={setGlyphColor} label={t('settings.iconThemeSymbol', 'Symbol')} />
                            </>
                        )}
                    </ListGroup>

                    <ListGroup footer={t('settings.iconThemeGlossHint', 'The lit, glassy sheen the Glass theme uses.')}>
                        <ListRow
                            label={t('settings.iconThemeGloss', 'Gloss')}
                            chevron={false}
                            right={<div className="pointer-events-none -my-1"><Toggle on={gloss} /></div>}
                            onPress={() => setGloss(!gloss)}
                        />
                    </ListGroup>

                    <ListGroup>
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
                    </ListGroup>

                </div>
            </div>

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
        </div>
    );
}

function Hairline() {
    return <div className="h-[0.5px] bg-ios-gray4 dark:bg-control" />;
}

function ActionRow({ label, destructive = false, disabled = false, divider = false, right, onPress }: {
    label:        string;
    destructive?: boolean;
    disabled?:    boolean;
    divider?:     boolean;
    right?:       React.ReactNode;
    onPress:      () => void;
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            disabled={disabled}
            className={`relative flex w-full items-center px-4 py-3 text-[17px] font-normal active:bg-black/5 disabled:opacity-40 dark:active:bg-white/5 ${destructive ? 'text-ios-red' : 'text-ios-blue'}`}
        >
            <span className="flex-1 text-left">{label}</span>
            {right}
            {divider && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[0.5px] bg-ios-gray4 dark:bg-control" />}
        </button>
    );
}

function SwatchGrid({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
    return (
        <div className="grid grid-cols-8 gap-2 px-4 py-4" role="group" aria-label={label}>
            {SWATCHES.map(colour => {
                const on = colour === value;
                return (
                    <button
                        key={colour}
                        type="button"
                        aria-label={colour}
                        aria-pressed={on}
                        onClick={() => onChange(colour)}
                        className="relative aspect-square w-full rounded-full active:opacity-70"
                        style={{
                            background: colour,
                            boxShadow: on
                                ? '0 0 0 2px #0a84ff, inset 0 0 0 0.5px rgba(0,0,0,0.20)'
                                : 'inset 0 0 0 0.5px rgba(0,0,0,0.20)',
                        }}
                    />
                );
            })}
        </div>
    );
}

function PreviewTile({ background, glyph, gloss, app, size }: {
    background: ColorRecipe;
    glyph:      ColorRecipe;
    gloss:      boolean;
    app:        { icon: string; label: string; accent: string; id: string };
    size:       number;
}) {
    const look = resolveDraftAppearance({ background, glyph, depth: gloss }, app.id, app.accent);
    return (
        <span
            className="relative block shrink-0 overflow-hidden"
            style={{
                width:        size,
                height:       size,
                borderRadius: '27.6%',
                boxShadow:    '0 2px 8px rgba(0,0,0,0.34), inset 0 0 0 0.5px rgba(255,255,255,0.12)',
            }}
        >
            <span className="flex h-full w-full items-center justify-center" style={{ background: look.background }}>
                <AppGlyph icon={app.icon} label={app.label} color={look.glyph} size={Math.round(size * 0.52)} />
            </span>
        </span>
    );
}
