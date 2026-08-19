import { memo } from 'react';

import { getCategories, type Category } from './data';
import { txTimeLabel, type BankTx } from './bankingApi';
import { TxAvatar } from './TxAvatar';
import { t } from '@/i18n';
import { useStreamerHidden } from '@/stores/themeStore';
import { HIDDEN_TEXT } from '@/shell/streamerMode';

export function fmtAmount(n: number): string {
    const abs = Math.abs(n);
    const str = abs % 1 === 0
        ? abs.toLocaleString('en-US')
        : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n >= 0 ? `+$${str}` : `-$${str}`;
}

function catMeta(cat: string) {
    const categories = getCategories();
    return categories[(cat in categories ? cat : 'transfer') as Category];
}

const TxRow = memo(function TxRow({ tx, onSelect, hideAmount }: { tx: BankTx; onSelect?: (tx: BankTx) => void; hideAmount: boolean }) {
    const meta       = catMeta(tx.category);
    const isIncome   = tx.amount > 0;
    const selectable = !!onSelect && !!tx.peerNumber;

    const inner = (
        <>
            <TxAvatar tx={tx} meta={meta} size={50} />
            <div className="min-w-0 flex-1">
                <div className="truncate text-[18.5px] font-semibold leading-tight">{tx.merchant}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[16.5px] text-black dark:text-white">
                    <span className="truncate">{meta.label}</span>
                    <span className="opacity-50">·</span>
                    <span className="shrink-0">{txTimeLabel(tx.date)}</span>
                    {tx.pending && (
                        <span className="shrink-0 rounded-full bg-[#ff9f0a]/15 px-1.5 py-px text-[12px] font-semibold uppercase tracking-wide text-[#bf7400] dark:text-[#ffb340]">{t('banking.pending', 'Pending')}</span>
                    )}
                </div>
            </div>
            <span className={`shrink-0 text-[19px] font-semibold tabular-nums tracking-tight ${isIncome ? 'text-[#34c759]' : 'text-black dark:text-white'} ${tx.pending ? 'opacity-55' : ''}`}>
                {hideAmount ? HIDDEN_TEXT : fmtAmount(tx.amount)}
            </span>
        </>
    );

    if (selectable) {
        return (
            <button type="button" onClick={() => onSelect!(tx)} className="flex w-full items-center gap-3.5 px-4 py-[18px] text-left transition-colors active:bg-black/[0.06] dark:active:bg-white/[0.08]">
                {inner}
            </button>
        );
    }
    return <div className="flex items-center gap-3.5 px-4 py-[18px]">{inner}</div>;
});

const ROW_BOX = { contentVisibility: 'auto', containIntrinsicSize: 'auto 87px' } as const;

export function TxRows({ items, onSelect }: { items: BankTx[]; onSelect?: (tx: BankTx) => void }) {
    const hideAmount = useStreamerHidden('transactions');
    return (
        <div className="overflow-hidden rounded-[16px] bg-surface shadow-sm">
            {items.map((tx, i) => (
                <div key={tx.id} style={ROW_BOX}>
                    <TxRow tx={tx} onSelect={onSelect} hideAmount={hideAmount} />
                    {i < items.length - 1 && <div className="pointer-events-none mx-[6%] h-[0.5px] bg-black/15 dark:bg-white/15" />}
                </div>
            ))}
        </div>
    );
}
