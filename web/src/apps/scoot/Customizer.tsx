import { useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

import { t } from '@/i18n';
import { GroupCard } from '@/ui/ListGroup';
import { Toggle } from '@/ui/Toggle';
import { EXTRAS, extraFee } from './customization';
import type { Customization, ExtraOption, ExtrasCatalog } from './customization';

const ACCENT = '#14b8a6';
const CARD = 'ring-1 ring-black/[0.04] dark:ring-white/[0.06]';
const CHIP = 'flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold transition-[background-color,color,transform] active:scale-95 disabled:opacity-40';
const CHIP_IDLE = 'bg-black/[0.05] text-black/80 dark:bg-white/10 dark:text-white/80';
const INPUT = 'h-[44px] w-full rounded-[12px] bg-black/[0.05] px-4 text-[17px] font-semibold text-black outline-none placeholder:text-ios-gray/70 focus:ring-2 dark:bg-white/10 dark:text-white';

type PickKey = 'rear' | 'trim' | 'lighting' | 'bell' | 'decal';
const PICKS: PickKey[] = ['rear', 'trim', 'lighting', 'bell', 'decal'];

function GroupHeading({ children }: { children: ReactNode }) {
    return <p className="px-4 pb-2 pt-4 text-[13px] font-semibold uppercase tracking-wider text-ios-gray">{children}</p>;
}

function Chip({ item, active, disabled, fee, onPick }: { item: ExtraOption; active: boolean; disabled: boolean; fee: string; onPick: () => void }) {
    return (
        <button
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={onPick}
            className={`${CHIP} ${active ? 'text-white' : CHIP_IDLE}`}
            style={active ? { background: ACCENT } : undefined}
        >
            {item.hex && <span className="inline-block h-[14px] w-[14px] shrink-0 rounded-full ring-1 ring-black/15 dark:ring-white/20" style={{ background: item.hex }} />}
            <span>{item.label}</span>
            {item.fee > 0 && <span className={`text-[13px] font-medium ${active ? 'text-white/80' : 'text-ios-gray'}`}>{fee}</span>}
        </button>
    );
}

export function Customizer({ value, onChange, currency, catalog = EXTRAS, readonly = false }: {
    value:     Customization;
    onChange:  (v: Customization) => void;
    currency:  string;
    catalog?:  ExtrasCatalog;
    readonly?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const fee = extraFee(value, catalog);
    const change = (key: keyof Customization, item: string | boolean) => onChange({ ...value, [key]: item });
    const plus = (n: number) => `+${currency}${n}`;
    const headings: Record<PickKey, string> = {
        rear:     t('scoot.extrasRear', 'Rear storage'),
        trim:     t('scoot.extrasTrim', 'Grips, cables and wheel trim'),
        lighting: t('scoot.extrasLighting', 'Underglow'),
        bell:     t('scoot.extrasBell', 'Bell style and sound'),
        decal:    t('scoot.extrasDecal', 'Deck decals'),
    };
    const summary = fee
        ? t('scoot.extrasFeeSummary', '{currency}{fee} extras per rental', { currency, fee })
        : t('scoot.extrasSummary', 'Accessories, trim, lights and decals');

    return (
        <GroupCard radius={16} className={CARD}>
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(v => !v)}
                className="flex w-full items-center gap-3 p-4 text-start active:bg-black/5 dark:active:bg-white/5"
            >
                <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[12px]" style={{ background: `${ACCENT}22`, color: ACCENT }}>
                    <SlidersHorizontal className="h-[22px] w-[22px]" strokeWidth={2.2} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[18px] font-semibold leading-tight text-black dark:text-white">
                        {readonly ? t('scoot.yourExtras', 'Your scooter extras') : t('scoot.extrasTitle', 'Make it yours')}
                    </span>
                    <span className="mt-0.5 block truncate text-[15px] text-ios-gray">{summary}</span>
                </span>
                <ChevronDown className={`h-[22px] w-[22px] shrink-0 text-ios-gray3 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} strokeWidth={2.4} />
            </button>

            <div
                className="overflow-hidden transition-[max-height] duration-300"
                style={{ maxHeight: open ? 1400 : 0, transitionTimingFunction: 'cubic-bezier(0.22,0.61,0.36,1)' }}
            >
                {!readonly && (
                    <>
                        <GroupHeading>{t('scoot.extrasPresets', 'Quick looks')}</GroupHeading>
                        <div className="grid grid-cols-3 gap-2 px-4">
                            {catalog.presets.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => onChange({ ...catalog.defaults, ...p.options })}
                                    className="flex min-w-0 flex-col items-start rounded-[14px] px-3 py-3 text-start transition-transform active:scale-95"
                                    style={{ background: `${ACCENT}1f` }}
                                >
                                    <span className="w-full truncate text-[16px] font-semibold text-black dark:text-white">{p.label}</span>
                                    <span className="w-full text-[13px] leading-snug text-ios-gray">{p.description}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                <GroupHeading>{t('scoot.extrasCarry', 'Carry and connect')}</GroupHeading>
                {catalog.accessories.map((item, i) => {
                    const on = value[item.id as keyof Customization] === true;
                    const key = item.id as keyof Customization;
                    return (
                        <div key={item.id} className={`relative flex items-center gap-3 px-4 py-3.5 ${readonly ? 'opacity-60' : ''}`}>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[18px] text-black dark:text-white">{item.label}</span>
                                <span className="block truncate text-[15px] text-ios-gray">{item.description}</span>
                            </span>
                            <span className="shrink-0 text-[17px] text-ios-gray">{item.fee ? plus(item.fee) : t('scoot.included', 'Included')}</span>
                            <Toggle on={on} disabled={readonly} activeColor={ACCENT} ariaLabel={item.label} onChange={next => change(key, next)} />
                            {i < catalog.accessories.length - 1 && (
                                <div className="pointer-events-none absolute inset-x-4 bottom-0 bg-ios-gray4 dark:bg-control" style={{ height: '0.5px' }} />
                            )}
                        </div>
                    );
                })}

                {PICKS.map(key => (
                    <div key={key}>
                        <GroupHeading>{headings[key]}</GroupHeading>
                        <div className="flex flex-wrap gap-2 px-4">
                            {catalog[key].map(item => (
                                <Chip key={item.id} item={item} active={value[key] === item.id} disabled={readonly} fee={plus(item.fee)} onPick={() => change(key, item.id)} />
                            ))}
                        </div>
                    </div>
                ))}

                {value.decal === 'name' && (
                    <div className="px-4 pt-4">
                        <label className="block text-[15px] font-medium text-ios-gray" htmlFor="scoot-extras-name">{t('scoot.extrasName', 'Your name')}</label>
                        <input
                            id="scoot-extras-name"
                            className={`mt-2 ${INPUT}`}
                            style={{ '--tw-ring-color': ACCENT } as React.CSSProperties}
                            value={value.name}
                            maxLength={12}
                            disabled={readonly}
                            placeholder={t('scoot.extrasNamePlaceholder', 'YOUR NAME')}
                            onChange={e => change('name', e.target.value.replace(/[^a-zA-Z0-9 -]/g, '').toUpperCase())}
                        />
                        <p className="mt-2 text-[14px] text-ios-gray">{t('scoot.extrasNameHint', 'Up to 12 letters, numbers, spaces or hyphens.')}</p>
                    </div>
                )}
                {value.decal === 'number' && (
                    <div className="px-4 pt-4">
                        <label className="block text-[15px] font-medium text-ios-gray" htmlFor="scoot-extras-number">{t('scoot.extrasNumber', 'Race number')}</label>
                        <input
                            id="scoot-extras-number"
                            className={`mt-2 ${INPUT} tabular-nums`}
                            style={{ '--tw-ring-color': ACCENT } as React.CSSProperties}
                            inputMode="numeric"
                            value={value.number}
                            maxLength={2}
                            disabled={readonly}
                            onChange={e => change('number', e.target.value.replace(/\D/g, ''))}
                        />
                        <p className="mt-2 text-[14px] text-ios-gray">{t('scoot.extrasNumberHint', 'Choose two digits, for example 07.')}</p>
                    </div>
                )}

                <p className="px-4 pt-4 text-[14px] leading-snug text-ios-gray">
                    {t('scoot.extrasNote', 'Extras are cosmetic. Bags and baskets do not add inventory space. Underglow turns on with the scooter, and your horn control rings the bell.')}
                </p>

                <div className="mx-4 mt-4 flex items-center justify-between border-t border-hairline/10 py-4">
                    <span className="text-[15px] text-ios-gray">{t('scoot.extrasTotal', 'Extras, paid once per rental')}</span>
                    <span className="flex items-center gap-4">
                        {!readonly && fee > 0 && (
                            <button type="button" onClick={() => onChange({ ...catalog.defaults })} className="text-[15px] font-semibold active:opacity-60" style={{ color: ACCENT }}>
                                {t('scoot.extrasReset', 'Reset')}
                            </button>
                        )}
                        <span className="text-[17px] font-bold tabular-nums text-black dark:text-white">{currency}{fee}</span>
                    </span>
                </div>
            </div>
        </GroupCard>
    );
}
