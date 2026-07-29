import type { ReactNode } from 'react';

import { Slider } from './Slider';

export function SliderRow({
    label, value, display, min = 0, max = 100, step = 1, divider = false, muted = false, accessory, onChange,
}: {
    label:      string;
    value:      number;
    display?:   string;
    min?:       number;
    max?:       number;
    step?:      number;
    divider?:   boolean;
    muted?:     boolean;
    accessory?: ReactNode;
    onChange:   (v: number) => void;
}) {
    return (
        <div className="relative px-4 pb-1.5 pt-2.5">
            <div className="flex items-baseline gap-2">
                <span className={`flex-1 text-[17px] font-normal ${muted ? 'text-ios-gray' : 'text-black dark:text-white'}`}>
                    {label}
                </span>
                {accessory}
                {display !== undefined && (
                    <span className="shrink-0 text-[15px] tabular-nums text-ios-gray">{display}</span>
                )}
            </div>
            <Slider
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={onChange}
                ariaLabel={label}
            />
            {divider && (
                <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-ios-gray4 dark:bg-control"
                    style={{ height: '0.5px' }}
                />
            )}
        </div>
    );
}
