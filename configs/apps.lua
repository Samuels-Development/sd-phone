-- The phone's app catalog: dock, home wallpaper, and every app the phone knows about.
-- Per-app flags:
--   base = true       ships installed and cannot be removed (never in the App Store)
--   enabled = false   the app does not exist on this server: hidden from the home screen
--                     and the App Store, uninstallable, and removed from phones that had it
--                     installed. Background work belonging to the app stops too: no ticks, no
--                     sweeps, no write-behind flushes. Its schema and stored data are left
--                     untouched, so switching it back on picks up where it left off.
--   wifi = '<id>'     the app only downloads while the phone is on that Wi-Fi network, an `id`
--                     from configs/wifi.lua. The server re-checks the connection from its own
--                     coords, so the App Store dimming it is presentation only. Needs
--                     `base = false`, since it gates the download and a base app never downloads.
--   requires = {}     hide the app until this player clears a gate. Every condition must pass, the
--                     server answers them, and a hidden app's id never reaches the phone:
--                       item     = 'usb'            or { name = 'usb', count = 2, metadata = {...} }
--                       metadata = { vip = true }   framework player metadata
--                       jobs     = { police = 2 }   a name, an array, or name = minimum grade
--                       check    = 'res.export'     called as (source, appId); only true opens it
--                       consume  = true             using `item` unlocks it permanently instead
--                     Re-checked on every phone open and job change. A gate draws an icon - it
--                     authorises nothing, so gate the app's own callbacks server-side too.
--                     Full reference: https://docs.samueldev.shop/resources/phone/configuration
return {
    -- Wallpaper name. Same registry as the lockscreen - see
    -- `web/src/wallpapers.ts`.
    Wallpaper = 'lockscreen.jpg',

    -- Apps shown in the dock (bottom row). Up to 4. App `id`s match
    -- the keys in `Apps` below - the icon, label, and route are
    -- looked up from there.
    Dock = { 'phone', 'messages', 'camera', 'photos' },

    -- Apps seeded onto page one of a BRAND-NEW phone before the rest spill onto page two. Once a
    -- player has arranged their own home screen theirs wins, so this only decides first impressions.
    -- 0 fills the page, and a value larger than the grid is clamped to it: a page holds 24 icons at
    -- the default icon size, 35 at the small one and 15 at the large, which each player picks in
    -- Settings, so the clamp is what keeps this honest across all three.
    FirstPageApps = 0,

    -- All apps. The homescreen renders every app whose `id` doesn't appear in
    -- `Dock` in a 4-column grid, in the order defined below. `route` is the SPA
    -- path the React app navigates to when the icon is tapped.
    -- `base = true` marks an app that ships with the phone (always installed,
    -- can't be removed). Apps without `base` are downloadable from the App Store
    -- and persisted per-character - see server/apps and phone_settings.installed_apps.
    -- `enabled = false` disables an app server-wide (see the header above).
    Apps = {
        { id = 'phone', label = 'Phone', icon = 'phone', route = '/phone', accent = '#34c759', base = true, enabled = true },
        { id = 'messages', label = 'Messages', icon = 'messages', route = '/messages', accent = '#34c759', base = true, enabled = true },
        { id = 'mail', label = 'Mail', icon = 'mail', route = '/mail', accent = '#0a84ff', base = true, enabled = true },
        { id = 'maps', label = 'Maps', icon = 'maps', route = '/maps', accent = '#f0c43a', base = true, enabled = true },
        { id = 'compass', label = 'Compass', icon = 'compass', route = '/compass', accent = '#1c1c1e', base = true, enabled = true },
        { id = 'camera', label = 'Camera', icon = 'camera', route = '/camera', accent = '#1c1c1e', base = true, enabled = true },
        { id = 'photos', label = 'Photos', icon = 'photos', route = '/photos', accent = '#ffffff', base = true, enabled = true },
        { id = 'music', label = 'Music', icon = 'music', route = '/music', accent = '#fa233b', base = true, enabled = true },
        { id = 'weather', label = 'Weather', icon = 'weather', route = '/weather', accent = '#5ac8fa', base = true, enabled = true },
        { id = 'clock', label = 'Clock', icon = 'clock', route = '/clock', accent = '#1c1c1e', base = true, enabled = true },
        { id = 'calendar', label = 'Calendar', icon = 'calendar', route = '/calendar', accent = '#ffffff', base = true, enabled = true },
        { id = 'notes', label = 'Notes', icon = 'notes', route = '/notes', accent = '#fec547', base = true, enabled = true },
        { id = 'voicememos', label = 'Voice Memos', icon = 'voicememos', route = '/voicememos', accent = '#ff3b30', base = true, enabled = true },
        { id = 'bank', label = 'Bank', icon = 'bank', route = '/bank', accent = '#00b894', base = true, enabled = true },
        { id = 'health', label = 'Health', icon = 'health', route = '/health', accent = '#ff2d55', base = true, enabled = true },
        { id = 'documents', label = 'Files', icon = 'documents', route = '/documents', accent = '#3478F6', base = true, enabled = true },
        { id = 'id', label = 'ID', icon = 'id', route = '/id', accent = '#2C3440', base = true, enabled = true },
        { id = 'groups', label = 'Groups', icon = 'groups', route = '/groups', accent = '#6C63FF', base = false, enabled = true },
        { id = 'birdy', label = 'Squawk', icon = 'birdy', route = '/birdy', accent = '#1d9bf0', base = false, enabled = true },
        { id = 'services', label = 'Services', icon = 'services', route = '/services', accent = '#16B8A6', base = false, enabled = true },
        { id = 'pages', label = 'Pages', icon = 'pages', route = '/pages', accent = '#FBC02D', base = false, enabled = true },
        { id = 'marketplace', label = 'Marketplace', icon = 'marketplace', route = '/marketplace', accent = '#0a84ff', base = false, enabled = true },
        { id = 'darkchat', label = 'Dark Chat', icon = 'darkchat', route = '/darkchat', accent = '#1c1c1e', base = false, enabled = true },
        { id = 'cherry', label = 'Cherry', icon = 'cherry', route = '/cherry', accent = '#F0285A', base = false, enabled = true },
        { id = 'photogram', label = 'Photogram', icon = 'photogram', route = '/photogram', accent = '#D62976', base = false, enabled = true },
        { id = 'garages', label = 'Garages', icon = 'garages', route = '/garages', accent = '#6E5CF2', base = false, enabled = true },
        { id = 'homes', label = 'Homes', icon = 'homes', route = '/homes', accent = '#12B866', base = false, enabled = true },
        { id = 'ryde', label = 'Ryde', icon = 'ryde', route = '/ryde', accent = '#1c1c1e', base = false, enabled = true },
        { id = 'radio', label = 'Radio', icon = 'radio', route = '/radio', accent = '#30B0C7', base = false, enabled = true },
        { id = 'stocks', label = 'Stocks', icon = 'stocks', route = '/stocks', accent = '#16C784', base = false, enabled = true },
        { id = 'settings', label = 'Settings', icon = 'settings', route = '/settings', accent = '#8e8e93', base = true, enabled = true },
        { id = 'appstore', label = 'App Store', icon = 'appstore', route = '/appstore', accent = '#0a84ff', base = true, enabled = true },
        { id = 'calculator', label = 'Calculator', icon = 'calculator', route = '/calculator', accent = '#333335', base = true, enabled = true },
        { id = 'passwords', label = 'Passwords', icon = 'passwords', route = '/passwords', accent = '#1c1c1e', base = true, enabled = true },
        { id = 'cookie', label = 'Cookie', icon = 'cookie', route = '/cookie', accent = '#C77D2E', base = false, enabled = true },
        { id = 'wordle', label = 'Penta', icon = 'wordle', route = '/wordle', accent = '#6AAA64', base = false, enabled = true },
        { id = 'flappy', label = 'Flappy', icon = 'flappy', route = '/flappy', accent = '#4EC0CA', base = false, enabled = true },
        { id = 'blocks', label = 'Blocks', icon = 'blocks', route = '/blocks', accent = '#7C4DFF', base = false, enabled = true },
        { id = 'minesweeper', label = 'Minesweeper', icon = 'minesweeper', route = '/minesweeper', accent = '#E4483D', base = false, enabled = true },
        { id = 'casino', label = 'Casino', icon = 'casino', route = '/casino', accent = '#0F5132', base = false, enabled = true },
        { id = 'climber', label = 'Climber', icon = 'climber', route = '/climber', accent = '#8BC34A', base = false, enabled = true },
        { id = 'connectfour', label = 'Connect 4', icon = 'connectfour', route = '/connectfour', accent = '#1E66D0', base = false, enabled = true },
        { id = 'chess', label = 'Chess', icon = 'chess', route = '/chess', accent = '#3B3B3B', base = false, enabled = true },
        { id = 'battleship', label = 'Battleship', icon = 'battleship', route = '/battleship', accent = '#17A0B5', base = false, enabled = true },
        { id = 'vibez', label = 'Clout', icon = 'vibez', route = '/vibez', accent = '#A855F7', base = false, enabled = true },
        { id = 'weazelnews', label = 'Weazel News', icon = 'weazelnews', route = '/weazelnews', accent = '#C8102E', base = false, enabled = true },
        { id = 'streaks', label = 'Streaks', icon = 'streaks', route = '/streaks', accent = '#FF7A1A', base = false, enabled = true },

        -- The three terminals run on BOTH devices. The same code lays itself out per screen: a
        -- menu root that pushes one section at a time on the phone, the multi-tab browser on the
        -- tablet. This catalog is also what the tablet's ids validate against, so these rows are
        -- what let sd-tablet show them at all.
        --
        -- `enabled = true` only says this SERVER has the terminals. Which of them a given player
        -- sees is decided per open by server/appgate.lua, from the departments in configs/mdt.lua:
        -- a `leo` department gets `mdt`, `ems` gets `emsmdt`, `doj` gets `dojmdt`, and anyone else
        -- gets no icon rather than one that refuses them. That gate is asked fresh on every open,
        -- by both devices, so a job change is picked up with no event to miss.
        --
        -- `Enabled` in configs/mdt.lua outranks these rows and ships OFF, so all three are hidden
        -- everywhere and no terminal tables are built until you turn it on. Leaving these rows at
        -- `enabled = true` costs nothing while it is off.
        --
        -- Keep `base = true`. The job gate is what hands a terminal out, so there is nothing to
        -- download; `base = false` would strand it behind an App Store entry instead.
        { id = 'mdt', label = 'MDT', icon = 'mdt', route = '/mdt', accent = '#1D4ED8', base = true, enabled = true },
        { id = 'emsmdt', label = 'EMS', icon = 'emsmdt', route = '/emsmdt', accent = '#E11D48', base = true, enabled = true },
        { id = 'dojmdt', label = 'DOJ', icon = 'dojmdt', route = '/dojmdt', accent = '#6D28D9', base = true, enabled = true },

        -- Racing runs on both devices too, and unlike the terminals it carries no job gate. Its
        -- backend has its own switch, `Enabled` in configs/racing.lua; with that off this row shows
        -- an app with nothing behind it, so turn both off together.
        --
        -- It ships earned rather than given: `consume` means using a `racing_usb` spends the item
        -- and installs the board on that character for good. The item has to exist in your inventory
        -- config or nobody can unlock it - see the snippet in the header above, and drop `requires`
        -- entirely if you would rather every player just have it.
        { id = 'racing', label = 'Racing', icon = 'racing', route = '/racing', accent = '#0A8C72', base = true, enabled = true, requires = { item = 'racing_usb', consume = true } },

        -- `base = false` rows are the App Store's catalog; flip one to `true` to ship it installed
        -- instead. `wifi` only means anything on a downloadable row, since it gates the download:
        -- { id = 'darkchat', label = 'Dark Chat', icon = 'darkchat', route = '/darkchat', accent = '#1c1c1e', base = false, enabled = true, wifi = 'mazebank' },

        -- `requires` examples, none of them live - copy the tail of one onto a real row.
        -- { id = 'darkchat', ..., requires = { item = 'burner_phone' } },
        -- { id = 'stocks',   ..., requires = { metadata = { vip = true } } },
        -- { id = 'mdt',      ..., requires = { jobs = { police = 3, ambulance = 0 } } },
        -- { id = 'darkchat', ..., requires = { check = 'myserver.canSeeDarkweb' } },
        -- { id = 'health',   ..., requires = { item = 'health_usb', consume = true } },

        -- A `consume` gate spends the item itself, so leave `consume = 0` on the ox_inventory entry
        -- and point it at the export the phone makes - `health_usb` becomes `sd-phone.useHealth_usb`:
        --   ['health_usb'] = { label = 'Medical Data Key', stack = false, close = true,
        --                      consume = 0, server = { export = 'sd-phone.useHealth_usb' } },
        -- With no `item` at all, hand it out yourself: exports['sd-phone']:unlockApp(source, appId).
    },
}
