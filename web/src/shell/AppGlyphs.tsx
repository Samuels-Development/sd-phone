import {
    Activity, AlarmClock, Anchor, Antenna, Aperture, AppWindow, Archive, AudioLines, AudioWaveform,
    BadgeCheck, Banknote, BedDouble, Bike, Bird, Blocks, Book, Bookmark, BookMarked, BookOpen,
    Bomb, BoomBox, Box, Brain, BrickWall, Briefcase, Building, Bus, CakeSlice, Calculator, CalendarCheck,
    CalendarClock, CalendarDays, CalendarPlus, CalendarRange, Camera, Candy, Car, CarFront,
    CarTaxiFront, Castle, ChartBar, ChartCandlestick, ChartLine, Cherry, CircleCheckBig,
    CircleDollarSign, CircleDot, Clapperboard, Clock, Cloud, CloudDownload, CloudRain, CloudSun,
    Cloudy, Club, Cog, Coins, Columns4, Compass, Contact, Cookie, CreditCard, Crosshair, Crown,
    Diamond, Dices, Disc3, Divide, Donut, DoorOpen, Download, Dumbbell, Earth, Egg, EyeOff,
    FileText, Film, FingerprintPattern, Flag, Flame, FlameKindling, Flower2, Focus, Folder,
    FolderOpen, Frame, GalleryHorizontalEnd, GalleryVerticalEnd, Gamepad2, Gift, Globe, Grid2x2,
    Grid3x3, Hammer, HardHat, Hash, Headphones, Headset, Heart, HeartHandshake, HeartPulse,
    Hourglass, House, IceCreamCone, IdCard, Image as ImageIcon, Images, Inbox, Joystick, Key, KeyRound,
    Landmark, Layers, Layers2, LayoutGrid, Link, ListMusic, ListTodo, LocateFixed, Lock,
    LockKeyhole, Mail, Mailbox, MailOpen, Map, MapPin, MapPinned, Medal, Megaphone, MessageCircle,
    MessageCircleMore, MessageSquare, MessageSquareText, MessagesSquare, Mic, MicVocal, Mountain,
    MountainSnow, Music, Navigation, Navigation2, Newspaper, Notebook, Package, Paperclip, PenLine,
    Percent, Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, PiggyBank, Pill, Play, Plus, Podcast,
    Puzzle, Radar, Radio, RadioTower, ReceiptText, Rocket, Route, Rss, Sailboat, Satellite,
    ScanFace, ScanSearch, ScrollText, Search, Send, Settings, Shield, ShieldCheck, ShieldHalf, Ship,
    ShipWheel, ShoppingBag, ShoppingBasket, ShoppingCart, Skull, SlidersHorizontal, Snowflake,
    Spade, Sparkle, Sparkles, Speaker, SpellCheck, Star, StarHalf, Stethoscope, StickyNote, Store,
    Sun, SwitchCamera, Swords, Tag, Target, ThumbsUp, Ticket, Timer, ToggleRight,
    TrainTrack, TramFront, Trees, TrendingDown, TrendingUp, Truck, Tv, TvMinimal, Type, UserRound,
    Users, UserSearch, UsersRound, Vault, Video, Voicemail, Wallet, Warehouse, Waves, Waypoints,
    Wrench, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const APP_GLYPHS: Record<string, LucideIcon> = {
    phone:       Phone,
    messages:    MessageCircle,
    services:    Briefcase,
    pages:       BookOpen,
    review:      Star,
    marketplace: Store,
    radio:       Radio,
    mail:        Mail,
    safari:      Globe,
    compass:     Compass,
    maps:        Map,
    findfriends: Radar,
    stocks:      TrendingUp,
    ryde:        Car,
    camera:      Camera,
    photos:      ImageIcon,
    music:       Music,
    wallet:      Wallet,
    weather:     CloudSun,
    clock:       Clock,
    calendar:    CalendarDays,
    notes:       StickyNote,
    documents:   Folder,
    id:          IdCard,
    voicememos:  Mic,
    bank:        Landmark,
    settings:    Settings,
    appstore:    ShoppingBag,
    health:      HeartPulse,
    groups:      Users,
    calculator:  Calculator,
    birdy:       Bird,
    darkchat:    MessagesSquare,
    cherry:      Heart,
    photogram:   Aperture,
    garages:     Warehouse,
    homes:       House,
    cookie:      Cookie,
    passwords:   KeyRound,
    wordle:      LayoutGrid,
    flappy:      Gamepad2,
    blocks:      Blocks,
    minesweeper: Bomb,
    minesweeper_flag: Flag,
    minesweeper_grid: Grid3x3,
    blackjack:   Spade,
    casino:      Dices,
    climber:     Mountain,
    connectfour: Gamepad2,
    chess:       Crown,
    battleship:  Ship,
    vibez:       Video,
    weazelnews:  Newspaper,
    streaks:     Flame,
    mdt:         Shield,
    emsmdt:      HeartPulse,
    dojmdt:      Landmark,
    racing:      Flag,

    appstore_cloud:     CloudDownload,
    appstore_download:  Download,
    appstore_gift:      Gift,
    bank_coins:         Coins,
    bank_piggy:         PiggyBank,
    bank_vault:         Vault,
    birdy_egg:          Egg,
    birdy_hash:         Hash,
    birdy_megaphone:    Megaphone,
    blocks_box:         Box,
    blocks_layers:      Layers,
    blocks_puzzle:      Puzzle,
    blocks_wall:        BrickWall,
    calc_divide:        Divide,
    calc_percent:       Percent,
    calc_plus:          Plus,
    calendar_check:     CalendarCheck,
    calendar_clock:     CalendarClock,
    calendar_range:     CalendarRange,
    camera_flash:       Zap,
    camera_lens:        Focus,
    camera_switch:      SwitchCamera,
    cards_club:         Club,
    cards_deck:         Layers2,
    cards_diamond:      Diamond,
    cards_dice:         Dices,
    cherry_fruit:       Cherry,
    cherry_hands:       HeartHandshake,
    cherry_rose:        Flower2,
    cherry_spark:       Sparkle,
    chess_brain:        Brain,
    chess_castle:       Castle,
    chess_shield:       ShieldHalf,
    chess_swords:       Swords,
    climber_flag:       Flag,
    climber_snow:       MountainSnow,
    climber_trees:      Trees,
    clock_alarm:        AlarmClock,
    clock_hourglass:    Hourglass,
    clock_timer:        Timer,
    compass_crosshair:  Crosshair,
    compass_locate:     LocateFixed,
    compass_needle:     Navigation2,
    cookie_cake:        CakeSlice,
    cookie_candy:       Candy,
    cookie_donut:       Donut,
    cookie_icecream:    IceCreamCone,
    darkchat_hidden:    EyeOff,
    darkchat_lock:      LockKeyhole,
    darkchat_shield:    ShieldCheck,
    darkchat_skull:     Skull,
    files_archive:      Archive,
    files_clip:         Paperclip,
    files_file:         FileText,
    files_folder_open:  FolderOpen,
    flappy_cloudy:      Cloudy,
    flappy_joystick:    Joystick,
    flappy_rocket:      Rocket,
    four_columns:       Columns4,
    four_dot:           CircleDot,
    four_target:        Target,
    friends_satellite:  Satellite,
    friends_scan:       ScanSearch,
    friends_search:     UserSearch,
    garage_bike:        Bike,
    garage_car:         CarFront,
    garage_truck:       Truck,
    groups_contact:     Contact,
    groups_person:      UserRound,
    groups_round:       UsersRound,
    health_activity:    Activity,
    health_dumbbell:    Dumbbell,
    health_pill:        Pill,
    health_stethoscope: Stethoscope,
    home_bed:           BedDouble,
    home_building:      Building,
    home_door:          DoorOpen,
    id_badge:           BadgeCheck,
    id_finger:          FingerprintPattern,
    id_scan:            ScanFace,
    id_user:            UserRound,
    mail_box:           Mailbox,
    mail_inbox:         Inbox,
    mail_open:          MailOpen,
    map_navigation:     Navigation,
    map_pin:            MapPin,
    map_pinned:         MapPinned,
    map_route:          Route,
    market_basket:      ShoppingBasket,
    market_cart:        ShoppingCart,
    market_package:     Package,
    market_tag:         Tag,
    message_bubble:     MessageSquare,
    message_more:       MessageCircleMore,
    message_send:       Send,
    message_text:       MessageSquareText,
    music_disc:         Disc3,
    music_headphones:   Headphones,
    music_playlist:     ListMusic,
    music_wave:         AudioWaveform,
    news_earth:         Earth,
    news_podcast:       Podcast,
    news_rss:           Rss,
    news_tv:            TvMinimal,
    notes_list:         ListTodo,
    notes_notebook:     Notebook,
    notes_pen:          PenLine,
    pages_book:         Book,
    pages_bookmark:     BookMarked,
    pages_scroll:       ScrollText,
    pass_finger:        FingerprintPattern,
    pass_key:           Key,
    pass_lock:          Lock,
    pass_shield:        Shield,
    phone_call:         PhoneCall,
    phone_headset:      Headset,
    phone_incoming:     PhoneIncoming,
    phone_outgoing:     PhoneOutgoing,
    photogram_film:     Film,
    photogram_gallery:  GalleryHorizontalEnd,
    photogram_grid:     Grid2x2,
    photogram_sparkles: Sparkles,
    photos_frame:       Frame,
    photos_gallery:     GalleryVerticalEnd,
    photos_images:      Images,
    radio_antenna:      Antenna,
    radio_boombox:      BoomBox,
    radio_speaker:      Speaker,
    radio_tower:        RadioTower,
    rail_ticket:        Ticket,
    rail_track:         TrainTrack,
    rail_tram:          TramFront,
    review_half:        StarHalf,
    review_medal:       Medal,
    review_thumb:       ThumbsUp,
    ryde_bus:           Bus,
    ryde_taxi:          CarTaxiFront,
    ryde_waypoints:     Waypoints,
    safari_bookmark:    Bookmark,
    safari_link:        Link,
    safari_search:      Search,
    safari_window:      AppWindow,
    services_badge:     BadgeCheck,
    services_hammer:    Hammer,
    services_hardhat:   HardHat,
    settings_cog:       Cog,
    settings_sliders:   SlidersHorizontal,
    settings_toggle:    ToggleRight,
    settings_wrench:    Wrench,
    ship_anchor:        Anchor,
    ship_sail:          Sailboat,
    ship_waves:         Waves,
    ship_wheel:         ShipWheel,
    stocks_bars:        ChartBar,
    stocks_candles:     ChartCandlestick,
    stocks_down:        TrendingDown,
    stocks_line:        ChartLine,
    streaks_calendar:   CalendarPlus,
    streaks_check:      CircleCheckBig,
    streaks_kindling:   FlameKindling,
    vibez_clapper:      Clapperboard,
    vibez_play:         Play,
    vibez_tv:           Tv,
    voice_lines:        AudioLines,
    voice_mailbox:      Voicemail,
    voice_vocal:        MicVocal,
    wallet_card:        CreditCard,
    wallet_cash:        Banknote,
    wallet_coin:        CircleDollarSign,
    wallet_receipt:     ReceiptText,
    weather_cloud:      Cloud,
    weather_rain:       CloudRain,
    weather_snow:       Snowflake,
    weather_sun:        Sun,
    wordle_grid:        Grid3x3,
    wordle_spell:       SpellCheck,
    wordle_type:        Type,
};

function initials(label: string): string {
    const words = label.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

export function AppGlyph({ icon, override, label, color, size = 40, strokeWidth = 1.9 }: {
    icon:         string;
    override?:    string;
    label:        string;
    color:        string;
    size?:        number;
    strokeWidth?: number;
}) {
    const Glyph = (override ? APP_GLYPHS[override] : undefined) ?? APP_GLYPHS[icon];
    if (Glyph) return <Glyph size={size} color={color} strokeWidth={strokeWidth} aria-hidden />;
    return (
        <span
            style={{
                color,
                fontFamily:    'var(--font-sf, system-ui, sans-serif)',
                fontWeight:    700,
                fontSize:      size * 0.62,
                letterSpacing: '-0.03em',
                lineHeight:    1,
            }}
        >
            {initials(label)}
        </span>
    );
}

interface GlyphProps {
    className?: string;
}

export function PhoneGlyph({ className }: GlyphProps) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
            <path
                d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function MailGlyph({ className }: GlyphProps) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="2.5" y="4.5" width="19" height="15" rx="2.6" />
            <path d="M3 7l8 5.2a2 2 0 0 0 2 0L21 7" />
        </svg>
    );
}

export function MessageGlyph({ className }: GlyphProps) {
    return (
        <svg viewBox="5 5 50 50" className={className} fill="currentColor" aria-hidden>
            <g transform="scale(0.907099) translate(59.483067,-145.8456)">
                <path d="m -26.410149,157.29606 a 24.278298,20.222157 0 0 0 -24.278105,20.22202 24.278298,20.222157 0 0 0 11.79463,17.31574 27.365264,20.222157 0 0 1 -4.245218,5.94228 23.85735,20.222157 0 0 0 9.86038,-3.87367 24.278298,20.222157 0 0 0 6.868313,0.83768 24.278298,20.222157 0 0 0 24.2781059,-20.22203 24.278298,20.222157 0 0 0 -24.2781059,-20.22202 z" />
            </g>
        </svg>
    );
}
