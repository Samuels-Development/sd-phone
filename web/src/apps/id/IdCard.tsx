import { UserRound } from 'lucide-react';

import { CARD_RATIO, cardTitle, fieldLabel, fieldValue, kindLabel, type IdCardData } from './data';

function shade(hex: string, amount: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amount > 0 ? (255 - v) * amount : v * amount))));
    const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function Seal({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 100 100" className={className} aria-hidden fill="none" stroke="currentColor">
            <circle cx="50" cy="50" r="46" strokeWidth="2.5" />
            <circle cx="50" cy="50" r="38" strokeWidth="1.2" strokeDasharray="2.5 3" />
            <path d="M50 22 L57.5 40.5 L77 41.5 L61.5 53.5 L67 72.5 L50 61.5 L33 72.5 L38.5 53.5 L23 41.5 L42.5 40.5 Z" strokeWidth="2" strokeLinejoin="round" />
        </svg>
    );
}

const SHADOW = { textShadow: '0 1px 3px rgba(0,0,0,0.35)' };

export function IdCard({ card, className = '' }: { card: IdCardData; className?: string }) {
    const fields = card.fields.slice(0, 4);
    return (
        <div
            className={`relative w-full select-none overflow-hidden rounded-[20px] text-left font-sf text-white ${className}`}
            style={{
                aspectRatio: String(CARD_RATIO),
                background:  `linear-gradient(150deg, ${shade(card.color, 0.22)} 0%, ${card.color} 52%, ${shade(card.color, -0.3)} 100%)`,
                boxShadow:   '0 10px 26px rgba(0,0,0,0.28), inset 0 0 0 0.5px rgba(255,255,255,0.18)',
                contain:     'paint',
            }}
        >
            <Seal className="pointer-events-none absolute -bottom-[14%] -right-[6%] h-[68%] opacity-[0.12]" />
            <div className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(150deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 38%), linear-gradient(0deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0) 32%)' }} />

            <div className="absolute inset-x-0 top-0 flex items-start justify-between px-4 pt-[13px]">
                <div className="min-w-0 pr-3">
                    <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/65">{kindLabel(card.kind)}</div>
                    <div className="truncate text-[24px] font-extrabold leading-[1.1] tracking-[-0.01em]" style={SHADOW}>{cardTitle(card)}</div>
                </div>
                {card.kind !== 'job' && (
                    <div className="max-w-[48%] shrink-0 pt-[4px] text-right text-[10px] font-bold uppercase leading-[1.3] tracking-[0.14em] text-white/60">
                        {card.issuer}
                    </div>
                )}
            </div>

            <div className="absolute inset-x-4 bottom-[14px] top-[36%] flex gap-[14px]">
                <div className="h-full shrink-0 overflow-hidden rounded-[10px] bg-white/15 ring-1 ring-white/25" style={{ aspectRatio: '3 / 4' }}>
                    {card.portrait ? (
                        <img src={card.portrait} alt="" className="h-full w-full object-cover" draggable={false} />
                    ) : (
                        <div className="flex h-full w-full items-end justify-center text-white/55">
                            <UserRound className="h-[85%] w-[85%]" strokeWidth={1.4} />
                        </div>
                    )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                    <div className="line-clamp-2 text-[19px] font-bold uppercase leading-[1.12] tracking-[0.03em]" style={SHADOW}>{card.name}</div>
                    {card.subtitle && <div className="mt-0.5 truncate text-[13px] font-semibold text-white/85">{card.subtitle}</div>}
                    <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-[7px]">
                        {fields.map(f => (
                            <div key={f.key} className="min-w-0">
                                <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-white/60">{fieldLabel(f.key)}</div>
                                <div className="truncate text-[15px] font-semibold tabular-nums leading-tight text-white" style={SHADOW}>{fieldValue(f.key, f.value)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
