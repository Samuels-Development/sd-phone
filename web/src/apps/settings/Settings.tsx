import { device } from '@device';
import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { AppIconsPage } from './appearance/AppIconsPage';
import { DisplayBrightnessPage } from './appearance/DisplayBrightnessPage';
import { FaceUnlockPage } from './security/FaceUnlockPage';
import { IslandPetPage } from './appearance/IslandPetPage';
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
import { SimBackupPage } from './sim/SimBackupPage';
import { useSimStore } from '@/stores/simStore';
import { BluetoothPage } from './bluetooth/BluetoothPage';
import { WifiPage } from './wifi/WifiPage';
import { useWifiConfigured, useWifiConnected } from '@/stores/wifiStore';
import { shellHostsPet } from '@/shell/chassis';
import { shellFor } from '@/shell/shells';
import { useTheme } from '@/stores/themeStore';
import { useBluetoothConfigured } from '@/stores/bluetoothStore';

type SubPage = 'general' | 'display' | 'island-pet' | 'wallpaper' | 'app-icons' | 'notifications' | 'sound-haptics' | 'face-unlock' | 'phone' | 'battery' | 'privacy' | 'sim' | 'wifi' | 'bluetooth' | null;

export function Settings({ onClose }: { onClose: () => void }) {
    const [subPage, setSubPage] = useSessionState<SubPage>('settings:subPage', null);
    const [query,   setQuery]   = useSessionState('settings:query', '');
    const simEnabled = useSimStore(s => s.enabled);
    const wifiConfigured = useWifiConfigured();
    const bluetoothConfigured = useBluetoothConfigured();
    const wifi = useWifiConnected();

    const { shell } = useTheme('shell');
    const petHost = shellHostsPet(shellFor(shell, device.id));

    // The SIM & Backup row only exists while the server runs unique phones.
    const settingsGroups = getSettingsGroups()
        .map(g => simEnabled ? g : { ...g, rows: g.rows.filter(r => r.id !== 'sim') })
        .map(g => device.calls ? g : { ...g, rows: g.rows.filter(r => r.id !== 'phone') })
        // A device with no shells to choose from (the tablet) simply has no island, so the row
        // goes. A phone on a chassis whose cutout cannot hold the pill keeps the row, greyed, so
        // the pets stay discoverable and it is obvious the shell is what put them out of reach.
        .map(g => device.screen.island ? g : { ...g, rows: g.rows.filter(r => r.id !== 'island-pet') })
        .map(g => petHost ? g : {
            ...g,
            rows: g.rows.map(r => (r.id === 'island-pet'
                ? { ...r, disabled: true, subtitle: t('settings.islandPetNeedsIsland', 'Needs the default Rounded shell') }
                : r)),
        })
        .map(g => wifiConfigured ? g : { ...g, rows: g.rows.filter(r => r.id !== 'wifi') })
        .map(g => bluetoothConfigured ? g : { ...g, rows: g.rows.filter(r => r.id !== 'bluetooth') })
        .map(g => ({
            ...g,
            rows: g.rows.map(r => (r.id === 'wifi'
                ? { ...r, status: wifi ? wifi.ssid : t('settings.wifiNotConnected', 'Not Connected') }
                : r)),
        }))
        .filter(g => g.rows.length > 0);
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
        if (id === 'island-pet')    setSubPage('island-pet');
        if (id === 'wallpaper')     setSubPage('wallpaper');
        if (id === 'app-icons')     setSubPage('app-icons');
        if (id === 'notifications') setSubPage('notifications');
        if (id === 'sound-haptics') setSubPage('sound-haptics');
        if (id === 'face-unlock')   setSubPage('face-unlock');
        if (id === 'phone')         setSubPage('phone');
        if (id === 'battery')       setSubPage('battery');
        if (id === 'privacy')       setSubPage('privacy');
        if (id === 'sim')           setSubPage('sim');
        if (id === 'wifi')          setSubPage('wifi');
        if (id === 'bluetooth')     setSubPage('bluetooth');
    }

    const sub =
        subPage === 'general'         ? <GeneralPage           onBack={handleBack} />
        : subPage === 'display'       ? <DisplayBrightnessPage onBack={handleBack} />
        : subPage === 'island-pet'    ? <IslandPetPage         onBack={handleBack} />
        : subPage === 'wallpaper'     ? <WallpaperPage         onBack={handleBack} />
        : subPage === 'app-icons'     ? <AppIconsPage          onBack={handleBack} />
        : subPage === 'notifications' ? <NotificationsPage     onBack={handleBack} />
        : subPage === 'sound-haptics' ? <SoundHapticsPage      onBack={handleBack} />
        : subPage === 'face-unlock'   ? <FaceUnlockPage        onBack={handleBack} />
        : subPage === 'phone'         ? <PhoneSettingsPage     onBack={handleBack} />
        : subPage === 'battery'       ? <BatteryPage           onBack={handleBack} />
        : subPage === 'privacy'       ? <PrivacySecurityPage   onBack={handleBack} onOpenFaceUnlock={() => setSubPage('face-unlock')} />
        : subPage === 'sim'           ? <SimBackupPage         onBack={handleBack} />
        : subPage === 'wifi'          ? <WifiPage              onBack={handleBack} />
        : subPage === 'bluetooth'     ? <BluetoothPage         onBack={handleBack} />
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
                            <div className="mx-4 overflow-hidden rounded-[10px] bg-surface">
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
