import { t } from '@/i18n';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';

const USED_GB  = 154.2;
const TOTAL_GB = 256;
const FREE_GB  = +(TOTAL_GB - USED_GB).toFixed(1);
const PCT      = (USED_GB / TOTAL_GB) * 100;

const APPS = [
    { id: 'photos',   label: () => t('settings.storagePhotos', 'Photos & Camera'), size: '45.3 GB' },
    { id: 'messages', label: () => t('settings.storageMessages', 'Messages'),      size: '12.1 GB' },
    { id: 'music',    label: () => t('settings.storageMusic', 'Music'),           size: '8.6 GB'  },
    { id: 'apps',     label: () => t('settings.storageApps', 'Apps'),             size: '6.4 GB'  },
    { id: 'system',   label: () => t('settings.storageSystemData', 'System Data'), size: '8.7 GB'  },
    { id: 'other',    label: () => t('settings.storageOther', 'Other'),           size: '73.1 GB' },
];

export function PhoneStoragePage({ onBack }: { onBack: () => void }) {
    return (
        <SubPage title={t('settings.phoneStorage', 'Phone Storage')} onBack={onBack}>
            <div className="mx-4 overflow-hidden rounded-[10px] bg-white px-4 py-4 dark:bg-surface">
                <div className="mb-1 text-[13px] font-normal text-ios-gray">
                    {t('settings.storageCapacity', '{gb} GB Capacity', { gb: TOTAL_GB })}
                </div>
                <div className="my-2 h-[18px] w-full overflow-hidden rounded-full bg-ios-gray5 dark:bg-control">
                    <div
                        className="h-full rounded-full bg-ios-blue"
                        style={{ width: `${PCT}%` }}
                    />
                </div>
                <div className="flex justify-between text-[12px] text-ios-gray">
                    <span>{t('settings.storageUsed', '{gb} GB Used', { gb: USED_GB })}</span>
                    <span>{t('settings.storageAvailable', '{gb} GB Available', { gb: FREE_GB })}</span>
                </div>
            </div>

            <ListGroup header={t('settings.storageByCategory', 'Storage by category')}>
                {APPS.map((app, i) => (
                    <ListRow
                        key={app.id}
                        label={app.label()}
                        value={app.size}
                        chevron={false}
                        divider={i < APPS.length - 1}
                    />
                ))}
            </ListGroup>
        </SubPage>
    );
}
