import { useCallback, useMemo, useState } from 'react';
import { ChevronLeft, ReceiptText } from 'lucide-react';

import { useAsyncData } from '@/hooks/useAsyncData';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { AlertDialog } from '@/ui/AlertDialog';
import { EmptyState } from '@/ui/EmptyState';
import { Scroller } from '@/ui/Scroller';
import { ContactAvatar, PlaceholderAvatar } from '@/shared/ContactAvatar';
import { useContacts } from '@/stores/contactsStore';
import { t } from '@/i18n';
import { digits } from '@/lib/format';
import { formatPhone } from '@/lib/phone';
import { fmtMoney } from './data';
import { cancelInvoice, fetchSentInvoices, type SentInvoice } from './servicesApi';

// Business sent-invoices list, mirroring the Wallet's Sent segment: contact-resolved identity,
// reference codes in the title, status chips and cancel on pending rows.
export function InvoicesPage({ onClose }: { onClose: () => void }) {
    const [exiting,    setExiting]    = useState(false);
    const [cancelling, setCancelling] = useState<SentInvoice | null>(null);
    const [busy,       setBusy]       = useState(false);
    const [error,      setError]      = useState<string | null>(null);

    const { data, refetch } = useAsyncData(fetchSentInvoices, []);
    useNuiEvent('sd-phone:services:invoices', useCallback(() => { refetch(); }, [refetch]));

    const { contacts } = useContacts('contacts');
    const contactByNumber = useMemo(() => {
        const map = new Map<string, (typeof contacts)[number]>();
        for (const c of contacts) {
            const key = digits(c.phone ?? '');
            if (key) map.set(key, c);
        }
        return map;
    }, [contacts]);

    const invoices = data ?? [];

    function dismiss() {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(onClose, 300);
    }

    async function doCancel(inv: SentInvoice) {
        if (busy) return;
        setBusy(true);
        const res = await cancelInvoice(inv.id);
        setBusy(false);
        if (res.success) refetch();
        else setError(res.message ?? t('services.somethingWentWrong', 'Something went wrong'));
    }

    return (
        <div
            className="absolute inset-0 z-40 flex flex-col bg-[#d4d4d4] font-sf text-black dark:bg-base dark:text-white"
            style={{
                animation: exiting
                    ? 'ios-pop 0.3s cubic-bezier(0.32,0.72,0,1) forwards'
                    : 'ios-push 0.3s cubic-bezier(0.32,0.72,0,1)',
                willChange: 'transform',
            }}
        >
            <div className="h-[58px] shrink-0" aria-hidden />

            <div className="flex h-11 shrink-0 items-center px-2">
                <button type="button" onClick={dismiss} className="flex items-center gap-0.5 text-[17px] text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-[24px] w-[24px]" strokeWidth={2.4} />{t('services.actions', 'Actions')}
                </button>
            </div>

            <h1 className="px-5 pb-3 pt-1 text-[34px] font-bold tracking-ios-display">{t('services.invoices', 'Invoices')}</h1>

            <Scroller className="min-h-0 flex-1 px-4 pb-10 pt-2">
                {invoices.length === 0 ? (
                    <EmptyState
                        icon={ReceiptText}
                        title={t('services.noInvoices', 'No Invoices')}
                        subtitle={t('services.noInvoicesSub', 'Invoices your business sends will show up here.')}
                    />
                ) : (
                    <div className="overflow-hidden rounded-[16px] bg-[#e5e5e5] dark:bg-surface">
                        {invoices.map((inv, i) => {
                            const card = contactByNumber.get(digits(inv.toNumber));
                            return (
                            <div key={inv.id}>
                                {i > 0 && <div className="pointer-events-none bg-black/10 dark:bg-white/10" style={{ height: '0.5px' }} />}
                                <div className="flex items-center gap-3.5 px-4 py-4">
                                    {card ? <ContactAvatar contact={card} size={46} /> : <PlaceholderAvatar size={46} />}
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="truncate text-[18px] font-semibold text-black dark:text-white">{card ? card.name : formatPhone(inv.toNumber)}</span>
                                            {inv.code && <span className="shrink-0 text-[13px] font-semibold tracking-wide text-ios-gray">#{inv.code}</span>}
                                        </div>
                                        {(inv.note || card) && (
                                            <div className="truncate text-[16px] font-medium text-ios-gray">
                                                {inv.note || formatPhone(inv.toNumber)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                                        <span className="text-[18px] font-bold tabular-nums text-black dark:text-white">{fmtMoney(inv.amount)}</span>
                                        {inv.status === 'pending' ? (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => setCancelling(inv)}
                                                className="rounded-full bg-black/10 px-4 py-1 text-[14px] font-semibold text-black active:opacity-70 disabled:opacity-40 dark:bg-white/15 dark:text-white"
                                            >
                                                {t('services.cancelShort', 'Cancel')}
                                            </button>
                                        ) : inv.status === 'paid' ? (
                                            <span className="text-[14px] font-semibold text-[#30d158]">{t('services.statusPaid', 'Paid')}</span>
                                        ) : (
                                            <span className="text-[14px] font-semibold text-ios-gray">{t('services.statusCancelled', 'Cancelled')}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                )}
            </Scroller>

            {cancelling && (
                <AlertDialog
                    title={t('services.cancelInvoiceTitle', 'Cancel invoice?')}
                    message={t('services.cancelInvoiceMsg', 'This invoice to {name} will be withdrawn. They will no longer be able to pay it.', { name: contactByNumber.get(digits(cancelling.toNumber))?.name ?? formatPhone(cancelling.toNumber) })}
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
        </div>
    );
}
