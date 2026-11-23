import { appLabel, getCatalogVersion, t } from '@/i18n';
import type { IconTexture, IconThemeDraft } from '@/stores/iconThemeStore';

export interface ThemeApp {
    id:     string;
    label:  string;
    icon:   string;
    accent: string;
}

const APP_DEFS: ThemeApp[] = [
    { id: 'phone',       label: 'Phone',        icon: 'phone',       accent: '#34c759' },
    { id: 'messages',    label: 'Messages',     icon: 'messages',    accent: '#34c759' },
    { id: 'mail',        label: 'Mail',         icon: 'mail',        accent: '#0a84ff' },
    { id: 'maps',        label: 'Maps',         icon: 'maps',        accent: '#f0c43a' },
    { id: 'compass',     label: 'Compass',      icon: 'compass',     accent: '#1c1c1e' },
    { id: 'camera',      label: 'Camera',       icon: 'camera',      accent: '#1c1c1e' },
    { id: 'photos',      label: 'Photos',       icon: 'photos',      accent: '#ffffff' },
    { id: 'music',       label: 'Music',        icon: 'music',       accent: '#fa233b' },
    { id: 'weather',     label: 'Weather',      icon: 'weather',     accent: '#5ac8fa' },
    { id: 'clock',       label: 'Clock',        icon: 'clock',       accent: '#1c1c1e' },
    { id: 'calendar',    label: 'Calendar',     icon: 'calendar',    accent: '#ffffff' },
    { id: 'notes',       label: 'Notes',        icon: 'notes',       accent: '#fec547' },
    { id: 'voicememos',  label: 'Voice Memos',  icon: 'voicememos',  accent: '#ff3b30' },
    { id: 'bank',        label: 'Bank',         icon: 'bank',        accent: '#00b894' },
    { id: 'health',      label: 'Health',       icon: 'health',      accent: '#ff2d55' },
    { id: 'documents',   label: 'Files',        icon: 'documents',   accent: '#3478f6' },
    { id: 'id',          label: 'ID',           icon: 'id',          accent: '#2c3440' },
    { id: 'groups',      label: 'Groups',       icon: 'groups',      accent: '#6c63ff' },
    { id: 'birdy',       label: 'Squawk',       icon: 'birdy',       accent: '#1d9bf0' },
    { id: 'services',    label: 'Services',     icon: 'services',    accent: '#16b8a6' },
    { id: 'pages',       label: 'Pages',        icon: 'pages',       accent: '#fbc02d' },
    { id: 'marketplace', label: 'Marketplace',  icon: 'marketplace', accent: '#0a84ff' },
    { id: 'mdt',         label: 'MDT',          icon: 'mdt',         accent: '#1d4ed8' },
    { id: 'emsmdt',      label: 'EMS',          icon: 'emsmdt',      accent: '#e11d48' },
    { id: 'dojmdt',      label: 'DOJ',          icon: 'dojmdt',      accent: '#6d28d9' },
    { id: 'racing',      label: 'Racing',         icon: 'racing',      accent: '#0bf2b4' },
    { id: 'darkchat',    label: 'Dark Chat',    icon: 'darkchat',    accent: '#1c1c1e' },
    { id: 'cherry',      label: 'Cherry',       icon: 'cherry',      accent: '#f0285a' },
    { id: 'photogram',   label: 'Photogram',    icon: 'photogram',   accent: '#d62976' },
    { id: 'garages',     label: 'Garages',      icon: 'garages',     accent: '#6e5cf2' },
    { id: 'homes',       label: 'Homes',        icon: 'homes',       accent: '#12b866' },
    { id: 'ryde',        label: 'Ryde',         icon: 'ryde',        accent: '#1c1c1e' },
    { id: 'radio',       label: 'Radio',        icon: 'radio',       accent: '#30b0c7' },
    { id: 'stocks',      label: 'Stocks',       icon: 'stocks',      accent: '#16c784' },
    { id: 'settings',    label: 'Settings',     icon: 'settings',    accent: '#8e8e93' },
    { id: 'appstore',    label: 'App Store',    icon: 'appstore',    accent: '#0a84ff' },
    { id: 'calculator',  label: 'Calculator',   icon: 'calculator',  accent: '#333335' },
    { id: 'passwords',   label: 'Passwords',    icon: 'passwords',   accent: '#1c1c1e' },
    { id: 'cookie',      label: 'Cookie',       icon: 'cookie',      accent: '#c77d2e' },
    { id: 'wordle',      label: 'Penta',        icon: 'wordle',      accent: '#6aaa64' },
    { id: 'flappy',      label: 'Flappy',       icon: 'flappy',      accent: '#4ec0ca' },
    { id: 'blocks',      label: 'Blocks',       icon: 'blocks',      accent: '#7c4dff' },
    { id: 'minesweeper', label: 'Minesweeper',  icon: 'minesweeper', accent: '#e4483d' },
    { id: 'casino',      label: 'Casino',       icon: 'casino',      accent: '#0f5132' },
    { id: 'climber',     label: 'Climber',      icon: 'climber',     accent: '#8bc34a' },
    { id: 'connectfour', label: 'Connect 4',    icon: 'connectfour', accent: '#1e66d0' },
    { id: 'chess',       label: 'Chess',        icon: 'chess',       accent: '#3b3b3b' },
    { id: 'battleship',  label: 'Battleship',   icon: 'battleship',  accent: '#17a0b5' },
    { id: 'vibez',       label: 'Clout',        icon: 'vibez',       accent: '#a855f7' },
    { id: 'weazelnews',  label: 'Weazel News',  icon: 'weazelnews',  accent: '#c8102e' },
    { id: 'streaks',     label: 'Streaks',      icon: 'streaks',     accent: '#ff7a1a' },
];

export const THEME_APPS: ThemeApp[] = APP_DEFS
    .map(def => ({ ...def, get label() { return appLabel(def); } }))
    .sort((a, b) => a.label.localeCompare(b.label));

const PREVIEW_IDS = ['phone', 'mail', 'maps', 'music', 'weather', 'notes', 'photogram', 'settings'];

export const PREVIEW_APPS: ThemeApp[] = PREVIEW_IDS
    .map(id => THEME_APPS.find(app => app.id === id))
    .filter((app): app is ThemeApp => app !== undefined);

export const SWATCH_PREVIEW_APPS: ThemeApp[] = PREVIEW_APPS.slice(0, 3);

export const GLYPH_NAMES: string[] = [
    'appstore', 'appstore_cloud', 'appstore_download', 'appstore_gift', 'bank', 'bank_coins',
    'bank_piggy', 'bank_vault', 'battleship', 'birdy', 'birdy_egg', 'birdy_hash', 'birdy_megaphone',
    'blackjack', 'blocks', 'blocks_box', 'blocks_layers', 'blocks_puzzle', 'blocks_wall',
    'calc_divide', 'calc_percent', 'calc_plus', 'calculator', 'calendar', 'calendar_check',
    'calendar_clock', 'calendar_range', 'camera', 'camera_flash', 'camera_lens', 'camera_switch',
    'cards_club', 'cards_deck', 'cards_diamond', 'cards_dice', 'casino', 'cherry', 'cherry_fruit',
    'cherry_hands', 'cherry_rose', 'cherry_spark', 'chess', 'chess_brain', 'chess_castle',
    'chess_shield', 'chess_swords', 'climber', 'climber_flag', 'climber_snow', 'climber_trees',
    'clock', 'clock_alarm', 'clock_hourglass', 'clock_timer', 'compass', 'compass_crosshair',
    'compass_locate', 'compass_needle', 'connectfour', 'cookie', 'cookie_cake', 'cookie_candy',
    'cookie_donut', 'cookie_icecream', 'darkchat', 'darkchat_hidden', 'darkchat_lock',
    'darkchat_shield', 'darkchat_skull', 'documents', 'files_archive', 'files_clip', 'files_file',
    'files_folder_open', 'findfriends', 'flappy', 'flappy_cloudy', 'flappy_joystick',
    'flappy_rocket', 'four_columns', 'four_dot', 'four_target', 'friends_satellite', 'friends_scan',
    'friends_search', 'garage_bike', 'garage_car', 'garage_truck', 'garages', 'groups',
    'groups_contact', 'groups_person', 'groups_round', 'health', 'health_activity',
    'health_dumbbell', 'health_pill', 'health_stethoscope', 'home_bed', 'home_building',
    'home_door', 'homes', 'id', 'id_badge', 'id_finger', 'id_scan', 'id_user', 'mail', 'mail_box',
    'mail_inbox', 'mail_open', 'map_navigation',
    'map_pin', 'map_pinned', 'map_route', 'maps', 'market_basket', 'market_cart', 'market_package',
    'market_tag', 'marketplace', 'mdt', 'emsmdt', 'dojmdt', 'message_bubble', 'message_more', 'message_send',
    'message_text',
    'messages', 'minesweeper', 'minesweeper_flag', 'minesweeper_grid', 'music', 'music_disc', 'music_headphones', 'music_playlist', 'music_wave',
    'news_earth', 'news_podcast', 'news_rss', 'news_tv', 'notes', 'notes_list', 'notes_notebook',
    'notes_pen', 'pages', 'pages_book', 'pages_bookmark', 'pages_scroll', 'pass_finger', 'pass_key',
    'pass_lock', 'pass_shield', 'passwords', 'phone', 'phone_call', 'phone_headset',
    'phone_incoming', 'phone_outgoing', 'photogram', 'photogram_film', 'photogram_gallery',
    'photogram_grid', 'photogram_sparkles', 'photos', 'photos_frame', 'photos_gallery',
    'photos_images', 'racing', 'radio', 'radio_antenna', 'radio_boombox', 'radio_speaker',
    'radio_tower',
    'rail_ticket', 'rail_track', 'rail_tram', 'review', 'review_half', 'review_medal',
    'review_thumb', 'ryde', 'ryde_bus', 'ryde_taxi', 'ryde_waypoints', 'safari', 'safari_bookmark',
    'safari_link', 'safari_search', 'safari_window', 'services', 'services_badge',
    'services_hammer', 'services_hardhat', 'settings', 'settings_cog', 'settings_sliders',
    'settings_toggle', 'settings_wrench', 'ship_anchor', 'ship_sail', 'ship_waves', 'ship_wheel',
    'stocks', 'stocks_bars', 'stocks_candles', 'stocks_down',
    'stocks_line', 'streaks', 'streaks_calendar', 'streaks_check', 'streaks_kindling', 'vibez',
    'vibez_clapper', 'vibez_play', 'vibez_tv', 'voice_lines', 'voice_mailbox', 'voice_vocal',
    'voicememos', 'wallet', 'wallet_card', 'wallet_cash', 'wallet_coin', 'wallet_receipt',
    'weather', 'weather_cloud', 'weather_rain', 'weather_snow', 'weather_sun', 'weazelnews',
    'wordle', 'wordle_grid', 'wordle_spell', 'wordle_type',
];

let glyphLabelCache: Record<string, string> | null = null;
let glyphLabelCacheVersion = -1;

function glyphLabels(): Record<string, string> {
    const version = getCatalogVersion();
    if (glyphLabelCache && glyphLabelCacheVersion === version) return glyphLabelCache;
    glyphLabelCacheVersion = version;
    glyphLabelCache = {
        appstore_cloud:     t('settings.glyphAppstoreCloud', 'Cloud Download'),
        appstore_download:  t('settings.glyphAppstoreDownload', 'Download'),
        appstore_gift:      t('settings.glyphAppstoreGift', 'Gift'),
        bank_coins:         t('settings.glyphBankCoins', 'Coins'),
        bank_piggy:         t('settings.glyphBankPiggy', 'Piggy Bank'),
        bank_vault:         t('settings.glyphBankVault', 'Vault'),
        birdy_egg:          t('settings.glyphBirdyEgg', 'Egg'),
        birdy_hash:         t('settings.glyphBirdyHash', 'Hashtag'),
        birdy_megaphone:    t('settings.glyphBirdyMegaphone', 'Megaphone'),
        blocks_box:         t('settings.glyphBlocksBox', 'Box'),
        blocks_layers:      t('settings.glyphBlocksLayers', 'Layers'),
        blocks_puzzle:      t('settings.glyphBlocksPuzzle', 'Puzzle Piece'),
        blocks_wall:        t('settings.glyphBlocksWall', 'Brick Wall'),
        calc_divide:        t('settings.glyphCalcDivide', 'Divide'),
        calc_percent:       t('settings.glyphCalcPercent', 'Percent'),
        calc_plus:          t('settings.glyphCalcPlus', 'Plus'),
        calendar_check:     t('settings.glyphCalendarCheck', 'Booked Day'),
        calendar_clock:     t('settings.glyphCalendarClock', 'Scheduled'),
        calendar_range:     t('settings.glyphCalendarRange', 'Date Range'),
        camera_flash:       t('settings.glyphCameraFlash', 'Camera Flash'),
        camera_lens:        t('settings.glyphCameraLens', 'Camera Lens'),
        camera_switch:      t('settings.glyphCameraSwitch', 'Flip Camera'),
        cards_club:         t('settings.glyphCardsClub', 'Card Club'),
        cards_deck:         t('settings.glyphCardsDeck', 'Card Deck'),
        cards_diamond:      t('settings.glyphCardsDiamond', 'Card Diamond'),
        cards_dice:         t('settings.glyphCardsDice', 'Dice'),
        cherry_fruit:       t('settings.glyphCherryFruit', 'Cherries'),
        cherry_hands:       t('settings.glyphCherryHands', 'Caring Heart'),
        cherry_rose:        t('settings.glyphCherryRose', 'Flower'),
        cherry_spark:       t('settings.glyphCherrySpark', 'Spark'),
        chess_brain:        t('settings.glyphChessBrain', 'Brain'),
        chess_castle:       t('settings.glyphChessCastle', 'Castle'),
        chess_shield:       t('settings.glyphChessShield', 'Half Shield'),
        chess_swords:       t('settings.glyphChessSwords', 'Swords'),
        climber_flag:       t('settings.glyphClimberFlag', 'Summit Flag'),
        climber_snow:       t('settings.glyphClimberSnow', 'Snowy Peak'),
        climber_trees:      t('settings.glyphClimberTrees', 'Trees'),
        clock_alarm:        t('settings.glyphClockAlarm', 'Alarm Clock'),
        clock_hourglass:    t('settings.glyphClockHourglass', 'Hourglass'),
        clock_timer:        t('settings.glyphClockTimer', 'Timer'),
        compass_crosshair:  t('settings.glyphCompassCrosshair', 'Crosshair'),
        compass_locate:     t('settings.glyphCompassLocate', 'Locate Me'),
        compass_needle:     t('settings.glyphCompassNeedle', 'Compass Needle'),
        cookie_cake:        t('settings.glyphCookieCake', 'Cake Slice'),
        cookie_candy:       t('settings.glyphCookieCandy', 'Candy'),
        cookie_donut:       t('settings.glyphCookieDonut', 'Donut'),
        cookie_icecream:    t('settings.glyphCookieIcecream', 'Ice Cream'),
        darkchat_hidden:    t('settings.glyphDarkchatHidden', 'Hidden Eye'),
        darkchat_lock:      t('settings.glyphDarkchatLock', 'Padlock'),
        darkchat_shield:    t('settings.glyphDarkchatShield', 'Shield Check'),
        darkchat_skull:     t('settings.glyphDarkchatSkull', 'Skull'),
        files_archive:      t('settings.glyphFilesArchive', 'Archive'),
        files_clip:         t('settings.glyphFilesClip', 'Paperclip'),
        files_file:         t('settings.glyphFilesFile', 'Document'),
        files_folder_open:  t('settings.glyphFilesFolderOpen', 'Open Folder'),
        findfriends:        t('settings.glyphFindfriends', 'Find Friends'),
        flappy_cloudy:      t('settings.glyphFlappyCloudy', 'Clouds'),
        flappy_joystick:    t('settings.glyphFlappyJoystick', 'Joystick'),
        flappy_rocket:      t('settings.glyphFlappyRocket', 'Rocket'),
        four_columns:       t('settings.glyphFourColumns', 'Four Columns'),
        four_dot:           t('settings.glyphFourDot', 'Counter'),
        four_target:        t('settings.glyphFourTarget', 'Target'),
        friends_satellite:  t('settings.glyphFriendsSatellite', 'Satellite'),
        friends_scan:       t('settings.glyphFriendsScan', 'Scan Area'),
        friends_search:     t('settings.glyphFriendsSearch', 'Find Person'),
        garage_bike:        t('settings.glyphGarageBike', 'Bicycle'),
        garage_car:         t('settings.glyphGarageCar', 'Car Front'),
        garage_truck:       t('settings.glyphGarageTruck', 'Truck'),
        groups_contact:     t('settings.glyphGroupsContact', 'Contact Card'),
        groups_person:      t('settings.glyphGroupsPerson', 'Person'),
        groups_round:       t('settings.glyphGroupsRound', 'People'),
        health_activity:    t('settings.glyphHealthActivity', 'Activity'),
        health_dumbbell:    t('settings.glyphHealthDumbbell', 'Dumbbell'),
        health_pill:        t('settings.glyphHealthPill', 'Pill'),
        health_stethoscope: t('settings.glyphHealthStethoscope', 'Stethoscope'),
        home_bed:           t('settings.glyphHomeBed', 'Bed'),
        home_building:      t('settings.glyphHomeBuilding', 'Building'),
        home_door:          t('settings.glyphHomeDoor', 'Open Door'),
        id_badge:           t('settings.glyphIdBadge', 'Badge'),
        id_finger:          t('settings.glyphIdFinger', 'Fingerprint'),
        id_scan:            t('settings.glyphIdScan', 'Face Scan'),
        id_user:            t('settings.glyphIdUser', 'Portrait'),
        mail_box:           t('settings.glyphMailBox', 'Mailbox'),
        mail_inbox:         t('settings.glyphMailInbox', 'Inbox'),
        mail_open:          t('settings.glyphMailOpen', 'Open Envelope'),
        map_navigation:     t('settings.glyphMapNavigation', 'Navigation'),
        minesweeper_flag:   t('settings.glyphMinesweeperFlag', 'Flag'),
        minesweeper_grid:   t('settings.glyphMinesweeperGrid', 'Grid'),
        map_pin:            t('settings.glyphMapPin', 'Map Pin'),
        map_pinned:         t('settings.glyphMapPinned', 'Pinned Map'),
        map_route:          t('settings.glyphMapRoute', 'Route'),
        market_basket:      t('settings.glyphMarketBasket', 'Basket'),
        market_cart:        t('settings.glyphMarketCart', 'Shopping Cart'),
        market_package:     t('settings.glyphMarketPackage', 'Package'),
        market_tag:         t('settings.glyphMarketTag', 'Price Tag'),
        message_bubble:     t('settings.glyphMessageBubble', 'Speech Bubble'),
        message_more:       t('settings.glyphMessageMore', 'Chat Bubble'),
        message_send:       t('settings.glyphMessageSend', 'Send Message'),
        message_text:       t('settings.glyphMessageText', 'Text Message'),
        music_disc:         t('settings.glyphMusicDisc', 'Record'),
        music_headphones:   t('settings.glyphMusicHeadphones', 'Headphones'),
        music_playlist:     t('settings.glyphMusicPlaylist', 'Playlist'),
        music_wave:         t('settings.glyphMusicWave', 'Waveform'),
        news_earth:         t('settings.glyphNewsEarth', 'Globe'),
        news_podcast:       t('settings.glyphNewsPodcast', 'Podcast'),
        news_rss:           t('settings.glyphNewsRss', 'News Feed'),
        news_tv:            t('settings.glyphNewsTv', 'News Screen'),
        notes_list:         t('settings.glyphNotesList', 'Checklist'),
        notes_notebook:     t('settings.glyphNotesNotebook', 'Notebook'),
        notes_pen:          t('settings.glyphNotesPen', 'Pen'),
        pages_book:         t('settings.glyphPagesBook', 'Book'),
        pages_bookmark:     t('settings.glyphPagesBookmark', 'Marked Book'),
        pages_scroll:       t('settings.glyphPagesScroll', 'Scroll'),
        pass_finger:        t('settings.glyphPassFinger', 'Fingerprint'),
        pass_key:           t('settings.glyphPassKey', 'Key'),
        pass_lock:          t('settings.glyphPassLock', 'Lock'),
        pass_shield:        t('settings.glyphPassShield', 'Shield'),
        phone_call:         t('settings.glyphPhoneCall', 'Phone Call'),
        phone_headset:      t('settings.glyphPhoneHeadset', 'Headset'),
        phone_incoming:     t('settings.glyphPhoneIncoming', 'Incoming Call'),
        phone_outgoing:     t('settings.glyphPhoneOutgoing', 'Outgoing Call'),
        photogram_film:     t('settings.glyphPhotogramFilm', 'Film Reel'),
        photogram_gallery:  t('settings.glyphPhotogramGallery', 'Photo Deck'),
        photogram_grid:     t('settings.glyphPhotogramGrid', 'Photo Grid'),
        photogram_sparkles: t('settings.glyphPhotogramSparkles', 'Sparkles'),
        photos_frame:       t('settings.glyphPhotosFrame', 'Picture Frame'),
        photos_gallery:     t('settings.glyphPhotosGallery', 'Photo Gallery'),
        photos_images:      t('settings.glyphPhotosImages', 'Photo Stack'),
        radio_antenna:      t('settings.glyphRadioAntenna', 'Antenna'),
        radio_boombox:      t('settings.glyphRadioBoombox', 'Boombox'),
        radio_speaker:      t('settings.glyphRadioSpeaker', 'Speaker'),
        radio_tower:        t('settings.glyphRadioTower', 'Radio Tower'),
        rail_ticket:        t('settings.glyphRailTicket', 'Ticket'),
        rail_track:         t('settings.glyphRailTrack', 'Train Track'),
        rail_tram:          t('settings.glyphRailTram', 'Tram'),
        review_half:        t('settings.glyphReviewHalf', 'Half Star'),
        review_medal:       t('settings.glyphReviewMedal', 'Medal'),
        review_thumb:       t('settings.glyphReviewThumb', 'Thumbs Up'),
        ryde_bus:           t('settings.glyphRydeBus', 'Bus'),
        ryde_taxi:          t('settings.glyphRydeTaxi', 'Taxi'),
        ryde_waypoints:     t('settings.glyphRydeWaypoints', 'Waypoints'),
        safari:             'Safari',
        safari_bookmark:    t('settings.glyphSafariBookmark', 'Bookmark'),
        safari_link:        t('settings.glyphSafariLink', 'Link'),
        safari_search:      t('settings.glyphSafariSearch', 'Search'),
        safari_window:      t('settings.glyphSafariWindow', 'Browser Window'),
        services_badge:     t('settings.glyphServicesBadge', 'Verified Badge'),
        services_hammer:    t('settings.glyphServicesHammer', 'Hammer'),
        services_hardhat:   t('settings.glyphServicesHardhat', 'Hard Hat'),
        settings_cog:       t('settings.glyphSettingsCog', 'Cog'),
        settings_sliders:   t('settings.glyphSettingsSliders', 'Sliders'),
        settings_toggle:    t('settings.glyphSettingsToggle', 'Toggle'),
        settings_wrench:    t('settings.glyphSettingsWrench', 'Wrench'),
        ship_anchor:        t('settings.glyphShipAnchor', 'Anchor'),
        ship_sail:          t('settings.glyphShipSail', 'Sailboat'),
        ship_waves:         t('settings.glyphShipWaves', 'Waves'),
        ship_wheel:         t('settings.glyphShipWheel', 'Ship Wheel'),
        stocks_bars:        t('settings.glyphStocksBars', 'Bar Chart'),
        stocks_candles:     t('settings.glyphStocksCandles', 'Candlesticks'),
        stocks_down:        t('settings.glyphStocksDown', 'Trending Down'),
        stocks_line:        t('settings.glyphStocksLine', 'Line Chart'),
        streaks_calendar:   t('settings.glyphStreaksCalendar', 'Streak Day'),
        streaks_check:      t('settings.glyphStreaksCheck', 'Day Complete'),
        streaks_kindling:   t('settings.glyphStreaksKindling', 'Campfire'),
        vibez_clapper:      t('settings.glyphVibezClapper', 'Clapperboard'),
        vibez_play:         t('settings.glyphVibezPlay', 'Play'),
        vibez_tv:           t('settings.glyphVibezTv', 'Television'),
        voice_lines:        t('settings.glyphVoiceLines', 'Audio Lines'),
        voice_mailbox:      t('settings.glyphVoiceMailbox', 'Voicemail'),
        voice_vocal:        t('settings.glyphVoiceVocal', 'Vocal Mic'),
        wallet:             t('settings.glyphWallet', 'Wallet'),
        wallet_card:        t('settings.glyphWalletCard', 'Bank Card'),
        wallet_cash:        t('settings.glyphWalletCash', 'Banknote'),
        wallet_coin:        t('settings.glyphWalletCoin', 'Coin'),
        wallet_receipt:     t('settings.glyphWalletReceipt', 'Receipt'),
        weather_cloud:      t('settings.glyphWeatherCloud', 'Cloud'),
        weather_rain:       t('settings.glyphWeatherRain', 'Rain'),
        weather_snow:       t('settings.glyphWeatherSnow', 'Snowflake'),
        weather_sun:        t('settings.glyphWeatherSun', 'Sun'),
        wordle_grid:        t('settings.glyphWordleGrid', 'Letter Grid'),
        wordle_spell:       t('settings.glyphWordleSpell', 'Spell Check'),
        wordle_type:        t('settings.glyphWordleType', 'Letters'),
    };
    return glyphLabelCache;
}

export function glyphLabel(name: string): string {
    const known = THEME_APPS.find(app => app.icon === name);
    if (known) return known.label;
    return glyphLabels()[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

export const APP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

export const RADIUS_SQUIRCLE = 0.276;

export function radiusChoices(): { value: number; label: string }[] {
    return [
        { value: RADIUS_SQUIRCLE, label: t('settings.iconShapeSquircle', 'Squircle') },
        { value: 0.14,            label: t('settings.iconShapeRounded', 'Rounded') },
        { value: 0.5,             label: t('settings.iconShapeCircle', 'Circle') },
        { value: 0.04,            label: t('settings.iconShapeSquared', 'Squared') },
    ];
}

export function textureChoices(): { value: IconTexture; label: string }[] {
    return [
        { value: 'none',    label: t('settings.iconTextureNone', 'None') },
        { value: 'noise',   label: t('settings.iconTextureNoise', 'Grain') },
        { value: 'dots',    label: t('settings.iconTextureDots', 'Dots') },
        { value: 'stripes', label: t('settings.iconTextureStripes', 'Lines') },
    ];
}

export const SWATCHES = [
    '#ffffff', '#f4f4f6', '#d1d1d6', '#8e8e93', '#48484a', '#26262a', '#0a0a0c', '#000000',
    '#ff453a', '#ff6482', '#ff9f0a', '#ffd60a', '#e8dcc4', '#ac8e68', '#8b5e3c', '#5c3d2e',
    '#34c759', '#00c7be', '#5ac8fa', '#0a84ff', '#5e5ce6', '#bf5af2', '#39414f', '#1f3a5f',
];

export interface ThemePreset {
    id:    string;
    label: string;
    hint:  string;
    seed:  IconThemeDraft;
}

export function themePresets(): ThemePreset[] {
    return [
        {
            id:    'flat',
            label: t('settings.iconPresetFlat', 'Flat'),
            hint:  t('settings.iconPresetFlatHint', 'A plain tile in each app colour'),
            seed:  {
                background: { from: 'accent' },
                glyph:      { from: 'fixed', color: '#ffffff' },
            },
        },
        {
            id:    'glass',
            label: t('settings.iconPresetGlass', 'Glass'),
            hint:  t('settings.iconPresetGlassHint', 'Lit and glossy, the classic look'),
            seed:  {
                background: { from: 'accent' },
                glyph:      { from: 'fixed', color: '#ffffff' },
                depth:      true,
            },
        },
        {
            id:    'gradient',
            label: t('settings.iconPresetGradient', 'Gradient'),
            hint:  t('settings.iconPresetGradientHint', 'Each colour fading into shadow'),
            seed:  {
                background:  { from: 'accent' },
                background2: { from: 'accent', toward: '#0f0f12', amount: 0.55 },
                angle:       160,
                gloss:       0.35,
                glyph:       { from: 'fixed', color: '#ffffff' },
            },
        },
        {
            id:    'neon',
            label: t('settings.iconPresetNeon', 'Neon'),
            hint:  t('settings.iconPresetNeonHint', 'Black tiles with a lit outline'),
            seed:  {
                background: { from: 'fixed', color: '#0a0a0c' },
                glyph:      { from: 'accent', toward: '#ffffff', amount: 0.24 },
                border:     { color: { from: 'accent' }, width: 1 },
                glow:       0.7,
                saturation: 1.3,
            },
        },
        {
            id:    'paper',
            label: t('settings.iconPresetPaper', 'Paper'),
            hint:  t('settings.iconPresetPaperHint', 'Off-white cards with a printed grain'),
            seed:  {
                background: { from: 'fixed', color: '#f4f4f6' },
                glyph:      { from: 'accent', toward: '#1b1b1f', amount: 0.36 },
                radius:     0.14,
                texture:    'dots',
                border:     { color: { from: 'fixed', color: '#d1d1d6' }, width: 1 },
                glyphScale: 0.92,
            },
        },
        {
            id:    'ink',
            label: t('settings.iconPresetInk', 'Ink'),
            hint:  t('settings.iconPresetInkHint', 'Every app colour drained to graphite'),
            seed:  {
                background:  { from: 'accent', toward: '#141418', amount: 0.5 },
                glyph:       { from: 'fixed', color: '#f5f5f7' },
                saturation:  0,
                radius:      0.04,
                glyphWeight: 2.2,
            },
        },
    ];
}
