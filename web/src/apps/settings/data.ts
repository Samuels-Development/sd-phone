import { t } from '@/i18n';

export const SETTINGS_PAGES = ['general', 'accessibility', 'display', 'island-pet', 'wallpaper', 'app-icons', 'home-density', 'notifications', 'sound-haptics', 'face-unlock', 'phone', 'streamer', 'sim', 'wifi', 'bluetooth'] as const;

export type SettingsPage = typeof SETTINGS_PAGES[number];

export function pageForRow(id: string): SettingsPage | null {
    return (SETTINGS_PAGES as readonly string[]).includes(id) ? id as SettingsPage : null;
}

export type IconName =
    | 'Plane' | 'Wifi' | 'Bluetooth' | 'Antenna' | 'Key' | 'Bell'
    | 'Volume2' | 'Moon' | 'Hourglass' | 'Settings2' | 'SlidersHorizontal'
    | 'Sun' | 'LayoutGrid' | 'Accessibility' | 'Image' | 'Search'
    | 'Sparkles' | 'Fingerprint' | 'Siren'
    | 'ShoppingBag' | 'CreditCard' | 'Gamepad2' | 'Lock' | 'Mail'
    | 'User' | 'Calendar' | 'StickyNote' | 'ListTodo' | 'Mic'
    | 'Phone' | 'MessageCircle' | 'Video' | 'Compass' | 'Newspaper'
    | 'Languages' | 'MapPin' | 'Zap' | 'PawPrint' | 'Grid2x2' | 'Radar';

export interface SettingsRowDef {
    id:        string;
    icon:      IconName;
    iconBg:    string;
    label:     string;
    subtitle?: string;
    status?:   string;
    badge?:    number;
    disabled?: boolean;
    keywords?: string;
}

export interface SettingsGroup {
    id:      string;
    title?:  string;
    footer?: string;
    rows:    SettingsRowDef[];
}

export function getSettingsGroups(): SettingsGroup[] {
    return [
        {
            id: 'toggles',
            rows: [
                { id: 'airplane', icon: 'Plane',  iconBg: '#ff9f0a', label: t('settings.airplaneMode', 'Airplane Mode'),  subtitle: t('settings.airplaneModeSub', 'Turn off calls, data and connectivity'), keywords: t('settings.keywords.airplane', 'flight, offline, signal') },
                { id: 'focus',    icon: 'Moon',   iconBg: '#5e5ce6', label: t('settings.focus', 'Focus'),                subtitle: t('settings.focusSub', 'Silence calls and alerts'), keywords: t('settings.keywords.focus', 'do not disturb, dnd, silence, quiet') },
                { id: 'streamer', icon: 'Video',  iconBg: '#5e5ce6', label: t('settings.streamerMode', 'Streamer Mode'),  subtitle: t('settings.streamerModeSub', 'Hide details on stream'), keywords: t('settings.keywords.streamer', 'stream, privacy, hide, twitch') },
                { id: 'wifi',     icon: 'Wifi',   iconBg: '#0a84ff', label: t('settings.wifi', 'Wi-Fi'),                subtitle: t('settings.wifiSub', 'Join nearby networks'), keywords: t('settings.keywords.wifi', 'wireless, internet, network, wlan') },
                { id: 'bluetooth', icon: 'Bluetooth', iconBg: '#0a84ff', label: t('settings.bluetooth', 'Bluetooth'),   subtitle: t('settings.bluetoothSub', 'Pair with nearby devices'), keywords: t('settings.keywords.bluetooth', 'pair, headphones, devices') },
            ],
        },
        {
            id: 'alerts',
            rows: [
                { id: 'notifications',  icon: 'Bell',    iconBg: '#ff453a', label: t('settings.notifications', 'Notifications'),  subtitle: t('settings.notificationsSub', 'Choose which apps can notify you'), keywords: t('settings.keywords.notifications', 'alerts, banners, badges') },
                { id: 'sound-haptics',  icon: 'Volume2', iconBg: '#ff375f', label: t('settings.soundHaptics', 'Sound & Haptics'), subtitle: t('settings.soundHapticsSub', 'Ringtones, alerts and vibration'), keywords: t('settings.keywords.soundHaptics', 'ringtone, volume, vibration, text tone') },
            ],
        },
        {
            id: 'general',
            rows: [
                { id: 'general',      icon: 'Settings2',   iconBg: '#8e8e93', label: t('settings.general', 'General'),              subtitle: t('settings.generalSub', 'Device info, storage and language'), keywords: t('settings.keywords.general', 'about, storage, language, region, reset') },
                { id: 'accessibility', icon: 'Accessibility', iconBg: '#0a84ff', label: t('settings.accessibility', 'Accessibility'),   subtitle: t('settings.accessibilitySub', 'Motion and text options'), keywords: t('settings.keywords.accessibility', 'motion, text size, reduce') },
                { id: 'display',      icon: 'Sun',         iconBg: '#0a84ff', label: t('settings.displayBrightness', 'Display & Brightness'),  subtitle: t('settings.displayBrightnessSub', 'Wallpaper, theme and brightness'), keywords: t('settings.keywords.display', 'dark mode, light mode, theme, brightness') },
                { id: 'island-pet',   icon: 'PawPrint',    iconBg: '#ff9f0a', label: t('settings.islandPet', 'Island Pets'),          subtitle: t('settings.islandPetSub', 'Pick a pixel pet for the Dynamic Island'), keywords: t('settings.keywords.islandPet', 'pet, dynamic island, animal') },
                { id: 'wallpaper',    icon: 'Image',       iconBg: '#64d2ff', label: t('settings.wallpaper', 'Wallpaper'),             subtitle: t('settings.wallpaperSub', 'Wallpaper & background'), keywords: t('settings.keywords.wallpaper', 'background, lock screen, home screen') },
                { id: 'app-icons',    icon: 'LayoutGrid',  iconBg: '#5e5ce6', label: t('settings.appIcons', 'App Icons'),              subtitle: t('settings.appIconsSub', 'Icon theme and Home Screen names'), keywords: t('settings.keywords.appIcons', 'icon theme, app names, labels') },
                { id: 'home-density', icon: 'Grid2x2',     iconBg: '#ff375f', label: t('settings.homeDensity', 'Home Screen'),         subtitle: t('settings.homeDensitySub', 'How many apps fit and how big they are'), keywords: t('settings.keywords.homeDensity', 'grid, layout, icon size, dock') },
                { id: 'face-unlock',  icon: 'Fingerprint', iconBg: '#34c759', label: t('settings.faceScanPasscode', 'Face Scan & Passcode'), subtitle: t('settings.faceScanPasscodeSub', 'Lock and unlock options'), keywords: t('settings.keywords.faceUnlock', 'passcode, pin, lock, face id, security') },
            ],
        },
        {
            id: 'phone-section',
            rows: [
                { id: 'phone', icon: 'Phone', iconBg: '#34c759', label: t('settings.phone', 'Phone'), subtitle: t('settings.phoneSub', 'Caller ID, blocking and call privacy'), keywords: t('settings.keywords.phone', 'caller id, blocked, calls, block') },
                { id: 'sim',   icon: 'Antenna', iconBg: '#0a84ff', label: t('settings.simBackup', 'SIM & Backup'), subtitle: t('settings.simBackupSub', 'SIM card, number and cloud backup'), keywords: t('settings.keywords.sim', 'number, backup, cloud, restore') },
            ],
        },
    ];
}

export interface SettingsVisibility {
    sim:       boolean;
    calls:     boolean;
    island:    boolean;
    wifi:      boolean;
    bluetooth: boolean;
}

export function filterSettingsGroups(groups: SettingsGroup[], v: SettingsVisibility): SettingsGroup[] {
    const hidden = new Set<string>();
    if (!v.sim) hidden.add('sim');
    if (!v.calls) hidden.add('phone');
    if (!v.island) hidden.add('island-pet');
    if (!v.wifi) hidden.add('wifi');
    if (!v.bluetooth) hidden.add('bluetooth');
    return groups
        .map(g => ({ ...g, rows: g.rows.filter(r => !hidden.has(r.id)) }))
        .filter(g => g.rows.length > 0);
}
