import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

import { t } from '@/i18n';
import { failText } from '@/core/api';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { stylePhone, type PhoneLook, type PhoneOptions, type PhoneStyle, type TrimKind } from './casesApi';
import { labelOf, logoLabels, trimLabels } from './labels';
import { PanelHead, Swatches } from './ui';

type Trims = Partial<Record<TrimKind, number>>;

interface Choices { logo?: string; trims: Trims }

/** What the phone is now, as the panel's choices. */
function choicesOf(phone: PhoneOptions): Choices {
    const style = phone.style || null;
    const trims: Trims = {};
    for (const kind of phone.trims) {
        const row = style?.[kind];
        if (typeof row === 'number') trims[kind] = row;
    }
    return { logo: style?.logo, trims };
}

/** The style a set of choices makes, or false for the server's own phone: no logo picked and
 *  nothing fitted. */
function styleOf({ logo, trims }: Choices): PhoneStyle | false {
    if (!logo && Object.keys(trims).length === 0) return false;
    return { ...(logo ? { logo } : {}), ...trims };
}

/** The store's Phone tab: the free choices about the phone itself, the logo on its back and the trims
 *  fitted to it. Its design (`look`) comes with the phone item and is not one of them; `name` is the
 *  item's label. Each pick is applied at once and the game rebuilds the phone on the counter; the
 *  case being designed stays on it. `trim` is the trim row open, if any. */
export function PhonePanel({ phone, palette, look, name, trim, onTrim, onPhone }: {
    phone:    PhoneOptions;
    palette:  string[];
    look:     PhoneLook;
    name:     string;
    trim:     TrimKind | null;
    onTrim:   (kind: TrimKind | null) => void;
    onPhone:  (phone: PhoneOptions) => void;
}) {
    const [pending, setPending] = useState<Choices | null>(null);
    const [error, setError] = useState<string | null>(null);
    const seq = useRef(0);
    const rows = useRef<Partial<Record<TrimKind, HTMLDivElement | null>>>({});

    useEffect(() => {
        if (trim) rows.current[trim]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [trim]);

    const shown = pending ?? choicesOf(phone);
    const { trims } = shown;

    async function apply(next: Choices) {
        const offered = phone.logos[look] ?? [];
        const choices = { ...next, logo: next.logo && offered.includes(next.logo) ? next.logo : undefined };
        const id = ++seq.current;
        setPending(choices);
        setError(null);
        const res = await stylePhone(styleOf(choices));
        if (res.success && res.data) onPhone(res.data);
        if (id !== seq.current) return;
        setPending(null);
        if (!res.success || !res.data) setError(failText(res, t('cases.phoneStyleFailed', 'Your phone could not be changed. Try again.')));
    }

    const logoNames = logoLabels();
    const trimNames = trimLabels();
    const logoChoices = phone.logos[look] ?? [];
    const logo = shown.logo ?? logoChoices[0] ?? '';

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1 overflow-y-auto no-scrollbar rounded-[14px] bg-base px-3 pb-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
                <p className="px-1 pt-3 text-[13px] leading-snug text-ios-gray">
                    {name
                        ? t('cases.phoneIsItsDesign', '{phone}. The design is the phone itself; logo and trims are yours to choose.', { phone: name })
                        : t('cases.phoneDesignNote', 'The design is the phone itself; logo and trims are yours to choose.')}
                </p>

                {logoChoices.length > 1 && (
                    <section>
                        <PanelHead title={t('cases.phoneLogo', 'Logo')} value={labelOf(logoNames, logo)} />
                        <SegmentedControl
                            value={logo}
                            onChange={id => { if (id !== logo) void apply({ ...shown, logo: id }); }}
                            options={logoChoices.map(id => ({ value: id, label: labelOf(logoNames, id) }))}
                            slide
                        />
                    </section>
                )}

                {phone.trims.length > 0 && (
                    <section className={logoChoices.length > 1 ? 'mt-3' : ''}>
                        <PanelHead title={t('cases.phoneTrims', 'Trims')} />
                        <div className="flex flex-col gap-2">
                            {phone.trims.map(kind => {
                                const row = trims[kind];
                                const fitted = typeof row === 'number';
                                const open = trim === kind;
                                return (
                                    <div
                                        key={kind}
                                        ref={el => { rows.current[kind] = el; }}
                                        className="scroll-mt-[44px] scroll-mb-3 overflow-hidden rounded-[16px] bg-surface ring-1 ring-white/[0.06]"
                                    >
                                        <button
                                            type="button"
                                            aria-expanded={open}
                                            onClick={() => onTrim(open ? null : kind)}
                                            className="flex h-[58px] w-full items-center gap-3 px-3.5 text-start transition-colors duration-150 hover:bg-white/[0.03]"
                                        >
                                            <span
                                                className="h-[26px] w-[26px] shrink-0 rounded-full transition-colors duration-200"
                                                style={{
                                                    background: fitted ? palette[row] : 'transparent',
                                                    boxShadow: fitted ? 'inset 0 0 0 1px rgba(0,0,0,0.14)' : 'inset 0 0 0 1.5px rgb(var(--label) / 0.18)',
                                                }}
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-[15.5px] font-semibold leading-tight">{trimNames[kind]?.name ?? kind}</span>
                                                <span className="mt-0.5 block truncate text-[12.5px] leading-tight text-ios-gray">{trimNames[kind]?.blurb}</span>
                                            </span>
                                            <ChevronDown className={`h-[17px] w-[17px] shrink-0 text-white/45 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} strokeWidth={2.4} />
                                        </button>
                                        {open && (
                                            <div className="px-1.5 pb-1">
                                                <div className="px-1 pb-1.5">
                                                    <button
                                                        type="button"
                                                        aria-pressed={!fitted}
                                                        onClick={() => {
                                                            if (!fitted) return;
                                                            const next = { ...trims };
                                                            delete next[kind];
                                                            void apply({ ...shown, trims: next });
                                                        }}
                                                        className={`flex h-[36px] w-full items-center justify-center gap-1.5 rounded-[10px] text-[14px] font-semibold transition-[transform,background-color,color] duration-150 active:scale-[0.98] ${
                                                            fitted
                                                                ? 'bg-white/[0.06] text-white/75 hover:bg-white/[0.1] hover:text-white'
                                                                : 'bg-control text-white shadow-[0_0_0_2px_#F59E0B]'
                                                        }`}
                                                    >
                                                        {!fitted && <Check className="h-[15px] w-[15px] text-[#F5A524]" strokeWidth={3} />}
                                                        {t('cases.trimStandard', 'Standard')}
                                                    </button>
                                                </div>
                                                <Swatches
                                                    palette={palette}
                                                    value={fitted ? row : -1}
                                                    onChange={r => { if (r !== row) void apply({ ...shown, trims: { ...trims, [kind]: r } }); }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <p className="mt-2.5 px-1 text-[12.5px] leading-snug text-ios-gray">
                            {t('cases.phoneTrimsNote', 'Trims stay on the phone under any case. Other players see them.')}
                        </p>
                    </section>
                )}
            </div>

            <p className={`shrink-0 truncate px-1 pt-3 text-center text-[13px] leading-[18px] ${error ? 'font-medium text-ios-red' : 'text-ios-gray'}`}>
                {error ?? t('cases.phoneFreeNote', 'Free. Your phone changes as you pick.')}
            </p>
        </div>
    );
}
