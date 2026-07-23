import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Camera, ChevronRight, Flashlight } from 'lucide-react';

import { t } from '@/i18n';
import { formatClockTime, formatLongDate, useClock } from '@/hooks/useClock';
import { useIosPush } from '@/hooks/useIosPush';
import { PushLayer } from '../SettingsSubPage';
import { useTheme } from '@/stores/themeStore';
import { resolveWallpaper } from '@/shell/wallpapers';
import { Clockface } from '@/shell/lockClock';
import { AppIconSVG } from '@/shell/AppIconSVG';
import { Toggle } from '@/ui/Toggle';
import { WallpaperPickerPage } from './WallpaperPickerPage';
import { NavBar } from '@/ui/NavBar';

// The previews are full-size 440x956 replicas of the real Lockscreen/Homescreen render,
// scale-transformed to thumbnail size - geometry constants below mirror shell/Homescreen.tsx
// and shell/Lockscreen.tsx so the previews can't drift from the real screens.
const SW = 440;
const SH = 956;

// Default first homescreen page: the first 12 non-dock apps in catalog order.
const PAGE_APPS = [
    { icon: 'mail',       label: 'Mail' },
    { icon: 'maps',       label: 'Maps' },
    { icon: 'compass',    label: 'Compass' },
    { icon: 'music',      label: 'Music' },
    { icon: 'weather',    label: 'Weather' },
    { icon: 'clock',      label: 'Clock' },
    { icon: 'calendar',   label: 'Calendar' },
    { icon: 'notes',      label: 'Notes' },
    { icon: 'voicememos', label: 'Voice Memos' },
    { icon: 'bank',       label: 'Bank' },
    { icon: 'health',     label: 'Health' },
    { icon: 'documents',  label: 'Files' },
];
const DOCK_APPS = ['phone', 'messages', 'camera', 'photos'];

export function WallpaperPage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const { wallpaper, blurHomescreen, setBlurHomescreen, lockClock, hour24 } =
        useTheme('wallpaper', 'blurHomescreen', 'setBlurHomescreen', 'lockClock', 'hour24');
    const [showPicker, setShowPicker] = useState(false);

    const now  = useClock();
    const time = formatClockTime(now, hour24);
    const date = formatLongDate(now);

    const subNode = showPicker ? <WallpaperPickerPage onBack={() => setShowPicker(false)} /> : null;

    return (
        <PushLayer pageStyle={pageStyle} className="z-20" innerClassName="text-black dark:text-white" sub={subNode}>
            <div className="h-11 shrink-0" aria-hidden />

            <NavBar backLabel={t('settings.settings', 'Settings')} onBack={goBack} title={t('settings.wallpaper', 'Wallpaper')} hairline />

            <div className="flex-1 overflow-y-auto no-scrollbar">
                <div className="mt-6 flex flex-col gap-5 px-4 pb-10">

                    <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                        <button
                            type="button"
                            onClick={() => setShowPicker(true)}
                            className="relative flex w-full items-center px-4 py-3.5 active:bg-black/5 dark:active:bg-white/5"
                        >
                            <span className="flex-1 text-left text-[17px] text-black dark:text-white">
                                {t('settings.chooseNewWallpaper', 'Choose a New Wallpaper')}
                            </span>
                            <ChevronRight className="h-[17px] w-[17px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                        </button>
                    </div>

                    <div className="overflow-hidden rounded-[10px] bg-[#e5e5e5] dark:bg-surface">
                        <div className="flex gap-3 p-4">
                            <PreviewThumb>
                                <LockPreview wallpaper={wallpaper} time={time} date={date} lockClock={lockClock} />
                            </PreviewThumb>
                            <PreviewThumb>
                                <HomePreview wallpaper={wallpaper} blurred={blurHomescreen} />
                            </PreviewThumb>
                        </div>

                        <div className="h-[0.5px] bg-ios-gray4 dark:bg-control" />

                        <button
                            type="button"
                            onClick={() => setBlurHomescreen(!blurHomescreen)}
                            className="flex w-full items-center px-4 py-3 active:bg-black/5 dark:active:bg-white/5"
                        >
                            <span className="flex-1 text-left text-[17px] font-normal text-black dark:text-white">
                                {t('settings.blurHomescreen', 'Blur Homescreen')}
                            </span>
                            <div className="pointer-events-none">
                                <Toggle on={blurHomescreen} />
                            </div>
                        </button>
                    </div>

                </div>
            </div>
        </PushLayer>
    );
}


// Renders children on a full-size 440x956 stage, scale-transformed to the thumb's measured
// width - so every child uses the real screens' CSS values verbatim.
function PreviewThumb({ children }: { children: ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(0);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => setScale(el.offsetWidth / SW);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return (
        <div ref={ref} className="pointer-events-none relative flex-1 select-none overflow-hidden rounded-[12px] shadow-md" style={{ aspectRatio: `${SW}/${SH}` }}>
            {scale > 0 && (
                <div className="absolute left-0 top-0" style={{ width: SW, height: SH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                    {children}
                </div>
            )}
        </div>
    );
}


function DynamicIsland() {
    return <div className="absolute left-1/2 top-[11px] -translate-x-1/2 rounded-full bg-black" style={{ width: 126, height: 37 }} />;
}

function HomeIndicatorBar() {
    return (
        <div className="absolute inset-x-0 bottom-0 flex justify-center pb-[5px]">
            <div className="h-[5px] w-[134px] rounded-full bg-white/75" />
        </div>
    );
}


function LockPreview({ wallpaper, time, date, lockClock }: {
    wallpaper: string;
    time:      string;
    date:      string;
    lockClock: Parameters<typeof Clockface>[0]['config'];
}) {
    return (
        <div className="absolute inset-0">
            <img src={resolveWallpaper(wallpaper)} className="absolute inset-0 h-full w-full object-cover" alt="" draggable={false} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/5 to-black/55" />

            <div className={`relative flex pt-28 ${lockClock.layout === 'left' ? 'justify-start pl-9' : lockClock.layout === 'right' ? 'justify-end pr-9' : 'justify-center'}`}>
                <Clockface time={time} date={date} config={lockClock} size={94} />
            </div>

            <div className="absolute bottom-[46px] left-0 right-0 flex items-center justify-between px-10">
                <QuickCircle><Flashlight className="h-[29px] w-[29px] text-white" strokeWidth={2.2} /></QuickCircle>
                <QuickCircle><Camera className="h-[29px] w-[29px] text-white" strokeWidth={2.2} /></QuickCircle>
            </div>

            <DynamicIsland />
            <HomeIndicatorBar />
        </div>
    );
}

function QuickCircle({ children }: { children: ReactNode }) {
    return (
        <div
            className="flex h-[70px] w-[70px] items-center justify-center rounded-full bg-black/30 ring-1 ring-inset ring-white/[0.12] backdrop-blur-2xl backdrop-saturate-150"
            style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.28)' }}
        >
            {children}
        </div>
    );
}


function HomePreview({ wallpaper, blurred }: { wallpaper: string; blurred: boolean }) {
    return (
        <div className="absolute inset-0 overflow-hidden">
            <div
                className="absolute inset-0"
                style={{
                    backgroundImage:    `url(${resolveWallpaper(wallpaper)})`,
                    backgroundSize:     'cover',
                    backgroundPosition: 'center',
                    filter:     blurred ? 'blur(28px) saturate(0.85)' : undefined,
                    transform:  blurred ? 'scale(1.08)'               : undefined,
                    transition: 'filter 0.35s ease, transform 0.35s ease',
                }}
            />
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-black/40 to-transparent" />

            {PAGE_APPS.map((app, i) => (
                <div
                    key={app.icon}
                    className="absolute"
                    style={{ left: 28 + (i % 4) * 102, top: 78 + Math.floor(i / 4) * 122, width: 78 }}
                >
                    <PreviewIcon icon={app.icon} label={app.label} />
                </div>
            ))}

            <div className="absolute bottom-[132px] left-0 right-0 flex justify-center">
                <div className="flex items-center gap-[7px] rounded-full bg-black/35 px-2.5 py-[7px] shadow-sm backdrop-blur-md">
                    <div className="h-[7px] w-[7px] rounded-full bg-white" />
                    <div className="h-[7px] w-[7px] rounded-full bg-white opacity-[0.38]" />
                </div>
            </div>

            <div className="absolute bottom-5 left-4 right-4">
                <div className="flex items-center justify-around rounded-[28px] border border-white/20 bg-white/15 px-4 py-3.5 backdrop-blur-2xl">
                    {DOCK_APPS.map(id => <PreviewIcon key={id} icon={id} />)}
                </div>
            </div>

            <DynamicIsland />
            <HomeIndicatorBar />
        </div>
    );
}


// Static replica of shell/AppIcon.tsx's resting look (tile, radius, shadow, label).
function PreviewIcon({ icon, label }: { icon: string; label?: string }) {
    return (
        <div className="flex w-full flex-col items-center gap-[7px]">
            <div
                className="relative h-[78px] w-[78px] overflow-hidden"
                style={{
                    borderRadius: '27.6%',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.38), 0 0 0 0.5px rgba(0,0,0,0.12)',
                }}
            >
                <div style={{ width: 60, height: 60, transform: 'scale(1.3)', transformOrigin: '0 0' }}>
                    <AppIconSVG icon={icon} />
                </div>
            </div>
            {label && (
                <span
                    className="w-full truncate text-center font-sf text-[13px] font-semibold tracking-[0.01em] text-white"
                    style={{ textShadow: '0 0 2px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.95), 0 2px 6px rgba(0,0,0,0.5)' }}
                >
                    {label}
                </span>
            )}
        </div>
    );
}
