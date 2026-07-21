import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { useTheme } from '@/stores/themeStore';
import { AboutPage }          from './AboutPage';
import { DateTimePage }        from './DateTimePage';
import { LanguageRegionPage }  from './LanguageRegionPage';
import { PhoneStoragePage }    from './PhoneStoragePage';
import { ResetPhonePage }      from './ResetPhonePage';
import { SoftwareUpdatePage }  from './SoftwareUpdatePage';
import { ListGroup, ListRow, ToggleRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';

type ActiveSub = 'about' | 'software-update' | 'phone-storage' | 'date-time' | 'language-region' | 'reset-phone' | null;

export function GeneralPage({ onBack }: { onBack: () => void }) {
    const [sub, setSub] = useSessionState<ActiveSub>('settings:generalSub', null);
    const { reopenLastApp, setReopenLastApp } = useTheme('reopenLastApp', 'setReopenLastApp');
    const back = () => setSub(null);

    const subNode =
        sub === 'about'             ? <AboutPage          onBack={back} />
        : sub === 'software-update' ? <SoftwareUpdatePage onBack={back} />
        : sub === 'phone-storage'   ? <PhoneStoragePage   onBack={back} />
        : sub === 'date-time'       ? <DateTimePage       onBack={back} />
        : sub === 'language-region' ? <LanguageRegionPage onBack={back} />
        : sub === 'reset-phone'     ? <ResetPhonePage     onBack={back} />
        : null;

    return (
        <SubPage title={t('settings.general', 'General')} backLabel={t('settings.settings', 'Settings')} onBack={onBack} sub={subNode}>
            <ListGroup>
                <ListRow label={t('settings.about', 'About')}           onPress={() => setSub('about')}           divider />
                <ListRow label={t('settings.softwareUpdate', 'Software Update')} onPress={() => setSub('software-update')} divider />
                <ListRow label={t('settings.phoneStorage', 'Phone Storage')}   onPress={() => setSub('phone-storage')}   />
            </ListGroup>

            <ListGroup>
                <ListRow label={t('settings.dateTime', 'Date & Time')}       onPress={() => setSub('date-time')}       divider />
                <ListRow label={t('settings.languageRegion', 'Language & Region')} onPress={() => setSub('language-region')} />
            </ListGroup>

            <ListGroup>
                <ToggleRow label={t('settings.reopenLastApp', 'Reopen Last App')} on={reopenLastApp} onToggle={() => setReopenLastApp(!reopenLastApp)} />
            </ListGroup>

            <ListGroup>
                <ListRow label={t('settings.resetPhone', 'Reset Phone')} onPress={() => setSub('reset-phone')} chevron={false} />
            </ListGroup>
        </SubPage>
    );
}
