import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight, FileText, Plus, ReceiptText } from 'lucide-react';

import { t } from '@/i18n';
import { InvoicesPage } from './InvoicesPage';
import { NewInvoicePage } from './NewInvoicePage';

// Entry rows only: composing and the sent list both live on their own drill-in pages,
// matching the Wallet's invoice flow.
export function InvoicesSection() {
    const [composing, setComposing] = useState(false);
    const [viewing,   setViewing]   = useState(false);

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

                <Divider />

                <button
                    type="button"
                    onClick={() => setViewing(true)}
                    className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-black/[0.06] active:bg-black/10 dark:hover:bg-white/[0.07] dark:active:bg-white/10"
                >
                    <Tile color="#30d158"><ReceiptText className="h-[18px] w-[18px] text-white" strokeWidth={2.25} /></Tile>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-[18px] font-medium text-black dark:text-white">{t('services.viewInvoices', 'View Invoices')}</div>
                        <div className="truncate text-[16px] font-medium text-ios-gray">{t('services.viewInvoicesSub', 'Pending and settled invoices, with cancelling.')}</div>
                    </div>
                    <ChevronRight className="h-[22px] w-[22px] text-black/35 dark:text-white/35" strokeWidth={2.25} />
                </button>
            </div>

            {composing && (
                <NewInvoicePage
                    onClose={() => setComposing(false)}
                    onSent={() => setViewing(true)}
                />
            )}

            {viewing && <InvoicesPage onClose={() => setViewing(false)} />}
        </>
    );
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
