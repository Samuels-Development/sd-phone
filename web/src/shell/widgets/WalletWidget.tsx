import { Wallet } from 'lucide-react';

import type { WidgetSize, WidgetTheme } from '@/apps/appstore/appsApi';
import type { BankTx } from '@/apps/banking/bankingApi';
import { getCategories } from '@/apps/banking/data';
import type { Category } from '@/apps/banking/data';
import { t } from '@/i18n';
import { formatMoney } from '@/lib/money';
import { useWidgetData } from '@/stores/widgetDataStore';
import { WidgetTile, palette } from './WidgetTile';
import type { Palette } from './WidgetTile';

const ROW_H_PX = 26;
const CHROME_PX = 92;

const UP: Record<WidgetTheme, string> = { dark: '#30d158', light: '#0a8a4f', glass: '#5ff58f' };

function catMeta(cat: string) {
    const categories = getCategories();
    return categories[(cat in categories ? cat : 'transfer') as Category];
}

function ago(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '';
    const m = Math.floor(ms / 60000);
    if (m < 1) return t('banking.justNow', 'now');
    if (m < 60) return t('time.minutesShort', '{n}m', { n: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t('time.hoursShort', '{n}h', { n: h });
    return t('time.daysShort', '{n}d', { n: Math.floor(h / 24) });
}

function Row({ tx, p, up }: { tx: BankTx; p: Palette; up: string }) {
    const meta   = catMeta(tx.category);
    const Icon   = meta.icon;
    const income = tx.amount > 0;
    return (
        <div className="flex items-center gap-2 py-[3px]">
            <div
                className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full"
                style={{ background: tx.peerColor ?? meta.color }}
            >
                {tx.peerInitials
                    ? <span className="text-[9px] font-bold text-white">{tx.peerInitials}</span>
                    : <Icon className="h-[11px] w-[11px] text-white" strokeWidth={2.6} />}
            </div>
            <span className="min-w-0 flex-1 truncate text-[12px] leading-tight" style={{ color: p.fg }}>{tx.merchant}</span>
            <span className="shrink-0 text-[10px] tabular-nums" style={{ color: p.faint }}>{ago(tx.date)}</span>
            <span
                className="w-[62px] shrink-0 text-right text-[12px] font-semibold tabular-nums"
                style={{ color: income ? up : p.fg }}
            >
                {income ? '+' : ''}{formatMoney(tx.amount, { whole: true })}
            </span>
        </div>
    );
}

export function WalletWidget({ size, width, height, theme = 'dark' }: {
    size: WidgetSize; width: number; height: number; theme?: WidgetTheme;
}) {
    const balance = useWidgetData(s => s.balance);
    const cash    = useWidgetData(s => s.cash);
    const txs     = useWidgetData(s => s.transactions);

    const p    = palette(theme);
    const up   = UP[theme] ?? UP.dark;
    const amount = balance === null ? '—' : formatMoney(balance, { whole: true });
    const latest = txs[0] ?? null;

    const rows = txs.slice(0, Math.max(1, Math.floor((height - CHROME_PX) / ROW_H_PX)));

    return (
        <WidgetTile
            width={width}
            height={height}
            radius={size === 'sm' ? 22 : 26}
            tint={p.bg}
            glass={theme === 'glass'}
            hairline={false}
        >

            <div className="relative flex h-full w-full flex-col p-3.5" style={{ color: p.fg }}>
                <div className="flex shrink-0 items-center justify-between">
                    <div className="flex min-w-0 items-center gap-1.5">
                        <Wallet className="h-[12px] w-[12px] shrink-0" strokeWidth={2.6} style={{ color: up }} />
                        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.13em]" style={{ color: p.sub }}>
                            {t('banking.wallet', 'Wallet')}
                        </span>
                    </div>
                    {size !== 'sm' && (
                        <span className="text-[10px] font-medium tabular-nums" style={{ color: p.faint }}>
                            {t('banking.available', 'Available')}
                        </span>
                    )}
                </div>

                <div className="mt-1.5 shrink-0">
                    <div className="flex items-baseline gap-1">
                        <span className="text-[15px] font-semibold leading-none" style={{ color: p.sub }}>$</span>
                        <span className="truncate text-[27px] font-semibold leading-none tabular-nums tracking-tight">
                            {amount.replace(/^\$/, '')}
                        </span>
                    </div>
                </div>

                {size === 'sm' && (
                    <>
                        {cash !== null && (
                            <div className="mt-1.5 flex shrink-0 items-baseline gap-1.5">
                                <Wallet className="h-[11px] w-[11px] shrink-0 translate-y-[1px]" strokeWidth={2.6} style={{ color: p.faint }} />
                                <span className="text-[11px]" style={{ color: p.sub }}>{t('banking.cash', 'Cash')}</span>
                                <span className="text-[12px] font-semibold tabular-nums">
                                    {formatMoney(cash, { whole: true })}
                                </span>
                            </div>
                        )}
                        <div className="mt-auto min-w-0 pt-1.5" style={{ borderTop: `1px solid ${p.rule}` }}>
                            {latest ? (
                                <>
                                    <div className="truncate text-[11px] leading-tight" style={{ color: p.sub }}>{latest.merchant}</div>
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span
                                            className="text-[13px] font-semibold tabular-nums"
                                            style={{ color: latest.amount > 0 ? up : p.fg }}
                                        >
                                            {latest.amount > 0 ? '+' : ''}{formatMoney(latest.amount, { whole: true })}
                                        </span>
                                        <span className="text-[10px] tabular-nums" style={{ color: p.faint }}>{ago(latest.date)}</span>
                                    </div>
                                </>
                            ) : (
                                <div className="text-[11px]" style={{ color: p.faint }}>{t('banking.noRecent', 'No recent activity')}</div>
                            )}
                        </div>
                    </>
                )}

                {size !== 'sm' && (
                    <div className="mt-2 min-h-0 flex-1 pt-1.5" style={{ borderTop: `1px solid ${p.rule}` }}>
                        {rows.length === 0 ? (
                            <div className="text-[11px]" style={{ color: p.sub }}>
                                {t('banking.noRecent', 'No recent activity')}
                            </div>
                        ) : rows.map(tx => <Row key={tx.id} tx={tx} p={p} up={up} />)}
                    </div>
                )}
            </div>
        </WidgetTile>
    );
}
