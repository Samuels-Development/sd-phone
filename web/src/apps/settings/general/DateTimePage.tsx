import { t } from '@/i18n';
import { GroupCard, ListGroup, ListRow, ToggleRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';
import { useTheme } from '@/stores/themeStore';
import { formatClockTime, formatLongDate, useClock } from '@/hooks/useClock';

export function DateTimePage({ onBack }: { onBack: () => void }) {
    const { hour24, setHour24 } = useTheme('hour24', 'setHour24');
    const now = useClock();

    return (
        <SubPage title={t('settings.dateTime', 'Date & Time')} onBack={onBack}>
            <ListGroup footer={t('settings.dateTimeAutoFooter', 'When enabled, your phone automatically sets the time based on your current time zone.')}>
                <ToggleRow label={t('settings.dateTime24Hour', '24-Hour Time')} on={hour24} onToggle={() => setHour24(!hour24)} divider />
                <ToggleRow label={t('settings.dateTimeSetAutomatically', 'Set Automatically')} defaultOn />
            </ListGroup>

            <ListGroup>
                <ListRow label={t('settings.dateTimeZone', 'Time Zone')} value="Los Santos (UTC−8)" />
            </ListGroup>

            <GroupCard className="mx-4 px-4 py-5 text-center">
                <div className="text-[42px] font-thin tracking-tight text-black dark:text-white">{formatClockTime(now, hour24)}</div>
                <div className="mt-1 text-[15px] font-normal text-ios-gray">
                    {formatLongDate(now)}
                </div>
            </GroupCard>
        </SubPage>
    );
}
