import { useState } from 'react';
import { Check } from 'lucide-react';

import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useTheme } from '@/stores/themeStore';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { NavBar } from '@/ui/NavBar';
import { Slider } from '@/ui/Slider';
import { Toggle } from '@/ui/Toggle';
import { ACCENT_PRESETS, accentCss, accentRecipe, customAccentId, isCustomAccentId } from './accentRamp';

export function AccentColourPage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const { theme, accent, setAccent } = useTheme('theme', 'accent', 'setAccent');

    const LABEL: Record<string, string> = {
        blue:   t('settings.accentBlue', 'Blue'),
        indigo: t('settings.accentIndigo', 'Indigo'),
        purple: t('settings.accentPurple', 'Purple'),
        pink:   t('settings.accentPink', 'Pink'),
        red:    t('settings.accentRed', 'Red'),
        orange: t('settings.accentOrange', 'Orange'),
        yellow: t('settings.accentYellow', 'Yellow'),
        green:  t('settings.accentGreen', 'Green'),
        mint:   t('settings.accentMint', 'Mint'),
        teal:   t('settings.accentTeal', 'Teal'),
        brown:  t('settings.accentBrown', 'Brown'),
        gray:   t('settings.accentGray', 'Graphite'),
    };

    const mode = theme === 'dark' ? 'dark' : 'light';
    const custom = isCustomAccentId(accent);
    const [hue, setHue] = useState(() => accentRecipe(accent).hue);

    const activeLabel = custom
        ? t('settings.accentCustom', 'Custom')
        : LABEL[accent] ?? LABEL.blue;

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-base text-black dark:text-white" style={pageStyle}>
            <div className="h-11 shrink-0" aria-hidden />
            <NavBar
                backLabel={t('settings.display', 'Display')}
                onBack={goBack}
                title={t('settings.accentColour', 'Accent Colour')}
                hairline
            />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-7 px-4 pb-12">

                    <section>
                        <p className="mb-2 px-1 text-[12px] uppercase tracking-widest text-ios-gray">
                            {t('settings.accentPresets', 'Colour')}
                        </p>
                        <div className="rounded-[12px] bg-surface px-4 py-5">
                            <div className="grid grid-cols-6 gap-x-3 gap-y-4">
                                {ACCENT_PRESETS.map(p => {
                                    const selected = !custom && accent === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setAccent(p.id)}
                                            aria-label={LABEL[p.id]}
                                            className="flex flex-col items-center gap-1.5 active:opacity-60"
                                        >
                                            <span
                                                className={`flex h-[38px] w-[38px] items-center justify-center rounded-full transition-transform ${selected ? 'scale-110 ring-2 ring-black/25 dark:ring-white/35' : ''}`}
                                                style={{ background: accentCss(mode, p.id) }}
                                            >
                                                {selected && <Check className="h-[19px] w-[19px] text-white" strokeWidth={3} />}
                                            </span>
                                            <span className="text-[11px] font-medium text-ios-gray">{LABEL[p.id]}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    <section>
                        <p className="mb-2 px-1 text-[12px] uppercase tracking-widest text-ios-gray">
                            {t('settings.accentCustom', 'Custom')}
                        </p>
                        <div className="flex flex-col gap-4 rounded-[12px] bg-surface px-4 py-4">
                            <div className="flex items-center gap-3">
                                <span
                                    className="h-[34px] w-[34px] shrink-0 rounded-full"
                                    style={{ background: accentCss(mode, customAccentId(hue)) }}
                                />
                                <Slider
                                    value={hue}
                                    min={0}
                                    max={359}
                                    onChange={v => { setHue(v); setAccent(customAccentId(v)); }}
                                    ariaLabel={t('settings.accentHue', 'Accent hue')}
                                    className="flex-1"
                                />
                            </div>
                            <p className="px-0.5 text-[12px] leading-snug text-ios-gray">
                                {t('settings.accentCustomHint', 'Drag to pick any hue. Shades that would be hard to read are adjusted automatically.')}
                            </p>
                        </div>
                    </section>

                    <section>
                        <p className="mb-2 px-1 text-[12px] uppercase tracking-widest text-ios-gray">
                            {t('settings.accentPreview', 'Preview')}
                        </p>
                        <ListGroup>
                            <ListRow label={t('settings.accentColour', 'Accent Colour')} value={activeLabel} divider />
                            <ListRow
                                label={t('settings.accentSampleToggle', 'Something switched on')}
                                right={<div className="pointer-events-none"><Toggle on /></div>}
                                divider
                            />
                            <ListRow label={t('settings.accentSampleLink', 'A tappable link')} chevron />
                        </ListGroup>
                        <div className="mt-3 flex justify-center">
                            <button
                                type="button"
                                className="rounded-[12px] px-8 py-2.5 text-[17px] font-semibold text-white active:opacity-70"
                                style={{ background: accentCss(mode, accent) }}
                            >
                                {t('settings.accentSampleButton', 'Continue')}
                            </button>
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
}
