import { t } from '@/i18n';

export type IconName =
    | 'Plane' | 'Wifi' | 'Bluetooth' | 'Antenna' | 'Key' | 'Bell'
    | 'Volume2' | 'Moon' | 'Hourglass' | 'Settings2' | 'SlidersHorizontal'
    | 'Sun' | 'LayoutGrid' | 'Accessibility' | 'Image' | 'Search'
    | 'Sparkles' | 'Fingerprint' | 'Siren' | 'BatteryFull' | 'ShieldCheck'
    | 'ShoppingBag' | 'CreditCard' | 'Gamepad2' | 'Lock' | 'Mail'
    | 'User' | 'Calendar' | 'StickyNote' | 'ListTodo' | 'Mic'
    | 'Phone' | 'MessageCircle' | 'Video' | 'Compass' | 'Newspaper'
    | 'Languages' | 'MapPin' | 'Zap';

export interface SettingsRowDef {
    id:        string;
    icon:      IconName;
    iconBg:    string;
    label:     string;
    subtitle?: string;
    status?:   string;
    badge?:    number;
    toggle?:   boolean;
}

export interface SettingsGroup {
    id:      string;
    title?:  string;
    footer?: string;
    rows:    SettingsRowDef[];
}

// Functions, not module-level constants: `t()` bakes in whatever locale is
// active the moment it evaluates, and a plain `const` here would only ever
// evaluate once (at first import), never picking up a later language change.
// Call these fresh from inside a component's render body instead.
export function getSettingsGroups(): SettingsGroup[] {
    return [
        {
            id: 'toggles',
            rows: [
                { id: 'airplane', icon: 'Plane',  iconBg: '#ff9f0a', label: t('settings.airplaneMode', 'Airplane Mode'),  subtitle: t('settings.airplaneModeSub', 'Disable calls, cellular data etc.'), toggle: false },
                { id: 'streamer', icon: 'Video',  iconBg: '#5e5ce6', label: t('settings.streamerMode', 'Streamer Mode'),  subtitle: t('settings.streamerModeSub', 'Blurs sensitive information'),         toggle: false },
            ],
        },
        {
            id: 'alerts',
            rows: [
                { id: 'notifications',  icon: 'Bell',    iconBg: '#ff453a', label: t('settings.notifications', 'Notifications'),  subtitle: t('settings.notificationsSub', 'Choose which apps can notify you') },
                { id: 'sound-haptics',  icon: 'Volume2', iconBg: '#ff375f', label: t('settings.soundHaptics', 'Sound & Haptics'), subtitle: t('settings.soundHapticsSub', 'Change sounds and vibrations') },
            ],
        },
        {
            id: 'general',
            rows: [
                { id: 'general',      icon: 'Settings2',   iconBg: '#8e8e93', label: t('settings.general', 'General'),              subtitle: t('settings.generalSub', 'General settings for your phone') },
                { id: 'display',      icon: 'Sun',         iconBg: '#0a84ff', label: t('settings.displayBrightness', 'Display & Brightness'),  subtitle: t('settings.displayBrightnessSub', 'Adjust display & brightness') },
                { id: 'wallpaper',    icon: 'Image',       iconBg: '#64d2ff', label: t('settings.wallpaper', 'Wallpaper'),             subtitle: t('settings.wallpaperSub', 'Wallpaper & background') },
                { id: 'face-unlock',  icon: 'Fingerprint', iconBg: '#34c759', label: t('settings.faceUnlockPasscode', 'Face Unlock & Passcode'), subtitle: t('settings.faceUnlockPasscodeSub', 'Secure your phone') },
                { id: 'battery',      icon: 'BatteryFull', iconBg: '#34c759', label: t('settings.battery', 'Battery'),               subtitle: t('settings.batterySub', 'Manage battery usage') },
                { id: 'privacy',      icon: 'ShieldCheck', iconBg: '#0a84ff', label: t('settings.privacySecurity', 'Privacy & Security'),    subtitle: t('settings.privacySecuritySub', 'Control app permissions') },
            ],
        },
        {
            id: 'phone-section',
            rows: [
                { id: 'phone', icon: 'Phone', iconBg: '#34c759', label: t('settings.phone', 'Phone'), subtitle: t('settings.phoneSub', 'Toggle caller id, block numbers etc.') },
                { id: 'sim',   icon: 'Antenna', iconBg: '#0a84ff', label: t('settings.simBackup', 'SIM & Backup'), subtitle: t('settings.simBackupSub', 'SIM card, number and cloud backup') },
            ],
        },
    ];
}
