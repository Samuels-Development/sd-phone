import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { device } from '@device';
import { t } from '@/i18n';
import { useIosPush } from '@/hooks/useIosPush';
import { AppIconSVG } from '@/shell/AppIconSVG';
import { GroupCard } from '@/ui/ListGroup';
import { NavBar } from '@/ui/NavBar';
import { AppNotificationsPage } from './AppNotificationsPage';
import { PushLayer } from '../SettingsSubPage';

interface AppEntry { id: string; label: string }

const APPS: AppEntry[] = [
    { id: 'appstore', label: 'App Store' },
    { id: 'bank',     label: 'Bank'      },
    { id: 'calendar', label: 'Calendar'  },
    { id: 'camera',   label: 'Camera'    },
    { id: 'clock',    label: 'Clock'     },
    { id: 'mail',     label: 'Mail'      },
    { id: 'maps',     label: 'Maps'      },
    { id: 'messages', label: 'Messages'  },
    { id: 'music',    label: 'Music'     },
    { id: 'notes',    label: 'Notes'     },
    { id: 'phone',    label: 'Phone'     },
    { id: 'photos',   label: 'Photos'    },
    { id: 'review',     label: 'Review'    },
    { id: 'safari',   label: 'Safari'    },
    { id: 'settings', label: 'Settings'  },
    { id: 'wallet',   label: 'Wallet'    },
    { id: 'weather',  label: 'Weather'   },
].filter(a => device.calls || a.id !== 'phone')
    .sort((a, b) => a.label.localeCompare(b.label));

export function NotificationsPage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);

    const [openApp, setOpenApp] = useState<AppEntry | null>(null);

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

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 px-4 pb-10">
                    <p className="mb-2 px-1 text-[13px] uppercase tracking-wider text-ios-gray">
                        {t('settings.notifications', 'Notifications')}
                    </p>
                    <GroupCard>
                        {APPS.map((app, i) => (
                            <button
                                key={app.id}
                                type="button"
                                onClick={() => setOpenApp(app)}
                                className="relative flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-black/5 dark:active:bg-white/5"
                            >
                                <NotifIcon iconId={app.id} />
                                <span className="flex-1 text-[17px] font-normal text-black dark:text-white">
                                    {app.label}
                                </span>
                                <ChevronRight className="h-[17px] w-[17px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                                {i < APPS.length - 1 && (
                                    <div
                                        className="pointer-events-none absolute bottom-0 right-0 bg-ios-gray4 dark:bg-control"
                                        style={{ left: 0, height: '0.5px' }}
                                    />
                                )}
                            </button>
                        ))}
                    </GroupCard>
                </div>
            </div>
        </PushLayer>
    );
}

function NotifIcon({ iconId }: { iconId: string }) {
    const SIZE = 32, SVG_SIZE = 60, scale = SIZE / SVG_SIZE;
    return (
        <div style={{ width: SIZE, height: SIZE, borderRadius: '27.6%', overflow: 'hidden', flexShrink: 0, position: 'relative', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: SVG_SIZE, height: SVG_SIZE, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <AppIconSVG icon={iconId} />
            </div>
        </div>
    );
}
