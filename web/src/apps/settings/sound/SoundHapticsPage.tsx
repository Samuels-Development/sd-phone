import { useState } from 'react';
import { Volume, Volume2 } from 'lucide-react';

import { device } from '@device';
import { t } from '@/i18n';
import { useTheme } from '@/stores/themeStore';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';
import { NOTIFICATION_TONES, RINGTONES, resolveTone } from '../tones';
import { stopPreview } from '../tonePlayer';
import { TonePickerPage } from './TonePickerPage';

type Picking = 'ringtone' | 'notification' | null;

export function SoundHapticsPage({ onBack }: { onBack: () => void }) {
    const {
        theme, ringtoneVol, setRingtoneVol, callVol, setCallVol,
        ringtone, setRingtone, notificationTone, setNotificationTone,
        customRingtones, customNotificationTones, addCustomTone, removeCustomTone,
    } = useTheme('theme', 'ringtoneVol', 'setRingtoneVol', 'callVol', 'setCallVol', 'ringtone', 'setRingtone', 'notificationTone', 'setNotificationTone', 'customRingtones', 'customNotificationTones', 'addCustomTone', 'removeCustomTone');
    const isDark    = theme === 'dark';
    const trackEmpty = isDark ? 'rgb(var(--control))' : 'rgb(var(--surface))';
    const [picking, setPicking] = useState<Picking>(null);

    const isRing = picking === 'ringtone';
    const subNode = picking ? (
        <TonePickerPage
            title={isRing ? t('settings.ringtone', 'Ringtone') : t('settings.notificationTone', 'Notification Tone')}
            backLabel={t('settings.soundHaptics', 'Sound & Haptics')}
            tones={isRing ? RINGTONES : NOTIFICATION_TONES}
            selected={isRing ? ringtone : notificationTone}
            previewVol={ringtoneVol / 100}
            onSelect={id => (isRing ? setRingtone(id) : setNotificationTone(id))}
            onBack={() => { stopPreview(); setPicking(null); }}
            custom={{
                noun:      isRing ? t('settings.ringtone', 'Ringtone') : t('settings.notificationTone', 'Notification Tone'),
                myTones:   isRing ? t('settings.myRingtones', 'My Ringtones') : t('settings.myNotificationTones', 'My Notification Tones'),
                addTone:   isRing ? t('settings.addRingtone', 'Add Ringtone') : t('settings.addNotificationTone', 'Add Notification Tone'),
                pasteHint: isRing
                    ? t('settings.pasteYoutubeRingtone', 'Paste any YouTube link to use it as a ringtone.')
                    : t('settings.pasteYoutubeNotification', 'Paste any YouTube link to use it as a notification tone.'),
                addToneMessage: isRing
                    ? t('settings.saveYoutubeRingtone', 'Save any YouTube link as a ringtone.')
                    : t('settings.saveYoutubeNotification', 'Save any YouTube link as a notification tone.'),
                items:    isRing ? customRingtones : customNotificationTones,
                onAdd:    (name, url) => (isRing
                    ? setRingtone(addCustomTone('ringtone', name, url))
                    : setNotificationTone(addCustomTone('notification', name, url))),
                onRemove: id => removeCustomTone(isRing ? 'ringtone' : 'notification', id),
            }}
        />
    ) : null;

    return (
        <SubPage title={t('settings.soundHaptics', 'Sound & Haptics')} backLabel={t('settings.settings', 'Settings')} onBack={onBack} sub={subNode}>

            <ListGroup header={t('settings.ringtoneAlertVolume', 'Ringtone and Alert Volume')}>
                <div className="flex items-center gap-3 px-4 py-3">
                    <Volume
                        className="h-[18px] w-[18px] shrink-0 text-ios-gray"
                        strokeWidth={2}
                    />
                    <input
                        type="range"
                        min={0} max={100}
                        value={ringtoneVol}
                        onChange={e => setRingtoneVol(+e.target.value)}
                        className="ios-slider flex-1"
                        style={{ '--sp': `${ringtoneVol}%`, '--se': trackEmpty } as React.CSSProperties}
                    />
                    <Volume2
                        className="h-[20px] w-[20px] shrink-0 text-ios-gray"
                        strokeWidth={2}
                    />
                </div>
            </ListGroup>

            {/* This slider sets the in-call voice level, so it has nothing to control on a
                device that cannot call - dropped entirely rather than shown disabled. */}
            {device.calls && (
                <ListGroup header={t('settings.callVolume', 'Call Volume')}>
                    <div className="flex items-center gap-3 px-4 py-3">
                        <Volume
                            className="h-[18px] w-[18px] shrink-0 text-ios-gray"
                            strokeWidth={2}
                        />
                        <input
                            type="range"
                            min={0} max={100}
                            value={callVol}
                            onChange={e => setCallVol(+e.target.value)}
                            className="ios-slider flex-1"
                            style={{ '--sp': `${callVol}%`, '--se': trackEmpty } as React.CSSProperties}
                        />
                        <Volume2
                            className="h-[20px] w-[20px] shrink-0 text-ios-gray"
                            strokeWidth={2}
                        />
                    </div>
                </ListGroup>
            )}

            <ListGroup header={t('settings.soundHapticsPatterns', 'Sound and Haptics Patterns')}>
                <ListRow
                    label={t('settings.ringtone', 'Ringtone')}
                    value={resolveTone('ringtone', ringtone, customRingtones).name}
                    chevron
                    divider
                    onPress={() => setPicking('ringtone')}
                />
                <ListRow
                    label={t('settings.notificationTone', 'Notification Tone')}
                    value={resolveTone('notification', notificationTone, customNotificationTones).name}
                    chevron
                    onPress={() => setPicking('notification')}
                />
            </ListGroup>

        </SubPage>
    );
}


