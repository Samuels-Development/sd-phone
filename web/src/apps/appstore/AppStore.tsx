import { useState } from 'react';
import { Lock } from 'lucide-react';

import { useSessionState } from '@/hooks/useSessionState';
import { useShallow } from 'zustand/react/shallow';
import { useDownloadProgress, useDownloadStore } from '@/stores/downloadStore';
import { useHasData } from '@/stores/serviceStore';
import { useWifiConnected, useWifiNetworks } from '@/stores/wifiStore';
import { AlertDialog } from '@/ui/AlertDialog';
import { AppIconSVG } from '@/shell/AppIconSVG';
import { SearchBar } from '@/ui/SearchBar';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { CircularProgress } from '@/ui/CircularProgress';
import { AppDetail } from './AppDetail';
import { getCustomApp } from '@/stores/customAppsStore';
import { t, appLabel } from '@/i18n';
import type { AppDef } from '@/core/types';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

function getDescriptions(): Record<string, string> {
    return {
        phone:       t('appstore.descPhone', 'Calls, recents & contacts'),
        messages:    t('appstore.descMessages', 'Chat with your contacts'),
        mail:        t('appstore.descMail', 'Send and receive email'),
        maps:        t('appstore.descMaps', 'Navigate and set waypoints'),
        compass:     t('appstore.descCompass', 'Find your heading'),
        camera:      t('appstore.descCamera', 'Snap photos around town'),
        photos:      t('appstore.descPhotos', 'Your captured moments'),
        music:       t('appstore.descMusic', 'Stream music & playlists'),
        weather:     t('appstore.descWeather', 'Forecast & conditions'),
        clock:       t('appstore.descClock', 'Alarms, timers & clock'),
        calendar:    t('appstore.descCalendar', 'Plan and track your events'),
        notes:       t('appstore.descNotes', 'Jot down your thoughts'),
        voicememos:  t('appstore.descVoicememos', 'Record quick voice notes'),
        bank:        t('appstore.descBank', 'Manage money & cards'),
        health:      t('appstore.descHealth', 'Track your daily activity'),
        documents:   t('appstore.descDocuments', 'Store and sign your documents'),
        settings:    t('appstore.descSettings', 'Tune your phone settings'),
        appstore:    t('appstore.descAppstore', 'Discover and download apps'),
        calculator:  t('appstore.descCalculator', 'Everyday calculations'),
        passwords:   t('appstore.descPasswords', 'Store your logins securely'),
        groups:      t('appstore.descGroups', 'Create and join crews'),
        birdy:       t('appstore.descBirdy', 'Short posts from around the city'),
        services:    t('appstore.descServices', 'Hire local services'),
        pages:       t('appstore.descPages', "The city's business directory"),
        marketplace: t('appstore.descMarketplace', 'List what you sell, find what you need'),
        darkchat:    t('appstore.descDarkchat', 'Rooms with no names attached'),
        cherry:      t('appstore.descCherry', 'Swipe, match, start talking'),
        photogram:   t('appstore.descPhotogram', 'Post your photos and stories'),
        garages:     t('appstore.descGarages', 'Manage your vehicles'),
        homes:       t('appstore.descHomes', 'Browse properties'),
        ryde:        t('appstore.descRyde', 'Request rides across town'),
        radio:       t('appstore.descRadio', 'Talk on shared frequencies'),
        stocks:      t('appstore.descStocks', 'Trade stocks & crypto'),
        vibez:       t('appstore.descVibez', 'Short videos and trends'),
        weazelnews:  t('appstore.descWeazelnews', 'Statewide headlines'),
        cookie:      t('appstore.descCookie', 'Addictive clicker game'),
        wordle:      t('appstore.descWordle', 'Daily word puzzle'),
        flappy:      t('appstore.descFlappy', 'Tap to fly and dodge'),
        blocks:      t('appstore.descBlocks', 'Stack and clear the lines'),
        casino:      t('appstore.descCasino', 'Blackjack, roulette and slots'),
        climber:     t('appstore.descClimber', 'Climb as high as you can'),
        connectfour: t('appstore.descConnectfour', 'Line up four to win'),
        chess:       t('appstore.descChess', 'Outplay and checkmate'),
        battleship:  t('appstore.descBattleship', 'Sink the enemy fleet'),
        streaks:     t('appstore.descStreaks', 'A photo a day, keep your streak'),
        racing:      t('appstore.descRacing', 'Race tracks, rankings and events'),
        id:          t('appstore.descId', 'Your ID, licences and badge'),
        mdt:         t('appstore.descMdt', 'Police records, calls and warrants'),
        emsmdt:      t('appstore.descEmsmdt', 'Patient charts and medical dispatch'),
        dojmdt:      t('appstore.descDojmdt', 'Court dockets, charges and case files'),
    };
}

function DownloadRing({ id, queued }: { id: string; queued: boolean }) {
    const progress = useDownloadProgress(id);
    return <CircularProgress progress={queued ? 0 : (progress ?? 0)} size={32} stroke={2.5} />;
}

export function AppStore({ onClose: _onClose, apps, installed, onInstall, onOpenApp }: {
    onClose:   () => void;
    apps:      AppDef[];
    installed: Set<string>;
    onInstall: (id: string) => void;
    onOpenApp: (id: string) => void;
}) {
    const downloadStatus = useDownloadStore(useShallow(s => {
        const out: Record<string, 'queued' | 'active'> = {};
        for (const [id, p] of Object.entries(s.downloads)) out[id] = p < 0 ? 'queued' : 'active';
        return out;
    }));
    const hasData = useHasData();
    const wifiConnected = useWifiConnected();
    const wifiNetworks = useWifiNetworks();
    const [noServiceOpen, setNoServiceOpen] = useState(false);
    const [wifiLockId, setWifiLockId] = useState<string | null>(null);

    const wifiIdOf = (app: AppDef) => app.wifi ?? getCustomApp(app.id)?.wifi;
    const lockedNetwork = (app: AppDef): string | null => {
        const id = wifiIdOf(app);
        if (!id || wifiConnected?.id === id) return null;
        return id;
    };
    const ssidOf = (id: string) =>
        (wifiConnected?.id === id ? wifiConnected.ssid : wifiNetworks.find(n => n.id === id)?.ssid) ?? id;

    const installGuarded = (id: string) => {
        const app = apps.find(a => a.id === id);
        const locked = app ? lockedNetwork(app) : null;
        if (locked) { setWifiLockId(locked); return; }
        if (!hasData) { setNoServiceOpen(true); return; }
        onInstall(id);
    };
    const [q, setQ] = useSessionState('appstore:search', '');
    const [filter, setFilter] = useSessionState<'all' | 'notInstalled'>('appstore:filter', 'all');
    const [selectedId, setSelectedId] = useSessionState<string | null>('appstore:selected', null);
    const selectedProgress = useDownloadProgress(selectedId ?? '');
    const selected = apps.find(a => a.id === selectedId) ?? null;
    const query = q.trim().toLowerCase();
    const descriptions = getDescriptions();
    const descOf = (id: string) => descriptions[id] ?? getCustomApp(id)?.description ?? '';

    const list = apps.filter(a => {
        const isInstalled = !!a.base || installed.has(a.id);
        if (filter === 'notInstalled' && isInstalled) return false;
        if (!query) return true;
        const desc = descOf(a.id);
        return appLabel(a).toLowerCase().includes(query) || desc.toLowerCase().includes(query);
    });

    return (
        <div className="absolute inset-0 flex flex-col bg-base font-sf">
            <StatusBarSpacer />

            <h1 className="px-5 pb-2 pt-1 text-[32px] font-bold tracking-tight text-black dark:text-white">{t('appstore.title', 'Apps')}</h1>

            <SearchBar value={q} onChange={setQ} placeholder={t('appstore.searchApps', 'Search apps')} className="mx-4 mb-1.5" />

            <SegmentedControl
                value={filter}
                onChange={setFilter}
                options={[{ value: 'all', label: t('appstore.all', 'All') }, { value: 'notInstalled', label: t('appstore.notInstalled', 'Not Installed') }]}
                className="mx-4 mb-2"
            />

            <div className="relative min-h-0 flex-1 overflow-hidden">
                <div className="absolute inset-0 overflow-y-auto no-scrollbar px-4 pb-6">
                    <div key={filter} className="animate-swipe-in-left">
                {list.length === 0 ? (
                    <p className="mt-10 text-center text-[15px] text-ios-gray">
                        {!query && filter === 'notInstalled' ? t('appstore.allAppsInstalled', 'All apps installed') : t('appstore.noAppsFound', 'No apps found')}
                    </p>
                ) : (
                    <div className="overflow-hidden rounded-[10px] bg-surface">
                        {list.map((a, i) => {
                            const isInstalled = !!a.base || installed.has(a.id);
                            const status = downloadStatus[a.id];
                            const isDownloading = status !== undefined;
                            const isQueued = status === 'queued';
                            const locked = !isInstalled && lockedNetwork(a) !== null;
                            return (
                                <div key={a.id} className={`flex items-center gap-3.5 py-2.5 pl-3.5 ${i < list.length - 1 ? 'border-b border-black/10 dark:border-white/10' : ''}`}>
                                    <button type="button" onClick={() => setSelectedId(a.id)} aria-label={t('appstore.appDetails', '{label} details', { label: appLabel(a) })} className="shrink-0 active:opacity-60">
                                        <StoreIcon icon={a.icon} />
                                    </button>
                                    <div className="flex min-w-0 flex-1 items-center gap-3 pr-3.5">
                                        <button type="button" onClick={() => setSelectedId(a.id)} className="min-w-0 flex-1 text-left active:opacity-60">
                                            <div className="flex items-center gap-1.5">
                                                <span className="min-w-0 truncate text-[23px] font-medium leading-tight text-black dark:text-white">{appLabel(a)}</span>
                                                {locked && <Lock className="h-[15px] w-[15px] shrink-0 text-black/45 dark:text-white/45" role="img" aria-label={t('appstore.wifiOnly', 'Wi-Fi only')} />}
                                            </div>
                                            <div className="truncate text-[15px] leading-snug text-black/65 dark:text-white/65">{descOf(a.id)}</div>
                                        </button>
                                        {isDownloading ? (
                                            <div className={`relative flex shrink-0 items-center justify-center text-ios-blue ${isQueued ? 'animate-pulse' : ''}`} style={{ width: 40, height: 40 }} aria-label={isQueued ? t('appstore.waitingToDownload', 'Waiting to download') : t('appstore.downloading', 'Downloading')}>
                                                <DownloadRing id={a.id} queued={isQueued} />
                                                <div className="absolute h-[8px] w-[8px] rounded-[1.5px] bg-ios-blue" />
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => (isInstalled ? onOpenApp(a.id) : installGuarded(a.id))}
                                                className={`shrink-0 rounded-full bg-black/[0.08] px-5 py-2 text-[15px] font-bold uppercase tracking-wide text-ios-blue dark:bg-white/15 active:opacity-60 ${!isInstalled && (!hasData || locked) ? 'opacity-40' : ''}`}
                                            >
                                                {isInstalled ? t('appstore.open', 'Open') : t('appstore.get', 'Get')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                    </div>
                </div>
            </div>

            {selected && (
                <AppDetail
                    app={selected}
                    desc={descOf(selected.id)}
                    installed={!!selected.base || installed.has(selected.id)}
                    downloadProgress={selectedProgress}
                    onBack={() => setSelectedId(null)}
                    onInstall={installGuarded}
                    canDownload={hasData && lockedNetwork(selected) === null}
                    wifiLocked={lockedNetwork(selected) !== null}
                    onOpen={onOpenApp}
                />
            )}

            {wifiLockId && (
                <AlertDialog
                    title={t('appstore.wifiOnlyTitle', 'Wi-Fi Required')}
                    message={t('appstore.wifiOnlyBody', 'This app is only available on {ssid}. Connect to that network to download it.', { ssid: ssidOf(wifiLockId) })}
                    confirmLabel={t('appstore.ok', 'OK')}
                    hideCancel
                    onCancel={() => setWifiLockId(null)}
                    onConfirm={() => setWifiLockId(null)}
                />
            )}

            {noServiceOpen && (
                <AlertDialog
                    title={t('appstore.noServiceTitle', 'No Service')}
                    message={t('appstore.noServiceBody', 'You need a signal to download apps. Try again once you are back in coverage.')}
                    confirmLabel={t('appstore.ok', 'OK')}
                    hideCancel
                    onCancel={() => setNoServiceOpen(false)}
                    onConfirm={() => setNoServiceOpen(false)}
                />
            )}
        </div>
    );
}

function StoreIcon({ icon }: { icon: string }) {
    return (
        <div className="shrink-0 overflow-hidden" style={{ width: 66, height: 66, borderRadius: '27.6%', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.10)' }}>
            <div style={{ width: 60, height: 60, transform: 'scale(1.1)', transformOrigin: '0 0' }}>
                <AppIconSVG icon={icon} />
            </div>
        </div>
    );
}
