import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';

import { Sheet } from '@/ui/Sheet';
import { Scroller } from '@/ui/Scroller';
import { t } from '@/i18n';
import { BankCard } from './BankCard';
import {
    BANK_BRANDS, CARD_COLORS, CARD_PATTERNS,
    cardColor, cardColorLabel, cardPatternLabel, isPreset, presetFor, resolveStyle, type CardStyle,
} from './bankBrands';

function SectionLabel({ children }: { children: string }) {
    return (
        <div className="mb-2 mt-5 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-ios-gray">
            {children}
        </div>
    );
}

function PatternSwatch({ pattern, tint }: { pattern: typeof CARD_PATTERNS[number]; tint: string }) {
    const id = `sw-${pattern.id}`;
    return (
        <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
            <defs>
                <pattern id={id} width={pattern.w} height={pattern.h} patternUnits="userSpaceOnUse">
                    <path d={pattern.d} fill="none" stroke={tint} strokeWidth={pattern.strokeWidth * 1.6} />
                </pattern>
            </defs>
            <rect width="40" height="40" fill={`url(#${id})`} opacity={Math.min(1, pattern.opacity * 4)} />
        </svg>
    );
}

export function BankCardPicker({ holder, last4, expiry, current, onPick, onClose }: {
    holder:  string;
    last4:   string;
    expiry:  string;
    current: CardStyle;
    onPick:  (style: CardStyle) => void;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState<CardStyle>(() => resolveStyle(current));

    function apply(next: CardStyle) {
        setDraft(next);
        onPick(next);
    }

    const activeColor = cardColor(draft.color);
    const atPreset    = isPreset(draft);

    return (
        <Sheet
            onClose={onClose}
            fit="top"
            top={92}
            title={t('banking.chooseCard', 'Your Card')}
            className="font-sf bg-base text-black dark:text-white"
        >
            {() => (
                <Scroller className="min-h-0 flex-1 px-5 pb-10 pt-1">
                    <BankCard holder={holder} last4={last4} expiry={expiry} style={draft} />

                    <SectionLabel>{t('banking.bank', 'Bank')}</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                        {BANK_BRANDS.map(bank => {
                            const on = bank.id === draft.bank;
                            return (
                                <button
                                    key={bank.id}
                                    type="button"
                                    onClick={() => apply(presetFor(bank.id))}
                                    className={`rounded-full px-3.5 py-2 text-[15px] font-semibold transition-colors ${
                                        on ? 'bg-ios-blue text-white' : 'bg-black/[0.06] text-black/70 dark:bg-white/10 dark:text-white/75'
                                    }`}
                                >
                                    {bank.wordmark}
                                </button>
                            );
                        })}
                    </div>

                    <SectionLabel>{t('banking.colour', 'Colour')}</SectionLabel>
                    <div className="flex flex-wrap gap-2.5">
                        {CARD_COLORS.map(c => {
                            const on = c.id === draft.color;
                            return (
                                <button
                                    key={c.id}
                                    type="button"
                                    aria-label={cardColorLabel(c)}
                                    aria-pressed={on}
                                    onClick={() => apply({ ...draft, color: c.id })}
                                    className={`relative h-[42px] w-[42px] shrink-0 rounded-full transition-transform active:scale-95 ${
                                        on ? 'ring-[3px] ring-ios-blue ring-offset-2 ring-offset-base' : ''
                                    }`}
                                    style={{ background: c.swatch }}
                                >
                                    {on && (
                                        <span className="absolute inset-0 flex items-center justify-center text-white">
                                            <Check className="h-[19px] w-[19px]" strokeWidth={3} />
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <SectionLabel>{t('banking.pattern', 'Pattern')}</SectionLabel>
                    <div className="flex flex-wrap gap-2.5">
                        {CARD_PATTERNS.map(p => {
                            const on = p.id === draft.pattern;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    aria-label={cardPatternLabel(p)}
                                    aria-pressed={on}
                                    onClick={() => apply({ ...draft, pattern: p.id })}
                                    className={`relative h-[46px] w-[46px] shrink-0 overflow-hidden rounded-[13px] transition-transform active:scale-95 ${
                                        on ? 'ring-[3px] ring-ios-blue ring-offset-2 ring-offset-base' : ''
                                    }`}
                                    style={{ background: activeColor.background }}
                                >
                                    <PatternSwatch pattern={p} tint={activeColor.stroke} />
                                </button>
                            );
                        })}
                    </div>

                    {!atPreset && (
                        <button
                            type="button"
                            onClick={() => apply(presetFor(draft.bank))}
                            className="mt-6 flex w-full items-center justify-center gap-2 rounded-[14px] bg-black/[0.06] py-3 text-[16.5px] font-semibold text-ios-blue active:opacity-60 dark:bg-white/10"
                        >
                            <RotateCcw className="h-[17px] w-[17px]" strokeWidth={2.4} />
                            {t('banking.resetCard', 'Reset to default design')}
                        </button>
                    )}
                </Scroller>
            )}
        </Sheet>
    );
}
