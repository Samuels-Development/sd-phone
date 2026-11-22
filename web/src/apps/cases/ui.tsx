import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';

export const ACCENT = '#F59E0B';
export const BUY_BG = 'linear-gradient(180deg, #FBBF24 0%, #F59E0B 55%, #E58A06 100%)';

export const money = (n: number) => formatMoney(n, { whole: true });

/** True for colours light enough that a mark on top of them should be dark. */
function isLight(hex: string): boolean {
    const h = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62;
}

export function CheckBadge({ className = '' }: { className?: string }) {
    return (
        <span className={`flex h-[20px] w-[20px] items-center justify-center rounded-full bg-[#F59E0B] shadow-[0_1px_3px_rgba(0,0,0,0.25)] ${className}`}>
            <Check className="h-[12px] w-[12px] text-white" strokeWidth={3.4} />
        </span>
    );
}

/** A small round chip of a part's colour. */
export function ColourDot({ hex, size = 9, className = '' }: { hex: string; size?: number; className?: string }) {
    return (
        <span
            aria-hidden
            className={`shrink-0 rounded-full ${className}`}
            style={{ width: size, height: size, background: hex, boxShadow: 'inset 0 0 0 1px rgb(var(--label) / 0.22)' }}
        />
    );
}

/** The soft product-shot backdrop behind a case: the surface, washed with the shell's own colour,
 *  lifted by a highlight up top and settling into a faint shade at the bottom. */
export function ShellWash({ hex, strong = false }: { hex: string; strong?: boolean }) {
    return (
        <>
            <span aria-hidden className="absolute inset-0 bg-surface" />
            <span
                aria-hidden
                className={`absolute inset-0 transition-colors duration-300 ${strong ? 'opacity-[0.22] dark:opacity-[0.30]' : 'opacity-[0.15] dark:opacity-[0.22]'}`}
                style={{ backgroundColor: hex }}
            />
            <span aria-hidden className="absolute inset-0 bg-[radial-gradient(85%_65%_at_50%_34%,rgba(255,255,255,0.78),rgba(255,255,255,0)_72%)] dark:bg-[radial-gradient(80%_62%_at_50%_36%,rgba(255,255,255,0.17),rgba(255,255,255,0)_74%)]" />
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/[0.06] to-transparent dark:from-black/[0.28]" />
        </>
    );
}

export function Swatches({ palette, value, onChange, disabled = false }: {
    palette:   string[];
    value:     number;
    onChange:  (row: number) => void;
    disabled?: boolean;
}) {
    return (
        <div className={`grid grid-cols-8 transition-opacity duration-200 ${disabled ? 'pointer-events-none opacity-35' : ''}`} aria-disabled={disabled || undefined}>
            {palette.map((hex, row) => {
                const selected = !disabled && row === value;
                return (
                    <button
                        key={row}
                        type="button"
                        onClick={() => onChange(row)}
                        disabled={disabled}
                        aria-label={t('cases.colourNumber', 'Colour {n}', { n: row + 1 })}
                        aria-pressed={selected}
                        className="flex h-[37px] items-center justify-center transition-transform duration-150 active:scale-[0.86]"
                    >
                        <span
                            className="flex h-[31px] w-[31px] items-center justify-center rounded-full"
                            style={{
                                background: hex,
                                boxShadow: selected
                                    ? '0 0 0 2.5px rgb(var(--surface)), 0 0 0 4.5px rgb(var(--label) / 0.88)'
                                    : 'inset 0 0 0 1px rgba(0,0,0,0.13)',
                            }}
                        >
                            {selected && (
                                <Check className={`h-[17px] w-[17px] ${isLight(hex) ? 'text-black/75' : 'text-white'}`} strokeWidth={3.2} />
                            )}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/** A colour grid on its own card, headed by its title and a larger chip of the chosen colour. */
export function SwatchCard({ title, hint, palette, value, onChange, disabled = false }: {
    title:     string;
    hint?:     string;
    palette:   string[];
    value:     number;
    onChange:  (row: number) => void;
    disabled?: boolean;
}) {
    return (
        <div className="rounded-[18px] bg-surface px-1.5 pb-1 pt-2 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
            <div className="mb-0.5 flex h-[30px] items-center gap-2.5 px-2.5">
                <span
                    className="h-[26px] w-[26px] shrink-0 rounded-full transition-colors duration-200"
                    style={{
                        background: disabled ? 'transparent' : palette[value],
                        boxShadow: disabled ? 'inset 0 0 0 1.5px rgb(var(--label) / 0.18)' : 'inset 0 0 0 1px rgba(0,0,0,0.14)',
                    }}
                />
                <span className="min-w-0 flex-1 truncate text-[15.5px] font-semibold">{title}</span>
                {hint && <span className="shrink-0 truncate text-[13px] text-ios-gray">{hint}</span>}
            </div>
            <Swatches palette={palette} value={value} onChange={onChange} disabled={disabled} />
        </div>
    );
}

export function OptionTile({ selected, label, price, wellH, onPress, children }: {
    selected: boolean;
    label:    string;
    price?:   string;
    wellH:    number;
    onPress:  () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onPress}
            aria-pressed={selected}
            className="flex min-w-0 flex-col items-center text-center transition-transform duration-150 active:scale-[0.95]"
        >
            <span
                className={`relative flex w-full items-center justify-center overflow-hidden rounded-[16px] bg-surface transition-shadow duration-150 ${
                    selected ? 'shadow-[0_0_0_2.5px_#F59E0B]' : 'shadow-[0_0_0_1px_rgba(0,0,0,0.05)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]'
                }`}
                style={{ height: wellH }}
            >
                <span aria-hidden className="absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_40%,rgba(255,255,255,0.6),rgba(255,255,255,0)_75%)] dark:bg-[radial-gradient(70%_60%_at_50%_40%,rgba(255,255,255,0.08),rgba(255,255,255,0)_75%)]" />
                <span className="relative">{children}</span>
                {selected && <CheckBadge className="absolute end-1.5 top-1.5" />}
            </span>
            <span className={`mt-1.5 w-full truncate text-[13px] font-medium leading-[17px] ${selected ? 'text-black dark:text-white' : 'text-black/80 dark:text-white/80'}`}>{label}</span>
            <span className="h-[16px] text-[12px] leading-[16px] tabular-nums text-ios-gray">{price ?? ''}</span>
        </button>
    );
}
