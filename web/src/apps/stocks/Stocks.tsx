import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Eye, EyeOff } from 'lucide-react';

import { useSessionState } from '@/hooks/useSessionState';
import { useDidEnter } from '@/hooks/useDidEnter';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { SearchBar } from '@/ui/SearchBar';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { StockRow } from './StockRow';
import { AssetDetail } from './AssetDetail';
import { Portfolio } from './Portfolio';
import { TradeSheet, type TradeMode } from './TradeSheet';
import { buy, deposit, fetchMarket, sell, watchMarket, withdraw } from './stocksApi';
import {
    type AssetKind, type Market, type SortKey,
    formatMoney, formatPct, holdingValue, sortAssets,
} from './data';
import { t } from '@/i18n';
import { useStreamerHidden } from '@/stores/themeStore';
import { failText } from '@/core/api';

const HISTORY_CAP = 48;

export function Stocks({ onClose }: { onClose: () => void }) {
    const TABS = [
        { value: 'stock',  label: t('stocks.stocks', 'Stocks') },
        { value: 'crypto', label: t('stocks.crypto', 'Crypto') },
    ] as const;

    const [market, setMarket] = useState<Market>({ assets: [], cash: 0 });
    const [tab,     setTab]     = useSessionState<AssetKind>('stocks:tab', 'stock');
    const [query,   setQuery]   = useSessionState('stocks:query', '');
    const [sortKey, setSortKey] = useSessionState<SortKey>('stocks:sortKey', 'price');
    const [sortDir, setSortDir] = useSessionState<'asc' | 'desc'>('stocks:sortDir', 'desc');
    const [openSymbol, setOpenSymbol] = useSessionState<string | null>('stocks:open', null);
    const [hiddenByUser, setHideBalance] = useSessionState('stocks:hideBalance', false);
    const forcedHidden = useStreamerHidden('investments');
    const hideBalance = hiddenByUser || forcedHidden;
    const [showPortfolio, setShowPortfolio] = useSessionState('stocks:portfolio', false);
    const [trade, setTrade] = useState<{ mode: TradeMode; symbol?: string } | null>(null);

    async function refresh() { setMarket(await fetchMarket()); }
    useEffect(() => { void refresh(); }, []);

    useEffect(() => {
        watchMarket(true);
        return () => watchMarket(false);
    }, []);

    useNuiEvent('sd-phone:stocks:prices', useCallback((data) => {
        if (!data?.assets) return;
        const map = new Map(data.assets.map(t => [t.symbol, t]));
        setMarket(prev => ({
            ...prev,
            assets: prev.assets.map(a => {
                const t = map.get(a.symbol);
                if (!t) return a;
                const history = [...a.history, t.price];
                if (history.length > HISTORY_CAP) history.shift();
                return { ...a, price: t.price, changePct: t.changePct, history };
            }),
        }));
    }, []));

    const investedValue = useMemo(() => market.assets.reduce((s, a) => s + holdingValue(a), 0), [market.assets]);
    const totalCost     = useMemo(() => market.assets.reduce((s, a) => s + a.units * a.avgCost, 0), [market.assets]);
    const totalValue    = market.cash + investedValue;
    const returnPct     = totalCost > 0 ? (investedValue - totalCost) / totalCost : 0;

    const list = useMemo(() => {
        const q = query.trim().toUpperCase();
        let xs = market.assets.filter(a => a.kind === tab);
        if (q) xs = xs.filter(a => a.symbol.includes(q) || a.name.toUpperCase().includes(q));
        return sortAssets(xs, sortKey, sortDir);
    }, [market.assets, tab, query, sortKey, sortDir]);

    function toggleSort(key: SortKey) {
        if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc'); }
    }
    const arrow = (key: SortKey) =>
        sortKey !== key ? null
            : sortDir === 'asc' ? <ChevronUp className="h-3.5 w-3.5" strokeWidth={3} />
                : <ChevronDown className="h-3.5 w-3.5" strokeWidth={3} />;

    const openAsset = openSymbol ? market.assets.find(a => a.symbol === openSymbol) ?? null : null;
    const animateNav = useDidEnter();

    async function onTradeConfirm(amount: number, all?: boolean): Promise<string | null> {
        if (!trade) return t('stocks.noTrade', 'No trade');
        const r =
            trade.mode === 'deposit'  ? await deposit(amount)
          : trade.mode === 'withdraw' ? await withdraw(amount)
          : trade.mode === 'buy'      ? await buy(trade.symbol!, amount)
          :                             await sell(trade.symbol!, all ? { all: true } : { amount });
        if (!r.success) return failText(r, t('stocks.somethingWrong', 'Something went wrong'));
        await refresh();
        return null;
    }

    const tradeAsset = trade?.symbol ? market.assets.find(a => a.symbol === trade.symbol) : undefined;
    const tradeAvail =
        !trade ? 0
      : trade.mode === 'buy'      ? market.cash
      : trade.mode === 'sell'     ? (tradeAsset ? holdingValue(tradeAsset) : 0)
      : trade.mode === 'withdraw' ? market.cash
      :                             Infinity;

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-base text-black dark:text-white">
            <div className="h-[61px] shrink-0" aria-hidden />

            <div className="px-5 pb-1 pt-1 text-[34px] font-bold tracking-tight">{t('stocks.stocks', 'Stocks')}</div>

            <div className="px-4">
                <SegmentedControl value={tab} onChange={setTab} options={TABS} />
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-12 pt-3">
                <div className="rounded-[22px] p-5 text-white" style={{ background: 'linear-gradient(135deg,#0a84ff 0%,#5e5ce6 100%)' }}>
                    <div className="flex items-center gap-2">
                        <span className="text-[18px] font-semibold text-white/95">{t('stocks.availableFunds', 'Available Funds')}</span>
                        <button type="button" onClick={() => setHideBalance(v => !v)} aria-label={t('stocks.toggleBalance', 'Toggle balance')} className="text-white/90 active:opacity-60">
                            {hideBalance ? <EyeOff className="h-[22px] w-[22px]" /> : <Eye className="h-[22px] w-[22px]" />}
                        </button>
                    </div>
                    <div className="mt-2 text-[46px] font-bold tabular-nums leading-[1.05]">
                        {hideBalance ? '••••••' : formatMoney(totalValue)}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[15px] text-white/90">
                        <span className="tabular-nums">{t('stocks.cash', 'Cash')} {hideBalance ? '••••' : formatMoney(market.cash)}</span>
                        {totalCost > 0 && <span className="tabular-nums">{formatPct(returnPct)} {t('stocks.return', 'return')}</span>}
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowPortfolio(true)}
                        className="mt-4 flex w-full items-center justify-center gap-1 rounded-[14px] bg-white/20 py-3 text-[16px] font-semibold text-white active:opacity-70"
                    >
                        {t('stocks.viewPortfolio', 'View Portfolio')}
                        <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.75} />
                    </button>
                </div>

                <div className="mt-3 flex gap-3">
                    <button type="button" onClick={() => setTrade({ mode: 'deposit' })} className="flex-1 rounded-[12px] bg-surface py-2.5 text-[15px] font-semibold active:opacity-70">{t('stocks.deposit', 'Deposit')}</button>
                    <button type="button" onClick={() => setTrade({ mode: 'withdraw' })} className="flex-1 rounded-[12px] bg-surface py-2.5 text-[15px] font-semibold active:opacity-70">{t('stocks.withdraw', 'Withdraw')}</button>
                </div>

                <SearchBar value={query} onChange={setQuery} placeholder={tab === 'crypto' ? t('stocks.searchCrypto', 'Search Cryptocurrency') : t('stocks.searchStocks', 'Search Stocks')} className="mt-4" />

                <div className="mt-4 flex items-center gap-3.5 px-4 text-[16px] font-semibold text-black/60 dark:text-white/60">
                    <button type="button" onClick={() => toggleSort('name')} className="flex items-center gap-0.5 active:opacity-60">{t('stocks.sortName', 'Name')} {arrow('name')}</button>
                    <div className="flex-1" />
                    <button type="button" onClick={() => toggleSort('change')} className="flex w-[76px] items-center justify-center gap-0.5 active:opacity-60">{t('stocks.sortGraph', 'Graph')} {arrow('change')}</button>
                    <button type="button" onClick={() => toggleSort('price')} className="flex w-[110px] items-center justify-end gap-0.5 active:opacity-60">{t('stocks.sortPrice', 'Price')} {arrow('price')}</button>
                </div>

                <div key={tab} className="animate-swipe-in-left">
                    {list.length === 0 ? (
                        <p className="mt-10 text-center text-[15px] text-ios-gray">
                            {query.trim() ? t('stocks.noResults', 'No results for “{query}”', { query }) : t('stocks.noAssets', 'No assets')}
                        </p>
                    ) : (
                        <div className="mt-1.5 overflow-hidden rounded-[12px] bg-surface">
                            {list.map((a, i) => (
                                <StockRow key={a.symbol} asset={a} divider={i < list.length - 1} onOpen={() => setOpenSymbol(a.symbol)} />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showPortfolio && (
                <Portfolio
                    assets={market.assets}
                    cash={market.cash}
                    onBack={() => setShowPortfolio(false)}
                    onOpenAsset={s => setOpenSymbol(s)}
                />
            )}

            {openAsset && (
                <AssetDetail
                    asset={openAsset}
                    animateIn={animateNav}
                    onBack={() => setOpenSymbol(null)}
                    onBuy={() => setTrade({ mode: 'buy', symbol: openAsset.symbol })}
                    onSell={() => setTrade({ mode: 'sell', symbol: openAsset.symbol })}
                    onRefresh={() => void refresh()}
                />
            )}

            {trade && (
                <TradeSheet
                    mode={trade.mode}
                    asset={tradeAsset}
                    available={tradeAvail}
                    onConfirm={onTradeConfirm}
                    onClose={() => setTrade(null)}
                />
            )}

            <button type="button" onClick={onClose} aria-label={t('stocks.closeStocks', 'Close Stocks')} className="absolute inset-x-0 bottom-0 h-7 cursor-default" />
        </div>
    );
}
