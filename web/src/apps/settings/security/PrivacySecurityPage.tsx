import { useState } from 'react';

import { t } from '@/i18n';
import { ListGroup, ListRow, ToggleRow } from '@/ui/ListGroup';
import { AlertDialog } from '@/ui/AlertDialog';
import { signOutEverywhere } from '@/shared/signOutAll';
import { SubPage } from '../SettingsSubPage';

export function PrivacySecurityPage({ onBack, onOpenFaceUnlock }: { onBack: () => void; onOpenFaceUnlock: () => void }) {
    const [confirming, setConfirming] = useState(false);

    return (
        <>
            <SubPage title={t('settings.privacySecurity', 'Privacy & Security')} backLabel={t('settings.settings', 'Settings')} onBack={onBack}>
                <ListGroup footer={t('settings.privacySecurityFooter', 'Protect your phone with a passcode and control what apps can access.')}>
                    <ListRow label={t('settings.faceScanPasscode', 'Face Scan & Passcode')} onPress={onOpenFaceUnlock} />
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

                <ListGroup footer={t('settings.signOutAllFooter', 'Signs you out of every app account and mailbox on this phone. Your saved passwords are kept, so you can sign back in from Passwords.')}>
                    <ListRow
                        label={t('settings.signOutAllAccounts', 'Sign Out of All Accounts')}
                        destructive
                        onPress={() => setConfirming(true)}
                    />
                </ListGroup>
            </SubPage>

            {confirming && (
                <AlertDialog
                    title={t('settings.signOutAllTitle', 'Sign Out of All Accounts?')}
                    message={t('settings.signOutAllMessage', "You'll be signed out of every app account and mailbox on this phone. Saved passwords are kept.")}
                    confirmLabel={t('settings.signOutAllConfirm', 'Sign Out')}
                    destructive
                    onCancel={() => setConfirming(false)}
                    onConfirm={() => { setConfirming(false); void signOutEverywhere(); }}
                />
            )}
        </>
    );
}
