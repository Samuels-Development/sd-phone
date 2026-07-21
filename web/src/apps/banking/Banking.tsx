import { useCallback, useMemo, useState } from 'react';
import { ChevronRight, House, ReceiptText } from 'lucide-react';

import { useAsyncData } from '@/hooks/useAsyncData';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { t } from '@/i18n';
import { ActionSheet } from '@/ui/ActionSheet';
import { formatMoney } from './data';
import { fetchOverview, type BankOverview, type BankTx } from './bankingApi';
import { AllTransactions } from './AllTransactions';
import { SendMoney, prefillTransferAgain } from './SendMoney';
import { FleecaCard } from './FleecaCard';
import { TxRows } from './TxRow';
import { InvoicesTab } from './InvoicesTab';
import { TabBar, type TabBarItem } from '@/ui/TabBar';

type BankingTab = 'home' | 'invoices';

const CARD_EXPIRY = '08/29';

export function Banking({ onClose: _onClose }: { onClose: () => void }) {
    const { data: overview, loading, refetch: refresh } = useAsyncData<BankOverview>(fetchOverview, []);
    const [tab,      setTab]      = useSessionState<BankingTab>('banking:tab', 'home');
    const [showAll,  setShowAll]  = useSessionState('banking:showAll', false);
    const [sending,  setSending]  = useSessionState('banking:sending', false);
    const [actionTx, setActionTx] = useState<BankTx | null>(null);

    function transferAgain(tx: BankTx) {
        if (!tx.peerNumber) return;
        prefillTransferAgain(tx.peerNumber, tx.peerInitials ? tx.merchant : undefined);
        setSending(true);
    }

    useNuiEvent('sd-phone:bank:received', useCallback(() => { refresh(); }, [refresh]));
    useNuiEvent('sd-phone:bank:txAdded', useCallback(() => { refresh(); }, [refresh]));

    const txs    = overview?.transactions ?? [];
    const latest = useMemo(() => txs.slice(0, 8), [txs]);

    const balance = overview?.balance ?? 0;
    const holder  = (overview?.name || t('banking.accountHolderFallback', 'Account')).toUpperCase();
    const last4   = (overview?.number || '').replace(/\D/g, '').slice(-4) || '0000';

    const tabs: TabBarItem<BankingTab>[] = [
        { id: 'home',     label: t('banking.tabHome', 'Home'),     icon: a => <House       className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
        { id: 'invoices', label: t('banking.invoices', 'Invoices'), icon: a => <ReceiptText className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
    ];

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-[#d4d4d4] text-black dark:bg-base dark:text-white">
            <div className="h-[54px] shrink-0" aria-hidden />

            {tab === 'invoices' ? (
                <div key="invoices" className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                    <InvoicesTab onPaid={refresh} />
                </div>
            ) : (
            <div key="home" className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
            <div className="px-5 pb-2 pt-0.5 text-[34px] font-bold tracking-tight">{t('banking.wallet', 'Wallet')}</div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10 pt-3">
                <FleecaCard holder={holder} last4={last4} expiry={CARD_EXPIRY} />

                <div className="mt-5 flex items-center justify-between rounded-[16px] bg-[#e5e5e5] px-5 py-3 dark:bg-surface">
                    <div>
                        <div className="text-[17px] font-semibold text-black dark:text-white">{t('banking.balance', 'Balance')}</div>
                        <div className="mt-0.5 text-[26px] font-bold tabular-nums tracking-tight text-black dark:text-white">{formatMoney(balance, { whole: true })}</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSending(true)}
                        className="rounded-full bg-black px-6 py-2.5 text-[16px] font-semibold text-white active:opacity-70 dark:bg-white dark:text-black"
                    >
                        {t('banking.send', 'Send')}
                    </button>
                </div>

                <div className="mb-3 mt-6 flex items-center justify-between">
                    <h2 className="text-[20px] font-bold tracking-tight">{t('banking.latestTransactions', 'Latest Transactions')}</h2>
                    {txs.length > 0 && (
                        <button type="button" onClick={() => setShowAll(true)} className="flex items-center gap-0.5 text-[17px] font-medium text-ios-blue active:opacity-60">
                            {t('banking.allTransactions', 'All Transactions')}
                            <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.5} />
                        </button>
                    )}
                </div>

                {loading && latest.length === 0 ? null : latest.length === 0 ? (
                    <div className="rounded-[14px] bg-[#e5e5e5] px-4 py-9 text-center text-[18px] font-medium text-ios-gray dark:bg-surface">
                        {t('banking.noTransactionsYet', 'No transactions yet.')}
                    </div>
                ) : (
                    <TxRows items={latest} onSelect={setActionTx} />
                )}
            </div>
            </div>
            )}

            <TabBar tabs={tabs} active={tab} onChange={setTab} />

            <button type="button" onClick={_onClose} aria-label={t('banking.closeWallet', 'Close Wallet')} className="absolute inset-x-0 bottom-0 h-7 cursor-default" />

            {showAll && <AllTransactions transactions={txs} onBack={() => setShowAll(false)} onSelectTx={setActionTx} />}

            {sending && (
                <SendMoney
                    balance={balance}
                    onClose={() => setSending(false)}
                    onSent={() => { setSending(false); refresh(); }}
                />
            )}

            {actionTx && (
                <ActionSheet
                    actions={[{ label: t('banking.transferAgain', 'Transfer Again'), onClick: () => transferAgain(actionTx) }]}
                    onClose={() => setActionTx(null)}
                />
            )}
        </div>
    );
}
