-- Homescreen layout: dock, wallpaper, and the full app list.
return {
    -- Wallpaper name. Same registry as the lockscreen - see
    -- `web/src/wallpapers.ts`.
    Wallpaper = 'lockscreen.jpg',

    -- Apps shown in the dock (bottom row). Up to 4. App `id`s match
    -- the keys in `Apps` below - the icon, label, and route are
    -- looked up from there.
    Dock = { 'phone', 'messages', 'camera', 'photos' },

    -- All available apps. The homescreen renders every app whose
    -- `id` doesn't appear in `Dock` in a 4-column grid, in the order
    -- defined below. `route` is the SPA path the React app
    -- navigates to when the icon is tapped (apps not implemented in
    -- v0.1 simply log a "coming soon" toast instead).
    -- `base = true` marks an app that ships with the phone (always installed,
    -- can't be removed). Apps without `base` are downloadable from the App Store
    -- and persisted per-character - see server/apps and phone_settings.installed_apps.
    Apps = {
        { id = 'phone',     label = 'Phone',     icon = 'phone',     route = '/phone',     accent = '#34c759', base = true },
        { id = 'messages',  label = 'Messages',  icon = 'messages',  route = '/messages',  accent = '#34c759', base = true },
        { id = 'mail',      label = 'Mail',      icon = 'mail',      route = '/mail',      accent = '#0a84ff', base = true },
        { id = 'maps',      label = 'Maps',      icon = 'maps',      route = '/maps',      accent = '#f0c43a', base = true },
        { id = 'compass',   label = 'Compass',   icon = 'compass',   route = '/compass',   accent = '#1c1c1e', base = true },
        { id = 'camera',    label = 'Camera',    icon = 'camera',    route = '/camera',    accent = '#1c1c1e', base = true },
        { id = 'photos',    label = 'Photos',    icon = 'photos',    route = '/photos',    accent = '#ffffff', base = true },
        { id = 'music',     label = 'Music',     icon = 'music',     route = '/music',     accent = '#fa233b', base = true },
        { id = 'weather',   label = 'Weather',   icon = 'weather',   route = '/weather',   accent = '#5ac8fa', base = true },
        { id = 'clock',     label = 'Clock',     icon = 'clock',     route = '/clock',     accent = '#1c1c1e', base = true },
        { id = 'calendar',  label = 'Calendar',  icon = 'calendar',  route = '/calendar',  accent = '#ffffff', base = true },
        { id = 'notes',     label = 'Notes',     icon = 'notes',     route = '/notes',     accent = '#fec547', base = true },
        { id = 'voicememos', label = 'Voice Memos', icon = 'voicememos', route = '/voicememos', accent = '#ff3b30', base = true },
        { id = 'bank',      label = 'Bank',      icon = 'bank',      route = '/bank',      accent = '#00b894', base = true },
        { id = 'health',    label = 'Health',    icon = 'health',    route = '/health',    accent = '#ff2d55', base = true },
        { id = 'documents', label = 'Files',     icon = 'documents', route = '/documents', accent = '#3478F6', base = true },
        { id = 'groups',    label = 'Groups',    icon = 'groups',    route = '/groups',    accent = '#6C63FF' },
        { id = 'birdy',     label = 'Birdy',     icon = 'birdy',     route = '/birdy',     accent = '#1d9bf0' },
        { id = 'services',  label = 'Services',  icon = 'services',  route = '/services',  accent = '#16B8A6' },
        { id = 'pages',     label = 'Pages',     icon = 'pages',     route = '/pages',     accent = '#FBC02D' },
        -- Disabled for now (hidden from home + App Store; component logic kept).
        -- { id = 'review',      label = 'Review',    icon = 'review',      route = '/review',      accent = '#E03131' },
        { id = 'marketplace', label = 'Marketplace', icon = 'marketplace', route = '/marketplace', accent = '#0a84ff' },
        { id = 'darkchat',    label = 'Dark Chat',   icon = 'darkchat',    route = '/darkchat',    accent = '#1c1c1e' },
        { id = 'cherry',      label = 'Cherry',      icon = 'cherry',      route = '/cherry',      accent = '#F0285A' },
        { id = 'photogram',   label = 'Photogram',   icon = 'photogram',   route = '/photogram',   accent = '#D62976' },
        { id = 'garages',     label = 'Garages',     icon = 'garages',     route = '/garages',     accent = '#6E5CF2' },
        { id = 'homes',       label = 'Homes',       icon = 'homes',       route = '/homes',       accent = '#12B866' },
        { id = 'ryde',        label = 'Ryde',        icon = 'ryde',        route = '/ryde',        accent = '#1c1c1e' },
        { id = 'radio',       label = 'Radio',       icon = 'radio',       route = '/radio',       accent = '#30B0C7' },
        { id = 'stocks',      label = 'Stocks',      icon = 'stocks',      route = '/stocks',      accent = '#16C784' },
        { id = 'settings',  label = 'Settings',  icon = 'settings',  route = '/settings',  accent = '#8e8e93', base = true },
        { id = 'appstore',  label = 'App Store', icon = 'appstore',  route = '/appstore',  accent = '#0a84ff', base = true },
        { id = 'calculator', label = 'Calculator', icon = 'calculator', route = '/calculator', accent = '#333335', base = true },
        { id = 'passwords',  label = 'Passwords',  icon = 'passwords',  route = '/passwords',  accent = '#1c1c1e', base = true },
        { id = 'cookie',     label = 'Cookie',     icon = 'cookie',     route = '/cookie',     accent = '#C77D2E' },
        { id = 'wordle',     label = 'Wordle',     icon = 'wordle',     route = '/wordle',     accent = '#6AAA64' },
        { id = 'flappy',     label = 'Flappy',     icon = 'flappy',     route = '/flappy',     accent = '#4EC0CA' },
        { id = 'blocks',     label = 'Blocks',     icon = 'blocks',     route = '/blocks',     accent = '#7C4DFF' },
        { id = 'blackjack',  label = 'Blackjack',  icon = 'blackjack',  route = '/blackjack',  accent = '#157347' },
        { id = 'climber',    label = 'Climber',    icon = 'climber',    route = '/climber',    accent = '#8BC34A' },
        -- Disabled for now (hidden from home + App Store; component logic kept).
        -- { id = 'railrunner', label = 'Rail Runner', icon = 'railrunner', route = '/railrunner', accent = '#3C5290' },
        { id = 'connectfour', label = 'Connect 4', icon = 'connectfour', route = '/connectfour', accent = '#1E66D0' },
        { id = 'chess',      label = 'Chess',      icon = 'chess',      route = '/chess',      accent = '#3B3B3B' },
        { id = 'battleship', label = 'Battleship', icon = 'battleship', route = '/battleship', accent = '#17A0B5' },
        { id = 'vibez',      label = 'Vibez',      icon = 'vibez',      route = '/vibez',      accent = '#A855F7' },
        { id = 'weazelnews', label = 'Weazel News', icon = 'weazelnews', route = '/weazelnews', accent = '#C8102E' },
        { id = 'streaks',    label = 'Streaks',     icon = 'streaks',    route = '/streaks',    accent = '#FF7A1A' },
    },
}
