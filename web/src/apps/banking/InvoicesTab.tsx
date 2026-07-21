import { useCallback, useState } from 'react';
import { ReceiptText } from 'lucide-react';

import { useAsyncData } from '@/hooks/useAsyncData';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { t } from '@/i18n';
import { formatPhone } from '@/lib/phone';
import { cancelPersonalInvoice, fetchPersonalSent, type PersonalInvoice } from './bankingApi';
import { formatMoney } from './data';
import { NewInvoicePage } from './NewInvoicePage';
import { ReceivedInvoices } from './ReceivedInvoices';

type Segment = 'received' | 'sent';

export function InvoicesTab({ onPaid }: { onPaid: () => void }) {
    const [segment,    setSegment]    = useSessionState<Segment>('banking:invoicesSegment', 'received');
    const [composing,  setComposing]  = useState(false);
    const [cancelling, setCancelling] = useState<PersonalInvoice | null>(null);
    const [error,      setError]      = useState<string | null>(null);

    const { data: sent, refetch: refetchSent } = useAsyncData(fetchPersonalSent, []);
    useNuiEvent('sd-phone:services:invoices', useCallback(() => { refetchSent(); }, [refetchSent]));

    async function doCancel(inv: PersonalInvoice) {
        const res = await cancelPersonalInvoice(inv.id);
        if (res.success) refetchSent();
        else setError(res.message ?? t('banking.somethingWentWrong', 'Something went wrong'));
    }

    const sentList = sent ?? [];

    return (
        <>
            <div className="flex items-center justify-between px-5 pb-2 pt-0.5">
                <span className="text-[34px] font-bold tracking-tight">{t('banking.invoices', 'Invoices')}</span>
                <button
                    type="button"
                    onClick={() => setComposing(true)}
                    className="rounded-full bg-black px-5 py-2 text-[15px] font-semibold text-white active:opacity-70 dark:bg-white dark:text-black"
                >
                    {t('banking.newInvoice', 'New Invoice')}
                </button>
            </div>

            <div className="px-4 pb-3 pt-1">
                <SegmentedControl
                    value={segment}
                    onChange={setSegment}
                    options={[
                        { value: 'received', label: t('banking.received', 'Received') },
                        { value: 'sent',     label: t('banking.sent', 'Sent') },
                    ]}
                    className="mx-auto w-[232px]"
                />
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-10 pt-2">
                <div key={segment} className="animate-swipe-in-left">
                {segment === 'received' ? (
                    <ReceivedInvoices onPaid={onPaid} />
                ) : sentList.length === 0 ? (
                    <EmptyState
                        icon={ReceiptText}
                        title={t('banking.noSentInvoices', 'No Invoices Sent')}
                        subtitle={t('banking.sentInvoicesSub', 'Invoices you send will show up here.')}
                    />
                ) : (
                    <div className="overflow-hidden rounded-[16px] bg-[#e5e5e5] dark:bg-surface">
                        {sentList.map((inv, i) => (
                            <div key={inv.id}>
                                {i > 0 && <div className="pointer-events-none ml-4 bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />}
                                <div className="flex items-center gap-3 px-4 py-3.5">
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-[17px] font-semibold text-black dark:text-white">{inv.toName}</div>
                                        <div className="truncate text-[15px] font-medium text-ios-gray">
                                            {inv.note || formatPhone(inv.toNumber)}
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                                        <span className="text-[17px] font-bold tabular-nums text-black dark:text-white">{formatMoney(inv.amount, { whole: true })}</span>
                                        {inv.status === 'pending' ? (
                                            <button
                                                type="button"
                                                onClick={() => setCancelling(inv)}
                                                className="rounded-full bg-black/10 px-4 py-1 text-[14px] font-semibold text-black active:opacity-70 dark:bg-white/15 dark:text-white"
                                            >
                                                {t('banking.cancel', 'Cancel')}
                                            </button>
                                        ) : inv.status === 'paid' ? (
                                            <span className="text-[14px] font-semibold text-[#30d158]">{t('banking.statusPaid', 'Paid')}</span>
                                        ) : (
                                            <span className="text-[14px] font-semibold text-ios-gray">{t('banking.statusCancelled', 'Cancelled')}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                </div>
            </div>

            {cancelling && (
                <AlertDialog
                    title={t('banking.cancelInvoiceTitle', 'Cancel this invoice?')}
                    message={t('banking.cancelInvoiceMsg', '{name} will no longer be able to pay it.', { name: cancelling.toName })}
                    confirmLabel={t('banking.cancelInvoice', 'Cancel Invoice')}
                    cancelLabel={t('banking.keep', 'Keep')}
                    onCancel={() => setCancelling(null)}
                    onConfirm={() => { const inv = cancelling; setCancelling(null); void doCancel(inv); }}
                />
            )}

            {error && (
                <AlertDialog
                    title={t('banking.couldntComplete', "Couldn't complete that")}
                    message={error}
                    confirmLabel={t('banking.ok', 'OK')}
                    hideCancel
                    onCancel={() => setError(null)}
                    onConfirm={() => setError(null)}
                />
            )}

            {composing && (
                <NewInvoicePage
                    onClose={() => setComposing(false)}
                    onSent={() => { refetchSent(); setSegment('sent'); }}
                />
            )}
        </>
    );
}
