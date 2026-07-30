import { useEffect, useState } from 'react';
import { Check, Play, Plus, Square, Trash2, Volume, Volume2 } from 'lucide-react';

import { device } from '@device';
import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useTheme } from '@/stores/themeStore';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { SubPage } from '../SettingsSubPage';
import { NOTIFICATION_TONES, RINGTONES, resolveTone } from '../tones';
import type { CustomTone, Tone } from '../tones';
import { startPreview, stopPreview } from '../tonePlayer';
import { AddToneDialog } from './AddToneDialog';
import { NavBar } from '@/ui/NavBar';

type Picking = 'ringtone' | 'notification' | null;

export function SoundHapticsPage({ onBack }: { onBack: () => void }) {
    const {
        theme, ringtoneVol, setRingtoneVol, callVol, setCallVol,
        ringtone, setRingtone, notificationTone, setNotificationTone,
        customRingtones, customNotificationTones, addCustomTone, removeCustomTone,
    } = useTheme('theme', 'ringtoneVol', 'setRingtoneVol', 'callVol', 'setCallVol', 'ringtone', 'setRingtone', 'notificationTone', 'setNotificationTone', 'customRingtones', 'customNotificationTones', 'addCustomTone', 'removeCustomTone');
    const isDark    = theme === 'dark';
    const trackEmpty = isDark ? '#3A3A3C' : '#E5E5EA';
    const [picking, setPicking] = useState<Picking>(null);

    const isRing = picking === 'ringtone';
    const subNode = picking ? (
        <TonePickerPage
            title={isRing ? t('settings.ringtone', 'Ringtone') : t('settings.notificationTone', 'Notification Tone')}
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


function TonePickerPage({
    title, tones, selected, previewVol, onSelect, onBack, custom,
}: {
    title: string;
    tones: Tone[];
    selected: string;
    previewVol: number;
    onSelect: (id: string) => void;
    onBack: () => void;
    custom?: {
        noun:           string;
        myTones:        string;
        addTone:        string;
        pasteHint:      string;
        addToneMessage: string;
        items:    CustomTone[];
        onAdd:    (name: string, url: string) => void;
        onRemove: (id: string) => void;
    };
}) {
    const { goBack, pageStyle } = useIosPush(onBack);

    const [previewing, setPreviewing] = useState<string | null>(null);
    const [adding, setAdding]         = useState(false);

    useEffect(() => stopPreview, []);

    const togglePreview = (tone: { id: string; url: string }) => {
        if (previewing === tone.id) {
            stopPreview();
            setPreviewing(null);
        } else {
            startPreview(tone.url, previewVol, () => setPreviewing(null));
            setPreviewing(tone.id);
        }
    };

    const renderTone = (
        tone: { id: string; name: string; url: string },
        divider: boolean,
        onDelete?: () => void,
    ) => {
        const isPreviewing = previewing === tone.id;
        return (
            <div key={tone.id} className="relative flex w-full items-center pl-4 pr-2">
                <button
                    type="button"
                    onClick={() => onSelect(tone.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 py-3 text-left active:opacity-50"
                >
                    <span className="min-w-0 flex-1 truncate text-[17px] font-normal text-black dark:text-white">{tone.name}</span>
                    {selected === tone.id && (
                        <Check className="h-[17px] w-[17px] shrink-0 text-ios-blue" strokeWidth={2.5} />
                    )}
                </button>
                <button
                    type="button"
                    onClick={() => togglePreview(tone)}
                    aria-label={isPreviewing
                        ? t('settings.stopPreviewOf', 'Stop preview of {name}', { name: tone.name })
                        : t('settings.previewOf', 'Preview {name}', { name: tone.name })}
                    className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ios-blue active:opacity-40"
                >
                    {isPreviewing
                        ? <Square className="h-[15px] w-[15px]" fill="currentColor" strokeWidth={0} />
                        : <Play className="h-[16px] w-[16px] translate-x-[1px]" fill="currentColor" strokeWidth={0} />}
                </button>
                {onDelete && (
                    <button
                        type="button"
                        onClick={onDelete}
                        aria-label={t('settings.deleteOf', 'Delete {name}', { name: tone.name })}
                        className="ml-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ios-red active:opacity-40"
                    >
                        <Trash2 className="h-[16px] w-[16px]" strokeWidth={2} />
                    </button>
                )}
                {divider && (
                    <div
                        className="pointer-events-none absolute bottom-0 right-0 bg-ios-gray4 dark:bg-control"
                        style={{ left: 0, height: '0.5px' }}
                    />
                )}
            </div>
        );
    };

    return (
        <div
            className="absolute inset-0 z-30 flex flex-col bg-[#d4d4d4] dark:bg-base"
            style={pageStyle}
        >
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar backLabel={t('settings.soundHaptics', 'Sound & Haptics')} onBack={goBack} title={title} hairline />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 px-4 pb-10">
                    <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                        {tones.map((tone, i) => renderTone(tone, i < tones.length - 1))}
                    </div>

                    {custom && (
                        <>
                            <div className="mb-2 mt-7 px-4 text-[13px] font-normal uppercase tracking-wide text-ios-gray">
                                {custom.myTones}
                            </div>
                            <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                                {custom.items.map(c => renderTone(c, true, () => {
                                    if (previewing === c.id) { stopPreview(); setPreviewing(null); }
                                    custom.onRemove(c.id);
                                }))}
                                <button
                                    type="button"
                                    onClick={() => setAdding(true)}
                                    className="flex w-full items-center gap-2 px-4 py-3 text-left active:opacity-50"
                                >
                                    <Plus className="h-[18px] w-[18px] shrink-0 text-ios-blue" strokeWidth={2.5} />
                                    <span className="text-[17px] text-ios-blue">{custom.addTone}</span>
                                </button>
                            </div>
                            <div className="mt-2 px-4 text-[13px] leading-snug text-ios-gray">
                                {custom.pasteHint}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {adding && custom && (
                <AddToneDialog
                    title={custom.addTone}
                    message={custom.addToneMessage}
                    onCancel={() => setAdding(false)}
                    onConfirm={(name, url) => { custom.onAdd(name, url); setAdding(false); }}
                />
            )}
        </div>
    );
}
