import { useEffect, useReducer } from 'react';
import type { ReactNode } from 'react';
import { AlarmClock, Moon, Repeat, X } from 'lucide-react';

import { t } from '@/i18n';
import { formatDuration } from '@/lib/time';

export function AlarmRinging({ name, onStop, onKeep, canSnooze = false, onSnooze, repeating = false }: {
    name?:      string;
    onStop:     () => void;
    onKeep:     () => void;
    canSnooze?: boolean;
    onSnooze?:  () => void;
    repeating?: boolean;
}) {
    const secondary = canSnooze ? 'snooze' : (repeating ? 'none' : 'keep');
    return (
        <div
            className="absolute inset-0 z-[80] flex flex-col text-white"
            style={{ background: 'rgba(18,18,20,0.5)', backdropFilter: 'blur(26px)', WebkitBackdropFilter: 'blur(26px)' }}
        >
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
                <span className="text-[34px] font-medium tracking-tight" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.4)' }}>
                    {t('clock.alarm', 'Alarm')}
                </span>
                {name && (
                    <span className="text-[23px] font-semibold text-white/95" style={{ textShadow: '0 1px 6px rgba(0,0,0,0.45)' }}>
                        {name}
                    </span>
                )}
            </div>

            <div className={`flex items-end px-12 pb-20 ${secondary === 'none' ? 'justify-center' : 'justify-between'}`}>
                <RingBtn label={t('clock.stop', 'Stop')} onClick={onStop}><X className="h-[32px] w-[32px]" strokeWidth={2.4} /></RingBtn>
                {secondary === 'snooze' && (
                    <RingBtn label={t('clock.snooze', 'Snooze')} onClick={onSnooze ?? (() => {})}><Moon className="h-[27px] w-[27px]" strokeWidth={2.4} /></RingBtn>
                )}
                {secondary === 'keep' && (
                    <RingBtn label={t('clock.keep', 'Keep')} onClick={onKeep}><Repeat className="h-[28px] w-[28px]" strokeWidth={2.4} /></RingBtn>
                )}
            </div>
        </div>
    );
}

function RingBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
    return (
        <div className="flex flex-col items-center gap-2">
            <button
                type="button"
                onClick={onClick}
                className="flex h-[74px] w-[74px] items-center justify-center rounded-full bg-white/15 active:opacity-70"
            >
                {children}
            </button>
            <span className="text-[14px] font-medium text-white/90">{label}</span>
        </div>
    );
}

export function AlarmPeekBanner({ name, since = 0 }: { name?: string; since?: number }) {
    return (
        <div className="pointer-events-none absolute inset-x-0 top-[52px] z-[55] flex flex-col items-center px-2.5 font-sf">
            <div className="w-full max-w-[420px]">
                <div
                    className="flex items-start gap-2.5 rounded-[22px] bg-elevated/75 px-3 py-3 shadow-[0_10px_34px_rgba(0,0,0,0.20)] ring-1 ring-black/[0.06] backdrop-blur-2xl backdrop-saturate-150 dark:bg-elevated/75 dark:ring-white/10"
                    style={{ animation: 'notif-in 0.5s cubic-bezier(0.16,1.16,0.3,1) both' }}
                >
                    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-[#FF9F0A]">
                        <AlarmClock className="h-[22px] w-[22px] text-white" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1 pt-px">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[15px] font-semibold text-black dark:text-white">{t('clock.alarm', 'Alarm')}</span>
                            <span className="shrink-0 text-[13px] tabular-nums text-black/45 dark:text-white/45"><RingDuration since={since} /></span>
                        </div>
                        <p className="mt-0.5 line-clamp-4 text-[15px] leading-snug text-black/80 dark:text-white/85">{t('clock.nameIsRinging', '{name} is ringing', { name: name || t('clock.alarm', 'Alarm') })}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function RingDuration({ since }: { since: number }) {
    const [, tick] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        const id = window.setInterval(tick, 1000);
        return () => window.clearInterval(id);
    }, []);
    const secs = since ? Math.max(0, Math.floor((Date.now() - since) / 1000)) : 0;
    return <>{formatDuration(secs)}</>;
}
