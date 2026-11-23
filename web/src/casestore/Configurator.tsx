import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronUp, CircleDot, Gem, ImagePlus, Images, Info, Link2, Palette, RotateCcw, Shapes, Shuffle, Smartphone, Sticker, Undo2, type LucideIcon } from 'lucide-react';

import { t } from '@/i18n';
import { MediaPickerSheet } from '@/shared/MediaPickerSheet';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { CasePreview } from './CasePreview';
import {
    addSticker, cleanDesign, contrastRow, MAX_STICKERS, nearestRow, PHOTO_STICKER, randomDesign, stickerGroup, stickersOf, styleAllows,
    type CaseView, type Catalog, type Design, type PhoneBody, type PhoneLook, type Priced, type Sticker as PlacedSticker,
} from './casesApi';
import { designParts, labelOf, partLabels, styleBlurbs, type PartKind } from './labels';
import { StickerEditor, StickersStrip } from './StickerEditor';
import { ACCENT, BUY_BG, CheckBadge, ColourDot, OptionTile, PanelHead, SwatchCard, money } from './ui';

type StickerTab = 'icons' | 'brands' | 'photo';

export type Step = 'style' | 'colour' | PartKind;
type ColourPart = 'pattern' | 'accessory' | 'charm';

const STEPS: Step[] = ['style', 'colour', 'pattern', 'accessory', 'charm', 'sticker'];
const STEP_ICON: Record<Step, LucideIcon> = {
    style: Smartphone, colour: Palette, pattern: Shapes, accessory: CircleDot, charm: Gem, sticker: Sticker,
};
const STEP_VIEW: Record<Step, CaseView> = {
    style: 'body', colour: 'body', pattern: 'body', accessory: 'accessory', charm: 'charm', sticker: 'sticker',
};

const STYLE_WELL = 112;
const PATTERN_WELL = 100;
const ACCESSORY_WELL = 92;
const CHARM_WELL = 112;
const STICKER_WELL = 84;
const BADGE_WELL = 70;

/** Where each step's options were scrolled to, kept while the UI lives so coming back to a step
 *  lands where it was left. Each step gets its own scroll element, so a wheel scroll still gliding
 *  in one step cannot carry on into the next. */
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

function stepAvailable(catalog: Catalog, draft: Design, step: Step): boolean {
    const allow = styleAllows(catalog, draft.style);
    return !((step === 'pattern' && !allow.pattern) || (step === 'accessory' && !allow.accessory) || (step === 'sticker' && !allow.sticker));
}

/** The part of the phone the camera should frame for a step; a step the style cannot take shows the body. */
export function stepView(catalog: Catalog, draft: Design, step: Step): CaseView {
    return stepAvailable(catalog, draft, step) ? STEP_VIEW[step] : 'body';
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
        <div role="tablist" className="flex shrink-0 gap-[3px] rounded-[14px] bg-surface p-[3px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]">
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
                        className={`relative flex h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-[5px] rounded-[11px] transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.94] ${
                            active
                                ? 'bg-control text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)]'
                                : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85'
                        } ${dimmed[s] ? (active ? 'opacity-75' : 'opacity-40') : ''}`}
                    >
                        {active && <span aria-hidden className="absolute inset-x-[10px] bottom-0 h-[2px] rounded-full bg-[#F5A524]" />}
                        <Icon className={`h-[18px] w-[18px] ${active ? 'text-[#F5A524]' : ''}`} strokeWidth={2.1} />
                        <span className="w-full truncate px-0.5 text-center text-[11.5px] font-semibold leading-none tracking-[-0.01em]">{labels[s]}</span>
                        {dot && (
                            <span
                                aria-hidden
                                className="absolute end-[7px] top-[7px] h-[8px] w-[8px] rounded-full"
                                style={{ background: dot, boxShadow: `0 0 0 1.5px rgb(var(--${active ? 'control' : 'surface'})), inset 0 0 0 1px rgba(0,0,0,0.25)` }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}

function JumpButton({ hex, up, onPress }: { hex: string; up: boolean; onPress: () => void }) {
    return (
        <button
            type="button"
            onClick={onPress}
            className="flex h-[28px] shrink-0 items-center gap-1.5 rounded-full bg-white/[0.1] pe-2 ps-2 text-[13px] font-semibold transition-transform duration-150 active:scale-95"
        >
            {up ? <ChevronUp className="h-[15px] w-[15px]" strokeWidth={2.6} /> : <ColourDot hex={hex} size={12} />}
            {up ? t('cases.jumpOptions', 'Options') : t('cases.jumpColour', 'Colour')}
            {!up && <ChevronDown className="h-[15px] w-[15px]" strokeWidth={2.6} />}
        </button>
    );
}

function ToolButton({ label, onPress, accent = false, children }: { label: string; onPress: () => void; accent?: boolean; children: ReactNode }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={onPress}
            className={`flex h-[34px] w-[34px] items-center justify-center rounded-full transition-transform duration-150 active:scale-90 ${
                accent
                    ? 'animate-icon-pop text-[#2b1703] shadow-[0_2px_8px_rgba(245,158,11,0.35)]'
                    : 'bg-surface text-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:text-white'
            }`}
            style={accent ? { background: BUY_BG } : undefined}
        >
            {children}
        </button>
    );
}

/** The case designer: the steps of a case, the options of the step open, and the tools that replace
 *  the whole design. There is no picture of the case here; whoever shows this shows the case. The
 *  option pictures are drawn on the phone being customised (`body`, `look`, `frameHex`). */
export function Configurator({ catalog, draft, frameHex, body, look, step, picking, adjusting, onStep, onChange, onPicking, onAdjusting, onAim }: {
    catalog:   Catalog;
    draft:     Design;
    frameHex:  string;
    body:      PhoneBody;
    look:      PhoneLook;
    step:      Step;
    picking:   boolean;
    onStep:    (s: Step) => void;
    onChange:  (d: Design) => void;
    onPicking: (open: boolean) => void;
    /** The sticker editor is open in place of the sticker options. */
    adjusting:   boolean;
    onAdjusting: (open: boolean) => void;
    /** Asks for the game camera on the sticker, as the player takes hold of it. */
    onAim:       () => void;
}) {
    const labels = partLabels();
    const names = stepLabels();
    const palette = catalog.palette;
    const allow = styleAllows(catalog, draft.style);
    const design = cleanDesign(catalog, draft);
    const thumbDraft = useDeferredValue(draft);

    const [stickerTab, setStickerTab] = useState<StickerTab>('icons');
    const [stickerSel, setStickerSel] = useState(0);
    const [dir, setDir] = useState<1 | -1>(1);
    const [undo, setUndo] = useState<Design | null>(null);
    const [atColour, setAtColour] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const colourRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!undo) return;
        const id = window.setTimeout(() => setUndo(null), 6000);
        return () => window.clearTimeout(id);
    }, [undo]);

    function colourTop(): number | null {
        const panel = panelRef.current;
        const colour = colourRef.current;
        if (!panel || !colour) return null;
        return colour.offsetTop;
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
        onStep(next);
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
        if (!a.sticker) d.stickers = undefined;
        return d;
    }

    function withPart(kind: ColourPart, id: string | undefined): Design {
        const colourKey = `${kind}Color` as const;
        return { ...draft, [kind]: id, [colourKey]: id ? partColourOf(draft, palette, kind) : draft[colourKey] };
    }

    function jumpToColour() {
        const panel = panelRef.current;
        const top = colourTop();
        if (!panel || top === null) return;
        panel.scrollTo({ top: atColour ? 0 : top - 46, behavior: 'smooth' });
    }

    const none = t('cases.none', 'None');
    const priced = (list: Priced[], id?: string) => {
        const p = id ? list.find(x => x.id === id)?.price : undefined;
        return p === undefined ? undefined : money(p);
    };
    const headValue = (map: Record<string, string>, list: Priced[], id?: string) =>
        (id ? [labelOf(map, id), priced(list, id)].filter(Boolean).join(' · ') : none);

    /** A thumbnail design built from the deferred draft, so a run of quick clicks redraws the tiles
     *  once it settles rather than on every click. */
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
    const placed = stickersOf(design);
    if (placed.length) dots.sticker = 'rgba(255,255,255,0.7)';
    const full = placed.length >= MAX_STICKERS;
    const sel = Math.max(0, Math.min(stickerSel, placed.length - 1));

    function setStickers(list: PlacedSticker[]) {
        choose({ ...draft, stickers: list.length ? list : undefined });
    }

    /** Puts another sticker on the case, at a free spot, and selects it. */
    function addOne(id: string) {
        if (full) return;
        const next = addSticker(placed, id);
        setStickers(next);
        setStickerSel(next.length - 1);
    }

    function removeSticker(index: number) {
        setStickers(placed.filter((_, i) => i !== index));
        setStickerSel(Math.max(0, Math.min(sel, placed.length - 2)));
    }

    function openSticker(index: number) {
        setStickerSel(index);
        onAim();
        onAdjusting(true);
    }

    /** Prints a gallery picture as the photo sticker: a new one on the case, or the one already there. */
    function takePhoto(url: string) {
        const at = placed.findIndex(st => st.id === PHOTO_STICKER);
        if (at >= 0 || full) {
            choose({ ...draft, photo: url });
            if (at >= 0) setStickerSel(at);
            return;
        }
        const next = addSticker(placed, PHOTO_STICKER);
        choose({ ...draft, photo: url, stickers: next });
        setStickerSel(next.length - 1);
    }
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
                        <CasePreview design={thumb(undefined)} frameHex={frameHex} palette={palette} body={body} look={look} size={opts.size} crop={opts.crop} />
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
                            <CasePreview design={thumb(item.id)} frameHex={frameHex} palette={palette} body={body} look={look} size={opts.size} crop={opts.crop} />
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
    const unavailable = !stepAvailable(catalog, draft, step);

    let panel: ReactNode;
    if (unavailable) {
        panel = (
            <div className="flex flex-col items-center px-4 pt-10 text-center">
                <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-surface">
                    <Info className="h-[24px] w-[24px] text-ios-gray" strokeWidth={2.2} />
                </span>
                <p className="mt-3.5 max-w-[320px] text-[15.5px] leading-snug text-white/70">
                    {styleItem?.open
                        ? t('cases.openStyleNote', 'A {style} is only a frame, so there is no back to put this on.', { style: styleName })
                        : t('cases.pocketStyleNote', 'The card pocket on a {style} covers the back, so this does not fit.', { style: styleName })}
                </p>
                <button
                    type="button"
                    onClick={() => goStep('style')}
                    className="mt-5 rounded-full px-5 py-2.5 text-[16px] font-semibold text-[#2b1703] transition-transform duration-150 active:scale-95"
                    style={{ background: BUY_BG }}
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
                className="flex flex-col justify-center rounded-[16px] bg-white/[0.05] px-3.5"
                style={{ height: STYLE_WELL }}
            >
                <div className="truncate text-[15px] font-semibold leading-tight">{styleName}</div>
                {blurb && <div className="mt-1 line-clamp-3 text-[13px] leading-snug text-white/60">{blurb}</div>}
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
                            <CasePreview design={{ style: s.id, color: thumbDraft.color }} frameHex={frameHex} palette={palette} body={body} look={look} size={52} crop="body" />
                        </OptionTile>
                    ))}
                    {spare > 0 && <div style={{ gridColumn: `span ${spare} / span ${spare}` }}>{info}</div>}
                </div>
                {spare === 0 && <div className="mt-3">{info}</div>}
            </>
        );
    } else if (step === 'colour') {
        panel = (
            <div className="pt-3">
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
        const tile = (s: Priced, crop: 'sticker' | 'badge', well: number, size: number) => {
            const n = placed.filter(st => st.id === s.id).length;
            return (
                <OptionTile
                    key={s.id}
                    selected={n > 0}
                    count={n}
                    disabled={full}
                    label={labelOf(labels.sticker, s.id)}
                    price={money(s.price)}
                    wellH={well}
                    onPress={() => addOne(s.id)}
                >
                    <CasePreview design={thumbOf({ stickers: [{ id: s.id }] })} frameHex={frameHex} palette={palette} body={body} look={look} size={size} crop={crop} />
                </OptionTile>
            );
        };
        const photo = draft.photo;
        const photoAt = placed.findIndex(st => st.id === PHOTO_STICKER);
        const photoOn = photoAt >= 0;

        let options: ReactNode;
        if (tab === 'brands') {
            options = <div className="grid grid-cols-4 gap-x-2 gap-y-2.5">{brands.map(s => tile(s, 'badge', BADGE_WELL, 80))}</div>;
        } else if (tab === 'photo') {
            options = (
                <>
                    <div className="rounded-[18px] bg-surface p-3 ring-1 ring-white/[0.06]">
                        <div className="flex items-center gap-3.5">
                            <button
                                type="button"
                                disabled={!photo || (!photoOn && full)}
                                aria-pressed={photoOn}
                                onClick={() => { if (photoOn) openSticker(photoAt); else if (photo) takePhoto(photo); }}
                                className={`relative flex h-[104px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] transition-[transform,box-shadow] duration-150 active:scale-[0.95] disabled:active:scale-100 ${
                                    photoOn ? 'shadow-[0_0_0_2.5px_#F59E0B]' : ''
                                }`}
                                style={{ background: 'rgb(var(--well, var(--surface)))' }}
                            >
                                {photo
                                    ? <CasePreview design={thumbOf({ stickers: [{ id: PHOTO_STICKER }], photo })} frameHex={frameHex} palette={palette} body={body} look={look} size={104} crop="sticker" />
                                    : <ImagePlus className="h-[30px] w-[30px] text-black/40" strokeWidth={1.8} />}
                                {photoOn && <CheckBadge className="absolute end-1.5 top-1.5" />}
                            </button>
                            <div className="min-w-0 flex-1">
                                <div className="text-[15.5px] font-semibold leading-tight">{t('cases.photoSticker', 'Photo sticker')}</div>
                                <div className="mt-1 text-[13px] leading-snug text-white/60">
                                    {photoOn
                                        ? t('cases.photoOnCase', 'On the case. Tap it to place it, or change the picture.')
                                        : t('cases.photoBlurbOne', 'A picture from your gallery, printed and stuck on the back. One per case.')}
                                </div>
                                <div className="mt-1.5 text-[13.5px] font-semibold tabular-nums">{money(photoPrice ?? 0)}</div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => onPicking(true)}
                            disabled={!photoOn && full}
                            className="mt-3 flex h-[42px] w-full items-center justify-center gap-2 rounded-[12px] bg-[#F59E0B]/[0.16] text-[15.5px] font-semibold text-[#FBBF24] transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100"
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
            options = (
                <div className="grid grid-cols-4 gap-x-2 gap-y-2.5">
                    {placed.length > 0 && (
                        <OptionTile selected={false} label={t('cases.removeAll', 'Remove all')} wellH={STICKER_WELL} onPress={() => setStickers([])}>
                            <CasePreview design={thumbOf({ stickers: undefined })} frameHex={frameHex} palette={palette} body={body} look={look} size={68} crop="sticker" />
                        </OptionTile>
                    )}
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
                {placed.length > 0 && (
                    <StickersStrip design={design} frameHex={frameHex} palette={palette} body={body} look={look} selected={sel} onOpen={openSticker} onRemove={removeSticker} />
                )}
                {full && (
                    <p className="-mt-1 mb-2.5 px-1 text-[12.5px] font-medium text-[#F5A524]">
                        {t('cases.stickersFull', '{n} stickers is the most a case takes', { n: MAX_STICKERS })}
                    </p>
                )}
                {options}
            </>
        );
    }

    const slimId = catalog.styles.some(s => s.id === 'slim') ? 'slim' : catalog.styles[0].id;
    const extras = designParts(labels, design);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center gap-3 pb-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <ColourDot hex={palette[design.color] ?? '#888888'} size={12} />
                        <span className="truncate text-[17px] font-semibold leading-tight">
                            {t('cases.styleCase', '{style} case', { style: styleName })}
                        </span>
                    </div>
                    <div className="mt-0.5 truncate text-[13px] text-ios-gray">
                        {extras.length ? extras.join(', ') : t('cases.plainShell', 'Plain shell')}
                    </div>
                </div>
                {undo && (
                    <ToolButton label={t('cases.undo', 'Undo')} accent onPress={() => { onChange(undo); setUndo(null); }}>
                        <Undo2 className="h-[17px] w-[17px]" strokeWidth={2.6} />
                    </ToolButton>
                )}
                <ToolButton label={t('cases.surpriseMe', 'Surprise me')} onPress={() => replaceAll(randomDesign(catalog))}>
                    <Shuffle className="h-[16px] w-[16px]" strokeWidth={2.4} />
                </ToolButton>
                <ToolButton label={t('cases.startOver', 'Start over')} onPress={() => replaceAll({ style: slimId, color: draft.color })}>
                    <RotateCcw className="h-[16px] w-[16px]" strokeWidth={2.4} />
                </ToolButton>
            </div>

            <StepTabs step={step} labels={names} dots={dots} dimmed={dimmed} onStep={goStep} />

            {adjusting && step === 'sticker' && placed.length > 0 ? (
                <StickerEditor
                    design={design}
                    frameHex={frameHex}
                    palette={palette}
                    body={body}
                    look={look}
                    selected={sel}
                    onSelect={setStickerSel}
                    onStickers={setStickers}
                    onAim={onAim}
                    onDone={() => onAdjusting(false)}
                />
            ) : (
                <div
                    key={step}
                    ref={panelRef}
                    onScroll={onPanelScroll}
                    className="relative mt-3 min-h-0 flex-1 overflow-y-auto no-scrollbar rounded-[14px] bg-base px-3 pb-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"
                >
                    <div className={dir > 0 ? 'animate-tab-in-right' : 'animate-tab-in-left'}>{panel}</div>
                </div>
            )}

            {picking && (
                <MediaPickerSheet
                    forceDark
                    filter={p => !p.video}
                    initialSelectedUrls={draft.photo ? [draft.photo] : undefined}
                    onSelect={p => { onPicking(false); takePhoto(p.url); }}
                    onClose={() => onPicking(false)}
                />
            )}
        </div>
    );
}
