import { t } from '@/i18n';
import type { IconTexture, IconThemeDraft } from '@/stores/iconThemeStore';

export interface ThemeApp {
    id:     string;
    label:  string;
    icon:   string;
    accent: string;
}

export const THEME_APPS: ThemeApp[] = [
    { id: 'phone',       label: 'Phone',        icon: 'phone',       accent: '#34c759' },
    { id: 'messages',    label: 'Messages',     icon: 'messages',    accent: '#34c759' },
    { id: 'mail',        label: 'Mail',         icon: 'mail',        accent: '#0a84ff' },
    { id: 'maps',        label: 'Maps',         icon: 'maps',        accent: '#f0c43a' },
    { id: 'compass',     label: 'Compass',      icon: 'compass',     accent: '#1c1c1e' },
    { id: 'camera',      label: 'Camera',       icon: 'camera',      accent: '#1c1c1e' },
    { id: 'photos',      label: 'Photos',       icon: 'photos',      accent: '#ffffff' },
    { id: 'music',       label: 'Music',        icon: 'music',       accent: '#fa233b' },
    { id: 'weather',     label: 'Weather',      icon: 'weather',     accent: '#5ac8fa' },
    { id: 'clock',       label: 'Clock',        icon: 'clock',       accent: '#1c1c1e' },
    { id: 'calendar',    label: 'Calendar',     icon: 'calendar',    accent: '#ffffff' },
    { id: 'notes',       label: 'Notes',        icon: 'notes',       accent: '#fec547' },
    { id: 'voicememos',  label: 'Voice Memos',  icon: 'voicememos',  accent: '#ff3b30' },
    { id: 'bank',        label: 'Bank',         icon: 'bank',        accent: '#00b894' },
    { id: 'health',      label: 'Health',       icon: 'health',      accent: '#ff2d55' },
    { id: 'documents',   label: 'Files',        icon: 'documents',   accent: '#3478f6' },
    { id: 'groups',      label: 'Groups',       icon: 'groups',      accent: '#6c63ff' },
    { id: 'birdy',       label: 'Squawk',       icon: 'birdy',       accent: '#1d9bf0' },
    { id: 'services',    label: 'Services',     icon: 'services',    accent: '#16b8a6' },
    { id: 'pages',       label: 'Pages',        icon: 'pages',       accent: '#fbc02d' },
    { id: 'review',      label: 'Review',       icon: 'review',      accent: '#e03131' },
    { id: 'marketplace', label: 'Marketplace',  icon: 'marketplace', accent: '#0a84ff' },
    { id: 'darkchat',    label: 'Dark Chat',    icon: 'darkchat',    accent: '#1c1c1e' },
    { id: 'cherry',      label: 'Cherry',       icon: 'cherry',      accent: '#f0285a' },
    { id: 'photogram',   label: 'Photogram',    icon: 'photogram',   accent: '#d62976' },
    { id: 'garages',     label: 'Garages',      icon: 'garages',     accent: '#6e5cf2' },
    { id: 'homes',       label: 'Homes',        icon: 'homes',       accent: '#12b866' },
    { id: 'ryde',        label: 'Ryde',         icon: 'ryde',        accent: '#1c1c1e' },
    { id: 'radio',       label: 'Radio',        icon: 'radio',       accent: '#30b0c7' },
    { id: 'stocks',      label: 'Stocks',       icon: 'stocks',      accent: '#16c784' },
    { id: 'settings',    label: 'Settings',     icon: 'settings',    accent: '#8e8e93' },
    { id: 'appstore',    label: 'App Store',    icon: 'appstore',    accent: '#0a84ff' },
    { id: 'calculator',  label: 'Calculator',   icon: 'calculator',  accent: '#333335' },
    { id: 'passwords',   label: 'Passwords',    icon: 'passwords',   accent: '#1c1c1e' },
    { id: 'cookie',      label: 'Cookie',       icon: 'cookie',      accent: '#c77d2e' },
    { id: 'wordle',      label: 'Wordle',       icon: 'wordle',      accent: '#6aaa64' },
    { id: 'flappy',      label: 'Flappy',       icon: 'flappy',      accent: '#4ec0ca' },
    { id: 'blocks',      label: 'Blocks',       icon: 'blocks',      accent: '#7c4dff' },
    { id: 'blackjack',   label: 'Blackjack',    icon: 'blackjack',   accent: '#157347' },
    { id: 'climber',     label: 'Climber',      icon: 'climber',     accent: '#8bc34a' },
    { id: 'railrunner',  label: 'Rail Runner',  icon: 'railrunner',  accent: '#3c5290' },
    { id: 'connectfour', label: 'Connect 4',    icon: 'connectfour', accent: '#1e66d0' },
    { id: 'chess',       label: 'Chess',        icon: 'chess',       accent: '#3b3b3b' },
    { id: 'battleship',  label: 'Battleship',   icon: 'battleship',  accent: '#17a0b5' },
    { id: 'vibez',       label: 'Vibez',        icon: 'vibez',       accent: '#a855f7' },
    { id: 'weazelnews',  label: 'Weazel News',  icon: 'weazelnews',  accent: '#c8102e' },
    { id: 'streaks',     label: 'Streaks',      icon: 'streaks',     accent: '#ff7a1a' },
].sort((a, b) => a.label.localeCompare(b.label));

const PREVIEW_IDS = ['phone', 'mail', 'maps', 'music', 'weather', 'notes', 'photogram', 'settings'];

export const PREVIEW_APPS: ThemeApp[] = PREVIEW_IDS
    .map(id => THEME_APPS.find(app => app.id === id))
    .filter((app): app is ThemeApp => app !== undefined);

export const SWATCH_PREVIEW_APPS: ThemeApp[] = PREVIEW_APPS.slice(0, 3);

export const GLYPH_NAMES: string[] = [
    'appstore', 'bank', 'battleship', 'birdy', 'blackjack', 'blocks', 'calculator', 'calendar',
    'camera', 'cherry', 'chess', 'climber', 'clock', 'compass', 'connectfour', 'cookie',
    'darkchat', 'documents', 'findfriends', 'flappy', 'garages', 'groups', 'health', 'homes',
    'mail', 'maps', 'marketplace', 'messages', 'music', 'notes', 'pages', 'passwords',
    'phone', 'photogram', 'photos', 'radio', 'railrunner', 'review', 'ryde', 'safari',
    'services', 'settings', 'stocks', 'streaks', 'vibez', 'voicememos', 'wallet', 'weather',
    'weazelnews', 'wordle',
];

const GLYPH_LABELS: Record<string, string> = {
    findfriends: 'Find Friends',
    safari:      'Safari',
    wallet:      'Wallet',
};

export function glyphLabel(name: string): string {
    const known = THEME_APPS.find(app => app.icon === name);
    if (known) return known.label;
    return GLYPH_LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

export const APP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export const RADIUS_SQUIRCLE = 0.276;

export function radiusChoices(): { value: number; label: string }[] {
    return [
        { value: RADIUS_SQUIRCLE, label: t('settings.iconShapeSquircle', 'Squircle') },
        { value: 0.14,            label: t('settings.iconShapeRounded', 'Rounded') },
        { value: 0.5,             label: t('settings.iconShapeCircle', 'Circle') },
        { value: 0.04,            label: t('settings.iconShapeSquared', 'Squared') },
    ];
}

export function textureChoices(): { value: IconTexture; label: string }[] {
    return [
        { value: 'none',    label: t('settings.iconTextureNone', 'None') },
        { value: 'noise',   label: t('settings.iconTextureNoise', 'Grain') },
        { value: 'dots',    label: t('settings.iconTextureDots', 'Dots') },
        { value: 'stripes', label: t('settings.iconTextureStripes', 'Lines') },
    ];
}

export const SWATCHES = [
    '#ffffff', '#f4f4f6', '#d1d1d6', '#8e8e93', '#48484a', '#26262a', '#0a0a0c', '#000000',
    '#ff453a', '#ff6482', '#ff9f0a', '#ffd60a', '#e8dcc4', '#ac8e68', '#8b5e3c', '#5c3d2e',
    '#34c759', '#00c7be', '#5ac8fa', '#0a84ff', '#5e5ce6', '#bf5af2', '#39414f', '#1f3a5f',
];

export interface ThemePreset {
    id:    string;
    label: string;
    hint:  string;
    seed:  IconThemeDraft;
}

export function themePresets(): ThemePreset[] {
    return [
        {
            id:    'flat',
            label: t('settings.iconPresetFlat', 'Flat'),
            hint:  t('settings.iconPresetFlatHint', 'A plain tile in each app colour'),
            seed:  {
                background: { from: 'accent' },
                glyph:      { from: 'fixed', color: '#ffffff' },
            },
        },
        {
            id:    'glass',
            label: t('settings.iconPresetGlass', 'Glass'),
            hint:  t('settings.iconPresetGlassHint', 'Lit and glossy, the classic look'),
            seed:  {
                background: { from: 'accent' },
                glyph:      { from: 'fixed', color: '#ffffff' },
                depth:      true,
            },
        },
        {
            id:    'gradient',
            label: t('settings.iconPresetGradient', 'Gradient'),
            hint:  t('settings.iconPresetGradientHint', 'Each colour fading into shadow'),
            seed:  {
                background:  { from: 'accent' },
                background2: { from: 'accent', toward: '#0f0f12', amount: 0.55 },
                angle:       160,
                gloss:       0.35,
                glyph:       { from: 'fixed', color: '#ffffff' },
            },
        },
        {
            id:    'neon',
            label: t('settings.iconPresetNeon', 'Neon'),
            hint:  t('settings.iconPresetNeonHint', 'Black tiles with a lit outline'),
            seed:  {
                background: { from: 'fixed', color: '#0a0a0c' },
                glyph:      { from: 'accent', toward: '#ffffff', amount: 0.24 },
                border:     { color: { from: 'accent' }, width: 1 },
                glow:       0.7,
                saturation: 1.3,
            },
        },
        {
            id:    'paper',
            label: t('settings.iconPresetPaper', 'Paper'),
            hint:  t('settings.iconPresetPaperHint', 'Off-white cards with a printed grain'),
            seed:  {
                background: { from: 'fixed', color: '#f4f4f6' },
                glyph:      { from: 'accent', toward: '#1b1b1f', amount: 0.36 },
                radius:     0.14,
                texture:    'dots',
                border:     { color: { from: 'fixed', color: '#d1d1d6' }, width: 1 },
                glyphScale: 0.92,
            },
        },
        {
            id:    'ink',
            label: t('settings.iconPresetInk', 'Ink'),
            hint:  t('settings.iconPresetInkHint', 'Every app colour drained to graphite'),
            seed:  {
                background:  { from: 'accent', toward: '#141418', amount: 0.5 },
                glyph:       { from: 'fixed', color: '#f5f5f7' },
                saturation:  0,
                radius:      0.04,
                glyphWeight: 2.2,
            },
        },
    ];
}
