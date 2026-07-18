import { BatteryCharging } from 'lucide-react';

import { t } from '@/i18n';
import { useBatteryStore } from '@/stores/batteryStore';
import { ListGroup, ListRow, ToggleRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';

export function BatteryPage({ onBack }: { onBack: () => void }) {
    const level = useBatteryStore(s => s.level);
    const low = level <= 20;

    return (
        <SubPage title={t('settings.battery', 'Battery')} backLabel={t('settings.settings', 'Settings')} onBack={onBack}>
            <div className="mx-4 overflow-hidden rounded-[10px] bg-white px-4 py-4 dark:bg-surface">
                <div className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold text-black dark:text-white">{t('settings.batteryLevel', 'Battery Level')}</span>
                    <span className="text-[15px] font-semibold tabular-nums" style={{ color: low ? '#ff3b30' : undefined }}>
                        {level}%
                    </span>
                </div>
                <div className="my-2 h-[18px] w-full overflow-hidden rounded-full bg-ios-gray5 dark:bg-control">
                    <div
                        className="h-full rounded-full"
                        style={{ width: `${level}%`, background: low ? '#ff3b30' : '#34c759' }}
                    />
                </div>
                <div className="flex items-center gap-1.5 text-[12px] text-ios-gray">
                    <BatteryCharging className="h-[14px] w-[14px]" strokeWidth={2} />
                    {t('settings.batteryDrainNote', 'Battery drains while the phone is in use and recharges automatically over time.')}
                </div>
            </div>

            <ListGroup footer={t('settings.lowPowerFooter', 'Low Power Mode reduces background activity until your phone recharges.')}>
                <ToggleRow label={t('settings.lowPowerMode', 'Low Power Mode')} />
            </ListGroup>

            <ListGroup header={t('settings.batteryHealth', 'Battery health')}>
                <ListRow label={t('settings.maximumCapacity', 'Maximum Capacity')} value="100%" chevron={false} divider />
                <ListRow label={t('settings.peakPerformance', 'Peak Performance')} value={t('settings.performanceNormal', 'Normal')} chevron={false} />
            </ListGroup>
        </SubPage>
    );
}
