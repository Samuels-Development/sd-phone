import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useTheme } from '@/stores/themeStore';


const ITEM_H     = 34;
const VISIBLE    = 5;
const WIN_H      = ITEM_H * VISIBLE;
const ITEM_ANGLE = 18;
const RADIUS     = ITEM_H / 2 / Math.tan((ITEM_ANGLE * Math.PI) / 180 / 2);

function pad2(n: number) {
    return String(n).padStart(2, '0');
}

interface ColumnProps {
    items:    string[];
    index:    number;
    onChange: (i: number) => void;
    width:    number;
    align?:   'center' | 'right' | 'left';
    isDark:   boolean;
}

function WheelColumn({ items, index, onChange, width, align = 'center', isDark }: ColumnProps) {
    const last = items.length - 1;

    const [scroll,    setScroll]    = useState(index);
    const [animating, setAnimating] = useState(false);
    const scrollRef  = useRef(index);
    const dragging   = useRef(false);
    const startY     = useRef(0);
    const startScrl  = useRef(0);
    const lastY      = useRef(0);
    const lastT      = useRef(0);
    const vel        = useRef(0);

    const set = (v: number) => { scrollRef.current = v; setScroll(v); };

    useEffect(() => {
        if (!dragging.current) set(index);
         
    }, [index]);

    function down(e: React.PointerEvent) {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragging.current = true;
        startY.current   = e.clientY;
        startScrl.current = scrollRef.current;
        lastY.current    = e.clientY;
        lastT.current    = e.timeStamp;
        vel.current      = 0;
        setAnimating(false);
    }

    function move(e: React.PointerEvent) {
        if (!dragging.current) return;
        const deltaItems = (startY.current - e.clientY) / ITEM_H;
        let next = startScrl.current + deltaItems;
        if (next < 0)         next = next * 0.35;
        else if (next > last) next = last + (next - last) * 0.35;
        set(next);

        const dt = e.timeStamp - lastT.current;
        if (dt > 0) vel.current = ((lastY.current - e.clientY) / ITEM_H / dt) * 1000;
        lastY.current = e.clientY;
        lastT.current = e.timeStamp;
    }

    function up() {
        if (!dragging.current) return;
        dragging.current = false;
        const projected = scrollRef.current + vel.current * 0.1;
        const target    = Math.max(0, Math.min(last, Math.round(projected)));
        setAnimating(true);
        set(target);
        if (target !== index) onChange(target);
    }

    const justify = align === 'right' ? 'flex-end' : align === 'left' ? 'flex-start' : 'center';

    return (
        <div
            className="relative select-none"
            style={{ width, height: WIN_H, perspective: 1000, touchAction: 'none' }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
        >
            <div
                className="absolute inset-0"
                style={{
                    transformStyle:   'preserve-3d',
                    WebkitMaskImage:  'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
                    maskImage:        'linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent)',
                }}
            >
                {items.map((it, i) => {
                    const angle = (i - scroll) * ITEM_ANGLE;
                    if (Math.abs(angle) > 91) return null;
                    const opacity = Math.max(0, Math.cos((angle * Math.PI) / 180));
                    return (
                        <div
                            key={i}
                            className="absolute left-0 right-0 flex items-center px-3"
                            style={{
                                top:              '50%',
                                height:           ITEM_H,
                                marginTop:        -ITEM_H / 2,
                                justifyContent:   justify,
                                transform:        `rotateX(${angle}deg) translateZ(${RADIUS}px)`,
                                transition:       animating ? 'transform 0.2s ease-out, opacity 0.2s ease-out' : 'none',
                                opacity,
                                backfaceVisibility: 'hidden',
                                color:            isDark ? '#fff' : '#000',
                                fontSize:         23,
                                fontWeight:       400,
                            }}
                        >
                            <span className="tabular-nums">{it}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function TimeWheel({ value, onChange, open }: { value: string; onChange: (hhmm: string) => void; open: boolean }) {
    const { theme } = useTheme('theme');
    const isDark = theme === 'dark';

    const [hStr, mStr] = value.split(':');
    const h24    = Number(hStr) || 0;
    const m      = Number(mStr) || 0;
    const period = h24 >= 12 ? 1 : 0;
    const h12    = h24 % 12 === 0 ? 12 : h24 % 12;

    const hours   = Array.from({ length: 12 }, (_, i) => String(i + 1));
    const minutes = Array.from({ length: 60 }, (_, i) => pad2(i));
    const periods = [t('time.am', 'AM'), t('time.pm', 'PM')];

    function emit(nh12: number, nm: number, nperiod: number) {
        let nh24 = nh12 % 12;
        if (nperiod === 1) nh24 += 12;
        onChange(`${pad2(nh24)}:${pad2(nm)}`);
    }

    return (
        <div
            style={{
                overflow:   'hidden',
                maxHeight:  open ? WIN_H + 8 : 0,
                opacity:    open ? 1 : 0,
                transition: 'max-height 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.24s ease-out',
            }}
        >
            <div data-testid="timewheel" className="relative flex items-center justify-center px-4 pb-1" style={{ height: WIN_H }}>
                <div
                    className="pointer-events-none absolute left-4 right-4 rounded-[8px]"
                    style={{
                        top:       '50%',
                        height:    ITEM_H,
                        transform: 'translateY(-50%)',
                        background: isDark ? 'rgba(120,120,128,0.24)' : 'rgba(120,120,128,0.16)',
                    }}
                />
                <div className="relative z-10 flex items-center gap-2">
                    <WheelColumn items={hours}   index={h12 - 1} width={54} align="right"  isDark={isDark}
                        onChange={i => emit(i + 1, m, period)} />
                    <WheelColumn items={minutes} index={m}        width={54} align="left"   isDark={isDark}
                        onChange={i => emit(h12, i, period)} />
                    <WheelColumn items={periods} index={period}   width={54} align="center" isDark={isDark}
                        onChange={i => emit(h12, m, i)} />
                </div>
            </div>
        </div>
    );
}
