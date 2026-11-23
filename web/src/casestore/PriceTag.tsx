import { t } from '@/i18n';
import { designPrice, priceIn, stickerPrice, stickersOf, type Catalog, type Design } from './casesApi';
import { labelOf, partLabels, stickerName } from './labels';
import { money } from './ui';

interface Line { kind: string; name: string; price: number; hex?: string }

/** The price of the case on the counter as an itemised receipt: what each part is, what it costs, and
 *  the total. A design already owned shows its total struck through, as it costs nothing to wear. */
export function PriceTag({ catalog, design, struck }: { catalog: Catalog; design: Design; struck: boolean }) {
    const labels = partLabels();
    const palette = catalog.palette;
    const lines: Line[] = [
        { kind: t('cases.style', 'Style'), name: labelOf(labels.style, design.style), price: priceIn(catalog.styles, design.style), hex: palette[design.color] },
    ];
    if (design.pattern) lines.push({ kind: t('cases.pattern', 'Pattern'), name: labelOf(labels.pattern, design.pattern), price: priceIn(catalog.patterns, design.pattern), hex: palette[design.patternColor ?? 0] });
    if (design.accessory) lines.push({ kind: t('cases.accessory', 'Accessory'), name: labelOf(labels.accessory, design.accessory), price: priceIn(catalog.accessories, design.accessory), hex: palette[design.accessoryColor ?? 0] });
    if (design.charm) lines.push({ kind: t('cases.charm', 'Charm'), name: labelOf(labels.charm, design.charm), price: priceIn(catalog.charms, design.charm), hex: palette[design.charmColor ?? 0] });
    const stickers = stickersOf(design);
    if (stickers.length) {
        const names = stickers.slice(0, 2).map(s => stickerName(labels, s.id)).join(', ');
        lines.push({
            kind: stickers.length > 1 ? t('cases.stickers', 'Stickers') : t('cases.sticker', 'Sticker'),
            name: stickers.length > 2 ? `${names} +${stickers.length - 2}` : names,
            price: stickers.reduce((sum, s) => sum + stickerPrice(catalog, s.id), 0),
        });
    }
    const total = designPrice(catalog, design);

    return (
        <div className="rounded-[12px] bg-surface px-3.5 py-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
            {lines.map(line => (
                <div key={line.kind} className="flex h-[22px] items-center gap-2 text-[13px]">
                    <span className="w-[72px] shrink-0 truncate text-ios-gray">{line.kind}</span>
                    {line.hex && (
                        <span aria-hidden className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: line.hex, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.22)' }} />
                    )}
                    <span className="min-w-0 truncate font-medium text-white/90">{line.name}</span>
                    <span aria-hidden className="min-w-[12px] flex-1" />
                    <span className="shrink-0 tabular-nums text-white/80">{money(line.price)}</span>
                </div>
            ))}

            <div className="mt-2 flex items-baseline justify-between border-t border-white/[0.08] pt-2">
                <span className="text-[13px] font-medium uppercase tracking-[0.08em] text-ios-gray">{t('cases.total', 'Total')}</span>
                <span className={`text-[22px] font-semibold leading-[28px] tabular-nums tracking-[-0.02em] ${struck ? 'text-white/35 line-through decoration-2' : 'text-white'}`}>
                    {money(total)}
                </span>
            </div>
        </div>
    );
}
