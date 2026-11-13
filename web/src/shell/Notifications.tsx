import { useEffect, useRef, useState } from 'react';
import type { ComponentProps, PointerEvent as ReactPointerEvent } from 'react';
import { AlertTriangle, Bell } from 'lucide-react';

import { AppIconSVG } from './AppIconSVG';
import { t } from '@/i18n';
import { localizeShareVars } from '@/i18n/dynamicLabels';
import { useStreamerHidden } from '@/stores/themeStore';
import { useNotificationStore } from '@/stores/notificationStore';


export interface NotificationItem {
    id:     string;
    app?:   string;
    image?: string;
    title:  string;
    body?:  string;
    time?:  string;
    appId?: string;
    link?:  Record<string, unknown>;
    emergency?: boolean;
    /** Pocket buzz from a carried-but-not-active phone: transient banner only, never this
     *  phone's lockscreen stack or badges. */
    otherPhone?: boolean;
    /** Pocket buzz: the buzzing phone's frame colour, tinting the closed-shell peek. */
    phoneColor?: string;
    /** Pocket buzz: the buzzing phone's profile key - the banner parks on that profile's
     *  banked lockscreen stack so it shows when THAT phone is next opened. */
    profileKey?: string;
}

const SHOW_MS = 5000;

export interface NotifText {
    titleKey?:  string;
    title:      string;
    titleVars?: Record<string, string | number>;
    bodyKey?:   string;
    body?:      string;
    bodyVars?:  Record<string, string | number>;
}

export function resolveNotifText(data: NotifText): { title: string; body?: string } {
    const title = data.titleKey ? t(data.titleKey, data.title, data.titleVars) : fill(data.title, data.titleVars);
    if (data.body === undefined) return { title };
    const body = data.bodyKey ? t(data.bodyKey, data.body, localizeShareVars(data.bodyKey, data.bodyVars)) : fill(data.body, data.bodyVars);
    return { title, body };
}

function fill(text: string, vars?: Record<string, string | number>): string {
    if (!vars) return text;
    let out = text;
    for (const k in vars) out = out.split('{' + k + '}').join(String(vars[k]));
    return out;
}

export function NotifIcon({ item, size = 38 }: { item: NotificationItem; size?: number }) {
    const style = { width: size, height: size };
    if (item.emergency) {
        return (
            <span className="flex shrink-0 items-center justify-center rounded-[11px] bg-[#FF453A] text-white" style={style}>
                <AlertTriangle style={{ width: size * 0.56, height: size * 0.56 }} strokeWidth={2.4} />
            </span>
        );
    }
    if (item.image) {
        return (
            <span className="squircle shrink-0" style={style}>
                <img src={item.image} alt="" draggable={false} className="h-full w-full object-cover" />
            </span>
        );
    }
    // `app` is a display label ("Weazel News", or "<Color> Phone" on a pocket buzz) while `appId`
    // is the registry id the icon set is keyed by, so the id wins wherever a sender supplies one.
    // The lowercase fold catches senders that pass only a label matching an id.
    const icon = item.appId ?? item.app?.toLowerCase();
    if (icon) {
        return (
            <span className="squircle shrink-0" style={style}>
                <AppIconSVG icon={icon} size={size} />
            </span>
        );
    }
    return (
        <span className="flex shrink-0 items-center justify-center rounded-[11px] bg-ios-red text-white" style={style}>
            <Bell style={{ width: size * 0.52, height: size * 0.52 }} fill="currentColor" strokeWidth={0} />
        </span>
    );
}

function NotificationBanner({ item, onDismiss, onOpen }: {
    item:      NotificationItem;
    onDismiss: () => void;
    onOpen:    () => void;
}) {
    const [exiting, setExiting] = useState(false);
    const [drag, setDrag]       = useState(0);
    const hidePreview = useStreamerHidden('previews');
    const startY  = useRef<number | null>(null);
    const dragging = useRef(false);
    const moved    = useRef(false);

    function dismiss() {
        if (exiting) return;
        setExiting(true);
        window.setTimeout(onDismiss, 320);
    }

    useEffect(() => {
        if (item.emergency) return;
        const t = window.setTimeout(dismiss, SHOW_MS);
        return () => window.clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function onDown(e: ReactPointerEvent) {
        startY.current = e.clientY;
        dragging.current = true;
        moved.current = false;
        e.currentTarget.setPointerCapture(e.pointerId);
    }
    function onMove(e: ReactPointerEvent) {
        if (!dragging.current || startY.current == null) return;
        const dy = e.clientY - startY.current;
        if (Math.abs(dy) > 4) moved.current = true;
        setDrag(Math.min(0, dy));
    }
    function onUp() {
        if (!dragging.current) return;
        dragging.current = false;
        if (drag < -44)      dismiss();
        else if (!moved.current) onOpen();
        else                 setDrag(0);
    }

    const style = exiting
        ? { animation: 'notif-out 0.3s cubic-bezier(0.32,0,0.68,1) forwards' as const }
        : drag
        ? { transform: `translateY(${drag}px)`, transition: dragging.current ? 'none' : 'transform 0.25s cubic-bezier(0.32,0.72,0,1)' }
        : { animation: 'notif-in 0.5s cubic-bezier(0.16,1.16,0.3,1) both' as const };

    return (
        <div
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className={[
                'flex cursor-pointer items-start gap-2.5 rounded-[22px] bg-elevated/75 px-3 py-3 shadow-[0_10px_34px_rgba(0,0,0,0.20)] backdrop-blur-2xl backdrop-saturate-150 dark:bg-elevated/75',
                item.emergency
                    ? 'ring-[1.5px] ring-inset ring-ios-red/75 dark:ring-ios-red/75'
                    : 'ring-1 ring-black/[0.06] dark:ring-white/10',
            ].join(' ')}
            style={{ willChange: 'transform', ...style }}
        >
            <NotifIcon item={item} />
            <div className="min-w-0 flex-1 pt-px">
                {item.emergency && (
                    <span className="mb-[1px] block text-[12.5px] font-bold uppercase leading-[1.15] tracking-[0.09em] text-ios-red">
                        {t('shell.emergencyAlert', 'Emergency Alert')}
                    </span>
                )}
                <div className="flex items-baseline justify-between gap-2">
                    <span dir="auto" className="truncate text-[15px] font-semibold text-black dark:text-white">{item.title}</span>
                    <span className="shrink-0 text-[13px] text-black/45 dark:text-white/45">{item.time ?? t('shell.now','now')}</span>
                </div>
                {item.body && (
                    <p dir="auto" className="mt-0.5 line-clamp-4 text-[15px] leading-snug text-black/80 dark:text-white/85">
                        {hidePreview ? t('shell.notificationHidden', 'Notification hidden') : item.body}
                    </p>
                )}
            </div>
        </div>
    );
}

export function NotificationHost({ items, placement = 'phone', onDismiss, onOpen }: {
    items:     NotificationItem[];
    placement?: 'phone' | 'screen';
    onDismiss: (id: string) => void;
    onOpen:    (item: NotificationItem) => void;
}) {
    if (!items.length) return null;

    const wrap = placement === 'phone'
        ? 'pointer-events-none absolute inset-x-0 top-[52px] z-[55] flex flex-col items-center gap-2 px-2.5 font-sf'
        : 'pointer-events-none fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-2 px-2.5 font-sf';

    return (
        <div className={wrap}>
            {items.map(item => (
                <div key={item.id} className="pointer-events-auto w-full max-w-[420px]">
                    <NotificationBanner item={item} onDismiss={() => onDismiss(item.id)} onOpen={() => onOpen(item)} />
                </div>
            ))}
        </div>
    );
}

export function BannerHost(props: Omit<ComponentProps<typeof NotificationHost>, 'items'>) {
    const items = useNotificationStore(s => s.banners);
    return <NotificationHost {...props} items={items} />;
}
