import { useState } from 'react';
import { ChevronRight, Lock } from 'lucide-react';

import { t } from '@/i18n';
import { formatClockTime, formatLongDate, useClock } from '@/hooks/useClock';
import { useIosPush } from '@/hooks/useIosPush';
import { PushLayer } from '../SettingsSubPage';
import { useTheme } from '@/stores/themeStore';
import { resolveWallpaper } from '@/shell/wallpapers';
import { AppIconSVG } from '@/shell/AppIconSVG';
import { Toggle } from '@/ui/Toggle';
import { WallpaperPickerPage } from './WallpaperPickerPage';
import { NavBar } from '@/ui/NavBar';

const GRID_APPS = [
    'settings', 'appstore', 'clock',    'mail',
    'weather',  'safari',   'maps',     'camera',
    'music',    'photos',   'notes',    'calendar',
    'phone',    'messages', 'bank',     'wallet',
    'settings', 'appstore', 'clock',    'mail',   // 5th row (loops)
];
const DOCK_APPS = ['phone', 'messages', 'camera', 'photos'];

export function WallpaperPage({ onBack }: { onBack: () => void }) {
    const { goBack, pageStyle } = useIosPush(onBack);
    const { wallpaper, blurHomescreen, setBlurHomescreen } = useTheme('wallpaper', 'blurHomescreen', 'setBlurHomescreen');
    const [showPicker, setShowPicker] = useState(false);

    const now  = useClock();
    const time = formatClockTime(now, true);
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
                            <LockThumb  wallpaper={wallpaper} time={time} date={date} />
                            <HomeThumb  wallpaper={wallpaper} />
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


function LockThumb({ wallpaper, time, date }: { wallpaper: string; time: string; date: string }) {
    return (
        <div className="relative flex-1 overflow-hidden rounded-[12px] shadow-md" style={{ aspectRatio: '390/844' }}>
            <img src={resolveWallpaper(wallpaper)} className="absolute inset-0 h-full w-full object-cover" alt="" draggable={false} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/20" />

            <div className="relative mt-4 flex justify-center">
                <Lock className="h-[13px] w-[13px] text-white drop-shadow" strokeWidth={2.5} />
            </div>
            <div className="relative mt-1 text-center">
                <span className="text-white drop-shadow" style={{ fontSize: 26, fontWeight: 200, letterSpacing: -0.5 }}>
                    {time}
                </span>
            </div>
            <div className="relative mt-0.5 text-center">
                <span className="text-[9.5px] font-normal text-white/85 drop-shadow">{date}</span>
            </div>
        </div>
    );
}


function HomeThumb({ wallpaper }: { wallpaper: string }) {
    return (
        <div className="relative flex-1 overflow-hidden rounded-[12px] shadow-md" style={{ aspectRatio: '390/844' }}>
            <img src={resolveWallpaper(wallpaper)} className="absolute inset-0 h-full w-full object-cover" alt="" draggable={false} />
            <div className="absolute inset-0 bg-gradient-to-b from-black/10 to-black/35" />

            <div className="relative mt-4 grid grid-cols-4 gap-[4px] px-2">
                {GRID_APPS.map((id, i) => (
                    <div key={i} className="flex justify-center">
                        <MiniIcon id={id} size={26} />
                    </div>
                ))}
            </div>

            <div className="absolute inset-x-2 bottom-2.5">
                <div className="flex items-center justify-around rounded-[10px] border border-white/20 bg-white/25 px-2 py-2 backdrop-blur-md">
                    {DOCK_APPS.map(id => (
                        <MiniIcon key={id} id={id} size={28} />
                    ))}
                </div>
            </div>
        </div>
    );
}


function MiniIcon({ id, size = 26 }: { id: string; size?: number }) {
    const SVG_SIZE = 60;
    const scale    = size / SVG_SIZE;
    return (
        <div
            className="overflow-hidden"
            style={{ borderRadius: '27.6%', width: size, height: size, flexShrink: 0, position: 'relative' }}
        >
            <div style={{
                position: 'absolute',
                top: 0, left: 0,
                width: SVG_SIZE, height: SVG_SIZE,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
            }}>
                <AppIconSVG icon={id} />
            </div>
        </div>
    );
}
