import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

import { useTheme } from '@/stores/themeStore';
import { useSessionState } from '@/hooks/useSessionState';
import {
    addMonths, dayKey, formatLongDate, formatTime, loadState, saveState,
} from './data';
import type { CalEvent, CalState } from './data';
import { EventEditor } from './EventEditor';
import { MonthGrid } from './MonthGrid';
import { t } from '@/i18n';

const SB_H = 54;

export function Calendar({ onClose }: { onClose: () => void }) {
    const { theme } = useTheme('theme');
    const isDark = theme === 'dark';

    const today = useMemo(() => new Date(), []);
    const [selected, setSelected] = useSessionState<Date>('calendar:selectedDate', today);
    const [state, setState]       = useState<CalState>(() => loadState());
    const [editing, setEditing]   = useState<CalEvent | 'new' | null>(null);

    const months = useMemo(() => {
        const out: Date[] = [];
        for (let i = -12; i <= 12; i++) out.push(addMonths(today, i));
        return out;
    }, [today]);

    const scrollerRef = useRef<HTMLDivElement>(null);
    const todayMonthRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        todayMonthRef.current?.scrollIntoView({ block: 'start' });
    }, []);

    const selectedKey   = dayKey(selected);
    const selectedEvts  = useMemo(
        () => state.events
            .filter(e => e.dayKey === selectedKey)
            .sort((a, b) => {
                if (a.allDay && !b.allDay) return -1;
                if (b.allDay && !a.allDay) return 1;
                return (a.start ?? '').localeCompare(b.start ?? '');
            }),
        [state.events, selectedKey],
    );
    const selectedNote  = state.dayNotes[selectedKey] ?? '';

    function updateState(next: CalState) {
        setState(next);
        saveState(next);
    }

    function upsertEvent(ev: CalEvent) {
        const idx = state.events.findIndex(e => e.id === ev.id);
        const events = idx === -1
            ? [...state.events, ev]
            : state.events.map(e => e.id === ev.id ? ev : e);
        updateState({ ...state, events });
    }

    function deleteEvent(id: string) {
        updateState({ ...state, events: state.events.filter(e => e.id !== id) });
    }

    function setNote(value: string) {
        const dayNotes = { ...state.dayNotes };
        if (value.trim()) dayNotes[selectedKey] = value;
        else delete dayNotes[selectedKey];
        updateState({ ...state, dayNotes });
    }

    const dividerC  = 'rgb(var(--control))';
    const panelBg   = 'rgb(var(--surface))';
    const pageBg    = 'rgb(var(--base))';

    return (
        <div className="absolute inset-0 z-10 flex flex-col" style={{ background: pageBg, color: isDark ? '#fff' : '#000' }}>
            <div className="shrink-0" style={{ height: SB_H }} />

            <div
                className="relative z-20 flex h-11 shrink-0 items-center px-4"
                style={{ background: pageBg }}
            >
                <button
                    type="button"
                    onClick={() => {
                        setSelected(today);
                        todayMonthRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="text-[17px] text-ios-red active:opacity-60"
                >
                    {t('calendar.today', 'Today')}
                </button>
                <button
                    type="button"
                    aria-label={t('calendar.newEvent', 'New event')}
                    onClick={() => setEditing('new')}
                    className="ml-auto flex h-[32px] w-[32px] items-center justify-center rounded-full text-ios-red active:opacity-60"
                >
                    <Plus className="h-[22px] w-[22px]" strokeWidth={2.5} />
                </button>
                <div className="absolute inset-x-0 bottom-0" style={{ height: 0.5, background: dividerC }} />
            </div>

            <div
                ref={scrollerRef}
                className="overflow-y-auto no-scrollbar"
                style={{ flex: '0 0 55%' }}
            >
                {months.map(m => {
                    const isTodayMonth = m.getFullYear() === today.getFullYear() && m.getMonth() === today.getMonth();
                    return (
                        <div key={m.getTime()} ref={isTodayMonth ? todayMonthRef : undefined}>
                            <MonthGrid
                                month={m}
                                today={today}
                                selected={selected}
                                events={state.events}
                                onPick={setSelected}
                            />
                            <div style={{ height: 0.5, background: dividerC, margin: '0 16px' }} />
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto no-scrollbar" style={{ background: pageBg }}>
                <div className="sticky top-0 z-10 px-4 pb-1 pt-3" style={{ background: pageBg }}>
                    <div className="text-[15px] uppercase tracking-wider text-ios-gray">
                        {formatLongDate(selected)}
                    </div>
                </div>

                <div className="mx-4 mb-3 overflow-hidden rounded-[10px]" style={{ background: panelBg }}>
                    <textarea
                        value={selectedNote}
                        onChange={e => setNote(e.target.value)}
                        placeholder={t('calendar.notesForDay', 'Notes for this day…')}
                        rows={3}
                        className="w-full bg-transparent px-4 py-3 text-[17px] leading-relaxed outline-none placeholder:text-ios-gray resize-none"
                    />
                </div>

                {selectedEvts.length === 0 ? (
                    <div className="px-4 py-6 text-center text-[15px] text-ios-gray">
                        {t('calendar.noEvents', 'No Events')}
                    </div>
                ) : (
                    <div className="mx-4 mb-6 overflow-hidden rounded-[10px]" style={{ background: panelBg }}>
                        {selectedEvts.map((ev, i) => (
                            <button
                                key={ev.id}
                                type="button"
                                onClick={() => setEditing(ev)}
                                className="relative flex w-full items-stretch text-left active:bg-black/5 dark:active:bg-white/5"
                            >
                                <span className="w-1.5 shrink-0" style={{ background: ev.color }} />
                                <div className="flex-1 px-3.5 py-3">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <span className="text-[17px] font-medium">{ev.title}</span>
                                        <span className="shrink-0 text-[14px] text-ios-gray">
                                            {ev.allDay ? t('calendar.allDayShort', 'all-day') : ev.start ? formatTime(ev.start) : ''}
                                        </span>
                                    </div>
                                    {ev.location && (
                                        <div className="text-[14px] text-ios-gray">{ev.location}</div>
                                    )}
                                    {ev.notes && (
                                        <div className="line-clamp-2 text-[14px] text-ios-gray">{ev.notes}</div>
                                    )}
                                </div>
                                {i < selectedEvts.length - 1 && (
                                    <div className="pointer-events-none absolute bottom-0 right-0" style={{ left: 16, height: 0.5, background: dividerC }} />
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {editing && (
                <EventEditor
                    dayKey={selectedKey}
                    dayDate={selected}
                    existing={editing === 'new' ? undefined : editing}
                    onSave={ev => { upsertEvent(ev); setEditing(null); }}
                    onDelete={editing === 'new' ? undefined : () => deleteEvent(editing.id)}
                    onClose={() => setEditing(null)}
                />
            )}

            <button type="button" onClick={onClose} aria-label={t('calendar.closeCalendar', 'Close Calendar')}
                className="absolute inset-x-0 bottom-0 h-7 cursor-default" />
        </div>
    );
}
