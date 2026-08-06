import { useEffect, useState } from 'react';
import { Check, ChevronRight, Minus, Moon, Plus, Sun } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useTheme } from '@/stores/themeStore';
import type { PhoneAlign, DarkTheme, LightTheme } from '@/stores/themeStore';
import { NavBar } from '@/ui/NavBar';
import { Toggle } from '@/ui/Toggle';
import { DarkAppearancePage } from './DarkAppearancePage';
import { LightAppearancePage } from './LightAppearancePage';
import { AccentColourPage } from './AccentColourPage';
import { accentCss } from './accentRamp';
import { isCustomPaletteId } from './paletteRamp';

const DARK_THEME_LABEL: Record<DarkTheme, string> = {
    graphite: t('settings.darkGraphite', 'Graphite'),
    black:    t('settings.darkBlack', 'Black'),
    warm:     t('settings.darkWarm', 'Warm'),
    midnight: t('settings.darkMidnight', 'Midnight'),
    moss:     t('settings.darkMoss', 'Moss'),
    plum:     t('settings.darkPlum', 'Plum'),
    slate: t('settings.darkSlate', 'Slate'),
    ocean: t('settings.darkOcean', 'Ocean'),
    rose: t('settings.darkRose', 'Rose'),
    clay: t('settings.darkClay', 'Clay'),
};

const LIGHT_THEME_LABEL: Record<LightTheme, string> = {
    silver:   t('settings.lightSilver', 'Silver'),
    snow:     t('settings.lightSnow', 'Snow'),
    linen:    t('settings.lightLinen', 'Linen'),
    sky:      t('settings.lightSky', 'Sky'),
    mint:     t('settings.lightMint', 'Mint'),
    blush:    t('settings.lightBlush', 'Blush'),
    sand:     t('settings.lightSand', 'Sand'),
    lavender: t('settings.lightLavender', 'Lavender'),
    stone:    t('settings.lightStone', 'Stone'),
    dusk:     t('settings.lightDusk', 'Dusk'),
};

export function DisplayBrightnessPage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const {
        theme, setTheme,
        darkTheme, lightTheme,
        brightness, setBrightness,
        phoneScale, setPhoneScale,
        chatTextScale, setChatTextScale,
        phoneAlign, setPhoneAlign,
        customPalettes,
        accent,
    } = useTheme('theme', 'setTheme', 'darkTheme', 'lightTheme', 'brightness', 'setBrightness', 'phoneScale', 'setPhoneScale', 'chatTextScale', 'setChatTextScale', 'phoneAlign', 'setPhoneAlign', 'customPalettes', 'accent');

    const isDark     = theme === 'dark';
    const trackEmpty = isDark ? 'rgb(var(--control))' : 'rgb(var(--surface))';
    const [auto, setAuto] = useState(true);
    const [darkAppearanceOpen, setDarkAppearanceOpen] = useState(false);
    const [lightAppearanceOpen, setLightAppearanceOpen] = useState(false);
    const [accentOpen, setAccentOpen] = useState(false);

    const activeTheme = isDark ? darkTheme : lightTheme;
    const appearanceValue = isCustomPaletteId(activeTheme)
        ? customPalettes.find(p => p.id === activeTheme)?.name ?? t('settings.paletteCustom', 'Custom')
        : isDark ? DARK_THEME_LABEL[darkTheme as DarkTheme] : LIGHT_THEME_LABEL[lightTheme as LightTheme];

    useEffect(() => {
        if (!isDark) setDarkAppearanceOpen(false);
        if (isDark) setLightAppearanceOpen(false);
    }, [isDark]);

    const CHAT_MIN = 0.8, CHAT_MAX = 1.5;
    const chatFill = ((chatTextScale - CHAT_MIN) / (CHAT_MAX - CHAT_MIN)) * 100;

    return (
        <div
            className="absolute inset-0 z-20 flex flex-col bg-base text-black dark:text-white"
            style={pageStyle}
        >
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar
                backLabel={t('settings.settings', 'Settings')}
                onBack={goBack}
                title={t('settings.displayBrightness', 'Display & Brightness')}
                hairline
            />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-8 flex flex-col gap-8 px-4 pb-10">

                    <section>
                        <p className="mb-2 text-[12px] uppercase tracking-widest text-ios-gray">
                            {t('settings.appearance', 'Appearance')}
                        </p>
                        <div className="overflow-hidden rounded-[12px] bg-surface">
                            <div className="flex justify-center gap-6 px-4 pb-4 pt-5">
                                <ThumbButton
                                    label={t('settings.light', 'Light')}
                                    selected={theme === 'light'}
                                    onSelect={() => setTheme('light')}
                                >
                                    <LightPreview />
                                </ThumbButton>
                                <ThumbButton
                                    label={t('settings.dark', 'Dark')}
                                    selected={theme === 'dark'}
                                    onSelect={() => setTheme('dark')}
                                >
                                    <DarkPreview />
                                </ThumbButton>
                            </div>

                            <div className="h-[0.5px] bg-ios-gray4 dark:bg-control" />

                            <button
                                type="button"
                                onClick={() => setAuto(a => !a)}
                                className="flex w-full items-center px-4 py-3 active:bg-black/5 dark:active:bg-white/5"
                            >
                                <span className="flex-1 text-left text-[17px] font-normal text-black dark:text-white">
                                    {t('settings.automatic', 'Automatic')}
                                </span>
                                <div className="pointer-events-none">
                                    <Toggle on={auto} />
                                </div>
                            </button>
                        </div>
                    </section>

                    <section>
                        <div className="overflow-hidden rounded-[12px] bg-surface">
                            <button
                                type="button"
                                onClick={() => (isDark ? setDarkAppearanceOpen(true) : setLightAppearanceOpen(true))}
                                className="flex w-full items-center px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                            >
                                <span className="flex-1 text-[17px] font-normal text-black dark:text-white">
                                    {isDark
                                        ? t('settings.darkAppearance', 'Dark Appearance')
                                        : t('settings.lightAppearance', 'Light Appearance')}
                                </span>
                                <span className="mr-1 text-[17px] font-normal text-ios-gray">
                                    {appearanceValue}
                                </span>
                                <ChevronRight className="h-[17px] w-[17px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                            </button>

                            <div className="ml-4 h-[0.5px] bg-ios-gray4 dark:bg-control" />

                            <button
                                type="button"
                                onClick={() => setAccentOpen(true)}
                                className="flex w-full items-center px-4 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                            >
                                <span className="flex-1 text-[17px] font-normal text-black dark:text-white">
                                    {t('settings.accentColour', 'Accent Colour')}
                                </span>
                                <span
                                    className="mr-2 h-[20px] w-[20px] shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                                    style={{ background: accentCss(isDark ? 'dark' : 'light', accent) }}
                                />
                                <ChevronRight className="h-[17px] w-[17px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                            </button>
                        </div>
                        <p className="mt-1.5 px-1 text-[12px] leading-snug text-ios-gray">
                            {isDark
                                ? t('settings.darkAppearanceHint', 'Choose the shade of dark mode used across the whole phone.')
                                : t('settings.lightAppearanceHint', 'Choose the shade of light mode used across the whole phone.')}
                        </p>
                    </section>

                    <section>
                        <p className="mb-2 text-[12px] uppercase tracking-widest text-ios-gray">
                            {t('settings.brightness', 'Brightness')}
                        </p>
                        <div className="flex items-center gap-3 rounded-[12px] bg-surface px-4 py-3">
                            <Moon className="h-[17px] w-[17px] shrink-0 text-ios-gray" fill="currentColor" stroke="none" />
                            <input
                                type="range"
                                min={0} max={100}
                                value={brightness}
                                onChange={e => setBrightness(+e.target.value)}
                                className="ios-slider flex-1"
                                style={{ '--sp': `${brightness}%`, '--se': trackEmpty } as React.CSSProperties}
                            />
                            <Sun className="h-[20px] w-[20px] shrink-0 text-ios-gray" strokeWidth={2} />
                        </div>
                    </section>

                    <section>
                        <p className="mb-2 text-[12px] uppercase tracking-widest text-ios-gray">
                            {t('settings.phoneScale', 'Phone Scale')}
                        </p>
                        <div className="flex items-center gap-3 rounded-[12px] bg-surface px-4 py-3">
                            <Minus className="h-[18px] w-[18px] shrink-0 text-ios-gray" strokeWidth={2.5} />
                            <input
                                type="range"
                                min={0} max={100}
                                value={phoneScale}
                                onChange={e => setPhoneScale(+e.target.value)}
                                className="ios-slider flex-1"
                                style={{ '--sp': `${phoneScale}%`, '--se': trackEmpty } as React.CSSProperties}
                            />
                            <Plus className="h-[18px] w-[18px] shrink-0 text-ios-gray" strokeWidth={2.5} />
                        </div>
                    </section>

                    <section>
                        <p className="mb-2 text-[12px] uppercase tracking-widest text-ios-gray">
                            {t('settings.chatTextSize', 'Chat Text Size')}
                        </p>
                        <div className="overflow-hidden rounded-[12px] bg-surface">
                            <div className="flex flex-col gap-2 px-4 pb-4 pt-4">
                                <div
                                    className="max-w-[78%] self-start rounded-2xl rounded-bl-md px-[14px] py-[8px] leading-[1.3]"
                                    style={{ background: isDark ? 'rgb(var(--control))' : 'rgb(var(--surface))', color: isDark ? '#fff' : '#000', fontSize: 'calc(19px * var(--chat-text-scale, 1))' }}
                                >
                                    {t('settings.howsThisSize', "How's this size?")}
                                </div>
                                <div
                                    className="max-w-[78%] self-end rounded-2xl rounded-br-md px-[14px] py-[8px] leading-[1.3] text-white"
                                    style={{ background: 'rgb(var(--ios-blue))', fontSize: 'calc(19px * var(--chat-text-scale, 1))' }}
                                >
                                    {t('settings.looksGood', 'Looks good 👍')}
                                </div>
                            </div>

                            <div className="h-[0.5px] bg-ios-gray4 dark:bg-control" />

                            <div className="flex items-center gap-3 px-4 py-3">
                                <span className="shrink-0 text-[15px] font-semibold text-ios-gray">A</span>
                                <input
                                    type="range"
                                    min={CHAT_MIN * 100} max={CHAT_MAX * 100} step={5}
                                    value={Math.round(chatTextScale * 100)}
                                    onChange={e => setChatTextScale(+e.target.value / 100)}
                                    className="ios-slider flex-1"
                                    style={{ '--sp': `${chatFill}%`, '--se': trackEmpty } as React.CSSProperties}
                                />
                                <span className="shrink-0 text-[24px] font-semibold text-ios-gray">A</span>
                            </div>
                        </div>
                        <p className="mt-1.5 px-1 text-[12px] leading-snug text-ios-gray">
                            {t('settings.chatTextSizeHint', 'Sets the size of message-bubble text in Messages, DarkChat and the other chat apps. The rest of the phone is unaffected.')}
                        </p>
                    </section>

                    <section>
                        <p className="mb-2 text-[12px] uppercase tracking-widest text-ios-gray">
                            {t('settings.phonePosition', 'Phone Position')}
                        </p>
                        <div className="flex flex-col items-center gap-3 rounded-[12px] bg-surface px-4 py-4">
                            <PositionPicker value={phoneAlign} onChange={setPhoneAlign} isDark={isDark} />
                            <span className="text-[13px] text-ios-gray">
                                {ALIGN_LABEL[phoneAlign]}
                            </span>
                        </div>
                        <p className="mt-1.5 px-1 text-[12px] leading-snug text-ios-gray">
                            {t('settings.phonePositionHint', 'Pick where the phone snaps to inside the game window. The phone scales toward this anchor so it stays pinned when you change the size above.')}
                        </p>
                    </section>

                </div>
            </div>
            {darkAppearanceOpen && <DarkAppearancePage onBack={() => setDarkAppearanceOpen(false)} />}
            {lightAppearanceOpen && <LightAppearancePage onBack={() => setLightAppearanceOpen(false)} />}
            {accentOpen && <AccentColourPage onBack={() => setAccentOpen(false)} />}
        </div>
    );
}

const ALIGN_LABEL: Record<PhoneAlign, string> = {
    'top-left':      t('settings.alignTopLeft', 'Top Left'),
    'top-center':    t('settings.alignTopCenter', 'Top Center'),
    'top-right':     t('settings.alignTopRight', 'Top Right'),
    'middle-left':   t('settings.alignMiddleLeft', 'Middle Left'),
    'middle-center': t('settings.alignCenter', 'Center'),
    'middle-right':  t('settings.alignMiddleRight', 'Middle Right'),
    'bottom-left':   t('settings.alignBottomLeft', 'Bottom Left'),
    'bottom-center': t('settings.alignBottomCenter', 'Bottom Center'),
    'bottom-right':  t('settings.alignBottomRight', 'Bottom Right'),
};

const POSITIONS: PhoneAlign[] = [
    'top-left',    'top-center',    'top-right',
    'middle-left', 'middle-center', 'middle-right',
    'bottom-left', 'bottom-center', 'bottom-right',
];

function PositionPicker({
    value, onChange, isDark,
}: {
    value:    PhoneAlign;
    onChange: (v: PhoneAlign) => void;
    isDark:   boolean;
}) {
    return (
        <div
            className="relative rounded-[10px] border"
            style={{
                width:      240,
                height:     150,
                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                borderColor: 'rgb(var(--control))',
            }}
        >
            <div
                className="absolute inset-3 grid"
                style={{
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gridTemplateRows:    '1fr 1fr 1fr',
                }}
            >
                {POSITIONS.map(pos => {
                    const selected = pos === value;
                    return (
                        <button
                            key={pos}
                            type="button"
                            onClick={() => onChange(pos)}
                            aria-label={ALIGN_LABEL[pos]}
                            className="flex items-center justify-center active:opacity-60"
                        >
                            {selected ? (
                                <div
                                    className="rounded-[3px]"
                                    style={{
                                        width:  14,
                                        height: 22,
                                        background: 'rgb(var(--ios-blue))',
                                        boxShadow: '0 0 0 2px rgba(10,132,255,0.22)',
                                    }}
                                />
                            ) : (
                                <div
                                    className="rounded-full"
                                    style={{
                                        width:  10,
                                        height: 10,
                                        background:  'transparent',
                                        border:      `1.5px solid ${isDark ? '#48484A' : '#AEAEB2'}`,
                                    }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}


function LightPreview() {
    return (
        <div
            className="relative overflow-hidden rounded-[14px] shadow-lg"
            style={{ width: 95, height: 133, background: 'linear-gradient(175deg, #C7DEFA 0%, #A4C8F0 35%, #82B3E5 65%, #60A0DA 100%)' }}
        >
            <div className="absolute left-1/2 top-3 h-[7px] w-[26px] -translate-x-1/2 rounded-full bg-black/80" />
            <div className="mt-[34px] text-center text-[18px] font-semibold leading-none text-[#1C1C1E]">11:42</div>
            <div className="absolute -bottom-5 left-1/2 h-[70px] w-[130px] -translate-x-1/2 rounded-[50%]"
                style={{ background: 'rgba(75,140,215,0.55)' }} />
        </div>
    );
}

function DarkPreview() {
    return (
        <div
            className="relative overflow-hidden rounded-[14px] shadow-lg"
            style={{ width: 95, height: 133, background: 'linear-gradient(175deg, #180c3c 0%, #221550 30%, #2E1C72 60%, #180c3c 100%)' }}
        >
            <div className="absolute left-1/2 top-3 h-[7px] w-[26px] -translate-x-1/2 rounded-full bg-black" />
            <div className="mt-[34px] text-center text-[18px] font-semibold leading-none text-white">11:42</div>
            <div className="absolute bottom-8 left-1/2 h-[52px] w-[52px] -translate-x-1/2 rounded-full opacity-45"
                style={{ background: 'radial-gradient(circle, #7B5CC0 0%, transparent 70%)' }} />
        </div>
    );
}


function ThumbButton({
    label, selected, onSelect, children,
}: {
    label: string; selected: boolean; onSelect: () => void; children: React.ReactNode;
}) {
    return (
        <button type="button" onClick={onSelect} className="flex flex-col items-center gap-2">
            {children}
            <span className="text-[15px] font-normal text-black dark:text-white">{label}</span>
            <div className={[
                'flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 transition-colors',
                selected
                    ? 'border-ios-blue bg-ios-blue'
                    : 'border-control bg-transparent',
            ].join(' ')}>
                {selected && <Check className="h-[11px] w-[11px] text-white" strokeWidth={3} />}
            </div>
        </button>
    );
}
