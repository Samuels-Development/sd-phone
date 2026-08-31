import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Minus, Plus } from 'lucide-react';

import { Sheet } from '@/ui/Sheet';
import { t } from '@/i18n';
import { resolveWallpaper } from './wallpapers';
import {
    CLOCK_COLORS, CLOCK_SCALE_MIN, CLOCK_SCALE_MAX,
    Clockface, clockFontStyle, clockFonts, clockLayouts, type LockClock,
} from './lockClock';


const ACCENT = 'rgb(var(--ios-blue))';

export function LockClockEditor({ config, time, date, wallpaper, onChange, onClose }: {
    config:    LockClock;
    time:      string;
    date:      string;
    wallpaper: string;
    onChange:  (cfg: LockClock) => void;
    onClose:   () => void;
}) {
    const [tab, setTab] = useState<'font' | 'layout'>('font');
    const [anim, setAnim] = useState('');
    const switchTab = (next: 'font' | 'layout') => {
        if (next === tab) return;
        setAnim(next === 'layout' ? 'animate-tab-in-right' : 'animate-tab-in-left');
        setTab(next);
    };
    const wp = resolveWallpaper(wallpaper);

    const SCALE_MIN = Math.round(CLOCK_SCALE_MIN * 100);
    const SCALE_MAX = Math.round(CLOCK_SCALE_MAX * 100);
    const scalePct  = ((config.scale * 100 - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100;

    return (
        <Sheet
            onClose={onClose}
            top={388}
            dim={false}
            className="bg-[rgba(236,236,240,0.78)] backdrop-blur-2xl backdrop-saturate-150 font-sf"
        >
            {() => (
                <div className="flex h-full flex-col px-4 pb-5 pt-8">
                    <MiniSegmented
                        value={tab}
                        onChange={switchTab}
                        options={[{ value: 'font', label: t('common.font', 'Font') }, { value: 'layout', label: t('common.layout', 'Layout') }]}
                    />

                    <div className="mt-3 flex-1 overflow-y-auto no-scrollbar px-1.5 py-1.5">
                        <div key={tab} className={anim}>
                        {tab === 'font' ? (
                            <div className="grid grid-cols-4 gap-3">
                                {clockFonts().map(f => {
                                    const sel = config.font === f.id;
                                    return (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => onChange({ ...config, font: f.id })}
                                            className="flex aspect-square items-center justify-center overflow-hidden rounded-[16px] bg-black/[0.05] p-2.5 active:opacity-70"
                                            style={{ boxShadow: sel ? `0 0 0 2.5px ${ACCENT}` : 'inset 0 0 0 1px rgba(0,0,0,0.07)' }}
                                            aria-label={f.label}
                                        >
                                            <span style={{ ...clockFontStyle(f.id, '#1c1c1e'), fontSize: 25, lineHeight: 1 }}>12</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <>
                            <div className="grid grid-cols-2 gap-3">
                                {clockLayouts().map(l => {
                                    const sel = config.layout === l.id;
                                    return (
                                        <button
                                            key={l.id}
                                            type="button"
                                            onClick={() => onChange({ ...config, layout: l.id })}
                                            className="relative h-[90px] overflow-hidden rounded-[15px] active:opacity-80"
                                            style={{ boxShadow: sel ? `0 0 0 2.5px ${ACCENT}` : 'inset 0 0 0 1px rgba(0,0,0,0.10)' }}
                                            aria-label={l.label}
                                        >
                                            <img src={wp} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                                            <div className="absolute inset-0 bg-black/25" />
                                            <div className={`absolute inset-0 flex flex-col justify-center ${l.id === 'left' ? 'items-start pl-3.5' : l.id === 'right' ? 'items-end pr-3.5' : 'items-center'}`}>
                                                <Clockface time={time} date={date} config={{ ...config, layout: l.id }} size={26} />
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="mt-4 flex items-center gap-3 px-1">
                                <Minus className="h-[15px] w-[15px] shrink-0 text-black/45" strokeWidth={2.5} />
                                <input
                                    type="range"
                                    min={SCALE_MIN}
                                    max={SCALE_MAX}
                                    value={Math.round(config.scale * 100)}
                                    onChange={e => onChange({ ...config, scale: +e.target.value / 100 })}
                                    className="ios-slider flex-1"
                                    style={{ '--sp': `${scalePct}%`, '--se': 'rgba(0,0,0,0.14)' } as CSSProperties}
                                    aria-label={t('common.clockSize', 'Clock size')}
                                />
                                <Plus className="h-[17px] w-[17px] shrink-0 text-black/45" strokeWidth={2.5} />
                            </div>
                            </>
                        )}
                        </div>
                    </div>

                    <div className="mt-3 h-px w-full bg-black/[0.14]" />

                    <div
                        className="mt-3 grid grid-flow-col grid-rows-2 gap-x-3.5 gap-y-2.5 overflow-x-auto no-scrollbar py-2 pl-2 pr-3"
                        style={{ gridAutoColumns: 'max-content' }}
                    >
                        {CLOCK_COLORS.map(c => {
                            const sel = config.color.toLowerCase() === c.toLowerCase();
                            return (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => onChange({ ...config, color: c })}
                                    className="h-[31px] w-[31px] rounded-full transition-transform active:scale-90"
                                    style={{ background: c, boxShadow: sel ? `0 0 0 2px #fff, 0 0 0 4px ${ACCENT}` : 'inset 0 0 0 1px rgba(0,0,0,0.18)' }}
                                    aria-label={t('common.colourValue', 'Colour {c}', { c })}
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </Sheet>
    );
}

function MiniSegmented<T extends string>({ value, onChange, options }: {
    value:    T;
    onChange: (v: T) => void;
    options:  readonly { value: T; label: string }[];
}) {
    return (
        <div className="mx-auto flex w-[82%] rounded-[9px] bg-black/[0.07] p-[2px]">
            {options.map(o => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={`flex-1 rounded-[8px] py-1.5 text-[15px] font-medium transition-colors ${
                        value === o.value ? 'bg-white text-black shadow-sm' : 'text-black/70'
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
