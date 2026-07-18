import { t } from '@/i18n';
import { ListGroup, ListRow, ToggleRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';

export function PrivacySecurityPage({ onBack, onOpenFaceUnlock }: { onBack: () => void; onOpenFaceUnlock: () => void }) {
    return (
        <SubPage title={t('settings.privacySecurity', 'Privacy & Security')} backLabel={t('settings.settings', 'Settings')} onBack={onBack}>
            <ListGroup footer={t('settings.privacySecurityFooter', 'Protect your phone with a passcode and control what apps can access.')}>
                <ListRow label={t('settings.faceUnlockPasscode', 'Face Unlock & Passcode')} onPress={onOpenFaceUnlock} />
            </ListGroup>

            <ListGroup header={t('settings.privacyHeader', 'Privacy')}>
                <ToggleRow label={t('settings.locationServices', 'Location Services')} defaultOn divider />
                <ToggleRow label={t('settings.shareAnalytics', 'Share Analytics')} divider />
                <ToggleRow label={t('settings.personalizedAds', 'Personalized Ads')} />
            </ListGroup>

            <ListGroup
                header={t('settings.securityHeader', 'Security')}
                footer={t('settings.trackingFooter', 'Apps that want to track your activity across other apps must ask for permission first.')}
            >
                <ToggleRow label={t('settings.askAppsToTrack', 'Ask Apps Not to Track')} defaultOn />
            </ListGroup>
        </SubPage>
    );
}
