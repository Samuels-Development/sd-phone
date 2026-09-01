import { useCallback, useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Power, Volume1, Volume2, Users, Bookmark, ChevronRight } from 'lucide-react';

import { useTheme } from '@/stores/themeStore';
import { useNuiEvent } from '@/hooks/useNuiEvent';
import { useSessionState } from '@/hooks/useSessionState';
import { Keypad } from '@/ui/Keypad';
import { AlertDialog } from '@/ui/AlertDialog';
import { SavedChannels } from './SavedChannels';
import { getRadio, setRadio, listSaved, addSaved, updateSaved, removeSaved, type SavedStation } from './radioApi';
import { t } from '@/i18n';
import { StatusBarSpacer } from '@/ui/StatusBarSpacer';

const fmtFreq   = (f: number) => f.toFixed(1);
const clampFreq = (f: number) => Math.min(999.9, Math.max(1.0, Math.round(f * 10) / 10));

function cleanFreq(v: string): string {
    v = v.replace(/[^\d.]/g, '');
    const hasDot = v.includes('.');
    const [int = '', ...rest] = v.split('.');
    const dec = rest.join('').slice(0, 1);
    return int.slice(0, 3) + (hasDot ? '.' + dec : '');
}

export function Radio({ onClose: _onClose }: { onClose: () => void }) {
    const { theme } = useTheme('theme');
    const trackEmpty = theme === 'dark' ? '#3A3A3C' : '#E5E5EA';

    const [loaded,    setLoaded]    = useState(false);
    const [on,        setOn]        = useState(false);
    const [onFreq,    setOnFreq]    = useState<number | null>(null);
    const [volume,    setVolume]    = useState(50);
    const [entry,     setEntry]     = useSessionState('radio:entry', '1.0');
    const [onAir,     setOnAir]     = useState(false);
    const [peers,     setPeers]     = useState(0);
    const [saved,     setSaved]     = useState<SavedStation[]>([]);
    const [showSaved, setShowSaved] = useSessionState('radio:showSaved', false);
    const [armed,     setArmed]     = useState(false);
    const [notice,    setNotice]    = useState<string | null>(null);

    const target = parseFloat(entry) || 0;
    const canTune = target >= 1.0;
    const targetDiffers = on && onFreq !== null && onFreq !== clampFreq(target);
    const others = on ? Math.max(0, peers - 1) : 0;
    const anim = armed ? 'transition-all duration-300' : '';

    useEffect(() => {
        let alive = true;
        void getRadio().then(s => {
            if (!alive) return;
            setOn(s.on);
            setVolume(s.volume);
            setOnFreq(s.on ? s.freq : null);
            setEntry(fmtFreq(s.freq));
            setLoaded(true);
        });
        void listSaved().then(list => { if (alive) setSaved(list); });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useNuiEvent('sd-phone:radio:onair', useCallback((data) => {
        setOnAir(!!data?.active);
    }, []));

    useNuiEvent('sd-phone:radio:count', useCallback((data) => {
        setPeers(data?.count ?? 0);
    }, []));

    useNuiEvent('sd-phone:radio:status', useCallback((data) => {
        setOn(!!data?.on);
        setOnFreq(data?.on ? (data?.freq ?? null) : null);
        if (!data?.on) { setPeers(0); setOnAir(false); }
    }, []));

    useNuiEvent('sd-phone:radio:forceoff', useCallback((data) => {
        setOn(false); setOnFreq(null); setPeers(0); setOnAir(false);
        setNotice(data?.message ?? t('radio.removedFromChannel', 'You were removed from this channel.'));
    }, []));

    useEffect(() => { if (loaded) setArmed(true); }, [loaded]);

    async function tuneIn(freq?: number) {
        const f = clampFreq(freq ?? target);
        setEntry(fmtFreq(f));
        setPeers(p => (p < 1 ? 1 : p));
        const next = await setRadio({ on: true, freq: f });
        if (next.error) { setNotice(next.error); setPeers(0); return; }
        setOn(true);
        setOnFreq(next.freq);
        setVolume(next.volume);
    }

    async function turnOff() {
        await setRadio({ on: false });
        setOn(false);
        setOnFreq(null);
        setOnAir(false);
        setPeers(0);
    }

    function changeVolume(v: number) {
        setVolume(v);
        void setRadio({ volume: v });
    }

    async function addStation(name: string, freq: number) {
        const station = await addSaved(name, clampFreq(freq));
        if (station) setSaved(prev => [...prev, station]);
    }

    async function updateStation(id: string, label: string, freq: number) {
        const updated = await updateSaved(id, label, freq);
        if (updated) setSaved(prev => prev.map(s => (s.id === id ? updated : s)));
    }

    async function removeStation(id: string) {
        setSaved(prev => prev.filter(s => s.id !== id));
        await removeSaved(id);
    }

    const press = (ch: string) => setEntry(prev =>
        ch === '.' ? (prev.includes('.') ? prev : cleanFreq(prev + '.')) : cleanFreq(prev + ch));
    const del = () => setEntry(prev => prev.slice(0, -1));

    return (
        <div className="absolute inset-0 z-10 flex flex-col bg-base font-sf text-black dark:text-white">
            <StatusBarSpacer />
            <div className="px-5 pb-1 pt-0.5 text-[34px] font-bold tracking-tight">{t('radio.title', 'Radio')}</div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto no-scrollbar px-4 pb-5 pt-1.5">
                <div
                    className="relative overflow-hidden rounded-[22px] px-5 pb-6 pt-5"
                    style={{ background: 'radial-gradient(120% 120% at 20% 0%, #232a33 0%, #161b21 45%, #0c0f13 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
                >
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[14px] font-semibold uppercase tracking-[0.12em]">
                            <span className={`h-[9px] w-[9px] rounded-full ${on ? 'bg-[#34d399]' : 'bg-white/25'}`} />
                            <span className={on ? 'text-[#34d399]' : 'text-white/40'}>{on ? t('radio.on', 'On') : t('radio.off', 'Off')}</span>
                        </span>
                        {onAir && (
                            <span className="flex items-center gap-1.5 rounded-full bg-[#ff453a]/20 px-2 py-0.5 text-[12px] font-bold uppercase tracking-[0.14em] text-[#ff6961]">
                                <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#ff453a]" /> {t('radio.onAir', 'On Air')}
                            </span>
                        )}
                    </div>

                    <div className="mt-3.5 flex items-end justify-center gap-2">
                        <input
                            value={entry}
                            onChange={e => setEntry(cleanFreq(e.target.value))}
                            inputMode="decimal"
                            aria-label={t('radio.frequency', 'Frequency')}
                            placeholder="0.0"
                            style={{ width: `${Math.max(3, entry.length)}ch` }}
                            className={`bg-transparent p-0 text-center text-[72px] font-semibold leading-none tabular-nums tracking-tight outline-none transition-colors placeholder:text-white/25 ${on ? 'text-[#34d399]' : 'text-white/60'}`}
                        />
                        <span className="mb-2 text-[18px] font-semibold text-white/40">{t('radio.mhz', 'MHz')}</span>
                    </div>

                    <div className="mt-3.5 flex items-center justify-center gap-2 text-[15.5px] text-white/50">
                        {on ? (
                            <>
                                <span>{t('radio.onFreq', 'On {freq}', { freq: fmtFreq(onFreq ?? target) })}</span>
                                <span className="text-white/25">·</span>
                                <Users className="h-[16px] w-[16px]" strokeWidth={2.2} />
                                <span>{others === 0 ? t('radio.justYou', 'Just you') : (others === 1 ? t('radio.oneOther', '{count} other', { count: others }) : t('radio.others', '{count} others', { count: others }))}</span>
                            </>
                        ) : t('radio.radioOff', 'Radio is off')}
                    </div>
                </div>

                <Keypad variant="decimal" onPress={press} onDelete={del} canDelete={entry.length > 0} className="mt-3 px-2" />

                <div className="mt-3 flex">
                    <button
                        type="button"
                        onClick={() => (on ? turnOff() : tuneIn())}
                        disabled={!on && (!canTune || !loaded)}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-full py-3 text-[18px] font-semibold shadow-sm ${anim} active:opacity-80 ${
                            on ? 'bg-ios-red text-white' : (canTune && loaded ? 'bg-[#34c759] text-white' : 'bg-black/15 text-black/30 dark:bg-white/10 dark:text-white/30')
                        }`}
                    >
                        <Power className="h-[19px] w-[19px]" strokeWidth={2.4} /> {on ? t('radio.turnOff', 'Turn Off') : t('radio.tuneIn', 'Tune In')}
                    </button>
                    <button
                        type="button"
                        onClick={() => tuneIn()}
                        disabled={!on || !targetDiffers || !canTune}
                        aria-hidden={!on}
                        tabIndex={on ? 0 : -1}
                        className={`overflow-hidden whitespace-nowrap rounded-full py-3 text-[18px] font-semibold shadow-sm ${anim} active:opacity-80 ${
                            on ? 'ml-2 max-w-[280px] flex-1 opacity-100' : 'ml-0 max-w-0 flex-1 opacity-0'
                        } ${
                            targetDiffers && canTune ? 'bg-ios-blue text-white' : 'bg-black/15 text-black/30 dark:bg-white/10 dark:text-white/30'
                        }`}
                    >
                        {t('radio.switch', 'Switch')}
                    </button>
                </div>

                <div className="mt-3 flex items-center gap-3 rounded-[16px] bg-surface px-4 py-3.5">
                    <Volume1 className="h-[20px] w-[20px] shrink-0 text-black/45 dark:text-white/45" strokeWidth={2} />
                    <input
                        type="range" min={0} max={100} value={volume}
                        onChange={e => changeVolume(+e.target.value)}
                        aria-label={t('radio.volume', 'Radio volume')}
                        className="ios-slider flex-1"
                        style={{ '--sp': `${volume}%`, '--se': trackEmpty } as CSSProperties}
                    />
                    <Volume2 className="h-[20px] w-[20px] shrink-0 text-black/55 dark:text-white/55" strokeWidth={2} />
                </div>

                <button
                    type="button"
                    onClick={() => setShowSaved(true)}
                    className="mt-3 flex w-full items-center gap-3 rounded-[16px] bg-surface px-4 py-3.5 text-left active:opacity-70"
                >
                    <Bookmark className="h-[19px] w-[19px] shrink-0 text-ios-blue" strokeWidth={2.2} />
                    <span className="flex-1 text-[17px] font-semibold">{t('radio.savedChannels', 'Saved Channels')}</span>
                    {saved.length > 0 && <span className="text-[15px] tabular-nums text-ios-gray">{saved.length}</span>}
                    <ChevronRight className="h-[18px] w-[18px] text-ios-gray" strokeWidth={2.4} />
                </button>
            </div>

            {showSaved && (
                <SavedChannels
                    saved={saved}
                    currentFreq={clampFreq(target)}
                    canSave={canTune}
                    activeFreq={on ? onFreq : null}
                    onTune={f => { void tuneIn(f); setShowSaved(false); }}
                    onAdd={addStation}
                    onUpdate={updateStation}
                    onRemove={removeStation}
                    onBack={() => setShowSaved(false)}
                />
            )}

            {notice && (
                <AlertDialog
                    title={t('radio.title', 'Radio')}
                    message={notice}
                    confirmLabel={t('radio.ok', 'OK')}
                    hideCancel
                    onCancel={() => setNotice(null)}
                    onConfirm={() => setNotice(null)}
                />
            )}
        </div>
    );
}
