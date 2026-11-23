import {
    Accessibility, Antenna, Bell, Bluetooth, Calendar,
    ChevronRight, Compass, CreditCard, Fingerprint, Gamepad2, Grid2x2, Hourglass,
    Image as ImageIcon, Key, Languages, LayoutGrid, ListTodo, Lock, Mail,
    MapPin, MessageCircle, Mic, Moon, Newspaper, PawPrint, Phone, Plane, Radar, Search,
    Settings2, ShoppingBag, Siren, SlidersHorizontal, Smartphone,
    Sparkles, StickyNote, Sun, User, Video, Volume2, Wifi, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { IconName, SettingsRowDef } from './data';
import { Toggle } from '@/ui/Toggle';
import { useTheme } from '@/stores/themeStore';

const ICONS: Record<IconName, LucideIcon> = {
    Plane, Wifi, Bluetooth, Antenna, Key, Bell, Volume2, Moon, Hourglass,
    Settings2, SlidersHorizontal, Sun, LayoutGrid, Accessibility, Search,
    Image: ImageIcon, Sparkles, Fingerprint, Siren,
    ShoppingBag, CreditCard, Gamepad2, Lock, Mail, User, Calendar, StickyNote,
    ListTodo, Mic, Phone, MessageCircle, Video, Compass, Newspaper, Languages,
    MapPin, Zap, PawPrint, Grid2x2, Radar, Smartphone,
};

export function SettingsRow({ row, divider, onPress }: { row: SettingsRowDef; divider: boolean; onPress?: () => void }) {
    const Icon = ICONS[row.icon];
    const hasSubtitle = Boolean(row.subtitle);
    const { airplaneMode, setAirplaneMode, focus, setFocus } = useTheme('airplaneMode', 'setAirplaneMode', 'focus', 'setFocus');
    const inlineToggle =
        row.id === 'airplane' ? { on: airplaneMode, onChange: setAirplaneMode }
        : row.id === 'focus'  ? { on: focus,        onChange: setFocus }
        : null;
    return (
        <button
            type="button"
            onClick={row.disabled ? undefined : onPress}
            disabled={row.disabled}
            aria-disabled={row.disabled}
            className={[
                'relative flex w-full items-center gap-3.5 px-4 text-start',
                row.disabled ? 'opacity-40' : 'active:bg-black/5 dark:active:bg-white/5',
                hasSubtitle ? 'py-3' : 'py-2.5',
            ].join(' ')}
        >
            <div
                className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[9px] shadow-sm"
                style={{ background: row.iconBg }}
            >
                <Icon className="h-[24px] w-[24px] text-white" strokeWidth={2.1} />
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center">
                <div className="flex items-center gap-1.5">
                    <span className="truncate text-[18px] font-normal leading-snug text-black dark:text-white">
                        {row.label}
                    </span>
                    {row.badge && (
                        <span className="flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-ios-red px-1 text-[12px] font-semibold text-white">
                            {row.badge}
                        </span>
                    )}
                </div>
                {row.subtitle && (
                    <span className="mt-0.5 text-[15px] font-normal leading-snug text-ios-gray">
                        {row.subtitle}
                    </span>
                )}
            </div>

            {inlineToggle ? (
                <Toggle on={inlineToggle.on} onChange={inlineToggle.onChange} />
            ) : (
                <>
                    {row.status && (
                        <span className="max-w-[120px] shrink-0 truncate text-[16px] font-normal text-ios-gray">
                            {row.status}
                        </span>
                    )}
                    <ChevronRight className="h-[19px] w-[19px] shrink-0 text-ios-gray3" strokeWidth={2.5} />
                </>
            )}

            {divider && (
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-ios-gray4 dark:bg-control"
                    style={{ height: '0.5px' }}
                />
            )}
        </button>
    );
}
