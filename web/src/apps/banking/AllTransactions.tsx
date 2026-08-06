import { ChevronLeft } from 'lucide-react';

import { useIosPush } from '@/hooks/useIosPush';
import { t } from '@/i18n';
import { groupTx, type BankTx } from './bankingApi';
import { TxRows, fmtAmount } from './TxRow';

export function AllTransactions({ transactions, onBack, onSelectTx }: { transactions: BankTx[]; onBack: () => void; onSelectTx?: (tx: BankTx) => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const days = groupTx(transactions);

    return (
        <div className="absolute inset-0 z-20 flex flex-col bg-base text-black dark:text-white" style={pageStyle}>
            <div className="h-[54px] shrink-0" aria-hidden />

            <div className="px-2 pb-0.5">
                <button type="button" onClick={goBack} className="flex items-center gap-0.5 text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.5} />
                    <span className="text-[17px]">{t('banking.wallet', 'Wallet')}</span>
                </button>
            </div>

            <div className="px-5 pb-3 pt-0.5 text-[34px] font-bold tracking-tight">{t('banking.transactions', 'Transactions')}</div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10">
                {days.length === 0 ? (
                    <p className="mt-10 text-center text-[15px] text-ios-gray">{t('banking.noTransactionsYet', 'No transactions yet.')}</p>
                ) : days.map(day => {
                    const total = day.items.reduce((sum, t) => sum + t.amount, 0);
                    return (
                        <div key={day.key} className="mb-4">
                            <div className="flex items-baseline justify-between px-1 pb-2 pt-1">
                                <span className="text-[17px] font-semibold">{day.label}</span>
                                <span className={`text-[17px] font-semibold tabular-nums ${
                                    total > 0 ? 'text-[#34c759]' : total < 0 ? 'text-[#ff3b30]' : 'text-black/45 dark:text-white/45'
                                }`}>
                                    {fmtAmount(total)}
                                </span>
                            </div>

                            <TxRows items={day.items} onSelect={onSelectTx} />
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
