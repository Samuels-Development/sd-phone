import { useEffect, useState } from 'react';
import { Bell, Globe, Plus, Timer as TimerIcon } from 'lucide-react';

import { t } from '@/i18n';
import { useTheme } from '@/stores/themeStore';
import { useSessionState } from '@/hooks/useSessionState';
import { TabBar } from '@/ui/TabBar';
import { Alarms } from './Alarms';
import { NewAlarm } from './NewAlarm';
import { Stopwatch } from './Stopwatch';
import { Timer } from './Timer';
import { WorldClock } from './WorldClock';
import { type AlarmDef } from './data';
import { hydrateAlarms, removeAlarm, saveAlarm, toggleAlarm, useAlarms, requestTestAlarm } from '@/stores/alarmStore';

type TabId = 'worldclock' | 'alarm' | 'stopwatch' | 'timer';
const SB_H = 61;

export function Clock({ onClose }: { onClose: () => void }) {
    const { theme } = useTheme('theme');
    const isDark = theme === 'dark';

    const [tab, setTab] = useSessionState<TabId>('clock:tab', 'worldclock');
    const showNavBar = tab !== 'timer';

    const [alarmEditing, setAlarmEditing] = useState(false);

    const { alarms, loaded: alarmsLoaded } = useAlarms();
    useEffect(() => { hydrateAlarms(true); }, []);

    const [editorOpen,  setEditorOpen]  = useState(false);
    const [editorAlarm, setEditorAlarm] = useState<AlarmDef | null>(null);
    const openEditor = (a: AlarmDef | null) => { setEditorAlarm(a); setEditorOpen(true); };

    useEffect(() => { if (tab !== 'alarm') { setAlarmEditing(false); setEditorOpen(false); } }, [tab]);

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-base text-black dark:text-white">
            <div className="shrink-0" style={{ height: SB_H }} />

            <div className="relative flex flex-1 flex-col overflow-hidden">
                <div key={tab} className="flex min-h-0 flex-1 flex-col animate-swipe-in-left">
                    {tab === 'alarm' && (
                        <div className="shrink-0 flex items-center justify-between px-5 pb-0.5">
                            <button type="button" onClick={() => setAlarmEditing(e => !e)} className="text-[17px] text-ios-blue active:opacity-60">{alarmEditing ? t('clock.done', 'Done') : t('clock.edit', 'Edit')}</button>
                            <div className="flex items-center gap-4">
                                {import.meta.env.DEV && (
                                    <button type="button" onClick={requestTestAlarm} className="text-[15px] font-semibold text-ios-blue active:opacity-60">Test</button>
                                )}
                                <button type="button" aria-label={t('clock.addAlarm', 'Add alarm')} onClick={() => openEditor(null)} className="text-ios-blue active:opacity-60">
                                    <Plus className="h-[28px] w-[28px]" strokeWidth={2} />
                                </button>
                            </div>
                        </div>
                    )}

                    {showNavBar && (
                        <div className="shrink-0 px-5 pb-1 pt-1">
                            <h1 className="text-[34px] font-bold tracking-tight text-black dark:text-white">
                                {tab === 'worldclock' ? t('clock.worldClock', 'World Clock') : tab === 'stopwatch' ? t('clock.stopwatch', 'Stopwatch') : t('clock.alarm', 'Alarm')}
                            </h1>
                        </div>
                    )}

                    {tab === 'worldclock' && <WorldClock />}
                    {tab === 'alarm'      && <Alarms editing={alarmEditing} loaded={alarmsLoaded} alarms={alarms} onToggle={toggleAlarm} onRemove={removeAlarm} onEdit={openEditor} />}
                    {tab === 'stopwatch'  && <Stopwatch isDark={isDark} />}
                    {tab === 'timer'      && <Timer    isDark={isDark} topPad={SB_H} />}
                </div>

                {tab === 'alarm' && editorOpen && (
                    <NewAlarm isDark={isDark} alarm={editorAlarm} onSave={saveAlarm} onCancel={() => setEditorOpen(false)} />
                )}
            </div>

            <TabBar<TabId>
                active={tab}
                onChange={setTab}
                tabs={[
                    { id: 'worldclock', label: t('clock.worldClock', 'World Clock'), icon: a => <Globe     className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
                    { id: 'alarm',      label: t('clock.alarms', 'Alarms'),          icon: a => <Bell      className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
                    { id: 'stopwatch',  label: t('clock.stopwatch', 'Stopwatch'),    icon: a => <StopwatchSvg className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
                    { id: 'timer',      label: t('clock.timers', 'Timers'),          icon: a => <TimerIcon className="h-[33px] w-[33px]" strokeWidth={a ? 2.2 : 1.9} /> },
                ]}
            />

            <button type="button" onClick={onClose} aria-label={t('clock.closeClock', 'Close Clock')}
                className="absolute inset-x-0 bottom-0 h-7 cursor-default" />
        </div>
    );
}

function StopwatchSvg({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none"
            stroke="currentColor" strokeWidth={strokeWidth}
            strokeLinecap="round" strokeLinejoin="round"
        >
            <circle cx="12" cy="13" r="8" />
            <path d="M10 2h4" />
            <line x1="12" y1="2" x2="12" y2="5" />
            <line x1="12" y1="13" x2="15.5" y2="9.5" />
            <circle cx="12" cy="13" r="0.5" fill="currentColor" />
        </svg>
    );
}
