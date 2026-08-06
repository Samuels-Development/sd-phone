import { Car } from 'lucide-react';

import { Sheet } from '@/ui/Sheet';
import { useRydeVehicles } from '../rydeApi';
import type { RydeVehicle } from '../rydeApi';
import { t } from '@/i18n';

export function VehiclePicker({ onPick, onClose }: {
    onPick: (v: RydeVehicle) => void;
    onClose: () => void;
}) {
    const { vehicles, loading } = useRydeVehicles();

    return (
        <Sheet title={t('ryde.yourVehicles', 'Your Vehicles')} onClose={onClose} fit="content" className="bg-surface px-5 pt-3">
            {() => (
                loading ? (
                    <p className="py-10 text-center text-[15px] text-ios-gray">{t('ryde.loadingVehicles', 'Loading your vehicles…')}</p>
                ) : vehicles.length === 0 ? (
                    <p className="py-10 text-center text-[15px] text-ios-gray">{t('ryde.noVehiclesFoundInGarage', 'No vehicles found in your garage.')}</p>
                ) : (
                    <div className="pb-1">
                        {vehicles.map((v, i) => (
                            <div key={v.plate + i} className="relative">
                                <button
                                    onClick={() => onPick(v)}
                                    className="flex w-full items-center gap-3.5 rounded-xl px-1 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                                >
                                    <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-black/[0.07] text-black/70 dark:bg-white/10 dark:text-white/80">
                                        <Car className="h-[24px] w-[24px]" />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-[18px] font-semibold text-black dark:text-white">{v.name}</span>
                                        <span className="block truncate text-[15px] tabular-nums tracking-wide text-ios-gray">{v.plate}</span>
                                    </span>
                                </button>
                                {i < vehicles.length - 1 && (
                                    <div className="absolute bottom-0 left-1 right-0 h-px bg-black/[0.07] dark:bg-white/[0.08]" />
                                )}
                            </div>
                        ))}
                    </div>
                )
            )}
        </Sheet>
    );
}
