import { useState } from 'react';
import { Briefcase, ReceiptText } from 'lucide-react';

import { ContactAvatar, PlaceholderAvatar } from '@/shared/ContactAvatar';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { t } from '@/i18n';
import { payInvoice, type ReceivedInvoice } from '@/apps/services/servicesApi';
import type { Contact as PhoneContact } from '@/apps/phone/data';
import { formatMoney } from './data';

// Presentational: the fetch lives in Banking (above the animated tab subtree) so segment
// switches re-render instantly from props instead of refetching through a loading flash.
// Personal sender identity resolves live against the viewer's contact book: saved card wins,
// otherwise the server-provided formatted number stands.
export function ReceivedInvoices({ invoices, loading, onRefetch, onPaid, contactByNumber }: {
    invoices:  ReceivedInvoice[];
    loading:   boolean;
    onRefetch: () => void;
    onPaid:    () => void;
    contactByNumber: Map<string, PhoneContact>;
}) {
    const [paying, setPaying] = useState<ReceivedInvoice | null>(null);
    const [busy,   setBusy]   = useState(false);
    const [error,  setError]  = useState<string | null>(null);

    function cardOf(inv: ReceivedInvoice): PhoneContact | undefined {
        return inv.personal && inv.fromNumber ? contactByNumber.get(inv.fromNumber) : undefined;
    }
    function labelOf(inv: ReceivedInvoice): string {
        return cardOf(inv)?.name ?? inv.label;
    }

    async function doPay(inv: ReceivedInvoice) {
        if (busy) return;
        setBusy(true);
        const res = await payInvoice(inv.id);
        setBusy(false);
        if (res.success) { onRefetch(); onPaid(); }
        else setError(res.message ?? t('banking.somethingWentWrong', 'Something went wrong'));
    }

    if (invoices.length === 0) {
        if (loading) return null;
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
                        {i > 0 && <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />}
                        <div className="flex items-center gap-3 px-4 py-3.5">
                            {inv.personal ? (
                                cardOf(inv)
                                    ? <ContactAvatar contact={cardOf(inv) as PhoneContact} size={42} />
                                    : <PlaceholderAvatar size={42} />
                            ) : (
                                <div
                                    className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[11px] shadow-sm"
                                    style={{ background: inv.color }}
                                    aria-hidden
                                >
                                    <Briefcase className="h-[21px] w-[21px] text-white" strokeWidth={2.2} />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[17px] font-semibold text-black dark:text-white">{labelOf(inv)}</div>
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
                                {inv.status === 'pending' ? (
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => setPaying(inv)}
                                        className="rounded-full bg-ios-blue px-4 py-1 text-[14px] font-semibold text-white active:opacity-70 disabled:opacity-40"
                                    >
                                        {t('banking.pay', 'Pay')}
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

            {paying && (
                <AlertDialog
                    title={t('banking.payInvoiceTitle', 'Pay {label}?', { label: labelOf(paying) })}
                    message={t('banking.payInvoiceMsg', "Pay {amount} to {label}? This can't be undone.", { amount: formatMoney(paying.amount, { whole: true }), label: labelOf(paying) })}
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
