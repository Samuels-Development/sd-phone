import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';

import { t } from '@/i18n';
import { useTheme } from '@/stores/themeStore';
import { useIosPush } from '@/hooks/useIosPush';
import { DrumWheel } from '@/ui/DrumWheel';
import { Toggle } from '@/ui/Toggle';
import type { AlarmDef } from './data';

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const HOURS_12 = Array.from({ length: 12 }, (_, i) => (i === 0 ? '12' : String(i)));
const MINUTES  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AMPM     = ['AM', 'PM'];

export function NewAlarm({ isDark, alarm, onSave, onCancel }: {
    isDark:   boolean;
    alarm?:   AlarmDef | null;
    onSave:   (a: AlarmDef) => void;
    onCancel: () => void;
}) {
    const { goBack, pageStyle } = useIosPush(onCancel);
    const { hour24 } = useTheme('hour24');
    const [hour, setHour]     = useState(alarm?.hour ?? 0);
    const [minute, setMinute] = useState(alarm?.minute ?? 0);
    const [label, setLabel]   = useState(alarm?.label ?? '');
    const [repeatDaily, setRepeatDaily] = useState(!!alarm?.days);
    const [sound, setSound]   = useState(alarm?.sound ?? true);
    const [snooze, setSnooze] = useState(alarm?.snooze ?? false);
    const [snoozeSecs, setSnoozeSecs] = useState(alarm?.snoozeSecs ?? 60);

    function save() {
        onSave({
            id:      alarm?.id ?? `a${Date.now()}`,
            hour, minute,
            label:   label.trim() || t('clock.alarm', 'Alarm'),
            days:    repeatDaily ? t('clock.everyDay', 'Every Day') : '',
            enabled: alarm?.enabled ?? true,
            sound, snooze,
            snoozeSecs: snoozeSecs >= 1 ? snoozeSecs : 60,
        });
        goBack();
    }

    return (
        <div className="absolute inset-0 z-20 flex flex-col bg-base font-sf text-black dark:text-white" style={pageStyle}>
            <div className="flex items-center px-3 pb-2 pt-2">
                <div className="flex flex-1 justify-start">
                    <button type="button" onClick={goBack} className="flex items-center gap-0.5 text-ios-blue active:opacity-60">
                        <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.5} />
                        <span className="text-[17px]">{t('clock.alarms', 'Alarms')}</span>
                    </button>
                </div>
                <span className="text-[20px] font-semibold">{alarm ? t('clock.editAlarmTitle', 'Edit Alarm') : t('clock.newAlarm', 'New Alarm')}</span>
                <div className="flex flex-1 justify-end">
                    <button type="button" onClick={save} className="text-[17px] font-semibold text-ios-blue active:opacity-60">{t('clock.save', 'Save')}</button>
                </div>
            </div>

            <div className={`flex items-center justify-center pt-12 pb-9 ${hour24 ? 'gap-3' : 'gap-1.5'}`}>
                {hour24 ? (
                    <>
                        <DrumWheel values={HOURS_24} index={hour}   onChange={setHour}   showBand={false} />
                        <Colon isDark={isDark} />
                        <DrumWheel values={MINUTES}  index={minute} onChange={setMinute} showBand={false} />
                    </>
                ) : (
                    <>
                        <DrumWheel values={HOURS_12} index={hour % 12} onChange={i => setHour(i + (hour >= 12 ? 12 : 0))} width={82} fontSize={50} showBand={false} />
                        <Colon isDark={isDark} size={50} />
                        <DrumWheel values={MINUTES}  index={minute}    onChange={setMinute}                                width={82} fontSize={50} showBand={false} />
                        <DrumWheel values={AMPM}     index={hour >= 12 ? 1 : 0} onChange={i => setHour((hour % 12) + (i === 1 ? 12 : 0))} width={76} fontSize={28} showBand={false} />
                    </>
                )}
            </div>

            <div className="px-4">
                <div className="overflow-hidden rounded-[14px] bg-white/55 dark:bg-white/[0.08]">
                    <SettingToggleRow label={t('clock.repeatDaily', 'Repeat Daily')} on={repeatDaily} onToggle={() => setRepeatDaily(r => !r)} />
                    <Hairline isDark={isDark} />
                    <div className="flex items-center justify-between px-4 py-4">
                        <span className="text-[19px]">{t('clock.label', 'Label')}</span>
                        <input
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            maxLength={30}
                            placeholder={t('clock.alarm', 'Alarm')}
                            className="ml-3 min-w-0 flex-1 bg-transparent text-right text-[19px] text-ios-gray outline-none placeholder:text-ios-gray"
                        />
                    </div>
                    <Hairline isDark={isDark} />
                    <SettingToggleRow label={t('clock.sound', 'Sound')}  on={sound}  onToggle={() => setSound(s => !s)} />
                    <Hairline isDark={isDark} />
                    <SettingToggleRow label={t('clock.snooze', 'Snooze')} on={snooze} onToggle={() => setSnooze(s => !s)} />
                    <Hairline isDark={isDark} />
                    <div className={`flex items-center justify-between px-4 py-3.5 transition-opacity ${snooze ? '' : 'opacity-40'}`}>
                        <span className="text-[19px]">{t('clock.snoozeDelay', 'Snooze Delay')}</span>
                        <div className="flex items-baseline gap-1.5">
                            <input
                                type="number"
                                inputMode="numeric"
                                min={1}
                                max={3600}
                                value={snoozeSecs}
                                disabled={!snooze}
                                onChange={e => setSnoozeSecs(Math.min(3600, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
                                className="w-[56px] bg-transparent text-right text-[19px] text-ios-gray outline-none"
                            />
                            <span className="text-[17px] text-ios-gray">{t('clock.sec', 'sec')}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Hairline({ isDark }: { isDark: boolean }) {
    return <div className="ml-4" style={{ height: '0.5px', background: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)' }} />;
}

function SettingToggleRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
    return (
        <div className="flex items-center justify-between px-4 py-3.5">
            <span className="text-[19px]">{label}</span>
            <Toggle on={on} onChange={onToggle} scale={1.15} />
        </div>
    );
}

function Colon({ isDark, size = 52 }: { isDark: boolean; size?: number }) {
    return <span className="tabular-nums" style={{ fontSize: size, fontWeight: 300, color: isDark ? '#FFFFFF' : '#000000' }}>:</span>;
}

