import { useState } from 'react';

import { t } from '@/i18n';
import { setPhoneStyle, type CasesState, type PhoneOptions, type PhoneStyle, type TrimKind } from './casesApi';
import { OptionTile, Swatches } from './ui';

const DEFAULT_LOOK = 'classic';

function lookLabels(): Record<string, { name: string; blurb: string }> {
    return {
        classic: {
            name:  t('cases.lookClassic', 'Classic'),
            blurb: t('cases.lookClassicBlurb', 'Flat brushed sides and a raised camera block.'),
        },
        slate: {
            name:  t('cases.lookSlate', 'Slate'),
            blurb: t('cases.lookSlateBlurb', 'Rounded polished sides and three lenses straight off the glass.'),
        },
    };
}

function trimLabels(): Record<TrimKind, { name: string; blurb: string }> {
    return {
        rings:   { name: t('cases.trimRings', 'Lens Rings'), blurb: t('cases.trimRingsBlurb', 'A coloured ring round each lens.') },
        bezel:   { name: t('cases.trimBezel', 'Camera Surround'), blurb: t('cases.trimBezelBlurb', 'A coloured band round the cameras.') },
        buttons: { name: t('cases.trimButtons', 'Buttons'), blurb: t('cases.trimButtonsBlurb', 'Coloured side buttons. A case covers them.') },
    };
}

/** The back of each design, small: what tells them apart is where the lenses sit. */
function LookArt({ look, hex, ring }: { look: string; hex: string; ring?: string }) {
    const lens = (cx: number, cy: number, r: number) => (
        <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r={r} fill="#15171c" stroke={ring ?? 'rgba(255,255,255,0.55)'} strokeWidth={ring ? 1.8 : 1.1} />
            <circle cx={cx - r * 0.3} cy={cy - r * 0.3} r={r * 0.22} fill="rgba(255,255,255,0.55)" />
        </g>
    );
    return (
        <svg width="54" height="104" viewBox="0 0 54 104" aria-hidden>
            <rect x="2" y="2" width="50" height="100" rx={look === 'slate' ? 10 : 8} fill={hex} stroke="rgba(0,0,0,0.22)" strokeWidth="1" />
            <rect x="2" y="2" width="50" height="100" rx={look === 'slate' ? 10 : 8} fill="url(#lookShade)" />
            <defs>
                <linearGradient id="lookShade" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="rgba(255,255,255,0.22)" />
                    <stop offset="1" stopColor="rgba(0,0,0,0.16)" />
                </linearGradient>
            </defs>
            {look === 'slate' ? (
                <>
                    {[13, 25, 37].map(cy => lens(13.5, cy, 4.6))}
                    <circle cx="25" cy="13" r="2" fill="#f1e2b3" />
                    <circle cx="25" cy="25" r="1.5" fill="#15171c" />
                </>
            ) : (
                <>
                    <rect x="6" y="6" width="25" height="26" rx="7" fill="rgba(0,0,0,0.20)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8" />
                    {lens(13.5, 13, 4.9)}
                    {lens(13.5, 25.5, 4.9)}
                    {lens(24, 19, 4.9)}
                    <circle cx="25.5" cy="10.5" r="1.7" fill="#f1e2b3" />
                </>
            )}
        </svg>
    );
}

function styleOf(look: string, trims: Partial<Record<TrimKind, number>>): PhoneStyle | null {
    const fitted = Object.keys(trims).length > 0;
    if (look === DEFAULT_LOOK && !fitted) return null;
    return { look, ...trims };
}

/** The Phone tab: the design of the phone itself and the small coloured trims on it. Nothing here is
 *  bought; a change is applied to the phone in hand at once. */
export function PhoneTab({ state, frameHex, onPatch }: {
    state:    CasesState;
    frameHex: string;
    onPatch:  (p: Partial<CasesState>) => void;
}) {
    const phone = state.phone as PhoneOptions;
    const palette = state.catalog.palette;
    const current = phone.style || null;
    const [look, setLook] = useState(current?.look ?? DEFAULT_LOOK);
    const [trims, setTrims] = useState<Partial<Record<TrimKind, number>>>(() => {
        const out: Partial<Record<TrimKind, number>> = {};
        for (const kind of phone.trims) {
            const row = current?.[kind];
            if (typeof row === 'number') out[kind] = row;
        }
        return out;
    });

    async function apply(nextLook: string, nextTrims: Partial<Record<TrimKind, number>>) {
        setLook(nextLook);
        setTrims(nextTrims);
        const res = await setPhoneStyle(styleOf(nextLook, nextTrims));
        if (res.success && res.data) onPatch({ phone: res.data });
    }

    const looks = lookLabels();
    const trimNames = trimLabels();
    const ringHex = typeof trims.rings === 'number' ? palette[trims.rings] : undefined;

    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-3">
            {phone.looks.length > 1 && (
                <section>
                    <h3 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-ios-gray">{t('cases.phoneDesign', 'Design')}</h3>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                        {phone.looks.map(id => (
                            <OptionTile
                                key={id}
                                selected={look === id}
                                label={looks[id]?.name ?? id}
                                wellH={132}
                                onPress={() => void apply(id, trims)}
                            >
                                <LookArt look={id} hex={frameHex} ring={ringHex} />
                            </OptionTile>
                        ))}
                    </div>
                    <p className="mt-1 px-1 text-[13px] leading-snug text-ios-gray">
                        {looks[look]?.blurb} {t('cases.phoneDesignNote', 'Both are the same size, so every case fits either.')}
                    </p>
                </section>
            )}

            {phone.trims.length > 0 && (
                <section className="mt-5">
                    <h3 className="px-1 text-[13px] font-semibold uppercase tracking-wide text-ios-gray">{t('cases.phoneTrims', 'Trims')}</h3>
                    <div className="mt-2 flex flex-col gap-3">
                        {phone.trims.map(kind => {
                            const row = trims[kind];
                            const fitted = typeof row === 'number';
                            return (
                                <div key={kind} className="rounded-[18px] bg-surface px-1.5 pb-1 pt-2 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
                                    <div className="mb-1 flex min-h-[34px] items-center gap-2.5 px-2.5">
                                        <span
                                            className="h-[26px] w-[26px] shrink-0 rounded-full"
                                            style={{
                                                background: fitted ? palette[row] : 'transparent',
                                                boxShadow: fitted ? 'inset 0 0 0 1px rgba(0,0,0,0.14)' : 'inset 0 0 0 1.5px rgb(var(--label) / 0.18)',
                                            }}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[15.5px] font-semibold leading-tight">{trimNames[kind]?.name ?? kind}</span>
                                            <span className="block truncate text-[12.5px] leading-tight text-ios-gray">{trimNames[kind]?.blurb}</span>
                                        </span>
                                        <button
                                            type="button"
                                            aria-pressed={!fitted}
                                            onClick={() => {
                                                const next = { ...trims };
                                                delete next[kind];
                                                void apply(look, next);
                                            }}
                                            className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold transition-opacity active:opacity-60 ${
                                                fitted ? 'bg-black/[0.06] text-black/70 dark:bg-white/[0.10] dark:text-white/80' : 'bg-[#F59E0B] text-white'
                                            }`}
                                        >
                                            {t('cases.trimStandard', 'Standard')}
                                        </button>
                                    </div>
                                    <Swatches palette={palette} value={fitted ? row : -1} onChange={r => void apply(look, { ...trims, [kind]: r })} />
                                </div>
                            );
                        })}
                    </div>
                    <p className="mt-2 px-1 text-[13px] leading-snug text-ios-gray">
                        {t('cases.phoneTrimsNote', 'Trims are free and stay on the phone under any case. Other players see them.')}
                    </p>
                </section>
            )}
        </div>
    );
}
