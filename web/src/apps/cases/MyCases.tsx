import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Ellipsis, Maximize2, Plus } from 'lucide-react';

import { t } from '@/i18n';
import { failText } from '@/core/api';
import { ActionSheet } from '@/ui/ActionSheet';
import { AlertDialog } from '@/ui/AlertDialog';
import { sectionHeader } from '@/ui/surfaces';
import { FramedPreview, framingScale } from './CasePreview';
import { designKey, designPrice, equipCase, removeCase, type CasesState, type Design } from './casesApi';
import { designChips, designParts, labelOf, partLabels } from './labels';
import { ColourDot, ShellWash, money } from './ui';
import { CaseViewer } from './Viewer';

const GAP = 10;
const TILE_H = 170;
const HERO_W = 128;
const HERO_H = 182;

/** A design framed whole and centred in a fixed box on its own shell-coloured backdrop. */
function Thumb({ design, frameHex, palette, w, h, children }: {
    design:    Design | null;
    frameHex:  string;
    palette:   string[];
    w:         number;
    h:         number;
    children?: ReactNode;
}) {
    const boxH = h - 18;
    const s = framingScale('whole', design, w, boxH, 3);
    return (
        <span className="relative isolate block overflow-hidden rounded-[16px]" style={{ width: w, height: h }}>
            <ShellWash hex={design ? palette[design.color] ?? '#888888' : frameHex} />
            <FramedPreview design={design} frameHex={frameHex} palette={palette} framing="whole" boxW={w} boxH={boxH} boxTop={9} detail={s} still />
            {children}
        </span>
    );
}

function EmptyCard({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
    return (
        <div className="flex flex-col items-center rounded-[18px] border border-dashed border-black/[0.14] px-6 py-7 text-center dark:border-white/[0.16]">
            <div className="text-[17px] font-semibold">{title}</div>
            <p className="mt-1.5 max-w-[290px] text-[14.5px] leading-snug text-black/60 dark:text-white/60">{body}</p>
            <button
                type="button"
                onClick={onAction}
                className="mt-4 flex items-center gap-1.5 rounded-full bg-[#F59E0B] px-5 py-2.5 text-[16px] font-semibold text-white transition-transform duration-150 active:scale-95"
            >
                <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} />
                {action}
            </button>
        </div>
    );
}

export function MyCases({ state, frameHex, onPatch, onEdit, onDesign }: {
    state:    CasesState;
    frameHex: string;
    onPatch:  (patch: Partial<CasesState>) => void;
    onEdit:   (d: Design) => void;
    onDesign: () => void;
}) {
    const labels = partLabels();
    const [menuFor, setMenuFor] = useState<number | null>(null);
    const [deleteFor, setDeleteFor] = useState<number | null>(null);
    const [viewing, setViewing] = useState<Design | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);
    const [gridW, setGridW] = useState(0);

    useLayoutEffect(() => {
        const el = gridRef.current;
        if (!el) return;
        const measure = () => setGridW(el.clientWidth);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const { owned, catalog, blocked } = state;
    const palette = catalog.palette;
    const worn = state.equipped || null;
    const wornKey = designKey(state.equipped);
    const wornIndex = wornKey ? owned.findIndex(d => designKey(d) === wornKey) : -1;
    const others = owned.map((d, i) => ({ d, i })).filter(x => x.i !== wornIndex);
    const tileW = gridW > 0 ? Math.floor((gridW - GAP * 2) / 3) : 0;

    async function wear(index: number | null) {
        if (busy) return;
        setBusy(true);
        setError(null);
        const res = await equipCase(index === null ? null : index + 1);
        setBusy(false);
        if (!res.success || !res.data) { setError(failText(res, t('cases.wearFailed', 'That did not work. Try again.'))); return; }
        onPatch({ equipped: res.data.equipped });
    }

    async function remove(index: number) {
        if (busy) return;
        setBusy(true);
        setError(null);
        const res = await removeCase(index + 1);
        setBusy(false);
        if (!res.success || !res.data) { setError(failText(res, t('cases.deleteFailed', 'That case could not be deleted'))); return; }
        onPatch({ owned: res.data.owned, equipped: res.data.equipped });
    }

    const styleName = (d: Design) => labelOf(labels.style, d.style);
    const summary = (d: Design) => {
        const parts = designParts(labels, d);
        return parts.length ? parts.join(' · ') : t('cases.plainShell', 'Plain shell');
    };

    const menuDesign = menuFor !== null ? owned[menuFor] : undefined;
    const deleteDesign = deleteFor !== null ? owned[deleteFor] : undefined;
    const chips = worn ? designChips(labels, worn, palette) : [];

    return (
        <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-10 pt-3">
            {error && <p className="mb-2.5 px-1 text-[14px] font-medium text-ios-red">{error}</p>}

            <section className="rounded-[22px] bg-surface p-2.5 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
                <div className="flex gap-3.5">
                    <button
                        type="button"
                        onClick={() => setViewing(worn)}
                        disabled={!worn}
                        aria-label={t('cases.viewFullScreen', 'View full screen')}
                        className="relative shrink-0 transition-transform duration-150 enabled:cursor-zoom-in enabled:active:scale-[0.97]"
                    >
                        <Thumb design={worn} frameHex={frameHex} palette={palette} w={HERO_W} h={HERO_H}>
                            {worn && (
                                <span className="absolute bottom-2 end-2 flex h-[26px] w-[26px] items-center justify-center rounded-full bg-elevated/85 text-black/70 shadow-sm backdrop-blur-md dark:bg-control/80 dark:text-white/85">
                                    <Maximize2 className="h-[13px] w-[13px]" strokeWidth={2.6} />
                                </span>
                            )}
                        </Thumb>
                    </button>

                    <div className="flex min-w-0 flex-1 flex-col py-1.5 pe-1">
                        <span className={`flex items-center gap-1 text-[12.5px] font-semibold uppercase tracking-wider ${worn ? 'text-[#B45309] dark:text-[#FBBF24]' : 'text-ios-gray'}`}>
                            {worn && <Check className="h-[13px] w-[13px]" strokeWidth={3.2} />}
                            {t('cases.nowWearing', 'Now wearing')}
                        </span>
                        <span className="mt-1 truncate text-[22px] font-bold leading-tight">
                            {worn ? styleName(worn) : t('cases.noCase', 'No case')}
                        </span>
                        {worn ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                                <span className="flex h-[24px] items-center gap-1.5 rounded-full bg-black/[0.05] px-2 text-[12.5px] font-medium dark:bg-white/[0.08]">
                                    <ColourDot hex={palette[worn.color] ?? '#888888'} />
                                    {t('cases.shellChip', 'Shell')}
                                </span>
                                {chips.map(c => (
                                    <span key={c.kind} className="flex h-[24px] max-w-full items-center gap-1.5 rounded-full bg-black/[0.05] px-2 text-[12.5px] font-medium dark:bg-white/[0.08]">
                                        {c.hex && <ColourDot hex={c.hex} />}
                                        <span className="truncate">{c.name}</span>
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-1.5 text-[14px] leading-snug text-black/60 dark:text-white/60">
                                {owned.length
                                    ? t('cases.bareHint', 'Your phone is bare. Pick a case below to put it on.')
                                    : t('cases.bareHintEmpty', 'Your phone is bare. Design a case to dress it up.')}
                            </p>
                        )}
                        {worn && (
                            <div className="mt-auto flex gap-2 pt-3">
                                <button
                                    type="button"
                                    onClick={() => void wear(null)}
                                    disabled={busy || blocked}
                                    className="h-[36px] flex-1 rounded-full bg-black/[0.07] text-[15px] font-semibold transition-[transform,opacity] duration-150 active:scale-95 disabled:opacity-40 dark:bg-white/[0.12]"
                                >
                                    {t('cases.takeOff', 'Take Off')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => (wornIndex >= 0 ? setMenuFor(wornIndex) : setViewing(worn))}
                                    disabled={busy}
                                    aria-label={t('cases.more', 'More')}
                                    className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-black/[0.07] transition-transform duration-150 active:scale-90 dark:bg-white/[0.12]"
                                >
                                    <Ellipsis className="h-[18px] w-[18px]" strokeWidth={2.6} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <div className="mb-2 mt-6 flex items-baseline justify-between px-1">
                <span className={sectionHeader}>{t('cases.yourCollection', 'Your collection')}</span>
                <span className="text-[14px] tabular-nums text-ios-gray">
                    {t('cases.keptCount', '{n} of {max}', { n: owned.length, max: state.maxOwned })}
                </span>
            </div>

            <div ref={gridRef}>
                {others.length === 0 ? (
                    owned.length === 0 ? (
                        <EmptyCard
                            title={t('cases.emptyTitle', 'No Cases Yet')}
                            body={t('cases.emptySubtitle', 'Cases you buy are kept here, so you can swap between them any time.')}
                            action={t('cases.designOne', 'Design a Case')}
                            onAction={onDesign}
                        />
                    ) : (
                        <EmptyCard
                            title={t('cases.onlyOneTitle', 'Nothing Else Here Yet')}
                            body={t('cases.onlyOneBody', 'Design another case and it waits here while you wear this one.')}
                            action={t('cases.designOne', 'Design a Case')}
                            onAction={onDesign}
                        />
                    )
                ) : (
                    <div className="grid grid-cols-3" style={{ gap: `14px ${GAP}px` }}>
                        {others.map(({ d, i }) => (
                            <button
                                key={`${i}:${designKey(d)}`}
                                type="button"
                                onClick={() => setMenuFor(i)}
                                disabled={busy}
                                className="flex min-w-0 flex-col text-start transition-[transform,opacity] duration-150 active:scale-[0.96] disabled:opacity-60"
                            >
                                {tileW > 0 && <Thumb design={d} frameHex={frameHex} palette={palette} w={tileW} h={TILE_H} />}
                                <span className="mt-1.5 w-full truncate px-0.5 text-[14px] font-semibold leading-tight">{styleName(d)}</span>
                                <span className="w-full truncate px-0.5 text-[12.5px] leading-snug text-ios-gray">{summary(d)}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {menuDesign && menuFor !== null && (
                <ActionSheet
                    title={styleName(menuDesign)}
                    message={summary(menuDesign)}
                    cancelLabel={t('cases.cancel', 'Cancel')}
                    onClose={() => setMenuFor(null)}
                    actions={[
                        menuFor === wornIndex
                            ? { label: t('cases.takeOff', 'Take Off'), onClick: () => void wear(null), disabled: blocked }
                            : { label: t('cases.wear', 'Wear'), onClick: () => void wear(menuFor), disabled: blocked },
                        { label: t('cases.viewFullScreenAction', 'View Full Screen'), onClick: () => setViewing(menuDesign) },
                        { label: t('cases.editCopy', 'Edit a Copy'), onClick: () => onEdit(menuDesign) },
                        { label: t('cases.delete', 'Delete'), destructive: true, onClick: () => setDeleteFor(menuFor) },
                    ]}
                />
            )}

            {deleteDesign && deleteFor !== null && (
                <AlertDialog
                    title={t('cases.deleteTitle', 'Delete this case?')}
                    message={deleteFor === wornIndex
                        ? t('cases.deleteWornMessage', 'It comes off your phone too. You will not get your money back.')
                        : t('cases.deleteMessage', 'You will not get your money back.')}
                    confirmLabel={t('cases.delete', 'Delete')}
                    destructive
                    onCancel={() => setDeleteFor(null)}
                    onConfirm={() => { const i = deleteFor; setDeleteFor(null); void remove(i); }}
                />
            )}

            {viewing !== null && (
                <CaseViewer
                    design={viewing}
                    frameHex={frameHex}
                    palette={palette}
                    title={styleName(viewing)}
                    summary={[...designParts(labels, viewing), money(designPrice(catalog, viewing))].join(' · ')}
                    onClose={() => setViewing(null)}
                />
            )}
        </div>
    );
}
