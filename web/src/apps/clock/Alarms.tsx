import { useState } from 'react';
import { AlarmClock, ChevronRight, Minus } from 'lucide-react';

import { Toggle } from '@/ui/Toggle';
import { t } from '@/i18n';
import { useTheme } from '@/stores/themeStore';
import { AlertDialog } from '@/ui/AlertDialog';
import { formatClockTime } from '@/lib/time';
import type { AlarmDef } from './data';

export function Alarms({ editing = false, loaded = true, alarms, onToggle, onRemove, onEdit }: {
    editing?: boolean;
    loaded?:  boolean;
    alarms:   AlarmDef[];
    onToggle: (id: string) => void;
    onRemove: (id: string) => void;
    onEdit:   (alarm: AlarmDef) => void;
}) {
    const [pendingDelete, setPendingDelete] = useState<AlarmDef | null>(null);
    const { hour24 } = useTheme('hour24');

    return (
        <div className="flex flex-1 flex-col overflow-y-auto no-scrollbar">
            {alarms.length > 0 ? (
                <div className="space-y-3 px-4 pb-4">
                    {alarms.map(alarm => (
                        <AlarmCard
                            key={alarm.id}
                            alarm={alarm}
                            editing={editing}
                            onToggle={() => onToggle(alarm.id)}
                            onRemove={() => setPendingDelete(alarm)}
                            onEdit={() => onEdit(alarm)}
                            hour24={hour24}
                        />
                    ))}
                </div>
            ) : loaded ? (
                <div className="flex flex-1 flex-col items-center justify-center px-10 pb-10 text-center">
                    <AlarmClock className="h-[72px] w-[72px] text-black/25 dark:text-white/25" strokeWidth={1.5} />
                    <p className="mt-4 text-[21px] font-semibold text-black/80 dark:text-white/90">{t('clock.noAlarms', 'No Alarms')}</p>
                    <p className="mt-1.5 text-[16px] font-medium leading-snug text-ios-gray">{t('clock.tapToSetAlarm', 'Tap + to set an alarm.')}</p>
                </div>
            ) : null}

            {pendingDelete && (
                <AlertDialog
                    title={t('clock.deleteAlarm', 'Delete Alarm')}
                    message={deleteMessage(pendingDelete, hour24)}
                    confirmLabel={t('clock.delete', 'Delete')}
                    cancelLabel={t('clock.cancel', 'Cancel')}
                    destructive
                    onCancel={() => setPendingDelete(null)}
                    onConfirm={() => { onRemove(pendingDelete.id); setPendingDelete(null); }}
                />
            )}
        </div>
    );
}

function AlarmCard({ alarm, editing, onToggle, onRemove, onEdit, hour24 }: {
    alarm:    AlarmDef;
    editing:  boolean;
    onToggle: () => void;
    onRemove: () => void;
    onEdit:   () => void;
    hour24:   boolean;
}) {
    const time   = fmt12(alarm.hour, alarm.minute, hour24);
    const dimCls = alarm.enabled ? '' : 'opacity-40';

    const body = (
        <div className={`min-w-0 flex-1 ${dimCls}`}>
            <div className="flex items-baseline gap-[5px]">
                <span
                    className="tabular-nums leading-none tracking-tight text-black dark:text-white"
                    style={{ fontSize: 48, fontWeight: 200 }}
                >
                    {time.hhmm}
                </span>
                {time.ampm && (
                    <span
                        className="text-black dark:text-white"
                        style={{ fontSize: 20, fontWeight: 300, lineHeight: 1 }}
                    >
                        {time.ampm}
                    </span>
                )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 truncate text-[18px] text-ios-gray">
                <span className="truncate">{alarm.label}</span>
                {alarm.days && (
                    <>
                        <span className="opacity-50">·</span>
                        <span className="truncate">{alarm.days}</span>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <div className="flex items-center rounded-[20px] bg-white/55 px-5 py-5 dark:bg-white/[0.08]">
            <div className={`flex items-center overflow-hidden transition-all duration-300 ${editing ? 'mr-3.5 w-[28px] opacity-100' : 'w-0 opacity-0'}`}>
                <button
                    type="button"
                    aria-label={t('clock.deleteAlarmAria', 'Delete {time} alarm', { time: `${time.hhmm}${time.ampm ? ' ' + time.ampm : ''}` })}
                    onClick={onRemove}
                    className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-ios-red active:opacity-70"
                >
                    <Minus className="h-[19px] w-[19px] text-white" strokeWidth={3} />
                </button>
            </div>

            {editing ? (
                <button
                    type="button"
                    onClick={onEdit}
                    aria-label={t('clock.editAlarmAria', 'Edit {time} alarm', { time: `${time.hhmm}${time.ampm ? ' ' + time.ampm : ''}` })}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left active:opacity-60"
                >
                    {body}
                    <ChevronRight className="h-[22px] w-[22px] shrink-0 text-black/30 dark:text-white/30" strokeWidth={2.5} />
                </button>
            ) : (
                <>
                    {body}
                    <Toggle on={alarm.enabled} onChange={onToggle} />
                </>
            )}
        </div>
    );
}


function fmt12(h: number, m: number, hour24 = false): { hhmm: string; ampm: string } {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (hour24) return { hhmm: formatClockTime(d, true), ampm: '' };
    const ampm = h < 12 ? 'AM' : 'PM';
    return { hhmm: formatClockTime(d, false), ampm };
}

function deleteMessage(a: AlarmDef, hour24: boolean): string {
    const { hhmm, ampm } = fmt12(a.hour, a.minute, hour24);
    const label = ampm ? `${hhmm} ${ampm}` : hhmm;
    const suffix = a.label ? ` (${a.label})` : '';
    return t('clock.deleteAlarmConfirm', 'Are you sure you want to delete the {time} alarm{suffix}?', { time: label, suffix });
}

export type { AlarmDef };
