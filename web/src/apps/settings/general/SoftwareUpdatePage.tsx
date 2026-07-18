import { useState } from 'react';
import { Smartphone } from 'lucide-react';

import { t } from '@/i18n';
import { ListGroup, ListRow, ToggleRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';

export const OS_VERSION = 'sdOS 2.1.4';

export function SoftwareUpdatePage({ onBack }: { onBack: () => void }) {
    const [customizing, setCustomizing] = useState(false);

    const subNode = customizing ? (
        <CustomizeUpdatesPage onBack={() => setCustomizing(false)} />
    ) : null;

    return (
        <SubPage title={t('settings.softwareUpdate', 'Software Update')} onBack={onBack} sub={subNode}>
            <div className="mx-4 flex flex-col items-center gap-3 overflow-hidden rounded-[10px] bg-white px-4 py-6 dark:bg-surface">
                <div className="flex h-[64px] w-[64px] items-center justify-center rounded-[14px] bg-ios-blue shadow-md">
                    <Smartphone className="h-9 w-9 text-white" strokeWidth={1.75} />
                </div>
                <div className="text-center">
                    <div className="text-[17px] font-semibold text-black dark:text-white">{OS_VERSION}</div>
                    <div className="mt-0.5 text-[13px] text-ios-gray">{t('settings.softwareUpToDate', 'Your software is up to date.')}</div>
                </div>
            </div>

            <ListGroup
                footer={t('settings.autoUpdatesFooter', 'Automatic updates allow your phone to download and install updates overnight when connected to power.')}
            >
                <ToggleRow label={t('settings.automaticUpdates', 'Automatic Updates')} defaultOn divider />
                <ListRow   label={t('settings.customizeAutomaticUpdates', 'Customize Automatic Updates')} onPress={() => setCustomizing(true)} />
            </ListGroup>
        </SubPage>
    );
}

function CustomizeUpdatesPage({ onBack }: { onBack: () => void }) {
    return (
        <SubPage title={t('settings.automaticUpdates', 'Automatic Updates')} backLabel={t('settings.softwareUpdate', 'Software Update')} onBack={onBack}>
            <ListGroup
                header={t('settings.autoInstallHeader', 'Automatically install')}
                footer={t('settings.autoInstallFooter', 'Updates download and install overnight while your phone is charging.')}
            >
                <ToggleRow label={t('settings.osUpdates', 'System Updates')} defaultOn divider />
                <ToggleRow label={t('settings.securityUpdates', 'Security Fixes')} defaultOn />
            </ListGroup>
        </SubPage>
    );
}
