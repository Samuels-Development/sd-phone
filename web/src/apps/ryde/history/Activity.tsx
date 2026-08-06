import { Clock, Star } from 'lucide-react';

import { t } from '@/i18n';
import { useRyde } from '../store';
import { getRideStatusLabel, money } from '../data';

function when(ms: number): string {
    const d = new Date(ms);
    const day = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${day} · ${time}`;
}

function GivenStars({ value }: { value: number }) {
    return (
        <span className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(n => (
                <Star key={n} className="h-[14px] w-[14px]"
                    style={{ color: n <= value ? '#FF9600' : 'rgba(127,127,127,0.30)', fill: n <= value ? '#FF9600' : 'transparent' }} strokeWidth={2} />
            ))}
        </span>
    );
}

export function Activity() {
    const g = useRyde();
    const list = g.rides.filter(r => r.role === 'rider');
    const rideStatusLabel = getRideStatusLabel();

    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <div className="shrink-0 px-5 pb-2" style={{ paddingTop: 'calc(var(--safe-top) + 10px)' }}>
                <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">{t('ryde.activity', 'Activity')}</h1>
            </div>
            <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-3">
                {list.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-10 pb-16 text-center">
                        <Clock className="h-[72px] w-[72px] text-black/25 dark:text-white/25" strokeWidth={1.5} />
                        <p className="mt-4 text-[21px] font-semibold text-black/85 dark:text-white/90">{t('ryde.noTripsYet', 'No trips yet')}</p>
                        <p className="mt-1.5 text-[16px] font-medium leading-snug text-black/55 dark:text-white/55">{t('ryde.ridesShowUpHere', 'Your rides will show up here once you book one.')}</p>
                        <button
                            onClick={() => g.setTab('home')}
                            className="mt-6 rounded-full bg-black px-10 py-3.5 text-[18px] font-semibold text-white active:opacity-80 dark:bg-white dark:text-black"
                        >
                            {t('ryde.bookARide', 'Book a ride')}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {list.map(r => (
                            <div key={r.id} className="rounded-[18px] bg-surface p-[18px]">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-[22px] font-bold text-black dark:text-white">{r.dropoff.name}</p>
                                        <p className="truncate text-[17px] text-ios-gray">{when(r.placedAt)}</p>
                                        {r.rated != null && <div className="mt-1.5"><GivenStars value={r.rated} /></div>}
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="text-[22px] font-bold text-black dark:text-white">{money(r.fare)}</p>
                                        <p className="text-[15px] font-semibold" style={{ color: r.status === 'cancelled' ? '#ff453a' : r.status === 'completed' ? '#22c55e' : '#FF9600' }}>
                                            {rideStatusLabel[r.status]}
                                        </p>
                                        {(r.tip ?? 0) > 0 && <p className="text-[13px] text-ios-gray">{t('ryde.inclTip', 'incl. {amount} tip', { amount: money(r.tip ?? 0) })}</p>}
                                    </div>
                                </div>
                                <div className="mt-3.5 flex items-center gap-2 border-t border-black/[0.07] pt-3.5 text-[17px] text-black/70 dark:border-white/10 dark:text-white/70">
                                    <span className="h-3 w-3 shrink-0 rounded-full bg-[#22c55e]" /><span className="truncate">{r.pickup.name}</span>
                                    <span className="opacity-50">→</span>
                                    <span className="h-3 w-3 shrink-0 rounded-full bg-black dark:bg-white" /><span className="truncate">{r.dropoff.name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
