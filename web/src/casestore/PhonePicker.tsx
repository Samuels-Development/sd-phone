import { useId, useState } from 'react';

import { t } from '@/i18n';
import { failText } from '@/core/api';
import { frameHex } from '@/shell/frameColors';
import { Spinner } from '@/ui/Spinner';
import { showPhone, type PhoneBody, type PhoneItem, type PhoneLook, type ShownPhone } from './casesApi';

function Lens({ cx, cy }: { cx: number; cy: number }) {
    return (
        <>
            <circle cx={cx} cy={cy} r="1.25" fill="rgba(0,0,0,0.6)" />
            <circle cx={cx} cy={cy} r="0.7" fill="rgba(255,255,255,0.75)" />
        </>
    );
}

/** The cameras on a phone's back, as the models have them: the classic phone a block in the corner
 *  and its foldable a two-lens bar across the top; the Slate phone three lenses straight off the
 *  glass, down the side or, folded, in a row across the top. */
function Cameras({ fold, look }: { fold: boolean; look: PhoneLook }) {
    if (look === 'slate') {
        return fold
            ? <>{[5.6, 8.4, 11.2].map(x => <Lens key={x} cx={x} cy={3.9} />)}</>
            : <>{[3.6, 6.4, 9.2].map(y => <Lens key={y} cx={3.8} cy={y} />)}</>;
    }
    return fold ? (
        <>
            <rect x="4" y="2.5" width="8" height="3.6" rx="1.8" fill="rgba(0,0,0,0.55)" />
            <circle cx="6.1" cy="4.3" r="1" fill="rgba(255,255,255,0.75)" />
            <circle cx="9.3" cy="4.3" r="1" fill="rgba(255,255,255,0.75)" />
        </>
    ) : (
        <>
            <rect x="2.2" y="2.2" width="5.6" height="6" rx="1.6" fill="rgba(0,0,0,0.5)" />
            <circle cx="4" cy="4" r="0.9" fill="rgba(255,255,255,0.75)" />
            <circle cx="4" cy="6.5" r="0.9" fill="rgba(255,255,255,0.75)" />
        </>
    );
}

/** A phone's back in its frame colour, for a chip: a foldable has its hinge down one side, a Slate
 *  phone rounder corners, and each its own cameras. */
function PhoneGlyph({ hex, fold, look }: { hex: string; fold: boolean; look: PhoneLook }) {
    const shine = useId();
    const r = fold ? 2.5 : look === 'slate' ? 4.5 : 3.5;
    return (
        <svg aria-hidden width="14" height="24" viewBox="0 0 14 24" className="shrink-0">
            <defs>
                <linearGradient id={shine} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="rgba(255,255,255,0.32)" />
                    <stop offset="0.55" stopColor="rgba(255,255,255,0)" />
                </linearGradient>
            </defs>
            <rect x="0.5" y="0.5" width="13" height="23" rx={r} fill={hex} stroke="rgba(0,0,0,0.35)" />
            <rect x="0.5" y="0.5" width="13" height="23" rx={r} fill={`url(#${shine})`} />
            {fold && <rect x="0.5" y="0.5" width="2" height="23" fill="rgba(0,0,0,0.38)" />}
            <Cameras fold={fold} look={look} />
        </svg>
    );
}

/** "Your phone": the phones the player carries, a chip each, the one on the counter ringed (its
 *  colour, kind and design: `body` 'shut' is a foldable on the counter). Picking another asks the
 *  game to put that one on the counter instead; `onShown` gets what it is. */
export function PhonePicker({ phones, frame, body, look, onShown }: {
    phones:  PhoneItem[];
    frame:   string;
    body:    PhoneBody;
    look:    PhoneLook;
    onShown: (phone: ShownPhone) => void;
}) {
    const [picked, setPicked] = useState<number | null>(null);
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const shown = (p: PhoneItem | undefined) => !!p && p.color === frame && p.fold === (body === 'shut') && p.look === look;
    const current = picked !== null && shown(phones[picked]) ? picked : phones.findIndex(shown);

    async function pick(index: number) {
        if (busy !== null || index === current) return;
        setBusy(index);
        setError(null);
        const res = await showPhone(phones[index].color, phones[index].fold, phones[index].look);
        setBusy(null);
        if (!res.success || !res.data) {
            setError(failText(res, t('cases.phoneShowFailed', 'That phone could not be shown. Try again.')));
            return;
        }
        setPicked(index);
        onShown(res.data);
    }

    return (
        <div className="mt-4 shrink-0">
            <div className="text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-ios-gray">{t('cases.yourPhone', 'Your phone')}</div>
            <div
                className="-mx-[3px] mt-2 flex gap-2 overflow-x-auto no-scrollbar p-[3px]"
                onWheel={e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}
            >
                {phones.map((p, i) => {
                    const on = i === current;
                    return (
                        <button
                            key={`${i}:${p.color}:${p.fold ? 'fold' : 'bar'}:${p.look}`}
                            type="button"
                            aria-pressed={on}
                            disabled={busy !== null && busy !== i}
                            onClick={() => void pick(i)}
                            className={`flex h-[40px] max-w-[200px] shrink-0 items-center gap-2 rounded-[11px] bg-surface pe-3 ps-2.5 text-[13.5px] font-semibold transition-[box-shadow,transform,opacity] duration-150 active:scale-[0.96] disabled:opacity-50 ${
                                on ? 'text-white shadow-[0_0_0_2px_#F59E0B]' : 'text-white/75 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)] hover:text-white'
                            }`}
                        >
                            {busy === i ? <Spinner size={14} /> : <PhoneGlyph hex={frameHex(p.color)} fold={p.fold} look={p.look} />}
                            <span className="truncate">{p.label || t('cases.phoneFallback', 'Phone')}</span>
                        </button>
                    );
                })}
            </div>
            {error && <p className="mt-1.5 px-1 text-[12.5px] font-medium text-ios-red">{error}</p>}
        </div>
    );
}
