import { formatClockTime, useClock } from '@/hooks/useClock';

export interface StatusBarProps {
    use24h: boolean;
    signal: number;
    showWifi: boolean;
    battery: number;
    airplane?: boolean;
    noSim?: boolean;
    light?: boolean;
    controlHint?: boolean;
    editing?: boolean;
}

export function StatusBar({ use24h, signal, showWifi, battery, airplane = false, noSim = false, light = true, controlHint = false, editing = false }: StatusBarProps) {
    const time  = formatClockTime(useClock(), use24h);
    const color = light ? '#ffffff' : '#000000';

    return (
        <div
            className="pointer-events-none relative z-40 flex h-[54px] items-center justify-between px-[20px]"
            style={{ color }}
        >
            {!editing && (
                <span className="font-sf text-[18px] font-bold leading-none" style={{ marginLeft: 5 }}>
                    {time}
                </span>
            )}

            <div className="relative flex items-center gap-[6px]" style={{ marginRight: 5, visibility: editing ? 'hidden' : undefined }}>
                {airplane ? (
                    <Airplane size={23} />
                ) : noSim ? (
                    <span className="font-sf text-[13px] font-semibold leading-none opacity-80">No SIM</span>
                ) : (
                    <>
                        {signal > 0 && <Cellular size={21} />}
                        {showWifi && <Wifi size={21} />}
                    </>
                )}
                <Battery size={28} pct={battery} />

                {controlHint && (
                    <span
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 top-full mt-[3px] block h-[4px] w-[34px] -translate-x-1/2 rounded-full"
                        style={{ backgroundColor: color, opacity: 0.5 }}
                    />
                )}
            </div>
        </div>
    );
}


function Cellular({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" aria-hidden>
            <path d="M472 432h-48a24 24 0 01-24-24V104a24 24 0 0124-24h48a24 24 0 0124 24v304a24 24 0 01-24 24zM344 432h-48a24 24 0 01-24-24V184a24 24 0 0124-24h48a24 24 0 0124 24v224a24 24 0 01-24 24zM216 432h-48a24 24 0 01-24-24V248a24 24 0 0124-24h48a24 24 0 0124 24v160a24 24 0 01-24 24zM88 432H40a24 24 0 01-24-24v-96a24 24 0 0124-24h48a24 24 0 0124 24v96a24 24 0 01-24 24z" />
        </svg>
    );
}

function Wifi({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" aria-hidden>
            <path d="M346.65 304.3a136 136 0 00-180.71 0 21 21 0 1027.91 31.38 94 94 0 01124.89 0 21 21 0 0027.91-31.4z" />
            <path d="M256.28 183.7a221.47 221.47 0 00-151.8 59.92 21 21 0 1028.68 30.67 180.28 180.28 0 01246.24 0 21 21 0 1028.68-30.67 221.47 221.47 0 00-151.8-59.92z" />
            <path d="M462 175.86a309 309 0 00-411.44 0 21 21 0 1028 31.29 267 267 0 01355.43 0 21 21 0 0028-31.31z" />
            <circle cx="256.28" cy="393.41" r="32" />
        </svg>
    );
}

function Airplane({ size }: { size: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 512 512" fill="currentColor" aria-hidden>
            <path d="M186.62 464H160a16 16 0 01-14.57-22.6l64.46-142.25L113.1 297l-35.3 42.77C71.07 348.23 65.7 352 52 352H34.08a17.66 17.66 0 01-14.7-7.06c-2.38-3.21-4.72-8.65-2.44-16.41l19.82-71c.15-.53.33-1.06.53-1.58a.38.38 0 000-.15 14.82 14.82 0 01-.53-1.59l-19.84-71.45c-2.15-7.61.2-12.93 2.56-16.06a16.83 16.83 0 0113.6-6.7H52c10.23 0 20.16 4.59 26 12l34.57 42.05 97.32-1.44-64.44-142A16 16 0 01160 48h26.91a25 25 0 0119.35 9.8l125.05 152 57.77-1.52c4.23-.23 15.95-.31 18.66-.31C463 208 496 225.94 496 256c0 9.46-3.78 27-29.07 38.16-14.93 6.6-34.85 9.94-59.21 9.94-2.68 0-14.37-.08-18.66-.31l-57.76-1.54-125.36 152a25 25 0 01-19.32 9.75z" />
        </svg>
    );
}

function Battery({ size, pct }: { size: number; pct: number }) {
    const value = Math.max(0, Math.min(100, Math.round(pct)));
    const fillW = (292.63 * value) / 100;
    const fill  = value <= 20 ? '#ff453a' : 'currentColor';
    return (
        <svg width={size} height={size} viewBox="0 0 512 512" fill="none" aria-hidden>
            <rect x="32" y="144" width="400" height="224" rx="45.7" ry="45.7" stroke="currentColor" strokeLinecap="square" strokeMiterlimit="10" strokeWidth="32" />
            <path d="M480 218.67v74.66" stroke="currentColor" strokeLinecap="round" strokeMiterlimit="10" strokeWidth="32" />
            {value > 0 && <rect x="85.69" y="198.93" width={fillW} height="114.14" rx="8" ry="8" fill={fill} />}
        </svg>
    );
}
