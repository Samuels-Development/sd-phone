import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AdminPanel } from '@/admin/AdminPanel';
import { PayphoneUI } from '@/payphone/PayphoneUI';
import { CallLayer } from '@/apps/phone/CallLayer';
import { NotificationHost, type NotificationItem } from '@/shell/Notifications';
import { AirShareCard, type AirShareRequest } from '@/shared/AirShare';
import { SignRequestLayer, type SignRequestData } from '@/apps/documents/SignRequestLayer';
import { ControlCenter, ControlCenterHotzone } from '@/shell/ControlCenter';
import { MusicProvider, useMusic } from '@/apps/music/MusicContext';
import { ryDevDataHidden, ryDevToggleData } from '@/apps/ryde/data';
import { asAppId, isPreviewApp, preloadAllApps, type AppId } from '@/shell/appRegistry';
import { AppSwitcher } from '@/shell/AppSwitcher';
import { AppDeck, FullscreenStage, type DeckAppCtx } from '@/shell/AppDeck';
import { Homescreen }  from '@/shell/Homescreen';
import { useBadgeStore } from '@/stores/badgeStore';
import { useBatteryStore } from '@/stores/batteryStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useDownloadStore, useDownloadingIds } from '@/stores/downloadStore';
import { useLocaleStore } from '@/stores/localeStore';
import { HomeIndicator } from '@/shell/HomeIndicator';
import { Lockscreen }  from '@/shell/Lockscreen';
import { PhoneShell }  from '@/shell/PhoneShell';
import { StatusBar }   from '@/shell/StatusBar';
import { useAutoContrast } from '@/shell/useAutoContrast';
import { VolumeHUD }   from '@/shell/VolumeHUD';
import { SetupFlow }   from '@/shell/SetupFlow';
import type { SetupResult } from '@/shell/SetupFlow';
import { isKeyboardCaptured } from '@/hooks/useKeyboardCapture';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { seedSessionState } from '@/hooks/useSessionState';
import { onOpenMail, onOpenMaps, onOpenMessages } from '@/shell/deeplink';
import { fetchNui, isFiveM } from '@/core/nui';
import { usePhoneReset } from '@/core/phoneReset';
import { resetAuth } from '@/stores/authStore';
import { setMailDomain } from '@/core/accountsApi';
import { voiceHub, setLocalTalking } from '@/media/nearbyVoice';
import { useMusicLibrary } from '@/stores/musicLibraryStore';
import { DEFAULT_FRAME_COLOR } from '@/shell/frameColors';
import { ThemeProvider, useTheme, useThemeStore } from '@/stores/themeStore';
import { useCallStore } from '@/stores/callStore';
import type { AppDef } from '@/core/types';
import { listInstalledApps, installApp, uninstallApp, loadHomeLayout, saveHomeLayout, parseLayout, type SavedLayout } from '@/apps/appstore/appsApi';
import { customToAppDef, installedCustomIds, isCustomApp, setCustomInstalled, useCustomApps, useCustomAppsStore } from '@/stores/customAppsStore';
import { resolveWallpaper } from '@/shell/wallpapers';
import { NoSimScreen } from '@/shell/NoSimScreen';
import { useNoService, useNoSim, useSimStore } from '@/stores/simStore';
import { resetContacts, syncSimNumber } from '@/stores/contactsStore';
import { playOnce } from '@/apps/settings/tonePlayer';
import { resolveTone, toneUrl } from '@/apps/settings/tones';
import { AlarmRinging, AlarmPeekBanner } from '@/apps/clock/AlarmRinging';
import { alarmsSnapshot, disableAlarm, hydrateAlarms, onTestAlarm } from '@/stores/alarmStore';
import { tmFinish, useTimer } from '@/stores/timerStore';
import { isRepeating } from '@/apps/clock/data';
import type { AlarmDef } from '@/apps/clock/data';


const SETUP_KEY_BASE = 'sd-phone:setup:v1';

// Unique-phones mode: setup completion is a per-PROFILE fact, keyed by the active SIM number,
// so a new SIM shows the new-phone setup while switching back to a known phone doesn't. Legacy
// mode (no SIM feature) keeps the bare key.
let setupProfile = '';
function setSetupProfile(number: string | null | undefined): void {
    setupProfile = number ?? '';
}
function SETUP_KEY(): string {
    return setupProfile ? `${SETUP_KEY_BASE}:${setupProfile}` : SETUP_KEY_BASE;
}

interface SetupSaved {
    completed:  boolean;
    language?:  string;
    pin?:       string | null;
    faceUnlock?: boolean;
    theme?:     'light' | 'dark';
    wallpaper?: string;
}

function loadSetup(): SetupSaved {
    try {
        const raw = window.localStorage.getItem(SETUP_KEY());
        if (raw) {
            const parsed = JSON.parse(raw) as SetupSaved;
            if (parsed && typeof parsed.completed === 'boolean') return parsed;
        }
    } catch { /* ignore */ }
    return { completed: false };
}

function saveSetup(s: SetupSaved): void {
    try { window.localStorage.setItem(SETUP_KEY(), JSON.stringify(s)); } catch { /* ignore */ }
}

interface ViewState {
    apps:          AppDef[];
    dock:          string[];
    wallpaperHome: string;
    wallpaperLock: string;
    carrier:       string;
    signal:        number;
    showWifi:      boolean;
    use24h:        boolean;
    showDate:      boolean;
}

const SERVER_BADGE_APPS = new Set<AppId>(['messages', 'phone', 'mail', 'groups', 'photogram', 'birdy', 'vibez']);

// How many apps the switcher shows / the recents list remembers. Every visible card
// wants a live preview, so the retain cap below is bound to this - keeping them the
// same value is what stops the extra cards from falling back to a grey icon card.
const RECENTS_CAP = 10;

// Fullscreen app slot with a reveal animation. This wrapper mounts exactly when phone content
// is revealed (open without a lock, or the unlock swipe finishing), so capturing hasApp at
// mount animates only a restored app (Reopen Last App): a gentle zoom-in instead of a hard
// pop. Later in-session launches keep their icon-zoom and never replay this.
function AppResumeStage({ hasApp }: { hasApp: boolean }) {
    const fxRef = useRef(hasApp);
    return (
        <div
            className="absolute inset-0 z-10"
            style={{ pointerEvents: 'none', animation: fxRef.current ? 'app-resume-in 0.34s cubic-bezier(0.3,0.9,0.4,1) both' : undefined }}
        >
            <FullscreenStage />
        </div>
    );
}

// How many preview-eligible apps are kept alive (live switcher cards) at once. The
// active app is always live on top of this; anything past the cap downgrades to an
// icon card. Matched to RECENTS_CAP so every card the switcher can show is a live
// view. Safe to keep this high because backgrounded retained apps are suspended to
// ~0 CPU (see deckActive.ts + the choke-point gates in appRegistry.tsx) - the only
// remaining cost is an idle, frozen React tree per app the player actually opened.
const RETAIN_CAP = RECENTS_CAP;

const ALARM_TEST_ID = '__alarm_test__';

export function App() {
    return (
        <ThemeProvider>
            <MusicProvider>
                <AppContent />
                <AdminPanel />
                <PayphoneUI />
            </MusicProvider>
        </ThemeProvider>
    );
}

function AppContent() {
    // Tone/volume fields are deliberately NOT subscribed here — they're only
    // read inside event callbacks (via useThemeStore.getState()), so slider
    // drags in Control Center don't re-render the whole tree from the root.
    const { theme, darkTheme, wallpaperLock, wallpaperHome, setTheme, setWallpaper, statusLightOverride, statusBarAutoLight, hideHomeIndicator, airplaneMode, hour24, setHour24, setSecurity } = useTheme('theme', 'darkTheme', 'wallpaperLock', 'wallpaperHome', 'setTheme', 'setWallpaper', 'statusLightOverride', 'statusBarAutoLight', 'hideHomeIndicator', 'airplaneMode', 'hour24', 'setHour24', 'setSecurity');
    const locale = useLocaleStore(s => s.locale);
    useEffect(() => { useLocaleStore.getState().hydrate(); }, []);

    const customApps = useCustomApps();
    const customDefs = useMemo(() => customApps.map(customToAppDef), [customApps]);
    useEffect(() => { useCustomAppsStore.getState().hydrate(); }, []);
    useNuiEvent('customApps:set', useCallback((data) => {
        useCustomAppsStore.getState().setAll(data ?? []);
    }, []));

    const [view,            setView]            = useState<ViewState | null>(null);
    const [entering,        setEntering]        = useState(false);
    const [leaving,         setLeaving]         = useState(false);
    const [locked,          setLocked]          = useState<boolean>(true);
    const [flashlightOn,    setFlashlightOn]    = useState(false);
    const [homeEditing,     setHomeEditing]     = useState(false);
    const [setupHello,      setSetupHello]      = useState(true);
    const [finishingSetup,  setFinishingSetup]  = useState(false);
    const [ccOpen,          setCcOpen]          = useState(false);
    const [ccWifi,          setCcWifi]          = useState(true);
    const [unlockTrigger,   setUnlockTrigger]   = useState(0);
    const [launchTrigger,   setLaunchTrigger]   = useState(0);
    const pendingCcApp                          = useRef<string | null>(null);
    const pendingLaunchLink                     = useRef<Record<string, unknown> | undefined>(undefined);
    // Active SIM number of the previous phone-open; a different number on the next open means
    // the player switched phones and the UI must shed the old profile's state.
    const lastSimNumberRef                      = useRef<string | null>(null);
    // App the phone was holstered on; sd-phone:open restores it when config allows.
    const lastOpenAppRef                        = useRef<AppId | null>(null);
    const [battery,         setBattery]         = useState<number>(100);
    const [currentApp,      setCurrentApp]      = useState<AppId | null>(null);
    const [launchOrigin,    setLaunchOrigin]    = useState<{ x: number; y: number } | null>(null);
    const [launchExpand,    setLaunchExpand]    = useState<boolean>(false);
    const [isClosing,       setIsClosing]       = useState(false);
    const [recentApps,      setRecentApps]      = useState<AppId[]>([]);
    // Retained keep-alive deck: preview-eligible apps foregrounded THIS phone-open
    // session, most-recent first, capped. These + the active app are the ids the
    // AppDeck keeps mounted. foregroundKeys drives per-app open-animation replays.
    const [retained,        setRetained]        = useState<AppId[]>([]);
    const [foregroundKeys,  setForegroundKeys]  = useState<Record<string, number>>({});
    const [switcherOpen,    setSwitcherOpen]    = useState(false);
    const [switcherClosing, setSwitcherClosing] = useState(false);
    const [switcherReady,   setSwitcherReady]   = useState(false);
    const [landscape,       setLandscape]       = useState(false);
    const [installedApps,   setInstalledApps]   = useState<Set<string>>(new Set());
    const [savedLayout,     setSavedLayout]     = useState<SavedLayout | null>(null);
    // In FiveM the installed apps + saved layout arrive via the sd-phone:apps follow-up (kept off
    // the open round-trip). Hold the home grid until they land: the Homescreen seeds its slot
    // layout once at mount, so mounting it against the transient empty layout would auto-arrange
    // and then persist that arrangement back, clobbering the real one. The dev harness resolves
    // both synchronously on open, so it's ready immediately.
    const [appsReady,       setAppsReady]       = useState(!isFiveM);
    const [frameColor,      setFrameColor]      = useState<string>(DEFAULT_FRAME_COLOR);
    const downloadingIds = useDownloadingIds();
    const downloadQueue = useRef<string[]>([]);
    const downloadTimer = useRef<number>();

    const noSim = useNoSim();
    const simEnabled = useSimStore(s => s.enabled);
    // Unique phones: setup completion lives in a per-profile localStorage namespace, and the
    // profile arrives via the deferred SIM resolve - AFTER the reveal on a fresh NUI (rejoin).
    // Until it lands, the bare namespace reads "not completed", so the Hello screen must wait
    // for the profile or a set-up phone re-runs setup on every rejoin.
    const [simProfileReady, setSimProfileReady] = useState(false);
    // Device mode: no SIM means no cellular service, but the phone still opens and works - the
    // status bar shows "No Service" and only number-dependent actions (call/text) are refused
    // server-side. (In legacy mode useNoSim drives the full-screen wall instead.)
    const noService = useNoService();
    // A pulled SIM drops the phone straight back to the (blocked) lock state: no app stays
    // foregrounded and the switcher/control-center close.
    useEffect(() => {
        if (noSim) {
            setLocked(true);
            setCurrentApp(null);
            setSwitcherOpen(false);
            setSwitcherClosing(false);
            setCcOpen(false);
        }
    }, [noSim]);

    const [setup, setSetup] = useState<SetupSaved>(() => loadSetup());
    // Server-side twin of the localStorage flag (phone_settings.setup_done): survives a cleared
    // FiveM cache / another PC. null = this profile's hydrate hasn't answered yet.
    const serverSetupDone = useThemeStore(s => s.setupDone);
    const setupCompleted = setup.completed || serverSetupDone === true;
    // Theme and wallpaper are NOT re-applied from the saved setup on launch. Both
    // persist server-side (phone_settings) and hydrate via settings:get on mount;
    // re-applying the localStorage setup value every launch clobbered the player's
    // later pick (a stale wallpaper URL, or the setup-time light/dark theme instead
    // of their current one). Both are applied once at setup completion below.

    function handleSetupDone(result: SetupResult) {
        const next: SetupSaved = {
            completed:  true,
            language:   result.language,
            pin:        result.pin,
            faceUnlock: result.faceUnlock,
            theme:      result.theme,
            wallpaper:  result.wallpaper,
        };
        setSetup(next);
        saveSetup(next);
        useThemeStore.setState({ setupDone: true });
        if (isFiveM) void fetchNui('sd-phone:settings:setSetupDone').catch(() => {});
        setTheme(result.theme);
        setWallpaper(result.wallpaper, 'both');
        setSecurity(result.pin, result.faceUnlock);
        setLocked(false);
        setFinishingSetup(true);
        window.setTimeout(() => setFinishingSetup(false), 520);
    }

    useEffect(() => {
        if (switcherOpen && recentApps.length === 0) {
            setSwitcherOpen(false);
            setSwitcherClosing(false);
        }
    }, [recentApps, switcherOpen]);

    // Unique phones: a phone whose SIM differs from the last seen one is a DIFFERENT phone -
    // drop every trace of the previous profile from the UI (kept-alive apps, cached app
    // logins, hydrated settings). The server never leaks across identities; this stops the
    // client's own memory from doing it. Runs on every open AND on live SIM swaps.
    // Drops every UI trace of the acting profile: kept-alive apps, cached logins, notification
    // stacks, data caches, hydrated settings. Visuals reset to stock synchronously so the
    // previous profile's wallpaper/clock never paint while the fresh hydrate is in flight.
    // Runs on a phone/SIM switch AND when a cloud-backup restore replaces the data in place.
    const resetProfileUi = useCallback(() => {
        try {
            window.localStorage.removeItem('sd-phone:mail:folderOrder');
            window.localStorage.removeItem('sd-phone:mail:activeAccount');
        } catch { /* ignore */ }
        lastOpenAppRef.current = null;
        resetAuth();
        useMusicLibrary.getState().reset();
        useThemeStore.getState().resetProfileVisuals();
        useThemeStore.getState().hydrate();
        useLocaleStore.getState().hydrate();
        resetContacts();
        setNotifs([]);
        setLockNotifs([]);
        setPeekNotif(null);
        useBadgeStore.getState().setServer({});
        if (isFiveM) void fetchNui<Record<string, number>>('sd-phone:badges:get').then(m => useBadgeStore.getState().setServer(m ?? {}));
        setLocked(true);
        setCurrentApp(null);
        setRecentApps([]);
        setRetained([]);
        setForegroundKeys({});
        setSwitcherOpen(false);
        setSwitcherClosing(false);
    }, []);

    const applySimProfile = useCallback((enabled?: boolean, hasSim?: boolean, num?: string, device?: boolean, profile?: string) => {
        // Device mode keys per-phone state off the DEVICE identity (stable across SIM swaps on
        // one phone); legacy keys off the SIM number. Either way a null key means "don't switch".
        const key = enabled
            ? (device ? (profile || null) : ((hasSim && num) || null))
            : null;
        let switched = false;
        const prevKey = lastSimNumberRef.current;
        if (key) {
            setSetupProfile(key);
            setSimProfileReady(true);
            if (prevKey && prevKey !== key) switched = true;
            lastSimNumberRef.current = key;
            if (!prevKey) {
                // First profile application this NUI session (fresh rejoin): collect banners
                // parked for this phone by pocket buzzes that arrived before its first open.
                const parked = lockNotifBankRef.current[key];
                delete lockNotifBankRef.current[key];
                if (parked && parked.length > 0) {
                    setLockNotifs(prev => [...prev, ...parked.filter(p => !prev.some(n => n.id === p.id))].slice(0, 5));
                }
            }
        }
        if (enabled) setSetup(loadSetup());
        if (switched) {
            // Each phone keeps its OWN lockscreen stack: bank the outgoing phone's before the
            // reset wipes it, and bring back whatever the incoming phone held when we last
            // switched away from it (move semantics - the bank entry is consumed on return).
            if (prevKey) lockNotifBankRef.current[prevKey] = lockNotifsRef.current;
            const banked = key ? lockNotifBankRef.current[key] : undefined;
            if (key) delete lockNotifBankRef.current[key];
            resetProfileUi();
            if (banked && banked.length > 0) setLockNotifs(banked);
        }
        // After any reset above: paint this profile's last-known wallpaper in the SAME render
        // batch as the reveal, so the first open never flashes the stock background while the
        // authoritative hydrate is still in flight.
        useThemeStore.getState().applyWallpaperProfile(key);
    }, [resetProfileUi]);

    // The framework loaded a character (first join or a switch): per-player settings become
    // resolvable only now, so restart both hydration pulls with a fresh retry budget.
    useNuiEvent('sd-phone:client:characterLoaded', useCallback(() => {
        useThemeStore.getState().hydrate();
        useLocaleStore.getState().hydrate();
    }, []));

    useNuiEvent('sd-phone:open', useCallback((data) => {
        if (!data) return;
        if (data.locale) useLocaleStore.getState().applyServerDefault(data.locale);   // server default, unless the player already picked their own
        if (data.mailDomain) setMailDomain(data.mailDomain);
        useSimStore.getState().apply(data.sim);
        applySimProfile(data.sim?.enabled, data.sim?.hasSim, data.sim?.number, data.sim?.device, data.sim?.profile);
        syncSimNumber(data.sim);
        const nextView: ViewState = {
            apps:          data.apps,
            dock:          data.dock,
            wallpaperHome: data.wallpaper.home,
            wallpaperLock: data.wallpaper.lock,
            carrier:       data.carrier,
            signal:        data.signal,
            showWifi:      data.showWifi,
            use24h:        data.use24h,
            showDate:      data.showDate,
        };
        setView(nextView);
        lastViewRef.current = nextView;
        // Reopen: the deck now lives ABOVE the shell and is never unmounted, so last
        // session's retained apps are still alive - we deliberately do NOT clear them,
        // which is what brings the switcher previews back exactly where you left them.
        // "Close All" is the only thing that wipes them (iOS: apps stay open otherwise).
        // Reopen straight into the app the phone was holstered on when the player's Settings
        // toggle (Settings > General > Reopen Last App, default off) says so. The deck kept
        // the app alive, so this is a resume, not a launch; a SIM switch clears the memo.
        setCurrentApp(useThemeStore.getState().reopenLastApp ? lastOpenAppRef.current : null);
        setIsClosing(false);
        setLaunchOrigin(null);
        setSwitcherOpen(false);
        setSwitcherClosing(false);
        setSwitcherReady(false);
        setNotifs([]);
        // In FiveM the installed list + saved layout normally arrive via the sd-phone:apps
        // follow-up (kept off the open round-trip so the phone reveals instantly). An inline
        // payload still counts as ready - the Homescreen must never wait on a follow-up that
        // isn't coming. The dev harness fetches from its local mock instead.
        if (data.installedApps) {
            setInstalledApps(new Set([...data.installedApps, ...installedCustomIds()]));
            setAppsReady(true);
        } else {
            if (!isFiveM) void listInstalledApps().then(ids => setInstalledApps(new Set([...ids, ...installedCustomIds()])));
            setAppsReady(!isFiveM);
        }
        // Under unique phones the localStorage layout fallback is another profile's - server only.
        setSavedLayout(data.homeLayout ? parseLayout(data.homeLayout) : (data.sim?.enabled ? null : loadHomeLayout()));
        setLocked(data.locked);
        setBattery(data.battery);
        useBatteryStore.getState().setLevel(data.battery);
        if (data.frameColor) setFrameColor(data.frameColor);
        setLeaving(false);
        setEntering(true);
        if (isFiveM) void fetchNui<Record<string, number>>('sd-phone:badges:get').then(m => useBadgeStore.getState().setServer(m ?? {}));
        if (isFiveM) void fetchNui<{ on: boolean }>('sd-phone:flashlight:state').then(r => setFlashlightOn(!!r?.on));
        useCustomAppsStore.getState().hydrate();
    }, []));

    // Follow-up to sd-phone:open: the authoritative installed-apps list and saved home layout,
    // fetched after the reveal so the server round-trip never delayed the phone appearing.
    useNuiEvent('sd-phone:apps', useCallback((data) => {
        if (!data) return;
        setInstalledApps(new Set([...(data.installedApps ?? []), ...installedCustomIds()]));
        setSavedLayout(data.homeLayout ? parseLayout(data.homeLayout) : null);
        setAppsReady(true);
    }, []));

    useNuiEvent('sd-phone:simState', useCallback((data) => {
        useSimStore.getState().apply(data);
        applySimProfile(data?.enabled, data?.hasSim, data?.number, data?.device, data?.profile);
        syncSimNumber(data);
    }, [applySimProfile]));

    // Cloud-backup restore replaced the acting profile's data in place (same identity, new
    // contents): the same full reset as a phone switch, so no kept-alive app or hydrated
    // setting keeps showing pre-restore data.
    useNuiEvent('sd-phone:profileReset', useCallback(() => {
        resetProfileUi();
    }, [resetProfileUi]));

    useNuiEvent('sd-phone:close', useCallback(() => {
        setLeaving(true);
    }, []));

    useNuiEvent('sd-phone:frameColor', useCallback((data) => {
        if (data?.color) setFrameColor(data.color);
    }, []));

    useNuiEvent('sd-phone:music:receive', useCallback((data) => {
        if (!data) return;
        const lib = useMusicLibrary.getState();
        if (data.kind === 'track' && data.track) lib.addReceivedTracks([data.track]);
        else if (data.kind === 'playlist' && Array.isArray(data.tracks)) {
            lib.addReceivedPlaylist(data.name ?? 'Shared Playlist', data.tracks);
        }
    }, []));

    useNuiEvent('sd-phone:voice:signalIn', useCallback((data) => {
        void voiceHub.handleIncoming(data);
    }, []));

    useNuiEvent('sd-phone:voice:talkingState', useCallback((data) => {
        setLocalTalking(!!data?.on);
    }, []));

    useNuiEvent('sd-phone:wipe', useCallback(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
        window.location.reload();
    }, []));

    const [radioIsland, setRadioIsland] = useState({ on: false, standby: false, freq: 0, onAir: false });
    useNuiEvent('sd-phone:radio:status', useCallback((d) => {
        setRadioIsland(s => ({
            on:      !!d.on,
            standby: !!d.standby && !d.on,
            freq:    d.freq,
            onAir:   d.on ? s.onAir : false,
        }));
    }, []));
    useNuiEvent('sd-phone:radio:onair', useCallback((d) => {
        setRadioIsland(s => ({ ...s, onAir: !!d.active }));
    }, []));

    // Bring an app to the fullscreen foreground: single mount point of truth. Bumps
    // its foreground key (replays the open animation on the retained instance) and,
    // if it is preview-eligible, promotes it into the retained keep-alive deck.
    const foreground = useCallback((id: AppId, origin: { x: number; y: number }, expand = false) => {
        setIsClosing(false);
        setLaunchOrigin(origin);
        setLaunchExpand(expand);
        setCurrentApp(id);
        setForegroundKeys(m => ({ ...m, [id]: (m[id] ?? 0) + 1 }));
        setRecentApps(prev => [id, ...prev.filter(x => x !== id)].slice(0, RECENTS_CAP));
        if (isPreviewApp(id)) {
            setRetained(prev => [id, ...prev.filter(x => x !== id)].slice(0, RETAIN_CAP));
        }
        useBadgeStore.getState().clear(id);
    }, []);

    // Reset the live deck: retained instances unmount, so their effects/subscriptions
    // stop. Called on lock / holster / Close All - "where you left off" is a per
    // phone-open concept (the deck provably cannot survive an unmount of the shell).
    const clearDeck = useCallback(() => {
        setRetained([]);
        setForegroundKeys({});
    }, []);

    const launchApp = useCallback((app: AppDef, origin: { x: number; y: number }) => {
        void fetchNui('sd-phone:openApp', { id: app.id, route: app.route });
        const id = asAppId(app.id);
        if (id) foreground(id, origin);
    }, [foreground]);

    const handleCloseApp = useCallback(() => {
        // Close is purely: play the ios-app-close collapse, then unmount. NO html2canvas anywhere on
        // this path (nor deferred to idle, which still blocks the same thread a beat later) - the
        // synchronous rasterize is what froze the phone and left the collapsed speck stuck on screen.
        // Snapshots are taken only when swiping up into the switcher, masked by its cover animation.
        setIsClosing(true);
    }, []);

    const closePhone = useCallback(() => {
        void fetchNui('sd-phone:close');
        setLeaving(true);
    }, []);

    // Called by the deck when the active app's close-collapse settles. The retained
    // instance is NOT unmounted here - it stays alive in the deck's hidden pool (if
    // preview-eligible) or is dropped from deckIds (if not). Either way: no capture,
    // no rasterize, so hover/click are live the instant the collapse ends.
    const handleAnimEnd = useCallback(() => {
        setCurrentApp(null);
        setIsClosing(false);
        setLaunchOrigin(null);
    }, []);

    const handleShowSwitcher = useCallback(() => {
        // No capture, no rasterize. The switcher shows real retained live views (the
        // active app's card is the SAME instance re-parented, so it's live at once);
        // switcherReady gates the staggered reveal of the other retained cards until
        // after the open animation settles.
        setSwitcherReady(false);
        setSwitcherOpen(prev => (prev ? prev : true));
    }, []);

    const handleSwitcherDismiss  = useCallback(() => setSwitcherClosing(true), []);
    const handleSwitcherReady    = useCallback(() => setSwitcherReady(true), []);
    const handleSwitcherDone     = useCallback(() => {
        if (!switcherClosing) return;
        setSwitcherOpen(false);
        setSwitcherClosing(false);
        setSwitcherReady(false);
    }, [switcherClosing]);

    const applyNotifLink = useCallback((link?: Record<string, unknown>) => {
        if (link) for (const [k, v] of Object.entries(link)) seedSessionState(k, v);
    }, []);

    const handleOpenFromSwitcher = useCallback((id: AppId, origin: { x: number; y: number }) => {
        // Opening from an OPEN switcher card grows the app out of that near-fullscreen
        // preview (ios-app-expand); notification / deeplink opens (switcher closed) keep
        // the normal home-launch pop.
        const fromSwitcher = switcherOpen;
        setSwitcherOpen(false);
        setSwitcherClosing(false);
        setSwitcherReady(false);
        foreground(id, origin, fromSwitcher);
    }, [foreground, switcherOpen]);

    // Single launch chokepoint for out-of-band opens (notifications, deeplinks, Control
    // Center). The home screen only hides uninstalled icons, so the gate must live here:
    // an uninstalled app's notification routes to the App Store instead of opening it.
    const openAppById = useCallback((id: string | null | undefined, origin: { x: number; y: number }) => {
        const app = asAppId(id);
        if (!app) return;
        const def = view?.apps.find(a => a.id === app) ?? customDefs.find(c => c.id === app);
        if (def && !def.base && !installedApps.has(app)) {
            const store = asAppId('appstore');
            if (store) handleOpenFromSwitcher(store, origin);
            return;
        }
        handleOpenFromSwitcher(app, origin);
    }, [handleOpenFromSwitcher, view, customDefs, installedApps]);

    const openAppCentered = useCallback((id: string) => openAppById(id, { x: 0.5, y: 0.5 }), [openAppById]);

    // The exact set of app ids the deck keeps mounted: the active app (always) plus
    // the retained preview-eligible apps. Order is active-first for reveal priority.
    const deckIds = useMemo<AppId[]>(() => {
        const ids: AppId[] = [];
        if (currentApp) ids.push(currentApp);
        for (const id of retained) if (!ids.includes(id)) ids.push(id);
        return ids;
    }, [currentApp, retained]);

    const music = useMusic();
    useEffect(() => {
        if (music.openSignal === 0) return;
        setLocked(false);
        handleOpenFromSwitcher('music', { x: 0.5, y: 0.08 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [music.openSignal]);

    useEffect(() => onOpenMaps(() => {
        setLocked(false);
        handleOpenFromSwitcher('maps', { x: 0.5, y: 0.5 });
    }), [handleOpenFromSwitcher]);

    useEffect(() => onOpenMessages(() => {
        setLocked(false);
        handleOpenFromSwitcher('messages', { x: 0.5, y: 0.5 });
    }), [handleOpenFromSwitcher]);

    useEffect(() => onOpenMail(() => {
        setLocked(false);
        handleOpenFromSwitcher('mail', { x: 0.5, y: 0.5 });
    }), [handleOpenFromSwitcher]);

    const handleRemoveFromRecents = useCallback((id: string) => {
        setRecentApps(prev => prev.filter(x => x !== id));
        setRetained(prev => prev.filter(x => x !== id));
        setForegroundKeys(m => { const n = { ...m }; delete n[id]; return n; });
        setCurrentApp(prev => {
            if (prev === id) {
                setIsClosing(false);
                setLaunchOrigin(null);
                return null;
            }
            return prev;
        });
    }, []);

    const handleRemoveAll = useCallback(() => {
        setRecentApps([]);
        setCurrentApp(null);
        setIsClosing(false);
        setLaunchOrigin(null);
        setSwitcherOpen(false);
        setSwitcherClosing(false);
        setSwitcherReady(false);
        clearDeck();
    }, [clearDeck]);

    const finishInstall = useCallback((id: string) => {
        setInstalledApps(prev => new Set(prev).add(id));
        if (isCustomApp(id)) { setCustomInstalled(id, true); void fetchNui('customApps/lifecycle', { id, action: 'install' }); }
        else void installApp(id).then(ids => setInstalledApps(new Set(ids)));
    }, []);
    const pumpDownloads = useCallback(function pump() {
        const id = downloadQueue.current[0];
        if (id === undefined) { downloadTimer.current = undefined; return; }
        useDownloadStore.getState().start(id, false);
        const DURATION = 4000;
        const start = performance.now();
        const step = () => {
            const p = Math.min(1, (performance.now() - start) / DURATION);
            useDownloadStore.getState().setProgress(id, p);
            if (p >= 1) {
                clearInterval(downloadTimer.current);
                downloadTimer.current = undefined;
                finishInstall(id);
                useDownloadStore.getState().remove(id);
                downloadQueue.current = downloadQueue.current.slice(1);
                pump();
            }
        };
        downloadTimer.current = window.setInterval(step, 50);
    }, [finishInstall]);
    const startDownload = useCallback((id: string) => {
        if (downloadQueue.current.includes(id)) return;
        const wasIdle = downloadQueue.current.length === 0;
        downloadQueue.current = [...downloadQueue.current, id];
        useDownloadStore.getState().start(id, !wasIdle);
        if (wasIdle) pumpDownloads();
    }, [pumpDownloads]);
    const handleUninstallApp = useCallback((id: string) => {
        setInstalledApps(prev => { const n = new Set(prev); n.delete(id); return n; });
        // Evict any live/retained instance and its switcher card, so a later reinstall + reopen
        // mounts fresh and refetches instead of showing the stale state held at uninstall time.
        setRetained(prev => prev.filter(x => x !== id));
        setRecentApps(prev => prev.filter(x => x !== id));
        setForegroundKeys(m => { const n = { ...m }; delete n[id]; return n; });
        if (isCustomApp(id)) { setCustomInstalled(id, false); void fetchNui('customApps/lifecycle', { id, action: 'uninstall' }); }
        else void uninstallApp(id).then(ids => setInstalledApps(new Set(ids)));
    }, []);
    const handleSaveLayout = useCallback((layout: SavedLayout) => {
        saveHomeLayout(layout);
    }, []);

    // Stable-ish context handed to every deck app instance. Memoized so unrelated
    // App re-renders (notifications, battery, island state) don't rebuild app nodes;
    // it only changes when the app list / install set / stable callbacks change.
    const deckCtx = useMemo<DeckAppCtx>(() => ({
        onClose:           handleCloseApp,
        allApps:           [...(view?.apps ?? []), ...customDefs],
        installedApps,
        onInstall:         startDownload,
        onOpenApp:         openAppCentered,
        onLandscapeChange: setLandscape,
    }), [handleCloseApp, view, customDefs, installedApps, startDownload, openAppCentered]);

    useEffect(() => () => {
        if (downloadTimer.current !== undefined) clearInterval(downloadTimer.current);
    }, []);

    useNuiEvent('sd-phone:battery', useCallback((pct) => {
        if (typeof pct === 'number') { setBattery(pct); useBatteryStore.getState().setLevel(pct); }
    }, []));

    useNuiEvent('sd-phone:session', useCallback((data) => {
        if (data && typeof data.startMs === 'number') useSessionStore.getState().setStartMs(data.startMs);
    }, []));

    const [notifs, setNotifs] = useState<NotificationItem[]>([]);
    const [lockNotifs, setLockNotifs] = useState<NotificationItem[]>([]);
    const lockNotifsRef = useRef(lockNotifs);
    lockNotifsRef.current = lockNotifs;
    // Per-profile lockscreen stacks parked while another phone is active (in-memory, like the
    // stacks themselves): written on switch-away, consumed on switch-back.
    const lockNotifBankRef = useRef<Record<string, NotificationItem[]>>({});
    const [peek, setPeek] = useState<'in' | 'out' | null>(null);
    const [peekNotif, setPeekNotif] = useState<NotificationItem | null>(null);
    // Pocket buzz: the buzzing phone's frame colour, so the closed-shell peek wears THAT
    // phone's rail instead of the last-opened one's. Null = active phone's colour.
    const [peekColor, setPeekColor] = useState<string | null>(null);
    const peekTimer = useRef<number | undefined>(undefined);
    // An ongoing call keeps the closed shell peeked (green island + timer) until it ends.
    const callOngoing = useCallStore(s => s.phase !== null);
    const callOngoingRef = useRef(callOngoing);
    callOngoingRef.current = callOngoing;
    const callPeekRef = useRef(false);
    const [ringingAlarm, setRingingAlarm] = useState<AlarmDef | null>(null);
    const ringingAlarmRef = useRef(ringingAlarm);
    ringingAlarmRef.current = ringingAlarm;
    const [ringingSince, setRingingSince] = useState(0);
    const lastViewRef  = useRef<ViewState | null>(null);
    const phoneOpenRef = useRef(false);
    phoneOpenRef.current = !!view;
    const lockedRef = useRef(locked);
    lockedRef.current = locked;
    useNuiEvent('sd-phone:badges', useCallback((data) => {
        useBadgeStore.getState().setServer(data ?? {});
    }, []));
    useEffect(() => {
        if (currentApp === 'phone') void fetchNui('sd-phone:calls:seen');
    }, [currentApp]);
    const currentAppRef = useRef(currentApp);
    currentAppRef.current = currentApp;
    useNuiEvent('sd-phone:notification', useCallback((data) => {
        const target = data.appId ?? data.app;
        if (data.quietInApp && target && target === currentAppRef.current) return;
        const item: NotificationItem = {
            ...data,
            id: data.id ?? `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        };
        if (phoneOpenRef.current && !lockedRef.current) {
            setNotifs(prev => [item, ...prev.filter(n => n.id !== item.id)].slice(0, 4));
        }
        if (!phoneOpenRef.current && !ringingAlarmRef.current) {
            setPeekNotif(item);
            setPeekColor(data.otherPhone ? (data.phoneColor ?? null) : null);
            setPeek('in');
            if (peekTimer.current) window.clearTimeout(peekTimer.current);
            peekTimer.current = window.setTimeout(() => { if (!callOngoingRef.current) setPeek('out'); }, 4200);
        }
        const tones = useThemeStore.getState();
        playOnce(resolveTone('notification', tones.notificationTone, tones.customNotificationTones).url, tones.ringtoneVol / 100);
        // A pocket buzz belongs to the OTHER phone: transient banner + tone above, and the
        // item parks on THAT phone's banked lockscreen stack for its next open - never this
        // phone's live stack or badges.
        if (data.otherPhone) {
            const park = data.profileKey;
            if (park) {
                const bank = lockNotifBankRef.current;
                bank[park] = [item, ...(bank[park] ?? []).filter(n => n.id !== item.id)].slice(0, 5);
            }
            return;
        }
        setLockNotifs(prev => [item, ...prev.filter(n => n.id !== item.id)].slice(0, 5));
        const badgeTarget = asAppId(target);
        if (badgeTarget && badgeTarget !== currentAppRef.current && !SERVER_BADGE_APPS.has(badgeTarget)) {
            useBadgeStore.getState().bump(badgeTarget);
        }
    }, []));
    const removeNotif = useCallback((id: string) => setNotifs(prev => prev.filter(n => n.id !== id)), []);
    const toggleFlashlight = useCallback(() => {
        setFlashlightOn(prev => !prev);
        void fetchNui<{ on: boolean }>('sd-phone:flashlight:toggle').then(r => {
            if (r && typeof r.on === 'boolean') setFlashlightOn(r.on);
        });
    }, []);
    const openCameraFromLock = useCallback(() => {
        setLocked(false);
        handleOpenFromSwitcher('camera', { x: 0.5, y: 0.92 });
    }, [handleOpenFromSwitcher]);
    const launchPendingApp = useCallback(() => {
        setLocked(false);
        const id = pendingCcApp.current;
        const link = pendingLaunchLink.current;
        pendingCcApp.current = null;
        pendingLaunchLink.current = undefined;
        applyNotifLink(link);
        openAppById(id, { x: 0.5, y: 0.5 });
    }, [openAppById, applyNotifLink]);
    const openLockNotif = useCallback((item: NotificationItem) => {
        setLockNotifs(prev => prev.filter(n => n.id !== item.id));
        setLocked(false);
        const target = item.appId ?? item.app;
        if (target) { applyNotifLink(item.link); openAppById(target, { x: 0.5, y: 0.4 }); }
    }, [openAppById, applyNotifLink]);
    const dismissLockNotif = useCallback((id: string) => {
        setLockNotifs(prev => prev.filter(n => n.id !== id));
    }, []);
    useNuiEvent('sd-phone:launchApp', useCallback((data) => {
        const id = asAppId(data?.id);
        if (!id || !setupCompleted) return;
        if (lockedRef.current) {
            pendingCcApp.current = id;
            pendingLaunchLink.current = data.link;
            setLaunchTrigger(n => n + 1);
        } else {
            applyNotifLink(data.link);
            openAppById(id, { x: 0.5, y: 0.5 });
        }
    }, [setupCompleted, applyNotifLink, openAppById]));
    useEffect(() => {
        if (peek !== 'out') return;
        const t = window.setTimeout(() => setPeek(null), 440);
        return () => window.clearTimeout(t);
    }, [peek]);
    useEffect(() => {
        if (view) { setPeek(null); setPeekNotif(null); setPeekColor(null); if (peekTimer.current) window.clearTimeout(peekTimer.current); }
    }, [view]);
    // Closing the phone mid-call lands on the peek shell and STAYS there - the call island
    // (green timer pill) keeps the call visible; the peek retracts when the call ends.
    useEffect(() => {
        if (view) return;
        if (callOngoing) {
            callPeekRef.current = true;
            if (peekTimer.current) window.clearTimeout(peekTimer.current);
            setPeek('in');
        } else if (callPeekRef.current) {
            callPeekRef.current = false;
            setPeek(p => (p === 'in' ? 'out' : p));
        }
    }, [callOngoing, view]);

    useEffect(() => { hydrateAlarms(); }, []);
    const phoneOpen = !!view;
    useEffect(() => { if (phoneOpen) hydrateAlarms(true); }, [phoneOpen]);
    useAutoContrast(
        phoneOpen && !locked && setupCompleted && currentApp !== 'camera',
        `${currentApp ?? ''}|${theme}|${locked}`,
    );

    const fireAlarm = useCallback((a: AlarmDef) => {
        if (ringingAlarmRef.current) return;
        setRingingAlarm(a);
        setRingingSince(Date.now());
    }, []);

    const snoozeTimerRef = useRef<number | null>(null);

    const dismissAlarm = useCallback((keep: boolean) => {
        const a = ringingAlarmRef.current;
        setRingingAlarm(null);
        setPeek(null);
        setPeekNotif(null);
        if (peekTimer.current) window.clearTimeout(peekTimer.current);
        if (snoozeTimerRef.current) { window.clearTimeout(snoozeTimerRef.current); snoozeTimerRef.current = null; }
        if (!keep && a && a.id !== ALARM_TEST_ID && !isRepeating(a)) disableAlarm(a.id);
    }, []);

    const snoozeAlarm = useCallback(() => {
        const a = ringingAlarmRef.current;
        setRingingAlarm(null);
        setPeek(null);
        setPeekNotif(null);
        if (peekTimer.current) window.clearTimeout(peekTimer.current);
        if (!a) return;
        const secs = a.snoozeSecs && a.snoozeSecs > 0 ? a.snoozeSecs : 60;
        if (snoozeTimerRef.current) window.clearTimeout(snoozeTimerRef.current);
        snoozeTimerRef.current = window.setTimeout(() => fireAlarm(a), secs * 1000);
    }, [fireAlarm]);

    useEffect(() => {
        if (!ringingAlarm || ringingAlarm.sound === false) return;
        const tones = useThemeStore.getState();
        const audio = new Audio(toneUrl('ringtone', tones.ringtone));
        audio.loop = true;
        audio.volume = Math.max(0, Math.min(1, tones.ringtoneVol / 100));
        void audio.play().catch(() => { /* autoplay may need a prior gesture */ });
        return () => { audio.pause(); };
    }, [ringingAlarm]);

    useEffect(() => {
        if (ringingAlarm && !phoneOpen) {
            if (peekTimer.current) window.clearTimeout(peekTimer.current);
            setPeek('in');
        }
    }, [ringingAlarm, phoneOpen]);

    const COOLDOWN_MS = 60_000;
    const lastFiredRef = useRef<Record<string, number>>({});
    useEffect(() => {
        const tick = () => {
            if (ringingAlarmRef.current) return;
            const now = new Date();
            const h = now.getHours(), m = now.getMinutes();
            const ms = now.getTime();
            const due = alarmsSnapshot().find(a =>
                a.enabled && a.hour === h && a.minute === m && ms - (lastFiredRef.current[a.id] ?? 0) > COOLDOWN_MS);
            if (due) { lastFiredRef.current[due.id] = ms; fireAlarm(due); }
        };
        const id = window.setInterval(tick, 5000);
        return () => window.clearInterval(id);
    }, [fireAlarm]);

    useEffect(() => onTestAlarm(() => {
        fireAlarm({ id: ALARM_TEST_ID, hour: 0, minute: 0, label: 'Test Alarm', days: '', enabled: true });
    }), [fireAlarm]);

    const { status: timerStatus, endsAt: timerEndsAt } = useTimer();
    const onTimerComplete = useCallback(() => {
        tmFinish();
        if (currentAppRef.current === 'clock') {
            const tones = useThemeStore.getState();
            playOnce(resolveTone('notification', tones.notificationTone, tones.customNotificationTones).url, tones.ringtoneVol / 100);
        } else {
            window.postMessage({ action: 'sd-phone:notification', data: { app: 'clock', appId: 'clock', title: 'Timer', body: 'Your timer has been completed' } }, '*');
        }
    }, []);
    useEffect(() => {
        if (timerStatus !== 'running') return;
        const delay = timerEndsAt - Date.now();
        if (delay <= 0) { onTimerComplete(); return; }
        const id = window.setTimeout(onTimerComplete, delay);
        return () => window.clearTimeout(id);
    }, [timerStatus, timerEndsAt, onTimerComplete]);

    const [airshare, setAirshare] = useState<AirShareRequest[]>([]);
    useNuiEvent('sd-phone:airshare', useCallback((data) => {
        setAirshare(prev => (prev.some(r => r.id === data.id) ? prev : [...prev, data]));
    }, []));
    const respondAirshare = useCallback((id: string, accept: boolean) => {
        void fetchNui('sd-phone:airshare:respond', { id, accept });
        setAirshare(prev => prev.filter(r => r.id !== id));
    }, []);

    const [signReqs, setSignReqs] = useState<SignRequestData[]>([]);
    useNuiEvent('sd-phone:documents:signRequest', useCallback((data) => {
        setSignReqs(prev => (prev.some(r => r.requestId === data.requestId) ? prev : [...prev, data]));
    }, []));

    const warmedImages = useRef<Map<string, HTMLImageElement>>(new Map());
    const warmImage = useCallback((src: string) => {
        if (!src || warmedImages.current.has(src)) return;
        const img = new Image();
        img.src = src;
        void img.decode?.().catch(() => { /* decode race / unsupported — ignore */ });
        warmedImages.current.set(src, img);
    }, []);

    useEffect(() => {
        if (wallpaperLock) warmImage(resolveWallpaper(wallpaperLock));
        if (wallpaperHome) warmImage(resolveWallpaper(wallpaperHome));
    }, [wallpaperLock, wallpaperHome, warmImage]);

    useEffect(() => {
        if (!entering) return;
        const t = window.setTimeout(() => setEntering(false), 560);
        return () => window.clearTimeout(t);
    }, [entering]);

    useEffect(() => {
        if (!leaving) return;
        const t = window.setTimeout(() => {
            lastOpenAppRef.current = currentAppRef.current;
            setView(null);
            setLeaving(false);
            setEntering(false);
            setCurrentApp(null);
            setIsClosing(false);
            setLaunchOrigin(null);
            setSwitcherOpen(false);
            setSwitcherClosing(false);
            setSwitcherReady(false);
            // retained / foregroundKeys are intentionally kept: the deck outlives this
            // teardown, so the apps stay mounted (suspended) and reappear on reopen.
        }, 440);
        return () => window.clearTimeout(t);
    }, [leaving]);

    // Locking no longer tears the deck down (it lives above the shell and we force every
    // app to suspend while locked, see deckActiveId). Keep retained/foregroundKeys so the
    // switcher previews survive a lock/unlock; just make sure no stale switcher lingers.
    useEffect(() => {
        if (locked) setSwitcherReady(false);
    }, [locked]);

    useEffect(() => {
        if (isFiveM) return;
        let cancel: (() => void) | undefined;
        void import('@/core/dev').then(mod => { cancel = mod.devInjectMockData(); });
        return () => cancel?.();
    }, []);

    // Warm the app chunks only once the phone has actually been opened — the
    // NUI page mounts at player JOIN, and parsing ~3.6MB of lazy chunks during
    // the spawn window is wasted work for players who never take the phone out.
    const preloadArmed = useRef(false);
    useEffect(() => {
        if (!view || preloadArmed.current) return;
        preloadArmed.current = true;
        const t = window.setTimeout(preloadAllApps, 1500);
        return () => window.clearTimeout(t);
    }, [view]);

    useEffect(() => {
        if (isFiveM) return;
        (window as unknown as { __sdShoot?: unknown }).__sdShoot = {
            open: (id: string) => { setLocked(false); openAppById(id, { x: 0.5, y: 0.5 }); },
            squareScreen: () => {
                const el = document.querySelector('[data-phone-screen]') as HTMLElement | null;
                if (!el) return;
                el.style.borderRadius = '0';
                el.style.clipPath = 'none';
                el.style.setProperty('-webkit-clip-path', 'none');
                el.style.maskImage = 'none';
                el.style.setProperty('-webkit-mask-image', 'none');
            },
        };
    }, [openAppById]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const tgt = e.target as HTMLElement | null;
            // isKeyboardCaptured() covers apps that type without a text field (the word
            // games read keys off window), so the L hotkey does not lock the phone
            // mid-guess.
            const typing = isKeyboardCaptured() || (!!tgt && (
                tgt.tagName === 'INPUT'
                || tgt.tagName === 'TEXTAREA'
                || tgt.isContentEditable
            ));

            if (e.key === 'Escape') {
                if (switcherOpen)            { handleSwitcherDismiss(); return; }
                if (currentApp && !isClosing) { handleCloseApp();        return; }
                void fetchNui('sd-phone:close');
                setLeaving(true);
            }
            if ((e.key === 'l' || e.key === 'L') && !locked && !typing) {
                setLocked(true);
                setCurrentApp(null);
                setIsClosing(false);
                setLaunchOrigin(null);
                setSwitcherOpen(false);
                setSwitcherClosing(false);
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [locked, currentApp, isClosing, switcherOpen, handleCloseApp, handleSwitcherDismiss]);

    useEffect(() => {
        if (!isFiveM) return;
        const isText = (el: EventTarget | null) => {
            const t = el as HTMLElement | null;
            return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
        };
        // Digit-only inputs take the numeric typing tier: the player keeps moving while the
        // field is focused (client/main.lua suppresses the digit weapon binds instead).
        const isNumeric = (el: EventTarget | null) => {
            const t = el as HTMLInputElement | null;
            return !!t && t.tagName === 'INPUT'
                && (['numeric', 'tel', 'decimal'].includes(t.inputMode) || ['number', 'tel'].includes(t.type));
        };
        const onFocus = (e: FocusEvent) => { if (isText(e.target)) void fetchNui('sd-phone:typing', { typing: true, numeric: isNumeric(e.target) }); };
        const onBlur  = (e: FocusEvent) => { if (isText(e.target)) void fetchNui('sd-phone:typing', { typing: false }); };
        document.addEventListener('focusin', onFocus);
        document.addEventListener('focusout', onBlur);
        return () => {
            document.removeEventListener('focusin', onFocus);
            document.removeEventListener('focusout', onBlur);
        };
    }, []);

    const resetNonce = usePhoneReset(s => s.nonce);
    useEffect(() => {
        if (!resetNonce) return;
        const scope = usePhoneReset.getState().scope;
        const prefixes = scope === 'erase'
            ? ['sd-phone:']
            : ['sd-phone:setup:', 'sd-phone:mail:folderOrder', 'sd-phone:mail:activeAccount'];
        const doomed: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
            const k = window.localStorage.key(i);
            if (k && prefixes.some(p => k.startsWith(p))) doomed.push(k);
        }
        for (const k of doomed) window.localStorage.removeItem(k);
        if (scope === 'erase') {
            resetAuth();
            useMusicLibrary.getState().reset();
            useLocaleStore.getState().hydrate();
            void fetchNui('sd-phone:settings:factoryReset');
            setInstalledApps(new Set());
            setSavedLayout(null);
        }
        setCurrentApp(null);
        setLaunchOrigin(null);
        setLaunchExpand(false);
        setIsClosing(false);
        setRecentApps([]);
        setRetained([]);
        setForegroundKeys({});
        setSwitcherOpen(false);
        setSwitcherClosing(false);
        setSwitcherReady(false);
        setHomeEditing(false);
        setCcOpen(false);
        setFinishingSetup(false);
        setSetupHello(true);
        setLocked(false);
        setSetup({ completed: false });
    }, [resetNonce]);

    // The keep-alive deck is rendered ABOVE the shell (in both the closed and open
    // branches, under a stable key) so it is never unmounted by a holster/lock/locale
    // change - that persistence is what lets the switcher previews survive the phone
    // being put away. While holstered (no view) or locked, deckActiveId is null so the
    // active app drops to the deck's hidden pool and every app suspends to ~0 CPU.
    const deckActiveId = (!view || locked) ? null : currentApp;
    const deckLayer = (
        <div key="deck-root" className={theme === 'dark' ? 'dark' : undefined} data-dark-theme={darkTheme}>
            <AppDeck
                deckIds={deckIds}
                activeId={deckActiveId}
                switcherOpen={switcherOpen}
                switcherReady={switcherReady}
                closing={isClosing}
                foregroundKeys={foregroundKeys}
                launchOrigin={launchOrigin}
                launchExpand={launchExpand}
                ctx={deckCtx}
                onCloseDone={handleAnimEnd}
            />
        </div>
    );

    if (!view) {
        const lv = lastViewRef.current;
        const peekWall = resolveWallpaper(wallpaperLock || lv?.wallpaperLock || 'lockscreen.jpg');
        return (
            <>
                {deckLayer}
                <div key="shell-closed" className={theme === 'dark' ? 'dark' : undefined} data-dark-theme={darkTheme}>
                {peek && (
                    <PhoneShell peek={peek} frameColor={peekColor ?? frameColor} radioIsland={radioIsland} alarmIsland={{ ringing: !!ringingAlarm, since: ringingSince }}>
                        <div className="wallpaper absolute inset-0" style={{ backgroundImage: `url(${peekWall})` }} />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-black/5 to-transparent" />
                        <StatusBar
                            use24h={hour24}
                            signal={(airplaneMode || noSim || noService) ? 0 : (lv?.signal ?? 4)}
                            showWifi={(airplaneMode || noSim) ? false : ((lv?.showWifi ?? true) && ccWifi)}
                            battery={battery}
                            airplane={airplaneMode}
                            noSim={noSim}
                            noService={noService}
                            light
                        />
                        {ringingAlarm ? (
                            <AlarmPeekBanner name={ringingAlarm.label} since={ringingSince} />
                        ) : (
                            <NotificationHost
                                items={peekNotif ? [peekNotif] : []}
                                placement="phone"
                                onDismiss={() => setPeekNotif(null)}
                                onOpen={() => setPeekNotif(null)}
                            />
                        )}
                    </PhoneShell>
                )}
                </div>
            </>
        );
    }

    const statusLight = locked || !currentApp || theme === 'dark';
    const homeWallpaper = wallpaperHome || view.wallpaperHome;
    const lockWallpaper = wallpaperLock || view.wallpaperLock;

    const allApps       = [...view.apps, ...customDefs.filter(c => !view.apps.some(a => a.id === c.id))];
    const effectiveApps = allApps.filter(a => a.base || installedApps.has(a.id) || downloadingIds.includes(a.id));
    const effectiveIds  = new Set(effectiveApps.map(a => a.id));

    const canShowSwitcher = recentApps.length > 0 || !!currentApp;

    // Hello only renders once the answer is trustworthy: the localStorage flag OR the server
    // flag says completed -> never; unique phones -> wait for the resolved profile; in-game ->
    // wait for the profile's settings hydrate (serverSetupDone non-null) so a cleared cache
    // can't flash setup at a phone whose server flag says done.
    const showSetup = !setupCompleted
        && (!simEnabled || simProfileReady)
        && (!isFiveM || serverSetupDone !== null);

    const cameraMode = currentApp === 'camera' && !isClosing && !locked;

    const onHomescreen = !showSetup && !locked && !currentApp;

    return (
        <>
        {deckLayer}
        <div key={showSetup ? 'setup' : locale} className={theme === 'dark' ? 'dark' : undefined} data-dark-theme={darkTheme}>
            {import.meta.env.DEV && (
                <button
                    type="button"
                    onClick={() => setSetup(prev => { const next = { ...prev, completed: !prev.completed }; saveSetup(next); return next; })}
                    className="fixed left-3 top-3 z-[99999] rounded-md bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20 hover:bg-black/90"
                >
                    {showSetup ? 'Exit Setup' : 'Show Setup'}
                </button>
            )}
            {import.meta.env.DEV && (
                <button
                    type="button"
                    onClick={() => { ryDevToggleData(); window.location.reload(); }}
                    className="fixed left-3 top-12 z-[99999] rounded-md bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20 hover:bg-black/90"
                >
                    {ryDevDataHidden() ? 'Ryde data: off' : 'Ryde data: on'}
                </button>
            )}
            {import.meta.env.DEV && (
                <button
                    type="button"
                    onClick={() => window.postMessage({
                        action: 'sd-phone:payphone:open',
                        data: {
                            number:    '2085550142',
                            anonymous: false,
                            myNumber:  '2085559873',
                            favorites: [
                                { name: 'Tommy V',      phone: '2085552398' },
                                { name: 'Mechanic Joe', phone: '2085556641' },
                                { name: 'Rosa',         phone: '2085551177' },
                            ],
                        },
                    }, '*')}
                    className="fixed left-3 top-[84px] z-[99999] rounded-md bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20 hover:bg-black/90"
                >
                    Payphone
                </button>
            )}
            {import.meta.env.DEV && (
                <button
                    type="button"
                    onClick={() => setHour24(!hour24)}
                    className="fixed left-3 top-[84px] z-[99999] rounded-md bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20 hover:bg-black/90"
                >
                    {hour24 ? '24h: on' : '24h: off'}
                </button>
            )}
            <PhoneShell cameraActive={cameraMode} landscape={cameraMode && landscape} entering={entering} leaving={leaving} onClose={closePhone} frameColor={frameColor} radioIsland={radioIsland} alarmIsland={{ ringing: !!ringingAlarm, since: ringingSince }}>
                {!(showSetup && setupHello && !noSim) && (
                    <StatusBar
                        use24h={hour24}
                        signal={(airplaneMode || noSim || noService) ? 0 : view.signal}
                        showWifi={(airplaneMode || noSim) ? false : (view.showWifi && ccWifi)}
                        battery={battery}
                        airplane={airplaneMode}
                        noSim={noSim}
                        noService={noService}
                        light={noSim ? true : (showSetup ? false : (cameraMode ? true : (statusLightOverride ?? statusBarAutoLight ?? statusLight)))}
                        controlHint={!showSetup && !cameraMode && !ccOpen && !homeEditing && !noSim}
                        editing={homeEditing && onHomescreen}
                    />
                )}
                <VolumeHUD suppressed={ccOpen} />

                {noSim ? (
                    <NoSimScreen />
                ) : showSetup ? (
                    <SetupFlow onDone={handleSetupDone} onHelloChange={setSetupHello} />
                ) : locked ? (
                    <Lockscreen
                        use24h={hour24}
                        showDate={view.showDate}
                        wallpaper={lockWallpaper}
                        unlockTrigger={unlockTrigger}
                        onUnlock={() => setLocked(false)}
                        launchTrigger={launchTrigger}
                        onLaunch={launchPendingApp}
                        notifications={lockNotifs}
                        onOpenNotif={openLockNotif}
                        onDismissNotif={dismissLockNotif}
                        flashlightOn={flashlightOn}
                        onToggleFlashlight={toggleFlashlight}
                        onOpenCamera={openCameraFromLock}
                    />
                ) : (
                    !cameraMode && appsReady && (
                        <Homescreen
                            apps={effectiveApps}
                            dock={view.dock}
                            wallpaper={homeWallpaper}
                            onLaunchApp={launchApp}
                            onUninstall={handleUninstallApp}
                            savedLayout={savedLayout}
                            onLayoutChange={handleSaveLayout}
                            onEditingChange={setHomeEditing}
                            bloomOnMount={currentApp === null}
                        />
                    )
                )}

                {/* The active app renders here: this only registers the fullscreen slot;
                    the actual live instance is re-parented in from the top-level deck. */}
                {!showSetup && !locked && <AppResumeStage hasApp={currentApp !== null} />}

                {!showSetup && switcherOpen && !locked && (
                    <AppSwitcher
                        apps={effectiveApps}
                        recents={canShowSwitcher
                            ? (currentApp
                                ? [currentApp, ...recentApps.filter(id => id !== currentApp)].slice(0, RECENTS_CAP)
                                : recentApps
                              ).filter(id => effectiveIds.has(id))
                            : []}
                        closing={switcherClosing}
                        onDone={handleSwitcherDone}
                        onReady={handleSwitcherReady}
                        onOpen={(id, origin) => openAppById(id, origin)}
                        onRemove={handleRemoveFromRecents}
                        onRemoveAll={handleRemoveAll}
                        onDismiss={handleSwitcherDismiss}
                    />
                )}

                {!showSetup && !locked && (
                    <SwipeHomeZone
                        hasOpenApp={!!currentApp}
                        onGoHome={handleCloseApp}
                        onShowSwitcher={canShowSwitcher ? handleShowSwitcher : undefined}
                    />
                )}

                {!onHomescreen && !showSetup && !hideHomeIndicator && (
                    <HomeIndicator
                        onGoHome={
                            locked        ? () => setUnlockTrigger(n => n + 1)
                                : currentApp  ? handleCloseApp
                                : undefined
                        }
                        closing={isClosing}
                    />
                )}

                <CallLayer wallpaper={homeWallpaper} />

                {ringingAlarm && (
                    <div className="absolute inset-0 z-30">
                        <AlarmRinging
                            name={ringingAlarm.label}
                            onStop={() => dismissAlarm(false)}
                            onKeep={() => dismissAlarm(true)}
                            canSnooze={!!ringingAlarm.snooze}
                            onSnooze={snoozeAlarm}
                            repeating={isRepeating(ringingAlarm)}
                        />
                    </div>
                )}

                {!locked && (
                    <NotificationHost
                        items={notifs}
                        placement="phone"
                        onDismiss={removeNotif}
                        onOpen={(it) => {
                            removeNotif(it.id);
                            const target = it.appId ?? it.app;
                            if (target && !showSetup) { applyNotifLink(it.link); openAppById(target, { x: 0.5, y: 0.1 }); }
                        }}
                    />
                )}

                {airshare[0] && (
                    <div className="absolute inset-x-0 top-[10px] z-[58] px-3">
                        <AirShareCard request={airshare[0]} onRespond={(a) => respondAirshare(airshare[0]!.id, a)} />
                    </div>
                )}

                {signReqs[0] && (
                    <SignRequestLayer
                        key={signReqs[0].requestId}
                        request={signReqs[0]}
                        onDone={() => setSignReqs(prev => prev.slice(1))}
                    />
                )}

                {!showSetup && (
                    <>
                        {!ccOpen && !homeEditing && <ControlCenterHotzone onOpen={() => setCcOpen(true)} />}
                        <ControlCenter
                            open={ccOpen}
                            onClose={() => setCcOpen(false)}
                            onOpenApp={id => {
                                if (locked) { pendingCcApp.current = id; pendingLaunchLink.current = undefined; setLaunchTrigger(n => n + 1); }
                                else openAppById(id, { x: 0.5, y: 0.5 });
                            }}
                            onWifi={setCcWifi}
                        />
                    </>
                )}

                {finishingSetup && (
                    <div className="animate-finish-veil pointer-events-none absolute inset-0 z-[250] bg-white dark:bg-base" />
                )}
            </PhoneShell>
        </div>
        </>
    );
}




interface SwipeHomeZoneProps {
    hasOpenApp:     boolean;
    onGoHome:       () => void;
    onShowSwitcher: (() => void) | undefined;
}

function SwipeHomeZone({ hasOpenApp, onGoHome, onShowSwitcher }: SwipeHomeZoneProps) {
    const startY = useRef(0);
    const startT = useRef(0);
    const fired  = useRef(false);

    return (
        <div
            className="absolute inset-x-0 bottom-0 z-50"
            style={{ height: 44, touchAction: 'none' }}
            onPointerDown={e => {
                startY.current = e.clientY;
                startT.current = Date.now();
                fired.current  = false;
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={e => {
                if (fired.current) return;
                const dy = startY.current - e.clientY;
                if (dy < 55) return;

                fired.current = true;
                const elapsed = Date.now() - startT.current;

                if (hasOpenApp && elapsed < 200) {
                    onGoHome();
                } else if (onShowSwitcher) {
                    onShowSwitcher();
                } else {
                    onGoHome();
                }
            }}
        />
    );
}
