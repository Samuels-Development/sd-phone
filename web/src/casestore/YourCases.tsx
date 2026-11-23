import { useState } from 'react';
import { Check, PenLine, Trash2 } from 'lucide-react';

import { t } from '@/i18n';
import { failText } from '@/core/api';
import { Spinner } from '@/ui/Spinner';
import { sectionHeader } from '@/ui/surfaces';
import { designKey, equipCase, removeCase, type Design, type PhoneLook, type StoreState } from './casesApi';
import { designParts, labelOf, partLabels } from './labels';
import { BUY_BG, CaseThumb } from './ui';

const THUMB_W = 70;
const THUMB_H = 96;

/** The designs a player keeps (only on servers where a case is not an item): put one on, take the
 *  case off, start a new design from one, or throw one away. Picking a row shows it on the phone. */
export function YourCases({ state, frameHex, look, selected, onSelect, onPatch, onEdit }: {
    state:    StoreState;
    frameHex: string;
    look:     PhoneLook;
    selected: number | null;
    onSelect: (index: number) => void;
    onPatch:  (patch: Partial<StoreState>) => void;
    onEdit:   (d: Design) => void;
}) {
    const labels = partLabels();
    const [confirming, setConfirming] = useState<number | null>(null);
    const [busy, setBusy] = useState<number | 'off' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { owned, catalog, blocked } = state;
    const palette = catalog.palette;
    const wornKey = designKey(state.equipped);
    const wornIndex = wornKey ? owned.findIndex(d => designKey(d) === wornKey) : -1;

    async function wear(index: number | null) {
        if (busy !== null) return;
        setBusy(index ?? 'off');
        setError(null);
        const res = await equipCase(index === null ? null : index + 1);
        setBusy(null);
        if (!res.success || !res.data) { setError(failText(res, t('cases.wearFailed', 'That did not work. Try again.'))); return; }
        onPatch({ equipped: res.data.equipped });
    }

    async function remove(index: number) {
        if (busy !== null) return;
        setBusy(index);
        setError(null);
        setConfirming(null);
        const res = await removeCase(index + 1);
        setBusy(null);
        if (!res.success || !res.data) { setError(failText(res, t('cases.deleteFailed', 'That case could not be deleted'))); return; }
        onPatch({ owned: res.data.owned, equipped: res.data.equipped });
    }

    const summary = (d: Design) => {
        const parts = designParts(labels, d);
        return parts.length ? parts.join(', ') : t('cases.plainShell', 'Plain shell');
    };

    return (
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar rounded-[16px] bg-base px-3 pb-4 shadow-[inset_0_2px_10px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(0,0,0,0.35),0_1px_0_rgba(255,255,255,0.05)]">
            <div className="flex h-[40px] items-baseline justify-between px-1 pt-3">
                <span className={sectionHeader}>{t('cases.yourCollection', 'Your collection')}</span>
                <span className="text-[14px] tabular-nums text-ios-gray">
                    {t('cases.keptCount', '{n} of {max}', { n: owned.length, max: state.maxOwned })}
                </span>
            </div>

            {error && <p className="mb-2 px-1 text-[14px] font-medium text-ios-red">{error}</p>}

            {owned.length === 0 ? (
                <div className="mt-2 rounded-[16px] border border-dashed border-white/[0.16] px-6 py-7 text-center">
                    <div className="text-[17px] font-semibold">{t('cases.emptyTitle', 'No Cases Yet')}</div>
                    <p className="mt-1.5 text-[14.5px] leading-snug text-white/60">
                        {t('cases.emptySubtitle', 'Cases you buy are kept here, so you can swap between them any time.')}
                    </p>
                </div>
            ) : (
                <div className="mt-1 flex flex-col gap-2">
                    {owned.map((d, i) => {
                        const worn = i === wornIndex;
                        const on = selected === i;
                        return (
                            <div
                                key={`${i}:${designKey(d)}`}
                                className={`rounded-[16px] bg-surface p-2 transition-shadow duration-150 ${on ? 'shadow-[0_0_0_2px_#F59E0B]' : 'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'}`}
                            >
                                {confirming === i ? (
                                    <div className="flex min-h-[96px] flex-col justify-center px-2">
                                        <div className="text-[15.5px] font-semibold">{t('cases.deleteTitle', 'Delete this case?')}</div>
                                        <p className="mt-0.5 text-[13.5px] leading-snug text-white/60">
                                            {worn
                                                ? t('cases.deleteWornMessage', 'It comes off your phone too. You will not get your money back.')
                                                : t('cases.deleteMessage', 'You will not get your money back.')}
                                        </p>
                                        <div className="mt-2.5 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setConfirming(null)}
                                                className="h-[34px] flex-1 rounded-full bg-white/[0.1] text-[14.5px] font-semibold transition-transform duration-150 active:scale-95"
                                            >
                                                {t('cases.cancel', 'Cancel')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void remove(i)}
                                                className="h-[34px] flex-1 rounded-full bg-ios-red text-[14.5px] font-semibold text-white transition-transform duration-150 active:scale-95"
                                            >
                                                {t('cases.delete', 'Delete')}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => onSelect(i)}
                                            aria-pressed={on}
                                            aria-label={t('cases.showOnPhone', 'Show on the phone')}
                                            className="shrink-0 transition-transform duration-150 active:scale-[0.96]"
                                        >
                                            <CaseThumb design={d} frameHex={frameHex} palette={palette} body={state.body} look={look} w={THUMB_W} h={THUMB_H} />
                                        </button>
                                        <button type="button" onClick={() => onSelect(i)} className="flex min-w-0 flex-1 flex-col items-start text-start">
                                            {worn && (
                                                <span className="mb-0.5 flex items-center gap-1 text-[12px] font-semibold text-[#FBBF24]">
                                                    <Check className="h-[12px] w-[12px]" strokeWidth={3.2} />
                                                    {t('cases.onYourPhone', 'On your phone')}
                                                </span>
                                            )}
                                            <span className="w-full truncate text-[16px] font-semibold leading-tight">{labelOf(labels.style, d.style)}</span>
                                            <span className="mt-0.5 line-clamp-2 w-full text-[13px] leading-snug text-ios-gray">{summary(d)}</span>
                                        </button>
                                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => void wear(worn ? null : i)}
                                                disabled={busy !== null || (!worn && blocked)}
                                                className={`flex h-[32px] min-w-[86px] items-center justify-center rounded-full px-3 text-[14px] font-semibold transition-[transform,opacity] duration-150 active:scale-95 disabled:opacity-40 ${
                                                    worn ? 'bg-white/[0.1]' : 'text-[#2b1703]'
                                                }`}
                                                style={worn ? undefined : { background: BUY_BG }}
                                            >
                                                {busy === i || (worn && busy === 'off')
                                                    ? <Spinner size={16} className={worn ? '' : '!border-[#2b1703]/30 !border-t-[#2b1703]'} />
                                                    : worn ? t('cases.takeOff', 'Take Off') : t('cases.putOn', 'Put On')}
                                            </button>
                                            <div className="flex gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => onEdit(d)}
                                                    aria-label={t('cases.editCopy', 'Edit a Copy')}
                                                    title={t('cases.editCopy', 'Edit a Copy')}
                                                    className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/[0.07] text-white/75 transition-transform duration-150 hover:text-white active:scale-90"
                                                >
                                                    <PenLine className="h-[15px] w-[15px]" strokeWidth={2.4} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirming(i)}
                                                    disabled={busy !== null}
                                                    aria-label={t('cases.delete', 'Delete')}
                                                    title={t('cases.delete', 'Delete')}
                                                    className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/[0.07] text-white/75 transition-transform duration-150 hover:text-ios-red active:scale-90 disabled:opacity-40"
                                                >
                                                    <Trash2 className="h-[15px] w-[15px]" strokeWidth={2.4} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {blocked && owned.length > 0 && (
                <p className="mt-3 px-1 text-[13px] leading-snug text-ios-gray">
                    {t('cases.blockedListNote', 'This phone comes in its own case, so none of these can go on it.')}
                </p>
            )}
        </div>
    );
}
