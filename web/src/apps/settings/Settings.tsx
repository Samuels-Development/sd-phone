import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { DisplayBrightnessPage } from './appearance/DisplayBrightnessPage';
import { FaceUnlockPage } from './security/FaceUnlockPage';
import { BatteryPage } from './general/BatteryPage';
import { GeneralPage } from './general/GeneralPage';
import { NotificationsPage } from './notifications/NotificationsPage';
import { PhoneSettingsPage } from './security/PhoneSettingsPage';
import { PrivacySecurityPage } from './security/PrivacySecurityPage';
import { ProfileCard } from './account/ProfileCard';
import { SoundHapticsPage } from './sound/SoundHapticsPage';
import { SearchBar } from '@/ui/SearchBar';
import { SettingsRow } from './SettingsRow';
import { getSettingsGroups } from './data';
import { SettingsGroup } from './SettingsGroup';
import { PushLayer } from './SettingsSubPage';
import { WallpaperPage } from './appearance/WallpaperPage';

type SubPage = 'general' | 'display' | 'wallpaper' | 'notifications' | 'sound-haptics' | 'face-unlock' | 'phone' | 'battery' | 'privacy' | null;

export function Settings({ onClose }: { onClose: () => void }) {
    const [subPage, setSubPage] = useSessionState<SubPage>('settings:subPage', null);
    const [query,   setQuery]   = useSessionState('settings:query', '');

    const settingsGroups = getSettingsGroups();
    const allRows = settingsGroups.flatMap(g => g.rows);
    const searchResults = query.trim()
        ? allRows.filter(r =>
            r.label.toLowerCase().includes(query.toLowerCase()) ||
            r.subtitle?.toLowerCase().includes(query.toLowerCase())
        )
        : [];

    function handleBack() { setSubPage(null); }

    function handleRowPress(id: string) {
        setQuery('');
        if (id === 'general')       setSubPage('general');
        if (id === 'display')       setSubPage('display');
        if (id === 'wallpaper')     setSubPage('wallpaper');
        if (id === 'notifications') setSubPage('notifications');
        if (id === 'sound-haptics') setSubPage('sound-haptics');
        if (id === 'face-unlock')   setSubPage('face-unlock');
        if (id === 'phone')         setSubPage('phone');
        if (id === 'battery')       setSubPage('battery');
        if (id === 'privacy')       setSubPage('privacy');
    }

    const sub =
        subPage === 'general'         ? <GeneralPage           onBack={handleBack} />
        : subPage === 'display'       ? <DisplayBrightnessPage onBack={handleBack} />
        : subPage === 'wallpaper'     ? <WallpaperPage         onBack={handleBack} />
        : subPage === 'notifications' ? <NotificationsPage     onBack={handleBack} />
        : subPage === 'sound-haptics' ? <SoundHapticsPage      onBack={handleBack} />
        : subPage === 'face-unlock'   ? <FaceUnlockPage        onBack={handleBack} />
        : subPage === 'phone'         ? <PhoneSettingsPage     onBack={handleBack} />
        : subPage === 'battery'       ? <BatteryPage           onBack={handleBack} />
        : subPage === 'privacy'       ? <PrivacySecurityPage   onBack={handleBack} onOpenFaceUnlock={() => setSubPage('face-unlock')} />
        : null;

    return (
        <PushLayer className="z-10" innerClassName="text-black dark:text-white" sub={sub}>
            <div className="h-11 shrink-0" aria-hidden />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="px-5 pb-2 pt-1 text-[34px] font-bold tracking-tight text-black dark:text-white">
                    {t('settings.settings', 'Settings')}
                </div>
                <SearchBar value={query} onChange={setQuery} className="mx-4 mb-3" />

                {query.trim() ? (
                    <div className="pb-10">
                        {searchResults.length > 0 ? (
                            <div className="mx-4 overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                                {searchResults.map((row, i) => (
                                    <SettingsRow
                                        key={row.id}
                                        row={row}
                                        divider={i < searchResults.length - 1}
                                        onPress={() => handleRowPress(row.id)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="mt-10 text-center text-[15px] text-ios-gray">
                                {t('settings.noResults', 'No results for “{query}”', { query })}
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        <ProfileCard />
                        <div className="mt-6 flex flex-col gap-6 pb-10">
                            {settingsGroups.map(group => (
                                <SettingsGroup
                                    key={group.id}
                                    group={group}
                                    onRowPress={handleRowPress}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>

            <button
                type="button"
                onClick={onClose}
                aria-label={t('settings.closeSettings', 'Close Settings')}
                className="absolute inset-x-0 bottom-0 h-7 cursor-default"
            />
        </PushLayer>
    );
}
