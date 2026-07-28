import { BatteryCharging } from 'lucide-react';

import { fetchNui } from '@/core/nui';
import { t } from '@/i18n';
import { useBatteryStore } from '@/stores/batteryStore';
import { GroupCard, ListGroup, ToggleRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';

export function BatteryPage({ onBack }: { onBack: () => void }) {
    const level    = useBatteryStore(s => s.level);
    const charging = useBatteryStore(s => s.charging);
    const lowPower = useBatteryStore(s => s.lowPower);
    const low = level <= 20 && !charging;

    const toggleLowPower = () => {
        const next = !useBatteryStore.getState().lowPower;
        useBatteryStore.getState().patch({ lowPower: next });
        void fetchNui('sd-phone:battery:lowPower', { enabled: next }).catch(() => {});
    };

    return (
        <SubPage title={t('settings.battery', 'Battery')} backLabel={t('settings.settings', 'Settings')} onBack={onBack}>
            <GroupCard className="mx-4 px-4 py-4">
                <div className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold text-black dark:text-white">{t('settings.batteryLevel', 'Battery Level')}</span>
                    <span className="text-[15px] font-semibold tabular-nums text-black dark:text-white" style={{ color: low ? '#ff3b30' : undefined }}>
                        {level}%
                    </span>
                </div>
                <div className="my-2 h-[18px] w-full overflow-hidden rounded-full bg-ios-gray5 dark:bg-control">
                    <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${level}%`, background: low ? '#ff3b30' : '#34c759' }}
                    />
                </div>
                <div className="flex items-center gap-1.5 text-[12px] text-ios-gray">
                    <BatteryCharging className="h-[14px] w-[14px]" strokeWidth={2} />
                    {charging
                        ? t('settings.batteryCharging', 'Charging')
                        : t('settings.batteryDrainNote', 'Battery drains while your phone is in use. Plug in to recharge.')}
                </div>
            </GroupCard>

            <ListGroup footer={t('settings.lowPowerFooter', 'Low Power Mode slows battery drain until your phone is charged.')}>
                <ToggleRow
                    label={t('settings.lowPowerMode', 'Low Power Mode')}
                    on={lowPower}
                    onToggle={toggleLowPower}
                />
            </ListGroup>
        </SubPage>
    );
}
