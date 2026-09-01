import { Sparkline } from './Sparkline';
import { type Asset, formatPct, formatPrice, formatUnits, trendColor } from './data';
import { t } from '@/i18n';

export function StockRow({ asset, divider, onOpen }: {
    asset:   Asset;
    divider: boolean;
    onOpen:  (a: Asset) => void;
}) {
    const held = asset.units > 0;

    return (
        <>
            <button
                type="button"
                onClick={() => onOpen(asset)}
                className="flex w-full items-center gap-3.5 px-4 py-[18px] text-left active:bg-black/5 dark:active:bg-white/5"
            >
                <span
                    className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full text-[15px] font-bold tracking-tight text-white"
                    style={{ background: asset.color }}
                >
                    {asset.symbol.slice(0, 3)}
                </span>

                <div className="min-w-0 flex-1">
                    <div className="truncate text-[21px] font-semibold text-black dark:text-white">{asset.symbol}</div>
                    <div className="truncate text-[16px] text-black dark:text-white">{asset.name}</div>
                    {held && <div className="truncate text-[13px] font-medium text-ios-gray">{formatUnits(asset.units)} {t('stocks.unitsHeld', 'units held')}</div>}
                </div>

                <Sparkline data={asset.history} width={76} height={38} strokeWidth={2.4} />

                <div className="w-[110px] shrink-0 text-right">
                    <div className="text-[19px] font-semibold tabular-nums text-black dark:text-white">{formatPrice(asset.price)}</div>
                    <div className="text-[16px] font-semibold tabular-nums" style={{ color: trendColor(asset.changePct) }}>{formatPct(asset.changePct)}</div>
                </div>
            </button>

            {divider && (
                <div className="pointer-events-none bg-hairline/10" style={{ height: '0.5px' }} />
            )}
        </>
    );
}
