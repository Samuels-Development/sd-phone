import type { ReactNode } from 'react';

import { t } from '@/i18n';
import type { ColorRecipe, IconAppearance } from '@/stores/iconThemeStore';
import { GroupCard } from '@/ui/ListGroup';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { SliderRow } from '@/ui/SliderRow';
import { Toggle } from '@/ui/Toggle';
import { SWATCHES } from './iconThemeCatalog';
import { LIGHTEN, mixAmount } from './iconThemeDraft';
import { ThemeTile } from './IconThemePreview';

const MIX_SWATCHES = [
    '#ffffff', '#f4f4f6', '#e8dcc4', '#8e8e93', '#39414f', '#1f3a5f', '#1b1b1f', '#0f0f12',
];

export function Hairline() {
    return <div className="h-[0.5px] bg-ios-gray4 dark:bg-control" />;
}

export function Section({ header, footer, action, children }: {
    header?:  string;
    footer?:  string;
    action?:  ReactNode;
    children: ReactNode;
}) {
    return (
        <div>
            {(header || action) && (
                <div className="flex items-end justify-between gap-3 px-7 pb-1.5 pt-1">
                    <span className="min-w-0 truncate text-[13px] font-normal uppercase tracking-wider text-ios-gray">
                        {header ?? ''}
                    </span>
                    {action}
                </div>
            )}
            <GroupCard className="mx-4">{children}</GroupCard>
            {footer && (
                <div className="px-7 pt-2 text-[13px] font-normal text-ios-gray">{footer}</div>
            )}
        </div>
    );
}

export function SectionAction({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <button
            type="button"
            onClick={onPress}
            className="shrink-0 pb-[1px] text-[13px] font-semibold uppercase tracking-wider text-ios-blue active:opacity-60"
        >
            {label}
        </button>
    );
}

export function ActionRow({ label, destructive = false, disabled = false, divider = false, right, onPress }: {
    label:        string;
    destructive?: boolean;
    disabled?:    boolean;
    divider?:     boolean;
    right?:       ReactNode;
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

export function SwitchRow({ label, sub, on, disabled = false, divider = false, onToggle }: {
    label:     string;
    sub?:      string;
    on:        boolean;
    disabled?: boolean;
    divider?:  boolean;
    onToggle:  () => void;
}) {
    return (
        <button
            type="button"
            onClick={() => { if (!disabled) onToggle(); }}
            className={`relative flex w-full items-center px-4 py-3 text-left ${disabled ? 'opacity-45' : 'active:bg-black/5 dark:active:bg-white/5'}`}
        >
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[17px] font-normal text-black dark:text-white">{label}</span>
                {sub && <span className="block truncate text-[13px] text-ios-gray">{sub}</span>}
            </span>
            <span className="pointer-events-none -my-1 ml-3 shrink-0">
                <Toggle on={on} disabled={disabled} />
            </span>
            {divider && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[0.5px] bg-ios-gray4 dark:bg-control" />}
        </button>
    );
}

function SwatchGrid({ value, onChange, label, swatches = SWATCHES }: {
    value:     string | undefined;
    onChange:  (v: string) => void;
    label:     string;
    swatches?: string[];
}) {
    return (
        <div className="grid grid-cols-8 gap-2 px-4 py-4" role="group" aria-label={label}>
            {swatches.map(colour => {
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
                                ? 'inset 0 0 0 2px rgba(255,255,255,0.92), inset 0 0 0 2.5px rgba(0,0,0,0.14), 0 0 0 2px #0a84ff'
                                : 'inset 0 0 0 0.5px rgba(0,0,0,0.20)',
                        }}
                    />
                );
            })}
        </div>
    );
}

export function RecipeEditor({ recipe, onChange, label, title, fallbackColour }: {
    recipe:          ColorRecipe;
    onChange:        (next: ColorRecipe) => void;
    label:           string;
    title?:          string;
    fallbackColour?: string;
}) {
    const mix     = mixAmount(recipe);
    const mixWith = recipe.toward ?? LIGHTEN;

    function build(from: 'accent' | 'fixed', colour: string | undefined, amount: number, toward: string): ColorRecipe {
        const next: ColorRecipe = { from };
        if (from === 'fixed') next.color = colour ?? fallbackColour ?? '#26262a';
        if (amount > 0) {
            next.toward = toward;
            next.amount = amount / 100;
        }
        return next;
    }

    return (
        <>
            {title && (
                <div className="px-4 pt-3 text-[17px] font-normal text-black dark:text-white">{title}</div>
            )}
            <div className="px-4 py-3">
                <SegmentedControl
                    value={recipe.from}
                    onChange={from => onChange(build(from, recipe.color, mix, mixWith))}
                    options={[
                        { value: 'accent', label: t('settings.iconThemeAppColour', 'App Colour') },
                        { value: 'fixed',  label: t('settings.iconThemeOneColour', 'One Colour') },
                    ]}
                />
            </div>

            {recipe.from === 'fixed' && (
                <>
                    <Hairline />
                    <SwatchGrid
                        value={recipe.color}
                        onChange={colour => onChange(build('fixed', colour, mix, mixWith))}
                        label={label}
                    />
                </>
            )}

            <Hairline />
            <SliderRow
                label={t('settings.iconThemeMix', 'Mix')}
                value={mix}
                display={mix === 0 ? t('settings.iconThemeMixNone', 'None') : `${mix}%`}
                onChange={amount => onChange(build(recipe.from, recipe.color, amount, mixWith))}
            />

            {mix > 0 && (
                <>
                    <Hairline />
                    <SwatchGrid
                        value={mixWith}
                        onChange={toward => onChange(build(recipe.from, recipe.color, mix, toward))}
                        label={t('settings.iconThemeMixWith', 'Mix with')}
                        swatches={MIX_SWATCHES}
                    />
                </>
            )}
        </>
    );
}

export function TilePicker<T extends string | number>({ value, options, onChange, label }: {
    value:    T;
    options:  { value: T; label: string; look: IconAppearance; icon: string }[];
    onChange: (v: T) => void;
    label:    string;
}) {
    return (
        <div className="flex items-start justify-between gap-2 px-4 py-4" role="group" aria-label={label}>
            {options.map(opt => {
                const on = opt.value === value;
                return (
                    <button
                        key={String(opt.value)}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(opt.value)}
                        className="flex min-w-0 flex-1 flex-col items-center gap-1.5 active:opacity-70"
                    >
                        <span
                            className="flex items-center justify-center rounded-[12px] p-[3px]"
                            style={{ boxShadow: on ? '0 0 0 2px #0a84ff' : undefined }}
                        >
                            <ThemeTile look={opt.look} icon={opt.icon} label={opt.label} size={46} />
                        </span>
                        <span className={`w-full truncate text-center text-[12px] ${on ? 'font-semibold text-ios-blue' : 'text-ios-gray'}`}>
                            {opt.label}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
