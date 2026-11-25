import { useEffect, useReducer, useState } from 'react';

import { t } from '@/i18n';
import { useSessionState } from '@/hooks/useSessionState';
import { useDeckActive } from '@/shell/deckActive';
import { DrumWheel } from '@/ui/DrumWheel';
import { fmtTimer, fmtTimerLabel } from './data';
import { addRecent, getRecents } from './clockApi';
import { tmCancel, tmPause, tmRemainingMs, tmResume, tmStart, useTimer } from '@/stores/timerStore';


const RING_R = 110;
const CIRC   = 2 * Math.PI * RING_R;

const DRUM_HOURS  = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const DRUM_MINSEC = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function Timer({ topPad = 0, isDark }: { topPad?: number; isDark: boolean }) {
    const [pickH,  setPickH]  = useSessionState('clock:timerPickH', 0);
    const [pickM,  setPickM]  = useSessionState('clock:timerPickM', 5);
    const [pickS,  setPickS]  = useSessionState('clock:timerPickS', 0);

    const { status, totalSecs } = useTimer();
    const [closing, setClosing] = useState(false);
    const [, tick] = useReducer((n: number) => n + 1, 0);

    const [recents, setRecents] = useState<number[]>([]);
    useEffect(() => { void getRecents().then(setRecents); }, []);

    const totalPicked = pickH * 3600 + pickM * 60 + pickS;

    const active = useDeckActive();
    useEffect(() => {
        if (status !== 'running' || !active) return;
        tick();
        const id = window.setInterval(tick, 250);
        return () => window.clearInterval(id);
    }, [status, active]);

    function startTimer() {
        if (totalPicked === 0) return;
        tmStart(totalPicked);
        void addRecent(totalPicked);
        setRecents(prev => [totalPicked, ...prev.filter(s => s !== totalPicked)].slice(0, 8));
    }
    function pauseResume() {
        if (status === 'paused') tmResume(); else tmPause();
    }
    function closeToPicker() {
        if (closing) return;
        setClosing(true);
        window.setTimeout(() => { tmCancel(); setClosing(false); }, 300);
    }
    function cancelTimer()     { closeToPicker(); }
    function dismissFinished() { closeToPicker(); }

    const running  = status === 'running';
    const paused   = status === 'paused';
    const finished = status === 'finished';
    const showRunning = running || paused || finished || closing;

    const remaining = Math.ceil(tmRemainingMs() / 1000);
    const ringPct = totalSecs > 0 ? remaining / totalSecs : 0;
    const dashOff = CIRC * (1 - ringPct);

    const timeStr  = fmtTimer(remaining);
    const timeSize = timeStr.length >= 8 ? 44 : timeStr.length >= 7 ? 52 : 62;

    return (
        <div className="relative flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 flex-col overflow-y-auto no-scrollbar">
                <div style={{ height: topPad }} className="shrink-0" />
                <div dir="ltr" className="mt-6 flex items-center justify-center gap-0 px-4">
                    <DrumWheel values={DRUM_HOURS}  index={pickH} label={t('clock.hours', 'hours')} onChange={setPickH} bandHeight={58} width={102} fontSize={40} inactiveFontSize={33} inactiveFontWeight={200} />
                    <DrumWheel values={DRUM_MINSEC} index={pickM} label={t('clock.min', 'min')}   onChange={setPickM} bandHeight={58} width={102} fontSize={40} inactiveFontSize={33} inactiveFontWeight={200} />
                    <DrumWheel values={DRUM_MINSEC} index={pickS} label={t('clock.sec', 'sec')}   onChange={setPickS} bandHeight={58} width={102} fontSize={40} inactiveFontSize={33} inactiveFontWeight={200} />
                </div>

                <div className="flex w-full items-center justify-around px-10 pt-6 pb-4">
                    <RoundBtn label={t('clock.cancel', 'Cancel')} onClick={cancelTimer} variant="gray" isDark={isDark} disabled />
                    <RoundBtn label={t('clock.start', 'Start')}  onClick={startTimer}  variant="green" isDark={isDark} disabled={totalPicked === 0} />
                </div>

                {recents.length > 0 && (
                    <div className="mt-6 px-4">
                        <div className="overflow-hidden rounded-[14px] bg-white/55 dark:bg-white/[0.08]">
                            <div className="px-4 pb-2 pt-3.5 text-[15px] font-medium text-ios-gray">{t('clock.recents', 'Recents')}</div>
                            {recents.map(secs => (
                                <button
                                    key={secs}
                                    type="button"
                                    onClick={() => {
                                        setPickH(Math.floor(secs / 3600));
                                        setPickM(Math.floor((secs % 3600) / 60));
                                        setPickS(secs % 60);
                                    }}
                                    className="flex w-full items-center px-4 py-3 text-start text-[18px] text-black active:bg-black/5 dark:text-white dark:active:bg-white/5"
                                    style={{ borderTop: `0.5px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)'}` }}
                                >
                                    {fmtTimerLabel(secs)}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div className="h-8" />
            </div>

            {showRunning && (
                <div className={`absolute inset-0 z-30 flex flex-col items-center bg-base ${closing ? 'animate-timer-out' : 'animate-timer-in'}`}>
                    <div style={{ height: topPad }} className="shrink-0" />
                    <div className="relative mt-6" style={{ width: 260, height: 260 }}>
                        <svg width={260} height={260} viewBox="0 0 260 260" className="-rotate-90">
                            <circle cx={130} cy={130} r={RING_R}
                                fill="none" stroke={isDark ? 'rgb(var(--elevated))' : '#d1d1d6'} strokeWidth="8" />
                            <circle cx={130} cy={130} r={RING_R}
                                fill="none"
                                stroke={finished ? '#ff453a' : '#ff9f0a'}
                                strokeWidth="8"
                                strokeLinecap="round"
                                strokeDasharray={CIRC}
                                strokeDashoffset={finished ? 0 : dashOff}
                                style={{ transition: 'stroke-dashoffset 0.8s linear' }}
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            {finished ? (
                                <button onClick={dismissFinished}
                                    className="text-[38px] font-thin text-[#ff9f0a] animate-pulse">
                                    {t('clock.timer', 'Timer')}
                                </button>
                            ) : (
                                <span
                                    className="tabular-nums font-thin text-black dark:text-white leading-none tracking-tight"
                                    style={{ fontSize: timeSize }}
                                >
                                    {timeStr}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center justify-around w-full px-10 py-4">
                        <RoundBtn label={t('clock.cancel', 'Cancel')} onClick={cancelTimer} variant="gray" isDark={isDark} />
                        {!finished && (
                            <RoundBtn
                                label={paused ? t('clock.resume', 'Resume') : t('clock.pause', 'Pause')}
                                onClick={pauseResume}
                                variant={paused ? 'green' : 'orange'}
                                isDark={isDark}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}


function RoundBtn({ label, onClick, variant, isDark, disabled = false }: {
    label:    string;
    onClick:  () => void;
    variant:  'green' | 'orange' | 'gray';
    isDark:   boolean;
    disabled?: boolean;
}) {
    const bg = variant === 'green'  ? (isDark ? '#1d3d20' : '#D6F2DD') :
               variant === 'orange' ? (isDark ? '#3a2800' : '#FCE7C8') :
                                      (isDark ? 'rgb(var(--elevated))' : '#E4E4EA');
    const fg = variant === 'green'  ? (isDark ? '#30d158' : '#34C759') :
               variant === 'orange' ? (isDark ? '#ff9f0a' : '#FF9500') :
                                      (isDark ? '#FFFFFF' : '#000000');
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{ background: bg }}
            className={`flex h-[76px] w-[76px] items-center justify-center rounded-full transition-opacity ${disabled ? 'opacity-40' : 'active:opacity-70'}`}
        >
            <span className="text-[17px] font-semibold" style={{ color: fg }}>{label}</span>
        </button>
    );
}
