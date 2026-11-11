import { useMemo, useState } from 'react';
import { ChevronRight, SearchX } from 'lucide-react';

import { appLabel, getCatalogVersion, t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { useSessionState } from '@/hooks/useSessionState';
import { AppIconSVG } from '@/shell/AppIconSVG';
import { EmptyState } from '@/ui/EmptyState';
import { GroupCard } from '@/ui/ListGroup';
import { NavBar } from '@/ui/NavBar';
import { SearchBar } from '@/ui/SearchBar';
import { useInstalledApps } from '@/stores/installedAppsStore';
import { useNotifPrefsStore } from '@/stores/notifPrefsStore';
import { useTheme } from '@/stores/themeStore';
import { AppNotificationsPage, type AppEntry } from './AppNotificationsPage';
import { PushLayer } from '../SettingsSubPage';

export function NotificationsPage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);

    const installed = useInstalledApps();
    const { appLabels } = useTheme('appLabels');
    const catalogVersion = getCatalogVersion();
    const prefs     = useNotifPrefsStore(s => s.prefs);
    const [openApp, setOpenApp] = useState<AppEntry | null>(null);
    const [query, setQuery] = useSessionState('settings:notifSearch', '');

    const all = useMemo(
        () => installed
            .map(a => ({ id: a.id, get label() { return appLabel(a); } }))
            .sort((a, b) => a.label.localeCompare(b.label)),
        [installed, appLabels, catalogVersion],
    );

    const q = query.trim().toLowerCase();
    const apps = useMemo(
        () => (q ? all.filter(a => a.label.toLowerCase().includes(q) || a.id.toLowerCase().includes(q)) : all),
        [all, q],
    );

    const subNode = openApp
        ? <AppNotificationsPage app={openApp} onBack={() => setOpenApp(null)} />
        : null;

    return (
        <PushLayer pageStyle={pageStyle} className="z-20" sub={subNode}>
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar
                backLabel={t('settings.settings', 'Settings')}
                onBack={goBack}
                title={t('settings.notifications', 'Notifications')}
                hairline
            />

            {all.length > 0 && (
                <SearchBar
                    value={query}
                    onChange={setQuery}
                    placeholder={t('settings.searchApps', 'Search apps')}
                    className="mx-4 mb-1 mt-3 shrink-0"
                />
            )}

            <div className="flex-1 overflow-y-auto no-scrollbar">
                {apps.length === 0 ? (
                    <EmptyState
                        icon={SearchX}
                        title={t('settings.noResultsTitle', 'No Results')}
                        subtitle={t('settings.noResults', 'No results for “{query}”', { query: query.trim() })}
                    />
                ) : (
                <div className="mt-4 px-4 pb-10">
                    <p className="mb-2 px-1 text-[13px] uppercase tracking-wider text-ios-gray">
                        {t('settings.notificationStyle', 'Notification Style')}
                    </p>
                    <GroupCard>
                        {apps.map((app, i) => {
                            const pref  = prefs[app.id];
                            const off   = pref?.enabled === false;
                            const quiet = pref?.sounds === false;
                            return (
                                <button
                                    key={app.id}
                                    type="button"
                                    onClick={() => setOpenApp(app)}
                                    className="relative flex w-full items-center gap-3.5 px-4 py-3 text-start active:bg-black/5 dark:active:bg-white/5"
                                >
                                    <NotifIcon iconId={app.id} />
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate text-[17px] font-normal text-black dark:text-white">
                                            {app.label}
                                        </span>
                                        <span className="text-[13px] text-ios-gray">
                                            {off
                                                ? t('settings.notifsOff', 'Off')
                                                : quiet
                                                    ? t('settings.notifsBannersOnly', 'Banners')
                                                    : t('settings.notifsBanners', 'Banners, Sounds')}
                                        </span>
                                    </span>
                                    <ChevronRight className="h-[17px] w-[17px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                                    {i < apps.length - 1 && (
                                        <div
                                            className="pointer-events-none absolute bottom-0 end-0 bg-ios-gray4 dark:bg-control"
                                            style={{ insetInlineStart: 0, height: '0.5px' }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </GroupCard>
                </div>
                )}
            </div>
        </PushLayer>
    );
}

function NotifIcon({ iconId }: { iconId: string }) {
    const SIZE = 44, SVG_SIZE = 60, scale = SIZE / SVG_SIZE;
    return (
        <div style={{ width: SIZE, height: SIZE, borderRadius: '23%', overflow: 'hidden', flexShrink: 0, position: 'relative', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: SVG_SIZE, height: SVG_SIZE, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <AppIconSVG icon={iconId} />
            </div>
        </div>
    );
}
