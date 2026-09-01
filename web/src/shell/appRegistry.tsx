import { lazy, useState } from 'react';
import type { ComponentProps, ComponentType, LazyExoticComponent, ReactNode } from 'react';

import { device } from '@device';
import type { AppDef } from '@/core/types';
import { isCustomApp } from '@/stores/customAppsStore';

interface AppComponentProps { onClose: () => void }

interface AppRenderCtx {
    onClose:           () => void;
    allApps:           AppDef[];
    installedApps:     Set<string>;
    onInstall:         (id: string) => void;
    onOpenApp:         (id: string) => void;
    onLandscapeChange: (v: boolean) => void;
}

interface AppEntry {
    load:       () => Promise<unknown>;
    Component?: LazyExoticComponent<ComponentType<AppComponentProps>>;
    Resolved?:  ComponentType<AppComponentProps>;
    render?:    (ctx: AppRenderCtx) => ReactNode;
}

function entry(load: () => Promise<{ default: ComponentType<AppComponentProps>; warm?: () => void }>): AppEntry {
    return { Component: lazy(load), load };
}

const AppStoreLazy = lazy(() => import('@/apps/appstore/AppStore').then(m => ({ default: m.AppStore })));
const CameraLazy   = lazy(() => import('@/apps/camera/Camera').then(m => ({ default: m.Camera })));

let appStoreReady: typeof AppStoreLazy | ComponentType<ComponentProps<typeof AppStoreLazy>> = AppStoreLazy;
let cameraReady:   typeof CameraLazy   | ComponentType<ComponentProps<typeof CameraLazy>>   = CameraLazy;

function AppStoreMount(props: ComponentProps<typeof AppStoreLazy>) {
    const [C] = useState(() => appStoreReady);
    return <C {...props} />;
}

function CameraMount(props: ComponentProps<typeof CameraLazy>) {
    const [C] = useState(() => cameraReady);
    return <C {...props} />;
}

const APP_REGISTRY = {
    photos:      entry(() => import('@/apps/photos/Photos').then(m => ({ default: m.Photos }))),
    bank:        entry(() => import('@/apps/banking/Banking').then(m => ({ default: m.Banking, warm: m.warmBanking }))),
    settings:    entry(() => import('@/apps/settings/Settings').then(m => ({ default: m.Settings }))),
    clock:       entry(() => import('@/apps/clock/Clock').then(m => ({ default: m.Clock }))),
    messages:    entry(() => import('@/apps/messages/Messages').then(m => ({ default: m.Messages }))),
    phone:       entry(() => import('@/apps/phone/Phone').then(m => ({ default: m.Phone }))),
    calendar:    entry(() => import('@/apps/calendar/Calendar').then(m => ({ default: m.Calendar }))),
    mail:        entry(() => import('@/apps/mail/Mail').then(m => ({ default: m.Mail }))),
    weather:     entry(() => import('@/apps/weather/Weather').then(m => ({ default: m.Weather }))),
    maps:        entry(() => import('@/apps/maps/Maps').then(m => ({ default: m.Maps }))),
    music:       entry(() => import('@/apps/music/Music').then(m => ({ default: m.Music }))),
    stocks:      entry(() => import('@/apps/stocks/Stocks').then(m => ({ default: m.Stocks }))),
    ryde:        entry(() => import('@/apps/ryde/Ryde').then(m => ({ default: m.Ryde }))),
    notes:       entry(() => import('@/apps/notes/Notes').then(m => ({ default: m.Notes }))),
    documents:   entry(() => import('@/apps/documents/Documents').then(m => ({ default: m.Documents }))),
    id:          entry(() => import('@/apps/id/Id').then(m => ({ default: m.Id }))),
    voicememos:  entry(() => import('@/apps/voicememos/VoiceMemos').then(m => ({ default: m.VoiceMemos }))),
    health:      entry(() => import('@/apps/health/Health').then(m => ({ default: m.Health }))),
    compass:     entry(() => import('@/apps/compass/Compass').then(m => ({ default: m.Compass }))),
    groups:      entry(() => import('@/apps/groups/Groups').then(m => ({ default: m.Groups }))),
    services:    entry(() => import('@/apps/services/Services').then(m => ({ default: m.Services }))),
    pages:       entry(() => import('@/apps/pages/Pages').then(m => ({ default: m.Pages }))),
    marketplace: entry(() => import('@/apps/marketplace/Marketplace').then(m => ({ default: m.Marketplace }))),
    radio:       entry(() => import('@/apps/radio/Radio').then(m => ({ default: m.Radio }))),
    darkchat:    entry(() => import('@/apps/darkchat/DarkChat').then(m => ({ default: m.DarkChat }))),
    cherry:      entry(() => import('@/apps/cherry/Cherry').then(m => ({ default: m.Cherry }))),
    photogram:   entry(() => import('@/apps/photogram/Photogram').then(m => ({ default: m.Photogram }))),
    garages:     entry(() => import('@/apps/garages/Garages').then(m => ({ default: m.Garages }))),
    homes:       entry(() => import('@/apps/homes/Homes').then(m => ({ default: m.Homes }))),
    calculator:  entry(() => import('@/apps/calculator/Calculator').then(m => ({ default: m.Calculator }))),
    passwords:   entry(() => import('@/apps/passwords/Passwords').then(m => ({ default: m.Passwords }))),
    cookie:      entry(() => import('@/apps/cookie/Cookie').then(m => ({ default: m.Cookie }))),
    wordle:      entry(() => import('@/apps/wordle/Wordle').then(m => ({ default: m.Wordle }))),
    flappy:      entry(() => import('@/apps/flappy/Flappy').then(m => ({ default: m.Flappy }))),
    blocks:      entry(() => import('@/apps/blocks/Blocks').then(m => ({ default: m.Blocks }))),
    casino:      entry(() => import('@/apps/casino/Casino').then(m => ({ default: m.Casino }))),
    climber:     entry(() => import('@/apps/climber/Climber').then(m => ({ default: m.Climber }))),
    connectfour: entry(() => import('@/apps/connectfour/ConnectFour').then(m => ({ default: m.ConnectFour }))),
    chess:       entry(() => import('@/apps/chess/Chess').then(m => ({ default: m.Chess }))),
    battleship:  entry(() => import('@/apps/battleship/Battleship').then(m => ({ default: m.Battleship }))),
    vibez:       entry(() => import('@/apps/vibez/Vibez').then(m => ({ default: m.Vibez }))),
    weazelnews:  entry(() => import('@/apps/weazelnews/WeazelNews').then(m => ({ default: m.WeazelNews }))),
    streaks:     entry(() => import('@/apps/streaks/Streaks').then(m => ({ default: m.Streaks }))),
    birdy:       entry(() => import('@/apps/birdy/Birdy').then(m => ({ default: m.Birdy }))),
    mdt:         entry(() => import('@/apps/mdt/Mdt').then(m => ({ default: m.Mdt }))),
    emsmdt:      entry(() => import('@/apps/mdt/Mdt').then(m => ({ default: m.EmsMdt }))),
    dojmdt:      entry(() => import('@/apps/mdt/Mdt').then(m => ({ default: m.DojMdt }))),
    racing:      entry(() => import('@/apps/racing/Racing').then(m => ({ default: m.Racing }))),
    appstore: {
        load: () => import('@/apps/appstore/AppStore').then(m => { appStoreReady = m.AppStore; return m; }),
        render: (ctx) => (
            <AppStoreMount
                onClose={ctx.onClose}
                apps={ctx.allApps}
                installed={ctx.installedApps}
                onInstall={ctx.onInstall}
                onOpenApp={ctx.onOpenApp}
            />
        ),
    },
    camera: {
        load: () => import('@/apps/camera/Camera').then(m => { cameraReady = m.Camera; return m; }),
        render: (ctx) => <CameraMount onClose={ctx.onClose} onLandscapeChange={ctx.onLandscapeChange} onOpenApp={ctx.onOpenApp} />,
    },
} satisfies Record<string, AppEntry>;

export type AppId = keyof typeof APP_REGISTRY;
const APP_IDS = Object.keys(APP_REGISTRY) as readonly AppId[];

export function getAppEntry(id: AppId): AppEntry {
    return APP_REGISTRY[id];
}

// Apps show a real frozen "where you left off" card by DEFAULT. Backgrounded apps are
// SUSPENDED (see web/src/shell/deckActive.ts): a boolean plumbed down each app's subtree
// flips to false when it is not the interactive foreground instance, and the shared
// choke points (useGameLoop, useOnlineLobby, useSelfLocation, the ryde/photogram/cookie/
// blocks effects) fold it into their gates so the loop / poll / render / media halts and
// the last frame simply freezes at ~0 CPU. That makes maps, ryde, photogram, cookie, the
// arcade + board games, and phone all cheap to keep mounted and previewable.
//
// camera is the ONLY genuine exception: it drives a GTA-native cell-cam through a
// singleton three.js GameRender bound to a single canvas that the deck never re-parents,
// so it can't be a live card. It suspends the native cam on background (deckActive) and
// its switcher card falls back to the app icon.
const PREVIEW_EXCLUDE = new Set<AppId>(['camera']);

// Custom apps render inside a cross-origin iframe: it cannot be captured for a live
// switcher card and re-parenting the node would reload it, so they opt out of the
// preview deck exactly like camera does and fall back to their icon card.
export function isPreviewApp(id: AppId): boolean {
    if (isCustomApp(id)) return false;
    return !PREVIEW_EXCLUDE.has(id);
}

// Apps this device does not have. The registry stays complete (AppId must keep naming every
// app or the tree stops type-checking); the ids are refused at asAppId instead.
const EXCLUDED_APPS = new Set<string>(device.excludedApps);

// A raw id becomes an openable AppId when it is either a statically-registered app
// or a runtime-registered custom app. Every downstream AppId-typed site keys off the
// id string, so widening the union at this single boundary is enough to open it -
// and refusing it here is what stops a notification tap, a deeplink, Control Center,
// sd-phone:launchApp or the custom-app SDK from opening an app this device lacks.
export function asAppId(id: string | null | undefined): AppId | null {
    if (id == null) return null;
    if (EXCLUDED_APPS.has(id)) return null;
    if (id in APP_REGISTRY) return id as AppId;
    if (isCustomApp(id)) return id as AppId;
    return null;
}

const loadedApps = new Set<string>();

export function isAppLoaded(id: AppId): boolean {
    return !(id in APP_REGISTRY) || loadedApps.has(id);
}

export function preloadApp(id: AppId): Promise<void> {
    if (isAppLoaded(id)) return Promise.resolve();
    const e = getAppEntry(id);
    return e.load().then(m => {
        const mod = m as { default?: ComponentType<AppComponentProps>; warm?: () => void } | undefined;
        if (mod?.default) e.Resolved = mod.default;
        loadedApps.add(id);
        if (typeof mod?.warm === 'function') mod.warm();
    }, () => { loadedApps.add(id); });
}

let preloadPaused = false;
let preloadBusy   = false;
let preloadResume: (() => void) | null = null;

export function setPreloadPaused(paused: boolean): void {
    if (preloadPaused === paused) return;
    preloadPaused = paused;
    if (!paused) preloadResume?.();
}

export function preloadAllApps(): void {
    const queue = APP_IDS.slice();
    const schedule = () => {
        if (preloadPaused || preloadBusy) return;
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => pump(), { timeout: 200 });
        else window.setTimeout(pump, 100);
    };
    const pump = () => {
        if (preloadPaused || preloadBusy) return;
        const id = queue.shift();
        if (!id) { preloadResume = null; return; }
        preloadBusy = true;
        void preloadApp(id).finally(() => { preloadBusy = false; schedule(); });
    };
    preloadResume = schedule;
    schedule();
}
