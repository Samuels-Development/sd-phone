import { useEffect, useState } from 'react';
import { Bike } from 'lucide-react';

import { t } from '@/i18n';
import { isFiveM } from '@/core/nui';
import { EmptyState } from '@/ui/EmptyState';
import { GroupCard, ListGroup, ListRow } from '@/ui/ListGroup';
import { scoot } from './scootApi';
import type { ScootPastRide } from './scootApi';

const DEV_RIDES: ScootPastRide[] = [
    { id: 12, scooterId: 2, plate: 'SCOOT002', startedAt: 1789500000, endedAt: 1789500900, minutes: 15, cost: 15, paid: 1 },
    { id: 9,  scooterId: 1, plate: 'SCOOT001', startedAt: 1789400000, endedAt: 1789400300, minutes: 5,  cost: 5,  paid: 1 },
];

function when(unix: number): string {
    const d = new Date(unix * 1000);
    return `${d.toLocaleDateString([], { day: '2-digit', month: 'short' })} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function Rides() {
    const [rides, setRides] = useState<ScootPastRide[] | null>(isFiveM ? null : DEV_RIDES);

    useEffect(() => {
        if (!isFiveM) return;
        void scoot.history().then(r => setRides(r?.rides ?? []));
    }, []);

    const spent = (rides ?? []).reduce((n, r) => n + r.cost, 0);
    const minutes = (rides ?? []).reduce((n, r) => n + r.minutes, 0);

    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <div className="h-11 shrink-0" aria-hidden />
            <div className="no-scrollbar flex-1 overflow-y-auto pb-10">
                <div className="px-5 pb-2 pt-1 text-[34px] font-bold tracking-tight text-black dark:text-white">{t('scoot.tabRides', 'Rides')}</div>

                <div className="mx-4 mb-5 grid grid-cols-2 gap-3">
                    <GroupCard radius={16} className="p-4">
                        <p className="text-[13px] font-semibold uppercase tracking-wider text-ios-gray">{t('scoot.totalSpent', 'Total spent')}</p>
                        <p className="mt-1 text-[26px] font-bold tabular-nums text-black dark:text-white">${spent}</p>
                    </GroupCard>
                    <GroupCard radius={16} className="p-4">
                        <p className="text-[13px] font-semibold uppercase tracking-wider text-ios-gray">{t('scoot.minutesRidden', 'Minutes ridden')}</p>
                        <p className="mt-1 text-[26px] font-bold tabular-nums text-black dark:text-white">{minutes}</p>
                    </GroupCard>
                </div>

                {rides && rides.length === 0 ? (
                    <EmptyState icon={Bike} title={t('scoot.noRides', 'No rides yet')} subtitle={t('scoot.noRidesSub', 'Unlock a scooter from the Ride tab.')} center />
                ) : (
                    <ListGroup header={t('scoot.recent', 'Recent')}>
                        {(rides ?? []).map((r, i) => (
                            <ListRow
                                key={r.id}
                                label={r.plate ?? `#${r.scooterId}`}
                                sub={`${when(r.startedAt)} · ${t('scoot.minutes', '{n} min', { n: r.minutes })}`}
                                value={`$${r.cost}${r.paid ? '' : ` · ${t('scoot.unpaid', 'unpaid')}`}`}
                                divider={i < (rides?.length ?? 0) - 1}
                            />
                        ))}
                    </ListGroup>
                )}
            </div>
        </div>
    );
}
