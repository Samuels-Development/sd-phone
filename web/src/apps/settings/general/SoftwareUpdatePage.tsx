import { Smartphone } from 'lucide-react';

import { t } from '@/i18n';
import { GroupCard } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';
import { useVersionInfo } from './useVersionInfo';

export function SoftwareUpdatePage({ onBack }: { onBack: () => void }) {
    const info = useVersionInfo();

    const status = info === null
        ? t('settings.checkingForUpdates', 'Checking for updates...')
        : info.updateAvailable
            ? t('settings.updateBehind', 'A newer version is available.')
            : t('settings.softwareUpToDate', 'Your software is up to date.');

    return (
        <SubPage title={t('settings.softwareUpdate', 'Software Update')} onBack={onBack}>
            <GroupCard className="mx-4 flex flex-col items-center gap-3 px-4 py-6">
                <div className="flex h-[64px] w-[64px] items-center justify-center rounded-[14px] bg-ios-blue shadow-md">
                    <Smartphone className="h-9 w-9 text-white" strokeWidth={1.75} />
                </div>
                <div className="text-center">
                    <div className="text-[17px] font-semibold text-black dark:text-white">
                        {info?.current ? `sdOS ${info.current}` : 'sdOS'}
                    </div>
                    <div className="mt-0.5 text-[13px] text-ios-gray">{status}</div>
                </div>
            </GroupCard>

            {info?.updateAvailable && info.latest && (
                <GroupCard className="mx-4">
                    <div className="flex items-start gap-3 px-4 py-3.5">
                        <span className="mt-[7px] h-[8px] w-[8px] shrink-0 rounded-full bg-ios-red" />
                        <div className="min-w-0">
                            <div className="text-[17px] font-semibold text-black dark:text-white">
                                {t('settings.updateAvailableTitle', 'sdOS {version} is available', { version: info.latest })}
                            </div>
                            <div className="mt-0.5 text-[13px] leading-snug text-ios-gray">
                                {t('settings.updateAvailableHint', 'A new version of sd-phone has been released. Ask the server owner to update.')}
                            </div>
                        </div>
                    </div>
                </GroupCard>
            )}
        </SubPage>
    );
}
