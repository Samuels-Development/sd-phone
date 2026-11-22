import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp, CircleDot, Gem, ImagePlus, Images, Info, Link2, Palette, Shapes, Smartphone, Sticker, type LucideIcon } from 'lucide-react';

import { t } from '@/i18n';
import { failText } from '@/core/api';
import { useSessionState } from '@/hooks/useSessionState';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { HIDDEN_TEXT } from '@/shell/streamerMode';
import { useStreamerHidden } from '@/stores/themeStore';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { Spinner } from '@/ui/Spinner';
import { sectionHeader } from '@/ui/surfaces';
import { CasePreview, type Framing } from './CasePreview';
import {
    cleanDesign, contrastRow, designKey, designPrice, equipCase, nearestRow, PHOTO_STICKER, randomDesign, stickerGroup,
    styleAllows, type CasesState, type Design, type Priced,
} from './casesApi';
import { CheckoutSheet, type PrimaryAction } from './Checkout';
import { designParts, labelOf, partLabels, styleBlurbs, type PartKind } from './labels';
import { Stage } from './Stage';
import { ACCENT, BUY_BG, CheckBadge, ColourDot, OptionTile, SwatchCard, money } from './ui';
import { CaseViewer } from './Viewer';

type StickerTab = 'icons' | 'brands' | 'photo';

type Step = 'style' | 'colour' | PartKind;
type ColourPart = 'pattern' | 'accessory' | 'charm';

const STEPS: Step[] = ['style', 'colour', 'pattern', 'accessory', 'charm', 'sticker'];
const STEP_ICON: Record<Step, LucideIcon> = {
    style: Smartphone, colour: Palette, pattern: Shapes, accessory: CircleDot, charm: Gem, sticker: Sticker,
};
const STEP_FRAMING: Record<Step, Framing> = {
    style: 'body', colour: 'body', pattern: 'body', accessory: 'accessory', charm: 'charm', sticker: 'sticker',
};

const STYLE_WELL = 112;
const PATTERN_WELL = 100;
const ACCESSORY_WELL = 92;
const CHARM_WELL = 112;
const STICKER_WELL = 84;
const BADGE_WELL = 70;

/** Where each step's options were scrolled to, kept for the session so coming back to a step,
 *  or to the Design tab, lands where it was left. Each step gets its own scroll element, so a
 *  wheel scroll still gliding in one step cannot carry on into the next. */
const panelScroll: Partial<Record<Step, number>> = {};

function stepLabels(): Record<Step, string> {
    return {
        style:     t('cases.style', 'Style'),
        colour:    t('cases.colour', 'Colour'),
        pattern:   t('cases.pattern', 'Pattern'),
        accessory: t('cases.accessory', 'Accessory'),
        charm:     t('cases.charm', 'Charm'),
        sticker:   t('cases.sticker', 'Sticker'),
    };
}

/** Why Buy is off for this design, or null when it can be bought. */
function buyBlocker(state: CasesState, price: number, hideBalance: boolean): string | null {
    if (state.blocked) return t('cases.buyBlocked', 'This phone cannot wear a case');
    if (state.owned.length >= state.maxOwned) return t('cases.buyFullShort', 'Your collection is full');
    if (state.balance < price) {
        return hideBalance
            ? t('cases.buyShortHidden', 'Not enough money in the bank')
            : t('cases.buyShort', '{amount} more needed in the bank', { amount: money(price - state.balance) });
    }
    return null;
}

/** The colour a part has, or the one it would get when first picked: a charm in the accent, the
 *  rest in whatever reads best on the shell. */
function partColourOf(d: Design, palette: string[], kind: ColourPart): number {
    return d[`${kind}Color`] ?? (kind === 'charm' ? nearestRow(palette, ACCENT) : contrastRow(palette, d.color));
}

function StepTabs({ step, labels, dots, dimmed, onStep }: {
    step:   Step;
    labels: Record<Step, string>;
    dots:   Partial<Record<Step, string>>;
    dimmed: Partial<Record<Step, boolean>>;
    onStep: (s: Step) => void;
}) {
    return (
        <div role="tablist" className="flex shrink-0 gap-[5px] px-4 pb-1 pt-2">
            {STEPS.map(s => {
                const Icon = STEP_ICON[s];
                const active = s === step;
                const dot = dots[s];
                return (
                    <button
                        key={s}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onStep(s)}
                        className={`relative flex h-[50px] min-w-0 flex-1 flex-col items-center justify-center gap-[5px] rounded-[14px] transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.94] ${
                            active
                                ? 'bg-[#F59E0B] text-white shadow-[0_3px_10px_rgba(245,158,11,0.32)]'
                                : 'bg-surface text-black/75 shadow-[0_0_0_1px_rgba(0,0,0,0.04)] dark:text-white/80 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.06)]'
                        } ${dimmed[s] ? (active ? 'opacity-75' : 'opacity-40') : ''}`}
                    >
                        <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                        <span className="w-full truncate px-0.5 text-center text-[11px] font-semibold leading-none tracking-[-0.01em]">{labels[s]}</span>
                        {dot && (
                            <span
                                aria-hidden
                                className="absolute end-[7px] top-[7px] h-[8px] w-[8px] rounded-full"
                                style={{ background: dot, boxShadow: `0 0 0 1.5px ${active ? '#ffffff' : 'rgb(var(--surface))'}, inset 0 0 0 1px rgb(var(--label) / 0.22)` }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

/** The heading over a step's options; it stays pinned while the options scroll under it. */
function PanelHead({ title, value, action }: { title: string; value?: string; action?: ReactNode }) {
    return (
        <div className="sticky top-0 z-10 -mx-4 mb-1 flex h-[38px] items-center gap-3 bg-base px-5">
            <span className={`${sectionHeader} shrink-0`}>{title}</span>
            <span className="min-w-0 flex-1 truncate text-end text-[14px] text-ios-gray">{value}</span>
            {action}
        </div>
    );
}

function JumpButton({ hex, up, onPress }: { hex: string; up: boolean; onPress: () => void }) {
    return (
        <button
            type="button"
            onClick={onPress}
            className="flex h-[28px] shrink-0 items-center gap-1.5 rounded-full bg-black/[0.06] pe-2 ps-2 text-[13px] font-semibold transition-transform duration-150 active:scale-95 dark:bg-white/[0.1]"
        >
            {up ? <ChevronUp className="h-[15px] w-[15px]" strokeWidth={2.6} /> : <ColourDot hex={hex} size={12} />}
            {up ? t('cases.jumpOptions', 'Options') : t('cases.jumpColour', 'Colour')}
            {!up && <ChevronDown className="h-[15px] w-[15px]" strokeWidth={2.6} />}
        </button>
    );
}

export function Studio({ state, draft, frameHex, onChange, onPatch, onBought }: {
    state:    CasesState;
    draft:    Design;
    frameHex: string;
    onChange: (d: Design) => void;
    onPatch:  (p: Partial<CasesState>) => void;
    onBought: (data: { owned: Design[]; equipped: Design | false; balance: number }) => void;
}) {
    const labels = partLabels();
    const names = stepLabels();
    const hideBalance = useStreamerHidden('balance');
    const { catalog } = state;
    const palette = catalog.palette;
    const allow = styleAllows(catalog, draft.style);
    const design = cleanDesign(catalog, draft);
    const price = designPrice(catalog, design);
    const key = designKey(design);
    const thumbDraft = useDeferredValue(draft);

    const ownedIndex = state.owned.findIndex(d => designKey(d) === key);
    const action: PrimaryAction = designKey(state.equipped) === key ? 'wearing' : ownedIndex >= 0 ? 'wear' : 'buy';
    const blocker = action === 'buy'
        ? buyBlocker(state, price, hideBalance)
        : action === 'wear' && state.blocked ? t('cases.buyBlocked', 'This phone cannot wear a case') : null;

    const [step, setStep] = useSessionState<Step>('cases:step', 'style');
    const [stickerTab, setStickerTab] = useSessionState<StickerTab>('cases:stickerTab', () => {
        if (draft.sticker === PHOTO_STICKER) return 'photo';
        const item = catalog.stickers.find(s => s.id === draft.sticker);
        return item ? stickerGroup(item) : 'icons';
    });
    const [picking, setPicking] = useState(false);
    const [dir, setDir] = useState<1 | -1>(1);
    const [undo, setUndo] = useState<Design | null>(null);
    const [sheet, setSheet] = useState(false);
    const [viewing, setViewing] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [atColour, setAtColour] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const colourRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setError(null); }, [key]);

    useEffect(() => {
        if (!undo) return;
        const id = window.setTimeout(() => setUndo(null), 6000);
        return () => window.clearTimeout(id);
    }, [undo]);

    function colourTop(): number | null {
        const panel = panelRef.current;
        const colour = colourRef.current;
        if (!panel || !colour) return null;
        return colour.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
    }

    function onPanelScroll() {
        const panel = panelRef.current;
        if (!panel) return;
        panelScroll[step] = panel.scrollTop;
        const top = colourTop();
        const next = top !== null && panel.scrollTop + 80 >= top;
        setAtColour(a => (a === next ? a : next));
    }

    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;
        panel.scrollTop = panelScroll[step] ?? 0;
        const top = colourTop();
        setAtColour(top !== null && panel.scrollTop + 80 >= top);
    }, [step]);

    function goStep(next: Step) {
        if (next === step) return;
        setDir(STEPS.indexOf(next) > STEPS.indexOf(step) ? 1 : -1);
        setStep(next);
    }

    function choose(d: Design) {
        setUndo(null);
        onChange(d);
    }

    function replaceAll(d: Design) {
        setUndo(draft);
        onChange(d);
    }

    function withStyle(id: string): Design {
        const a = styleAllows(catalog, id);
        const d: Design = { ...draft, style: id };
        if (!a.pattern) d.pattern = undefined;
        if (!a.accessory) d.accessory = undefined;
        if (!a.sticker) d.sticker = undefined;
        return d;
    }

    function withPart(kind: ColourPart, id: string | undefined): Design {
        const colourKey = `${kind}Color` as const;
        return { ...draft, [kind]: id, [colourKey]: id ? partColourOf(draft, palette, kind) : draft[colourKey] };
    }

    async function wear(): Promise<boolean> {
        if (busy || ownedIndex < 0) return false;
        setBusy(true);
        setError(null);
        const res = await equipCase(ownedIndex + 1);
        setBusy(false);
        if (!res.success || !res.data) {
            setError(failText(res, t('cases.wearFailed', 'That did not work. Try again.')));
            return false;
        }
        onPatch({ equipped: res.data.equipped });
        return true;
    }

    function jumpToColour() {
        const panel = panelRef.current;
        const top = colourTop();
        if (!panel || top === null) return;
        panel.scrollTo({ top: atColour ? 0 : top - 44, behavior: 'smooth' });
    }

    const none = t('cases.none', 'None');
    const priced = (list: Priced[], id?: string) => {
        const p = id ? list.find(x => x.id === id)?.price : undefined;
        return p === undefined ? undefined : money(p);
    };
    const headValue = (map: Record<string, string>, list: Priced[], id?: string) =>
        (id ? [labelOf(map, id), priced(list, id)].filter(Boolean).join(' · ') : none);

    /** A thumbnail design built from the deferred draft, so a run of quick taps redraws the tiles
     *  once it settles rather than on every tap. */
    const thumbOf = (over: Partial<Design>): Design => cleanDesign(catalog, {
        style: thumbDraft.style,
        color: thumbDraft.color,
        pattern: thumbDraft.pattern,
        patternColor: thumbDraft.patternColor,
        ...over,
    });

    const dots: Partial<Record<Step, string>> = { colour: palette[design.color] };
    if (design.pattern) dots.pattern = palette[design.patternColor ?? 0];
    if (design.accessory) dots.accessory = palette[design.accessoryColor ?? 0];
    if (design.charm) dots.charm = palette[design.charmColor ?? 0];
    if (design.sticker) dots.sticker = step === 'sticker' ? 'rgba(255,255,255,0.9)' : 'rgb(var(--label) / 0.55)';
    const dimmed: Partial<Record<Step, boolean>> = { pattern: !allow.pattern, accessory: !allow.accessory, sticker: !allow.sticker };

    function partSection(kind: ColourPart, list: Priced[], map: Record<string, string>, opts: {
        crop: 'body' | 'accessory' | 'charm';
        well: number;
        size: number;
        colourTitle: string;
        pickFirst: string;
    }) {
        const value = draft[kind];
        const colour = partColourOf(draft, palette, kind);
        const thumbColour = partColourOf(thumbDraft, palette, kind);
        const thumb = (id?: string) => (kind === 'pattern'
            ? thumbOf({ pattern: id, patternColor: thumbColour })
            : kind === 'accessory'
                ? thumbOf({ accessory: id, accessoryColor: thumbColour })
                : thumbOf({ charm: id, charmColor: thumbColour }));
        return (
            <>
                <PanelHead
                    title={names[kind]}
                    value={headValue(map, list, value)}
                    action={value ? <JumpButton hex={palette[colour]} up={atColour} onPress={jumpToColour} /> : undefined}
                />
                <div className="grid grid-cols-4 gap-x-2 gap-y-2.5">
                    <OptionTile selected={!value} label={none} wellH={opts.well} onPress={() => choose(withPart(kind, undefined))}>
                        <CasePreview design={thumb(undefined)} frameHex={frameHex} palette={palette} size={opts.size} crop={opts.crop} />
                    </OptionTile>
                    {list.map(item => (
                        <OptionTile
                            key={item.id}
                            selected={value === item.id}
                            label={labelOf(map, item.id)}
                            price={money(item.price)}
                            wellH={opts.well}
                            onPress={() => choose(withPart(kind, item.id))}
                        >
                            <CasePreview design={thumb(item.id)} frameHex={frameHex} palette={palette} size={opts.size} crop={opts.crop} />
                        </OptionTile>
                    ))}
                </div>
                <div ref={colourRef} className="mt-4">
                    <SwatchCard
                        title={opts.colourTitle}
                        hint={value ? undefined : opts.pickFirst}
                        palette={palette}
                        value={colour}
                        disabled={!value}
                        onChange={row => choose({ ...draft, [`${kind}Color`]: row })}
                    />
                </div>
            </>
        );
    }

    const styleItem = catalog.styles.find(s => s.id === draft.style);
    const styleName = labelOf(labels.style, draft.style);
    const unavailable = (step === 'pattern' && !allow.pattern) || (step === 'accessory' && !allow.accessory) || (step === 'sticker' && !allow.sticker);

    let panel: ReactNode;
    if (unavailable) {
        panel = (
            <div className="flex flex-col items-center px-4 pt-10 text-center">
                <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-surface">
                    <Info className="h-[24px] w-[24px] text-ios-gray" strokeWidth={2.2} />
                </span>
                <p className="mt-3.5 max-w-[320px] text-[15.5px] leading-snug text-black/70 dark:text-white/70">
                    {styleItem?.open
                        ? t('cases.openStyleNote', 'A {style} is only a frame, so there is no back to put this on.', { style: styleName })
                        : t('cases.pocketStyleNote', 'The card pocket on a {style} covers the back, so this does not fit.', { style: styleName })}
                </p>
                <button
                    type="button"
                    onClick={() => goStep('style')}
                    className="mt-5 rounded-full bg-[#F59E0B] px-5 py-2.5 text-[16px] font-semibold text-white transition-transform duration-150 active:scale-95"
                >
                    {t('cases.chooseStyle', 'Choose Another Style')}
                </button>
            </div>
        );
    } else if (step === 'style') {
        const blurb = styleBlurbs()[draft.style];
        const spare = (3 - (catalog.styles.length % 3)) % 3;
        const info = (
            <div
                className="flex flex-col justify-center rounded-[16px] bg-black/[0.035] px-3.5 dark:bg-white/[0.05]"
                style={{ height: STYLE_WELL }}
            >
                <div className="truncate text-[15px] font-semibold leading-tight">{styleName}</div>
                {blurb && <div className="mt-1 line-clamp-3 text-[13px] leading-snug text-black/60 dark:text-white/60">{blurb}</div>}
            </div>
        );
        panel = (
            <>
                <PanelHead title={names.style} value={headValue(labels.style, catalog.styles, draft.style)} />
                <div className="grid grid-cols-3 gap-x-2.5 gap-y-2.5">
                    {catalog.styles.map(s => (
                        <OptionTile
                            key={s.id}
                            selected={draft.style === s.id}
                            label={labelOf(labels.style, s.id)}
                            price={money(s.price)}
                            wellH={STYLE_WELL}
                            onPress={() => choose(withStyle(s.id))}
                        >
                            <CasePreview design={{ style: s.id, color: thumbDraft.color }} frameHex={frameHex} palette={palette} size={52} crop="body" />
                        </OptionTile>
                    ))}
                    {spare > 0 && <div style={{ gridColumn: `span ${spare} / span ${spare}` }}>{info}</div>}
                </div>
                {spare === 0 && <div className="mt-3">{info}</div>}
            </>
        );
    } else if (step === 'colour') {
        panel = (
            <div className="pt-1">
                <SwatchCard
                    title={t('cases.shellColour', 'Shell colour')}
                    palette={palette}
                    value={draft.color}
                    onChange={row => choose({ ...draft, color: row })}
                />
            </div>
        );
    } else if (step === 'pattern') {
        panel = partSection('pattern', catalog.patterns, labels.pattern, {
            crop: 'body', well: PATTERN_WELL, size: 46,
            colourTitle: t('cases.patternColour', 'Pattern colour'),
            pickFirst: t('cases.pickPatternFirst', 'Pick a pattern first'),
        });
    } else if (step === 'accessory') {
        panel = partSection('accessory', catalog.accessories, labels.accessory, {
            crop: 'accessory', well: ACCESSORY_WELL, size: 74,
            colourTitle: t('cases.accessoryColour', 'Accessory colour'),
            pickFirst: t('cases.pickAccessoryFirst', 'Pick an accessory first'),
        });
    } else if (step === 'charm') {
        panel = partSection('charm', catalog.charms, labels.charm, {
            crop: 'charm', well: CHARM_WELL, size: 50,
            colourTitle: t('cases.charmColour', 'Charm colour'),
            pickFirst: t('cases.pickCharmFirst', 'Pick a charm first'),
        });
    } else {
        const icons = catalog.stickers.filter(s => stickerGroup(s) === 'icons');
        const brands = catalog.stickers.filter(s => stickerGroup(s) === 'brands');
        const photoPrice = catalog.photoPrice;
        const tabs: { value: StickerTab; label: string }[] = [{ value: 'icons', label: t('cases.stickerIcons', 'Icons') }];
        if (brands.length) tabs.push({ value: 'brands', label: t('cases.stickerBrands', 'Brands') });
        if (photoPrice !== undefined) tabs.push({ value: 'photo', label: t('cases.stickerYourPhoto', 'Your Photo') });
        const tab = tabs.some(x => x.value === stickerTab) ? stickerTab : 'icons';
        const switchTab = (next: StickerTab) => {
            setStickerTab(next);
            panelRef.current?.scrollTo({ top: 0 });
        };
        const tile = (s: Priced, crop: 'sticker' | 'badge', well: number, size: number) => (
            <OptionTile
                key={s.id}
                selected={draft.sticker === s.id}
                label={labelOf(labels.sticker, s.id)}
                price={money(s.price)}
                wellH={well}
                onPress={() => choose({ ...draft, sticker: s.id })}
            >
                <CasePreview design={thumbOf({ sticker: s.id })} frameHex={frameHex} palette={palette} size={size} crop={crop} />
            </OptionTile>
        );
        const photo = draft.photo;
        const photoOn = draft.sticker === PHOTO_STICKER && !!photo;

        let body: ReactNode;
        if (tab === 'brands') {
            body = <div className="grid grid-cols-4 gap-x-2 gap-y-2.5">{brands.map(s => tile(s, 'badge', BADGE_WELL, 80))}</div>;
        } else if (tab === 'photo') {
            body = (
                <>
                    <div className="rounded-[18px] bg-surface p-3 ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
                        <div className="flex items-center gap-3.5">
                            <button
                                type="button"
                                disabled={!photo}
                                aria-pressed={photoOn}
                                onClick={() => choose({ ...draft, sticker: PHOTO_STICKER })}
                                className={`relative flex h-[104px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] bg-black/[0.04] transition-[transform,box-shadow] duration-150 active:scale-[0.95] disabled:active:scale-100 dark:bg-white/[0.05] ${
                                    photoOn ? 'shadow-[0_0_0_2.5px_#F59E0B]' : ''
                                }`}
                            >
                                {photo
                                    ? <CasePreview design={thumbOf({ sticker: PHOTO_STICKER, photo })} frameHex={frameHex} palette={palette} size={104} crop="sticker" />
                                    : <ImagePlus className="h-[30px] w-[30px] text-ios-gray" strokeWidth={1.8} />}
                                {photoOn && <CheckBadge className="absolute end-1.5 top-1.5" />}
                            </button>
                            <div className="min-w-0 flex-1">
                                <div className="text-[15.5px] font-semibold leading-tight">{t('cases.photoSticker', 'Photo sticker')}</div>
                                <div className="mt-1 text-[13px] leading-snug text-black/60 dark:text-white/60">
                                    {t('cases.photoBlurb', 'A picture from your gallery, printed and stuck on the back.')}
                                </div>
                                <div className="mt-1.5 text-[13.5px] font-semibold tabular-nums">{money(photoPrice ?? 0)}</div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setPicking(true)}
                            className="mt-3 flex h-[42px] w-full items-center justify-center gap-2 rounded-[12px] bg-[#F59E0B]/[0.16] text-[15.5px] font-semibold text-[#B45309] transition-transform duration-150 active:scale-[0.98] dark:text-[#FBBF24]"
                        >
                            <Images className="h-[18px] w-[18px]" strokeWidth={2.3} />
                            {photo ? t('cases.changePhoto', 'Change Photo') : t('cases.choosePhoto', 'Choose Photo')}
                        </button>
                    </div>
                    <p className="mt-3 flex gap-2 px-1 text-[12.5px] leading-snug text-ios-gray">
                        <Link2 className="mt-[1px] h-[15px] w-[15px] shrink-0" strokeWidth={2.3} />
                        {t('cases.photoHint', 'Want a picture from a link? Save it to Photos first, then choose it here.')}
                    </p>
                </>
            );
        } else {
            body = (
                <div className="grid grid-cols-4 gap-x-2 gap-y-2.5">
                    <OptionTile selected={!draft.sticker} label={none} wellH={STICKER_WELL} onPress={() => choose({ ...draft, sticker: undefined })}>
                        <CasePreview design={thumbOf({ sticker: undefined })} frameHex={frameHex} palette={palette} size={68} crop="sticker" />
                    </OptionTile>
                    {icons.map(s => tile(s, 'sticker', STICKER_WELL, 68))}
                </div>
            );
        }

        panel = (
            <>
                <PanelHead
                    title={names.sticker}
                    action={tabs.length > 1 ? <SegmentedControl value={tab} onChange={switchTab} options={tabs} fit className="shrink-0" /> : undefined}
                />
                {body}
            </>
        );
    }

    let line: string;
    let lineRed = false;
    if (error) { line = error; lineRed = true; }
    else if (blocker) { line = blocker; lineRed = true; }
    else if (action === 'wear') line = t('cases.ownedNote', 'Already yours, no charge');
    else if (action === 'wearing') line = t('cases.wearingNote', 'On your phone now');
    else line = t('cases.bankBalance', 'Bank {amount}', { amount: hideBalance ? HIDDEN_TEXT : money(state.balance) });

    const primaryDisabled = busy || action === 'wearing' || !!blocker;
    const slimId = catalog.styles.some(s => s.id === 'slim') ? 'slim' : catalog.styles[0].id;
    const summary = [...designParts(labels, design), money(price)].join(' · ');

    return (
        <div className="relative flex min-h-0 flex-1 flex-col">
            <Stage
                design={design}
                frameHex={frameHex}
                palette={palette}
                labels={labels}
                framing={unavailable ? 'body' : STEP_FRAMING[step]}
                step={step}
                undo={!!undo}
                onStep={goStep}
                onSurprise={() => replaceAll(randomDesign(catalog))}
                onStartOver={() => replaceAll({ style: slimId, color: draft.color })}
                onUndo={() => { if (undo) onChange(undo); setUndo(null); }}
                onExpand={() => setViewing(true)}
            />

            <StepTabs step={step} labels={names} dots={dots} dimmed={dimmed} onStep={goStep} />

            <div key={step} ref={panelRef} onScroll={onPanelScroll} className="relative min-h-0 flex-1 overflow-y-auto no-scrollbar px-4 pb-4">
                <div className={dir > 0 ? 'animate-tab-in-right' : 'animate-tab-in-left'}>{panel}</div>
            </div>

            <div className="shrink-0 border-t border-hairline/10 bg-base px-4 pb-[calc(var(--safe-bottom)+6px)] pt-2.5">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setSheet(true)}
                        aria-label={t('cases.showBreakdown', 'Show the price breakdown')}
                        className="flex min-w-0 flex-1 flex-col items-start text-start transition-opacity duration-150 active:opacity-60"
                    >
                        <span className="flex items-center gap-1.5">
                            <span className={`text-[24px] font-bold leading-[30px] tabular-nums ${action === 'buy' ? '' : 'text-black/35 line-through decoration-2 dark:text-white/35'}`}>
                                {money(price)}
                            </span>
                            <span className="flex h-[20px] w-[20px] items-center justify-center rounded-full bg-black/[0.07] dark:bg-white/[0.12]">
                                <ChevronUp className="h-[14px] w-[14px]" strokeWidth={2.8} />
                            </span>
                        </span>
                        <span className={`w-full truncate text-[13px] leading-[18px] ${lineRed ? 'font-medium text-ios-red' : 'text-ios-gray'}`}>{line}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (action === 'buy') setSheet(true);
                            else if (action === 'wear') void wear();
                        }}
                        disabled={primaryDisabled}
                        className={`flex h-[50px] min-w-[136px] shrink-0 items-center justify-center gap-1.5 rounded-[14px] px-6 text-[17px] font-semibold transition-[opacity,transform] duration-150 active:scale-[0.97] disabled:active:scale-100 ${
                            action === 'wearing'
                                ? 'bg-surface text-ios-gray'
                                : 'text-white shadow-[0_4px_14px_rgba(245,158,11,0.35)] disabled:opacity-40 disabled:shadow-none'
                        }`}
                        style={action === 'wearing' ? undefined : { background: BUY_BG }}
                    >
                        {busy ? (
                            <Spinner size={20} className="!border-white/30 !border-t-white" />
                        ) : action === 'buy' ? (
                            t('cases.buyFor', 'Buy · {amount}', { amount: money(price) })
                        ) : action === 'wear' ? (
                            t('cases.wear', 'Wear')
                        ) : (
                            <><Check className="h-[18px] w-[18px]" strokeWidth={3} />{t('cases.wearingNow', 'Wearing')}</>
                        )}
                    </button>
                </div>
            </div>

            {sheet && (
                <CheckoutSheet
                    state={state}
                    design={design}
                    frameHex={frameHex}
                    action={action}
                    blocker={blocker}
                    onClose={() => setSheet(false)}
                    onBought={onBought}
                    onWear={wear}
                />
            )}

            {picking && (
                <MediaPickerSheet
                    filter={p => !p.video}
                    initialSelectedUrls={draft.photo ? [draft.photo] : undefined}
                    onSelect={p => { setPicking(false); choose({ ...draft, sticker: PHOTO_STICKER, photo: p.url }); }}
                    onClose={() => setPicking(false)}
                />
            )}

            {viewing && (
                <CaseViewer
                    design={design}
                    frameHex={frameHex}
                    palette={palette}
                    title={styleName}
                    summary={summary}
                    onClose={() => setViewing(false)}
                />
            )}
        </div>
    );
}
