import { useEffect, useState } from 'react';
import { ChevronLeft, Lock } from 'lucide-react';

import { AppIconSVG } from '@/shell/AppIconSVG';
import { CircularProgress } from '@/ui/CircularProgress';
import { getCustomApp } from '@/stores/customAppsStore';
import { t, appLabel } from '@/i18n';
import type { AppDef } from '@/core/types';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

const HEAVY = new Set(['cookie', 'wordle', 'flappy', 'blocks', 'casino', 'climber', 'connectfour', 'photogram', 'vibez', 'cherry', 'birdy', 'camera', 'maps', 'music', 'weazelnews', 'streaks']);
const LIGHT = new Set(['calculator', 'notes', 'clock', 'weather', 'voicememos', 'settings', 'calendar']);

function appSize(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
    const base = HEAVY.has(id) ? 90 : LIGHT.has(id) ? 8 : 40;
    const span = HEAVY.has(id) ? 160 : LIGHT.has(id) ? 30 : 100;
    const mb = base + (h % (span * 10)) / 10;
    return t('appstore.appSize', '{size} MB', { size: mb.toFixed(1) });
}

export function AppDetail({ app, desc, installed, downloadProgress, onBack, onInstall, canDownload = true, wifiLocked, onOpen }: {
    app:               AppDef;
    desc:              string;
    installed:         boolean;
    downloadProgress?: number;
    onBack:            () => void;
    onInstall:         (id: string) => void;
    canDownload?:      boolean;
    wifiLocked?:       boolean;
    onOpen:            (id: string) => void;
}) {
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, []);

    const downloading = downloadProgress !== undefined;
    const queued = downloading && downloadProgress < 0;

    const custom = getCustomApp(app.id);
    const sizeValue = custom?.size ? t('appstore.appSize', '{size} MB', { size: (custom.size / 1000).toFixed(1) }) : appSize(app.id);
    const providerValue = custom?.developer || t('appstore.sdPhone', 'SD Phone');

    return (
        <div
            className="absolute inset-0 z-20 flex flex-col bg-base font-sf"
            style={{
                transform:  shown ? 'translateX(0)' : 'translateX(100%)',
                transition: 'transform 0.32s cubic-bezier(0.32,0.72,0,1)',
            }}
            onTransitionEnd={() => { if (!shown) onBack(); }}
        >
            <StatusBarSpacer />

            <div className="flex items-center px-3 pb-1">
                <button type="button" onClick={() => setShown(false)} className="flex items-center text-ios-blue active:opacity-60">
                    <ChevronLeft className="h-[28px] w-[28px]" strokeWidth={2.4} />
                    <span className="-ml-0.5 text-[18px]">{t('appstore.apps', 'Apps')}</span>
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-5 pb-8">
                <div className="flex items-center gap-4 pt-2">
                    <div className="shrink-0 overflow-hidden" style={{ width: 100, height: 100, borderRadius: '22.5%', boxShadow: '0 1px 5px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.08)' }}>
                        <div style={{ width: 60, height: 60, transform: 'scale(1.6667)', transformOrigin: '0 0' }}>
                            <AppIconSVG icon={app.icon} />
                        </div>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <span className="min-w-0 truncate text-[24px] font-semibold leading-tight text-black dark:text-white">{appLabel(app)}</span>
                            {wifiLocked && !installed && <Lock className="h-[16px] w-[16px] shrink-0 text-black/45 dark:text-white/45" role="img" aria-label={t('appstore.wifiOnly', 'Wi-Fi only')} />}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-black/65 dark:text-white/65">{desc}</div>
                        <div className="mt-3">
                            {downloading ? (
                                <div className={`relative flex h-[34px] w-[34px] items-center justify-center text-ios-blue ${queued ? 'animate-pulse' : ''}`} aria-label={queued ? t('appstore.waitingToDownload', 'Waiting to download') : t('appstore.downloading', 'Downloading')}>
                                    <CircularProgress progress={queued ? 0 : downloadProgress!} size={30} stroke={2.5} />
                                    <div className="absolute h-[8px] w-[8px] rounded-[1.5px] bg-ios-blue" />
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => (installed ? onOpen(app.id) : onInstall(app.id))}
                                    className={`rounded-full bg-ios-blue px-7 py-1.5 text-[15px] font-bold uppercase tracking-wide text-white active:opacity-70 ${!installed && !canDownload ? 'opacity-40' : ''}`}
                                >
                                    {installed ? t('appstore.open', 'Open') : t('appstore.get', 'Get')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {custom?.images && custom.images.length > 0 && (
                    <div className="-mx-1 mt-6 flex gap-3 overflow-x-auto no-scrollbar px-1 pb-1">
                        {custom.images.map((img, i) => (
                            <img key={i} src={img} alt="" draggable={false} className="h-[360px] w-auto shrink-0 rounded-[18px] object-cover shadow ring-1 ring-black/10 dark:ring-white/10" />
                        ))}
                    </div>
                )}

                <h2 className="mb-1 mt-8 text-[22px] font-bold text-black dark:text-white">{t('appstore.information', 'Information')}</h2>
                <InfoRow label={t('appstore.provider', 'Provider')}         value={providerValue} />
                <InfoRow label={t('appstore.size', 'Size')}             value={sizeValue} />
                {custom && custom.price != null && custom.price > 0 && (
                    <InfoRow label={t('appstore.price', 'Price')} value={t('appstore.priceValue', '${price}', { price: custom.price.toLocaleString() })} />
                )}
                <InfoRow label={t('appstore.compatibility', 'Compatibility')}    value={t('appstore.deviceCompatible', 'Compatible with your device')} />
                <InfoRow label={t('appstore.inAppPurchases', 'In-App Purchases')} value={t('appstore.no', 'No')} last />
            </div>
        </div>
    );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
    return (
        <div className={`flex items-center justify-between gap-4 py-3.5 ${last ? '' : 'border-b border-hairline/10'}`}>
            <span className="shrink-0 text-[18px] text-black/55 dark:text-white/55">{label}</span>
            <span className="truncate text-right text-[18px] font-medium text-black dark:text-white">{value}</span>
        </div>
    );
}
