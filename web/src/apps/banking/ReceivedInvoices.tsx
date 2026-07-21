import { useCallback, useState } from 'react';
import { ReceiptText } from 'lucide-react';

import { useAsyncData } from '@/hooks/useAsyncData';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { t } from '@/i18n';
import { fetchReceivedInvoices, payInvoice, type ReceivedInvoice } from '@/apps/services/servicesApi';
import { formatMoney } from './data';

export function ReceivedInvoices({ onPaid }: { onPaid: () => void }) {
    const { data, refetch } = useAsyncData(fetchReceivedInvoices, []);
    useNuiEvent('sd-phone:services:invoices', useCallback(() => { refetch(); }, [refetch]));

    const [paying, setPaying] = useState<ReceivedInvoice | null>(null);
    const [busy,   setBusy]   = useState(false);
    const [error,  setError]  = useState<string | null>(null);

    const invoices = data ?? [];

    async function doPay(inv: ReceivedInvoice) {
        if (busy) return;
        setBusy(true);
        const res = await payInvoice(inv.id);
        setBusy(false);
        if (res.success) { refetch(); onPaid(); }
        else setError(res.message ?? t('banking.somethingWentWrong', 'Something went wrong'));
    }

    if (invoices.length === 0) {
        return (
            <EmptyState
                icon={ReceiptText}
                title={t('banking.noReceivedInvoices', 'No Invoices')}
                subtitle={t('banking.receivedInvoicesSub', 'Invoices sent to you will show up here.')}
            />
        );
    }

    return (
        <>
            <div className="overflow-hidden rounded-[16px] bg-[#e5e5e5] dark:bg-surface">
                {invoices.map((inv, i) => (
                    <div key={inv.id}>
                        {i > 0 && <div className="pointer-events-none ml-16 bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />}
                        <div className="flex items-center gap-3 px-4 py-3.5">
                            <div
                                className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] text-[20px] shadow-sm"
                                style={{ background: inv.color }}
                                aria-hidden
                            >
                                {inv.emoji}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[17px] font-semibold text-black dark:text-white">{inv.label}</div>
                                <div className="truncate text-[15px] font-medium text-ios-gray">
                                    {inv.note
                                        ? inv.note
                                        : inv.from
                                            ? t('banking.invoiceFrom', 'From {name}', { name: inv.from })
                                            : t('banking.invoiceDue', 'Invoice due')}
                                </div>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                                <span className="text-[17px] font-bold tabular-nums text-black dark:text-white">{formatMoney(inv.amount, { whole: true })}</span>
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setPaying(inv)}
                                    className="rounded-full bg-ios-blue px-4 py-1 text-[14px] font-semibold text-white active:opacity-70 disabled:opacity-40"
                                >
                                    {t('banking.pay', 'Pay')}
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {paying && (
                <AlertDialog
                    title={t('banking.payInvoiceTitle', 'Pay {label}?', { label: paying.label })}
                    message={t('banking.payInvoiceMsg', "Pay {amount} to {label}? This can't be undone.", { amount: formatMoney(paying.amount, { whole: true }), label: paying.label })}
                    confirmLabel={t('banking.pay', 'Pay')}
                    cancelLabel={t('banking.cancel', 'Cancel')}
                    onCancel={() => setPaying(null)}
                    onConfirm={() => { const inv = paying; setPaying(null); void doPay(inv); }}
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
        </>
    );
}
