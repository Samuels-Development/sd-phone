import { useState } from 'react';
import { Check } from 'lucide-react';

import { t } from '@/i18n';
import { failText } from '@/core/api';
import { useStreamerHidden } from '@/stores/themeStore';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { Spinner } from '@/ui/Spinner';
import { FramedPreview } from './CasePreview';
import { buyCase, designPrice, stickerPrice, type CasesState, type Design, type Priced } from './casesApi';
import { labelOf, partLabels } from './labels';
import { BUY_BG, ColourDot, ShellWash, money } from './ui';

/** What the main button does for the design on screen: buy it, put on the copy already owned,
 *  or nothing, because it is the one being worn. */
export type PrimaryAction = 'buy' | 'wear' | 'wearing';

const THUMB_W = 104;
const THUMB_H = 156;

export function CheckoutSheet({ state, design, frameHex, action, blocker, onClose, onBought, onWear }: {
    state:    CasesState;
    design:   Design;
    frameHex: string;
    action:   PrimaryAction;
    blocker:  string | null;
    onClose:  () => void;
    onBought: (data: { owned: Design[]; equipped: Design | false; balance: number }) => void;
    onWear:   () => Promise<boolean>;
}) {
    const labels = partLabels();
    const hideBalance = useStreamerHidden('balance');
    const { catalog } = state;
    const palette = catalog.palette;
    const price = designPrice(catalog, design);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const cost = (list: Priced[], id: string) => list.find(x => x.id === id)?.price ?? 0;
    const lines: { kind: string; name: string; price: number; color?: number }[] = [
        { kind: t('cases.style', 'Style'), name: labelOf(labels.style, design.style), price: cost(catalog.styles, design.style), color: design.color },
    ];
    if (design.pattern) lines.push({ kind: t('cases.pattern', 'Pattern'), name: labelOf(labels.pattern, design.pattern), price: cost(catalog.patterns, design.pattern), color: design.patternColor });
    if (design.accessory) lines.push({ kind: t('cases.accessory', 'Accessory'), name: labelOf(labels.accessory, design.accessory), price: cost(catalog.accessories, design.accessory), color: design.accessoryColor });
    if (design.charm) lines.push({ kind: t('cases.charm', 'Charm'), name: labelOf(labels.charm, design.charm), price: cost(catalog.charms, design.charm), color: design.charmColor });
    if (design.sticker) lines.push({ kind: t('cases.sticker', 'Sticker'), name: labelOf(labels.sticker, design.sticker), price: stickerPrice(catalog, design.sticker) });

    async function confirm(close: () => void) {
        if (busy) return;
        setBusy(true);
        setError(null);
        if (action === 'wear') {
            const ok = await onWear();
            setBusy(false);
            if (ok) close();
            else setError(t('cases.wearFailed', 'That did not work. Try again.'));
            return;
        }
        const res = await buyCase(design);
        setBusy(false);
        if (!res.success || !res.data) {
            setError(failText(res, t('cases.buyFailed', 'This case could not be bought')));
            return;
        }
        onBought(res.data);
        close();
    }

    let note: string;
    if (action === 'wearing') note = t('cases.noteWearing', 'This is the case on your phone right now.');
    else if (action === 'wear') note = t('cases.noteOwned', 'You already own this design, so wearing it costs nothing.');
    else if (hideBalance) note = t('cases.paidFromBank', 'Paid from your bank account. You will wear it straight away.');
    else note = t('cases.paidFromBankAfter', 'Paid from your bank account, leaving {amount}. You will wear it straight away.', { amount: money(state.balance - price) });

    const shown = error ?? blocker;
    const disabled = busy || action === 'wearing' || (action === 'buy' && !!blocker) || (action === 'wear' && state.blocked);

    return (
        <Sheet onClose={onClose} fit="content" className="bg-base text-black dark:text-white">
            {({ close }) => (
                <div className="flex flex-col">
                    <SheetHeader
                        cancelLabel={action === 'buy' ? t('cases.cancel', 'Cancel') : t('cases.done', 'Done')}
                        onCancel={close}
                        title={action === 'buy' ? t('cases.checkout', 'Checkout') : t('cases.yourCase', 'Your Case')}
                    />

                    <div className="mx-4 mt-2 flex gap-3.5 rounded-[18px] bg-surface p-2.5 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
                        <div className="relative isolate shrink-0 overflow-hidden rounded-[14px]" style={{ width: THUMB_W, height: THUMB_H }}>
                            <ShellWash hex={palette[design.color] ?? '#888888'} />
                            <FramedPreview
                                design={design}
                                frameHex={frameHex}
                                palette={palette}
                                framing="whole"
                                boxW={THUMB_W}
                                boxH={THUMB_H - 16}
                                boxTop={8}
                                detail={0.5}
                                still
                            />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-center py-1 pe-1.5">
                            {lines.map(line => (
                                <div key={line.kind} className="flex items-center gap-2 py-[5px]">
                                    {line.color === undefined
                                        ? <span className="h-[10px] w-[10px] shrink-0" />
                                        : <ColourDot hex={palette[line.color] ?? '#888888'} size={10} />}
                                    <span className="min-w-0 flex-1 truncate text-[15px]">
                                        <span className="text-ios-gray">{line.kind}</span>{' '}
                                        <span className="font-medium">{line.name}</span>
                                    </span>
                                    <span className="shrink-0 text-[15px] tabular-nums">{money(line.price)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="mx-4 mt-3.5 flex items-baseline justify-between px-1">
                        <span className="text-[17px] font-semibold">{t('cases.total', 'Total')}</span>
                        <span className={`text-[26px] font-bold tabular-nums ${action === 'buy' ? '' : 'text-black/40 line-through decoration-2 dark:text-white/40'}`}>{money(price)}</span>
                    </div>
                    <div className="mx-4 px-1 text-[13.5px] leading-snug text-ios-gray">{note}</div>

                    {shown && <p className="mx-4 mt-3 px-1 text-[14px] font-medium text-ios-red">{shown}</p>}

                    <button
                        type="button"
                        onClick={() => void confirm(close)}
                        disabled={disabled}
                        className={`mx-4 mt-4 flex h-[52px] items-center justify-center gap-2 rounded-[14px] text-[17px] font-semibold transition-[opacity,transform] duration-150 active:scale-[0.98] active:opacity-85 disabled:active:scale-100 ${
                            action === 'wearing' ? 'bg-surface text-ios-gray' : 'text-white disabled:opacity-40'
                        }`}
                        style={action === 'wearing' ? undefined : { background: BUY_BG }}
                    >
                        {busy ? (
                            <Spinner size={20} className="!border-white/30 !border-t-white" />
                        ) : action === 'buy' ? (
                            t('cases.payAmount', 'Pay {amount}', { amount: money(price) })
                        ) : action === 'wear' ? (
                            t('cases.wear', 'Wear')
                        ) : (
                            <><Check className="h-[18px] w-[18px]" strokeWidth={3} />{t('cases.wearingNow', 'Wearing')}</>
                        )}
                    </button>
                </div>
            )}
        </Sheet>
    );
}
