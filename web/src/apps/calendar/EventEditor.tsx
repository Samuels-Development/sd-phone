import { useEffect, useRef, useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';

import { useTheme } from '@/stores/themeStore';
import { TimeWheel } from '@/ui/TimeWheel';
import { Toggle } from '@/ui/Toggle';
import { EVENT_COLORS, formatLongDate, formatTime, newId } from './data';
import type { CalEvent } from './data';
import { t } from '@/i18n';

interface Props {
    dayKey:    string;
    dayDate:   Date;
    existing?: CalEvent;
    onSave:    (ev: CalEvent) => void;
    onDelete?: () => void;
    onClose:   () => void;
}

export function EventEditor({ dayKey, dayDate, existing, onSave, onDelete, onClose }: Props) {
    const { theme } = useTheme('theme');
    const isDark = theme === 'dark';

    const [title,    setTitle]    = useState(existing?.title    ?? '');
    const [location, setLocation] = useState(existing?.location ?? '');
    const [notes,    setNotes]    = useState(existing?.notes    ?? '');
    const [allDay,   setAllDay]   = useState(existing?.allDay   ?? false);
    const [start,    setStart]    = useState(existing?.start    ?? '09:00');
    const [end,      setEnd]      = useState(existing?.end      ?? '10:00');
    const [color,    setColor]    = useState(existing?.color    ?? EVENT_COLORS[0]);

    const [activeTime, setActiveTime] = useState<'start' | 'end' | null>(null);

    const [shown, setShown] = useState(false);
    const exit = useRef<() => void>(() => {});
    useEffect(() => {
        const id = requestAnimationFrame(() => setShown(true));
        return () => cancelAnimationFrame(id);
    }, []);

    useEffect(() => { if (allDay) setActiveTime(null); }, [allDay]);

    const groupBg = 'rgb(var(--surface))';
    const pageBg  = 'rgb(var(--base))';
    const divider = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    function dismiss(after: () => void) {
        exit.current = after;
        setShown(false);
    }

    function commit() {
        const trimmed = title.trim();
        if (!trimmed) { dismiss(onClose); return; }
        const ev = {
            id:       existing?.id ?? newId(),
            dayKey,
            title:    trimmed,
            location: location.trim(),
            notes:    notes,
            allDay,
            start:    allDay ? undefined : start,
            end:      allDay ? undefined : end,
            color,
        };
        dismiss(() => onSave(ev));
    }

    return (
        <div
            className="absolute inset-0 z-30 flex flex-col"
            style={{
                background:  pageBg,
                color:       isDark ? '#fff' : '#000',
                transform:   shown ? 'translateY(0)' : 'translateY(100%)',
                transition:  'transform 0.34s cubic-bezier(0.32,0.72,0,1)',
            }}
            onTransitionEnd={() => { if (!shown) exit.current(); }}
        >
            <div className="shrink-0" style={{ height: 54 }} />

            <div className="relative flex h-11 shrink-0 items-center px-4">
                <button type="button" aria-label={t('calendar.cancel', 'Cancel')} onClick={() => dismiss(onClose)} className="flex items-center text-ios-red active:opacity-60">
                    <X className="h-[22px] w-[22px]" strokeWidth={2.5} />
                </button>
                <div className="pointer-events-none absolute inset-x-0 flex justify-center">
                    <span className="text-[17px] font-semibold">{existing ? t('calendar.editEvent', 'Edit Event') : t('calendar.newEventTitle', 'New Event')}</span>
                </div>
                <button
                    type="button"
                    aria-label={t('calendar.saveEvent', 'Save event')}
                    onClick={commit}
                    disabled={!title.trim()}
                    className="ml-auto flex items-center text-ios-red active:opacity-60 disabled:opacity-30"
                >
                    <Check className="h-[22px] w-[22px]" strokeWidth={2.75} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar pb-10">
                <div className="px-4 pb-2 pt-3 text-[22px] font-bold tracking-tight">
                    {formatLongDate(dayDate)}
                </div>

                <div className="mx-4 mt-2 overflow-hidden rounded-[10px]" style={{ background: groupBg }}>
                    <input
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder={t('calendar.title', 'Title')}
                        className="w-full bg-transparent px-4 py-3.5 text-[18px] outline-none placeholder:text-ios-gray"
                    />
                    <div style={{ height: 0.5, background: divider }} />
                    <input
                        type="text"
                        value={location}
                        onChange={e => setLocation(e.target.value)}
                        placeholder={t('calendar.location', 'Location')}
                        className="w-full bg-transparent px-4 py-3.5 text-[18px] outline-none placeholder:text-ios-gray"
                    />
                </div>

                <div className="mx-4 mt-6 overflow-hidden rounded-[10px]" style={{ background: groupBg }}>
                    <div className="flex items-center px-4 py-3.5">
                        <span className="flex-1 text-[18px]">{t('calendar.allDay', 'All-day')}</span>
                        <Toggle on={allDay} onChange={setAllDay} />
                    </div>
                    <div style={{ height: 0.5, background: divider }} />
                    <TimeRow
                        label={t('calendar.starts', 'Starts')} value={start} isDark={isDark} disabled={allDay}
                        active={activeTime === 'start'}
                        onToggle={() => setActiveTime(a => (a === 'start' ? null : 'start'))}
                    />
                    <TimeWheel value={start} onChange={setStart} open={!allDay && activeTime === 'start'} />
                    <div style={{ height: 0.5, background: divider }} />
                    <TimeRow
                        label={t('calendar.ends', 'Ends')} value={end} isDark={isDark} disabled={allDay}
                        active={activeTime === 'end'}
                        onToggle={() => setActiveTime(a => (a === 'end' ? null : 'end'))}
                    />
                    <TimeWheel value={end} onChange={setEnd} open={!allDay && activeTime === 'end'} />
                </div>

                <div className="mx-4 mt-6 overflow-hidden rounded-[10px]" style={{ background: groupBg }}>
                    <div className="flex items-center px-4 py-3.5">
                        <span className="flex-1 text-[18px]">{t('calendar.color', 'Color')}</span>
                        <div className="flex items-center gap-[10px]">
                            {EVENT_COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className="rounded-full active:scale-95"
                                    style={{
                                        width: 22, height: 22, background: c,
                                        boxShadow: color === c ? `0 0 0 2px ${groupBg}, 0 0 0 4px ${c}` : undefined,
                                        transition: 'transform 0.12s',
                                    }}
                                    aria-label={t('calendar.setColor', 'Set color {color}', { color: c })}
                                />
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mx-4 mt-6 overflow-hidden rounded-[10px]" style={{ background: groupBg }}>
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder={t('calendar.notes', 'Notes')}
                        rows={6}
                        className="w-full bg-transparent px-4 py-3.5 text-[19px] leading-relaxed outline-none placeholder:text-ios-gray resize-none"
                    />
                </div>

                {existing && onDelete && (
                    <div className="mx-4 mt-6 overflow-hidden rounded-[10px]" style={{ background: groupBg }}>
                        <button
                            type="button"
                            onClick={() => dismiss(() => { onDelete(); onClose(); })}
                            className="flex w-full items-center justify-center gap-2 px-4 py-3.5 text-ios-red active:bg-black/5 dark:active:bg-white/5"
                        >
                            <Trash2 className="h-[18px] w-[18px]" />
                            <span className="text-[18px]">{t('calendar.deleteEvent', 'Delete Event')}</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}


function TimeRow({ label, value, active, disabled, onToggle, isDark }: {
    label:    string;
    value:    string;
    active:   boolean;
    disabled: boolean;
    onToggle: () => void;
    isDark:   boolean;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onToggle}
            className={`flex w-full items-center px-4 py-3.5 transition-opacity duration-200 ${disabled ? 'opacity-40' : 'active:bg-black/5 dark:active:bg-white/5'}`}
        >
            <span className="flex-1 text-left text-[18px]">{label}</span>
            <span
                className="rounded-[7px] px-2.5 py-1 text-[17px] tabular-nums transition-colors"
                style={active
                    ? { background: 'rgba(255,69,58,0.16)', color: '#ff453a' }
                    : { background: isDark ? 'rgba(118,118,128,0.24)' : 'rgba(118,118,128,0.12)', color: isDark ? '#fff' : '#000' }
                }
            >
                {formatTime(value)}
            </span>
        </button>
    );
}
