import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { FileText, Plus, X } from 'lucide-react';

import { useAsyncData } from '@/hooks/useAsyncData';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { AlertDialog } from '@/ui/AlertDialog';
import { t } from '@/i18n';
import { fmtMoney } from './data';
import { InvoiceComposer } from './InvoiceComposer';
import { cancelInvoice, fetchSentInvoices, type InvoiceStatus, type SentInvoice } from './servicesApi';

export function InvoicesSection() {
    const { data, refetch } = useAsyncData(fetchSentInvoices, []);
    useNuiEvent('sd-phone:services:invoices', useCallback(() => { refetch(); }, [refetch]));

    const [composing,  setComposing]  = useState(false);
    const [cancelling, setCancelling] = useState<SentInvoice | null>(null);
    const [busy,       setBusy]       = useState(false);
    const [error,      setError]      = useState<string | null>(null);

    const invoices = data ?? [];

    async function doCancel(inv: SentInvoice) {
        if (busy) return;
        setBusy(true);
        const res = await cancelInvoice(inv.id);
        setBusy(false);
        if (res.success) refetch();
        else setError(res.message ?? t('services.somethingWentWrong', 'Something went wrong'));
    }

    return (
        <>
            <SectionHeader>{t('services.invoices', 'Invoices')}</SectionHeader>
            <div className="overflow-hidden rounded-[12px] bg-[#e5e5e5] dark:bg-surface">
                <button
                    type="button"
                    onClick={() => setComposing(true)}
                    className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-black/[0.06] active:bg-black/10 dark:hover:bg-white/[0.07] dark:active:bg-white/10"
                >
                    <Tile color="#0A84FF"><FileText className="h-[18px] w-[18px] text-white" strokeWidth={2.25} /></Tile>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[18px] font-medium text-black dark:text-white">{t('services.sendInvoice', 'Send Invoice')}</div>
                        <div className="truncate text-[16px] font-medium text-ios-gray">{t('services.billAnotherPlayer', 'Bill another player from your business.')}</div>
                    </div>
                    <Plus className="h-[22px] w-[22px] text-black/35 dark:text-white/35" strokeWidth={2.25} />
                </button>

                {invoices.map(inv => (
                    <div key={inv.id}>
                        <Divider />
                        <InvoiceRow
                            invoice={inv}
                            disabled={busy}
                            onCancel={() => setCancelling(inv)}
                        />
                    </div>
                ))}
            </div>

            {composing && (
                <InvoiceComposer
                    onClose={() => setComposing(false)}
                    onSent={() => { setComposing(false); refetch(); }}
                />
            )}

            {cancelling && (
                <AlertDialog
                    title={t('services.cancelInvoiceTitle', 'Cancel invoice?')}
                    message={t('services.cancelInvoiceMsg', 'This invoice to {name} will be withdrawn. They will no longer be able to pay it.', { name: cancelling.toName })}
                    confirmLabel={t('services.cancelInvoice', 'Cancel Invoice')}
                    cancelLabel={t('services.keepInvoice', 'Keep')}
                    destructive
                    onCancel={() => setCancelling(null)}
                    onConfirm={() => { const inv = cancelling; setCancelling(null); void doCancel(inv); }}
                />
            )}

            {error && (
                <AlertDialog
                    title={t('services.couldntComplete', "Couldn't complete that")}
                    message={error}
                    confirmLabel={t('services.ok', 'OK')}
                    hideCancel
                    onCancel={() => setError(null)}
                    onConfirm={() => setError(null)}
                />
            )}
        </>
    );
}

function InvoiceRow({ invoice, disabled, onCancel }: { invoice: SentInvoice; disabled: boolean; onCancel: () => void }) {
    const pending = invoice.status === 'pending';
    return (
        <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <span className="truncate text-[17px] font-medium text-black dark:text-white">{invoice.toName}</span>
                    <StatusPill status={invoice.status} />
                </div>
                <div className="truncate text-[15px] font-medium text-ios-gray">
                    {invoice.note || t('services.noNote', 'No note')}
                </div>
            </div>
            <span className="shrink-0 text-[17px] font-semibold tabular-nums text-black dark:text-white">{fmtMoney(invoice.amount)}</span>
            {pending && (
                <button
                    type="button"
                    disabled={disabled}
                    onClick={onCancel}
                    aria-label={t('services.cancelInvoiceAria', 'Cancel invoice to {name}', { name: invoice.toName })}
                    className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-ios-red transition-colors hover:bg-black/[0.06] active:bg-black/10 disabled:opacity-40 dark:hover:bg-white/[0.07] dark:active:bg-white/10"
                >
                    <X className="h-[19px] w-[19px]" strokeWidth={2.4} />
                </button>
            )}
        </div>
    );
}

function StatusPill({ status }: { status: InvoiceStatus }) {
    const map: Record<InvoiceStatus, { label: string; cls: string }> = {
        pending:   { label: t('services.statusPending', 'Pending'),     cls: 'bg-ios-orange/15 text-ios-orange' },
        paid:      { label: t('services.statusPaid', 'Paid'),           cls: 'bg-ios-green/15 text-ios-green' },
        cancelled: { label: t('services.statusCancelled', 'Cancelled'), cls: 'bg-black/[0.08] text-ios-gray dark:bg-white/10' },
    };
    const m = map[status];
    return <span className={`shrink-0 rounded-full px-2 py-[1px] text-[12px] font-semibold ${m.cls}`}>{m.label}</span>;
}

function SectionHeader({ children }: { children: ReactNode }) {
    return <div className="px-1 pb-2 pt-7 text-[19px] font-bold tracking-tight text-black dark:text-white">{children}</div>;
}

function Tile({ color, children }: { color: string; children: ReactNode }) {
    return (
        <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] shadow-sm" style={{ background: color }}>
            {children}
        </div>
    );
}

function Divider() {
    return <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />;
}
