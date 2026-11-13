import { useRef } from 'react';
import { X } from 'lucide-react';

import { t } from '@/i18n';
import { formatClockTime, formatLongDate, useDisplayClock } from '@/hooks/useClock';
import { useTheme } from '@/stores/themeStore';
import { useNotificationStore } from '@/stores/notificationStore';
import { LockNotifCard } from './Lockscreen';
import type { NotificationItem } from './Notifications';

const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

export function NotificationCenter({ open, onClose, onOpen, onDismiss, onClearAll }: {
    open:        boolean;
    onClose:     () => void;
    onOpen:      (item: NotificationItem) => void;
    onDismiss:   (id: string) => void;
    onClearAll:  () => void;
}) {
    const items = useNotificationStore(s => s.lock);
    const { hour24 } = useTheme('hour24');
    const now = useDisplayClock();
    const start = useRef<number | null>(null);

    return (
        <div className={'absolute inset-0 z-[710] ' + (open ? '' : 'pointer-events-none')}>
            <div
                className="absolute"
                style={{
                    inset: -72,
                    backdropFilter: open ? 'blur(30px)' : 'blur(0px)',
                    WebkitBackdropFilter: open ? 'blur(30px)' : 'blur(0px)',
                    transition: `backdrop-filter 420ms ${EASE}, -webkit-backdrop-filter 420ms ${EASE}`,
                }}
            />
            <div
                className="absolute inset-0 bg-black/45"
                style={{ opacity: open ? 1 : 0, transition: `opacity 420ms ${EASE}` }}
                onClick={onClose}
            />

            <div
                className="absolute inset-0 flex flex-col"
                style={{
                    opacity: open ? 1 : 0,
                    transition: `opacity 320ms ${EASE}`,
                }}
                onPointerDown={e => { start.current = e.clientY; }}
                onPointerMove={e => {
                    if (start.current === null) return;
                    if (start.current - e.clientY > 40) { start.current = null; onClose(); }
                }}
                onPointerUp={() => { start.current = null; }}
            >
                <div style={{ height: 'var(--safe-top)' }} aria-hidden />

                <div className="relative shrink-0 px-6 pb-5 pt-3 text-center text-white">
                    <div className="text-[15px] font-semibold tracking-wide opacity-80">{formatLongDate(now)}</div>
                    <div className="mt-0.5 text-[62px] font-thin leading-none tracking-tight">{formatClockTime(now, hour24)}</div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('shell.closeNotifications', 'Close')}
                        className="absolute end-5 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur-md active:opacity-60"
                    >
                        <X className="h-5 w-5 text-white" strokeWidth={2.6} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4">
                    {items.length > 0 ? (
                        <div className="flex flex-col gap-2 pb-4">
                            {items.map(n => (
                                <LockNotifCard
                                    key={n.id}
                                    item={n}
                                    onOpen={() => { onClose(); onOpen(n); }}
                                    onDismiss={() => onDismiss(n.id)}
                                />
                            ))}

                            <button
                                type="button"
                                onClick={onClearAll}
                                className="mx-auto mt-2 rounded-full bg-white/15 backdrop-blur-md px-5 py-2 text-[15px] font-semibold text-white active:opacity-60"
                            >
                                {t('shell.clearAll', 'Clear All')}
                            </button>
                        </div>
                    ) : (
                        <p className="mt-16 text-center text-[16px] font-medium text-white/55">
                            {t('shell.noNotifications', 'No Notifications')}
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('shell.closeNotifications', 'Close')}
                    className="flex shrink-0 flex-col items-center gap-2 pb-5 pt-3 active:opacity-60"
                >
                    <span className="text-[13px] font-medium text-white/60">{t('shell.swipeUpToClose', 'Swipe up to close')}</span>
                    <span className="h-[5px] w-[120px] rounded-full bg-white/50" />
                </button>
            </div>
        </div>
    );
}

export function NotificationCenterHotzone({ onOpen }: { onOpen: () => void }) {
    const start = useRef<{ x: number; y: number } | null>(null);
    return (
        <div
            className="absolute start-0 top-0 z-[400]"
            style={{ width: '54%', height: 'calc(var(--safe-top) + 6px)' }}
            onPointerDown={e => { start.current = { x: e.clientX, y: e.clientY }; (e.target as Element).setPointerCapture?.(e.pointerId); }}
            onPointerMove={e => {
                if (!start.current) return;
                if (e.clientY - start.current.y > 14) { start.current = null; onOpen(); }
            }}
            onPointerUp={e => {
                if (!start.current) return;
                const moved = Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y);
                start.current = null;
                if (moved < 10) onOpen();
            }}
        />
    );
}
